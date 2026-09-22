import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { receiptAudience } from "@/routes/verify";
import { PUBLISHED_COUNTS_RULE } from "@/store/published-counts";
import type { Certificate, Env } from "@/types";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const BROWSER = { Accept: "text/html", "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605.1.15" };

/**
 * THE PAGES FOR HUMANS (2026-09-21): every artifact class answers a
 * browser with a page; the receipt chooses its audience from the
 * certificate alone; the guestbook and a patronage pass have
 * addresses a person can open; the host page says why it exists and
 * what an operator can do; the purpose field says what it is for.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

describe("every artifact renders for a person", () => {
  it("answers a browser with a page for a stamp, and the same record as JSON", async () => {
    const taken = await SELF.fetch(`${BASE}/api/stamp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "pages-spec" }) });
    expect(taken.status, await taken.clone().text()).toBe(201);
    const stamp = (await taken.json()) as { stamp?: { stamp_id?: string }; stamp_id?: string; verify_url?: string };
    const id = stamp.stamp?.stamp_id ?? stamp.stamp_id ?? stamp.verify_url?.split("/").pop();
    expect(id).toBeTruthy();
    const page = await SELF.fetch(`${BASE}/api/verify/${id}`, { headers: BROWSER });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("Signature verified just now");
    expect(html).toContain("Verify this yourself");
    expect(html).toContain("the guestbook");
    const json = await (await SELF.fetch(`${BASE}/api/verify/${id}`, { headers: { Accept: "application/json" } })).json() as { valid: boolean; stamp: unknown; store_links: { store: { name: string } } };
    expect(json.valid).toBe(true);
    expect(json.stamp).toBeDefined();
    expect(json.store_links.store.name).toBeTruthy();
  });

  it("chooses the receipt's audience from the certificate alone", () => {
    const now = Date.parse("2026-09-21T12:00:00Z");
    const cert = (item: string, date: string) => ({ cert_id: "c", item, patron_number: 1, date } as unknown as Certificate);
    expect(receiptAudience(cert("hello", "2026-09-21T11:30:00Z"), now)).toBe("buyer");
    expect(receiptAudience(cert("spot_check", "2026-09-01T11:30:00Z"), now)).toBe("counterparty");
    expect(receiptAudience(cert("settlement_attestation", "2026-09-01T11:30:00Z"), now)).toBe("counterparty");
    expect(receiptAudience(cert("hello", "2026-09-01T11:30:00Z"), now)).toBe("reader");
    expect(receiptAudience(cert("retired_thing", "2026-09-01T11:30:00Z"), now)).toBe("reader");
  });

  it("renders the receipt with the item linked, the buyer's next steps and the attest loop", async () => {
    const url = `${BASE}/api/buy/hello?agent_name=pages-spec`;
    const quote = await SELF.fetch(url);
    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!), Accept: "application/json" } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    const purchase = (await paid.json()) as { certificate: { cert_id: string; settlement_tx?: string } };
    const html = await (await SELF.fetch(`${BASE}/api/verify/${purchase.certificate.cert_id}`, { headers: BROWSER })).text();
    expect(html).toContain('href="/menu/hello"');
    expect(html).toContain("Your purchase, checked");
    expect(html).toContain("Ring the bell");
    expect(html).toContain("sign the guestbook");
    if (purchase.certificate.settlement_tx) expect(html).toContain("Attest this settlement");
    expect(html).toContain("the developer portal");
  });
});

describe("the guestbook and a pass have addresses", () => {
  it("serves the guestbook as a page, as markdown and as JSON, and one entry at its own URL", async () => {
    const signed = await SELF.fetch(`${BASE}/api/guestbook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pages Spec", message: "a wall you can look at" }) });
    expect(signed.status, await signed.clone().text()).toBe(201);
    const { entry } = (await signed.json()) as { entry: { id: string } };
    const page = await SELF.fetch(`${BASE}/guestbook`, { headers: BROWSER });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("a wall you can look at");
    expect(html).toContain(`/guestbook/${entry.id}`);
    const md = await SELF.fetch(`${BASE}/guestbook`, { headers: { Accept: "text/markdown" } });
    expect(md.headers.get("content-type")).toContain("text/markdown");
    const json = (await (await SELF.fetch(`${BASE}/guestbook`, { headers: { Accept: "application/json" } })).json()) as { entries: Array<{ id: string; url: string }>; store_links: unknown };
    expect(json.entries.some((row) => row.id === entry.id && row.url.endsWith(`/guestbook/${entry.id}`))).toBe(true);
    expect(json.store_links).toBeDefined();
    const one = await SELF.fetch(`${BASE}/guestbook/${entry.id}`, { headers: BROWSER });
    expect(one.status).toBe(200);
    expect(await one.text()).toContain("Pages Spec");
    expect((await SELF.fetch(`${BASE}/guestbook/no-such-entry`, { headers: BROWSER })).status).toBe(404);
  });

  it("answers a browser and a machine for a patronage pass, and says so when there is none", async () => {
    const missing = await SELF.fetch(`${BASE}/patronage/pass_nobody`, { headers: BROWSER });
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { buy: string };
    expect(body.buy).toContain("recurring_patronage");
  });
});

describe("the host page and the purpose field", () => {
  it("tells the operator why the page exists, what they can do free, and the instrument its tier picks", async () => {
    const { takeCorpusSnapshot } = await import("@/services/corpus");
    const { KV_KEYS } = await import("@/lib/kv-keys");
    const host = "pages-spec-door.example";
    const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
    await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify({ week: "2026-W31", at: new Date().toISOString(), listed_resources: 1, coverage_suspect: false, capped: false, our_search_presence: true, hosts: [{ host, resources: 1, verdict: "ready" }] }),
    );
    const pass = await takeCorpusSnapshot(testEnv, { calendars: ["https://calendar.test"], fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch });
    expect(pass.taken).toBe(true);
    const html = await (await SELF.fetch(`${BASE}/corpus/host/${host}`, { headers: BROWSER })).text();
    expect(html).toContain("If this is your host");
    expect(html).toContain("There is no claim step");
    expect(html).toContain("/api/declare-door");
    expect(html).toContain("/api/standing-note");
    expect(html).toContain(`spot_check?host=${host}`);
    const md = await (await SELF.fetch(`${BASE}/corpus/host/${host}`, { headers: { Accept: "text/markdown" } })).text();
    expect(md).toContain("## If this is your host");
    expect(md).toContain(`spot_check?host=${host}`);
    const json = (await (await SELF.fetch(`${BASE}/corpus/host/${host}.json`, { headers: { Accept: "application/json" } })).json()) as { store_links: { next: Array<{ item: string; source: string }> } };
    expect(json.store_links.next.map((step) => step.item)).toContain("spot_check");
    expect(json.store_links.next.every((step) => step.source === "host_tier")).toBe(true);
  });

  it("says once, in the guide, that a person reads the purpose field, and names the mandate spec", async () => {
    /*
     * NOT ON EVERY ITEM'S SCHEMA. The first cut of this put the sentence on
     * the `purpose` field's own description, which rides every item's input
     * contract: 57 characters times thirty-five items, and OpenAPI went
     * 2,504 bytes over the reader budget whose guard says in as many words
     * not to raise the number. The guide is one document, so the sentence
     * costs once — and llms.txt is where the orphan guard reads anyway.
     */
    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(guide).toContain("printed on\nits receipt page, where a person reads it");
    expect(guide).toContain("/mandate-spec");
    expect(guide).toContain("/schemas/scvd-mandate-v1.json");
  });

  it("keeps the pulse page's denominators beside the numbers it prints", async () => {
    const html = await (await SELF.fetch(`${BASE}/pulse`, { headers: BROWSER })).text();
    expect(html).toContain(PUBLISHED_COUNTS_RULE.slice(0, 40));
  });
});
