import {
  assertTransition,
  checkoutExpiry,
  isExpired,
  isTerminal,
  type CheckoutStatus,
} from "@/lib/ucp/checkout/state";
import type { FrozenRequirements } from "@/lib/ucp/checkout/requirements";
import type { CheckoutLineTerms, PaymentTerms } from "@/lib/ucp/checkout/terms";
import type { Env } from "@/types";

/**
 * WHERE A CHECKOUT LIVES, AND WHY IT IS NOT A NEW DURABLE OBJECT CLASS.
 *
 * One instance per checkout, addressed by name off the namespace the
 * store already has. That is the same trick services/labor-reservations
 * plays with `labor-capacity:v1`: a Durable Object CLASS is what needs
 * a migration and a deploy ordering the docs in wrangler.jsonc warn
 * about (a versions upload cannot provision a new class, Cloudflare
 * error 10211); a NAMED INSTANCE of an existing class needs neither.
 *
 * One instance per checkout is also exactly the serialization this
 * needs and no more. Everything that must not race — bumping the
 * version, issuing a quote, admitting one completion — races only with
 * itself, inside one checkout. Nothing here coordinates across
 * checkouts, because nothing here should: the two things that are
 * genuinely storewide, capacity and payment replay, already have their
 * own atoms and are claimed through those.
 */

export interface StoredCheckout {
  id: string;
  /** Bumped by every change a payment quote depends on. */
  version: number;
  status: CheckoutStatus;
  created_at: string;
  expires_at: string;
  lines: CheckoutLineTerms[];
  /**
   * The quote this store issued: the digest-bearing commercial terms
   * AND the exact x402 requirements they resolve to.
   *
   * The requirements are stored rather than rebuilt at Complete. A
   * checkout that recomputed them from today's shelf would quote one
   * price and verify against another the moment somebody edited the
   * menu in between — the gap the snapshot exists to close.
   */
  quote?: {
    terms: PaymentTerms;
    digest: string;
    requirements: FrozenRequirements;
  };
  /** Buyer-supplied product inputs, frozen with the rest of the terms. */
  inputs?: Record<string, string>;
  /** Set once, when settlement is confirmed. */
  order?: { id: string; permalink_url: string; created_at: string };
  /**
   * WHAT AN ACCEPTED COMPLETION LEAVES BEHIND, and what it never does.
   *
   * Written in the same transaction that enters complete_in_progress,
   * and only after the store's global purchase admission has already
   * granted durable ownership of this payment. Everything here is
   * recomputable from durable state or is a one-way identity: enough
   * to recover the completion without the original request body.
   *
   * THE CREDENTIAL IS NOT HERE. A checkout never retains the bytes
   * that could move money; the purchase record does not either, and
   * this is the same rule one layer up.
   */
  completion?: {
    protocol: "ucp";
    /** The store's global settlement identity for the admitted payment. */
    payment_identity: string;
    /** JCS digest of the completion identity, recomputable from this record. */
    request_digest: string;
    terms_digest: string;
    checkout_version: number;
    /** Recovery locator for the admitted purchase, when one was issued. */
    purchase_token?: string;
    at: string;
  };
}

export type CheckoutAdmission =
  | { ok: true; checkout: StoredCheckout }
  | { ok: false; reason: "not_found" | "expired" | "wrong_state" | "stale_version"; checkout?: StoredCheckout };

const ROW = "ucp:checkout";

export function ucpCheckoutStore(env: Env, checkoutId: string) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Checkout storage unavailable");
  return namespace.get(namespace.idFromName(`ucp-checkout:${checkoutId}`));
}

export class UcpCheckoutStore {
  constructor(
    private storage: DurableObjectStorage,
    private env: Env,
  ) {}

  async read(): Promise<StoredCheckout | null> {
    return (await this.storage.get<StoredCheckout>(ROW)) ?? null;
  }

  /**
   * Idempotent on the checkout id: a retried create returns what was
   * created rather than a second checkout, because the id is the
   * instance name and the instance already holds one.
   */
  async create(input: {
    id: string;
    lines: CheckoutLineTerms[];
    inputs?: Record<string, string>;
    nowMs: number;
  }): Promise<StoredCheckout> {
    return this.storage.transaction(async (txn) => {
      const prior = await txn.get<StoredCheckout>(ROW);
      if (prior) return prior;
      const checkout: StoredCheckout = {
        id: input.id,
        version: 1,
        status: "incomplete",
        created_at: new Date(input.nowMs).toISOString(),
        expires_at: checkoutExpiry(input.nowMs),
        lines: input.lines,
        ...(input.inputs ? { inputs: input.inputs } : {}),
      };
      await txn.put(ROW, checkout);
      return checkout;
    });
  }

  /**
   * A CHANGE TO ANYTHING A QUOTE DEPENDS ON BUMPS THE VERSION AND
   * THROWS THE QUOTE AWAY.
   *
   * That is what makes a stale signature refusable rather than
   * dangerous: the buyer signed terms this store has withdrawn, and
   * the withdrawal is visible in a number rather than inferable from a
   * hash that no longer matches.
   */
  async revise(input: {
    lines?: CheckoutLineTerms[];
    inputs?: Record<string, string>;
    status?: CheckoutStatus;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (isTerminal(checkout.status)) {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (isExpired(checkout.expires_at, input.nowMs)) {
        return { ok: false, reason: "expired", checkout } as const;
      }
      const priced =
        input.lines !== undefined || input.inputs !== undefined;
      const next: StoredCheckout = {
        ...checkout,
        ...(input.lines ? { lines: input.lines } : {}),
        ...(input.inputs ? { inputs: input.inputs } : {}),
        ...(priced ? { version: checkout.version + 1 } : {}),
        ...(input.status ? { status: input.status } : {}),
      };
      if (priced) delete next.quote;
      if (input.status) assertTransition(checkout.status, input.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  /** Attach the quote this store is committing to for the current version. */
  async quote(input: {
    terms: PaymentTerms;
    digest: string;
    requirements: FrozenRequirements;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (isTerminal(checkout.status)) {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (isExpired(checkout.expires_at, input.nowMs)) {
        return { ok: false, reason: "expired", checkout } as const;
      }
      if (input.terms.checkout_version !== checkout.version) {
        return { ok: false, reason: "stale_version", checkout } as const;
      }
      const next: StoredCheckout = {
        ...checkout,
        quote: {
          terms: input.terms,
          digest: input.digest,
          requirements: input.requirements,
        },
        status: "ready_for_complete",
      };
      assertTransition(checkout.status, next.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  /**
   * THE PRECONDITIONS, READ WITHOUT CHANGING ANYTHING.
   *
   * Called before a credential is verified, so a checkout that could
   * never be completed does not cost the facilitator a round trip and
   * does not cost the buyer a signature. It deliberately does NOT
   * transition: see bindCompletion for why the public state change has
   * to come last.
   */
  async precheckCompletion(input: {
    expectedVersion?: number;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    const checkout = await this.read();
    if (!checkout) return { ok: false, reason: "not_found" };
    /**
     * `complete_in_progress` WITH A BINDING IS ALLOWED THROUGH, and it
     * has to be: that is the identical-retry path. A platform whose
     * original response was lost repeats the same completion, and the
     * only way to tell it apart from a second, different payment is to
     * verify the credential and compare identities. Refusing here
     * would make the recovery unreachable and leave the buyer holding
     * a signed payment nobody will acknowledge.
     *
     * Nothing is admitted on that path — see ucp-admission.ts, which
     * compares the verified identity against the binding BEFORE going
     * anywhere near the shared purchase admission, so a different
     * credential cannot take ownership it will not be allowed to use.
     */
    if (checkout.status === "complete_in_progress" && checkout.completion) {
      return checkout.quote
        ? { ok: true, checkout }
        : { ok: false, reason: "wrong_state", checkout };
    }
    if (checkout.status !== "ready_for_complete") {
      return { ok: false, reason: "wrong_state", checkout };
    }
    if (input.expectedVersion !== undefined && checkout.version !== input.expectedVersion) {
      return { ok: false, reason: "stale_version", checkout };
    }
    if (isExpired(checkout.expires_at, input.nowMs)) {
      return { ok: false, reason: "expired", checkout };
    }
    if (!checkout.quote) return { ok: false, reason: "wrong_state", checkout };
    return { ok: true, checkout };
  }

  /**
   * THE BINDING IS INTERNAL. THE PUBLIC STATE IS NOT.
   *
   * This binds the admitted payment to the checkout and DOES NOT move
   * the public status. That is a correction to an earlier design in
   * this same branch, and the reason is the store's own rule about
   * credentials: it never retains them.
   *
   * `complete_in_progress` tells a platform its Complete was accepted
   * — stop sending completions, watch the checkout. If that state were
   * entered at ownership and the process then died, nothing could
   * resume: the credential is gone by design, there is no autonomous
   * settlement worker, and a client obediently polling would wait
   * forever for an outcome nobody can produce. Ownership is real, but
   * it is too early for a public promise.
   *
   * So the public status stays `ready_for_complete` until the payment
   * is actually at the settlement boundary — see enterSettlement. A
   * client that polls before then is told, truthfully, that the
   * checkout is still waiting to be paid, and an identical retry finds
   * this binding and resumes rather than admitting a second purchase.
   *
   * ONE PAYMENT OWNS A COMPLETION. Rebinding with the SAME identity is
   * that recovery and returns success. Rebinding with a DIFFERENT one
   * is refused even when it satisfies the same money: a second
   * credential must not be able to take over an in-flight checkout
   * merely because it also happens to cover the price.
   */
  async bindCompletion(input: {
    payment_identity: string;
    request_digest: string;
    terms_digest: string;
    checkout_version: number;
    purchase_token?: string;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;

      const bound = checkout.completion;
      if (bound) {
        return bound.payment_identity === input.payment_identity
          ? ({ ok: true, checkout } as const)
          : ({ ok: false, reason: "wrong_state", checkout } as const);
      }
      if (checkout.status === "completed" || checkout.status === "canceled") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.status !== "ready_for_complete") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.version !== input.checkout_version) {
        return { ok: false, reason: "stale_version", checkout } as const;
      }
      if (checkout.quote?.digest !== input.terms_digest) {
        return { ok: false, reason: "stale_version", checkout } as const;
      }
      const next: StoredCheckout = {
        ...checkout,
        // Status deliberately unchanged: see the note above.
        completion: {
          protocol: "ucp",
          payment_identity: input.payment_identity,
          request_digest: input.request_digest,
          terms_digest: input.terms_digest,
          checkout_version: input.checkout_version,
          ...(input.purchase_token ? { purchase_token: input.purchase_token } : {}),
          at: new Date(input.nowMs).toISOString(),
        },
      };
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  /**
   * THE PUBLIC PROMISE, MADE WHEN IT CAN BE KEPT.
   *
   * Called once the payment has reached the settlement boundary and
   * this execution holds the submission claim — which is to say, once
   * something is genuinely in flight that a poll can learn the outcome
   * of. Only then does the checkout say `complete_in_progress`.
   *
   * Idempotent: an execution that already made the promise may say so
   * again without it meaning a second attempt.
   */
  async enterSettlement(input: {
    payment_identity: string;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (!checkout.completion) {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.completion.payment_identity !== input.payment_identity) {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.status === "complete_in_progress") {
        return { ok: true, checkout } as const;
      }
      if (checkout.status !== "ready_for_complete") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      const next: StoredCheckout = { ...checkout, status: "complete_in_progress" };
      assertTransition(checkout.status, next.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  /**
   * Settlement confirmed: the order exists, so the checkout is done.
   * Written in one transaction with the order reference, because a
   * completed checkout with no order is a state the specification does
   * not have and a buyer cannot act on.
   */
  async complete(input: {
    order: { id: string; permalink_url: string };
    identity: string;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (checkout.status === "completed") {
        // Idempotent: the same completion twice is one completion.
        return { ok: true, checkout } as const;
      }
      if (checkout.status !== "complete_in_progress") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      const at = new Date(input.nowMs).toISOString();
      if (checkout.completion && checkout.completion.payment_identity !== input.identity) {
        // A different payment cannot finish a completion this checkout
        // already bound to another one.
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      const next: StoredCheckout = {
        ...checkout,
        status: "completed",
        order: { ...input.order, created_at: at },
      };
      assertTransition(checkout.status, next.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  /**
   * Settlement DECLINED — established, not unknown. No money moved, so
   * the checkout goes back to being payable and the buyer may sign
   * again against the same terms.
   *
   * There is deliberately no method for the UNKNOWN case. A checkout
   * whose settlement outcome is unresolved stays in
   * complete_in_progress, which is what that state is for; moving it
   * anywhere would be claiming to know something the store does not.
   */
  async declined(): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (checkout.status !== "complete_in_progress") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      /**
       * A confirmed non-payment releases the binding too: no money
       * moved, so the checkout is payable again and the next
       * credential is free to be a different one.
       */
      const next: StoredCheckout = { ...checkout, status: "ready_for_complete" };
      delete next.completion;
      assertTransition(checkout.status, next.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }

  async cancel(): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (checkout.status === "canceled") return { ok: true, checkout } as const;
      if (checkout.status === "completed") {
        // A paid order is not cancellable by withdrawing its checkout.
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.status === "complete_in_progress") {
        // Money may be in flight. Cancelling here would be claiming it
        // is not, which is the one thing nobody can know yet.
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      const next: StoredCheckout = { ...checkout, status: "canceled" };
      assertTransition(checkout.status, next.status);
      await txn.put(ROW, next);
      return { ok: true, checkout: next } as const;
    });
  }
}
