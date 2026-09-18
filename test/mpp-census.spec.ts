import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { canonicalizeCorpusSnapshot, listCorpus, takeCorpusSnapshot } from "@/services/corpus";
import { deriveTrajectory } from "@/services/trajectory";
import { mppCensusOf } from "@/services/mpp-census";
import { probeHost, runWardRound, type WardHostResult, type WardRound } from "@/services/ward-round";
import { longWalkPass, readLongWalk, readWalkResults } from "@/services/long-walk";
import { WATCH_EVIDENCE_BODY_LIMIT_BYTES } from "@/services/watch-evidence";
import type { Env } from "@/types";
import clean from "./fixtures/mpp/evm-clean.json";
import both from "./fixtures/mpp/x402-and-mpp.json";
import basic from "./fixtures/mpp/basic-beside-x402.json";
import broken from "./fixtures/mpp/id-missing-realm-missing.json";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const NOW = new Date("2026-09-14T12:00:00Z");

beforeAll(async () => {
  const { getPublicKeyAsync } = await import("@noble/ed25519");
  const seed = new Uint8Array(32).fill(0x42);
  const pair = new Uint8Array(64);
  pair.set(seed);
  pair.set(await getPublicKeyAsync(seed), 32);
  testEnv.CDP_API_KEY_ID = "test-key-id";
  testEnv.CDP_API_KEY_SECRET = btoa(String.fromCharCode(...pair));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(NOW.getTime());
  for (const prefix of [KV_KEYS.corpusPrefix, "anchor_log:"]) {
    const keys = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(keys.keys.map(key => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
});

async function probe(fixture: { body: string; status: number; headers: Record<string, string> }, host = "door.example"): Promise<WardHostResult> {
  const fetchMock = vi.fn(async () => new Response(fixture.body, { status: fixture.status, headers: fixture.headers }));
  vi.stubGlobal("fetch", fetchMock);
  const url = `https://${host}/api/paid`;
  const row = { host, url, ...await probeHost(testEnv, url) };
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return row;
}

describe("MPP observations survive the census", () => {
  it("records the same counts through the one-shot round and the batched walk, without a second knock", async () => {
    let knocks = 0;
    const items = [{ resourceUrl: "https://only.example/api/paid" }, { resourceUrl: "https://basic.example/api/paid" }];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.host === "api.cdp.coinbase.com") {
        if (url.pathname.endsWith("/discovery/search")) return Response.json({ items: [] });
        return Response.json({ items, pagination: { limit: 100, offset: 0, total: items.length } });
      }
      if (url.host === "only.example" || url.host === "basic.example") {
        knocks++;
        const fixture = url.host === "only.example" ? clean : basic;
        return new Response(fixture.body, { status: fixture.status, headers: fixture.headers });
      }
      return new Response("unavailable", { status: 503 });
    });
    const round = await runWardRound(testEnv);
    const expected = { probed: 2, measured: 2, speaking_mpp: 1, mpp_only: 1, x402_only: 1, unmeasured: 0, unreachable: 0 };
    expect(round.mpp).toMatchObject(expected);
    expect(knocks).toBe(2);
    expect((await longWalkPass(testEnv)).phase).toBe("started");
    expect((await longWalkPass(testEnv)).phase).toBe("walked");
    const state = await readLongWalk(testEnv);
    const saved = (await readWalkResults(testEnv, state!)).rows;
    expect(saved.find(row => row.host === "only.example")?.protocols_spoken).toEqual(["mpp"]);
    const beforeSeal = knocks;
    const assembled = await runWardRound(testEnv);
    expect(assembled.mpp).toMatchObject(expected);
    expect(knocks).toBe(beforeSeal);
  });

  it("retains the separate battery, both protocols and failures without changing the x402 verdict", async () => {
    const only = await probe(clean);
    expect(only).toMatchObject({ verdict: "not_ready", protocols_spoken: ["mpp"], mpp: { spoken: true, battery: "mpp-v1" } });
    expect(only.mpp!.checks.every(check => check.ok)).toBe(true);
    const dual = await probe(both);
    expect(dual.protocols_spoken).toEqual(["x402", "mpp"]);
    const badDual = await probe({ ...both, headers: { ...both.headers, "www-authenticate": broken.headers["www-authenticate"] } });
    expect(badDual.verdict).toBe(dual.verdict);
    expect(badDual.failed).toEqual(dual.failed);
    expect(badDual.battery).toBe(dual.battery);
    expect(badDual.mpp!.checks.some(check => !check.ok)).toBe(true);
    const bad = await probe(broken);
    expect(bad.mpp!.checks.filter(check => !check.ok).map(check => check.name)).toEqual(broken.expect_failed);
    expect(bad.failed.some(name => name.startsWith("mpp-"))).toBe(false);
    const proxy = await probe(basic);
    expect(proxy).toMatchObject({ protocols_spoken: ["x402"], mpp: { spoken: false, checks: [] } });
    const neither = await probe({ ...clean, status: 200, headers: {}, body: "hello" });
    expect(neither).toMatchObject({ protocols_spoken: [], mpp: { spoken: false, checks: [] } });
  });

  it("checks expiry at the recorded knock, using the requested URL even when Response.url is empty", async () => {
    const row = await probe({ ...clean, headers: { ...clean.headers, "www-authenticate": clean.headers["www-authenticate"].replace("2099-01-01T00:00:00Z", "2026-09-14T12:00:01Z") } });
    expect(row.observed_at).toBe(NOW.toISOString());
    expect(row.mpp!.checks.find(check => check.name === "mpp-expires-rfc3339")?.ok).toBe(true);
    expect(row.mpp!.checks.find(check => check.name === "mpp-tls-only")?.ok).toBe(true);
  });

  it("leaves an unanswered probe unmeasured", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    const row = await probeHost(testEnv, clean.url);
    expect(row.verdict).toBe("unreachable");
    expect(row.mpp).toBeUndefined();
    expect(row.protocols_spoken).toBeUndefined();
  });

  it("records a reader failure without replacing the x402 verdict with unreachable", async () => {
    const dual = await probe(both);
    const request = btoa(JSON.stringify({ amount: "1", currency: "USDC", recipient: "neutral", methodDetails: { chainId: { toString: 1 } } })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const row = await probe({ ...both, headers: { ...both.headers, "www-authenticate": `Payment id="a", realm="b", method="evm", intent="charge", request="${request}"` } });
    expect(row.verdict).toBe(dual.verdict);
    expect(row.failed).toEqual(dual.failed);
    expect(row.mpp).toBeUndefined();
    expect(row.protocols_spoken).toBeUndefined();
    expect(row.mpp_read_error).toBe("reader_failed");
    expect(mppCensusOf([row])).toMatchObject({ measured: 0, unmeasured: 1, unreachable: 0 });
  });

  it("does not classify a truncated problem body as malformed JSON", async () => {
    const row = await probe({ ...clean, body: JSON.stringify({ type: "https://paymentauth.org/problems/payment-required", detail: "x".repeat(WATCH_EVIDENCE_BODY_LIMIT_BYTES) }) });
    expect(row.evidence!.body_truncated).toBe(true);
    expect(row.mpp!.advisories.some(advisory => advisory.name === "mpp-body-not-problem-json")).toBe(false);
    expect(row.mpp!.body_complete).toBe(false);
  });

  it("signs the readings, recounts mixed coverage and serves them in the host history and brief", async () => {
    const hosts = [await probe(clean, "only.example"), await probe(both, "both.example"), await probe(basic, "basic.example"), await probe(broken, "broken.example")];
    hosts.push({ host: "old.example", url: clean.url, verdict: "not_ready", failed: [], advisories: [] });
    hosts.push({ host: "down.example", url: clean.url, verdict: "unreachable", failed: [], advisories: [] });
    hosts.push({ host: "listed.example", url: clean.url, verdict: "not_probed", failed: [], advisories: [] });
    const round: WardRound = { week: "2026-W38", at: NOW.toISOString(), listed_resources: hosts.length, coverage_suspect: false, capped: false, our_search_presence: null, hosts };
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
    const result = await takeCorpusSnapshot(testEnv, { now: NOW, calendars: ["https://calendar.test"], fetch: async () => new Response(new Uint8Array([1, 2, 3])) });
    expect(result.taken).toBe(true);
    const records = await listCorpus(testEnv);
    expect(records[0]!.snapshot.round.hosts.map(row => row.mpp)).toEqual(hosts.map(row => row.mpp));
    const canonical = canonicalizeCorpusSnapshot(records[0]!.snapshot);
    const expected = { probed: 6, measured: 4, unmeasured: 1, unreachable: 1, not_probed: 1, speaking_mpp: 3, mpp_only: 2, both: 1, x402_only: 1, neither: 0 };
    expect(deriveTrajectory(records).weeks[0]!.mpp).toMatchObject(expected);
    expect(deriveTrajectory(records).what_this_is).toContain("No reading here rests on a payment");
    const history = await (await SELF.fetch(`${BASE}/corpus/host/only.example.json`)).json() as { timeline: { mpp?: unknown; protocols_spoken?: string[] }[] };
    expect(history.timeline[0]).toMatchObject({ mpp: hosts[0]!.mpp, protocols_spoken: ["mpp"] });
    const hostHtml = await (await SELF.fetch(`${BASE}/corpus/host/only.example`)).text();
    expect(hostHtml).toContain("No reading here rests on a payment");
    const brief = await (await SELF.fetch(`${BASE}/corpus/brief`)).json() as { mpp: unknown };
    expect(brief.mpp).toMatchObject(expected);
    const html = await (await SELF.fetch(`${BASE}/corpus/brief`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("3 of 4");
    expect(html).toContain("MPP");
    const metadata = await (await SELF.fetch(`${BASE}/corpus.json`)).json() as { variableMeasured: string[] };
    expect(metadata.variableMeasured.some(field => field.startsWith("protocols_spoken:"))).toBe(true);
    expect(metadata.variableMeasured.some(field => field.startsWith("mpp:"))).toBe(true);
    const { verifyAsync, etc } = await import("@noble/ed25519");
    const record = records[0]!;
    expect(await verifyAsync(etc.hexToBytes(record.signature), new TextEncoder().encode(canonical), etc.hexToBytes(record.public_key))).toBe(true);
    const tampered = structuredClone(record.snapshot);
    tampered.round.hosts[0]!.mpp!.spoken = false;
    expect(await verifyAsync(etc.hexToBytes(record.signature), new TextEncoder().encode(canonicalizeCorpusSnapshot(tampered)), etc.hexToBytes(record.public_key))).toBe(false);
    // A legacy row is not retroactively a negative MPP observation.
    const legacy = structuredClone(records);
    for (const row of legacy[0]!.snapshot.round.hosts) { delete row.mpp; delete row.protocols_spoken; }
    expect(deriveTrajectory(legacy).weeks[0]!.mpp).toBeUndefined();
  });
});
