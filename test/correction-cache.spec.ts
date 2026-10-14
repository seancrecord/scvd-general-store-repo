import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invertedTimestamp } from "@/lib/kv-keys";
import { EVENT_PREFIX_DIGITS, EVENT_TTL_SECONDS } from "@/lib/event-range";
import * as channel from "@/lib/channel";
import * as bulk from "@/lib/kv-bulk";
import type { MetricEvent } from "@/lib/metrics";
import { readCorrections, recomputeCorrections } from "@/services/reclassify";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const REAL_NOW = Date.now();
const NOW = new Date("2026-10-07T12:00:00.000Z");
let sequence = 0;
const run = (readBudget?: number, now = NOW) => recomputeCorrections(bindings, now, { cache: true, readBudget });
const prefixOf = (name: string) => name.slice(0, "evt:".length + EVENT_PREFIX_DIGITS);
async function row(offset: number, partial: Partial<MetricEvent> = {}, expiration?: number) {
  const name = `evt:${invertedTimestamp(NOW.getTime() - offset)}:${String(sequence++).padStart(6, "0")}`;
  const event: MetricEvent = { kind: "challenge", house: false, channel: "direct", item: "hello",
    at: "2026-10-07T10:00:00.000Z", user_agent: "buyer", ...partial };
  await bindings.COUNTERS.put(name, JSON.stringify(event), expiration ? { expiration } : undefined);
  return name;
}
async function scan() { return (await readCorrections(bindings))!.scan!; }

beforeEach(async () => {
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  let cursor: string | undefined;
  do {
    const listed = await bindings.COUNTERS.list({ prefix: "evt:", limit: 1000, ...(cursor ? { cursor } : {}) });
    await Promise.all(listed.keys.map(k => bindings.COUNTERS.delete(k.name)));
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);
  const objects = await bindings.CORPUS_R2!.list({ prefix: "internal/correction-pages/" });
  await Promise.all(objects.objects.map(o => bindings.CORPUS_R2!.delete(o.key)));
  await bindings.COUNTERS.delete("metric:corrections");
  await bindings.CORPUS_R2!.delete("internal/correction-page-cleanup.json");
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("standing correction input cache", () => {
  it("does not fetch cache pages a complete inventory says are absent", async () => {
    await row(0); await row(30_000_000); await row(60_000_000);
    const get = vi.spyOn(bindings.CORPUS_R2!, "get");
    await run(1);
    expect(get.mock.calls.filter(([key]) => key.startsWith("internal/correction-pages/"))).toHaveLength(0);
    expect(await scan()).toMatchObject({ kv_keys_read: 1, cached_pages: 0, complete: false });
    get.mockClear();
    await run(1);
    expect(get.mock.calls.filter(([key]) => key.startsWith("internal/correction-pages/"))).toHaveLength(1);
    expect(await scan()).toMatchObject({ kv_keys_read: 1, cached_pages: 1, complete: false });
    get.mockClear();
    expect((await run(1))[0]).toMatchObject({ recorded_organic: 3, complete: true });
    expect(get.mock.calls.filter(([key]) => key.startsWith("internal/correction-pages/"))).toHaveLength(2);
  });

  it.each(["truncated", "continuation"])("does not infer missing cache pages from a %s cleanup listing", async (kind) => {
    await row(0);
    await run();
    const bucket = bindings.CORPUS_R2!;
    const page = await bucket.list({ prefix: "internal/correction-pages/" });
    if (kind === "continuation") await bucket.put("internal/correction-page-cleanup.json", JSON.stringify({ cursor: "continuation" }));
    vi.spyOn(bucket, "list").mockResolvedValue(kind === "truncated"
      ? { ...page, objects: [], truncated: true, cursor: "next" }
      : { ...page, objects: [], truncated: false });
    expect((await run(0))[0]).toMatchObject({ recorded_organic: 1, complete: true });
    expect(await scan()).toMatchObject({ kv_keys_read: 0, cached_pages: 1, complete: true });
  });

  it("matches the full recount across slices, including late events, then reads zero KV event values", async () => {
    // Key times span several slices; event times form one cross-slice walk.
    for (let n = 0; n < 4; n++) await row(n * 20_000_000, {
      item: `door-${n}`, user_agent: "node", at: new Date(NOW.getTime() - n * 10_000).toISOString(),
    });
    await row(1, { user_agent: "SentinelOracle/0.1" });
    await row(2, { user_agent: "buyer" });
    await row(3, { house: true });
    await row(4, { kind: "porch" });
    await row(5, { channel: "infrastructure" });
    const reference = await recomputeCorrections(bindings, NOW);
    expect(await run()).toEqual(reference);
    expect(await scan()).toMatchObject({ kv_keys_read: 9, complete: true });
    const get = vi.spyOn(bindings.COUNTERS, "get");
    expect(await run()).toEqual(reference);
    expect(get.mock.calls.flatMap(([keys]) => [keys].flat()).filter(k => k.startsWith("evt:"))).toEqual([]);
    expect(await scan()).toMatchObject({ kv_keys_read: 0, complete: true });
  });

  it("finds a walk split across KV pages and separate warm-up passes", async () => {
    const doors = new Map([[0, "one"], [999, "two"], [1000, "three"], [1001, "four"]]);
    await Promise.all(Array.from({ length: 1002 }, (_, n) => row(n, doors.has(n)
      ? { item: doors.get(n)!, user_agent: "node", at: new Date(NOW.getTime() - n * 10).toISOString() }
      : { kind: "porch" })));
    expect((await run(1000))[0]?.complete).toBe(false);
    expect((await scan()).kv_keys_read).toBe(1000);
    const reference = await recomputeCorrections(bindings, NOW);
    expect(await run(1000)).toEqual(reference);
    expect((await scan()).kv_keys_read).toBe(2);
    expect(reference[0]?.moved_by_behaviour).toBe(4);
  });

  it("reuses the same keys when KV moves page boundaries and inserts an empty continuation", async () => {
    const names = (await Promise.all(Array.from({ length: 1002 }, (_, n) => row(n)))).sort();
    await run(1000);
    const reference = await run(1000);
    expect((await scan()).complete).toBe(true);
    const prefix = prefixOf(names[0]!);
    expect(new Set(names.map(prefixOf)).size).toBe(1);
    const list = bindings.COUNTERS.list.bind(bindings.COUNTERS);
    vi.spyOn(bindings.COUNTERS, "list").mockImplementation(async options => {
      if (options?.prefix !== prefix) return list(options);
      if (!options.cursor) return { keys: names.slice(0, 400).map(name => ({ name })),
        list_complete: false, cursor: "empty", cacheStatus: null };
      if (options.cursor === "empty") return { keys: [],
        list_complete: false, cursor: "rest", cacheStatus: null };
      return { keys: names.slice(400).map(name => ({ name })), list_complete: true, cacheStatus: null };
    });
    expect(await run(0)).toEqual(reference);
    expect(await scan()).toMatchObject({ kv_keys_read: 0, cached_pages: 2, complete: true });
  });

  it("does not cache an unfinished short page when empty continuations exhaust the list budget", async () => {
    const name = await row(0);
    const prefix = prefixOf(name);
    const list = bindings.COUNTERS.list.bind(bindings.COUNTERS);
    vi.spyOn(bindings.COUNTERS, "list").mockImplementation(async options => {
      if (options?.prefix !== prefix) return list(options);
      return { keys: options.cursor ? [] : [{ name }],
        list_complete: false, cursor: "more", cacheStatus: null };
    });
    await run();
    expect(await scan()).toMatchObject({ kv_keys_read: 0, complete: false });
    expect((await bindings.CORPUS_R2!.list({ prefix: "internal/correction-pages/" })).objects).toEqual([]);
  });

  it("removes cache objects after their last source row expires", async () => {
    const key = "internal/correction-pages/v1/old/0";
    await bindings.CORPUS_R2!.put(key, "{}", { customMetadata: { expires: String(NOW.getTime() - 1) } });
    await run();
    expect(await bindings.CORPUS_R2!.get(key)).toBeNull();
  });

  it("reapplies changed classification rules to cached raw inputs", async () => {
    await row(0, { referrer: "https://example.com/", declared_source: "client" });
    expect((await run())[0]?.corrected_organic).toBe(1);
    vi.spyOn(channel, "inferChannel").mockReturnValue("infrastructure");
    expect((await run())[0]).toMatchObject({ corrected_organic: 0, moved_to_infrastructure: 1 });
    expect((await scan()).kv_keys_read).toBe(0);
  });

  it("invalidates only changed slices and removes deleted rows", async () => {
    const old = await row(30_000_000);
    await row(0);
    await run();
    await row(1);
    expect((await run())[0]?.recorded_organic).toBe(3);
    expect((await scan()).kv_keys_read).toBe(2);
    await bindings.COUNTERS.delete(old);
    expect((await run())[0]?.recorded_organic).toBe(2);
    expect((await scan()).kv_keys_read).toBe(0);
  });

  it("rebuilds walk qualification when a qualifying touch disappears", async () => {
    const keys: string[] = [];
    for (let n = 0; n < 4; n++) keys.push(await row(n * 20_000_000, {
      item: `door-${n}`, user_agent: "node", at: new Date(NOW.getTime() - n * 10_000).toISOString(),
    }));
    expect((await run())[0]?.moved_by_behaviour).toBe(4);
    await bindings.COUNTERS.delete(keys[0]!);
    expect((await run())[0]).toMatchObject({ moved_by_behaviour: 0, corrected_organic: 3, complete: true });
    expect((await scan()).kv_keys_read).toBe(0);
  });

  it("makes progress within its budget and withholds a partial correction", async () => {
    await row(0); await row(1); await row(30_000_000); await row(30_000_001);
    expect((await run(2))[0]?.complete).toBe(false);
    expect(await scan()).toMatchObject({ kv_keys_read: 2, complete: false });
    expect((await run(2))[0]).toMatchObject({ recorded_organic: 4, complete: true });
    expect(await scan()).toMatchObject({ kv_keys_read: 2, complete: true });
  });

  it("resumes after an R2 write failure without publishing or rereading saved pages", async () => {
    await row(0); await row(30_000_000);
    const put = bindings.CORPUS_R2!.put.bind(bindings.CORPUS_R2!);
    const spy = vi.spyOn(bindings.CORPUS_R2!, "put").mockImplementationOnce(put)
      .mockImplementationOnce(put).mockRejectedValueOnce(new Error("cache write failed"));
    await expect(run()).rejects.toThrow("cache write failed");
    expect(await readCorrections(bindings)).toBeNull();
    spy.mockRestore();
    expect((await run())[0]?.recorded_organic).toBe(2);
    expect((await scan()).kv_keys_read).toBe(1);
  });

  it("does not cache a listed row that cannot yet be read", async () => {
    const name = await row(0);
    const spy = vi.spyOn(bulk, "bulkGetJson").mockResolvedValueOnce(new Map([[name, null]]));
    await run();
    expect((await scan()).complete).toBe(false);
    spy.mockRestore();
    expect((await run())[0]).toMatchObject({ recorded_organic: 1, complete: true });
    expect((await scan()).kv_keys_read).toBe(1);
    expect(await bindings.COUNTERS.get(name)).not.toBeNull();
  });

  it("does not retain expired evidence or call a partly expired month complete", async () => {
    // The page fingerprint carries absolute expiration. Advancing the scan's
    // clock tests exclusion even if a KV listing has not dropped the key yet.
    const expiration = Math.ceil((REAL_NOW + 86400_000) / 1000);
    await row(0, {}, expiration);
    await row(1, { at: "2026-07-31T12:00:00.000Z" });
    await run();
    const result = await run(undefined, new Date(expiration * 1000 + 60_000));
    expect(result.find(r => r.month === "2026-10")).toBeUndefined();
    expect(result.find(r => r.month === "2026-07")).toMatchObject({ recorded_organic: 1, complete: false });
    expect(EVENT_TTL_SECONDS).toBe(90 * 86400);
  });
});
