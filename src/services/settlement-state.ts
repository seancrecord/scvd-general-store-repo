import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import type { Certificate, Env } from "@/types";

/**
 * WHERE THIS SALE STANDS — the public, per-receipt answer to "failed
 * retry state" (asked from outside, by name, 2026-09-12, the week the
 * hundredth settlement landed: a cash register with logs exposes
 * product id, agent id, quote, settlement id, delivery hash, AND the
 * failed retry state per call).
 *
 * The honest shape of the answer is not a counter. A certificate is
 * minted only after the goods were produced and, since 2026-08-10,
 * only after the money moved at the last line before the signature.
 * So a delivery that failed never mints, never settles, and cannot
 * appear on any receipt — not because the store hides it, but because
 * there is nothing to receipt: no money moved. What CAN be said per
 * certificate, and is said here, derived at read from the record and
 * the delivery-audit row rather than typed:
 *
 *   - which way the money moved, from the certificate's own signed
 *     fields (chain, trade account, or none);
 *   - the ordering the sale ran under, from its mint date;
 *   - whether the delivery-audit obligation for its settlement is
 *     closed — the row the audit opens after settle and deletes only
 *     when the handler returned goods (services/delivery-audit.ts).
 *     A certificate with that row still open is the one failure class
 *     this store names as its worst: money taken, goods not confirmed.
 *
 * What is NOT public and why: each attempt's settled / not_settled /
 * unknown state lives on the purchase journal, which opens only to
 * the buyer's own token (services/purchase-intent.ts). A failed
 * attempt names a wallet and the exact inputs it tried to buy; that
 * is the buyer's record, and the store publishes its own conduct,
 * never the buyer's (the /fulfillment-log rule). The path to it is
 * named here so nobody has to guess.
 */

/** The gate went deliver-first, settle-after on this date (rule 9 as amended). */
export const DELIVER_FIRST_SINCE = "2026-08-10";

export type PaymentState =
  | "settled_on_chain"
  | "settled_via_trade_account"
  | "settled_transaction_not_recorded"
  | "no_payment_recorded";

export type DeliveryAuditState =
  | "closed"
  | "open"
  | "not_applicable"
  | "unavailable";

export interface SettlementState {
  payment_state: PaymentState;
  delivery_state: "delivered";
  order_of_operations: "delivered_then_settled" | "settled_then_delivered";
  delivery_audit: {
    state: DeliveryAuditState;
    means: string;
  };
  failed_attempts: {
    on_this_receipt: "none_possible";
    why: string;
    where: string;
  };
  derived_from: string;
}

function paymentState(cert: Certificate): PaymentState {
  if (cert.settled_via) return "settled_via_trade_account";
  if (cert.settlement_tx) return "settled_on_chain";
  if (cert.paid_usdc !== undefined && cert.paid_usdc > 0) {
    return "settled_transaction_not_recorded";
  }
  return "no_payment_recorded";
}

const AUDIT_MEANS: Record<DeliveryAuditState, string> = {
  closed:
    "The delivery-audit row opened for this settlement no longer exists: the handler returned the goods and the row was deleted at that seam. Money moved and goods went out, in that order or the reverse per order_of_operations.",
  open:
    "The delivery-audit row for this settlement is STILL OPEN: the money moved and this store has not yet recorded the goods leaving. This certificate exists, so the mint completed; the crash, if any, landed between mint and response. The keeper's desk resolves these by hand and refunds where owed — nothing here is automatic.",
  not_applicable:
    "No on-chain settlement is named on this certificate, so no delivery-audit row was ever keyed to it: the free shelf, a trade-account sale the marketplace collected, or a settle that returned no transaction hash.",
  unavailable:
    "The delivery-audit store could not be read on this load. Not a verdict either way; reload and the check runs again.",
};

export async function settlementStateFor(
  env: Env,
  cert: Certificate,
): Promise<SettlementState> {
  let audit: DeliveryAuditState = "not_applicable";
  if (cert.settlement_tx) {
    try {
      const open = await getOpenDeliveryIntent(env, cert.settlement_tx);
      audit = open ? "open" : "closed";
    } catch {
      audit = "unavailable";
    }
  }
  return {
    payment_state: paymentState(cert),
    delivery_state: "delivered",
    order_of_operations:
      cert.date.slice(0, 10) >= DELIVER_FIRST_SINCE
        ? "delivered_then_settled"
        : "settled_then_delivered",
    delivery_audit: { state: audit, means: AUDIT_MEANS[audit] },
    failed_attempts: {
      on_this_receipt: "none_possible",
      why: `A certificate is minted only after the goods were produced${cert.date.slice(0, 10) >= DELIVER_FIRST_SINCE ? " and after the money moved at the last line before the signature" : ""}. A delivery that fails before settlement takes no money and mints nothing, so it cannot appear on any receipt — there is nothing to receipt. This record is the delivery.`,
      where:
        "Per-attempt state — payment_state settled | not_settled | unknown, charged, delivery_state, reconciliation_reference — lives on the buyer's purchase journal, opened only by the buyer's own token: GET /api/purchase-status/{purchase_id} with Authorization: Bearer <status_token>, or the check_purchase MCP tool. Both are returned with every purchase response and every decline. The store publishes its own conduct, never a buyer's failed attempts.",
    },
    derived_from:
      "The certificate's signed fields (settled_via, settlement_tx, paid_usdc, date) and a live read of the delivery-audit row keyed by settlement_tx. Nothing here is stored beside the certificate or typed by hand.",
  };
}
