import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordChallengeIssued } from "@/lib/metrics";
import { counterLedger } from "@/lib/counter-ledger";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const count = 20;
const at = new Date("2026-10-11T19:00:00.000Z");
const dayKey = "metric:2026-10:d402:11#s0";
const itemKey = "metric:2026-10:402:hello#s0";

beforeEach(async () => {
  for (const prefix of ["metric:", "metricw:", "evt:"]) {
    const listed = await bindings.COUNTERS.list({ prefix });
    await Promise.all(listed.keys.map(({ name }) => bindings.COUNTERS.delete(name)));
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  let sequence = 0;
  // Same counter shard, distinct event suffixes. Neither relies on chance.
  vi.spyOn(Math, "random").mockImplementation(() => 0.01 + (++sequence / 100_000));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const burst = (target: Env) => Promise.all(Array.from({ length: count }, () =>
  recordChallengeIssued(target, "/api/buy/hello", { userAgent: "accounting-reproduction/1.0" }),
));

describe("unpaid challenge accounting across the doors and store", () => {
  it("reproduces surviving event rows with lost increments on the unbound KV fallback", async () => {
    const rows = new Map<string, string>();
    let reads = 0;
    let release!: () => void;
    const readWave = new Promise<void>((resolve) => { release = resolve; });
    // Model a legal concurrent KV read schedule: each day-counter read sees
    // the same old value before any request writes it back. No errors needed.
    const counters = {
      get: async (key: string) => {
        const snapshot = rows.get(key) ?? null;
        if (key === dayKey) {
          if (++reads === count) release();
          await readWave;
        }
        return snapshot;
      },
      put: async (key: string, value: string) => { rows.set(key, value); },
    } as unknown as KVNamespace;
    await burst({ ...bindings, COUNTER_LEDGER: undefined, COUNTERS: counters });
    expect(reads).toBe(count);
    expect([...rows.keys()].filter((key) => key.startsWith("evt:"))).toHaveLength(count);
    expect(rows.get(dayKey)).toBe("1");
  });

  it("retains every increment when doors and store use the same real serialized writer", async () => {
    const writers = { ...bindings, COUNTER_LEDGER_FOLLOW_KV: "1" };
    const ledger = counterLedger(writers, dayKey)!;
    await ledger.reset();
    // Exercise production SQL and mirror behavior, not the test-only KV mode.
    await runInDurableObject(ledger, (instance) => { (instance as unknown as { env: Env }).env.COUNTER_LEDGER_FOLLOW_KV = ""; });
    try {
      await burst(writers);
      expect(await ledger.read(dayKey)).toBe(count);
      expect(await ledger.read(itemKey)).toBe(count);
      // A request through the main store must continue the SAME counters.
      await recordChallengeIssued(writers, "/api/buy/hello", { userAgent: "accounting-reproduction/1.0" });
      expect(await ledger.read(dayKey)).toBe(count + 1);
      await runDurableObjectAlarm(ledger);
      expect(await bindings.COUNTERS.get(dayKey)).toBe(String(count + 1));
      const events = await bindings.COUNTERS.list({ prefix: "evt:" });
      expect(events.keys).toHaveLength(count + 1);
    } finally {
      await runInDurableObject(ledger, (instance) => { (instance as unknown as { env: Env }).env.COUNTER_LEDGER_FOLLOW_KV = "1"; });
      await ledger.reset();
    }
  });

  it("preserves a higher legacy baseline when reconciled before the shared-writer handover", async () => {
    const writers = { ...bindings, COUNTER_LEDGER_FOLLOW_KV: "1" };
    const ledger = counterLedger(writers, dayKey)!;
    await ledger.reset();
    await bindings.COUNTERS.put(dayKey, "7");
    await runInDurableObject(ledger, (instance) => {
      (instance as unknown as { env: Env }).env.COUNTER_LEDGER_FOLLOW_KV = "";
    });
    try {
      expect(await ledger.read(dayKey)).toBe(7);
      // The unbound doors may have advanced KV after SQL was seeded.
      await bindings.COUNTERS.put(dayKey, "25");
      expect(await ledger.read(dayKey)).toBe(7);
      // Binding alone never reseeds an existing SQL row. The rollout must
      // preserve its observed baseline first, not substitute event totals.
      const baseline = Number(await bindings.COUNTERS.get(dayKey));
      expect(await ledger.raiseTo(dayKey, baseline)).toBe(25);
      await burst(writers);
      expect(await ledger.read(dayKey)).toBe(25 + count);
      await runDurableObjectAlarm(ledger);
      expect(await bindings.COUNTERS.get(dayKey)).toBe(String(25 + count));
    } finally {
      await runInDurableObject(ledger, (instance) => {
        (instance as unknown as { env: Env }).env.COUNTER_LEDGER_FOLLOW_KV = "1";
      });
      await ledger.reset();
    }
  });

});
