import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
  metricsMonth,
  readMonthLedger,
  reconcileSettles,
  recordSettlement,
} from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE OFF-BY-ONE, named so the next one can't hide behind it.
 *
 * The books have shown one more settle on the counters than on the
 * payer rows since July. It is not a bug: the founding settle predates
 * recordSettlement entirely, so it has a counter and no wallet row,
 * permanently. What these tests pin is the *rest* of the arithmetic —
 * that every other settle lands on both sides, that a settle with no
 * payer address gets counted as such rather than vanishing into the
 * gap, and that anything left over is reported as unexplained.
 */
describe("the reconciliation", () => {
  it("counts the founding settle as the one settle with no payer row", async () => {
    const opening = await reconcileSettles(testEnv);
    expect(opening.founding).toBe(FOUNDING_SETTLES_WITHOUT_PAYER_ROW);
    // Whatever else is in KV from other specs, the founding is always
    // inside the counter total and never inside the payer total.
    expect(opening.counter_settles).toBeGreaterThanOrEqual(opening.founding);
  });

  it("keeps both sides moving together when a settle carries a wallet", async () => {
    const before = await reconcileSettles(testEnv);
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: "0xreconciliationtestwallet0000000000000001",
    });
    const after = await reconcileSettles(testEnv);

    expect(after.counter_settles).toBe(before.counter_settles + 1);
    expect(after.payer_purchases).toBe(before.payer_purchases + 1);
    // The gap does not widen: that is the whole invariant.
    expect(after.unexplained).toBe(before.unexplained);
  });

  it("names a settle that arrived with no payer address instead of losing it", async () => {
    const before = await reconcileSettles(testEnv);
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      // No payer: the facilitator returned money and no wallet.
    });
    const after = await reconcileSettles(testEnv);

    expect(after.counter_settles).toBe(before.counter_settles + 1);
    expect(after.payer_purchases).toBe(before.payer_purchases);
    // Counted as unattributed, so the gap stays explained.
    expect(after.unattributed).toBe(before.unattributed + 1);
    expect(after.unexplained).toBe(before.unexplained);

    // And it is visible per item on the month ledger, not just in a total.
    const ledger = await readMonthLedger(testEnv);
    expect(ledger.settlesWithoutPayer["hello"]).toBeGreaterThanOrEqual(1);
  });

  it("reports a counter that moved without its row as unexplained", async () => {
    const before = await reconcileSettles(testEnv);
    // The bug this whole instrument exists to catch: a settle counter
    // bumped by something that never wrote a payer row and never
    // declared itself unattributed.
    const key = KV_KEYS.metric(metricsMonth(), "paid", "phantom_bug_item");
    const current = parseInt((await testEnv.COUNTERS.get(key)) ?? "0", 10);
    await testEnv.COUNTERS.put(key, String(current + 1));

    const after = await reconcileSettles(testEnv);
    expect(after.unexplained).toBe(before.unexplained + 1);

    await testEnv.COUNTERS.put(key, String(current));
    const restored = await reconcileSettles(testEnv);
    expect(restored.unexplained).toBe(before.unexplained);
  });
});
