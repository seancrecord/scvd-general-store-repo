import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import { issuePassport, type EndpointPassport } from "@/services/passport";
import { runMppChecks } from "@/services/mpp-battery";
import { foldTierIndex } from "@/services/passport-tier";
import { listCorpus } from "@/services/corpus";
import type { WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";
import { performPassportRefresh } from "@/services/passport-refresh";
import { probeHost } from "@/services/ward-round";
import { signTrustProfile } from "@/services/trust-profile";
import clean from "./fixtures/mpp/evm-clean.json";
import broken from "./fixtures/mpp/id-missing-realm-missing.json";

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/ward-round")>();
  return { ...original, probeHost: vi.fn() };
});

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const NOW = new Date("2026-09-14T12:00:00Z");
const HOST = "protocols.example";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const prefix of [KV_KEYS.corpusPrefix, KV_KEYS.passportRefresh(HOST)]) {
    const keys = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(keys.keys.map(key => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.trustProfile(HOST));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function door(x402: "ready" | "not_ready", mpp?: "clean" | "broken"): WardHostResult {
  const row: WardHostResult = { host: HOST, url: `https://${HOST}/paid`, verdict: x402, failed: x402 === "ready" ? [] : ["payment-required-header"], advisories: [] };
  if (mpp) {
    const fixture = mpp === "clean" ? clean : broken;
    const headers = new Headers(fixture.headers);
    // Unrelated authentication schemes must not disqualify either payment protocol.
    headers.append("www-authenticate", 'Basic realm="proxy", Bearer realm="other"');
    if (x402 === "ready") headers.set("payment-required", "observed");
    const { protocols_spoken, challenges: _challenges, ...reading } = runMppChecks({ headers, url: row.url, bodyText: fixture.body, now: NOW });
    Object.assign(row, { protocols_spoken, mpp: { ...reading, body_complete: true } });
  }
  return row;
}

async function seed(rows: WardHostResult[]): Promise<void> {
  for (const [index, row] of rows.entries()) {
    const at = new Date(NOW.getTime() - (rows.length - index - 1) * 7 * 86_400_000).toISOString();
    const week = `2026-W${String(38 - rows.length + index + 1).padStart(2, "0")}`;
    await testEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}${String(index + 1).padStart(9, "0")}`, JSON.stringify({
      snapshot: { version: 1, sequence: index + 1, taken_at: at, previous_digest: null, source: "ward_round", week,
        round: { week, at, listed_resources: 1, coverage_suspect: false, capped: false, our_search_presence: true, hosts: [{ ...row, observed_at: at }] } },
      digest: "0".repeat(64), signature: "0".repeat(128), public_key: "0".repeat(64),
    }));
  }
}

async function passport(): Promise<EndpointPassport> {
  const result = await issuePassport(testEnv, HOST, NOW);
  expect(result.issued).toBe(true);
  if (!result.issued) throw new Error(result.detail);
  return result.passport;
}

describe("a passport can rest on either observed payment protocol", () => {
  it.each([
    ["ready", undefined, "x402"],
    ["not_ready", "clean", "mpp"],
    ["ready", "clean", "x402"],
    ["ready", "broken", "x402"],
  ] as const)("issues for x402 %s and MPP %s, on %s", async (x402, mpp, protocol) => {
    await seed([door(x402, mpp)]);
    const result = await passport();
    expect(result.payload.summary.decision).toBe("READY");
    expect(result.payload.protocol).toBe(protocol);
    expect(result.payload.tier?.protocol).toBe(protocol);
    expect(result.payload.latest?.x402_verdict).toBe(x402);
    if (x402 === "ready") expect(result.payload.protocol_tiers?.x402?.fraction.ready).toBe(1);
    else expect(result.payload.protocol_tiers?.x402).toBeUndefined();
    if (mpp) expect(result.payload.protocol_tiers?.mpp?.fraction.ready).toBe(mpp === "clean" ? 1 : 0);
    const saved = await listCorpus(testEnv);
    expect(saved[0]!.snapshot.round.hosts[0]!.verdict).toBe(x402);
    expect(await verifyMessageSignature(result.signed_payload, result.signature, result.public_key)).toBe(true);
    const tampered = structuredClone(result.payload);
    tampered.protocol = protocol === "mpp" ? "x402" : "mpp";
    expect(await verifyMessageSignature(JSON.stringify(tampered), result.signature, result.public_key)).toBe(false);
  });

  it("refuses failing or incomplete MPP evidence, including an empty check list", async () => {
    const failed = door("not_ready", "broken");
    await seed([failed]);
    expect((await issuePassport(testEnv, HOST, NOW)).issued).toBe(false);
    const incomplete = door("not_ready", "clean");
    incomplete.mpp!.checks = [];
    await seed([incomplete]);
    expect(await issuePassport(testEnv, HOST, NOW)).toMatchObject({ issued: false, reason: "protocol-unmeasured" });
    const future = door("not_ready", "clean");
    Object.assign(future.mpp!, { battery: "unknown-future-battery" });
    await seed([future]);
    expect((await issuePassport(testEnv, HOST, NOW)).issued).toBe(false);
  });

  it("a failing x402 battery does not disqualify a passing MPP battery on a dual-protocol door", async () => {
    const dual = door("not_ready", "clean");
    dual.protocols_spoken = ["x402", "mpp"];
    await seed([dual]);
    const result = await passport();
    expect(result.payload.protocol).toBe("mpp");
    expect(result.payload.protocols_spoken).toEqual(["x402", "mpp"]);
    expect(result.payload.protocol_tiers?.x402?.tier).toBe("broken");
    expect(result.payload.summary.failed).toEqual([]);
    expect(result.payload.latest?.x402_failed).toEqual(dual.failed);
  });

  it("legacy MPP gaps stay indeterminate and cannot earn a tier", async () => {
    await seed([door("ready"), door("not_ready", "clean")]);
    expect((await passport()).payload.tier).toMatchObject({ tier: "indeterminate", fraction: { ready: 1, rounds: 2 } });
  });

  it("counts each protocol's own rounds and agrees with the tier index and public surfaces", async () => {
    const x402Only = door("ready", "clean");
    x402Only.protocols_spoken = ["x402"];
    x402Only.mpp = { ...x402Only.mpp!, spoken: false, checks: [], advisories: [] };
    await seed([x402Only, door("not_ready", "clean"), x402Only, door("not_ready", "clean")]);
    const result = await passport();
    expect(result.payload.tier).toMatchObject({ protocol: "mpp", tier: "observed", fraction: { ready: 2, rounds: 4 } });
    expect(result.payload.tier?.line).toContain("mpp-v1");
    const index = foldTierIndex(await listCorpus(testEnv), new Map(), BASE, NOW);
    expect(index.hosts[0]).toMatchObject({ tier: "observed", fraction: { ready: 2, rounds: 4 } });
    expect(index.hosts[0]!.line).toBe(result.payload.tier?.line);
    const html = await (await SELF.fetch(`${BASE}/passport/${HOST}`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("No reading here rests on a payment");
    expect(html).not.toContain("found a working x402 door");
    const chip = await SELF.fetch(`${BASE}/badges/passport/${HOST}.svg`);
    expect(chip.status).toBe(200);
    expect(await chip.text()).toContain("MPP PASSPORT");
    const history = await (await SELF.fetch(`${BASE}/corpus/host/${HOST}.json`)).json() as { tier: { line: string } };
    expect(history.tier.line).toBe(result.payload.tier?.line);
    await testEnv.COUNTERS.put(KV_KEYS.trustProfile(HOST), JSON.stringify(await signTrustProfile(testEnv, new URL(`https://${HOST}/paid`), null, NOW)));
    const profiles = await (await SELF.fetch(`${BASE}/profiles`, { headers: { Accept: "application/json" } })).json() as { profiles: { host: string; decision: string; protocol: string }[] };
    expect(profiles.profiles).toContainEqual(expect.objectContaining({ host: HOST, decision: "READY", protocol: "mpp" }));
    const profileHtml = await (await SELF.fetch(`${BASE}/profiles/${HOST}`, { headers: { Accept: "text/html" } })).text();
    expect(profileHtml).toContain('data-decision="READY"');
    expect(profileHtml).toContain("No reading here rests on a payment");
  });

  it("a newer unmeasured refresh cannot revive an old clean MPP challenge", async () => {
    await seed([door("not_ready", "clean")]);
    await passport();
    await testEnv.COUNTERS.put(KV_KEYS.passportRefresh(HOST), JSON.stringify({ artifact: "passport_refresh", host: HOST, observed_at: new Date(NOW.getTime() + 1000).toISOString(), verdict: "not_ready", failed: [], advisories: [] }));
    expect((await issuePassport(testEnv, HOST, NOW)).issued).toBe(false);
  });

  it("a paid refresh signs and retains its MPP reading at the probe's moment", async () => {
    const row = door("not_ready", "clean");
    const observed = new Date(NOW.getTime() - 1000).toISOString();
    vi.mocked(probeHost).mockResolvedValueOnce({ ...row, observed_at: observed });
    const refreshed = await performPassportRefresh(testEnv, row.url, NOW);
    expect(refreshed.observation).toMatchObject({ verdict: "not_ready", observed_at: observed, protocols_spoken: ["mpp"], mpp: row.mpp });
    expect(refreshed.signed_payload).toBe(JSON.stringify(refreshed.observation));
    expect(await verifyMessageSignature(refreshed.signed_payload, refreshed.signature, refreshed.public_key)).toBe(true);
    const result = await passport();
    expect(result.payload.protocol).toBe("mpp");
    expect(result.payload.summary.observed_at).toBe(observed);
    expect(result.payload.latest?.source).toContain("paid refresh");
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    vi.mocked(probeHost).mockResolvedValueOnce({ ...door("not_ready", "broken"), observed_at: new Date().toISOString() });
    await performPassportRefresh(testEnv, row.url, new Date());
    expect((await issuePassport(testEnv, HOST, new Date())).issued).toBe(false);
  });
});
