import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Env } from "@/types";
import { readMppSales } from "@/services/mpp-sales";
import { houseWallets } from "@/lib/channel";

const bindings = env as unknown as Env;
const now = new Date("2026-09-17T12:00:00Z");
const month = "2026-09";
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const payer = houseWallets(bindings).find(address => /^0x[0-9a-f]{40}$/.test(address))!;
const sale = { id: "a".repeat(64), month, payer, transaction: `0x${"b".repeat(64)}`, amount: "1000000", house: false };
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
  const keys = await bindings.COUNTERS.list({ prefix: "mpp:" });
  for (const key of keys.keys) await bindings.COUNTERS.delete(key.name);
});
afterEach(() => { vi.useRealTimers(); });
it("corrects one sale once, preserving its original evidence and exact gross totals", async () => {
  await ledger().recordMppSale(sale);
  await Promise.all([ledger().correctMppHouseSale(sale, "listed after purchase"), ledger().correctMppHouseSale(sale, "listed after purchase")]);
  expect(JSON.parse((await ledger().readMppSale(sale.id))!)).toEqual(sale);
  expect(await readMppSales(bindings)).toMatchObject({ organic: 0, house: 1, organic_amount_atomic: "0", house_amount_atomic: "1000000", reclassified_house: 1, reclassified_amount_atomic: "1000000" });
  expect(JSON.parse((await ledger().readMppHouseCorrection(sale.id))!)).toMatchObject({ id: sale.id, payer, amount: sale.amount, reason: "listed after purchase", at: now.toISOString() });
  await ledger().recordMppSale(sale);
  expect(await readMppSales(bindings)).toMatchObject({ house: 1, reclassified_house: 1 });
});
async function refused(evidence: typeof sale) {
  // Catch within the actor: workerd also reports rejected RPCs as unhandled.
  return runInDurableObject(ledger(), async instance => {
    try { await instance.correctMppHouseSale(evidence, "reason"); return false; } catch { return true; }
  });
}
it("refuses unregistered wallets, changed evidence, already-house sales and missing sales", async () => {
  expect(await refused(sale)).toBe(true);
  await ledger().recordMppSale(sale);
  expect(await refused({ ...sale, amount: "2" })).toBe(true);
  const foreign = { ...sale, id: "c".repeat(64), payer: `0x${"12".repeat(20)}` };
  await ledger().recordMppSale(foreign);
  expect(await refused(foreign)).toBe(true);
  const house = { ...sale, id: "d".repeat(64), house: true };
  await ledger().recordMppSale(house);
  expect(await refused(house)).toBe(true);
});
it("fails closed if a correction mirror exceeds its retained raw sales", async () => {
  await bindings.COUNTERS.put(`mpp:sales:${month}`, JSON.stringify({ organic: 0, house: 0, organic_amount_atomic: "0", house_amount_atomic: "0", reclassified_house: 1, reclassified_amount_atomic: "1000000" }));
  await expect(readMppSales(bindings)).rejects.toThrow();
});

it("retains a correction through a failed mirror and repairs it by alarm without counting twice", async () => {
  await ledger().recordMppSale(sale);
  await runInDurableObject(ledger(), async (instance, state) => {
    // This fault is confined to this actor and restored even if the assertion fails.
    const object = instance as unknown as { env: Env };
    const counters = object.env.COUNTERS;
    object.env.COUNTERS = new Proxy(counters, { get(target, field) {
      if (field === "put") return async () => { throw new Error("fixture mirror unavailable"); };
      const value = Reflect.get(target, field); return typeof value === "function" ? value.bind(target) : value;
    } });
    try { await instance.correctMppHouseSale(sale, "registered after purchase"); }
    finally { object.env.COUNTERS = counters; }
    expect(await state.storage.getAlarm()).not.toBeNull();
    expect(await instance.readMppHouseCorrection(sale.id)).not.toBeNull();
    await instance.alarm();
  });
  await ledger().correctMppHouseSale(sale, "retried after mirror failure");
  expect(await readMppSales(bindings)).toMatchObject({ organic: 0, house: 1, reclassified_house: 1 });
  expect(JSON.parse((await ledger().readMppSale(sale.id))!)).toEqual(sale);
});
