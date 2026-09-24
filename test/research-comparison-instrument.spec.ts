import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { comparisonUrls, COMPARISON_OFFER_CAP, COMPARISON_INPUT_CAP } from "@/lib/research-comparison-terms";
import { performResearchComparison, comparisonOffer } from "@/services/research-comparison";
import { preflightUrl } from "@/services/preflight";
import { heldHalf, heldHalfOf } from "@/services/look";
import { verifyMessageSignature } from "@/lib/signing";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import type { Env } from "@/types";

vi.mock("@/services/preflight", async original => {
  const actual = await original<typeof import("@/services/preflight")>();
  return { ...actual, preflightUrl: vi.fn() };
});
vi.mock("@/services/look", async original => {
  const actual = await original<typeof import("@/services/look")>();
  return { ...actual, heldHalf: vi.fn() };
});
const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const URLS = ["https://alpha.example/research", "https://beta.example/research"];
const NOW = new Date("2026-09-24T12:00:00.000Z");
const OFFER = { scheme: "exact", network: "eip155:8453", asset: `0x${"ab".repeat(20)}`, payTo: `0x${"cd".repeat(20)}`, amount: "900719925474099312345" };
const probe = vi.mocked(preflightUrl), history = vi.mocked(heldHalf);
// Obtain an actual report shape once; the tests below control only its
// verdict and offers, while signature and history derivation remain real.
let report: Awaited<ReturnType<typeof preflightUrl>>;
beforeAll(async () => {
  const actual = await vi.importActual<typeof import("@/services/preflight")>("@/services/preflight");
  const oldFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async () => new Response("fixture", { status: 200 }));
  report = await actual.preflightUrl(URLS[0], testEnv);
  vi.stubGlobal("fetch", oldFetch);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  probe.mockReset(); history.mockReset();
  probe.mockResolvedValue({ ...report, accepts: [OFFER] });
  history.mockImplementation((env, host, now) => heldHalfOf(env, host, now));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const run = () => performResearchComparison(testEnv, JSON.stringify(URLS));

describe("comparison input boundaries", () => {
  it.each([
    undefined, "not json", "{}", "[]", JSON.stringify([URLS[0]]),
    JSON.stringify([...URLS, ...URLS, "https://extra.example/"]),
    JSON.stringify([URLS[0], URLS[0]]), JSON.stringify([URLS[0], 42]),
    JSON.stringify([URLS[0], "https://127.0.0.1/"]), JSON.stringify([URLS[0], "https://scvd.store./x"]),
    JSON.stringify([URLS[0], "https://name:password@other.example/"]),
    JSON.stringify([URLS[0], "http://other.example/"]),
    JSON.stringify([URLS[0], "https://other.example:1234/"]),
    JSON.stringify([URLS[0], "https://other.example/#"]),
    JSON.stringify([URLS[0], "https://alpha.example.:443/research"]),
    "x".repeat(COMPARISON_INPUT_CAP + 1),
  ])("refuses an invalid set before probing", async raw => {
    expect(() => comparisonUrls(raw, BASE)).toThrow();
    await expect(performResearchComparison(testEnv, raw)).rejects.toThrow();
    expect(probe).not.toHaveBeenCalled();
  });
});

it("signs every row, preserves atomic precision and counts empty history honestly", async () => {
  const signed = await run();
  expect(probe.mock.calls.map(call => call[0])).toEqual(URLS);
  expect(signed.record.counts).toEqual({ requested: 2, live_reports: 2, live_gaps: 0, histories_read: 2, history_gaps: 0, hosts_never_met: 2 });
  expect(signed.record.rows.every(row => row.history?.never_met && row.changes.scope === "no_prior")).toBe(true);
  expect(signed.record.quote_groups[0]?.offers.map(offer => offer.amount_atomic)).toEqual([OFFER.amount, OFFER.amount]);
  expect(signed.record.shared_receivers).toEqual([{ network: OFFER.network, address: OFFER.payTo, urls: URLS }]);
  expect(JSON.parse(signed.signed_payload)).toEqual(signed.record);
  expect(await sha256Hex(signed.signed_payload)).toBe(signed.evidence_hash);
  expect(await verifyMessageSignature(signed.signed_payload, signed.signature, signed.public_key)).toBe(true);
  expect(await verifyMessageSignature(jcsCanonicalize(signed.record), signed.signature_jcs, signed.public_key)).toBe(true);
  const tampered = JSON.parse(signed.signed_payload);
  tampered.rows[0].offers[0].amount_atomic = "1";
  expect(await verifyMessageSignature(JSON.stringify(tampered), signed.signature, signed.public_key)).toBe(false);
});

it("walks four distinct endpoints once each and preserves the requested order", async () => {
  const urls = [...URLS, "https://gamma.example/research", "https://delta.example/research"];
  const { record } = await performResearchComparison(testEnv, JSON.stringify(urls));
  expect(probe.mock.calls.map(call => call[0])).toEqual(urls);
  expect(record.rows.map(row => row.url)).toEqual(urls);
  expect(record.counts.requested).toBe(4);
});

it("keeps local probe and archive failures distinct from a never-met provider", async () => {
  probe.mockResolvedValueOnce({ status: 429, body: { error: "budget", code: "budget_spent" }, headers: { "Retry-After": "60" } });
  history.mockRejectedValueOnce(new Error("private implementation details"));
  const { record, signed_payload } = await run();
  expect(record.counts).toMatchObject({ live_reports: 1, live_gaps: 1, history_gaps: 1, hosts_never_met: 1 });
  expect(record.rows[0]).toMatchObject({ live: null, live_gap: { code: "budget_spent", retry_after_seconds: "60" }, history: null, history_gap: "history_unavailable" });
  expect(signed_payload).not.toContain("private implementation details");
  probe.mockRejectedValue(new Error("unavailable"));
  await expect(run()).rejects.toThrow("No comparison probes completed");
});

it("bounds hostile offers, retaining total and included counts", async () => {
  probe.mockResolvedValue({ ...report, accepts: [null, ...Array.from({ length: COMPARISON_OFFER_CAP + 2 }, () => OFFER)] as unknown as Record<string, unknown>[] });
  const { record } = await run();
  expect(record.rows[0]).toMatchObject({ offers_observed: COMPARISON_OFFER_CAP + 3, offers_included: COMPARISON_OFFER_CAP, offers_truncated: true });
  expect(record.rows[0]?.offers[0]?.comparison).toBe("not_comparable");
  expect(record.rows[0]?.changes.networks).toBe("not_comparable");
});

it.each([null, { amount: "1.2" }, { amount: -1 }, { amount: "1e6" }, { amount: "9".repeat(79) },
  { scheme: "upto" }, { amount: "123", maxAmountRequired: "456" }, { asset: "USDC" }, { network: "base" }])(
  "leaves malformed, variable and unrecognized quotes incomparable", override => {
    expect(comparisonOffer(override === null ? null : { ...OFFER, ...override }, 0).comparison).toBe("not_comparable");
  },
);

it("does not merge assets or networks, and does not fold Solana address case", async () => {
  const sol = { ...OFFER, network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", asset: "A".repeat(43), payTo: "B".repeat(43) };
  probe.mockResolvedValueOnce({ ...report, accepts: [OFFER, sol] });
  probe.mockResolvedValueOnce({ ...report, accepts: [
    { ...OFFER, network: "eip155:137" }, { ...OFFER, asset: `0x${"ef".repeat(20)}`, payTo: `0x${"ee".repeat(20)}` },
    { ...sol, payTo: "b".repeat(43) },
  ] });
  const { record } = await run();
  expect(record.quote_groups).toHaveLength(4);
  expect(record.shared_receivers).toEqual([]);
});

it("compares network changes only against the same recorded endpoint", async () => {
  history.mockImplementation(async (env, host, now) => ({ ...await heldHalfOf(env, host, now),
    last_probed_round: { week: "2026-W38", taken_at: "2026-09-20T00:00:00Z", url: `https://${host}/${host === "alpha.example" ? "research" : "other"}`,
      failed: [], advisories: [], entry_url: `${BASE}/corpus/1.json`, offer: { networks: ["eip155:137"] } },
  }));
  const { record } = await run();
  expect(record.rows[0]?.changes).toMatchObject({ scope: "same_endpoint", networks: "changed", price: "not_comparable" });
  expect(record.rows[1]?.changes).toMatchObject({ scope: "different_endpoint", networks: "not_comparable", price: "not_comparable" });
});
