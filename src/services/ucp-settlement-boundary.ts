import { fulfillPurchase } from "@/services/fulfillment";
import { fulfillmentInputFor } from "@/services/ucp-preparation";
import { mayEnterSettlementFulfillment } from "@/services/settlement-preconditions";
import { purchasePreparation } from "@/services/purchase-preparation";
import {
  purchaseIntentStore,
  purchaseRecovery,
  purchaseRequestDigest,
  type PurchaseIntent,
} from "@/services/purchase-intent";
import { completionRequest } from "@/lib/ucp/checkout/completion";
import {
  ucpCheckoutStore,
  type StoredCheckout,
} from "@/services/ucp-checkout-store";
import type {
  SettlementSubmission,
  SubmissionClaim,
} from "@/services/settlement-submission";
import {
  convergeSettlementRecords,
  settleClaimedSubmission,
  SettlementResolutionFailed,
  type SettlementConvergence,
  type SettlementProducer,
} from "@/services/ucp-settlement-resolution";
import { finalizeUcpOrder, readStoredOrder, recoverUcpOrder, settledPaymentOf } from "@/services/ucp-order";
import type { StoredUcpOrder } from "@/lib/ucp/order/document";
import { supportsArtifactRecovery } from "@/lib/artifact-checkpoint";
import { getMenuItem } from "@/store/menu";
import { atomicToUsdc, tipFromPaid, type PendingPayment } from "@/lib/payments";
import type { Env } from "@/types";

/**
 * THE WALK TO THE SETTLEMENT BOUNDARY, AND — WITH A PRODUCER — ACROSS IT.
 *
 * An admitted completion owns its payment. This takes that ownership
 * through the store's real fulfillment — every product's own pre-money
 * work, the same path every other door runs — until the one line where
 * money would move, claims the exclusive right to move it, makes the
 * checkout's public promise, and then:
 *
 *   WITHOUT A PRODUCER it stops. The `settle` callback does everything
 *   a real settle would do except the outbound request, and refuses.
 *   That is the boundary the resolution chapter proved every dangerous
 *   question against, where no money can be lost getting it wrong.
 *
 *   WITH A PRODUCER it hands its claim to services/ucp-settlement-
 *   resolution, which asks the producer once and writes the answer
 *   onto the purchase, the row and the checkout in that order. A
 *   settlement that CONFIRMED is then returned from `settle` as the
 *   SettledPayment the rest of fulfillment needs — the mint, the
 *   certificate, the work-order — and when fulfillment returns the
 *   goods, the order is written in one transaction with the checkout's
 *   completion (services/ucp-order). Declined and unknown still stop
 *   here: nothing below the settle line runs on money that did not
 *   move or may not have.
 *
 * WHY THE CLAIM LIVES INSIDE `pending.settle`. The callback is reached
 * only after fulfillPurchase has completed every pre-settlement step
 * for that product — the probes, the chain reads, the signatures. So
 * arriving here IS the proof that preparation succeeded, for ordinary
 * products and observation-recoverable ones alike, without a second
 * durable flag to keep in sync. For the latter, fulfillPurchase reads
 * the retained observation handed in as `pending.observation` and does
 * not regenerate it; for the former, it does the real work now. One
 * path, same rule 9.
 *
 * NEVER TWICE. A walk that finds the money already moved — the row
 * says confirmed, or the purchase record says settled — does not
 * produce, claim, or submit anything. It finishes the order from the
 * recorded settlement through the same recovery the purchase desk's
 * alarm uses, so the identical Complete a platform retries after a
 * lost response gets the same order the first one would have.
 */

export class SettlementBoundaryReached extends Error {
  constructor(
    readonly submission: SettlementSubmission,
    readonly resolution?: SettlementConvergence,
  ) {
    super("Reached the settlement boundary; this increment does not cross it");
    this.name = "SettlementBoundaryReached";
  }
}

export type BoundaryOutcome =
  | {
      ok: true;
      checkout: StoredCheckout;
      submission: SettlementSubmission;
      /** Present when a producer was supplied and its result was recorded. */
      resolution?: SettlementConvergence;
      /** Present once the settlement confirmed and the order was written. */
      order?: StoredUcpOrder;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_admitted"
        | "preconditions_failed"
        | "already_started"
        | "already_resolved"
        | "production_failed"
        | "resolution_failed"
        | "delivery_failed"
        | "order_failed";
      detail: string;
      checkout?: StoredCheckout;
      submission?: SettlementSubmission;
    };

export async function walkToSettlementBoundary(
  env: Env,
  input: { checkoutId: string; door?: string; produce?: SettlementProducer },
): Promise<BoundaryOutcome> {
  const store = ucpCheckoutStore(env, input.checkoutId);
  const stored = await store.readUcpCheckout();
  if (!stored) return { ok: false, code: "not_found", detail: "No such checkout." };
  const checkout: StoredCheckout = { ...stored };

  const completion = checkout.completion;
  if (!completion) {
    return {
      ok: false,
      code: "not_admitted",
      detail:
        "This checkout has no admitted payment. Nothing can be carried to settlement that nobody owns.",
      checkout,
    };
  }
  const identity = completion.payment_identity;
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
  const path = `/ucp/v1/checkout-sessions/${checkout.id}`;
  const requestDigest = await purchaseRequestDigest(
    env,
    "ucp",
    path,
    completionRequest(checkout),
  );
  const purchases = purchaseIntentStore(env, identity);

  /**
   * ALREADY DONE, OR ALREADY PAID. A completed checkout returns its
   * order. A settled purchase, or a claim whose row says confirmed,
   * finishes its order from the recorded settlement and submits
   * nothing. Both are read before any production, so a retry costs
   * the store nothing it has already paid for.
   */
  if (checkout.status === "completed") {
    const order = await readStoredOrder(env, checkout.id);
    const rawRow = await purchases.readSettlementSubmission();
    if (order && rawRow) {
      return { ok: true, checkout, submission: JSON.parse(rawRow) as SettlementSubmission, order };
    }
  }
  const savedPurchase = await purchases.existingPurchase();
  if (!savedPurchase) {
    return { ok: false, code: "not_admitted", detail: "No purchase record behind this completion.", checkout };
  }
  const purchase = JSON.parse(savedPurchase) as PurchaseIntent;
  const rawRow = await purchases.readSettlementSubmission();
  const row = rawRow ? (JSON.parse(rawRow) as SettlementSubmission) : undefined;
  if (row?.outcome === "confirmed" || purchase.state === "settled") {
    const goods = await recoverUcpOrder(env, purchase);
    const after = await store.readUcpCheckout();
    const order = await readStoredOrder(env, checkout.id);
    if (goods && order && after && row) {
      return {
        ok: true,
        checkout: { ...after },
        submission: row,
        resolution: await convergeSettlementRecords(env, { checkoutId: checkout.id }),
        order,
      };
    }
    return {
      ok: false,
      code: "order_failed",
      detail: "This payment settled earlier and its order could not be finished now. Nothing was submitted again; read the checkout.",
      checkout: after ? { ...after } : checkout,
      ...(row ? { submission: row } : {}),
    };
  }
  if (row?.outcome) {
    return {
      ok: false,
      code: "already_resolved",
      detail: "This payment's settlement has already resolved. Read the checkout.",
      checkout,
      submission: row,
    };
  }

  /**
   * The structural precondition, asked before any product work: owned,
   * and prepared where the product requires preparation first.
   */
  const preconditions = await mayEnterSettlementFulfillment(env, {
    item,
    paymentIdentity: identity,
    path,
    requestDigest,
  });
  if (!preconditions.ok) {
    return {
      ok: false,
      code: "preconditions_failed",
      detail: preconditions.detail,
      checkout,
    };
  }

  let claimed: SettlementSubmission | undefined;
  let resolution: SettlementConvergence | undefined;
  let refusal: BoundaryOutcome | undefined;
  let settledHere = false;

  const paidUsdc = atomicToUsdc(checkout.quote?.terms.amount_atomic ?? "0");
  /**
   * The retained observation, for products whose goods were made
   * before ownership: fulfillPurchase reads it and does not regenerate.
   * The recovery locator, for products whose goods are checkpointed by
   * settlement: one mint, one work-order, however many times this
   * runs. Both are the same wiring the other doors use.
   */
  const ordering = purchasePreparation(env, item, identity, path, requestDigest);
  const locator = supportsArtifactRecovery(item)
    ? { path, digest: requestDigest, purchasedAt: purchase.created_at, purchaseId: identity }
    : undefined;

  const pending: PendingPayment = {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, item?.price_usdc ?? paidUsdc),
    payer: purchase.payer,
    network: checkout.quote?.terms.network,
    ...(ordering.checkpoint ? { observation: ordering.checkpoint } : {}),
    purchaseRecovery: () => purchaseRecovery(env, purchase),
    purchaseCreatedAt: () => purchase.created_at,
    settle: async () => {
      /**
       * EVERY PRE-MONEY STEP FOR THIS PRODUCT HAS NOW SUCCEEDED.
       * Reaching this line is what proves it.
       */
      const proposal: SettlementSubmission = {
        purchase_id: identity,
        request_digest: requestDigest,
        door: input.door ?? "ucp",
        claimed_at: new Date().toISOString(),
      };
      const raw = await purchases.claimSettlementSubmission(JSON.stringify(proposal));
      const claim = JSON.parse(raw) as SubmissionClaim;

      if (!claim.won) {
        /**
         * Somebody else is already carrying this payment, or it has
         * already resolved. Either way this execution submits nothing
         * and does not wait: the caller watches the checkout.
         */
        refusal = {
          ok: false,
          code: claim.reason === "already_resolved" ? "already_resolved" : "already_started",
          detail:
            claim.reason === "already_resolved"
              ? "This payment's settlement has already resolved. Read the checkout."
              : claim.reason === "already_started"
                ? "Another execution is already carrying this payment to settlement. Read the checkout rather than presenting it again."
                : "This payment is not owned by this checkout's completion.",
          checkout,
          ...(claim.submission ? { submission: claim.submission } : {}),
        };
        throw new SettlementBoundaryReached(
          claim.submission ?? { ...proposal, outcome: "unknown" },
        );
      }

      claimed = claim.submission;
      /**
       * NOW the public promise can be kept: something is genuinely at
       * the boundary, and a poll can learn what became of it.
       */
      await store.enterUcpSettlement({ payment_identity: identity });
      if (!input.produce) throw new SettlementBoundaryReached(claim.submission);

      resolution = await settleClaimedSubmission(env, {
        checkoutId: checkout.id,
        claim,
        produce: input.produce,
      });
      if (resolution.money === "settled") {
        /**
         * The money moved and the purchase record says so. What the
         * rest of fulfillment needs is that record's settlement —
         * transaction, rail, payer — never anything from the wire.
         */
        const latest = await purchases.existingPurchase();
        const settled = latest ? settledPaymentOf(JSON.parse(latest) as PurchaseIntent, item) : null;
        if (settled) {
          settledHere = true;
          return settled;
        }
      }
      throw new SettlementBoundaryReached(claim.submission, resolution);
    },
  };

  let goods: Record<string, unknown> | undefined;
  try {
    goods = await fulfillPurchase(
      env,
      item!,
      pending,
      fulfillmentInputFor(item!, checkout.inputs ?? {}),
      locator,
    );
  } catch (error) {
    if (error instanceof SettlementResolutionFailed) {
      /**
       * The goods were made and the claim is held; what did not finish
       * is the bookkeeping of the answer. Not a production failure,
       * and not a reason to submit again: the next convergence pass
       * reads the records and finishes writing them.
       */
      return {
        ok: false,
        code: "resolution_failed",
        detail: "The settlement outcome could not be fully recorded. Nothing will be submitted again; read the checkout.",
        checkout,
        ...(claimed ? { submission: claimed } : {}),
      };
    }
    if (error instanceof SettlementBoundaryReached) {
      if (refusal) return refusal;
    } else if (settledHere) {
      /**
       * Money moved, then the delivery died below the settle line — the
       * one case the delivery desk still exists for. The purchase
       * record says settled, so its alarm will recover the goods and
       * write the order through the same branch a retry uses.
       */
      await purchases.schedulePurchaseRecovery().catch(() => undefined);
      return {
        ok: false,
        code: "delivery_failed",
        detail:
          "The payment settled and the goods could not be delivered in this request. Nothing will be charged again; the order is being recovered — read the checkout.",
        checkout: { ...((await store.readUcpCheckout()) ?? checkout) },
        ...(claimed ? { submission: claimed } : {}),
      };
    } else {
      /**
       * Production failed above the settle line, which is the cheap
       * direction: no claim was taken, no money moved, and the public
       * status never changed.
       */
      return {
        ok: false,
        code: "production_failed",
        detail:
          error instanceof Error && error.message
            ? error.message
            : "This purchase could not be produced. Nothing was charged.",
        checkout,
      };
    }
  }

  if (refusal) return refusal;
  if (!claimed) {
    return {
      ok: false,
      code: "production_failed",
      detail: "Fulfillment returned without reaching the settlement boundary.",
      checkout,
    };
  }

  if (goods !== undefined && settledHere) {
    const finalized = await finalizeUcpOrder(env, { checkoutId: checkout.id, identity, goods });
    if (!finalized.ok) {
      await purchases.schedulePurchaseRecovery().catch(() => undefined);
      return {
        ok: false,
        code: "order_failed",
        detail: finalized.detail,
        checkout: finalized.checkout ?? checkout,
        submission: resolution?.submission ?? claimed,
      };
    }
    return {
      ok: true,
      checkout: finalized.checkout,
      submission: resolution?.submission ?? claimed,
      ...(resolution ? { resolution } : {}),
      order: finalized.order,
    };
  }

  const after = await store.readUcpCheckout();
  return {
    ok: true,
    checkout: { ...after! },
    submission: resolution?.submission ?? claimed,
    ...(resolution ? { resolution } : {}),
  };
}
