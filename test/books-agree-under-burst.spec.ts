import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { counterLedger } from "@/lib/counter-ledger";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth, reconcileSettles, recordSettlement } from "@/lib/metrics";
import { raiseCountersToRecords } from "@/services/counter-raise";
import { computeStats } from "@/services/stats";
import type { Env } from "@/types";

/**
 * THE BOOKS UNDER A BURST, READ WHERE THE KEEPER AND THE CUSTOMERS
 * READ THEM (2026-09-11). Every earlier check audited one witness
 * against another. None asked the only question that matters after
 * a script buys a hundred and fifty times in a minute: does the
 * number on /stats — the one the storefront, /pulse and the badges
 * repeat — equal the number of sales, and does the desk agree with
 * it. This asks exactly that, through the real till, the real ledger
 * and the real public route, with three wallets interleaved so no
 * shard, row or key sees a tidy queue.
 */
const testEnv = env as unknown as Env;
const MONTH = metricsMonth();
const WALLETS = [
  "0x2ebe788c488689795c3b61b38b9f0a209b2a89d3",
  "0xc9c7b38c0942914fc8ea12063bc92dcd3b581670",
  "0x79f896ff38691931fc2494610c106ad755e6f758",
];
const PER_WALLET = 50;

async function wipe() {
    await counterLedger(testEnv, "metric:test:reset:x")!.reset();
  for (const wallet of WALLETS) await testEnv.COUNTERS.delete(KV_KEYS.payer(wallet));
  for (const prefix of ["metric:", KV_KEYS.payerSettlePrefix()]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

async function flushAll() {
  const { runDurableObjectAlarm } = await import("cloudflare:test");
  for (const shard of ["paid", "dpaid", "rev", "rail", "revrail", "tier", "src", "venue"]) {
    await runDurableObjectAlarm(counterLedger(testEnv, `metric:${MONTH}:${shard}:x`)! as never);
  }
  for (const wallet of WALLETS) {
    await runDurableObjectAlarm(counterLedger(testEnv, KV_KEYS.payer(wallet))! as never);
  }
}

describe("the books under a burst", () => {
  beforeEach(wipe);

  it("puts the same number on /stats, the reconciliation and the raise as sales that settled", async () => {
    const sales: Array<Promise<void>> = [];
    for (const [w, wallet] of WALLETS.entries()) {
      for (let i = 0; i < PER_WALLET; i += 1) {
        const item = i % 3 === 0 ? "hello" : i % 3 === 1 ? "small_blessing" : "spot_check";
        const paidUsdc = item === "hello" ? 0.5 : item === "small_blessing" ? 0.005 : 0.001;
        sales.push(
          recordSettlement(testEnv, `/api/buy/${item}`, {
            payer: wallet,
            paidUsdc,
            minimumUsdc: paidUsdc,
            network: "eip155:8453",
            transaction: `0x${w}${i.toString(16).padStart(63, "d")}`,
            userAgent: "burst/1.0",
          } as never),
        );
      }
    }
    await Promise.all(sales);
    await flushAll();
    const total = WALLETS.length * PER_WALLET;

    // The customers' number: /stats, as the storefront and the badges repeat it.
    const stats = await computeStats(testEnv);
    expect(stats.organic_settlements).toBe(total);
    const publicStats = (await (await SELF.fetch("https://scvd.store/stats", { headers: { Accept: "application/json" } })).json()) as {
      organic_settlements: number;
    };
    expect(publicStats.organic_settlements).toBe(total);

    // The keeper's number: the books check's three witnesses agree.
    const books = await reconcileSettles(testEnv);
    expect(books.counter_settles - books.founding).toBe(total);
    expect(books.payer_purchases).toBe(total);
    expect(books.unexplained).toBe(0);

    // And the raise finds nothing short, which is the evidence the fix holds.
    const raise = await raiseCountersToRecords(testEnv);
    expect(raise.organic_records).toBe(total);
    expect(raise.raised).toEqual([]);
    expect(raise.payer_rows_raised).toEqual([]);
  });
});
