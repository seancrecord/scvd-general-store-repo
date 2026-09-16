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
  /** The payment identity admitted for this checkout, for reconciliation. */
  admitted?: { identity: string; at: string };
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
   * ONE COMPLETION IS ADMITTED, and the second concurrent caller is
   * told the first is in flight rather than being allowed to settle
   * beside it.
   *
   * The transition into complete_in_progress IS the admission: it is
   * durable before any money is presented, so a crash between here and
   * settlement leaves a checkout that says, truthfully, that a
   * completion was accepted and its outcome is not yet known.
   */
  async admitCompletion(input: {
    expectedVersion: number;
    nowMs: number;
  }): Promise<CheckoutAdmission> {
    return this.storage.transaction(async (txn) => {
      const checkout = await txn.get<StoredCheckout>(ROW);
      if (!checkout) return { ok: false, reason: "not_found" } as const;
      if (checkout.status === "completed" || checkout.status === "complete_in_progress") {
        // Not a failure the caller should retry past: read the checkout.
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.status !== "ready_for_complete") {
        return { ok: false, reason: "wrong_state", checkout } as const;
      }
      if (checkout.version !== input.expectedVersion) {
        return { ok: false, reason: "stale_version", checkout } as const;
      }
      if (isExpired(checkout.expires_at, input.nowMs)) {
        return { ok: false, reason: "expired", checkout } as const;
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
      const next: StoredCheckout = {
        ...checkout,
        status: "completed",
        order: { ...input.order, created_at: at },
        admitted: { identity: input.identity, at },
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
      const next: StoredCheckout = { ...checkout, status: "ready_for_complete" };
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
