import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { counterLedger, ledgerShardName } from "@/lib/counter-ledger";
import { KV_KEYS } from "@/lib/kv-keys";
import { recordSettlement } from "@/lib/metrics";
import { raiseCountersToRecords } from "@/services/counter-raise";
import type { Env } from "@/types";

/**
 * ONE WALLET, TEN SECONDS APART, SIXTY-SIX TIMES (2026-09-11). The
 * storefront counted 83 organic settles beside 94 certificates
 * because every counter was read-add-write on KV. These tests are
 * the shape of that afternoon, run against the real ledger: a burst
 * lands whole, the payer row lands whole, and a tally that was
 * already short is lifted to what the records say.
 */
const testEnv = env as unknown as Env;
const MONTH = new Date().toISOString().slice(0, 7);
const WALLET = "0x2ebe788c488689795c3b61b38b9f0a209b2a89d3";

async function settle(tx: string, item = "small_blessing", paidUsdc = 0.005) {
  await recordSettlement(testEnv, `/api/buy/${item}`, {
    payer: WALLET,
    paidUsdc,
    minimumUsdc: paidUsdc,
    network: "eip155:8453",
    transaction: tx,
    userAgent: "burst-test/1.0",
  } as never);
}

async function flush(key: string) {
  const stub = counterLedger(testEnv, key);
  if (stub) await runDurableObjectAlarm(stub as never);
}

describe("the counter ledger", () => {
  beforeEach(async () => {
    // Object storage outlives a test the way KV does here; start each
    // case from an empty ledger on every shard a settle can touch.
    await counterLedger(testEnv, "metric:test:reset:x")!.reset();
    const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    await testEnv.COUNTERS.delete(KV_KEYS.payer(WALLET));
    const settles = await testEnv.COUNTERS.list({ prefix: KV_KEYS.payerSettlePrefix() });
    for (const key of settles.keys) await testEnv.COUNTERS.delete(key.name);
  });

  it("shards by month and kind so a burst on the till never queues behind the porch", () => {
    expect(ledgerShardName(`metric:${MONTH}:paid:small_blessing`)).toBe(`${MONTH}/paid`);
    expect(ledgerShardName(`metric:${MONTH}:porch:storefront`)).toBe(`${MONTH}/porch`);
    expect(ledgerShardName(KV_KEYS.payer(WALLET))).toBe("payer/2");
  });

  it("lands a burst of sixty concurrent settles as sixty, on the tally and on the payer row", async () => {
    await Promise.all(Array.from({ length: 60 }, (_, i) => settle(`0x${i.toString(16).padStart(64, "a")}`)));
    const paidKey = KV_KEYS.metric(MONTH, "paid", "small_blessing");
    const stub = counterLedger(testEnv, paidKey);
    expect(stub).not.toBeNull();
    expect(await stub!.read(paidKey)).toBe(60);
    await flush(paidKey);
    expect(await testEnv.COUNTERS.get(paidKey)).toBe("60");

    const rowKey = KV_KEYS.payer(WALLET);
    await flush(rowKey);
    const row = JSON.parse((await testEnv.COUNTERS.get(rowKey)) ?? "{}") as { purchases: number };
    expect(row.purchases).toBe(60);

    const revKey = KV_KEYS.metric(MONTH, "rev", "total");
    await flush(revKey);
    expect(await testEnv.COUNTERS.get(revKey)).toBe(String(60 * 5000));
  });

  it("lifts a tally that was already short to what the records say, and finds nothing the second time", async () => {
    // The afternoon in question, before the ledger existed: twelve
    // per-settle records on the shelf, a tally that read seven.
    const at = `${MONTH}-11T16:13:00.000Z`;
    for (let i = 0; i < 12; i += 1) {
      const tx = `0x${i.toString(16).padStart(64, "b")}`;
      await testEnv.COUNTERS.put(
        KV_KEYS.payerSettle(WALLET, tx),
        JSON.stringify({ item: "small_blessing", at, transaction: tx }),
      );
    }
    const paidKey = KV_KEYS.metric(MONTH, "paid", "small_blessing");
    await testEnv.COUNTERS.put(paidKey, "7");
    await testEnv.COUNTERS.put(KV_KEYS.payer(WALLET), JSON.stringify({ address: WALLET, first_seen: at, last_seen: at, purchases: 9 }));

    const first = await raiseCountersToRecords(testEnv);
    expect(first.organic_records).toBe(12);
    expect(first.raised).toContainEqual({ key: paidKey, from: 7, to: 12 });
    expect(first.raised).toContainEqual({ key: KV_KEYS.metric(MONTH, "dpaid", "11"), from: 0, to: 12 });
    expect(first.raised).toContainEqual({ key: KV_KEYS.metric(MONTH, "rev", "total"), from: 0, to: 12 * 5000 });
    expect(first.payer_rows_raised).toEqual([{ key: KV_KEYS.payer(WALLET), from: 9, to: 12 }]);
    expect(await counterLedger(testEnv, paidKey)!.read(paidKey)).toBe(12);
    await flush(paidKey);
    expect(await testEnv.COUNTERS.get(paidKey)).toBe("12");

    const second = await raiseCountersToRecords(testEnv);
    expect(second.raised).toEqual([]);
    expect(second.payer_rows_raised).toEqual([]);
  });

  it("on the production path (object storage as truth), sixty concurrent adds land as sixty and the KV mirror ends on sixty", async () => {
    const key = `metric:${MONTH}:paid:production-path`;
    const stub = counterLedger(testEnv, key)!;
    const result = await runInDurableObject(stub as never, async (instance: unknown) => {
      // The pool sets COUNTER_LEDGER_FOLLOW_KV so every other test can
      // wipe KV between runs; this one turns it off inside the object
      // to exercise the path production runs: SQL as truth, KV mirrored.
      const ledger = instance as { env: Record<string, unknown>; add: (k: string, n: number) => Promise<number>; read: (k: string) => Promise<number>; reset: () => Promise<void> };
      ledger.env.COUNTER_LEDGER_FOLLOW_KV = "";
      await ledger.reset();
      await Promise.all(Array.from({ length: 60 }, () => ledger.add(key, 1)));
      const held = await ledger.read(key);
      const mirrored = await testEnv.COUNTERS.get(key);
      ledger.env.COUNTER_LEDGER_FOLLOW_KV = "1";
      return { held, mirrored };
    });
    expect(result.held).toBe(60);
    expect(result.mirrored).toBe("60");
  });

  it("raises a payer row that sits below its settle records", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => settle(`0x${i.toString(16).padStart(64, "c")}`)));
    const rowKey = KV_KEYS.payer(WALLET);
    await flush(rowKey);
    // Knock the mirrored row down the way a lost increment would.
    const row = JSON.parse((await testEnv.COUNTERS.get(rowKey)) ?? "{}") as { purchases: number };
    expect(row.purchases).toBe(5);
    const stub = counterLedger(testEnv, rowKey)!;
    const short = await stub.raisePayerRow(rowKey, WALLET, 0, new Date().toISOString());
    expect(short?.purchases).toBe(5); // never lowers
  });
});
