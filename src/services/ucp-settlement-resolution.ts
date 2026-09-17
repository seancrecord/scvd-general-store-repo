import {
  atomicToUsdc,
  tipFromPaid,
  INVALID_SETTLEMENT_RECEIPT_CODE,
  type SettledPayment,
} from "@/lib/payments";
import { SOLANA_NETWORK } from "@/lib/payment-networks";
import { decodeBase58 } from "@/lib/base58";
import { recordSettlementUnknown } from "@/services/settlement-unknown";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { ucpCheckoutStore, type StoredCheckout } from "@/services/ucp-checkout-store";
import type { PaymentTerms } from "@/lib/ucp/checkout/terms";
import type {
  SettlementSubmission,
  SubmissionClaim,
} from "@/services/settlement-submission";
import { getMenuItem } from "@/store/menu";
import type { Env } from "@/types";

/**
 * WHAT A SETTLEMENT RESULT BECOMES, AND WHICH RECORD GETS TO SAY SO.
 *
 * Three durable records take part in a settlement outcome, and they
 * cannot be one transaction: the purchase record lives in one Durable
 * Object, the submission claim beside it, and the checkout in
 * another. So this module decides, once, which is authoritative for
 * what — and every retry converges the other two FROM that, never the
 * other way round.
 *
 *   purchase record   — whether money moved.        AUTHORITATIVE.
 *   submission row    — whether anyone may submit.  AUTHORITATIVE.
 *   checkout          — what a platform is shown.   A PROJECTION.
 *
 * Two rules fall out of that and are the whole point of the file:
 *
 *   never infer payment truth from checkout state;
 *   never infer permission to resubmit from purchase state alone.
 *
 * WRITE ORDER is purchase, then submission, then checkout. A process
 * that dies between any two of those leaves a state this module can
 * read its way out of, because the record written first is the one
 * that outranks the others: a purchase that says settled with a row
 * that says nothing is a confirmation whose bookkeeping never
 * finished, not an open question. The reverse — a row that says
 * something the purchase does not — is never produced here, and if
 * found is NOT trusted for money: the purchase says unknown, so the
 * money is unknown, and reconciliation owns it.
 *
 * NOTHING HERE CALLS A FACILITATOR. The result is produced by an
 * injected function, exactly once, by the execution that won the
 * submission claim. This increment feeds it synthetic results; the
 * next one hands it the store's real x402 settlement orchestration.
 * The mapping from a result onto the three records is the same either
 * way, which is why it is built and tested before any money can move.
 */

/**
 * What a settlement attempt reports. `success` is deliberately NOT
 * `confirmed`: a facilitator saying yes with a receipt this store
 * cannot use establishes neither payment nor non-payment
 * (payments.ts, INVALID_SETTLEMENT_RECEIPT_CODE), and only a receipt
 * that checks out against the frozen terms is allowed to become one.
 */
export type SettlementResult =
  | { kind: "declined"; reason: string; message?: string }
  | { kind: "unknown"; reason: string }
  /**
   * `payer` is carried for the record and not used for the record:
   * the payer of record is the admitted purchase's, from the signed
   * authorization, exactly as on the HTTP and MCP doors.
   */
  | { kind: "success"; transaction: unknown; network: unknown; payer?: unknown };

export type WonClaim = Extract<SubmissionClaim, { won: true }>;

/** Produces the result. Called at most once per claim, by its winner. */
export type SettlementProducer = (submission: SettlementSubmission) => Promise<SettlementResult>;

export interface SettlementConvergence {
  /**
   * From the purchase record alone. `unrecorded` means there is no
   * admitted purchase behind this checkout, so there is no money
   * question to answer.
   */
  money: PurchaseIntent["state"] | "unrecorded";
  submission?: SettlementSubmission;
  checkout_status?: StoredCheckout["status"];
  /** Which records this pass rewrote to agree with the authoritative ones. */
  repaired: string[];
}

/**
 * A resolution that could not finish writing. The claim is still
 * held, some records may be written, and the next convergence pass
 * repairs the rest; what this must never be mistaken for is a failure
 * of the goods, which is why it is its own class.
 */
/**
 * The caller does not hold the durable claim for this payment. Thrown
 * rather than returned because reaching it means a caller constructed
 * or reused a `{ won: true }` object instead of taking the claim, and
 * that should be loud, not quietly converged.
 */
export class SettlementClaimNotHeld extends Error {
  constructor(readonly reason: "no_claim" | "wrong_purchase" | "wrong_request") {
    super(`This execution does not hold the settlement claim (${reason}); nothing is produced`);
    this.name = "SettlementClaimNotHeld";
  }
}

export class SettlementResolutionFailed extends Error {
  constructor(cause: unknown) {
    super("Settlement outcome could not be fully recorded; retry converges it", { cause });
    this.name = "SettlementResolutionFailed";
  }
}

function checkedReceipt(
  result: Extract<SettlementResult, { kind: "success" }>,
  terms: PaymentTerms,
): { ok: true; transaction: string } | { ok: false; reason: string } {
  // The offered rail is authoritative. A success naming another rail
  // is not a success on this one (payments.ts, checkedSettlement).
  if (result.network !== terms.network) {
    return { ok: false, reason: `network ${String(result.network)} is not the quoted ${terms.network}` };
  }
  const tx = result.transaction;
  if (typeof tx !== "string" || tx.length === 0) {
    return { ok: false, reason: "no transaction in the receipt" };
  }
  if (terms.network === SOLANA_NETWORK) {
    if (tx.length < 64 || tx.length > 88 || decodeBase58(tx)?.length !== 64) {
      return { ok: false, reason: "transaction is not a 64-byte Solana signature" };
    }
    return { ok: true, transaction: tx };
  }
  if (terms.network.startsWith("eip155:")) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
      return { ok: false, reason: "transaction is not a 32-byte EVM hash" };
    }
    // Verbatim, as the other doors keep it: artifact recovery is keyed
    // on the exact string, and a normalised copy would not find itself.
    return { ok: true, transaction: tx };
  }
  return { ok: false, reason: `no receipt check for rail ${terms.network}` };
}

/** The two authoritative records, read by the identity that names them. */
async function readTruth(
  env: Env,
  identity: string,
): Promise<{ purchase: PurchaseIntent | undefined; submission: SettlementSubmission | undefined }> {
  const purchases = purchaseIntentStore(env, identity);
  const saved = await purchases.existingPurchase();
  const raw = await purchases.readSettlementSubmission();
  return {
    purchase: saved ? (JSON.parse(saved) as PurchaseIntent) : undefined,
    submission: raw ? (JSON.parse(raw) as SettlementSubmission) : undefined,
  };
}

/**
 * THE WINNER'S ONE CALL. Asks the producer once and writes the answer
 * in the authoritative order. Then converges.
 *
 * THE DURABLE ROW AUTHORIZES PRODUCTION, NOT THE OBJECT IN HAND. The
 * `claim` argument is the convenience the winner already holds; what
 * is checked is the submission row re-read from the purchase Durable
 * Object: it must exist, name this purchase, name the request that
 * took ownership, and carry no outcome. Only then is the producer
 * called. A `{ won: true }` built or reused by some later caller
 * therefore buys nothing — the atomic claim cannot be bypassed by
 * asserting it.
 *
 * TRUTH IS READ BEFORE THE PRODUCER IS ASKED. If the purchase record
 * or the submission row already carries an answer — this execution
 * is a re-run, or a delayed one, or something authoritative got here
 * first — the producer is not called. Producing twice is submitting
 * twice, and that is the one thing the whole claim exists to prevent.
 */
export async function settleClaimedSubmission(
  env: Env,
  input: { checkoutId: string; claim: WonClaim; produce: SettlementProducer },
): Promise<SettlementConvergence> {
  const checkout = await ucpCheckoutStore(env, input.checkoutId).readUcpCheckout();
  if (!checkout?.completion) {
    throw new Error("No admitted payment behind this checkout; nothing to settle.");
  }
  const identity = checkout.completion.payment_identity;
  if (input.claim.submission.purchase_id !== identity) {
    throw new Error("This claim does not belong to this checkout's completion.");
  }
  if (!checkout.quote) throw new Error("A completion cannot exist without a quote.");
  const { purchase, submission } = await readTruth(env, identity);
  if (!purchase) throw new Error("No purchase record behind this completion; nothing to settle.");

  // The durable claim, or nothing. Checked against the purchase record
  // — the same record claimSettlementSubmission checked it against.
  if (!submission) throw new SettlementClaimNotHeld("no_claim");
  if (submission.purchase_id !== identity) throw new SettlementClaimNotHeld("wrong_purchase");
  if (purchase.request_digest !== undefined && submission.request_digest !== purchase.request_digest) {
    throw new SettlementClaimNotHeld("wrong_request");
  }
  if (input.claim.submission.request_digest !== submission.request_digest) {
    throw new SettlementClaimNotHeld("wrong_request");
  }

  const alreadyAnswered =
    submission.outcome !== undefined ||
    purchase.state !== "unknown" ||
    purchase.reconciliation_reference !== undefined;
  if (alreadyAnswered) return convergeKnown(env, checkout.id, identity);

  let result: SettlementResult;
  try {
    result = await input.produce(input.claim.submission);
  } catch (error) {
    /**
     * A producer that threw is a facilitator that hung or died: the
     * money may have moved. Same class as a timeout on the other
     * doors (payment-gate.ts, `threw:`), same bucket here.
     */
    result = { kind: "unknown", reason: `threw:${String(error).slice(0, 200)}` };
  }

  const terms = checkout.quote.terms;
  const path = `/ucp/v1/checkout-sessions/${checkout.id}`;
  const purchases = purchaseIntentStore(env, identity);
  const store = ucpCheckoutStore(env, checkout.id);

  try {
    if (result.kind === "declined") {
      // Definitive non-payment, durable first; only then may anything
      // it holds be released (the purchase DO releases the idempotency
      // key and labor capacity behind this same write).
      await purchases.updatePurchase({ state: "not_settled" });
      await purchases.resolveSettlementSubmission("declined");
      await store.declineUcpCheckout();
      return convergeKnown(env, checkout.id, identity);
    }

    let unknownReason: string | undefined;
    if (result.kind === "unknown") {
      unknownReason = `settle:${result.reason}`;
    } else {
      const receipt = checkedReceipt(result, terms);
      if (!receipt.ok) {
        // A nominal success with an unusable receipt is not a success
        // and not a decline. It is the unknown bucket, with its name.
        unknownReason = `${INVALID_SETTLEMENT_RECEIPT_CODE}:${receipt.reason}`;
      } else {
        const item = getMenuItem(checkout.lines[0]?.item_id ?? "");
        const paidUsdc = atomicToUsdc(terms.amount_atomic);
        const payment: SettledPayment = {
          paidUsdc,
          tipUsdc: tipFromPaid(paidUsdc, item?.price_usdc ?? paidUsdc),
          payer: purchase.payer,
          transaction: receipt.transaction,
          network: terms.network,
          settleHeaders: {},
        };
        await purchases.updatePurchase({ state: "settled", payment });
        await purchases.resolveSettlementSubmission("confirmed");
        // The checkout stays complete_in_progress. `completed` is the
        // Order's to write, in one transaction with the order itself.
        return convergeKnown(env, checkout.id, identity);
      }
    }

    // UNKNOWN. The reference is minted first so both records can carry
    // the same one; the purchase keeps state unknown and gains only
    // the reference — its own reconciliation owns the answer from here.
    const reference = await recordSettlementUnknown(env, {
      purchaseId: identity,
      path,
      door: "ucp",
      reason: unknownReason!,
      network: terms.network,
      quotedUsdc: atomicToUsdc(terms.amount_atomic),
    });
    if (reference) await purchases.updatePurchase({ reconciliation_reference: reference });
    await purchases.resolveSettlementSubmission("unknown", reference ?? undefined);
    // The checkout stays complete_in_progress and keeps its binding:
    // moving it would be claiming to know what nobody does.
    return convergeKnown(env, checkout.id, identity);
  } catch (error) {
    throw new SettlementResolutionFailed(error);
  }
}

/**
 * NEVER PRODUCES. Reads the three records and rewrites whichever of
 * the non-authoritative ones disagree with the authoritative ones.
 * Safe to call any number of times from anywhere: a retry, a status
 * read, an identical Complete finding its binding.
 */
export async function convergeSettlementRecords(
  env: Env,
  input: { checkoutId: string },
): Promise<SettlementConvergence> {
  const checkout = await ucpCheckoutStore(env, input.checkoutId).readUcpCheckout();
  if (!checkout?.completion) {
    // No binding, no money question. A declined payment's binding is
    // released on purpose; the purchase it named is reachable through
    // its own status, not through a checkout it no longer belongs to.
    return { money: "unrecorded", checkout_status: checkout?.status, repaired: [] };
  }
  return convergeKnown(env, checkout.id, checkout.completion.payment_identity);
}

/**
 * The pass itself, for a purchase identity already resolved. The
 * identity is carried rather than re-derived so the report after a
 * decline still names the money — the decline released the binding
 * this identity was found under.
 *
 * CHECKOUT REPAIRS APPLY ONLY WHILE THE CHECKOUT STILL BINDS THIS
 * IDENTITY. After a decline a different credential may have bound;
 * a late pass for the declined one must not reopen, promise, or
 * release anything on the newcomer's behalf.
 */
async function convergeKnown(
  env: Env,
  checkoutId: string,
  identity: string,
): Promise<SettlementConvergence> {
  const store = ucpCheckoutStore(env, checkoutId);
  const purchases = purchaseIntentStore(env, identity);
  const checkout = await store.readUcpCheckout();
  const { purchase, submission } = await readTruth(env, identity);
  if (!checkout || !purchase) {
    return { money: "unrecorded", checkout_status: checkout?.status, repaired: [] };
  }
  const repaired: string[] = [];

  const stillBound = checkout.completion?.payment_identity === identity;
  const bindingWithoutPromise = stillBound && checkout.status === "ready_for_complete";

  switch (purchase.state) {
    case "settled": {
      if (submission && !submission.outcome) {
        await purchases.resolveSettlementSubmission("confirmed");
        repaired.push("submission:confirmed");
      }
      if (bindingWithoutPromise) {
        await store.enterUcpSettlement({ payment_identity: identity });
        repaired.push("checkout:complete_in_progress");
      }
      break;
    }
    case "not_settled": {
      if (submission && !submission.outcome) {
        await purchases.resolveSettlementSubmission("declined");
        repaired.push("submission:declined");
      }
      if (stillBound && (checkout.status === "complete_in_progress" || bindingWithoutPromise)) {
        await store.declineUcpCheckout();
        repaired.push("checkout:reopened");
      }
      break;
    }
    case "unknown": {
      if (submission?.outcome === "unknown") {
        if (submission.reconciliation_reference && !purchase.reconciliation_reference) {
          await purchases.updatePurchase({ reconciliation_reference: submission.reconciliation_reference });
          repaired.push("purchase:reconciliation_reference");
        }
        if (bindingWithoutPromise) {
          await store.enterUcpSettlement({ payment_identity: identity });
          repaired.push("checkout:complete_in_progress");
        }
      } else if (submission && !submission.outcome && purchase.reconciliation_reference) {
        // The unknown outcome reached the purchase record and died
        // before reaching the row. Same answer, same reference.
        await purchases.resolveSettlementSubmission("unknown", purchase.reconciliation_reference);
        repaired.push("submission:unknown");
        if (bindingWithoutPromise) {
          await store.enterUcpSettlement({ payment_identity: identity });
          repaired.push("checkout:complete_in_progress");
        }
      }
      /**
       * Every other combination — no outcome anywhere, or a row that
       * says confirmed or declined while the purchase says unknown —
       * converges to NOTHING. The money is unknown because the
       * purchase says so; the row is left as it is because it is
       * authoritative for its own question; the checkout stays where
       * it is because moving it would be inferring payment truth from
       * the wrong record. Reconciliation is the writer for this.
       */
      break;
    }
  }

  const after = await readTruth(env, identity);
  const shown = await store.readUcpCheckout();
  return {
    money: after.purchase?.state ?? "unrecorded",
    ...(after.submission ? { submission: after.submission } : {}),
    checkout_status: shown?.status,
    repaired,
  };
}
