import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  latestCorpusEntry,
  listCorpus,
  takeCorpusSnapshot,
  verifyCorpusChain,
} from "@/services/corpus";
import { derivedFromCorpus, forgetResolvedRecords } from "@/services/corpus-list";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE CORPUS, READ ONCE (2026-09-10). Every derived surface re-read
 * and re-parsed the whole chain from R2 per request; the memos in
 * corpus-list.ts exist so that stops. What has to hold is not that
 * they are fast but that they are NEVER STALE: a chain that grows, or
 * a record whose stamp changes, must be a miss, and the latest-entry
 * read must agree with the full walk.
 */

function round(week: string, hosts = 2): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: hosts,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: Array.from({ length: hosts }, (_, index) => ({
      host: `service-${index}.example`,
      resources: 1,
      verdict: "answers",
    })) as unknown as WardRound["hosts"],
  };
}

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

async function freeze(week: string): Promise<void> {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(week)));
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

async function sweep(): Promise<void> {
  for (const prefix of [KV_KEYS.corpusPrefix, KV_KEYS.corpusDerivedPrefix]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  forgetResolvedRecords();
}

beforeEach(sweep);

describe("the resolved-chain memo", () => {
  it("answers the same chain twice and a grown chain freshly", async () => {
    await freeze("2026-W31");
    const first = await listCorpus(testEnv);
    const again = await listCorpus(testEnv);
    expect(again).toEqual(first);
    expect(again).not.toBe(first); // a copy, never the memo's own array

    await freeze("2026-W32");
    const grown = await listCorpus(testEnv);
    expect(grown.map((record) => record.snapshot.week)).toEqual(["2026-W31", "2026-W32"]);
  });

  it("sees a record whose pointer changed under the same sequence", async () => {
    await freeze("2026-W31");
    const before = await listCorpus(testEnv);
    expect(before[0]?.ots?.status).toBe("pending");

    // The stamp upgrades in place: same sequence, same digest, new
    // pointer bytes. A memo keyed on sequence and digest alone would
    // keep answering "pending".
    const [name] = (await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix })).keys.map((k) => k.name);
    const stored = await testEnv.COUNTERS.get(name!, "json") as Record<string, unknown>;
    stored.ots = { ...(stored.ots as object), status: "complete" };
    if (stored.pointer === true && testEnv.CORPUS_R2) {
      const object = await testEnv.CORPUS_R2.get(stored.r2_key as string);
      const full = JSON.parse(await object!.text()) as Record<string, unknown>;
      full.ots = stored.ots;
      await testEnv.CORPUS_R2.put(stored.r2_key as string, JSON.stringify(full));
    }
    await testEnv.COUNTERS.put(name!, JSON.stringify(stored));

    const after = await listCorpus(testEnv);
    expect(after[0]?.ots?.status).toBe("complete");
  });

  it("holds the chain verdict per chain state and re-walks a grown chain", async () => {
    await freeze("2026-W31");
    expect(await verifyCorpusChain(testEnv)).toMatchObject({ intact: true, entries: 1 });
    expect(await verifyCorpusChain(testEnv)).toMatchObject({ intact: true, entries: 1 });
    await freeze("2026-W32");
    expect(await verifyCorpusChain(testEnv)).toMatchObject({ intact: true, entries: 2 });
  });
});

describe("the latest entry", () => {
  it("is the newest sequence, with or without the memo warm", async () => {
    expect(await latestCorpusEntry(testEnv)).toBeNull();
    await freeze("2026-W31");
    await freeze("2026-W32");
    // Cold: no chain resolved in this isolate yet.
    forgetResolvedRecords();
    const cold = await latestCorpusEntry(testEnv);
    expect(cold?.snapshot.week).toBe("2026-W32");
    expect(cold?.snapshot.sequence).toBe(2);
    // Warm: agrees with the full walk's last element.
    const walked = await listCorpus(testEnv);
    const warm = await latestCorpusEntry(testEnv);
    expect(warm).toEqual(walked[walked.length - 1]);
  });
});

describe("a derivation kept in KV", () => {
  const versioned = (id: string): Env =>
    ({ ...testEnv, CF_VERSION_METADATA: { id, tag: "", timestamp: "" } }) as Env;

  it("builds once per chain state and version, and again when either moves", async () => {
    await freeze("2026-W31");
    let builds = 0;
    const weeks = (records: { snapshot: { week: string } }[]) => {
      builds += 1;
      return records.map((record) => record.snapshot.week);
    };
    expect(await derivedFromCorpus(versioned("v1"), "weeks", weeks)).toEqual(["2026-W31"]);
    forgetResolvedRecords();
    expect(await derivedFromCorpus(versioned("v1"), "weeks", weeks)).toEqual(["2026-W31"]);
    expect(builds).toBe(1);

    // A new deploy: the same chain is derived again under its own id.
    expect(await derivedFromCorpus(versioned("v2"), "weeks", weeks)).toEqual(["2026-W31"]);
    expect(builds).toBe(2);

    // A grown chain: a miss under both ids.
    await freeze("2026-W32");
    expect(await derivedFromCorpus(versioned("v1"), "weeks", weeks)).toEqual(["2026-W31", "2026-W32"]);
    expect(builds).toBe(3);

    const kept = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusDerivedPrefix });
    expect(kept.keys.length).toBe(3);
  });

  it("skips KV entirely without a version id", async () => {
    await freeze("2026-W31");
    // The pool binds a version id from wrangler.jsonc; a Worker that
    // does not declare the binding (the doors Worker) sees none.
    const { CF_VERSION_METADATA: _unbound, ...unversioned } = testEnv;
    let builds = 0;
    const count = () => {
      builds += 1;
      return builds;
    };
    expect(await derivedFromCorpus(unversioned as Env, "count", count)).toBe(1);
    expect(await derivedFromCorpus(unversioned as Env, "count", count)).toBe(2);
    const kept = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusDerivedPrefix });
    expect(kept.keys.length).toBe(0);
  });
});
