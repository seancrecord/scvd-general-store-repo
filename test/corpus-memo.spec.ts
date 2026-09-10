import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  forgetResolvedRecords,
  listCorpus,
  resolvedRecordCount,
} from "@/services/corpus-list";
import type { Env } from "@/types";

/**
 * THE RESOLVED RECORDS, REMEMBERED (2026-09-10). A host page cost one
 * R2 get per corpus record on every request; a crawler walking the
 * 2,900 host pages paid that 2,900 times for bytes the chain says
 * cannot change. What this file holds: the second listCorpus in an
 * isolate touches R2 not at all; a pointer whose digest changed is
 * resolved again rather than served from memory; forgetting empties
 * the memo; and a pointer to a missing object is never remembered as
 * anything.
 */
const testEnv = env as unknown as Env;
/** The bucket, asserted once: a memo test with no R2 has nothing to remember. */
const R2 = testEnv.CORPUS_R2 as NonNullable<Env["CORPUS_R2"]>;
const key = (n: number) => `${KV_KEYS.corpusPrefix}${String(n).padStart(9, "0")}`;

function record(sequence: number, digest: string) {
  return {
    snapshot: { sequence, week: `2026-W${30 + sequence}`, prev_digest: null, entries: [] },
    digest,
    signature: "sig",
    public_key: "pk",
  };
}

function pointer(sequence: number, digest: string, r2Key: string) {
  return {
    pointer: true,
    sequence,
    week: `2026-W${30 + sequence}`,
    digest,
    signature: "sig",
    public_key: "pk",
    r2_key: r2Key,
  };
}

/** An env whose R2 counts its gets and otherwise reads the real bucket. */
function countingEnv(): { env: Env; gets: () => number } {
  let count = 0;
  const r2 = R2;
  const counting = new Proxy(r2, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return (...args: Parameters<typeof r2.get>) => {
          count += 1;
          return r2.get(...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { env: { ...testEnv, CORPUS_R2: counting } as Env, gets: () => count };
}

describe("the resolved records are remembered per isolate", () => {
  beforeEach(async () => {
    forgetResolvedRecords();
    const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
    for (const item of listed.keys) await testEnv.COUNTERS.delete(item.name);
    await R2.put("memo/1.json", JSON.stringify(record(1, "d1")));
    await R2.put("memo/2.json", JSON.stringify(record(2, "d2")));
    await testEnv.COUNTERS.put(key(1), JSON.stringify(pointer(1, "d1", "memo/1.json")));
    await testEnv.COUNTERS.put(key(2), JSON.stringify(pointer(2, "d2", "memo/2.json")));
  });

  it("resolves every pointer once, then never again in the same isolate", async () => {
    const { env: counted, gets } = countingEnv();
    const first = await listCorpus(counted);
    expect(first.map((r) => r.snapshot.sequence)).toEqual([1, 2]);
    expect(gets()).toBe(2);
    expect(resolvedRecordCount()).toBe(2);

    const second = await listCorpus(counted);
    expect(second.map((r) => r.digest)).toEqual(["d1", "d2"]);
    expect(gets(), "the second read paid R2 for bytes the chain says cannot change").toBe(2);
  });

  it("a new week's record is resolved once and joins the memo", async () => {
    const { env: counted, gets } = countingEnv();
    await listCorpus(counted);
    await R2.put("memo/3.json", JSON.stringify(record(3, "d3")));
    await testEnv.COUNTERS.put(key(3), JSON.stringify(pointer(3, "d3", "memo/3.json")));
    const records = await listCorpus(counted);
    expect(records.map((r) => r.snapshot.sequence)).toEqual([1, 2, 3]);
    expect(gets()).toBe(3);
    expect(resolvedRecordCount()).toBe(3);
  });

  it("a pointer rewritten to a different digest misses the memo rather than serving the old record", async () => {
    const { env: counted, gets } = countingEnv();
    await listCorpus(counted);
    await R2.put("memo/2.json", JSON.stringify(record(2, "d2-resealed")));
    await testEnv.COUNTERS.put(key(2), JSON.stringify(pointer(2, "d2-resealed", "memo/2.json")));
    const records = await listCorpus(counted);
    expect(records.find((r) => r.snapshot.sequence === 2)?.digest).toBe("d2-resealed");
    expect(gets()).toBe(3);
  });

  it("remembers nothing for a pointer whose object is gone, and forgets on request", async () => {
    await R2.delete("memo/2.json");
    const { env: counted, gets } = countingEnv();
    const records = await listCorpus(counted);
    expect(records.map((r) => r.snapshot.sequence)).toEqual([1]);
    expect(resolvedRecordCount()).toBe(1);
    // The gap is asked about again every time, never remembered as absent.
    await listCorpus(counted);
    expect(gets()).toBe(3);
    forgetResolvedRecords();
    expect(resolvedRecordCount()).toBe(0);
  });
});
