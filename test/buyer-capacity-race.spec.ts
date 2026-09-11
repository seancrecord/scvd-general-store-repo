import { afterEach, expect, it, vi } from "vitest";
import * as capacity from "@/services/queue-capacity";
import { KV_KEYS } from "@/lib/kv-keys";
import { recordInventorySale } from "@/services/orders";
import { MENU_ITEMS } from "@/store";
import type { OrderRecord } from "@/types";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, shelves, baseline, call, sourceEnv, NOW } from "./helpers/buyer-harness";
installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
for (const kind of ["house", "item", "week"] as const) for (const network of laborNetworks()) for (const doors of [["http", "http"], ["mcp", "mcp-standard"], ["http", "mcp"]] as const) {
  it(`${kind} ${network} ${doors.join("+")}: concurrent buyers cannot both buy the final human slot`, async () => {
    const item = items.find(row => row.id === "the_collab")!;
    const older = MENU_ITEMS.find(row => row.fulfillment === "human_queue" && row.id !== item.id)!;
    const menu = MENU_ITEMS.find(row => row.id === item.id)!;
    const cap = kind === "house" ? capacity.OPEN_LABOR_CAP : menu.weekly_inventory!;
    for (let n = 0; n < cap - 1; n++) {
      const order: OrderRecord = { order_id: `legacy-${n}`, cert_id: `legacy-cert-${n}`, item_id: kind === "house" ? older.id : item.id, item_name: kind === "house" ? older.name : menu.name, patron_number: n + 1,
        created_at: kind === "week" ? NOW.toISOString() : new Date(NOW.getTime() - 8 * 86400000).toISOString(), status: kind === "week" ? "completed" : "queued", sla_hours: 168, paid_usdc: item.price_usdc, tip_usdc: 0 };
      await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
      if (kind === "week") await recordInventorySale(sourceEnv, menu, order);
    }
    const args = { ...baseline(item), detail: "SCVD-E2E final-slot race" };
    const quote = await call(item, "mcp", args, shelves(item)[0]!);
    expect(quote.quote, JSON.stringify(quote.body)).toBe(true);
    const payments = await Promise.all(doors.map(() => signLabor(quote.offers.find(offer => offer.network === network)!)));
    // Hold both real admission verdicts after they have counted six open orders.
    // The reservation must arbitrate the last slot after this optimistic check.
    let entered = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const count = capacity.capacityVerdict;
    vi.spyOn(capacity, "capacityVerdict").mockImplementation(async (...inputs) => {
      const verdict = await count(...inputs);
      if (verdict.ok) { if (++entered === doors.length) release(); await ready; }
      return verdict;
    });
    const results = await Promise.all(doors.map((door, n) => sendLabor(item.id, door, args, payments[n], crypto.randomUUID())));
    expect(entered).toBe(doors.length);
    expect(transfers).toBe(1);
    expect(results.filter(result => !result.refused)).toHaveLength(1);
    const refused = results.find(result => result.refused)!;
    expect(refused.body).toMatchObject({ code: "capacity_unavailable", charged: false, cap });
    expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(cap);
  });
}
