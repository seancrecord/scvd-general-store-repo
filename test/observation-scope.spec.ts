import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { deriveWelcomes, draftWelcome } from "@/services/outreach";
import { issuePassport } from "@/services/passport";
import { subjectHistory } from "@/services/subject-history";
import { freshRows } from "@/services/fresh-set";
import { passportCard } from "@/pages/passport-card";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = testEnv.STORE_BASE_URL;
const OBSERVED = "2026-09-01T10:11:12.000Z";
const SEALED = "2026-09-05T17:00:00.000Z";
const NOW = new Date("2026-09-06T00:00:00.000Z");
const HOST = "scope.example";
const URL = `https://${HOST}/api/image?size=small`;
function door(extra: Partial<WardHostResult> = {}): WardHostResult {
  return { host: HOST, url: URL, verdict: "ready", failed: [], advisories: [],
    observed_at: OBSERVED, probe_method: "GET", source: "discovery",
    evidence: { challenge_bytes: "e30=", headers: {}, body_sha256: null, body_bytes: 0,
      body_truncated: false, tls: "unavailable-from-this-vantage" }, ...extra };
}
function round(row: WardHostResult): WardRound {
  return { week: "2026-W36", at: SEALED, hosts: [row], listed_resources: 1,
    coverage_suspect: false, capped: false, our_search_presence: true };
}
async function seed(row: WardHostResult) {
  await testEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify({
    snapshot: { version: 1, sequence: 1, taken_at: SEALED, previous_digest: null,
      source: "ward_round", week: "2026-W36", round: round(row) },
    digest: "0".repeat(64), signature: "0".repeat(128), public_key: "0".repeat(64),
  }));
}
beforeEach(async () => {
  const keys = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(keys.keys.map(key => testEnv.COUNTERS.delete(key.name)));
  await testEnv.COUNTERS.delete(KV_KEYS.passportRefresh(HOST));
});

describe("the scope an operator can check", () => {
  it("dates the welcome by the request, names the method and separates money and delivery", () => {
    const text = draftWelcome(deriveWelcomes(round(door()), null)[0]!, BASE);
    expect(text).toContain(OBSERVED);
    expect(text).toContain("GET");
    expect(text).toContain(URL);
    expect(text).toContain("unpaid payment challenge");
    expect(text).toContain("Paid settlement and successful delivery were not tested");
    expect(text).not.toContain("a payable 402");
  });

  it("does not turn a seal date into a request date in the welcome, routing row or passport", async () => {
    const legacy = door({ observed_at: undefined, probe_method: undefined });
    await seed(legacy);
    const text = draftWelcome(deriveWelcomes(round(legacy), null)[0]!, BASE);
    expect(text).toContain("request time unknown");
    expect(text).not.toContain("On 2026-09-05");
    expect(text).toContain("method not recorded");
    expect(freshRows(round(legacy), BASE)[0]!.observed_at).toBeNull();
    const history = await subjectHistory(testEnv, HOST, BASE, NOW);
    expect(history.first_observed).toBeNull();
    expect(history.last_observed).toBeNull();
    expect(history.timeline[0]!.taken_at).toBe(SEALED);
    expect(await issuePassport(testEnv, HOST, NOW)).toMatchObject({
      issued: false, reason: "observation-undated",
    });
  });

  it("puts exact request and evidence links beside explicit unpaid scope, even with no modules", async () => {
    await seed(door());
    const result = await issuePassport(testEnv, HOST, NOW);
    expect(result.issued).toBe(true);
    if (!result.issued) throw new Error("passport missing");
    const { payload } = result.passport;
    expect(payload.modules).toEqual([]);
    expect(payload.summary).toMatchObject({ observation: {
      url: URL, method: "GET", evidence_url: `${BASE}/corpus/1/evidence/${HOST}.json`,
      source_url: `${BASE}/corpus/1.json`,
    } });
    expect(payload.summary.not_observed.join(" ")).toContain("Paid settlement");
    expect(payload.summary.not_observed.join(" ")).toContain("Successful delivery");
    const html = passportCard(result.passport);
    expect(html).toContain("GET");
    expect(html).toContain(URL);
    expect(html).toContain(`/corpus/1/evidence/${HOST}.json`);
    expect(html).toContain("Paid settlement");
    expect(html).toContain("Successful delivery");
    expect(result.passport.signed_payload).toContain('"observation"');
  });

  it("does not invent a method or raw capture for a legacy row", async () => {
    await seed(door({ probe_method: undefined, evidence: undefined }));
    const result = await issuePassport(testEnv, HOST, NOW);
    if (!result.issued) throw new Error("passport missing");
    expect(result.passport.payload.summary).toMatchObject({ observation: {
      url: URL, method: null, evidence_url: null,
    } });
    const html = passportCard(result.passport);
    expect(html).toContain("method not recorded");
    expect(html).toContain("raw challenge not retained");
  });
});

describe("date and source boundaries", () => {
  it("keeps a newer undated row unknown instead of borrowing an older request date", async () => {
    await seed(door());
    const key = `${KV_KEYS.corpusPrefix}000000001`;
    const original = (await testEnv.COUNTERS.get(key))!;
    const next = JSON.parse(original);
    next.snapshot.sequence = 2;
    next.snapshot.week = next.snapshot.round.week = "2026-W37";
    delete next.snapshot.round.hosts[0].observed_at;
    await testEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000002`, JSON.stringify(next));
    const history = await subjectHistory(testEnv, HOST, BASE, NOW);
    expect(history.first_observed).toBe(OBSERVED);
    expect(history.last_observed).toBeNull();
    expect(await issuePassport(testEnv, HOST, NOW)).toMatchObject({ issued: false, reason: "observation-undated" });
    expect(await testEnv.COUNTERS.get(key)).toBe(original);
  });

  it("a refresh supplies its own request and never inherits the census capture", async () => {
    await seed(door());
    await testEnv.COUNTERS.put(KV_KEYS.passportRefresh(HOST), JSON.stringify({
      artifact: "passport_refresh", host: HOST, url: `https://${HOST}/api/speech`,
      observed_at: SEALED, probe_method: "POST", verdict: "ready", failed: [], advisories: [],
    }));
    const result = await issuePassport(testEnv, HOST, NOW);
    if (!result.issued) throw new Error("refresh missing");
    expect(result.passport.payload.summary).toMatchObject({ observed_at: SEALED,
      observation: { url: `https://${HOST}/api/speech`, method: "POST", source_url: null, evidence_url: null } });
  });

  it("an older refresh cannot turn an undated later archive into fresh evidence", async () => {
    await seed(door({ observed_at: undefined }));
    await testEnv.COUNTERS.put(KV_KEYS.passportRefresh(HOST), JSON.stringify({
      artifact: "passport_refresh", host: HOST, url: URL,
      observed_at: OBSERVED, verdict: "ready", failed: [], advisories: [],
    }));
    expect(await issuePassport(testEnv, HOST, NOW)).toMatchObject({ issued: false, reason: "observation-undated" });
  });
});

describe("citations preserve the same date boundary", () => {
  it("never dates an undated host citation from the snapshot, while the snapshot keeps its own date", async () => {
    const { citeRow } = await import("@/services/cite");
    const source = { host: HOST, week: "2026-W36", sequence: 1, taken_at: SEALED,
      digest: "0".repeat(64), entry_url: `${BASE}/corpus/1.json` };
    const citation = citeRow(BASE, source);
    expect(citation.json.observed_at).toBeNull();
    expect(citation.text).toContain("observation date not stated");
    expect(citation.text).not.toContain(SEALED);
    expect(citeRow(BASE, { ...source, host: undefined }).json.observed_at).toBe(SEALED);
  });
});
