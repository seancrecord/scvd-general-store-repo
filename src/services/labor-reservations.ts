import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { kvGet, kvGetJson } from "@/lib/kv-retry";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { hydrateOrders, currentOrder } from "@/services/managed-orders";
import { OPEN_LABOR_CAP, QUEUE_SCAN_CAP, LABOR_ITEM_IDS } from "@/services/queue-capacity";
import { ORDER_STATUSES, type Env, type MenuItem, type OrderRecord } from "@/types";

// One coordination atom: this keeper's shared bench. Machine purchases never
// visit it. Payment and fulfillment run outside its storage transaction.
export const LABOR_CAPACITY_ID = "labor-capacity:v1";
export function laborCapacity(env: Env) {
  if (!env.PAID_RECOVERIES) throw new Error("Labor capacity unavailable");
  return env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(LABOR_CAPACITY_ID));
}
export interface LaborReservation {
  purchase_id: string; item_id: string; week: string; created_at: string;
  state: "held" | "completed" | "not_settled"; order_id?: string;
}
export type LaborAdmission = { ok: true } | { ok: false; open: number; cap: number; scope: "house" | "item" | "week" };
type LegacyLabor = Pick<OrderRecord, "order_id" | "item_id" | "created_at" | "status">;
const reservationKey = (id: string) => `capacity:purchase:${id}`;
const openKey = (id: string) => `capacity:open:${id}`;
const legacyKey = (id: string) => `capacity:legacy:${id}`;
const closedKey = (id: string) => `capacity:closed:${id}`;
const weekPrefix = (item: string, week: string) => `capacity:week:${item}:${week}:`;
const weekKey = (value: LaborReservation) => `${weekPrefix(value.item_id, value.week)}${value.purchase_id}`;

export class LaborCapacityStore {
  constructor(private storage: DurableObjectStorage, private env: Env) {}

  private async legacySnapshot(): Promise<OrderRecord[]> {
    const held = [...(await this.storage.list<LaborReservation>({ prefix: "capacity:open:" })).values()];
    for (const row of held) {
      const raw = await this.env.PAID_RECOVERIES!.get(this.env.PAID_RECOVERIES!.idFromName(`purchase:${row.purchase_id}`)).existingPurchase();
      if (!raw) throw new Error("Reserved purchase unavailable");
      const purchase = JSON.parse(raw) as import("@/services/purchase-intent").PurchaseIntent;
      if (purchase.state === "not_settled") { await this.notSettled(row.purchase_id); continue; }
      const orderId = row.order_id ?? (typeof purchase.delivery?.order_id === "string" ? purchase.delivery.order_id : undefined);
      if (orderId) {
        const listed = await kvGetJson<OrderRecord>(this.env.ORDERS, KV_KEYS.order(orderId), "json");
        const order = await currentOrder(this.env, orderId, listed);
        if (!order) throw new Error("Reserved order unavailable");
        await this.noteOrder(order, row.purchase_id);
      }
    }

    const initialized = await this.storage.get<boolean>("capacity:initialized");
    let names: string[];
    if (!initialized) {
      // Import the old ledger once, before the first reservation. An incomplete
      // initial inventory is a refusal, never an empty bench. Later reads walk
      // only retained open legacy work, not the store's lifetime order count.
      const keys = await listKeys(this.env.ORDERS, { prefix: KV_KEYS.orderPrefix, cap: QUEUE_SCAN_CAP });
      if (keys.truncated) throw new Error("Legacy labor scan incomplete");
      names = keys.names;
    } else {
      const rows = await this.storage.list<LegacyLabor>({ prefix: "capacity:legacy:", limit: QUEUE_SCAN_CAP + 1 });
      if (rows.size > QUEUE_SCAN_CAP) throw new Error("Legacy labor scan incomplete");
      names = [...rows.values()].map(row => KV_KEYS.order(row.order_id));
    }
    const listed = await bulkGetJson<OrderRecord>(this.env.ORDERS, names);
    const hydrated = await hydrateOrders(this.env, listed);
    const orders: OrderRecord[] = [];
    for (const key of names) {
      const order = hydrated.get(key);
      if (!order || order.order_id !== key.slice(KV_KEYS.orderPrefix.length) || typeof order.item_id !== "string" || !order.item_id ||
        !ORDER_STATUSES.includes(order.status) || !Number.isFinite(Date.parse(order.created_at))) throw new Error("Legacy order unavailable");
      if (LABOR_ITEM_IDS.has(order.item_id)) orders.push(order);
    }
    return orders;
  }

  async reserve(purchaseId: string, item: MenuItem, at: string): Promise<LaborAdmission> {
    if (item.fulfillment !== "human_queue") throw new Error("Not a labor purchase");
    if (!/^[a-f0-9]{64}$/.test(purchaseId) || !Number.isFinite(Date.parse(at))) throw new Error("Invalid labor identity");
    const week = currentWeekKey(new Date(at));
    const legacy = await this.legacySnapshot();
    let counter = 0, sales: string[] = [];
    if (item.weekly_inventory !== undefined) {
      const key = KV_KEYS.inventory(item.id, week), raw = await kvGet(this.env.COUNTERS, key);
      if (raw !== null && !/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error("Legacy inventory unreadable");
      counter = raw === null ? 0 : Number(raw);
      if (!Number.isSafeInteger(counter)) throw new Error("Legacy inventory unreadable");
      const keys = await listKeys(this.env.COUNTERS, { prefix: `${key}:`, cap: QUEUE_SCAN_CAP });
      if (keys.truncated) throw new Error("Legacy inventory scan incomplete");
      sales = keys.names.map(name => name.slice(key.length + 1));
    }
    return this.storage.transaction(async txn => {
      const prior = await txn.get<LaborReservation>(reservationKey(purchaseId));
      if (prior) {
        if (prior.item_id !== item.id || prior.created_at !== at || prior.state !== "held") throw new Error("Labor reservation mismatch");
        return { ok: true };
      }
      for (const order of legacy) {
        if (order.status === "completed") {
          await txn.put(closedKey(order.order_id), true);
          await txn.delete(legacyKey(order.order_id));
        } else if (!await txn.get(closedKey(order.order_id))) {
          await txn.put(legacyKey(order.order_id), { order_id: order.order_id, item_id: order.item_id, created_at: order.created_at, status: order.status } satisfies LegacyLabor);
        }
      }
      await txn.put("capacity:initialized", true);
      const held = [...(await txn.list<LaborReservation>({ prefix: "capacity:open:" })).values()];
      const older = [...(await txn.list<LegacyLabor>({ prefix: "capacity:legacy:" })).values()];
      const linked = new Set(held.map(row => row.order_id).filter(Boolean));
      const open = [...held, ...older.filter(row => !linked.has(row.order_id))];
      const itemOpen = open.filter(row => row.item_id === item.id).length;
      if (open.length >= OPEN_LABOR_CAP) return { ok: false, open: open.length, cap: OPEN_LABOR_CAP, scope: "house" };
      if (item.weekly_inventory !== undefined && itemOpen >= item.weekly_inventory) return { ok: false, open: itemOpen, cap: item.weekly_inventory, scope: "item" };
      const proposed: LaborReservation = { purchase_id: purchaseId, item_id: item.id, week, created_at: at, state: "held" };
      if (item.weekly_inventory !== undefined) {
        const baselineKey = `capacity:sales:${item.id}:${week}`;
        const baseline = await txn.get<{ counter: number; ids: string[] }>(baselineKey);
        const ids = new Set([...(baseline?.ids ?? []), ...sales]);
        counter = Math.max(counter, baseline?.counter ?? 0);
        await txn.put(baselineKey, { counter, ids: [...ids] });
        const reserved = [...(await txn.list<LaborReservation>({ prefix: weekPrefix(item.id, week) })).values()];
        const sold = counter + ids.size + reserved.filter(row => !row.order_id || !ids.has(row.order_id)).length;
        if (sold >= item.weekly_inventory) return { ok: false, open: sold, cap: item.weekly_inventory, scope: "week" };
        await txn.put(weekKey(proposed), proposed);
      }
      await txn.put(reservationKey(purchaseId), proposed);
      await txn.put(openKey(purchaseId), proposed);
      return { ok: true };
    });
  }

  async notSettled(purchaseId: string): Promise<void> {
    await this.storage.transaction(async txn => {
      const row = await txn.get<LaborReservation>(reservationKey(purchaseId));
      if (!row || row.state === "not_settled") return;
      if (row.order_id || row.state === "completed") throw new Error("Cannot release delivered labor as unpaid");
      await txn.put(reservationKey(purchaseId), { ...row, state: "not_settled" });
      await txn.delete(openKey(purchaseId));
      await txn.delete(weekKey(row));
    });
  }

  async noteOrder(order: OrderRecord, purchaseId?: string): Promise<void> {
    if (!LABOR_ITEM_IDS.has(order.item_id)) return;
    await this.storage.transaction(async txn => {
      const row = purchaseId ? await txn.get<LaborReservation>(reservationKey(purchaseId)) : undefined;
      if (row) {
        if (row.item_id !== order.item_id || row.state === "not_settled" || (row.order_id && row.order_id !== order.order_id)) throw new Error("Labor order mismatch");
        const value: LaborReservation = { ...row, order_id: order.order_id, state: order.status === "completed" || row.state === "completed" ? "completed" : "held" };
        await txn.put(reservationKey(row.purchase_id), value);
        if (value.state === "held") await txn.put(openKey(row.purchase_id), value);
        else await txn.delete(openKey(row.purchase_id));
        if (await txn.get(weekKey(row))) await txn.put(weekKey(row), value);
        await txn.delete(legacyKey(order.order_id));
      } else if (order.status !== "completed" && !await txn.get(closedKey(order.order_id))) {
        // An older paid obligation still gets fulfilled. It consumes capacity
        // once found; it is never subjected to a fresh-sale admission check.
        await txn.put(legacyKey(order.order_id), { order_id: order.order_id, item_id: order.item_id, created_at: order.created_at, status: order.status } satisfies LegacyLabor);
      }
      if (order.status === "completed") {
        await txn.put(closedKey(order.order_id), true);
        await txn.delete(legacyKey(order.order_id));
      }
    });
  }
}
