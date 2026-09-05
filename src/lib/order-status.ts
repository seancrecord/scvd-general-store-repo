import { VOICE } from "@/store";
import type { OrderRecord } from "@/types";

/**
 * THE ORDER'S OWN PAGE, ONE DERIVATION, TWO DOORS (2026-09-05).
 *
 * GET /api/order/{order_id} has been the poll half of the store's
 * async-job pattern since the human queue opened, and it was the only
 * half: a buyer over MCP got an order_url it could not fetch through
 * the transport it was holding, and had to leave the connection to
 * learn whether the keeper had delivered. The check_order tool closes
 * that, and it reads THIS function — the same object the HTTP door
 * serves, byte for byte — so the two doors cannot disagree about
 * whether a window has been missed or what is owed.
 *
 * `now` is injected because the breach line moves with the clock, and
 * a verdict that moves with the wall clock is not a test (AGENTS.md).
 */
export function orderStatusBody(
  base: string,
  order: OrderRecord,
  now: number = Date.now(),
): Record<string, unknown> {
  const response: Record<string, unknown> = {
    order_id: order.order_id,
    item_id: order.item_id,
    item_name: order.item_name,
    status: order.status,
    created_at: order.created_at,
    sla_hours: order.sla_hours,
    patron_number: order.patron_number,
    badge_url: `${base}/badges/${order.patron_number}.svg`,
  };
  if (order.status === "completed") {
    response["deliverable"] = order.deliverable;
    response["completed_at"] = order.completed_at;
    response["message"] = VOICE.orderCompleted;
  } else {
    response["message"] = VOICE.queueConfirmation;
  }

  /**
   * THE BREACH, WHERE THE BUYER CAN SEE IT.
   *
   * The card by the door promises: miss a promised window and you get
   * your money back, and you will not have to argue for it. Until now
   * the check behind that promise reported to the KEEPER only — which
   * makes "you won't have to argue for it" depend on somebody else
   * reading their alarms. A promise the buyer cannot verify is a
   * promise they have to argue for by definition.
   *
   * So the order's own page says it: past the window, by how long,
   * and whether a refund has been raised yet. Derived at read from
   * the order's own timestamps, so it cannot drift from the record
   * and cannot be forgotten on a write path.
   *
   * IT MOVES NO MONEY AND PROMISES NO DATE. Rule 10: refunds are
   * created pending and the keeper pays them by hand. Saying "owed"
   * here and "automatic" nowhere is the distinction that rule exists
   * to protect.
   */
  const due = Date.parse(order.created_at) + order.sla_hours * 3_600_000;
  const finishedAt = order.completed_at ? Date.parse(order.completed_at) : null;
  const reference = finishedAt ?? now;
  if (Number.isFinite(due) && reference > due) {
    const hoursLate = Math.round(((reference - due) / 3_600_000) * 10) / 10;
    response["window_breached"] = {
      due_at: new Date(due).toISOString(),
      hours_late: hoursLate,
      kind: finishedAt ? "delivered_late" : "still_open",
      owed_usdc: order.paid_usdc,
      note: finishedAt
        ? "This was delivered after its promised window. The promise says a missed window earns the money back; delivering eventually does not discharge it. You are owed a refund and you do not have to ask for it."
        : "This is past its promised window and nothing has been delivered. You are owed a refund and you do not have to ask for it.",
      how_it_gets_paid:
        "The keeper pays refunds by hand, with a transaction hash on the record. Nothing here is automatic and this store does not claim it is — see rule 10 in HOUSE_RULES.",
      verify: `${base}/api/order/${order.order_id}`,
    };
  }
  return response;
}
