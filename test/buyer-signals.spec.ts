import { SELF, env } from "cloudflare:test";
import { signalStore } from "@/services/signal-store";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { houseWallets } from "@/lib/channel";
import {
  PURPOSES_CAP,
  SIGNAL_MAP_CAP,
  readBuyerSignals,
  readerClass,
  recordInputRefusal,
  referrerRelation,
  refusalReason,
  recordPostPurchaseRead,
  recordSettleSignal,
} from "@/services/buyer-signals";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
/** Deferred writes run beside the answer; in tests there is no waitUntil, so give the loop a turn. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

/** One signed week with one ready host, so a page about somebody exists to be read. */
async function seedCorpus(host: string): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  const round: WardRound = {
    week: "2026-W31",
    at: new Date().toISOString(),
    listed_resources: 1,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [{ host, resources: 1, verdict: "ready" }] as unknown as WardRound["hosts"],
  };
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
  const pass = await takeCorpusSnapshot(testEnv, {
    calendars: ["https://calendar.test"],
    fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
  });
  expect(pass.taken).toBe(true);
}

/**
 * BUYER SIGNALS, the trial area, held together: four observed
 * readings, each capped, each written beside the answer, house
 * skipped, and a page that names its own floors and its own off
 * switch. The tests pin the shape of each key so the page's grouping
 * cannot drift from the writer.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

beforeEach(async () => {
  await signalStore(testEnv)?.reset();
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  for (const key of listed.keys) {
    if (key.name.includes(":signals:") || key.name.includes(":verifyage:")) await testEnv.COUNTERS.delete(key.name);
  }
});

describe("the four readings", () => {
  it("counts the rail by door, skips the house, and keeps purposes up to the cap", async () => {
    await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: "a test", house: false });
    await recordSettleSignal(testEnv, { door: "mcp", network: "eip155:8453", item: "hello", purpose: undefined, house: false });
    await recordSettleSignal(testEnv, { door: "http", network: undefined, item: "hello", purpose: "the house talking", house: true });
    const s = await readBuyerSignals(testEnv);
    expect(s.rail).toEqual({ "http:eip155:8453": 1, "mcp:eip155:8453": 1 });
    expect(s.purposes).toEqual([{ item: "hello", day: new Date().toISOString().slice(0, 10), purpose: "a test" }]);
    expect(houseWallets(testEnv).length).toBeGreaterThan(0);
    for (let i = 0; i < PURPOSES_CAP + 2; i += 1) {
      await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: `p${i}`, house: false });
    }
    const capped = await readBuyerSignals(testEnv);
    expect(capped.purposes.length).toBe(PURPOSES_CAP);
    expect(capped.purposes_truncated).toBe(true);
  });

  /**
   * THE DEFECT THE KEEPER'S OWN DESK SHOWED (2026-09-21): this
   * recorder counted conformance walkers beside buyers, and the total
   * was published as a sentence about agents. Both directions are
   * pinned, because dropping machinery entirely would be the opposite
   * error — whether a linter can satisfy an input contract is evidence
   * about the challenge.
   */
  it("keeps machinery off the buyers' count and still counts it", async () => {
    const spot = getMenuItem("spot_check");
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, "nope",
      { userAgent: "python-httpx/0.28.1" });
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, "nope",
      { userAgent: "StillOS-payability-census/1.0 (+https://example.invalid; measurement, no payment attached)" });
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, "nope",
      { userAgent: "x402lint/0.1 (+https://x402lint.dev)" });
    const s = await readBuyerSignals(testEnv);
    expect(s.refusal["spot_check:host:malformed"], "one buyer-shaped client").toBe(1);
    expect(
      s.refusal_machinery["spot_check:host:malformed"],
      "the census and the linter, kept rather than dropped",
    ).toBe(2);
  });

  it("classes a census that names its own job as machinery", () => {
    expect(
      readerClass("StillOS-payability-census/1.0 (measurement, no payment attached)", undefined),
      "the table held census-probe and this one is a census; the near-miss matched nothing",
    ).toBe("crawler");
  });

  it("keys a refusal by item, field and why, and overflows to other past the cap", async () => {
    const spot = getMenuItem("spot_check");
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, "https://a.example/api");
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, undefined);
    await recordInputRefusal(testEnv, spot, "spot_check", { code: "bad_request", input_field: "host" }, "your-door.example");
    await recordInputRefusal(testEnv, getMenuItem("hello"), "hello", { code: "callback_refused" }, undefined);
    for (let i = 0; i < SIGNAL_MAP_CAP + 3; i += 1) {
      await recordInputRefusal(testEnv, undefined, `item${i}`, { code: "bad_request", input_field: "url" }, "");
    }
    const s = await readBuyerSignals(testEnv);
    expect(s.refusal["spot_check:host:malformed"]).toBe(1);
    expect(s.refusal["spot_check:host:missing"]).toBe(1);
    expect(s.refusal["spot_check:host:example"]).toBe(1);
    expect(s.refusal["hello:callback_refused:other"]).toBe(1);
    expect(s.refusal["other"]).toBe(7);
  });

  it("classes a refusal as a shape and never keeps the value", () => {
    const anchor = getMenuItem("bitcoin_anchor");
    expect(refusalReason(anchor, "digest", "9f".repeat(32))).toBe("example");
    expect(refusalReason(anchor, "digest", "0x" + "9f".repeat(32))).toBe("malformed");
    expect(refusalReason(anchor, "digest", "   ")).toBe("missing");
    expect(refusalReason(getMenuItem("hello"), "agent_name", "\u0000bad")).toBe("other");
  });

  it("buckets a post-purchase read by the artifact's age", async () => {
    await recordPostPurchaseRead(testEnv, "replay", new Date(Date.now() - 60_000).toISOString());
    await recordPostPurchaseRead(testEnv, "order_poll", new Date(Date.now() - 3 * 86_400_000).toISOString());
    await recordPostPurchaseRead(testEnv, "purchase_status");
    const s = await readBuyerSignals(testEnv);
    expect(s.reads).toEqual({ "replay:under_1h": 1, "order_poll:under_1w": 1, "purchase_status:unknown_age": 1 });
  });
});

describe("at the doors", () => {
  it("a pre-payment 400 over HTTP is counted beside the refusal", async () => {
    const res = await SELF.fetch(`${BASE}/api/buy/hello?agent_name=%00bad`);
    expect(res.status).toBe(400);
    await settled();
    const s = await readBuyerSignals(testEnv);
    expect(s.refusal["hello:agent_name:other"]).toBe(1);
  });

  it("a settled purchase records its rail and purpose, and a replay counts as a read", async () => {
    const url = `${BASE}/api/buy/hello?purpose=${encodeURIComponent("checking the trial page")}`;
    const quote = await SELF.fetch(url);
    expect(quote.status).toBe(402);
    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    const body = (await paid.json()) as { certificate?: { cert_id?: string } };
    const certId = body.certificate?.cert_id ?? "";
    expect(certId.startsWith("cert_")).toBe(true);
    const replay = await SELF.fetch(`${BASE}/api/replay/${certId}`);
    expect(replay.status).toBe(200);
    await settled();
    const s = await readBuyerSignals(testEnv);
    expect(Object.keys(s.rail).some((k) => k.startsWith("http:"))).toBe(true);
    expect(s.purposes.map((p) => p.purpose)).toContain("checking the trial page");
    expect(s.reads["replay:under_1h"]).toBe(1);

    // The fourth signal: a receipt read from a browser, shown from a named host.
    await SELF.fetch(`${BASE}/api/verify/${certId}`, { headers: { Accept: "text/html", Referer: "https://github.com/someone/repo/issues/9", "User-Agent": "Mozilla/5.0" } });
    await SELF.fetch(`${BASE}/api/verify/${certId}`, { headers: { Accept: "application/json", "User-Agent": "curl/8.0" } });
    await SELF.fetch(`${BASE}/api/verify/${certId}`, { headers: { Accept: "application/json", "User-Agent": "curl/8.0", "X-House": "1" } });
    await settled();
    const after = await readBuyerSignals(testEnv);
    expect(after.readers["browser:under_1h"]).toBe(1);
    expect(after.readers["agent:under_1h"]).toBe(1);
    expect(after.referrers["github.com"]).toBe(1);
    expect(after.referrers["none"]).toBe(1);
    // The receipt was read twice by somebody other than the house or a crawler.
    expect(after.artifacts[certId]).toBe(2);
  });

  it("notices the worked example bought as-is", async () => {
    const url = `${BASE}/api/buy/spot_check?host=your-door.example`;
    const quote = await SELF.fetch(url);
    expect(quote.status).toBe(402);
    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    await settled();
    const s = await readBuyerSignals(testEnv);
    expect(s.examples["spot_check:host"]).toBe(1);
  });

  it("counts who reads a page about a host, names crawlers, and keeps them out of the subject counts", async () => {
    const host = "ready-door.example";
    await seedCorpus(host);
    const page = `${BASE}/corpus/host/${host}`;
    // An operator looking at their own listing, twice; an agent reading the twin; a crawler walking.
    await SELF.fetch(page, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0", Referer: `https://${host}/dashboard` } });
    await SELF.fetch(page, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0", Referer: `https://docs.${host}/` } });
    await SELF.fetch(`${page}.json`, { headers: { Accept: "application/json", "User-Agent": "python-httpx/0.27" } });
    await SELF.fetch(page, { headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0 (compatible; GPTBot/1.0)" } });
    await SELF.fetch(page, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0", "X-House": "1" } });
    // A host the chain never met is a 404 and never a key.
    const missing = await SELF.fetch(`${BASE}/corpus/host/never-met-${Date.now()}.example`, { headers: { Accept: "text/html" } });
    expect(missing.status).toBe(404);
    await settled();
    const s = await readBuyerSignals(testEnv);
    expect(s.pages["corpus_host:html:browser:self"]).toBe(2);
    expect(s.pages["corpus_host:json:agent:none"]).toBe(1);
    // A named crawler on a bare wildcard is negotiated to the markdown twin; the format says so.
    expect(s.pages["corpus_host:markdown:crawler:none"]).toBe(1);
    expect(s.crawlers["corpus_host:gptbot"]).toBe(1);
    expect(s.subjects[host]).toBe(3);
    expect(s.selfreads[host]).toBe(2);
    expect(Object.keys(s.subjects).some((k) => k.startsWith("never-met-"))).toBe(false);
    // The same reads by format: two of the page, one of the twin — a return, not a sweep.
    expect(s.subject_formats[`${host}:html`]).toBe(2);
    expect(s.subject_formats[`${host}:json`]).toBe(1);
    expect(s.histogram).toEqual({
      subjects: 1,
      by_formats: { one: 0, two: 1, three: 0 },
      repeat: { at_least_2: 1, at_least_5: 0, at_least_10: 0 },
      reads: 3,
      overflow: 0,
    });
    // Read from the one writer, and the reading says so, with the caps that applied.
    expect(s.storage.path).toBe("signal_store");
    expect(s.storage.caps["referrers"]).toBe(SIGNAL_MAP_CAP);
    const html = await (await SELF.fetch(`${BASE}/admin/signals`, { headers: AUTH })).text();
    expect(html).toContain("Who reads the pages about somebody");
    expect(html).toContain("Subjects read more than once");
    expect(html).toContain(`<code>${host}</code></td><td>3</td><td>2</td><td>html, json</td>`);
    expect(html).toContain("How concentrated the reading is");
    expect(html).toContain("Storage: <code>signal_store</code>");
    expect(html).toContain("Caps on this path: refusal_organic 100, refusal_machinery 100, referrers 100");
  });

  it("classes a reader once for every page, and a referrer by its relation to the subject", () => {
    expect(readerClass("Mozilla/5.0 (compatible; ClaudeBot/1.0)", "*/*")).toBe("crawler");
    expect(readerClass("uptimerobot/2.0", "text/html")).toBe("crawler");
    expect(readerClass("Mozilla/5.0", "text/html")).toBe("browser");
    expect(readerClass("curl/8.0", "application/json")).toBe("agent");
    expect(referrerRelation("https://a.example/x", "a.example", "scvd.store")).toBe("self");
    expect(referrerRelation("https://www.a.example/x", "a.example:8080", "scvd.store")).toBe("self");
    expect(referrerRelation("https://scvd.store/doors", "a.example", "scvd.store")).toBe("own");
    expect(referrerRelation("https://github.com/x", "a.example", "scvd.store")).toBe("other");
    expect(referrerRelation(undefined, "a.example", "scvd.store")).toBe("none");
    expect(referrerRelation("not a url", "a.example", "scvd.store")).toBe("other");
  });

  it("the keeper's page scans in one glance and expands on request", async () => {
    await recordSettleSignal(testEnv, { door: "mcp", network: "solana:mainnet", item: "hello", purpose: "reading the shelf", house: false });
    const page = await SELF.fetch(`${BASE}/admin/signals`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Buyer signals");
    expect(html).toContain("<details><summary>Expand</summary>");
    expect(html).toContain("solana:mainnet ×1 over MCP");
    expect(html).toContain("reading the shelf");
    expect(html).toContain("BUYER_SIGNALS_ENABLED");
    expect(html).toContain("Who reads receipts");
    expect(html).toContain("The worked example, bought as-is");
    expect(html).toContain('href="/admin/disclosure"');
  });
});
