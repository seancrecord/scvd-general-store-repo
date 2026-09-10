import { idempotentPurchaseStore } from "@/lib/idempotency";
import { extractPaymentNonce, getSpentNonce } from "@/lib/replay-guard";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { readHumanResolution, humanResolutionBody, type HumanResolutionRecord } from "@/services/human-resolution-record";
import { isRecord, type Env } from "@/types";

/** Called after payment verification, before any cached delivery can hide a refund. */
export async function resolvedHumanPayment(env: Env, path: string, network: string, payer: string | undefined, payload: unknown,
  idempotency?: { surface: string; key: string }) {
  if (!payer) return null;
  const identity = await purchaseIdentity(network, payer, payload);
  const raw = await purchaseIntentStore(env, identity.id).existingPurchase();
  const purchase = raw ? JSON.parse(raw) as PurchaseIntent : null;
  // A fresh authorization can own the original purchase through its key.
  // Resolve that purchase before the response cache can conceal a refund.
  if (idempotency) {
    const slot = await idempotentPurchaseStore(env, idempotency.surface, identity.payer, idempotency.key);
    const owner = await slot.readIdempotentPurchase();
    if (owner) {
      const saved = owner === identity.id ? raw : await purchaseIntentStore(env, owner).existingPurchase();
      if (saved) {
        const original = JSON.parse(saved) as PurchaseIntent;
        const sameFamily = original.terms.network === network ||
          (original.terms.network.startsWith("eip155:") && network.startsWith("eip155:"));
        if (original.id !== owner || original.path !== path || original.payer !== identity.payer || !sameFamily) {
          throw new Error("Original purchase owner mismatch");
        }
        const resolution = await recordedHumanResolution(env, original);
        if (resolution) return resolution;
      }
    }
  }
  let transaction = purchase?.path === path && purchase.payer === identity.payer && purchase.terms.network === network
    ? purchase.payment?.transaction : undefined;
  if (!transaction) {
    const nonce = extractPaymentNonce(payload);
    const spent = nonce ? await getSpentNonce(env, nonce) : null;
    if (spent?.path === path) transaction = spent.transaction;
    if (!nonce && network.startsWith("solana:") && isRecord(payload) && isRecord(payload.payload) && typeof payload.payload.transaction === "string") {
      transaction = (await solanaPaymentEvidence(payload.payload.transaction)).transaction ?? undefined;
    }
  }
  return transaction ? readHumanResolution(env, { path, transaction, network, payer }) : null;
}
export function resolvedHumanDelivery(record: HumanResolutionRecord): Record<string, unknown> | null {
  const work = record.statement.evidence.fulfillment;
  if (record.statement.outcome !== "fulfilled_by_hand" || !isRecord(work)) return null;
  return { ...work, resolution: humanResolutionBody(record).resolution };
}
export async function recordedHumanResolution(env: Env, record: PurchaseIntent) {
  return record.payment?.transaction
    ? readHumanResolution(env, { path: record.path, transaction: record.payment.transaction,
      network: record.terms.network, payer: record.payer }) : null;
}
