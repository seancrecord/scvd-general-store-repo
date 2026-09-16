import { preparesBeforeAdmission, purchasePreparation } from "@/services/purchase-preparation";
import type { Env, MenuItem } from "@/types";

/**
 * MAY THIS PURCHASE BE SETTLED AT ALL?
 *
 * Not "should it" — that is the settlement orchestrator's question,
 * and it does not exist yet. This is the structural precondition, and
 * it exists now so that the increment which finally moves money starts
 * from a function that can refuse rather than from a comment asking
 * somebody to remember:
 *
 *     purchase owned
 *   AND required preparation durable
 *   = eligible to attempt settlement
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

export type SettlementEligibility =
  | { eligible: true; requires_preparation: boolean }
  | { eligible: false; reason: EligibilityReason; detail: string };

export async function settlementEligibility(
  env: Env,
  args: {
    item: MenuItem | undefined;
    /** The store's settlement identity for the verified payment. */
    paymentIdentity: string | undefined;
    path: string;
    requestDigest: string;
  },
): Promise<SettlementEligibility> {
  if (!args.paymentIdentity) {
    return {
      eligible: false,
      reason: "not_owned",
      detail:
        "No durable purchase ownership for this payment. Nothing may be submitted on a payment nobody has admitted.",
    };
  }

  if (!preparesBeforeAdmission(args.item)) {
    return { eligible: true, requires_preparation: false };
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
      eligible: false,
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
      eligible: false,
      reason: "preparation_unreadable",
      detail:
        "The goods for this purchase could not be read, so it is not safe to settle. Nothing was charged.",
    };
  }
  if (!retained) {
    return {
      eligible: false,
      reason: "preparation_missing",
      detail:
        "This product's goods are made before its payment is taken, and the journal holds none for this purchase. Settling now would charge for something the store cannot prove it made.",
    };
  }
  return { eligible: true, requires_preparation: true };
}
