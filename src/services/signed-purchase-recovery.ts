import { humanOrderEvidence } from "@/services/human-order-proof";
import { commissionPurchaseResponse } from "@/lib/commission-purchase-response";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { paymentRecoverySigners } from "@/lib/payment-recovery-signature";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { legacyRecoveryFailure } from "@/lib/delivery-failed";
import { getMenuItem } from "@/store";
import { COMMISSION_ITEM_ID } from "@/store/commission-desk";
import { itemKeyFromPath } from "@/lib/metrics";
import type { SettledPayment } from "@/lib/payments";
import { isRecord, type Env } from "@/types";
import { purchaseIdentity, purchaseIntentStore, purchaseRecovery, purchaseStatus, lookupRecordedPurchase, paymentRecoveryFingerprint, type PurchaseIntent } from "@/services/purchase-intent";
import { legacyPaidAttempt } from "@/services/legacy-paid-attempt";
import { getOpenDeliveryIntent } from "@/services/delivery-audit";
import { resolvedHumanPayment, resolvedHumanDelivery } from "@/services/resolved-human-purchase";
import { humanResolutionBody } from "@/services/human-resolution-record";
import { recoverLegacyHumanOrder } from "@/services/legacy-human-order";
import { getOrder } from "@/services/orders";

export type SignedPurchaseRecovery =
  | { kind: "complete"; delivery: Record<string, unknown>; payment: SettledPayment; recovery?: Record<string, unknown> }
  | { kind: "status"; body: Record<string, unknown> & { error: string } };

/** A refused/expired authorization may still authenticate a retained purchase.
 * This reader never calls fulfillment, reconciliation or settlement. Missing
 * bytes remain owed; neither retry inputs nor today's evidence can replace them.
 */
export async function recoverSignedPurchase(env: Env, wire: unknown,
  request: { path: string; door: "http" | "mcp"; digest: string | undefined },
): Promise<SignedPurchaseRecovery | null> {
  let proof = await paymentRecoverySigners(wire);
  // EIP-1271 and other facilitator-supported signatures may require chain
  // execution to verify again. An exact payment accepted earlier can instead
  // match its retained one-way fingerprint. The asserted address only locates
  // a candidate; no purchase fact is returned until this comparison succeeds.
  if (!proof && isRecord(wire) && wire.x402Version === 2 && isRecord(wire.accepted) && wire.accepted.scheme === "exact" &&
    typeof wire.accepted.network === "string" && /^eip155:[0-9]+$/.test(wire.accepted.network) &&
    isRecord(wire.payload) && isRecord(wire.payload.authorization) && typeof wire.payload.authorization.from === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(wire.payload.authorization.from)) {
    try {
      const network = wire.accepted.network, payer = wire.payload.authorization.from.toLowerCase();
      const identity = await purchaseIdentity(network, payer, wire);
      const raw = await purchaseIntentStore(env, identity.id).existingPurchase();
      const record = raw ? JSON.parse(raw) as PurchaseIntent : null;
      if (record?.id === identity.id && record.payer === payer && record.terms.network === network &&
        typeof record.payment_proof === "string" && /^[a-f0-9]{64}$/.test(record.payment_proof)) {
        const encoder = new TextEncoder(), fingerprint = await paymentRecoveryFingerprint(wire);
        if (crypto.subtle.timingSafeEqual(encoder.encode(record.payment_proof), encoder.encode(fingerprint))) proof = { network, payers: [payer] };
      }
    } catch {
      // A candidate lookup is not authentication. Fall back to the original
      // verifier refusal without disclosing whether that candidate exists.
    }
  }
  if (!proof) return null;
  let known: PurchaseIntent | undefined;
  let sawSpentPayment = false;
  let mismatchedRequest = false;
  const status = (body: Record<string, unknown> & { error: string }): SignedPurchaseRecovery => ({ kind: "status", body });
  try {
    for (const payer of proof.payers) {
      const identity = await purchaseIdentity(proof.network, payer, wire);
      const raw = await purchaseIntentStore(env, identity.id).existingPurchase();
      if (!raw) continue;
      const record = JSON.parse(raw) as PurchaseIntent;
      if (record.id !== identity.id || record.payer !== identity.payer || record.terms.network !== proof.network) {
        throw new Error("Retained purchase owner mismatch");
      }
      known = record;
      const digest = record.door === "mcp" ? await sha256Hex(jcsCanonicalize(JSON.parse(record.request)))
        : await httpArtifactDigest(`${env.STORE_BASE_URL}${record.path}?${record.request}`);
      mismatchedRequest = record.path !== request.path || record.door !== request.door || digest !== request.digest;
      break;
    }
    const candidates = known ? [known.payer] : proof.payers;
    for (const payer of candidates) {
      const resolution = await resolvedHumanPayment(env, request.path, proof.network, payer, wire);
      if (resolution) {
        const delivery = resolvedHumanDelivery(resolution);
        if (!delivery) return status(humanResolutionBody(resolution));
        const s = resolution.statement;
        return { kind: "complete", delivery, payment: { payer, network: s.network, transaction: s.transaction,
          paidUsdc: s.paid_usdc, tipUsdc: Number(delivery.tip_usdc ?? 0), settleHeaders: {} } };
      }
      if (known && mismatchedRequest) return status({ code: "purchase_input_mismatch", charged: purchaseStatus(known).charged,
        charged_again: false, settlement_attempted: false, recovery: purchaseRecovery(env, known),
        error: "This signed payment belongs to a different original request. Read its private status or retry the original product and inputs; no new payment was submitted." });
      if (known?.state === "settled") {
        const recorded = await lookupRecordedPurchase(env, proof.network, payer, wire, request);
        if (recorded?.kind === "complete") return recorded;
      }
      const spent = await legacyPaidAttempt(env, proof.network, wire);
      sawSpentPayment ||= !!spent;
      const solanaTransaction = proof.network.startsWith("solana:") && isRecord(wire) && isRecord(wire.payload) && typeof wire.payload.transaction === "string"
        ? (await solanaPaymentEvidence(wire.payload.transaction)).transaction : undefined;
      const transaction = known?.payment?.transaction ?? (spent?.path === request.path ? spent.transaction : undefined) ?? solanaTransaction;
      if (transaction) {
        const ns = env.PAID_RECOVERIES;
        if (!ns) throw new Error("Retained purchase unavailable");
        const stub = ns.get(ns.idFromName(`${proof.network}:${transaction}`));
        const identity = { path: request.path, payer, network: proof.network, transaction };
        const artifact = await stub.readArtifact(identity);
        const saved = artifact ? null : await stub.readCompleted(identity);
        const payment = artifact?.purchase.payment ?? saved?.payment;
        // Old completed-response readers normalized every address. Base58
        // must still match exactly before any historical bytes leave here.
        const samePayer = payment?.payer && (proof.network.startsWith("eip155:")
          ? payment.payer.toLowerCase() === payer.toLowerCase() : payment.payer === payer);
        if (payment && samePayer) {
          const digest = artifact?.digest ?? saved?.digest;
          if (!request.digest || digest !== request.digest) return status({ code: "purchase_input_mismatch",
            charged: true, charged_again: false, settlement_attempted: false,
            ...(known ? { recovery: purchaseRecovery(env, known) } : {}),
            error: "This payment bought different inputs. Retry the original request; no replacement goods or payment were created." });
          const raw = artifact ? await stub.artifactStage(artifact.digest, "response") : saved?.response;
          if (raw && (!request.path.startsWith("/api/commission/pay/") || known?.commission)) {
            const delivery: unknown = JSON.parse(raw);
            if (!isRecord(delivery)) throw new Error("Retained response unreadable");
            if (typeof delivery.order_id === "string") {
              const order = await getOrder(env, delivery.order_id);
              if (!order) throw new Error("Retained order unavailable");
              Object.assign(delivery, humanOrderEvidence(order));
              delivery.status = order.status;
              if (order.deliverable !== undefined) delivery.deliverable = order.deliverable;
            }
            return { kind: "complete", delivery: known?.commission ? commissionPurchaseResponse(env.STORE_BASE_URL, delivery, known.commission) : delivery,
              payment, ...(known ? { recovery: purchaseRecovery(env, known) } : {}) };
          }
        }
        if (!known) {
          const open = await getOpenDeliveryIntent(env, transaction);
          const item = getMenuItem(request.path.startsWith("/api/commission/pay/") ? COMMISSION_ITEM_ID : itemKeyFromPath(request.path));
          if (item?.fulfillment === "human_queue") {
            const delivery = await recoverLegacyHumanOrder(env, item, identity, open?.intent);
            if (delivery) return { kind: "complete", delivery, payment: { payer, network: proof.network, transaction,
              paidUsdc: Number(delivery.paid_usdc), tipUsdc: Number(delivery.tip_usdc), settleHeaders: {} } };
          }
          const failure = legacyRecoveryFailure(env.STORE_BASE_URL, item ?? { name: request.path }, open?.intent, identity);
          if (failure.charged === true) return status(failure);
        }
      }
      if (known) return status({ ...purchaseStatus(known), charged_again: false, settlement_attempted: false,
        code: "purchase_recovery_pending", recovery: purchaseRecovery(env, known),
        error: "The original purchase is recorded, but its goods are not currently retrievable. Keep this payment and read its private status; do not pay again to recover it." });
      if (spent && !transaction) return status(legacyRecoveryFailure(env.STORE_BASE_URL, { name: request.path }, undefined,
        { path: request.path, transaction: "", payer: undefined }));
    }
    return sawSpentPayment ? status(legacyRecoveryFailure(env.STORE_BASE_URL, { name: request.path }, undefined,
      { path: request.path, transaction: "", payer: undefined })) : null;
  } catch {
    return status({ code: "purchase_record_unavailable", charged: known ? purchaseStatus(known).charged : null,
      charged_again: false, settlement_attempted: false,
      ...(known ? { recovery: purchaseRecovery(env, known) } : {}),
      error: "The original purchase could not be read. Keep this signed payment and any original key or private status handle; do not sign another payment to recover it." });
  }
}
