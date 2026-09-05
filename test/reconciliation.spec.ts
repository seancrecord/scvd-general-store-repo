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
import { SOLANA_NETWORK } from "@/lib/payments";
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
    // A row that exists is never a reason to rebook the counters: the
    // row is the lossy side, and the counter may well have gone through.
    expect(first.counters_rebooked.filter((entry) => entry.startsWith(older))).toEqual([]);
  });

  /**
   * THE ROW THAT NEVER EXISTED (2026-09-05). The keeper pressed the
   * repair for a wallet with two Solana penny settles on 2026-08-05
   * and got rows_corrected: [] — there was no row to raise, because
   * recordSettlement, which writes the row and the counters in one
   * wave, never ran. Certificates were the only trace. So a wallet
   * with certificates and no row gets its row FROM the certificates,
   * and each settle is booked onto the month the certificate carries.
   */
  it("creates the missing row from the certificates and books the counters the till never bumped", async () => {
    const wallet = "TeStKWyNre9PW8XbLfvuBm9f6EnTBYqS5GXTzciCnHw";
    const month = metricsMonth();
    const paidKey = KV_KEYS.metric(month, "paid", "hello");
    const railKey = KV_KEYS.metric(month, "rail", "solana");
    const paidBefore = parseInt((await testEnv.COUNTERS.get(paidKey)) ?? "0", 10);
    const railBefore = parseInt((await testEnv.COUNTERS.get(railKey)) ?? "0", 10);
    const revenueBefore = (await readMonthLedger(testEnv, month)).revenueUsdc;
    for (const tx of ["5unbooked01", "5unbooked02"]) {
      await mintCertificate(testEnv, {
        itemId: "hello",
        paidUsdc: 0.0075,
        network: SOLANA_NETWORK,
        payer: wallet,
        settlementTx: tx,
      });
    }
    expect(await testEnv.COUNTERS.get(KV_KEYS.payer(wallet))).toBeNull();

    const first = await backfillPayerSettlesFromCertificates(testEnv);
    expect(first.rows_created).toContain(wallet);
    expect(first.counters_rebooked).toEqual(
      expect.arrayContaining([`${wallet}:5unbooked01`, `${wallet}:5unbooked02`]),
    );
    const row = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.payer(wallet))) ?? "{}") as PayerRecord;
    expect(row.address).toBe(wallet);
    expect(row.purchases).toBe(2);
    expect(row.first_seen <= row.last_seen).toBe(true);
    expect(parseInt((await testEnv.COUNTERS.get(paidKey)) ?? "0", 10)).toBe(paidBefore + 2);
    expect(parseInt((await testEnv.COUNTERS.get(railKey)) ?? "0", 10)).toBe(railBefore + 2);
    // The month ledger now says what the certificates say.
    const ledger = await readMonthLedger(testEnv, month);
    expect(ledger.items["hello"]?.settled).toBeGreaterThanOrEqual(2);
    expect(ledger.revenueUsdc - revenueBefore).toBeCloseTo(0.015, 6);

    // Idempotent: the row exists now, so nothing is rebooked twice.
    const second = await backfillPayerSettlesFromCertificates(testEnv);
    expect(second.rows_created).not.toContain(wallet);
    expect(second.counters_rebooked).toEqual([]);
    expect(parseInt((await testEnv.COUNTERS.get(paidKey)) ?? "0", 10)).toBe(paidBefore + 2);
  });

  it("never rebooks a settle the till itself recorded, even with no row behind it", async () => {
    const wallet = "0xrowlost000000000000000000000000000000003";
    const month = metricsMonth();
    const paidKey = KV_KEYS.metric(month, "paid", "hello");
    // The till ran: counters and record written in one wave…
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: wallet,
      transaction: "0xtillran01",
    });
    await mintCertificate(testEnv, { itemId: "hello", payer: wallet, settlementTx: "0xtillran01" });
    // …and the row write was the one that got lost.
    await testEnv.COUNTERS.delete(KV_KEYS.payer(wallet));
    const paidBefore = parseInt((await testEnv.COUNTERS.get(paidKey)) ?? "0", 10);

    const pass = await backfillPayerSettlesFromCertificates(testEnv);
    expect(pass.rows_created).toContain(wallet);
    expect(pass.counters_rebooked).toEqual([]);
    expect(parseInt((await testEnv.COUNTERS.get(paidKey)) ?? "0", 10)).toBe(paidBefore);
  });
});
