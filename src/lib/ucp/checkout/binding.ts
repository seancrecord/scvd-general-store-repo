import type { PurchasePayment } from "@/lib/purchase-payment";
import { isExpired } from "@/lib/ucp/checkout/state";
import { termsDigest, type PaymentTerms } from "@/lib/ucp/checkout/terms";

/**
 * DOES THIS PAYMENT SATISFY THIS EXACT, STILL-VALID OBLIGATION?
 *
 * Not "did somebody pay roughly the right amount". Every field the
 * store committed to when it issued the quote is checked against the
 * payment that came back, and the answer names WHICH field disagreed —
 * because "payment rejected" with no reason is the error a buyer
 * cannot act on and an operator cannot debug.
 *
 * WHAT THIS IS NOT. It does not authenticate the payment: the x402
 * gate does that, and `PurchasePayment` is what it produces AFTER
 * authenticating. It does not settle. It does not consume anything.
 * It compares two records and returns a verdict, so that the
 * comparison can be tested exhaustively without a chain, a
 * facilitator, or a clock.
 */

export type BindingFailure =
  | "wrong_checkout"
  | "stale_version"
  | "terms_digest_mismatch"
  | "wrong_network"
  | "wrong_asset"
  | "wrong_recipient"
  | "amount_mismatch"
  | "expired"
  | "unsupported_protocol";

export type BindingVerdict =
  | { ok: true; identity: string }
  | { ok: false; failure: BindingFailure; detail: string };

/**
 * EXACT EQUALITY, NEVER `>=`.
 *
 * An overpayment is not a generous buyer to be thanked; on this shelf
 * it is very often somebody who meant a different tier, and crediting
 * it against the cheaper one silently sells them the wrong thing. An
 * underpayment obviously cannot satisfy the obligation. Both are
 * refused here and both belong in the reconciliation record, because
 * the money may genuinely have moved either way.
 */
function amountsAgree(paid: string, owed: string): boolean {
  if (!/^[0-9]+$/.test(paid) || !/^[0-9]+$/.test(owed)) return false;
  return BigInt(paid) === BigInt(owed);
}

/** One EVM address however it is cased; base58 exactly as served. */
function sameAddress(network: string, a: string, b: string): boolean {
  return network.startsWith("eip155:")
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

export async function verifyPaymentAgainstTerms(args: {
  payment: PurchasePayment;
  terms: PaymentTerms;
  /** The digest this store issued with the quote. */
  issuedDigest: string;
  /** The checkout's current version, so a re-quoted checkout refuses an old signature. */
  currentVersion: number;
  nowMs: number;
}): Promise<BindingVerdict> {
  const { payment, terms, issuedDigest, currentVersion, nowMs } = args;

  if (payment.protocol !== "x402" && payment.protocol !== "mpp") {
    return {
      ok: false,
      failure: "unsupported_protocol",
      detail: `This checkout settles x402 and MPP authorizations; the payment says "${payment.protocol}".`,
    };
  }

  if (terms.checkout_id !== args.terms.checkout_id || !terms.checkout_id) {
    return { ok: false, failure: "wrong_checkout", detail: "No checkout on these terms." };
  }

  /**
   * A checkout that was re-quoted has a new version, and a signature
   * bound to the old one is bound to terms this store has withdrawn.
   * Checked BEFORE the digest so the error says what happened rather
   * than "hash mismatch".
   */
  if (terms.checkout_version !== currentVersion) {
    return {
      ok: false,
      failure: "stale_version",
      detail: `These terms are version ${terms.checkout_version}; the checkout is now version ${currentVersion}. Re-read the checkout and sign the current quote.`,
    };
  }

  const recomputed = await termsDigest(terms);
  if (recomputed !== issuedDigest) {
    return {
      ok: false,
      failure: "terms_digest_mismatch",
      detail: "These terms are not the terms this store issued for this checkout.",
    };
  }

  /**
   * EXPIRY IS MEASURED AT THE COMPLETE CALL, not at the transfer and
   * not at finality. The buyer chooses when to call; they do not
   * choose how long a rail takes.
   */
  if (isExpired(terms.expires_at, nowMs)) {
    return {
      ok: false,
      failure: "expired",
      detail: `These terms expired at ${terms.expires_at}. Read the checkout again for a current quote; nothing was charged.`,
    };
  }

  if (payment.network !== terms.network) {
    return {
      ok: false,
      failure: "wrong_network",
      detail: `Quoted on ${terms.network}; the payment is on ${payment.network}.`,
    };
  }

  /**
   * The asset is compared by exact identity, never by symbol. A token
   * that calls itself USDC is not evidence that it is the USDC this
   * store quoted, and bridged or legacy variants are different assets
   * with different issuers.
   */
  if (!sameAddress(terms.network, payment.asset, terms.asset)) {
    return {
      ok: false,
      failure: "wrong_asset",
      detail: `Quoted ${terms.asset} on ${terms.network}; the payment moved ${payment.asset}.`,
    };
  }

  if (!sameAddress(terms.network, payment.recipient, terms.pay_to)) {
    return {
      ok: false,
      failure: "wrong_recipient",
      detail: `Quoted pay-to ${terms.pay_to}; the payment went to ${payment.recipient}.`,
    };
  }

  if (!amountsAgree(payment.amount_atomic, terms.amount_atomic)) {
    return {
      ok: false,
      failure: "amount_mismatch",
      detail: `This checkout owes exactly ${terms.amount_atomic} atomic units; the payment is ${payment.amount_atomic}. Exact means exact — an amount that is right for a different tier is wrong for this one.`,
    };
  }

  return { ok: true, identity: payment.identity };
}

/**
 * REPLAY IS ALREADY REFUSED STOREWIDE, AND NOT BY THIS FILE.
 *
 * The first draft of this module invented a consumption key. Reading
 * the merged tree made that a mistake to delete rather than keep:
 * `purchaseIntentStore(env, payment.identity)` addresses one Durable
 * Object per payment identity, and `beginVerifiedPurchaseIntent`
 * claims it before anything settles — the shared admission the store
 * already runs for every verified adapter.
 *
 * That guard is strictly stronger than a UCP-local one would be. Its
 * identity deliberately excludes the protocol, so one authorization
 * cannot be spent once as x402 and again as MPP; and because it is the
 * SAME atom the /api/buy door and the MCP door claim, a payment cannot
 * be spent once through a UCP checkout and again through the till. A
 * key scoped to UCP would have left exactly that door open, which is
 * the whole attack one namespace over.
 *
 * So there is nothing here to consume. A UCP completion presents its
 * verified PurchasePayment to the existing admission, and the replay
 * answer comes back from the mechanism that has been giving it since
 * before UCP existed.
 */
export const REPLAY_GUARD =
  "services/purchase-intent.ts — beginVerifiedPurchaseIntent claims purchaseIntentStore(env, payment.identity), storewide and protocol-independent";
