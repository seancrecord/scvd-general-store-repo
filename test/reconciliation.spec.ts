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
import type { Env, PayerRecord } from "@/types";
import { mintCertificate } from "@/services/certificates";
import { backfillPayerSettlesFromCertificates } from "@/services/payer-repair";

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

/**
 * THE LOST INCREMENT (the keeper's ruling, 2026-09-04). The payer row
 * is a read-modify-write on one KV key per wallet; two settles from
 * one wallet close together read the same count and both write count
 * plus one, and the sweep paged "one settle unexplained" on CV's Base
 * batch. The per-settle record cannot lose one, and the reconciliation
 * takes the larger of row and records per wallet.
 */
describe("a lost row increment is not a books defect", () => {
  const wallet = "0xlostincrement00000000000000000000000001";

  it("counts the settle records when the row fell behind", async () => {
    const before = await reconcileSettles(testEnv);
    for (const transaction of ["0xaaa1", "0xaaa2", "0xaaa3"]) {
      await recordSettlement(testEnv, "/api/buy/hello", {
        paidUsdc: 0.5,
        minimumUsdc: 0.5,
        payer: wallet,
        transaction,
      });
    }
    // The race, replayed by hand: the row lost one of the three.
    const key = KV_KEYS.payer(wallet);
    const row = JSON.parse((await testEnv.COUNTERS.get(key)) ?? "{}") as PayerRecord;
    await testEnv.COUNTERS.put(key, JSON.stringify({ ...row, purchases: row.purchases - 1 }));

    const after = await reconcileSettles(testEnv);
    expect(after.counter_settles).toBe(before.counter_settles + 3);
    expect(after.payer_purchases).toBe(before.payer_purchases + 3);
    expect(after.unexplained).toBe(before.unexplained);
    expect(after.settle_records).toBeGreaterThanOrEqual(3);
  });

  it("backfills a record from a certificate for a settle older than the records, and raises the short row", async () => {
    const older = "0xbackfilled0000000000000000000000000002";
    // A settle from before the records existed: row only, one short.
    await testEnv.COUNTERS.put(
      KV_KEYS.payer(older),
      JSON.stringify({ address: older, first_seen: "2026-08-01T00:00:00.000Z", last_seen: "2026-08-01T00:00:00.000Z", purchases: 1 }),
    );
    await mintCertificate(testEnv, { itemId: "hello", payer: older, settlementTx: "0xbf01" });
    await mintCertificate(testEnv, { itemId: "hello", payer: older, settlementTx: "0xbf02" });

    const first = await backfillPayerSettlesFromCertificates(testEnv);
    expect(first.records_written).toBeGreaterThanOrEqual(2);
    expect(first.rows_corrected).toContain(older);
    const row = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.payer(older))) ?? "{}") as PayerRecord;
    expect(row.purchases).toBe(2);

    // Idempotent: a second pass writes nothing and corrects nothing.
    const second = await backfillPayerSettlesFromCertificates(testEnv);
    expect(second.records_written).toBe(0);
    expect(second.rows_corrected).not.toContain(older);
  });
});
