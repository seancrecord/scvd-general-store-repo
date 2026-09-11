import { runInDurableObject } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ truncated: false }));
vi.mock("@/lib/kv-list", async original => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    const result = await actual.listKeys(...args);
    return fault.truncated && args[1].prefix === KV_KEYS.orderPrefix ? { ...result, truncated: true } : result;
  } };
});
import type { PaymentRequirements } from "@x402/core/types";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { SettlementDeclined } from "@/lib/payments";
import { recordInventorySale } from "@/services/orders";
import { beginPurchaseIntent } from "@/services/purchase-intent";
import { laborCapacity, type LaborReservation } from "@/services/labor-reservations";
import type { OrderRecord } from "@/types";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, baseline, call, sourceEnv, testEnv, object, NOW } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
afterEach(() => { fault.truncated = false; vi.restoreAllMocks(); });
async function input() {
  const menu = MENU_ITEMS.find(row => row.id === "the_collab")!, item = items.find(row => row.id === menu.id)!;
  const args = { item_id: item.id, ...baseline(item), detail: `SCVD-E2E storage ${crypto.randomUUID()}` };
  const quote = await call(item, "mcp", args, shelves(item)[0]!);
  const terms = quote.offers.find(offer => offer.network === laborNetworks()[0])! as PaymentRequirements;
  expect(terms).toBeDefined();
  const payload = await signLabor(terms);
  return { path: `/api/buy/${item.id}`, door: "mcp" as const, payer: String(object(object(payload.payload).authorization).from),
    terms, payload, request: JSON.stringify(args), item: menu };
}
async function expectUnavailable(promise: ReturnType<typeof beginPurchaseIntent>) {
  const result = await promise.catch(error => error);
  expect(result).toBeInstanceOf(SettlementDeclined);
  expect(await result.response.json()).toMatchObject({ code: "capacity_unavailable", charged: false, settlement_attempted: false });
  expect(transfers).toBe(0);
}
function legacy(status: OrderRecord["status"] = "queued"): OrderRecord {
  const item = MENU_ITEMS.find(row => row.id === "the_collab")!;
  return { order_id: `legacy-${crypto.randomUUID()}`, item_id: item.id, item_name: item.name, status,
    created_at: NOW.toISOString(), sla_hours: item.sla_hours!, cert_id: "legacy-certificate", patron_number: 1, paid_usdc: item.price_usdc, tip_usdc: 0 };
}
it("an incomplete initial ledger scan refuses before settlement", async () => {
  const request = await input(); fault.truncated = true;
  await expectUnavailable(beginPurchaseIntent(testEnv, request));
});
it("an unreadable initial order cannot count as an empty bench", async () => {
  const request = await input();
  await sourceEnv.ORDERS.put(KV_KEYS.order("broken-legacy"), "not-json");
  await expectUnavailable(beginPurchaseIntent(testEnv, request));
});
it("a retained legacy order disappearing cannot free its slot", async () => {
  const first = await input(), second = await input(), old = legacy();
  await sourceEnv.ORDERS.put(KV_KEYS.order(old.order_id), JSON.stringify(old));
  await beginPurchaseIntent(testEnv, first);
  await sourceEnv.ORDERS.delete(KV_KEYS.order(old.order_id));
  await expectUnavailable(beginPurchaseIntent(testEnv, second));
  const held = await runInDurableObject(laborCapacity(testEnv), async (_instance, state) =>
    [...(await state.storage.list<LaborReservation>({ prefix: "capacity:open:" })).values()]);
  expect(held).toHaveLength(1);
});
it("a weekly sale marker disappearing cannot be sold a second time", async () => {
  const first = await input(), second = await input(), old = legacy("completed");
  await sourceEnv.ORDERS.put(KV_KEYS.order(old.order_id), JSON.stringify(old));
  await recordInventorySale(testEnv, first.item, old);
  await beginPurchaseIntent(testEnv, first);
  await sourceEnv.COUNTERS.delete(`${KV_KEYS.inventory(first.item.id, currentWeekKey(NOW))}:${old.order_id}`);
  const refused = await beginPurchaseIntent(testEnv, second).catch(error => error);
  expect(refused).toBeInstanceOf(SettlementDeclined);
  expect(await refused.response.json()).toMatchObject({ code: "capacity_unavailable", charged: false, capacity_scope: "week", sold_this_week: first.item.weekly_inventory });
  expect(transfers).toBe(0);
});

for (const malformed of ["{}", JSON.stringify({ ...legacy(), order_id: "wrong-key" }), JSON.stringify({ ...legacy(), order_id: "broken-legacy", status: "unknown" })]) {
  it(`a structurally invalid legacy order fails closed: ${malformed.slice(0, 50)}`, async () => {
    const request = await input();
    await sourceEnv.ORDERS.put(KV_KEYS.order("broken-legacy"), malformed);
    await expectUnavailable(beginPurchaseIntent(testEnv, request));
  });
}
