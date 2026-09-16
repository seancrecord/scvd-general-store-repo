import { createUcpX402Adapter, UcpPaymentRefused, type FacilitatorVerify } from "@/lib/ucp/checkout/adapter";
import { completionIdentity, completionRequest } from "@/lib/ucp/checkout/completion";
import { asRequirements } from "@/lib/ucp/checkout/requirements";
import {
  beginVerifiedPurchaseIntent,
  purchaseIntentStore,
  purchaseRequestDigest,
  type PurchaseIntent,
} from "@/services/purchase-intent";
import { SettlementUnknown } from "@/lib/payments";
import { ucpCheckoutStore, type StoredCheckout } from "@/services/ucp-checkout-store";
import { getMenuItem } from "@/store/menu";
import type { Env } from "@/types";

/**
 * ADMISSION, AND NOTHING PAST IT.
 *
 * This is the whole of the UCP completion path today: verify the
 * instrument against the checkout's frozen terms, take durable
 * ownership of the payment through the admission every door in this
 * store shares, and bind that ownership to the checkout. It does not
 * prepare the goods and it does not settle. Those are separate
 * increments with their own failure modes, and folding them in here
 * would mean the three boundaries — authorization correctness,
 * ownership correctness, money correctness — could only ever be tested
 * together.
 *
 * WHAT `complete_in_progress` IS ALLOWED TO MEAN, after this runs:
 * the completion has acquired this store's global durable purchase
 * ownership and can safely proceed toward preparation and settlement.
 * Not "we received your request". A platform that reads that state
 * stops sending completions and starts watching, so the state has to
 * be worth that trust.
 *
 * ORDERING IS THE SAFETY PROPERTY, not a style preference:
 *
 *   verify -> admit -> bind
 *
 * Binding first would let a crash leave an authoritative checkout
 * claiming an accepted completion that the purchase system has never
 * heard of, with a platform correctly waiting for an outcome nobody is
 * working towards. Admitting first makes the crash window recoverable
 * instead: the next identical completion verifies again, meets the
 * ownership that already exists, and finishes the binding rather than
 * opening a second purchase.
 *
 * ON UCP AND x402. Core UCP does not know what x402 is. It says a
 * Complete carries a payment instrument defined by one of the handlers
 * the checkout response resolved, and it treats those resolved
 * handlers as authoritative. This store's own payment-handler schema
 * (store.scvd.payment.usdc) is what makes an x402 authorization a
 * valid instrument here. So there is no second UCP challenge envelope
 * to bind — but there is absolutely a binding: the authorization must
 * match the frozen handler terms in every field the money depends on,
 * which is what the adapter refuses on before the facilitator is ever
 * asked.
 */

/** One spelling of the completion's resource path, used by both the
 * admission and the recovery comparison. */
function completionPath(checkout: StoredCheckout): string {
  return `/ucp/v1/checkout-sessions/${checkout.id}`;
}

export type UcpAdmissionOutcome =
  | { ok: true; checkout: StoredCheckout; payment_identity: string; recovered: boolean }
  | {
      ok: false;
      code: "not_found" | "wrong_state" | "stale_version" | "expired" | "payment_refused" | "admission_unavailable";
      detail: string;
      checkout?: StoredCheckout;
    };

const PRECHECK_DETAIL: Record<string, string> = {
  not_found: "No such checkout.",
  wrong_state:
    "This checkout is not payable. Read it: it may already be completing, completed, cancelled, or still waiting on a required input.",
  stale_version:
    "This checkout has been re-quoted since those terms were issued. Read it again and sign the current quote.",
  expired:
    "This checkout's terms expired. Read it again for a current quote; nothing was charged.",
};

export async function admitUcpCompletion(
  env: Env,
  input: {
    checkoutId: string;
    credential: unknown;
    verify: FacilitatorVerify;
    expectedVersion?: number;
    nowMs?: number;
  },
): Promise<UcpAdmissionOutcome> {
  const nowMs = input.nowMs ?? Date.now();
  const store = ucpCheckoutStore(env, input.checkoutId);

  /**
   * Read-only, and first: a checkout that could never be completed
   * should not cost the facilitator a round trip or the buyer a
   * signature. Nothing has changed if this refuses.
   */
  const precheck = await store.precheckUcpCompletion({
    expectedVersion: input.expectedVersion,
    nowMs,
  });
  if (!precheck.ok) {
    return {
      ok: false,
      code: precheck.reason,
      detail: PRECHECK_DETAIL[precheck.reason] ?? "This checkout cannot be completed.",
      ...(precheck.checkout ? { checkout: { ...precheck.checkout } } : {}),
    };
  }
  const checkout: StoredCheckout = { ...precheck.checkout };
  const quote = checkout.quote!;

  /**
   * THE TERMS COME OUT OF THE CHECKOUT, NOT OFF TODAY'S SHELF. A price
   * edited between Create and Complete cannot change what this buyer
   * is verified against.
   */
  const adapter = createUcpX402Adapter({
    requirements: asRequirements(quote.requirements),
    verify: input.verify,
  });

  let verified;
  try {
    verified = await adapter.validate(input.credential);
  } catch (error) {
    if (error instanceof UcpPaymentRefused) {
      return { ok: false, code: "payment_refused", detail: error.reason, checkout };
    }
    /**
     * A verifier that threw is not a refusal. Nothing may be recorded
     * as owned on the strength of an unanswered question, and the
     * checkout stays exactly as payable as it was.
     */
    return {
      ok: false,
      code: "admission_unavailable",
      detail:
        "The payment could not be checked just now. Nothing was charged and nothing was recorded; present the same payment again.",
      checkout,
    };
  }

  /**
   * ALREADY BOUND? THEN COMPARE BEFORE ADMITTING ANYTHING.
   *
   * An identical retry and a second, different payment look the same
   * until the credential is verified. Having verified it, the two are
   * told apart here — and crucially BEFORE the shared admission is
   * called, so a credential that will not be allowed to own this
   * checkout never takes ownership of itself either. Admitting it and
   * then refusing to bind would strand that payment: owned by a
   * purchase record, usable by nothing.
   */
  if (checkout.completion) {
    if (checkout.completion.payment_identity === verified.payment.identity) {
      return {
        ok: true,
        checkout,
        payment_identity: verified.payment.identity,
        recovered: true,
      };
    }
    return {
      ok: false,
      code: "wrong_state",
      detail:
        "This checkout is already completing under a different payment. Read it rather than presenting another; the first one still owns it.",
      checkout,
    };
  }

  /**
   * THE SHARED ADMISSION. Every door in this store converges here, on
   * one durable atom per settlement identity — so a payment presented
   * at this checkout and at /api/buy and at the MCP door competes for
   * one ownership and exactly one caller wins. A UCP-local claim would
   * have made replay ownership protocol-scoped, which is the same
   * payment spendable once per protocol.
   */
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
  let intent: PurchaseIntent;
  try {
    intent = await beginVerifiedPurchaseIntent(env, {
      path: completionPath(checkout),
      door: "ucp",
      terms: asRequirements(quote.requirements),
      request: completionRequest(checkout),
      payment: verified.payment,
      ...(item ? { item } : {}),
    });
  } catch (error) {
    /**
     * THE CRASH WINDOW, RECOVERED. A payment that already has a
     * purchase record makes the admission throw rather than return —
     * and on this path that is not a failure, it is the answer. It
     * means ownership was taken by an earlier attempt that died before
     * it could bind the checkout, and the right move is to finish the
     * binding rather than open a second purchase.
     */
    if (error instanceof SettlementUnknown) {
      const saved = await purchaseIntentStore(env, verified.payment.identity).existingPurchase();
      if (saved) {
        const existing = JSON.parse(saved) as PurchaseIntent;
        /**
         * THE EXISTING RECORD HAS TO BE THIS CHECKOUT'S.
         *
         * A payment that already has a purchase record may have bought
         * something else — another checkout, another door, another
         * request entirely. Treating any existing record as "ours"
         * would let one authorization bind a second checkout, which is
         * the same payment buying twice with the ownership check
         * apparently satisfied. Found by the concurrency test, which
         * is the only way this shows up.
         *
         * So the record's own path and request digest are compared
         * against what THIS completion would have produced. They match
         * only when the earlier attempt was this completion.
         */
        const expected = await purchaseRequestDigest(
          env,
          "ucp",
          completionPath(checkout),
          completionRequest(checkout),
        );
        if (existing.path !== completionPath(checkout) || existing.request_digest !== expected) {
          return {
            ok: false,
            code: "payment_refused",
            detail:
              "That payment already belongs to a different purchase. One authorization buys one thing; sign a new one for this checkout.",
            checkout,
          };
        }
        intent = existing;
      } else {
        return {
          ok: false,
          code: "admission_unavailable",
          detail:
            "This payment already has a purchase record that cannot be read just now. Nothing was charged; present the same payment again.",
          checkout,
        };
      }
    } else {
      /**
       * Capacity refusals, a good this store prepares before it takes
       * ownership, a storage outage: all of them mean no ownership was
       * taken. The checkout is left payable.
       */
      return {
        ok: false,
        code: "admission_unavailable",
        detail:
          error instanceof Error && error.message
            ? error.message
            : "This purchase could not be admitted. Nothing was charged.",
        checkout,
      };
    }
  }

  /**
   * OWNERSHIP EXISTS. Only now does the checkout say so publicly.
   * Re-binding the same payment identity is the crash-recovery path
   * and succeeds; a different one is refused even if it covers the
   * same money.
   */
  const identity = completionIdentity(checkout);
  const bound = await store.bindUcpCompletion({
    payment_identity: verified.payment.identity,
    request_digest: intent.request_digest ?? "",
    terms_digest: identity.terms_digest,
    checkout_version: identity.checkout_version,
    ...(intent.token ? { purchase_token: intent.token } : {}),
    nowMs,
  });
  if (!bound.ok) {
    return {
      ok: false,
      code: bound.reason === "stale_version" ? "stale_version" : "wrong_state",
      detail:
        bound.reason === "stale_version"
          ? PRECHECK_DETAIL.stale_version!
          : "This checkout is already completing under a different payment. Read it rather than presenting another.",
      ...(bound.checkout ? { checkout: { ...bound.checkout } } : {}),
    };
  }

  return {
    ok: true,
    checkout: { ...bound.checkout },
    payment_identity: verified.payment.identity,
    /** True when the binding was already ours: a recovered completion, not a second one. */
    recovered: bound.checkout.completion?.at !== new Date(nowMs).toISOString(),
  };
}
