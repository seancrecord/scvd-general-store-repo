import { fulfillPurchase } from "@/services/fulfillment";
import { fulfillmentInputFor } from "@/services/ucp-preparation";
import { mayEnterSettlementFulfillment } from "@/services/settlement-preconditions";
import { purchaseIntentStore, purchaseRequestDigest } from "@/services/purchase-intent";
import { completionRequest } from "@/lib/ucp/checkout/completion";
import {
  ucpCheckoutStore,
  type StoredCheckout,
} from "@/services/ucp-checkout-store";
import type {
  SettlementSubmission,
  SubmissionClaim,
} from "@/services/settlement-submission";
import { getMenuItem } from "@/store/menu";
import type { PendingPayment } from "@/lib/payments";
import type { Env } from "@/types";

/**
 * THE WALK TO THE SETTLEMENT BOUNDARY, WHICH STOPS AT IT.
 *
 * An admitted completion owns its payment. This takes that ownership
 * through the store's real fulfillment — every product's own
 * pre-money work, the same path every other door runs — until the one
 * line where money would move, claims the exclusive right to move it,
 * makes the checkout's public promise, and then stops.
 *
 * NOTHING HERE CALLS A FACILITATOR. The `settle` callback does
 * everything a real settle would do except the outbound request, and
 * then refuses. That is not a placeholder: it is the increment. Every
 * dangerous question about who may submit, and when a platform may be
 * told to wait, is answered here where no money can be lost getting it
 * wrong.
 *
 * WHY THE CLAIM LIVES INSIDE `pending.settle`. The callback is reached
 * only after fulfillPurchase has completed every pre-settlement step
 * for that product — the probes, the chain reads, the signatures. So
 * arriving here IS the proof that preparation succeeded, for ordinary
 * products and observation-recoverable ones alike, without a second
 * durable flag to keep in sync. For the latter, fulfillPurchase reads
 * the retained observation and does not regenerate it; for the former,
 * it does the real work now. One path, same rule 9.
 */

export class SettlementBoundaryReached extends Error {
  constructor(readonly submission: SettlementSubmission) {
    super("Reached the settlement boundary; this increment does not cross it");
    this.name = "SettlementBoundaryReached";
  }
}

export type BoundaryOutcome =
  | { ok: true; checkout: StoredCheckout; submission: SettlementSubmission }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_admitted"
        | "preconditions_failed"
        | "already_started"
        | "already_resolved"
        | "production_failed";
      detail: string;
      checkout?: StoredCheckout;
      submission?: SettlementSubmission;
    };

export async function walkToSettlementBoundary(
  env: Env,
  input: { checkoutId: string; door?: string },
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
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
  const path = `/ucp/v1/checkout-sessions/${checkout.id}`;
  const requestDigest = await purchaseRequestDigest(
    env,
    "ucp",
    path,
    completionRequest(checkout),
  );

  /**
   * The structural precondition, asked before any product work: owned,
   * and prepared where the product requires preparation first.
   */
  const preconditions = await mayEnterSettlementFulfillment(env, {
    item,
    paymentIdentity: completion.payment_identity,
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
  let refusal: BoundaryOutcome | undefined;

  const pending: PendingPayment = {
    paidUsdc: Number(checkout.quote?.terms.amount_atomic ?? "0") / 1e6,
    tipUsdc: 0,
    payer: completion.payment_identity,
    network: checkout.quote?.terms.network,
    settle: async () => {
      /**
       * EVERY PRE-MONEY STEP FOR THIS PRODUCT HAS NOW SUCCEEDED.
       * Reaching this line is what proves it.
       */
      const proposal: SettlementSubmission = {
        purchase_id: completion.payment_identity,
        request_digest: requestDigest,
        door: input.door ?? "ucp",
        claimed_at: new Date().toISOString(),
      };
      const raw = await purchaseIntentStore(
        env,
        completion.payment_identity,
      ).claimSettlementSubmission(JSON.stringify(proposal));
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
      await store.enterUcpSettlement({ payment_identity: completion.payment_identity });
      throw new SettlementBoundaryReached(claim.submission);
    },
  };

  try {
    await fulfillPurchase(env, item!, pending, fulfillmentInputFor(item!, checkout.inputs ?? {}));
  } catch (error) {
    if (!(error instanceof SettlementBoundaryReached)) {
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
  const after = await store.readUcpCheckout();
  return { ok: true, checkout: { ...after! }, submission: claimed };
}
