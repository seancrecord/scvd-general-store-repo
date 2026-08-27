import { listKeys } from "@/lib/kv-list";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { markLaborClosed, markLaborOpen } from "@/services/queue-capacity";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newOrderId } from "@/lib/ids";
import type { Env, MenuItem, OrderRecord } from "@/types";
import { outboundHeaders } from "@/lib/identity";
import { kvPut } from "@/lib/kv-retry";

/** Ceiling on a inventory counters scan. An unnamed cap is a silent one. */
const INVENTORY_CAP = 2000;

/** Ceiling on a orders scan. Named because an unnamed cap is a silent one. */
const ORDER_CAP = 1000;

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
  /**
   * A per-order delivery window, in hours. The Commission Desk's
   * quotes carry their own promised window (that is most of the desk's
   * point); everything else inherits the item's listed SLA as before.
   */
  slaHours?: number;
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
    sla_hours: options.slaHours ?? options.item.sla_hours ?? 168,
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
  await kvPut(env.ORDERS, KV_KEYS.order(order.order_id), JSON.stringify(order));
  /*
   * INDEX IT IF IT IS LABOR, so the bench can count what is promised
   * without walking every order the store has ever taken. The order
   * above is the truth; this is only how the bench finds it.
   */
  await markLaborOpen(env, order);
  return order;
}

export async function getOrder(
  env: Env,
  orderId: string,
): Promise<OrderRecord | null> {
  return env.ORDERS.get<OrderRecord>(KV_KEYS.order(orderId), "json");
}

export async function listOrders(env: Env): Promise<OrderRecord[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.orderPrefix, cap: ORDER_CAP });
  const values = await bulkGetJson<OrderRecord>(
    env.ORDERS,
    listed.names,
  );
  const orders: OrderRecord[] = [];
  for (const order of values.values()) {
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
  await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
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
  await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
  // Finished work stops occupying the bench. A missed delete only ever
  // over-refuses, and the next bench read sweeps it.
  await markLaborClosed(env, orderId);

  if (order.callback_url) {
    // Best effort, a broken webhook never blocks the keeper's afternoon
    // — but the OUTCOME is recorded either way (2026-08-20). fetch does
    // not throw on a 500, so before this a dead callback lost the
    // notice invisibly: the buyer asked to be told, nobody was, and no
    // record anywhere said so. The order page now carries the miss,
    // which is also the buyer's cue that polling the order URL is on
    // them from here.
    try {
      const response = await fetch(order.callback_url, {
        method: "POST",
        // The one outbound call that lands in a BUYER's log. Identity
        // attached for the same reason the certificates are signed:
        // whoever reads it later should be able to trace it back.
        headers: outboundHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          order_id: order.order_id,
          item_id: order.item_id,
          status: order.status,
          deliverable: order.deliverable,
        }),
      });
      order.webhook = response.ok
        ? `delivered (HTTP ${response.status})`
        : `attempted once, your endpoint answered HTTP ${response.status} — not retried; the deliverable stays at this order URL forever`;
    } catch {
      // The bell rings on; delivery is still visible at /api/order/:id.
      order.webhook =
        "attempted once, your endpoint was unreachable — not retried; the deliverable stays at this order URL forever";
    }
    await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
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

/**
 * Returns the post-sale sold count (null for unstocked items) so the
 * caller can notice an oversell. THE RACE THIS CANNOT PREVENT, said
 * plainly (Part A audit, 2026-08-03, CV's predicted finding confirmed
 * by code read): this is a read-modify-write against KV with no
 * coordination, and the stock gate runs BEFORE the payment gate — two
 * concurrent buyers at remaining=1 both pass the check, both settle,
 * both land here. KV has no transactions, so the honest design is not
 * pretending to prevent the race but refusing to let it be SILENT:
 * the caller compares the returned count against the ceiling and
 * flags the oversold order for the keeper's refund hand. Money taken
 * past the ceiling becomes a loud, tracked event instead of a quiet
 * (N+1)th order in the queue. The count itself can also UNDERCOUNT
 * under the same race (lost increment), which makes the returned
 * number a floor — one more reason detection lives at the caller
 * with the ceiling in hand, not buried in a counter nobody rereads.
 */
export async function recordInventorySale(
  env: Env,
  item: MenuItem,
): Promise<number | null> {
  if (item.weekly_inventory === undefined) {
    return null;
  }
  const key = KV_KEYS.inventory(item.id, currentWeekKey());
  const sold = await env.COUNTERS.get(key);
  const now = (sold ? parseInt(sold, 10) : 0) + 1;
  await kvPut(env.COUNTERS, key, String(now));
  return now;
}

export async function resetWeeklyInventory(env: Env): Promise<void> {
  const listed = await listKeys(env.COUNTERS, { prefix: `inventory:`, cap: INVENTORY_CAP });
  for (const name of listed.names) {
    await env.COUNTERS.delete(name);
  }
}
