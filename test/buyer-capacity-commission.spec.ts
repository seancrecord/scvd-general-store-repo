import { afterEach, expect, it, vi } from "vitest";
import * as capacity from "@/services/queue-capacity";
import { MENU_ITEMS } from "@/store";
import { COMMISSION_ITEM_ID, COMMISSION_RUNGS } from "@/store/commission-desk";
import { KV_KEYS } from "@/lib/kv-keys";
import type { OrderRecord } from "@/types";
import { decodePaymentRequired } from "./helpers/payment";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, request, sourceEnv, NOW, object } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
async function commission(network: string) {
  const id = crypto.randomUUID(), rung = COMMISSION_RUNGS[0];
  await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify({ id, description: `SCVD-E2E reserved commission ${id}`,
    contact: "fixture@example.com", date: NOW.toISOString(), offer_usdc: rung, status: "quoted", quote_usdc: rung,
    quote_window_hours: 72, quoted_at: NOW.toISOString(), quote_expires_at: new Date(NOW.getTime() + 86400000).toISOString(), quote_note: "Fixture scope" }));
  const path = `/api/commission/pay/${rung}?commission=${id}`;
  const quote = await request(path); expect(quote.status).toBe(402);
  const payment = await signLabor(decodePaymentRequired(quote).accepts.find(offer => offer.network === network)!);
  return async () => {
    const response = await request(path, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), "Idempotency-Key": crypto.randomUUID() } });
    return { refused: response.status >= 400, body: object(await response.json()) };
  };
}
for (const network of laborNetworks()) for (const other of ["http", "mcp", "mcp-standard", "commission"] as const) {
  it(`commission + ${other} ${network}: agreed-price purchases share the same final human slot`, async () => {
    const older = MENU_ITEMS.find(item => item.fulfillment === "human_queue" && item.id !== COMMISSION_ITEM_ID)!;
    for (let n = 0; n < capacity.OPEN_LABOR_CAP - 1; n++) {
      const order: OrderRecord = { order_id: `legacy-${n}`, item_id: older.id, item_name: older.name, status: "queued",
        created_at: new Date(NOW.getTime() - 8 * 86400000).toISOString(), sla_hours: older.sla_hours ?? 168,
        cert_id: `legacy-cert-${n}`, patron_number: n + 1, paid_usdc: older.price_usdc, tip_usdc: 0 };
      await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
    }
    const first = await commission(network);
    const item = items.find(row => row.id === COMMISSION_ITEM_ID)!, args = { ...baseline(item), detail: "SCVD-E2E catalogue capacity" };
    const quote = await call(item, "mcp", args, shelves(item)[0]!);
    const payment = await signLabor(quote.offers.find(offer => offer.network === network)!);
    const second = other === "commission" ? await commission(network) : () => sendLabor(item.id, other, args, payment, crypto.randomUUID());
    let entered = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), original = capacity.capacityVerdict;
    vi.spyOn(capacity, "capacityVerdict").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (result.ok) { if (++entered === 2) release(); await barrier; }
      return result;
    });
    const results = await Promise.all([first(), second()]);
    expect(entered).toBe(2); expect(transfers).toBe(1);
    expect(results.filter(result => !result.refused)).toHaveLength(1);
    expect(results.find(result => result.refused)?.body).toMatchObject({ code: "capacity_unavailable", charged: false, capacity_scope: "house" });
    expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(capacity.OPEN_LABOR_CAP);
  });
}
