import type { ArtifactCheckpoint } from "@/lib/artifact-checkpoint";
import { currentOrder, hydrateOrders, writeManagedOrder } from "@/services/managed-orders";
import { listKeys } from "@/lib/kv-list";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { markLaborClosed, markLaborOpen } from "@/services/queue-capacity";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newOrderId } from "@/lib/ids";
import type { Env, MenuItem, OrderRecord } from "@/types";
import { outboundHeaders } from "@/lib/identity";
import { checkCompletionCallback } from "@/lib/completion-callback";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";

/** Ceiling on inventory scans. An unnamed cap is a silent one. */
const INVENTORY_CAP = 2000;

/** Ceiling on a orders scan. Named because an unnamed cap is a silent one. */
const ORDER_CAP = 1000;

/**
 * Order ledger: human-queue purchases, weekly inventory, completion webhooks.
 */

export interface CreateOrderOptions {
  /** Original acceptance time, retained when paid fulfillment is resumed. */
  createdAt?: string;
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
  /** The door a labor item is about (aura_walk's url), validated at the buy route. */
  targetUrl?: string;
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
  checkpoint?: ArtifactCheckpoint,
): Promise<OrderRecord> {
  let order: OrderRecord = {
    order_id: newOrderId(),
    item_id: options.item.id,
    item_name: options.item.name,
    status: "queued",
    created_at: options.createdAt ?? new Date().toISOString(),
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
  if (options.targetUrl) {
    order.target_url = options.targetUrl;
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
  if (checkpoint) {
    order.managed_order = true;
    order = await checkpoint.save("order", order);
    order = (await writeManagedOrder(env, order)).order;
  } else {
    await kvPut(env.ORDERS, KV_KEYS.order(order.order_id), JSON.stringify(order));
  }
  /*
   * INDEX IT IF IT IS LABOR, so the bench can count what is promised
   * without walking every order the store has ever taken. The order
   * above is the truth; this is only how the bench finds it.
   */
  if (order.status === "completed") await markLaborClosed(env, order.order_id);
  else await markLaborOpen(env, order);
  return order;
}

export async function getOrder(
  env: Env,
  orderId: string,
): Promise<OrderRecord | null> {
  return currentOrder(env, orderId, await kvGetJson<OrderRecord>(env.ORDERS, KV_KEYS.order(orderId), "json"));
}

/** Historical orders have no certificate index. An incomplete scan cannot
 * establish a unique association, even when one matching row was visible. */
export async function orderForCertificate(env: Env, certId: string): Promise<OrderRecord | null> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.orderPrefix, cap: ORDER_CAP });
  if (listed.truncated) throw new Error("Order scan incomplete");
  const values = await bulkGetJson<OrderRecord>(env.ORDERS, listed.names);
  const matches: OrderRecord[] = [];
  for (const name of listed.names) {
    const order = values.get(name);
    if (!order || typeof order.order_id !== "string" || typeof order.cert_id !== "string" ||
      name !== KV_KEYS.order(order.order_id)) throw new Error("Order association unreadable");
    if (order.cert_id === certId) matches.push(order);
  }
  if (matches.length !== 1) return null;
  const candidate = matches[0]!;
  const order = await currentOrder(env, candidate.order_id, candidate);
  return order?.cert_id === certId && order.order_id === candidate.order_id ? order : null;
}

export async function listOrders(env: Env): Promise<OrderRecord[]> {
  /*
   * A SHORT ORDER LIST IS NOT AN ANSWER (2026-09-07).
   *
   * Nothing deletes an `order:` key, so this prefix only grows and
   * ORDER_CAP is a ceiling the store reaches rather than a number
   * chosen above any possible count. Every reader of this list
   * publishes a figure off it — the SLA guard decides which queued
   * orders are overdue, the weekly digest and /admin count them, the
   * fulfillment log and the claims door read them back — and a
   * truncated read makes all of those quietly too low, with the
   * oldest queued orders the first to disappear.
   *
   * So it refuses, the same way soldInventory below refuses. This is
   * louder than the alternative on purpose: the alternative is a
   * number that is simply wrong forever and never says so.
   */
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.orderPrefix, cap: ORDER_CAP });
  if (listed.truncated) throw new Error("Order scan incomplete");
  const values = await bulkGetJson<OrderRecord>(
    env.ORDERS,
    listed.names,
  );
  const orders: OrderRecord[] = [];
  for (const order of (await hydrateOrders(env, values)).values()) {
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
  if (order.managed_order) return (await writeManagedOrder(env, order, {
    kind: "acknowledge", at: new Date().toISOString(),
  })).order;
  order.acknowledged_at = new Date().toISOString();
  await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
  return order;
}

/**
 * THE CALLBACK LEASH (the worldwide-latency audit, Part 2,
 * 2026-08-27). The completion webhook is one attempt at an origin the
 * BUYER chose, and it fires in two places: the keeper's admin press,
 * and the stocked-shelf purchase path — inside the buyer's own paid
 * request, after settlement. Unbudgeted, a hung callback held a
 * settled purchase open until the runtime killed the subrequest. Ten
 * seconds is generous for a webhook receiver; past it, the abort
 * lands in the same catch a dead host does, the miss goes on the
 * order, and the deliverable waits at the order URL forever.
 */
export const ORDER_CALLBACK_TIMEOUT_MS = 10_000;

export async function completeOrder(
  env: Env,
  orderId: string,
  deliverable: string,
  callbackTimeoutMs: number = ORDER_CALLBACK_TIMEOUT_MS,
): Promise<OrderRecord | null> {
  let order = await getOrder(env, orderId);
  if (!order) {
    return null;
  }
  let completion = 0;
  if (order.managed_order) {
    const saved = await writeManagedOrder(env, order, {
      kind: "complete", deliverable, at: new Date().toISOString(),
    });
    order = saved.order;
    completion = saved.completion;
  } else {
    order.status = "completed";
    order.deliverable = deliverable;
    order.completed_at = new Date().toISOString();
    await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
  }
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
      const target = checkCompletionCallback(order.callback_url, new URL(env.STORE_BASE_URL).hostname);
      if (!target.ok) {
        order.webhook = "not attempted: callback destination refused by the public https policy — not retried; the deliverable stays at this order URL";
      } else {
        const response = await fetch(order.callback_url, {
          method: "POST",
          redirect: "manual",
          // On a leash: see ORDER_CALLBACK_TIMEOUT_MS above. A hang at
          // the buyer's origin becomes the "unreachable" note below,
          // never a pinned-open settled purchase.
          signal: AbortSignal.timeout(callbackTimeoutMs),
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
          : response.status >= 300 && response.status < 400
          ? `attempted once, your endpoint answered HTTP ${response.status}; redirect not followed — not retried; the deliverable stays at this order URL forever`
          : `attempted once, your endpoint answered HTTP ${response.status} — not retried; the deliverable stays at this order URL forever`;
      }
    } catch {
      // The bell rings on; delivery is still visible at /api/order/:id.
      order.webhook =
        "attempted once, your endpoint was unreachable — not retried; the deliverable stays at this order URL forever";
    }
    if (order.managed_order) {
      order = (await writeManagedOrder(env, order, { kind: "webhook", completion, result: order.webhook })).order;
    } else {
      await kvPut(env.ORDERS, KV_KEYS.order(orderId), JSON.stringify(order));
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
  return Math.max(0, item.weekly_inventory - await soldInventory(env, key));
}

/**
 * New order sales have one immutable marker each; a lost acknowledgement
 * or concurrent retry cannot increment the same sale twice. Old counters
 * still contribute to the total. This is bookkeeping, not a reservation:
 * two buyers can still pass the last-unit gate before either sale appears
 * in KV. A truncated scan refuses to guess how much inventory remains.
 */
async function soldInventory(env: Env, key: string): Promise<number> {
  const legacy = await kvGet(env.COUNTERS, key);
  const sales = await listKeys(env.COUNTERS, { prefix: `${key}:`, cap: INVENTORY_CAP });
  if (sales.truncated) throw new Error("Inventory sale scan incomplete");
  return (legacy ? parseInt(legacy, 10) : 0) + sales.names.length;
}

export async function recordInventorySale(
  env: Env,
  item: MenuItem,
  order?: Pick<OrderRecord, "order_id" | "created_at">,
): Promise<number | null> {
  if (item.weekly_inventory === undefined) {
    return null;
  }
  const key = KV_KEYS.inventory(item.id, order ? currentWeekKey(new Date(order.created_at)) : currentWeekKey());
  if (order) {
    const saleKey = `${key}:${order.order_id}`;
    if (await kvGet(env.COUNTERS, saleKey) === null) await kvPut(env.COUNTERS, saleKey, "1");
    return soldInventory(env, key);
  }
  const sold = await kvGet(env.COUNTERS, key);
  const now = (sold ? parseInt(sold, 10) : 0) + 1;
  await kvPut(env.COUNTERS, key, String(now));
  return now;
}

export async function resetWeeklyInventory(env: Env): Promise<void> {
  /*
   * This one clears the prefix, so stopping at the cap would leave
   * counters behind and report the reset as done. It walks instead:
   * the cap bounds each page, the cursor carries it to the end, and
   * the loop finishes only when listKeys says nothing was left.
   */
  let cursor: string | undefined;
  for (;;) {
    const listed = await listKeys(env.COUNTERS, {
      prefix: `inventory:`,
      cap: INVENTORY_CAP,
      ...(cursor ? { cursor } : {}),
    });
    for (const name of listed.names) {
      await env.COUNTERS.delete(name);
    }
    if (!listed.truncated || !listed.cursor) {
      return;
    }
    cursor = listed.cursor;
  }
}
