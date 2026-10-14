import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { profilesRoutes } from "@/routes/profiles";
import { forgetResolvedRecords, type CorpusRecord } from "@/services/corpus-list";
import type { SignedTrustProfile } from "@/services/trust-profile";
import type { Env, HonoEnv } from "@/types";

const bindings = env as unknown as Env;
const NOW = "2026-10-07T12:00:00.000Z";
const AT = "2026-10-07T11:00:00.000Z";
const hosts = ["one.example", "two.example", "three.example"];
const key = "profile-budget/round.json";
const app = new Hono<HonoEnv>().route("/", profilesRoutes);

function profile(host: string, expires = "2026-11-01T00:00:00.000Z"): SignedTrustProfile {
  return {
    record: { artifact: "trust_profile", host, url: `https://${host}/pay`,
      commissioned_at: AT, active_since: AT, expires, term_days: 30, renewals: 1,
      verdict_at_commission: "ready", profile_url: `https://scvd.store/profiles/${host}`,
      passport_url: `https://scvd.store/passport/${host}`, chip_url: "", what_this_buys: "", not_a_guarantee: "" },
    evidence_hash: "fixture", signed_payload: "fixture", signature: "fixture", signature_jcs: "fixture", public_key: "fixture",
  };
}

async function seed() {
  const record: CorpusRecord = {
    snapshot: { version: 1, sequence: 1, taken_at: AT, week: "2026-W41", previous_digest: null, source: "ward_round",
      round: { week: "2026-W41", at: AT, listed_resources: hosts.length,
        coverage_suspect: false, capped: false, our_search_presence: false,
        hosts: hosts.map(host => ({ host, url: `https://${host}/pay`, resources: 1,
          observed_at: AT, verdict: "ready", failed: [], advisories: [],
          offer: { networks: ["eip155:8453"], schemes: ["exact"], pay_to_digest: ["same-wallet"] } })) } },
    digest: "fixture", signature: "fixture", public_key: "fixture",
  };
  await bindings.CORPUS_R2!.put(key, JSON.stringify(record));
  await bindings.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify({
    pointer: true, sequence: 1, week: "2026-W41", digest: record.digest,
    signature: record.signature, public_key: record.public_key, r2_key: key,
  }));
  await Promise.all([...hosts, "expired.example"].map(host => bindings.COUNTERS.put(
    KV_KEYS.trustProfile(host), JSON.stringify(profile(host, host === "expired.example" ? AT : undefined)),
  )));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  forgetResolvedRecords();
  for (const prefix of [KV_KEYS.corpusPrefix, "trust_profile:", "passport_refresh:"]) {
    const listed = await bindings.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map(k => bindings.COUNTERS.delete(k.name)));
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); forgetResolvedRecords(); });

describe("profile index reads shared evidence once per request", () => {
  it("loads a cold R2 record and population once for several profiles", async () => {
    await seed();
    const r2 = vi.spyOn(bindings.CORPUS_R2!, "get");
    const get = vi.spyOn(bindings.COUNTERS, "get");
    const response = await app.request("https://scvd.store/profiles", { headers: { Accept: "application/json" } }, bindings);
    expect(response.status).toBe(200);
    const body = await response.json() as { profiles: { host: string }[] };
    expect(body.profiles.map(p => p.host).sort()).toEqual([...hosts].sort());
    expect(r2).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.filter(([k]) => [k].flat().includes(KV_KEYS.populationRegister))).toHaveLength(1);
    expect(get.mock.calls.filter(([k]) => [k].flat().includes(`${KV_KEYS.corpusPrefix}000000001`))).toHaveLength(1);
  });

  it("reads new evidence on the next request rather than retaining a ready decision", async () => {
    await seed();
    const read = async () => (await (await app.request("https://scvd.store/profiles", {
      headers: { Accept: "application/json" },
    }, bindings)).json()) as { profiles: { host: string }[] };
    expect((await read()).profiles).toHaveLength(hosts.length);
    const object = await bindings.CORPUS_R2!.get(key);
    expect(object).not.toBeNull();
    const record = JSON.parse(await object!.text()) as CorpusRecord;
    record.snapshot.round.hosts[0]!.verdict = "not_ready";
    record.digest = "changed-fixture";
    await bindings.CORPUS_R2!.put(key, JSON.stringify(record));
    await bindings.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify({
      pointer: true, sequence: 1, week: "2026-W41", digest: record.digest,
      signature: record.signature, public_key: record.public_key, r2_key: key,
    }));
    expect((await read()).profiles.map(p => p.host)).not.toContain(hosts[0]);
  });

  it("does not load the archive when every profile is expired", async () => {
    await seed();
    await Promise.all(hosts.map(host => bindings.COUNTERS.put(KV_KEYS.trustProfile(host), JSON.stringify(profile(host, AT)))));
    const r2 = vi.spyOn(bindings.CORPUS_R2!, "get");
    const response = await app.request("https://scvd.store/profiles", { headers: { Accept: "application/json" } }, bindings);
    expect(response.status).toBe(200);
    expect((await response.json() as { profiles: unknown[] }).profiles).toEqual([]);
    expect(r2).not.toHaveBeenCalled();
  });
});
