import { preparesBeforeAdmission, purchasePreparation } from "@/services/purchase-preparation";
import type { Env, MenuItem } from "@/types";

/**
 * MAY THIS PURCHASE ENTER SETTLEMENT FULFILLMENT?
 *
 * NOT "may it be settled". The rename is the point, and it corrects a
 * name this branch had for one commit. A function returning
 * `eligible: true` sitting beside a facilitator is an invitation to
 * read it as permission to submit, and for ordinary products it never
 * was: their real production still has to happen, above the settle
 * line, during the fulfillment this predicate merely allows to begin.
 *
 * What it answers is the structural precondition for entering that
 * fulfillment at all:
 *
 *     purchase owned
 *   AND required preparation durable
 *   = may begin the fulfillment whose last line is settlement
 *
 * WHY IT IS ITS OWN CONCEPT rather than a line inside the settler.
 * The two orderings this store runs make "prepared" mean different
 * things per product, and the dangerous direction is one-way: for a
 * product whose goods must exist first, settling without them is
 * taking money for something the store cannot produce and cannot
 * prove it held. Written here, the settler receives an already-owned
 * purchase and refuses to submit unless the product's own requirement
 * is satisfied. Written inline, it is a check somebody deletes while
 * refactoring.
 *
 * FOR after_admission PRODUCTS the requirement is empty, and that is
 * not a loophole. Their goods are cheap to regenerate and are retained
 * against the settlement transaction itself, which by definition
 * cannot exist yet — so ownership is the whole precondition, and their
 * production happens after it on the way to delivery.
 */

export type EligibilityReason =
  | "not_owned"
  | "preparation_missing"
  | "preparation_unreadable";

export type SettlementPreconditions =
  | { ok: true; requires_preparation: boolean }
  | { ok: false; reason: EligibilityReason; detail: string };

/**
 * THE ONLY THING THAT ACTUALLY SUBMITS is the `settle` callback inside
 * fulfillPurchase, which is reached only after every pre-money step of
 * a product has succeeded. This function never grants that; it decides
 * whether the attempt may begin.
 */
export async function mayEnterSettlementFulfillment(
  env: Env,
  args: {
    item: MenuItem | undefined;
    /** The store's settlement identity for the verified payment. */
    paymentIdentity: string | undefined;
    path: string;
    requestDigest: string;
  },
): Promise<SettlementPreconditions> {
  if (!args.paymentIdentity) {
    return {
      ok: false,
      reason: "not_owned",
      detail:
        "No durable purchase ownership for this payment. Nothing may be submitted on a payment nobody has admitted.",
    };
  }

  if (!preparesBeforeAdmission(args.item)) {
    return { ok: true, requires_preparation: false };
  }

  const ordering = purchasePreparation(
    env,
    args.item,
    args.paymentIdentity,
    args.path,
    args.requestDigest,
  );
  if (ordering.mode !== "before_admission") {
    // Unreachable while preparesBeforeAdmission and purchasePreparation
    // agree, which a test requires across the whole shelf. Refusing
    // rather than assuming keeps the disagreement cheap if it ever happens.
    return {
      ok: false,
      reason: "preparation_missing",
      detail: "This product's preparation requirement could not be determined.",
    };
  }

  let retained;
  try {
    retained = await ordering.checkpoint.read();
  } catch {
    /**
     * An unreadable journal is not an empty one. Treating it as empty
     * would let a settlement go ahead on goods that may well exist,
     * and treating it as a refusal costs only a retry.
     */
    return {
      ok: false,
      reason: "preparation_unreadable",
      detail:
        "The goods for this purchase could not be read, so it is not safe to settle. Nothing was charged.",
    };
  }
  if (!retained) {
    return {
      ok: false,
      reason: "preparation_missing",
      detail:
        "This product's goods are made before its payment is taken, and the journal holds none for this purchase. Settling now would charge for something the store cannot prove it made.",
    };
  }
  return { ok: true, requires_preparation: true };
}
