import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { sendAlert } from "@/lib/alerts";
import type { Env, OrderRecord, RefundRecord } from "@/types";

/**
 * THE REFUND-WINDOW DETECTOR — the check behind the store's loudest
 * money promise.
 *
 * The card by the door says: "we miss a promised window, you get your
 * money back — and you won't have to argue for it."
 *
 * Until now that promise was enforced by the keeper REMEMBERING. The
 * delivery audit catches settled-but-never-delivered within minutes,
 * which is a different failure — money taken and no handler output.
 * This one catches the slower, quieter class: a queue order whose
 * promised window passed while the keeper was living his life.
 *
 * RULE 10 IS WHY THIS EXISTS AND WHY IT WAITED TOO LONG. The rule —
 * "a claim ships with the check that fails when it stops being true"
 * — was written about this exact shape: "refund is automatic" sat
 * live on every surface for five days while no code did it. The
 * window promise is the same species of claim with the same species
 * of hole, and it was correctly deferred while the queue was empty.
 * It is not empty now.
 *
 * TWO CLASSES, and the second is the one nobody would have counted.
 *
 *   BREACHED_UNFULFILLED — the window passed, nothing was delivered.
 *   Obvious, and the one a keeper would eventually notice.
 *
 *   BREACHED_DELIVERED_LATE — it WAS delivered, after the window. The
 *   promise says missing the window earns the money back; it does not
 *   say "unless we get there eventually." Reading it the other way
 *   would let the store discharge a stated promise by being slow and
 *   then finishing, which is precisely the argument the buyer was
 *   told they would not have to have.
 *
 * WHAT THIS DOES NOT DO: move money. Rule 10 again — refunds are
 * created pending and paid by hand with a transaction hash, and no
 * code in this store has ever moved money on its own. This raises the
 * breach and names it. The keeper still pays.
 */

/**
 * A few minutes of slack so a sweep landing on the boundary does not
 * page for a window that expired ninety seconds ago. Published,
 * because an unstated grace period is a quiet extension of the
 * promise.
 */
export const WINDOW_GRACE_MINUTES = 5;

/** Bounded scan, and the audit says when it hit the cap. */
export const WINDOW_SCAN_CAP = 500;

export type BreachKind = "breached_unfulfilled" | "breached_delivered_late";

export interface WindowBreach {
  order_id: string;
  item_id: string;
  item_name: string;
  patron_number: number;
  payer?: string;
  kind: BreachKind;
  created_at: string;
  /** When the promise came due: created_at + sla_hours. */
  due_at: string;
  hours_late: number;
  completed_at?: string;
  paid_usdc: number;
  /** A refund row that plausibly covers this order, if one was found. */
  refund_id?: string;
  refund_status?: string;
}

export interface RefundWindowAudit {
  checked: number;
  breaches: WindowBreach[];
  /** Breaches with no refund row against them — what the store owes. */
  owed: WindowBreach[];
  owed_usdc: number;
  scan_capped: boolean;
  /**
   * THE JOIN IS HEURISTIC AND SAYS SO. `RefundRecord` carries `item`
   * and `payer` but no `order_id`, so a refund can only be matched to
   * the order it covers by those two fields. Two breached orders from
   * the same payer for the same item are indistinguishable here. New
   * refunds should carry `order_id` (additive, optional); until the
   * older rows age out this number is a floor on what is owed, never
   * a ceiling.
   */
  join_note: string;
  what_this_cannot_see: string[];
}

function hoursBetween(from: number, to: number): number {
  return Math.round(((to - from) / 3_600_000) * 10) / 10;
}

/**
 * Every queue order whose promised window has passed, with whether
 * anything was ever refunded against it.
 */
export async function auditRefundWindows(
  env: Env,
  now: Date = new Date(),
): Promise<RefundWindowAudit> {
  const orderKeys = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.orderPrefix,
    cap: WINDOW_SCAN_CAP,
  });
  const refundKeys = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.refundPrefix,
    cap: WINDOW_SCAN_CAP,
  });
  const orders = await bulkGetJson<OrderRecord>(env.ORDERS, orderKeys.names);
  const refunds = await bulkGetJson<RefundRecord>(env.ORDERS, refundKeys.names);

  // item|payer → the refund that plausibly covers it. Weak on purpose,
  // and the audit publishes that weakness rather than implying a join
  // the data cannot support.
  const refundBy = new Map<string, RefundRecord>();
  for (const refund of refunds.values()) {
    if (!refund) continue;
    refundBy.set(`${refund.item}|${refund.payer ?? ""}`, refund);
  }

  const graceMs = WINDOW_GRACE_MINUTES * 60_000;
  const breaches: WindowBreach[] = [];
  let checked = 0;

  for (const order of orders.values()) {
    if (!order?.created_at || !order.sla_hours) continue;
    checked += 1;
    const created = Date.parse(order.created_at);
    if (Number.isNaN(created)) continue;
    const due = created + order.sla_hours * 3_600_000;

    const completed = order.completed_at ? Date.parse(order.completed_at) : null;
    const deliveredLate =
      completed !== null && !Number.isNaN(completed) && completed > due + graceMs;
    const stillOpen =
      order.status !== "completed" && now.getTime() > due + graceMs;
    if (!deliveredLate && !stillOpen) continue;

    const refund = refundBy.get(`${order.item_id}|${order.payer ?? ""}`)
      ?? refundBy.get(`${order.item_name}|${order.payer ?? ""}`);

    breaches.push({
      order_id: order.order_id,
      item_id: order.item_id,
      item_name: order.item_name,
      patron_number: order.patron_number,
      ...(order.payer ? { payer: order.payer } : {}),
      kind: deliveredLate ? "breached_delivered_late" : "breached_unfulfilled",
      created_at: order.created_at,
      due_at: new Date(due).toISOString(),
      hours_late: hoursBetween(due, deliveredLate ? completed! : now.getTime()),
      ...(order.completed_at ? { completed_at: order.completed_at } : {}),
      paid_usdc: order.paid_usdc,
      ...(refund ? { refund_id: refund.refund_id, refund_status: refund.status } : {}),
    });
  }

  breaches.sort((a, b) => b.hours_late - a.hours_late);
  const owed = breaches.filter((breach) => !breach.refund_id);

  return {
    checked,
    breaches,
    owed,
    owed_usdc:
      Math.round(owed.reduce((sum, breach) => sum + (breach.paid_usdc || 0), 0) * 1e6) / 1e6,
    scan_capped: orderKeys.truncated || refundKeys.truncated,
    join_note:
      "A refund is matched to an order by item and payer, because RefundRecord carries no order_id. Two breached orders from the same payer for the same item cannot be told apart here, so owed_usdc is a FLOOR on what is owed rather than an exact figure.",
    what_this_cannot_see: [
      "Instant items — they have no promised window to miss.",
      "Whether a late delivery was acceptable to the buyer. The promise does not ask; missing the window is the trigger, and delivering eventually does not discharge it.",
      "Orders older than the scan cap, when scan_capped is true.",
      "Money. Nothing here moves any: a refund is created pending and the keeper pays it by hand with a transaction hash.",
    ],
  };
}

/**
 * The sweep, and the page. One alert per breach the store has not
 * refunded, keyed by order so a standing breach does not page daily
 * for the same order under a new key.
 */
export async function runRefundWindowAudit(
  env: Env,
  now: Date = new Date(),
): Promise<RefundWindowAudit> {
  const audit = await auditRefundWindows(env, now);
  for (const breach of audit.owed) {
    const late =
      breach.kind === "breached_delivered_late"
        ? `delivered ${breach.hours_late}h past its ${breach.item_name} window`
        : `${breach.hours_late}h past its window with nothing delivered`;
    await sendAlert(env, {
      condition: "order_sla",
      detail: `Order ${breach.order_id} (patron #${breach.patron_number}, ${breach.item_name}, ${breach.paid_usdc} USDC) is ${late}. The card by the door promises the money back on a missed window and says the buyer will not have to argue for it — so this is owed, not optional. No refund row exists against it. Create one, then pay it by hand.`,
      key: `refund_window:${breach.order_id}`,
    }).catch(() => {
      // The alert is the courtesy. The breach is derived at read, so
      // the next pass raises it again whether or not this landed.
    });
  }
  return audit;
}
