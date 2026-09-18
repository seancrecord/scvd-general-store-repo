import { createUcpX402Adapter, UcpPaymentRefused, type FacilitatorVerify } from "@/lib/ucp/checkout/adapter";
import { completionIdentity, completionRequest } from "@/lib/ucp/checkout/completion";
import { asRequirements } from "@/lib/ucp/checkout/requirements";
import { purchasePreparation } from "@/services/purchase-preparation";
import { prepareThroughFulfillment } from "@/services/ucp-preparation";
import type {
  ObservationCheckpoint,
  PreparedObservation,
} from "@/services/purchase-observation";
import {
  beginVerifiedPurchaseIntent,
  purchaseIntentStore,
  purchaseRequestDigest,
  type PurchaseIntent,
} from "@/services/purchase-intent";
import { SettlementUnknown } from "@/lib/payments";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
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

/**
 * What happened to the goods on the way through, said plainly because
 * "prepared" and "reused a prepared one" are different facts and only
 * one of them means external work was done.
 */
export type PreparationOutcome = "not_required" | "made" | "reused";

export type UcpAdmissionOutcome =
  | {
      ok: true;
      checkout: StoredCheckout;
      payment_identity: string;
      recovered: boolean;
      prepared: PreparationOutcome;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "wrong_state"
        | "stale_version"
        | "expired"
        | "payment_refused"
        | "preparation_failed"
        | "preparation_unavailable"
        | "admission_unavailable";
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
    /**
     * Produces this product's goods. Called ONLY for items whose
     * ordering requires the goods before ownership, and only when the
     * journal does not already hold them — so a retry never repeats
     * paid or external work.
     *
     * Defaults to the real producer: `prepareThroughFulfillment` runs
     * the store's own fulfillment path with a settle that refuses, so
     * every actual product implementation is exercised and the exact
     * produced bytes are journalled, with no authorization presented.
     * The parameter remains so a test can substitute a counter or a
     * failure without standing up a chain.
     */
    prepare?: (checkpoint: ObservationCheckpoint) => Promise<PreparedObservation>;
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
  const item = getMenuItem(checkout.lines[0]?.item_id ?? "");

  /**
   * THE TERMS COME OUT OF THE CHECKOUT, NOT OFF TODAY'S SHELF. A price
   * edited between Create and Complete cannot change what this buyer
   * is verified against.
   */
  const adapter = createUcpX402Adapter({
    requirements: asRequirements(quote.requirements),
    verify: input.verify,
  });

  /**
   * THE BYTE-IDENTICAL RETRY, RECOGNISED WITHOUT THE FACILITATOR.
   *
   * A platform whose completion response was lost sends the same
   * Complete again. Asking the facilitator to verify it again would be
   * wrong twice over: pointless, because ownership already exists,
   * and — once the payment has settled — FALSE, because the nonce is
   * burned on-chain and a verifier will now say no to a payment that
   * paid. So a bound checkout is compared first against what it is
   * bound to: the purchase record keeps the one-way fingerprint of the
   * exact wire credential it was admitted on (payment_proof), and the
   * same credential rebound to the same frozen terms produces the same
   * fingerprint. Equal means this is that completion, on every rail,
   * and it is handed back as recovered — the checkout's state, the
   * order if there is one — with nothing verified, owned or prepared.
   *
   * WHAT THIS CANNOT DO. A forged credential that reproduces the
   * fingerprint would have to reproduce the signature bytes, and a
   * caller holding those already holds the credential. Even then the
   * answer is what Get Checkout shows anyone. No money moves here.
   *
   * A DIFFERENT credential against a completed checkout is refused
   * here, before the facilitator: that checkout has an order, and a
   * second payment for it would be a second sale for one thing.
   */
  if (checkout.completion) {
    let proof: string | undefined;
    try {
      proof = await sha256Hex(jcsCanonicalize(adapter.bind(input.credential)));
    } catch (error) {
      if (error instanceof UcpPaymentRefused) {
        return { ok: false, code: "payment_refused", detail: error.reason, checkout };
      }
      throw error;
    }
    const boundTo = await purchaseIntentStore(env, checkout.completion.payment_identity)
      .existingPurchase()
      .catch(() => null);
    const owner = boundTo ? (JSON.parse(boundTo) as PurchaseIntent) : undefined;
    if (owner && owner.payment_proof === proof) {
      return {
        ok: true,
        checkout,
        payment_identity: owner.id,
        recovered: true,
        prepared: "reused",
      };
    }
    if (checkout.status === "completed") {
      return {
        ok: false,
        code: "wrong_state",
        detail:
          "This checkout is completed under a different payment and already has an order. Read it rather than presenting another payment; one checkout is one sale.",
        checkout,
      };
    }
  }

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
   * THE ORDERING THIS PRODUCT REQUIRES, ASKED FOR RATHER THAN ASSUMED.
   *
   * For most goods, ownership comes first and the goods follow. For
   * the ones that are fully prepared before settlement, the shared
   * admission will refuse ownership unless the prepared observation is
   * already retained — so they are prepared here, before admission,
   * and the checkpoint is what makes that durable.
   */
  const completionDigest = await purchaseRequestDigest(
    env,
    "ucp",
    completionPath(checkout),
    completionRequest(checkout),
  );
  const ordering = purchasePreparation(
    env,
    item,
    verified.payment.identity,
    completionPath(checkout),
    completionDigest,
  );
  let prepared: PreparationOutcome = "not_required";

  if (ordering.mode === "before_admission") {
    /**
     * READ FIRST, ALWAYS. A prepared observation is an artifact, not a
     * cache: it was signed, it may have cost a real payment at
     * somebody else's door, and it is what the buyer is owed. A retry
     * that regenerated it would produce different bytes for the same
     * purchase and throw away the ones already promised.
     */
    let existing: PreparedObservation | null = null;
    try {
      existing = await ordering.checkpoint.read();
    } catch {
      return {
        ok: false,
        code: "preparation_unavailable",
        detail:
          "The goods for this purchase could not be read just now. Nothing was charged and nothing was recorded; present the same payment again.",
        checkout,
      };
    }

    if (existing) {
      prepared = "reused";
    } else if (!item) {
      return {
        ok: false,
        code: "preparation_unavailable",
        detail: "This checkout names an item this store no longer sells.",
        checkout,
      };
    } else {
      const produce =
        input.prepare ??
        ((checkpoint: ObservationCheckpoint) =>
          prepareThroughFulfillment(env, item, checkpoint, {
            inputs: checkout.inputs ?? {},
            payer: verified.payment.payer,
            network: verified.payment.network,
            paidUsdc: Number(verified.payment.amount_atomic) / 1e6,
          }));
      let made: PreparedObservation;
      try {
        made = await produce(ordering.checkpoint);
      } catch (error) {
        /**
         * Preparation failed BEFORE anything was owned. That is the
         * cheap failure this ordering exists to make possible: no
         * ownership, no money, and a checkout still payable.
         */
        return {
          ok: false,
          code: "preparation_failed",
          detail:
            error instanceof Error && error.message
              ? error.message
              : "The goods for this purchase could not be made. Nothing was charged.",
          checkout,
        };
      }
      try {
        /**
         * The real producer journals as it goes, so this is a no-op
         * that returns what is already there. It stays because an
         * injected preparer may not journal, and because the invariant
         * this increment rests on is "durably retained before
         * ownership" rather than "somebody remembered to save".
         */
        await ordering.checkpoint.save(made);
      } catch {
        /**
         * Made but not retained. Ownership must not be taken on goods
         * the store cannot prove it holds, so this fails the same way
         * a failed preparation does.
         */
        return {
          ok: false,
          code: "preparation_unavailable",
          detail:
            "The goods were made but could not be retained, so this purchase was not admitted. Nothing was charged; present the same payment again.",
          checkout,
        };
      }
      prepared = "made";
    }
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
        prepared,
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
    prepared,
  };
}
