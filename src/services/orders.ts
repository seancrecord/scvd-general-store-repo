import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { newOrderId } from "@/lib/ids";
import type { Env, MenuItem, OrderRecord } from "@/types";

/**
 * Order ledger: human-queue purchases, weekly inventory, completion webhooks.
 */

export interface CreateOrderOptions {
  item: MenuItem;
  paidUsdc: number;
  tipUsdc: number;
  payer?: string;
  agentName?: string;
  callbackUrl?: string;
  patronNumber: number;
  certId: string;
  /** Buyer-supplied task detail (quick_judgment's question). Untrusted. */
  detail?: string;
  /** Declared discovery channel. Untrusted. */
  source?: string;
  userAgent?: string;
  referrer?: string;
}

export async function createOrder(
  env: Env,
  options: CreateOrderOptions,
): Promise<OrderRecord> {
  const order: OrderRecord = {
    order_id: newOrderId(),
    item_id: options.item.id,
    item_name: options.item.name,
    status: "queued",
    created_at: new Date().toISOString(),
    sla_hours: options.item.sla_hours ?? 168,
    paid_usdc: options.paidUsdc,
    tip_usdc: options.tipUsdc,
    patron_number: options.patronNumber,
    cert_id: options.certId,
  };
  if (options.payer) {
    order.payer = options.payer;
  }
  if (options.agentName) {
    order.agent_name = options.agentName;
  }
  if (options.callbackUrl) {
    order.callback_url = options.callbackUrl;
  }
  if (options.detail) {
    order.detail = options.detail;
  }
  if (options.source) {
    order.source = options.source;
  }
  if (options.userAgent) {
    order.user_agent = options.userAgent;
  }
  if (options.referrer) {
    order.referrer = options.referrer;
  }
  await env.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
  return order;
}

export async function getOrder(
  env: Env,
  orderId: string,
): Promise<OrderRecord | null> {
  return env.ORDERS.get<OrderRecord>(KV_KEYS.order(orderId), "json");
}

export async function listOrders(env: Env): Promise<OrderRecord[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.orderPrefix });
  const orders: OrderRecord[] = [];
  for (const key of listed.keys) {
    const order = await env.ORDERS.get<OrderRecord>(key.name, "json");
    if (order) {
      orders.push(order);
    }
  }
  orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return orders;
}

/** The keeper saw it; the 24h SLA-guard page stands down. */
export async function acknowledgeOrder(
  env: Env,
  orderId: string,
): Promise<OrderRecord | null> {
  const order = await getOrder(env, orderId);
  if (!order) {
    return null;
  }
  order.acknowledged_at = new Date().toISOString();
  await env.ORDERS.put(KV_KEYS.order(orderId), JSON.stringify(order));
  return order;
}

export async function completeOrder(
  env: Env,
  orderId: string,
  deliverable: string,
): Promise<OrderRecord | null> {
  const order = await getOrder(env, orderId);
  if (!order) {
    return null;
  }
  order.status = "completed";
  order.deliverable = deliverable;
  order.completed_at = new Date().toISOString();
  await env.ORDERS.put(KV_KEYS.order(orderId), JSON.stringify(order));

  if (order.callback_url) {
    // Best effort, a broken webhook never blocks the keeper's afternoon.
    try {
      await fetch(order.callback_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.order_id,
          item_id: order.item_id,
          status: order.status,
          deliverable: order.deliverable,
        }),
      });
    } catch {
      // The bell rings on; delivery is still visible at /api/order/:id.
    }
  }
  return order;
}

/**
 * Weekly inventory for scarce items. Counts sold-this-week against the
 * item's weekly_inventory; the ISO-week key makes the reset automatic.
 */
export async function remainingInventory(
  env: Env,
  item: MenuItem,
): Promise<number | null> {
  if (item.weekly_inventory === undefined) {
    return null;
  }
  const key = KV_KEYS.inventory(item.id, currentWeekKey());
  const sold = await env.COUNTERS.get(key);
  return Math.max(0, item.weekly_inventory - (sold ? parseInt(sold, 10) : 0));
}

export async function recordInventorySale(
  env: Env,
  item: MenuItem,
): Promise<void> {
  if (item.weekly_inventory === undefined) {
    return;
  }
  const key = KV_KEYS.inventory(item.id, currentWeekKey());
  const sold = await env.COUNTERS.get(key);
  await env.COUNTERS.put(key, String((sold ? parseInt(sold, 10) : 0) + 1));
}

export async function resetWeeklyInventory(env: Env): Promise<void> {
  const listed = await env.COUNTERS.list({
    prefix: `inventory:`,
  });
  for (const key of listed.keys) {
    await env.COUNTERS.delete(key.name);
  }
}
