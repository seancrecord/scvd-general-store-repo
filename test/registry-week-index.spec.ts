import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { forgetResolvedRecords } from "@/services/corpus-list";
import { unpublishedCorpusWeeks } from "@/services/registry-pulse";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const bucket = testEnv.CORPUS_R2!;
const key = (n: number) => `${KV_KEYS.corpusPrefix}${String(n).padStart(9, "0")}`;

async function seed(n: number, week: string, exists = true) {
  const r2Key = `week-index/${n}.json`;
  await testEnv.COUNTERS.put(key(n), JSON.stringify({
    pointer: true, sequence: n, week, r2_key: r2Key,
    digest: `digest-${n}`, signature: "sig", public_key: "pk",
  }));
  if (exists) await bucket.put(r2Key, JSON.stringify({ snapshot: { sequence: n, week } }));
  else await bucket.delete(r2Key);
}

function countedEnv() {
  const reads: string[] = [];
  const heads: string[] = [];
  const proxy = new Proxy(bucket, {
    get(target, prop) {
      if (prop === "get") return (...args: Parameters<typeof bucket.get>) => {
        reads.push(String(args[0]));
        return bucket.get(...args);
      };
      if (prop === "head") return (name: string) => {
        heads.push(name);
        return bucket.head(name);
      };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { env: { ...testEnv, CORPUS_R2: proxy }, reads, heads };
}

beforeEach(async () => {
  forgetResolvedRecords();
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const entry of listed.keys) await testEnv.COUNTERS.delete(entry.name);
  await testEnv.COUNTERS.delete(KV_KEYS.registryPulse);
});

describe("registry backfill discovery reads metadata, not archived bodies", () => {
  it("lists unpublished weeks without downloading any historical report", async () => {
    await seed(1, "2026-W40");
    await seed(2, "2026-W41");
    await testEnv.COUNTERS.put(KV_KEYS.registryPulse, JSON.stringify({ version: 1, weeks: [{ week: "2026-W40" }] }));
    const counted = countedEnv();
    expect(await unpublishedCorpusWeeks(counted.env)).toEqual(["2026-W41"]);
    expect(counted.reads).toEqual([]);
    expect(counted.heads).toEqual(["week-index/2.json"]);
  });

  it("keeps one candidate per week and excludes missing archive objects", async () => {
    await seed(1, "2026-W40");
    await seed(2, "2026-W40");
    await seed(3, "2026-W41", false);
    const counted = countedEnv();
    expect(await unpublishedCorpusWeeks(counted.env)).toEqual(["2026-W40"]);
    expect(counted.reads).toEqual([]);
  });

  it("retains legacy inline records without needing an R2 bucket", async () => {
    await testEnv.COUNTERS.put(key(1), JSON.stringify({ snapshot: { sequence: 1, week: "2026-W39" } }));
    expect(await unpublishedCorpusWeeks({ ...testEnv, CORPUS_R2: undefined })).toEqual(["2026-W39"]);
  });

  it("surfaces failed object checks instead of declaring no weeks missing", async () => {
    await seed(1, "2026-W40");
    const unavailable = new Proxy(bucket, {
      get(target, prop) {
        if (prop === "head") return async () => { throw new Error("archive unavailable"); };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(unpublishedCorpusWeeks({ ...testEnv, CORPUS_R2: unavailable })).rejects.toThrow("archive unavailable");
  });

  it("refuses to call an incomplete index a complete week list", async () => {
    await seed(1, "2026-W40");
    const incomplete = new Proxy(testEnv.COUNTERS, {
      get(target, prop) {
        if (prop === "list") return async () => ({ keys: [{ name: key(1) }], list_complete: false });
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(unpublishedCorpusWeeks({ ...testEnv, COUNTERS: incomplete })).rejects.toThrow("incomplete");
  });
});
