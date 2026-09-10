import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { jcsCanonicalize } from "@/lib/jcs";
import { getCorpusEntry, latestCorpusEntry, putCorpusRecord, takeCorpusSnapshot, verifyCorpusChain } from "@/services/corpus";
import { evidenceShardKey, evidenceShardOf } from "@/services/corpus-evidence";
import { forgetResolvedChain } from "@/services/corpus-list";
import { latestWardRound, type WardHostResult, type WardRound } from "@/services/ward-round";
import type { WatchEvidenceCapture } from "@/services/watch-evidence";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE EVIDENCE, BESIDE THE CHAIN (2026-09-10). What has to hold:
 * a sealed row commits to its capture by digest and carries no
 * capture; the bytes the door serves hash to exactly that digest;
 * a row sealed before the digest (capture inline) is served by the
 * same door; the mutable round the current-week desks read keeps
 * its captures; and the chain still verifies.
 */

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function capture(host: string): WatchEvidenceCapture {
  return {
    challenge_bytes: btoa(JSON.stringify({ x402Version: 2, accepts: [{ network: "eip155:8453", payTo: `0x${host.length}` }] })),
    headers: { "content-type": "application/json", "www-authenticate": `Payment realm="${host}"` },
    body_sha256: "0".repeat(64),
    body_bytes: 12,
    body_truncated: false,
    tls: "unavailable-from-this-vantage",
  };
}

function round(week: string, hosts: WardHostResult[]): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  } as unknown as WardRound;
}

function probed(host: string): WardHostResult {
  return {
    host,
    url: `https://${host}/api`,
    verdict: "ready",
    failed: [],
    advisories: [],
    observed_at: new Date().toISOString(),
    offer: { pay_to: [`0x${host.length}`] },
    evidence: capture(host),
    latency_ms: 40,
  } as unknown as WardHostResult;
}

function unreachable(host: string): WardHostResult {
  return { host, url: `https://${host}/api`, verdict: "unreachable", failed: [], advisories: [] } as unknown as WardHostResult;
}

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

async function seed(week: string, hosts: WardHostResult[]): Promise<void> {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(week, hosts)));
}

beforeEach(async () => {
  for (const prefix of [KV_KEYS.corpusPrefix, KV_KEYS.corpusDerivedPrefix]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  forgetResolvedChain();
});

describe("a row sealed with its evidence detached", () => {
  it("carries the digest where the capture sat, and no capture", async () => {
    expect(testEnv.CORPUS_R2, "the suite binds the bucket; without it this test proves nothing").toBeDefined();
    await seed("2026-W40", [probed("alpha.example"), probed("beta.example"), unreachable("gone.example")]);
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken).toBe(true);
    if (!pass.taken) return;
    const rows = pass.record.snapshot.round.hosts;
    const alpha = rows.find((row) => row.host === "alpha.example")!;
    expect(alpha.evidence).toBeUndefined();
    expect(alpha.evidence_digest?.sha256).toBe(await sha256Hex(jcsCanonicalize(capture("alpha.example"))));
    expect(alpha.evidence_digest?.bytes).toBe(new TextEncoder().encode(jcsCanonicalize(capture("alpha.example"))).length);
    // In place: the key order of the row is the order the probe wrote, with the digest where the capture was.
    const keys = Object.keys(alpha);
    expect(keys.indexOf("evidence_digest")).toBeGreaterThan(keys.indexOf("offer"));
    expect(keys.indexOf("evidence_digest")).toBeLessThan(keys.indexOf("latency_ms"));
    // An unreachable door has nothing to commit to.
    const gone = rows.find((row) => row.host === "gone.example")!;
    expect(gone.evidence).toBeUndefined();
    expect(gone.evidence_digest).toBeUndefined();
    // The shard holds the capture, addressed by host.
    const shard = await testEnv.CORPUS_R2!.get(evidenceShardKey(1, await evidenceShardOf("alpha.example")));
    expect(shard).not.toBeNull();
    expect((JSON.parse(await shard!.text()) as Record<string, unknown>)["alpha.example"]).toEqual(capture("alpha.example"));
    // The chain still recomputes over the sealed rows.
    expect(await verifyCorpusChain(testEnv)).toMatchObject({ intact: true, entries: 1 });
    // The snapshot is the size of its facts now, not its captures.
    expect(JSON.stringify(pass.record).includes(capture("alpha.example").challenge_bytes!)).toBe(false);
  });

  it("leaves the mutable round's captures where the current-week desks read them", async () => {
    await seed("2026-W40", [probed("alpha.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const live = await latestWardRound(testEnv);
    expect(live?.hosts[0]?.evidence).toEqual(capture("alpha.example"));
    expect(live?.hosts[0]?.evidence_digest).toBeUndefined();
  });

  it("does not write a shard on an idempotent re-fire", async () => {
    await seed("2026-W40", [probed("alpha.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const again = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(again.taken).toBe(false);
    const listed = await testEnv.CORPUS_R2!.list({ prefix: "corpus/2/evidence/" });
    expect(listed.objects.length).toBe(0);
  });
});

describe("the evidence door", () => {
  it("serves the bytes the signed digest commits to, canonical, immutable", async () => {
    await seed("2026-W40", [probed("alpha.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const response = await SELF.fetch(`${BASE}/corpus/1/evidence/alpha.example.json`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const entry = await getCorpusEntry(testEnv, 1);
    const signed = entry!.snapshot.round.hosts[0]!.evidence_digest!.sha256;
    expect(await sha256Hex(body)).toBe(signed);
    expect(body).toBe(jcsCanonicalize(capture("alpha.example")));
    expect(response.headers.get("X-Evidence-SHA256")).toBe(signed);
    expect(response.headers.get("X-Evidence-Sealed-As")).toBe("digest");
    expect(response.headers.get("ETag")).toBe(`"${signed}"`);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(JSON.parse(body)).toEqual(capture("alpha.example"));
  });

  it("serves a row sealed before the digest from the capture inside the signed bytes", async () => {
    // A legacy record, written the old way: the capture inline.
    const legacy = round("2026-W30", [probed("old.example")]);
    const snapshot = { version: 1 as const, sequence: 1, taken_at: new Date().toISOString(), previous_digest: null, source: "ward_round" as const, week: "2026-W30", round: legacy };
    await putCorpusRecord(testEnv, { snapshot, digest: "f".repeat(64), signature: "sig", public_key: "key" });
    forgetResolvedChain();
    const response = await SELF.fetch(`${BASE}/corpus/1/evidence/old.example.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Evidence-Sealed-As")).toBe("inline");
    expect(await response.text()).toBe(jcsCanonicalize(capture("old.example")));
  });

  it("says why when there is nothing to serve", async () => {
    await seed("2026-W40", [probed("alpha.example"), unreachable("gone.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const missing = await SELF.fetch(`${BASE}/corpus/1/evidence/nobody.example.json`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { reason: string }).reason).toBe("host_not_in_round");
    const gone = await SELF.fetch(`${BASE}/corpus/1/evidence/gone.example.json`);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { reason: string }).reason).toBe("no_evidence_on_row");
    const noEntry = await SELF.fetch(`${BASE}/corpus/9/evidence/alpha.example.json`);
    expect(noEntry.status).toBe(404);
  });

  it("refuses bytes that do not recompute to the signed digest", async () => {
    await seed("2026-W40", [probed("alpha.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const key = evidenceShardKey(1, await evidenceShardOf("alpha.example"));
    const shard = JSON.parse(await (await testEnv.CORPUS_R2!.get(key))!.text()) as Record<string, WatchEvidenceCapture>;
    shard["alpha.example"]!.body_bytes = 13;
    await testEnv.CORPUS_R2!.put(key, JSON.stringify(shard));
    const response = await SELF.fetch(`${BASE}/corpus/1/evidence/alpha.example.json`);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { signed_sha256: string; computed_sha256: string };
    expect(body.signed_sha256).not.toBe(body.computed_sha256);
  });

  it("is what the latest entry and the fresh set stand on", async () => {
    await seed("2026-W40", [probed("alpha.example")]);
    await takeCorpusSnapshot(testEnv, okCalendar);
    const latest = await latestCorpusEntry(testEnv);
    expect(latest?.snapshot.round.hosts[0]?.evidence_digest).toBeDefined();
    const fresh = await SELF.fetch(`${BASE}/fresh-set`, { headers: { Accept: "application/json" } });
    expect(fresh.status).toBe(200);
    const set = (await fresh.json()) as { week: string; evidence: { corpus_sequence: number | null } };
    expect(set.week).toBe("2026-W40");
    expect(set.evidence.corpus_sequence).toBe(1);
  });
});
