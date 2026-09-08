import { canonicalAddress } from "@/lib/addresses";
import { isExactHouseWallet } from "@/lib/channel";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import { evmCheckoutPayTo, solanaPayTo, SOLANA_NETWORK } from "@/lib/payment-networks";
import { isSolanaSignature } from "@/lib/solana-rpc";
import { evmChainOf } from "@/lib/base-rpc";
import { getMenuItem } from "@/store";
import { recoverLegacyHumanOrder } from "@/services/legacy-human-order";
import { resolutionTransfer } from "@/services/resolution-transfer";
import { humanResolutionKey, loadHumanResolution, saveHumanResolution, type HumanResolutionRecord, type HumanResolutionOutcome } from "@/services/human-resolution-record";
import type { DeliveryIntent } from "@/services/delivery-audit";
import type { Env } from "@/types";

export interface HumanResolutionInput { network?: string; order_id?: string; refund_tx?: string; refund_payer?: string }
export async function resolveHumanDelivery(env: Env, transaction: string, outcome: HumanResolutionOutcome,
  intent: DeliveryIntent, input: HumanResolutionInput = {}, legacyResolution?: unknown,
  now: Date = new Date()): Promise<{ ok: true; resolution: HumanResolutionRecord } | { ok: false; refusal: string }> {
  const refused = (refusal: string) => ({ ok: false as const, refusal });
  if (!input.network || !intent.payer || intent.transaction !== transaction ||
    !Number.isFinite(intent.paid_usdc) || intent.paid_usdc <= 0 || !Number.isFinite(Date.parse(intent.settled_at))) {
    return refused("A human resolution needs the original payment identity, amount, and network. Keep the obligation open while those records are recovered.");
  }
  const item = getMenuItem(intent.path.replace(/^\/api\/buy\//, ""));
  if (!item || item.fulfillment !== "human_queue") return refused("The original human product is unavailable.");
  const network = input.network;
  if (network === SOLANA_NETWORK ? !isSolanaSignature(transaction)
    : !evmChainOf(network) || !/^0x[0-9a-f]{64}$/i.test(transaction)) {
    return refused("Use the original payment network and transaction identifier from the receipt.");
  }
  try {
    const prior = await loadHumanResolution(env, network, transaction);
    if (prior && (prior.statement.path !== intent.path || canonicalAddress(prior.statement.payer) !== canonicalAddress(intent.payer))) {
      return refused("The retained resolution belongs to another purchase.");
    }
    const requestDigest = await sha256Hex(jcsCanonicalize({ transaction, outcome, ...input }));
    if (prior?.request_digest === requestDigest) {
      // Repeat the publication and delete as well: the first response may have
      // been lost after durable commit but before the KV projection finished.
      const saved = await saveHumanResolution(env, prior, prior.statement.revision - 1);
      return saved.ok && saved.record ? { ok: true, resolution: saved.record } : refused(saved.refusal ?? "Resolution publication remains incomplete.");
    }
    let evidence: Record<string, unknown>;
    if (outcome === "fulfilled_by_hand") {
      if (!input.order_id) return refused("Fulfillment needs the completed original order ID; a preview or certificate alone is not the work.");
      const work = await recoverLegacyHumanOrder(env, item, { path: intent.path, transaction, network, payer: intent.payer }, intent);
      if (!work || work.order_id !== input.order_id || work.status !== "completed") return refused("That completed order cannot be authenticated as the original paid work.");
      evidence = { kind: "completed_order", order_id: input.order_id, fulfillment: work };
    } else if (outcome === "refunded") {
      if (!input.refund_tx || humanResolutionKey(network, input.refund_tx) === humanResolutionKey(network, transaction)) {
        return refused("A refund needs its own transaction ID; the original payment is not a refund.");
      }
      const paid = await resolutionTransfer(env, network, transaction, intent.payer, undefined, intent.paid_usdc);
      const chain = evmChainOf(network);
      const checkoutRecipient = chain ? evmCheckoutPayTo(env, chain.key) : network === SOLANA_NETWORK ? solanaPayTo(env) : null;
      if ((!checkoutRecipient || canonicalAddress(checkoutRecipient) !== canonicalAddress(paid.recipient)) && !isExactHouseWallet(env, paid.recipient)) {
        return refused("The original transfer does not identify a retained store receiving wallet.");
      }
      const refundPayer = input.refund_payer ?? paid.recipient;
      if (canonicalAddress(refundPayer) !== canonicalAddress(paid.recipient) && !isExactHouseWallet(env, refundPayer)) {
        return refused("The refund sender must be the original receiving wallet or a recorded house wallet.");
      }
      const refund = await resolutionTransfer(env, network, input.refund_tx, refundPayer, intent.payer, intent.paid_usdc);
      if (refund.block < paid.block) return refused("The refund predates the purchase.");
      evidence = { kind: "refund", refund_tx: input.refund_tx, original_payment: paid, refund,
        observed_at: now.toISOString(), scope: "The network RPC reported finalized native USDC transfers. This is this store's own resolution record, not an independent attestation. No refund was sent by this request." };
    } else {
      if (!isExactHouseWallet(env, intent.payer)) return refused("A buyer's payment cannot be absorbed as house money. Complete the original work or record its refund.");
      evidence = { kind: "house_payment", payer: intent.payer, basis: "Exact address in the recorded house-wallet register at resolution time." };
    }
    const statement: HumanResolutionRecord["statement"] = { version: 1, revision: (prior?.statement.revision ?? 0) + 1,
      path: intent.path, transaction, network, payer: intent.payer, paid_usdc: intent.paid_usdc, outcome,
      recorded_at: now.toISOString(), evidence, ...(prior ? { previous_signature: prior.signature } : {}) };
    const signed_payload = jcsCanonicalize(statement);
    const signed = await signMessage(signed_payload, env.SIGNING_KEY);
    const proposal: HumanResolutionRecord = { statement, signed_payload, signature: signed.signature, public_key: signed.publicKey,
      request_digest: requestDigest, intent, ...(legacyResolution && !prior ? { legacy_resolution: legacyResolution } : {}) };
    const saved = await saveHumanResolution(env, proposal, prior?.statement.revision ?? 0);
    return saved.ok && saved.record ? { ok: true, resolution: saved.record } : refused(saved.refusal ?? "Resolution not recorded.");
  } catch {
    return refused("Resolution evidence or storage is unavailable. Nothing was paid by this request. Keep the obligation open and retry with the same evidence.");
  }
}
