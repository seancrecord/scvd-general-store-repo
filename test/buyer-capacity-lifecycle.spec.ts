import type { PaymentRequirements } from "@x402/core/types";
import { solFacts } from "./helpers/buyer-signed-payments";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import * as orderService from "@/services/orders";
import { SettlementDeclined } from "@/lib/payments";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { completeOrder } from "@/services/orders";
import { beginPurchaseIntent, purchaseIntentStore } from "@/services/purchase-intent";
import { laborCapacity, LaborCapacityStore, type LaborReservation } from "@/services/labor-reservations";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, baseline, call, testEnv, facilitator, object, NOW } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
let settlementTime: Date | undefined;
let settlementFixture: "none" | "declined" | "uncertain" = "none";
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/settle") && settlementFixture !== "none") {
      facilitator.settleCalls++;
      // Return the actual transport shape outside the basic harness's JSON
      // rewriting. A definitive failure names no landed transaction.
      if (settlementFixture === "uncertain") return new Response("upstream unavailable", { status: 502 });
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      const network = String(object(body.paymentRequirements).network);
      const payer = network.startsWith("solana:") ? (await solFacts(wire)).payer : String(object(object(wire.payload).authorization).from);
      return Response.json({ success: false, errorReason: "insufficient_funds", transaction: "", network, payer });
    }
    const response = await inner(input, init);
    if (settlementTime && url.pathname.endsWith("/x402/settle")) vi.setSystemTime(settlementTime);
    return response;
  });
});
afterEach(() => { settlementFixture = "none"; settlementTime = undefined; vi.restoreAllMocks(); vi.setSystemTime(NOW); });
async function fixture(network = laborNetworks()[0]!) {
  const item = items.find(row => row.id === "the_collab")!, menu = MENU_ITEMS.find(row => row.id === item.id)!;
  const args = { ...baseline(item), detail: `SCVD-E2E capacity lifecycle ${crypto.randomUUID()}` };
  const quote = await call(item, "mcp", args, shelves(item)[0]!);
  const terms = quote.offers.find(offer => offer.network === network)! as PaymentRequirements;
  expect(terms).toBeDefined();
  const payment = await signLabor(terms);
  return { item, menu, args, terms, payment };
}
async function held() {
  return runInDurableObject(laborCapacity(testEnv), async (_instance, state) =>
    [...(await state.storage.list<LaborReservation>({ prefix: "capacity:open:" })).values()]);
}
for (const network of laborNetworks()) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door} ${network}: definitive failed settlement releases its reservation`, async () => {
    const { item, args, payment } = await fixture(network);
    settlementFixture = "declined";
    const refused = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(refused.refused).toBe(true); expect(transfers).toBe(0);
    expect(await held()).toHaveLength(0);
    settlementFixture = "none";
    const next = await fixture(network);
    const sold = await sendLabor(item.id, door, next.args, next.payment, crypto.randomUUID());
    expect(sold.refused, JSON.stringify(sold.body)).toBe(false);
    expect(await held()).toHaveLength(1); expect(transfers).toBe(1);
  });
  it(`${door} ${network}: uncertain settlement retains capacity across the weekly boundary`, async () => {
    const { item, args, payment } = await fixture(network);
    settlementFixture = "uncertain";
    const uncertain = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(uncertain.refused).toBe(true);
    const second = await fixture(network);
    settlementFixture = "uncertain";
    expect((await sendLabor(item.id, door, second.args, second.payment, crypto.randomUUID())).refused).toBe(true);
    const future = await fixture(network);
    const before = await held(); expect(before).toHaveLength(2);
    expect(before.every(row => row.state === "held")).toBe(true);
    vi.setSystemTime(new Date(NOW.getTime() + 8 * 86400000));
    const payer = network.startsWith("eip155:")
      ? String(object(object(future.payment.payload).authorization).from)
      : (await solFacts(future.payment)).payer;
    // A fresh week does not turn either unresolved payment into free capacity.
    const refused = await beginPurchaseIntent(testEnv, { path: `/api/buy/${item.id}`, door: "mcp", payer,
      terms: future.terms, payload: future.payment, request: JSON.stringify({ item_id: item.id, ...future.args }), item: future.menu }).catch(error => error);
    expect(refused).toBeInstanceOf(SettlementDeclined);
    expect(await refused.response.json()).toMatchObject({ code: "capacity_unavailable", charged: false, capacity_scope: "item", cap: future.menu.weekly_inventory });
    expect(await held()).toEqual(before);
    expect(transfers).toBe(0);
  });
}
it("completion frees open capacity while retaining the week's sale", async () => {
  const { item, args, payment } = await fixture();
  const sold = await sendLabor(item.id, "http", args, payment, crypto.randomUUID());
  expect(sold.refused).toBe(false); expect(await held()).toHaveLength(1);
  const orderId = String(sold.body.order_id);
  await completeOrder(testEnv, orderId, "SCVD-E2E original completed work");
  expect(await held()).toHaveLength(0);
  const weeks = await runInDurableObject(laborCapacity(testEnv), async (_instance, state) =>
    [...(await state.storage.list<LaborReservation>({ prefix: "capacity:week:" })).values()]);
  expect(weeks).toHaveLength(1); expect(weeks[0]).toMatchObject({ order_id: orderId, state: "completed" });
});
it("same authenticated purchase cannot reserve a second slot", async () => {
  const { item, menu, args, terms, payment } = await fixture();
  const payer = String(object(object(payment.payload).authorization).from);
  const input = { path: `/api/buy/${item.id}`, door: "mcp" as const, payer, terms, payload: payment,
    request: JSON.stringify({ item_id: item.id, ...args }), item: menu };
  const original = await beginPurchaseIntent(testEnv, input);
  await expect(beginPurchaseIntent(testEnv, input)).rejects.toMatchObject({ record: { id: original.id } });
  expect(await held()).toHaveLength(1);
  await purchaseIntentStore(testEnv, original.id).updatePurchase({ state: "not_settled" });
  expect(await held()).toHaveLength(0);
});

it("a lost reservation acknowledgement never reaches settlement and releases the unpaid hold", async () => {
  const f = await fixture();
  const reserve = LaborCapacityStore.prototype.reserve;
  vi.spyOn(LaborCapacityStore.prototype, "reserve").mockImplementationOnce(async function (this: LaborCapacityStore, ...args) {
    await reserve.apply(this, args);
    throw new Error("fixture drops reserved acknowledgement");
  });
  const result = await sendLabor(f.item.id, "http", f.args, f.payment, crypto.randomUUID());
  expect(result.body).toMatchObject({ code: "capacity_unavailable", charged: false, settlement_attempted: false });
  expect(transfers).toBe(0); expect(await held()).toHaveLength(0);
});
it("a missed unpaid release is reconciled before a later reservation", async () => {
  const f = await fixture();
  vi.spyOn(LaborCapacityStore.prototype, "notSettled").mockRejectedValueOnce(new Error("fixture release unavailable"));
  settlementFixture = "declined";
  expect((await sendLabor(f.item.id, "http", f.args, f.payment, crypto.randomUUID())).refused).toBe(true);
  expect(transfers).toBe(0); expect(await held()).toHaveLength(1);
  settlementFixture = "none";
  const next = await fixture();
  expect((await sendLabor(next.item.id, "mcp", next.args, next.payment, crypto.randomUUID())).refused).toBe(false);
  expect(transfers).toBe(1); expect(await held()).toHaveLength(1);
});
it("a paid order write failure keeps its hold and retry links the original order once", async () => {
  const f = await fixture();
  vi.spyOn(orderService, "createOrder").mockRejectedValueOnce(new Error("fixture order write unavailable"));
  const first = await sendLabor(f.item.id, "http", f.args, f.payment, crypto.randomUUID());
  expect(first.refused).toBe(true); expect(transfers).toBe(1);
  const before = await held(); expect(before).toHaveLength(1); expect(before[0]?.order_id).toBeUndefined();
  const retry = await sendLabor(f.item.id, "http", f.args, f.payment);
  expect(retry.refused, JSON.stringify(retry.body)).toBe(false);
  expect(transfers).toBe(1);
  const after = await held(); expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ purchase_id: before[0]!.purchase_id, order_id: retry.body.order_id });
});
it("completion survives a missed capacity update and the next reservation reconciles it", async () => {
  const f = await fixture();
  const sale = await sendLabor(f.item.id, "http", f.args, f.payment, crypto.randomUUID());
  expect(sale.refused).toBe(false);
  const orderId = String(sale.body.order_id);
  vi.spyOn(LaborCapacityStore.prototype, "noteOrder").mockRejectedValueOnce(new Error("fixture completed hold update unavailable"));
  await expect(completeOrder(testEnv, orderId, "SCVD-E2E completed before missed update")).rejects.toThrow();
  expect((await orderService.getOrder(testEnv, orderId))?.status).toBe("completed");
  expect(await held()).toHaveLength(1);
  const next = await fixture();
  const sale2 = await sendLabor(next.item.id, "http", next.args, next.payment, crypto.randomUUID());
  expect(sale2.refused, JSON.stringify(sale2.body)).toBe(false);
  const remaining = await held(); expect(remaining).toHaveLength(1); expect(remaining[0]?.order_id).toBe(sale2.body.order_id);
});

for (const door of ["http", "mcp", "mcp-standard"] as const) it(`${door}: settlement crossing midnight cannot move the reserved sale into a different week`, async () => {
  const admittedAt = new Date("2026-09-06T23:59:59.000Z");
  vi.setSystemTime(admittedAt);
  const f = await fixture();
  settlementTime = new Date("2026-09-07T00:00:01.000Z");
  const result = await sendLabor(f.item.id, door, f.args, f.payment, crypto.randomUUID());
  expect(result.refused, JSON.stringify(result.body)).toBe(false);
  const order = await orderService.getOrder(testEnv, String(result.body.order_id));
  expect(order?.created_at).toBe(admittedAt.toISOString());
  const holds = await held(); expect(holds).toHaveLength(1);
  expect(holds[0]?.week).toBe(currentWeekKey(admittedAt));
  const marker = `${KV_KEYS.inventory(f.item.id, currentWeekKey(admittedAt))}:${order!.order_id}`;
  expect(await testEnv.COUNTERS.get(marker)).toBe("1");
});
