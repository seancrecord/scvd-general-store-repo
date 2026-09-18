import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { encodeBase64Json } from "@/lib/base64-json";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { extractPaymentNonce } from "@/lib/replay-guard";
import {
  getPaymentStack,
  isTransientSettleFailure,
  processSettlementWithRetry,
  rescueAmbiguousSettle,
  InvalidSettlementReceipt,
  INVALID_SETTLEMENT_RECEIPT_CODE,
  type PaymentStack,
} from "@/lib/payments";
import {
  createUcpX402Adapter,
  UcpSettlementEvidenceUnavailable,
} from "@/lib/ucp/checkout/adapter";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import type {
  SettlementProducer,
  SettlementResult,
} from "@/services/ucp-settlement-resolution";
import type { Env } from "@/types";

/**
 * THE REAL PRODUCER: the store's settlement machinery, normalised to
 * the three results the resolver already knows how to make durable.
 *
 *     declined | unknown | success
 *
 * This file decides nothing about outcomes. Every rule below is the
 * same one the HTTP gate and the MCP till already apply, in the same
 * order, from the same functions:
 *
 *   processSettlementWithRetry  owns the attempt and its one bounded
 *                               retry on the transport-dead shape;
 *   rescueAmbiguousSettle       owns asking the chain when the retry
 *                               also died — ON BASE ONLY, because the
 *                               question it asks is Base's EIP-3009
 *                               AuthorizationUsed event. No other rail
 *                               has a rescue; a dead transport there is
 *                               unknown, and its own reconciler (where
 *                               one exists) is the authority;
 *   the adapter's settle()      refuses a success whose evidence does
 *                               not match the frozen terms;
 *   the resolver's checkedReceipt re-checks the receipt independently
 *                               before anything is written as settled.
 *
 * What the normalisation adds is only the mapping onto three words:
 *
 *   thrown, timed out, receipt unusable, transport-dead with no
 *   chain answer, or a failure that NAMES a transaction
 *                                              -> unknown
 *   a facilitator that answered no, named nothing, and was not
 *   transport-dead                             -> declined
 *   a success with evidence, or a rescue that found the money
 *                                              -> success
 *
 * `unknown` is the safe direction and the default: it keeps the
 * submission claim occupied and hands the question to reconciliation,
 * which is the same desk every other door hands it to.
 *
 * NO UCP RETRY POLICY. There is one attempt at this function per
 * claim, taken by the execution that won the claim, and inside it the
 * retry belongs to processSettlementWithRetry. Calling this twice for
 * one payment is not something a caller can arrange: the resolver
 * asks only under a durable unresolved claim.
 *
 * THE CREDENTIAL IS IN MEMORY ONLY. It is closed over here for the
 * duration of the request that carried it, bound to the terms the
 * purchase was admitted against, and never written anywhere. That is
 * the whole reason settlement can only happen in the request that
 * presented the payment, and why the checkout does not promise
 * `complete_in_progress` before this point.
 */
export function realSettlementProducer(
  env: Env,
  input: {
    /** The x402 credential the Complete request carried. Never retained. */
    credential: unknown;
    /** The payment stack to settle through; the store's own by default. */
    stack?: PaymentStack;
  },
): SettlementProducer {
  return async (submission): Promise<SettlementResult> => {
    /**
     * The terms come from the ADMITTED purchase record, not from the
     * request: what is settled is exactly what ownership was granted
     * for. The resolver checks the same thing again against the
     * checkout's frozen quote.
     */
    const saved = await purchaseIntentStore(env, submission.purchase_id).existingPurchase();
    if (!saved) throw new Error("No admitted purchase behind this claim; nothing to settle.");
    const purchase = JSON.parse(saved) as PurchaseIntent;

    let payload: PaymentPayload;
    let adapter: ReturnType<typeof createUcpX402Adapter>;
    try {
      adapter = createUcpX402Adapter({ requirements: purchase.terms });
      payload = adapter.bind(input.credential);
    } catch (error) {
      /**
       * Refused before anything left the building: the credential does
       * not bind to the admitted terms. Nothing was submitted, so no
       * money moved — which is definitive non-payment, not an open
       * question. Declined reopens the checkout for a credential that
       * does bind. (Unreachable from the Complete request that just
       * had this same credential admitted; kept honest for any other.)
       */
      return {
        kind: "declined",
        reason: `not_submitted:${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
      };
    }

    const stack = input.stack ?? getPaymentStack(env);
    await stack.initialized;

    let settlement: SettleResponse;
    try {
      settlement = await adapter.settle(
        payload,
        (bound, requirements) => processSettlementWithRetry(stack.httpServer, bound, requirements),
        purchase.payer,
      );
    } catch (error) {
      if (
        error instanceof UcpSettlementEvidenceUnavailable ||
        error instanceof InvalidSettlementReceipt
      ) {
        // A nominal success this store cannot use. Not a payment, not a
        // non-payment: the unknown bucket, under its own name.
        return {
          kind: "unknown",
          reason: `${INVALID_SETTLEMENT_RECEIPT_CODE}:${error.message}`.slice(0, 300),
        };
      }
      // No verdict at all — the call died. Same class as a timeout on
      // the other doors, same bucket.
      return { kind: "unknown", reason: `threw:${String(error).slice(0, 200)}` };
    }

    // As presented on the wire, for the spent-nonce row (null on Solana).
    const nonce = extractPaymentNonce(payload) ?? undefined;

    if (settlement.success) {
      return {
        kind: "success",
        transaction: settlement.transaction,
        network: settlement.network,
        payer: settlement.payer,
        ...(nonce ? { nonce } : {}),
      };
    }

    /**
     * The facilitator said no. Whether that is a verdict or a dead
     * transport is the rescue's question, asked exactly as the other
     * doors ask it: on the transport-dead shape, or on a failure that
     * names a transaction (the lost-response duplicate) — and asked
     * of Base alone. The rescue reads Base's AuthorizationUsed log;
     * Polygon, Arbitrum, World and Solana have no such reader here,
     * so on those rails the same shapes fall straight through to
     * unknown, where each rail's own reconciliation is the authority.
     * Gated at this call site rather than trusted to the rescue's own
     * guard, so the rule is visible where the money is.
     */
    const rescued =
      purchase.terms.network === BASE_NETWORK
        ? await rescueAmbiguousSettle(env, {
            errorReason: settlement.errorReason,
            paymentHeader: encodeBase64Json(payload),
            network: purchase.terms.network,
            ...(settlement.transaction ? { failureTransaction: settlement.transaction } : {}),
          })
        : null;
    if (rescued) {
      return {
        kind: "success",
        transaction: rescued.transaction,
        network: rescued.network,
        payer: rescued.payer,
        ...(nonce ? { nonce } : {}),
      };
    }
    if (isTransientSettleFailure(settlement.errorReason) || settlement.transaction) {
      // A rescue attempted and unanswered is an OPEN question, not a
      // decline — same law as the HTTP gate and the MCP till.
      return { kind: "unknown", reason: `settle:${settlement.errorReason ?? "no verdict"}`.slice(0, 300) };
    }
    return {
      kind: "declined",
      reason: settlement.errorReason ?? "declined",
      ...(settlement.errorMessage ? { message: settlement.errorMessage } : {}),
    };
  };
}
