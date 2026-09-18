import { supportsArtifactRecovery, supportsObservationRecovery } from "@/lib/artifact-checkpoint";
import { recordSettlementForItem } from "@/lib/metrics";
import { atomicToUsdc, tipFromPaid, type PendingPayment } from "@/lib/payments";
import { orderIdOf } from "@/lib/ucp/ids";
import type { StoredUcpOrder } from "@/lib/ucp/order/document";
import { completionRequest } from "@/lib/ucp/checkout/completion";
import { fulfillPurchase } from "@/services/fulfillment";
import { observationCheckpoint } from "@/services/purchase-observation";
import {
  purchaseIntentStore,
  purchaseRecovery,
  purchaseRequestDigest,
  type PurchaseIntent,
} from "@/services/purchase-intent";
import { fulfillmentInputFor } from "@/services/ucp-preparation";
import { convergeSettlementRecords } from "@/services/ucp-settlement-resolution";
import { ucpCheckoutStore, type OrderCompletion, type StoredCheckout } from "@/services/ucp-checkout-store";
import { getMenuItem } from "@/store/menu";
import type { Env, MenuItem } from "@/types";

/**
 * THE ORDER CHAPTER: from a confirmed settlement to a canonical order.
 *
 * Three records already agree that money moved — the purchase record
 * (authoritative), the submission row (authoritative for the claim),
 * and the checkout (a projection now at complete_in_progress). This
 * module adds the last durable thing a buyer is owed: the order, and
 * writes it in one transaction with the checkout's completion, in the
 * checkout's own Durable Object (services/ucp-checkout-store.ts).
 *
 * WHAT IT REFUSES. An order is manufactured from nothing. It is built
 * from the checkout's frozen lines and the purchase record's settled
 * facts, and only when those two describe the same sale: same payment
 * identity, same request digest, same rail, same atomic amount, same
 * path. A purchase record that disagrees with its checkout gets no
 * order and no completion; that disagreement is a fact for a human,
 * not a state to paper over.
 *
 * WHAT IT NEVER DOES. Presents a payment. The goods a UCP order
 * carries were produced by the store's real fulfillment with the
 * settlement already in hand, and recovery re-runs that fulfillment
 * with `settle` returning the recorded payment — the same shape the
 * recovery desk uses for every other door.
 */

const CHECKOUT_PATH = /^\/ucp\/v1\/checkout-sessions\/([A-Za-z0-9_-]+)$/;

/** The checkout a UCP purchase record was admitted against. */
export function checkoutIdOfPath(path: string): string | null {
  return CHECKOUT_PATH.exec(path)?.[1] ?? null;
}

export type OrderFinalization =
  | { ok: true; order: StoredUcpOrder; checkout: StoredCheckout; created: boolean }
  | {
      ok: false;
      code: "not_found" | "not_settled" | "inconsistent" | "wrong_state";
      detail: string;
      checkout?: StoredCheckout;
    };

/**
 * Why a purchase record and a checkout do not describe one sale, or
 * null when they do. Every clause is a fact both records hold; none
 * is inferred.
 */
function disagreement(checkout: StoredCheckout, purchase: PurchaseIntent): string | null {
  const completion = checkout.completion;
  if (!completion) return "the checkout has no admitted payment";
  if (purchase.id !== completion.payment_identity) return "the purchase is not the payment this checkout bound";
  if (purchase.request_digest !== undefined && purchase.request_digest !== completion.request_digest) {
    return "the purchase was admitted for a different request";
  }
  if (purchase.path !== `/ucp/v1/checkout-sessions/${checkout.id}`) return "the purchase names a different checkout";
  const quote = checkout.quote;
  if (!quote) return "the checkout holds no quote";
  if (purchase.terms.network !== quote.terms.network) return "the purchase settled on a rail the checkout did not quote";
  if (purchase.terms.amount !== quote.terms.amount_atomic) return "the purchase amount is not the checkout's frozen amount";
  return null;
}

function storedOrderFrom(
  checkout: StoredCheckout,
  purchase: PurchaseIntent & { payment: NonNullable<PurchaseIntent["payment"]> },
  item: MenuItem,
  goods: Record<string, unknown>,
  base: string,
  nowMs: number,
): StoredUcpOrder {
  const id = orderIdOf(checkout.id);
  const at = new Date(nowMs).toISOString();
  const operationalId = typeof goods.order_id === "string" ? goods.order_id : undefined;
  const fulfillment: StoredUcpOrder["fulfillment"] =
    item.fulfillment === "human_queue" && operationalId
      ? {
          kind: "human_queue",
          status: goods.status === "completed" ? "fulfilled" : "processing",
          operational_order_id: operationalId,
          ...(typeof goods.sla_hours === "number" ? { sla_hours: goods.sla_hours } : {}),
          goods,
        }
      : { kind: "instant", status: "fulfilled", delivered_at: at, goods };
  return {
    id,
    checkout_id: checkout.id,
    permalink_url: `${base}/ucp/v1/orders/${id}`,
    created_at: at,
    currency: "USD",
    lines: checkout.lines,
    line_titles: checkout.lines.map((line) => getMenuItem(line.item_id)?.name ?? line.sku),
    settlement: {
      purchase_id: purchase.id,
      network: purchase.payment.network ?? purchase.terms.network,
      transaction: purchase.payment.transaction,
      ...(purchase.payment.payer ? { payer: purchase.payment.payer } : {}),
      paid_usdc: purchase.payment.paidUsdc,
      tip_usdc: purchase.payment.tipUsdc,
    },
    fulfillment,
  };
}

/**
 * THE TILL, BOOKED FROM THE FROZEN LINE, AT MOST ONCE.
 *
 * Attributed to the item the order's line names, through the same
 * counters the other doors write. Booked only by the call that
 * CREATED the order: a retry, a repair and a recovery all find the
 * order already there and book nothing, which is what keeps one sale
 * one sale. A crash between the order transaction and this write
 * loses the count — the same undercount-by-a-crash every door
 * accepts for books that are a record, not a bound.
 */
async function bookUcpSale(env: Env, order: StoredUcpOrder, item: MenuItem): Promise<void> {
  const line = order.lines[0];
  if (!line) return;
  await recordSettlementForItem(env, line.item_id, {
    paidUsdc: order.settlement.paid_usdc,
    minimumUsdc: item.price_usdc,
    network: order.settlement.network,
    transaction: order.settlement.transaction,
    ...(order.settlement.payer ? { payer: order.settlement.payer } : {}),
    declaredSource: "ucp",
  }).catch((error) => console.error("ucp settle count lost:", String(error)));
}

/**
 * Write the order and complete the checkout, or say exactly why not.
 * Idempotent on the checkout: the order id is the checkout's, and a
 * checkout already completed returns the order it already has.
 */
export async function finalizeUcpOrder(
  env: Env,
  input: { checkoutId: string; identity: string; goods: Record<string, unknown>; nowMs?: number },
): Promise<OrderFinalization> {
  const store = ucpCheckoutStore(env, input.checkoutId);
  let checkout = await store.readUcpCheckout();
  if (!checkout) return { ok: false, code: "not_found", detail: "No such checkout." };

  if (checkout.status === "completed") {
    const existing = await readStoredOrder(env, checkout.id);
    if (existing) return { ok: true, order: existing, checkout: { ...checkout }, created: false };
    return {
      ok: false,
      code: "wrong_state",
      detail: "This checkout says completed and holds no order, which this store never writes.",
      checkout: { ...checkout },
    };
  }

  const saved = await purchaseIntentStore(env, input.identity).existingPurchase();
  const purchase = saved ? (JSON.parse(saved) as PurchaseIntent) : undefined;
  if (!purchase) {
    return { ok: false, code: "not_found", detail: "No purchase record behind this completion.", checkout: { ...checkout } };
  }
  const why = disagreement(checkout, purchase);
  if (why) {
    return { ok: false, code: "inconsistent", detail: `No order: ${why}.`, checkout: { ...checkout } };
  }
  if (purchase.state !== "settled" || !purchase.payment?.transaction) {
    return {
      ok: false,
      code: "not_settled",
      detail: "The purchase record does not say settled. An order is written from a settled purchase, never ahead of one.",
      checkout: { ...checkout },
    };
  }
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
  if (!item) return { ok: false, code: "inconsistent", detail: "No order: the checkout's line names no item.", checkout: { ...checkout } };

  /**
   * The projection may be behind the truth — a crash between the claim
   * and the public promise leaves a settled purchase behind a checkout
   * still saying ready_for_complete. Converging never produces and
   * only moves the checkout to where its records already say it is.
   */
  if (checkout.status !== "complete_in_progress") {
    await convergeSettlementRecords(env, { checkoutId: checkout.id });
    checkout = (await store.readUcpCheckout()) ?? checkout;
  }

  const nowMs = input.nowMs ?? Date.now();
  const order = storedOrderFrom(
    checkout,
    purchase as PurchaseIntent & { payment: NonNullable<PurchaseIntent["payment"]> },
    item,
    input.goods,
    env.STORE_BASE_URL,
    nowMs,
  );
  const result = JSON.parse(
    await store.completeUcpCheckout(JSON.stringify({ order, identity: input.identity, nowMs })),
  ) as OrderCompletion;
  if (!result.ok) {
    return {
      ok: false,
      code: result.reason === "not_found" ? "not_found" : result.reason === "inconsistent" ? "inconsistent" : "wrong_state",
      detail:
        result.reason === "inconsistent"
          ? "No order: the order does not name this checkout and its bound payment."
          : `The checkout is ${result.checkout?.status ?? "missing"}; an order completes a checkout that is completing.`,
      ...(result.checkout ? { checkout: { ...result.checkout } } : {}),
    };
  }
  if (result.created) await bookUcpSale(env, result.order, item);
  return { ok: true, order: result.order, checkout: result.checkout, created: result.created };
}

/** The canonical order beside a checkout, or null. */
export async function readStoredOrder(env: Env, checkoutId: string): Promise<StoredUcpOrder | null> {
  const raw = await ucpCheckoutStore(env, checkoutId).readUcpOrder();
  return raw ? (JSON.parse(raw) as StoredUcpOrder) : null;
}

/**
 * THE RECOVERY BRANCH, for the purchase desk's alarm and for an
 * identical Complete whose first answer was lost.
 *
 * Given a UCP purchase record: find its checkout from the recorded
 * path; if the order exists, hand back its goods; otherwise, for a
 * settled purchase, re-run the store's real fulfillment with the
 * recorded settlement in hand — the retained observation under the
 * UCP digest, the artifact checkpoint keyed by the settlement, and
 * `settle` returning the recorded payment — then write the order.
 * Nothing is re-presented, nothing before-settlement is re-probed, no
 * operational work-order is created twice, and the completion JSON is
 * never read as a query string.
 *
 * Returns the goods as the delivery the purchase record retains, or
 * null when there is nothing this branch may do.
 */
export async function recoverUcpOrder(env: Env, record: PurchaseIntent): Promise<Record<string, unknown> | null> {
  const checkoutId = checkoutIdOfPath(record.path);
  if (!checkoutId) return null;
  const store = ucpCheckoutStore(env, checkoutId);
  const existing = await readStoredOrder(env, checkoutId);
  if (existing) return existing.fulfillment.goods;

  const checkout = await store.readUcpCheckout();
  if (!checkout || record.state !== "settled" || !record.payment?.transaction) return null;
  if (disagreement(checkout, record)) return null;
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
  if (!item) return null;

  const digest =
    record.request_digest ??
    (await purchaseRequestDigest(env, "ucp", record.path, completionRequest({ ...checkout })));
  const payment = record.payment;
  const pending: PendingPayment = {
    ...payment,
    payer: payment.payer ?? record.payer,
    network: payment.network ?? record.terms.network,
    recovered: true,
    ...(supportsObservationRecovery(item)
      ? { observation: observationCheckpoint(env, record.id, record.path, digest, true) }
      : {}),
    purchaseRecovery: () => purchaseRecovery(env, record),
    purchaseCreatedAt: () => record.created_at,
    settle: async () => payment,
  };
  const goods = await fulfillPurchase(
    env,
    item,
    pending,
    fulfillmentInputFor(item, checkout.inputs ?? {}),
    supportsArtifactRecovery(item)
      ? { path: record.path, digest, purchasedAt: record.created_at, purchaseId: record.id }
      : undefined,
  );
  const finalized = await finalizeUcpOrder(env, { checkoutId, identity: record.id, goods });
  return finalized.ok ? finalized.order.fulfillment.goods : null;
}

/** The settled payment a walk hands the rest of fulfillment, from the record that says so. */
export function settledPaymentOf(purchase: PurchaseIntent, item: MenuItem | undefined) {
  const payment = purchase.payment;
  if (purchase.state !== "settled" || !payment?.transaction) return null;
  const paidUsdc = atomicToUsdc(purchase.terms.amount);
  return {
    ...payment,
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, item?.price_usdc ?? paidUsdc),
    payer: payment.payer ?? purchase.payer,
    network: payment.network ?? purchase.terms.network,
  };
}
