import { describe, expect, it } from "vitest";
import { recomputeIncrementalCorrections as recomputeCorrections, readCorrections } from "@/services/reclassify";
import { invertedTimestamp } from "@/lib/kv-keys";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";
import { walkersAmong } from "@/lib/walkers";

const NOW = new Date("2026-10-10T12:00:00Z");
const START = Date.parse("2026-10-10T10:00:00Z");
const options = { pageSize: 2, maxPages: 1, revision: "test-v1" };

function fixture() {
  const rows = new Map<string, string>();
  let reads = 0;
  let failWrite = false;
  let seq = 0;
  const kv = {
    async get(key: string | string[], type?: string) {
      const read = (name: string) => {
        if (name.startsWith("evt:")) reads++;
        const raw = rows.get(name) ?? null;
        return raw && type === "json" ? JSON.parse(raw) : raw;
      };
      return Array.isArray(key) ? new Map(key.map(k => [k, read(k)])) : read(key);
    },
    async put(key: string, value: string) {
      if (failWrite) throw new Error("checkpoint unavailable");
      rows.set(key, value);
    },
    async list({ prefix, cursor, limit }: { prefix: string; cursor?: string; limit: number }) {
      const names = [...rows.keys()].filter(k => k.startsWith(prefix) && (!cursor || k > cursor)).sort();
      const keys = names.slice(0, limit).map(name => ({ name }));
      return { keys, list_complete: names.length <= limit, cursor: keys.at(-1)?.name ?? cursor };
    },
  };
  return {
    env: { COUNTERS: kv } as unknown as Env,
    rows,
    reads: () => reads,
    failWrite: (value: boolean) => { failWrite = value; },
    seed(item: string, offset: number, partial: Partial<MetricEvent> = {}) {
      const at = START + offset;
      rows.set(`evt:${invertedTimestamp(at)}:${++seq}`, JSON.stringify({
        kind: "challenge", item, channel: "direct", house: false,
        at: new Date(at).toISOString(), user_agent: "node", ...partial,
      } satisfies MetricEvent));
    },
  };
}

describe("bounded reclassification makes forward progress", () => {
  it("advances beyond the old 200,000-key ceiling while respecting each run's selection budget", async () => {
    const total = 200_001;
    const state = new Map<string, string>();
    let reads = 0;
    const event = { kind: "settle", item: "a", at: new Date(START).toISOString() };
    const read = (name: string) => {
      if (name.startsWith("evt:")) { reads++; return event; }
      return state.has(name) ? JSON.parse(state.get(name)!) : null;
    };
    const kv = {
      async get(key: string | string[]) { return Array.isArray(key) ? new Map(key.map(k => [k, read(k)])) : read(key); },
      async put(key: string, value: string) { state.set(key, value); },
      async list({ cursor, limit }: { cursor?: string; limit: number }) {
        const start = Number(cursor ?? 0);
        const end = Math.min(total, start + limit);
        return { keys: Array.from({ length: end - start }, (_, i) => ({ name: `evt:${invertedTimestamp(START + total - start - i)}:x` })), cursor: String(end), list_complete: end === total };
      },
    };
    const env = { COUNTERS: kv } as unknown as Env;
    for (let pass = 0; pass < 21; pass++) {
      await recomputeCorrections(env, NOW, { revision: "large-fixture" });
      const result = await readCorrections(env);
      expect(result?.progress?.keys_selected).toBeLessThanOrEqual(10_000);
      expect(result?.progress?.complete).toBe(pass === 20);
    }
    expect(reads).toBe(total);
  });
  it("matches the full walk rule across unordered timestamps, repeated doors and separate windows", async () => {
    const f = fixture();
    // Fixed pseudo-random inputs, independent of the wall clock.
    let seed = 913;
    for (let i = 0; i < 180; i++) {
      seed = (seed * 48271) % 2147483647;
      f.seed(`item-${seed % 5}`, seed % 600_000, { user_agent: `client-${i % 12}` });
    }
    const events = [...f.rows.values()].map(row => JSON.parse(row) as MetricEvent);
    const walked = walkersAmong(events);
    let set;
    do {
      await recomputeCorrections(f.env, NOW, { ...options, pageSize: 7 });
      set = await readCorrections(f.env);
    } while (!set?.progress?.complete);
    expect(set.months["2026-10"]).toMatchObject({
      recorded_organic: events.length,
      moved_by_behaviour: events.filter(row => walked.has(row.user_agent!)).length,
    });
    expect(f.reads()).toBe(events.length);
  });

  it("catches new arrivals after finishing an older backfill without reading old values again", async () => {
    const f = fixture();
    ["a", "b", "c", "d"].forEach((item, i) => f.seed(item, i * 10_000));
    const firstTime = new Date(START + 100_000);
    const limits = { ...options, settleMs: 0 };
    await recomputeCorrections(f.env, firstTime, limits);
    f.seed("e", 110_000);
    await recomputeCorrections(f.env, new Date(START + 200_000), limits);
    const result = await recomputeCorrections(f.env, new Date(START + 300_000), limits);
    expect(result[0]).toMatchObject({ complete: true, recorded_organic: 5, moved_by_behaviour: 5 });
    expect(f.reads()).toBe(5);
  });

  it("counts fallback read attempts and refuses completeness on an unreadable row", async () => {
    const f = fixture();
    f.rows.set(`evt:${invertedTimestamp(START)}:bad`, "broken JSON");
    await recomputeCorrections(f.env, NOW, options);
    const set = await readCorrections(f.env);
    expect(set?.progress).toMatchObject({ keys_selected: 1, event_key_read_attempts: 2, complete: false });
    expect(f.reads()).toBe(2);
  });
  it("resumes across pages, detects a walk split across runs, then reads no old event values", async () => {
    const f = fixture();
    ["a", "b", "c", "d"].forEach((item, i) => f.seed(item, i * 10_000));
    const first = await recomputeCorrections(f.env, NOW, options);
    expect(first[0]?.complete).toBe(false);
    expect(f.reads()).toBe(2);
    const second = await recomputeCorrections(f.env, NOW, options);
    expect(second[0]).toMatchObject({ complete: true, recorded_organic: 4, moved_by_behaviour: 4 });
    expect(f.reads()).toBe(4);
    await recomputeCorrections(f.env, new Date(NOW.getTime() + 3_600_000), options);
    expect(f.reads(), "an idle hour must not re-read the event history").toBe(4);
  });

  it("joins a new tail to old behaviour without double counting and rebuilds on a rule change", async () => {
    const f = fixture();
    ["a", "b", "c"].forEach((item, i) => f.seed(item, i * 10_000));
    const wide = { ...options, maxPages: 10, settleMs: 0 };
    await recomputeCorrections(f.env, new Date(START + 25_000), wide);
    f.seed("d", 30_000);
    const result = await recomputeCorrections(f.env, new Date(START + 50_000), wide);
    expect(result[0]).toMatchObject({ recorded_organic: 4, moved_by_behaviour: 4 });
    expect(f.reads()).toBe(4);
    await recomputeCorrections(f.env, NOW, { ...wide, revision: "test-v2" });
    expect(f.reads()).toBe(8);
  });

  it("retains the last checkpoint after a failed write, and retries without counting twice", async () => {
    const f = fixture();
    ["a", "b", "c", "d"].forEach((item, i) => f.seed(item, i * 10_000));
    await recomputeCorrections(f.env, NOW, options);
    f.failWrite(true);
    await expect(recomputeCorrections(f.env, NOW, options)).rejects.toThrow();
    f.failWrite(false);
    const result = await recomputeCorrections(f.env, NOW, options);
    expect(result[0]).toMatchObject({ complete: true, recorded_organic: 4, moved_by_behaviour: 4 });
  });

  it("withdraws completeness once the raw month can have expired", async () => {
    const f = fixture();
    f.seed("a", 0);
    await recomputeCorrections(f.env, NOW, options);
    await recomputeCorrections(f.env, new Date("2027-01-10T12:00:00Z"), options);
    const set = await readCorrections(f.env);
    expect(set?.months["2026-10"]?.complete ?? false).toBe(false);
  });
});
