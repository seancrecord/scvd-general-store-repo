import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  sealStoredWeek,
  takeCorpusSnapshot,
  unsealedStoredWeeks,
  verifyCorpusChain,
} from "@/services/corpus";
import { publishRegistryWeekFromCorpus, readRegistryPulse } from "@/services/registry-pulse";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE MISSED WEEKS, SEALED IN ORDER (2026-11-16). W44–W46 each ran
 * their round and stored it under `ward:<week>`; none reached the
 * chain, and the latest-round press could only ever reach W46. The
 * stored-week press seals the OLDEST waiting week and refuses any
 * other, because an append-only chain that takes W45 first can never
 * take W44. Then the running tally publishes W44 from the corpus by
 * the path it already had.
 */

function round(week: string, at: string): WardRound {
  return {
    week,
    at,
    listed_resources: 2,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [0, 1].map((index) => ({
      host: `service-${index}.example`,
      url: `https://service-${index}.example/api/x`,
      verdict: "ready",
      failed: [],
      advisories: [],
    })) as unknown as WardRound["hosts"],
  };
}

async function store(week: string, at: string, latest = false): Promise<void> {
  const body = JSON.stringify(round(week, at));
  await testEnv.COUNTERS.put(KV_KEYS.wardRound(week), body);
  if (latest) await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, body);
}

async function clearPrefix(prefix: string): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
}

const calendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

beforeEach(async () => {
  await clearPrefix(KV_KEYS.corpusPrefix);
  await clearPrefix(KV_KEYS.wardRoundPrefix);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.registryPulse);
});

describe("sealing the weeks the Sunday press missed", () => {
  it("lists the stored weeks past the chain's head, oldest first", async () => {
    await store("2026-W43", "2026-10-25T11:01:13.000Z", true);
    expect((await takeCorpusSnapshot(testEnv, calendar)).taken).toBe(true);
    await store("2026-W44", "2026-11-01T11:01:00.000Z");
    await store("2026-W45", "2026-11-08T11:01:00.000Z");
    await store("2026-W46", "2026-11-15T11:01:00.000Z", true);
    expect(await unsealedStoredWeeks(testEnv)).toEqual(["2026-W44", "2026-W45", "2026-W46"]);
  });

  it("refuses a later week while an earlier one waits, and seals the oldest", async () => {
    await store("2026-W43", "2026-10-25T11:01:13.000Z", true);
    await takeCorpusSnapshot(testEnv, calendar);
    await store("2026-W44", "2026-11-01T11:01:00.000Z");
    await store("2026-W45", "2026-11-08T11:01:00.000Z", true);

    const skipped = await sealStoredWeek(testEnv, "2026-W45", calendar);
    expect(skipped.taken).toBe(false);
    if (!skipped.taken) expect(skipped.reason).toContain("2026-W44");

    const sealed = await sealStoredWeek(testEnv, "2026-W44", calendar);
    expect(sealed.taken).toBe(true);
    if (sealed.taken) {
      expect(sealed.record.snapshot.sequence).toBe(2);
      expect(sealed.record.snapshot.week).toBe("2026-W44");
      // Dated when it was walked, not when it was rescued.
      expect(sealed.record.snapshot.round.at).toBe("2026-11-01T11:01:00.000Z");
    }
    expect((await sealStoredWeek(testEnv, "2026-W45", calendar)).taken).toBe(true);
    expect(await unsealedStoredWeeks(testEnv)).toEqual([]);

    const chain = await verifyCorpusChain(testEnv);
    expect(chain.intact).toBe(true);
    // The latest-round press now finds W45 already held: no duplicate.
    expect((await takeCorpusSnapshot(testEnv, calendar)).taken).toBe(false);
  });

  it("refuses a week with no stored round, and a malformed week", async () => {
    expect((await sealStoredWeek(testEnv, "2026-W44", calendar)).taken).toBe(false);
    expect((await sealStoredWeek(testEnv, "W44", calendar)).taken).toBe(false);
  });

  it("lets the running tally publish the sealed week from the corpus", async () => {
    await store("2026-W43", "2026-10-25T11:01:13.000Z", true);
    await takeCorpusSnapshot(testEnv, calendar);
    await store("2026-W44", "2026-11-01T11:01:00.000Z");
    // Before the seal the tally cannot reach W44: the corpus never held it.
    expect((await publishRegistryWeekFromCorpus(testEnv, "2026-W44")).ok).toBe(false);
    await sealStoredWeek(testEnv, "2026-W44", calendar);
    const published = await publishRegistryWeekFromCorpus(testEnv, "2026-W44");
    expect(published.ok).toBe(true);
    if (published.ok) expect(published.entry.observed_at).toBe("2026-11-01T11:01:00.000Z");
    expect((await readRegistryPulse(testEnv)).weeks.map((row) => row.week)).toContain("2026-W44");
  });
});


describe("snapshot publication observes the KV write limit", () => {
  afterEach(() => vi.restoreAllMocks());
  it("publishes before timestamping and never bursts the same pointer", async () => {
    await store("2026-W46", "2026-11-15T11:01:00.000Z", true);
    const times: number[] = [];
    let throttled = 0;
    const original = testEnv.COUNTERS.put.bind(testEnv.COUNTERS);
    vi.spyOn(testEnv.COUNTERS, "put").mockImplementation(async (key, value, options) => {
      if (key.startsWith(KV_KEYS.corpusPrefix)) {
        const at = Date.now();
        if (times.length && at - times.at(-1)! < 1000) {
          throttled++;
          throw new Error("KV PUT failed: 429 Too Many Requests");
        }
        times.push(at);
      }
      return original(key, value, options);
    });
    let publishedBeforeCalendar = false;
    await takeCorpusSnapshot(testEnv, { ...calendar, fetch: (async () => {
      publishedBeforeCalendar = times.length === 1;
      return new Response(new Uint8Array([1,2,3]));
    }) as typeof fetch });
    expect(publishedBeforeCalendar).toBe(true);
    expect(times).toHaveLength(2);
    expect(throttled, "retries must not conceal a same-key burst").toBe(0);
  });
});
