import { env, runDurableObjectAlarm } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { counterLedger } from "@/lib/counter-ledger";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth, reconcileSettles, recordSettlement } from "@/lib/metrics";
import { raiseCountersToRecords } from "@/services/counter-raise";
import type { Env } from "@/types";

/**
 * THE RAISE AND THE TILL AGREE ON WHO IS FAMILY (2026-10-02). The till
 * books a settle as house by four tests — the wallet list, the store's
 * own receiving addresses, a house user-agent, the house header — and
 * writes one per-settle record either way. The raise read that record
 * and asked only the first test, so a settle the till had booked under
 * `paidh` was lifted onto `paid` as well within the hour: two counter
 * settles for one record, and the books check reading "the counters
 * read 1 settlement more than the derived payer purchases" with the
 * raise unable to put it back, because it never lowers. The record now
 * says which family it was booked under and the raise honours it.
 */
const testEnv = env as unknown as Env;
const MONTH = metricsMonth();
const STRANGER = "0x2ebe788c488689795c3b61b38b9f0a209b2a89d3";
const ITEM = "small_blessing";

async function wipe() {
  await counterLedger(testEnv, "metric:test:reset:x")!.reset();
  for (const prefix of ["metric:", KV_KEYS.payerPrefix, KV_KEYS.payerSettlePrefix()]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

async function flush(key: string) {
  await runDurableObjectAlarm(counterLedger(testEnv, key)! as never);
}

async function settle(payer: string, tx: string, userAgent: string) {
  await recordSettlement(testEnv, `/api/buy/${ITEM}`, {
    payer,
    paidUsdc: 0.005,
    minimumUsdc: 0.005,
    network: "eip155:8453",
    transaction: tx,
    userAgent,
  } as never);
}

async function flushBooks(payer: string) {
  for (const kind of ["paid", "paidh", "dpaid", "rev", "rail", "revrail"]) {
    await flush(KV_KEYS.metric(MONTH, kind, "x"));
  }
  await flush(KV_KEYS.payer(payer));
}

describe("the raise against a settle the till booked as house", () => {
  beforeEach(wipe);

  it("leaves a house-agent settle from a stranger's wallet on the house tally instead of lifting it onto the organic one", async () => {
    const tx = `0x${"a".repeat(64)}`;
    await settle(STRANGER, tx, "scvd-walkabout/1.0");
    await flushBooks(STRANGER);

    // The till's own booking: house, one record.
    expect(await testEnv.COUNTERS.get(KV_KEYS.metric(MONTH, "paidh", ITEM))).toBe("1");
    expect(await testEnv.COUNTERS.get(KV_KEYS.metric(MONTH, "paid", ITEM))).toBeNull();

    // The raise, an hour later: nothing to lift, because the record
    // says which family the till booked it under.
    const raise = await raiseCountersToRecords(testEnv);
    expect(raise.raised).toEqual([]);
    expect(raise.payer_rows_raised).toEqual([]);
    expect(raise.organic_records).toBe(0);
    expect(raise.house_records).toBe(1);
    expect(await counterLedger(testEnv, KV_KEYS.metric(MONTH, "paid", ITEM))!.read(KV_KEYS.metric(MONTH, "paid", ITEM))).toBe(0);
    const record = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.payerSettle(STRANGER, tx))) ?? "{}") as { house?: boolean };
    expect(record.house).toBe(true);

    const books = await reconcileSettles(testEnv);
    expect(books.counter_settles - books.founding).toBe(1);
    expect(books.payer_purchases).toBe(1);
    expect(books.unexplained).toBe(0);
  });

  it("treats a payer that is the store's own receiving address as house, the way the till does", async () => {
    const payTo = testEnv.PAY_TO_ADDRESS!;
    const tx = `0x${"b".repeat(64)}`;
    await settle(payTo, tx, "some-agent/1.0");
    await flushBooks(payTo);
    expect(await testEnv.COUNTERS.get(KV_KEYS.metric(MONTH, "paidh", ITEM))).toBe("1");

    // A record from before the flag existed: the raise must still know
    // this wallet is the house from the address alone.
    await testEnv.COUNTERS.put(
      KV_KEYS.payerSettle(payTo, tx),
      JSON.stringify({ item: ITEM, at: new Date().toISOString(), transaction: tx }),
    );

    const raise = await raiseCountersToRecords(testEnv);
    expect(raise.organic_records).toBe(0);
    expect(raise.raised).toEqual([]);

    const books = await reconcileSettles(testEnv);
    expect(books.unexplained).toBe(0);
  });

  it("still lifts a stranger's organic settle whose tally fell short", async () => {
    const tx = `0x${"c".repeat(64)}`;
    await settle(STRANGER, tx, "stranger/1.0");
    await flushBooks(STRANGER);
    const paidKey = KV_KEYS.metric(MONTH, "paid", ITEM);
    expect(await testEnv.COUNTERS.get(paidKey)).toBe("1");
    // Knock the tally down the way a lost increment would.
    await counterLedger(testEnv, "metric:test:reset:x")!.reset();
    await testEnv.COUNTERS.put(paidKey, "0");

    const raise = await raiseCountersToRecords(testEnv);
    expect(raise.organic_records).toBe(1);
    expect(raise.raised).toContainEqual({ key: paidKey, from: 0, to: 1 });
  });
});
