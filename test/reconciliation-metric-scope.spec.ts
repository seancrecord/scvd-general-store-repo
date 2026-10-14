import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { FOUNDING_SETTLES_WITHOUT_PAYER_ROW, reconcileSettles } from "@/lib/metrics";
import { MPP_SALES_PREFIX } from "@/services/mpp-sales";
import type { Env } from "@/types";

// A busy July fills the old whole-metric scan before any sales keys.
// Narrow scans still reach the real KV counters, including a retired item.
const noise = vi.hoisted(() => ({ enabled: false, prefixes: [] as string[] }));
vi.mock("@/lib/kv-list", async original => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    noise.prefixes.push(args[1].prefix);
    if (noise.enabled && args[1].prefix === "metric:") {
      return { names: Array.from({ length: args[1].cap }, (_, i) => `metric:2026-07:402:noise-${i}`), truncated: true };
    }
    return actual.listKeys(...args);
  } };
});
const bindings = env as unknown as Env;
const rows = [
  [KV_KEYS.metric("2026-07", "paid", "retired_item"), "3"],
  [KV_KEYS.metric("2026-08", "paid", "hello"), "4"],
  [KV_KEYS.metric("2026-08", "paidh", "hello"), "2"],
  [KV_KEYS.metric("2026-08", "nopayer", "hello"), "1"],
  [`${MPP_SALES_PREFIX}2026-08`, JSON.stringify({ organic: 99, house: 0, organic_amount_atomic: "99000000", house_amount_atomic: "0" })],
  [KV_KEYS.payer("0xscopetest"), JSON.stringify({ address: "0xscopetest", purchases: 8 })],
] as const;
afterEach(async () => {
  noise.enabled = false;
  noise.prefixes = [];
  vi.useRealTimers();
  await Promise.all(rows.map(([key]) => bindings.COUNTERS.delete(key)));
});

it("reads every sales month despite unrelated metrics exhausting the old cap", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
  await Promise.all(rows.map(([key, value]) => bindings.COUNTERS.put(key, value)));
  noise.enabled = true;
  const result = await reconcileSettles(bindings);
  expect(result.counter_settles).toBe(FOUNDING_SETTLES_WITHOUT_PAYER_ROW + 9);
  expect(result.payer_purchases).toBe(8);
  expect(result.unattributed).toBe(1);
  expect(result.unexplained).toBe(0);
  expect(result.truncated).toEqual([]);
  expect(noise.prefixes).not.toContain("metric:");
});
