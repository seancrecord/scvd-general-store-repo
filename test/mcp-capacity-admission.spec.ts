import { COMMISSION_ITEM_ID, COMMISSION_RUNGS } from "@/store/commission-desk";
import { decodePaymentRequired } from "./helpers/payment";
import { beforeEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ truncated: false }));
vi.mock("@/lib/kv-list", async (original) => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    const result = await actual.listKeys(...args);
    return fault.truncated && args[1].prefix === KV_KEYS.orderPrefix ? { ...result, truncated: true } : result;
  } };
});
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { remainingInventory } from "@/services/orders";
import { OPEN_LABOR_CAP, queueLoad } from "@/services/queue-capacity";
import type { MenuItem, OrderRecord } from "@/types";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, baseline, call, request, object, testEnv, sourceEnv, facilitator, type Obj } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
beforeEach(() => { fault.truncated = false; });
const labor = MENU_ITEMS.filter(item => item.fulfillment === "human_queue" && !item.stocked);
type Saturation = "item" | "house" | "unknown";
async function fillQueue(item: MenuItem, kind: Saturation) {
  const count = kind === "unknown" ? 0 : kind === "house" ? OPEN_LABOR_CAP : item.weekly_inventory!;
  // Old unfinished work persists across inventory weeks. House saturation uses
  // the OTHER item so this target's own cap cannot hide the global ceiling.
  const queuedItem = kind === "house" ? labor.find(other => other.id !== item.id)! : item;
  expect(queuedItem).toBeTruthy();
  for (let i = 0; i < count; i++) {
    const id = `ord_fixture_${crypto.randomUUID()}`;
    const order: OrderRecord = { order_id: id, item_id: queuedItem.id, item_name: queuedItem.name,
      status: "queued", created_at: new Date(Date.now() - 8 * 86400_000).toISOString(),
      sla_hours: queuedItem.sla_hours!, paid_usdc: queuedItem.price_usdc, tip_usdc: 0,
      patron_number: i + 1, cert_id: `cert_fixture_${i}` };
    await sourceEnv.ORDERS.put(KV_KEYS.order(id), JSON.stringify(order));
  }
  fault.truncated = kind === "unknown";
  const load = await queueLoad(testEnv);
  expect(load.open_total).toBe(count);
  expect(load.scan_capped).toBe(kind === "unknown");
  expect(await remainingInventory(testEnv, item)).toBe(item.weekly_inventory);
  return { count, cap: kind === "item" ? item.weekly_inventory! : OPEN_LABOR_CAP };
}
for (const menu of labor) for (const door of ["mcp", "mcp-standard"] as const) {
  for (const network of laborNetworks()) for (const kind of ["item", "house", "unknown"] as const) for (const paying of [false, true]) {
    it(`${menu.id} ${door} ${network} ${kind} ${paying ? "signed" : "unpaid"}: refuses new labor when queue capacity is unavailable`, async () => {
      const item = items.find(i => i.id === menu.id)!, args = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()}` };
      const quote = await call(item, "mcp", args, shelves(item)[0]!);
      expect(quote.quote).toBe(true);
      const payment = await signLabor(quote.offers.find(o => o.network === network)!);
      const { count, cap } = await fillQueue(menu, kind);
      const verifies = facilitator.verifyCalls;
      const refused = await sendLabor(item.id, door, args, paying ? payment : undefined, crypto.randomUUID());
      expect(refused.refused, JSON.stringify(refused.body)).toBe(true);
      expect(refused.quote).toBe(false);
      expect(refused.body).toMatchObject({ code: "capacity_unavailable", charged: false, open_orders: count, cap });
      expect(facilitator.verifyCalls - verifies).toBe(paying ? 1 : 0);
      expect(transfers).toBe(0);
      expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(count);
      const http = await sendLabor(item.id, "http", args, paying ? payment : undefined, crypto.randomUUID());
      expect(http.refused).toBe(true);
      expect(http.quote).toBe(false);
      expect(http.body).toMatchObject({ code: "capacity_unavailable", charged: false, open_orders: count, cap });
      expect(transfers).toBe(0);
    });
  }
}

it("MCP discovery describes unavailable capacity and a safe next step", async () => {
  const response = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list" }) });
  const tools = object(object(await response.json()).result).tools as Obj[];
  const purchases = tools.filter(tool => String(tool.name).startsWith("buy_"));
  expect(purchases.length).toBeGreaterThan(0);
  for (const tool of purchases) {
    const refusal = (tool.errors as Obj[]).find(error => error.code === "capacity_unavailable");
    const ids = [tool.itemId, ...(Array.isArray(tool.itemIds) ? tool.itemIds : [])];
    const humanShelf = ids.some(id => MENU_ITEMS.some(item => item.id === id && item.fulfillment === "human_queue"));
    if (humanShelf) {
      expect(refusal).toMatchObject({ jsonrpc: -32000, charged: false });
      expect(String(refusal?.what_to_do)).toMatch(/original payment/i);
    } else expect(refusal).toBeUndefined();
  }
});

for (const kind of ["house", "unknown"] as const) it(`machine shelves stay available with ${kind} labor capacity`, async () => {
  await fillQueue(labor[0]!, kind);
  for (const door of ["http", "mcp", "mcp-standard"] as const) {
    expect((await sendLabor("hello", door, {})).quote).toBe(true);
  }
  expect(transfers).toBe(0);
});

for (const network of laborNetworks()) for (const kind of ["item", "house", "unknown"] as const) for (const paying of [false, true]) {
  it(`commission ${network} ${kind} ${paying ? "signed" : "unpaid"}: capacity refusal is machine-readable`, async () => {
    const id = crypto.randomUUID(), rung = COMMISSION_RUNGS[0], now = new Date();
    const row = { id, description: `SCVD-E2E-${id}`, contact: "fixture@example.com", date: now.toISOString(),
      offer_usdc: rung, status: "quoted", quote_usdc: rung, quote_window_hours: 72, quoted_at: now.toISOString(),
      quote_expires_at: new Date(now.getTime() + 86400000).toISOString(), quote_note: "Original scope" };
    await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify(row));
    const path = `/api/commission/pay/${rung}?commission=${id}`;
    const quote = await request(path); expect(quote.status).toBe(402);
    const payment = await signLabor(decodePaymentRequired(quote).accepts.find(o => o.network === network)!);
    const { count, cap } = await fillQueue(labor.find(item => item.id === COMMISSION_ITEM_ID)!, kind);
    const verifies = facilitator.verifyCalls;
    const refused = await request(path, paying ? { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), "Idempotency-Key": crypto.randomUUID() } } : undefined);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: "capacity_unavailable", charged: false, open_orders: count, cap });
    expect(facilitator.verifyCalls - verifies).toBe(paying ? 1 : 0);
    expect(transfers).toBe(0);
    expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(count);
  });
}
