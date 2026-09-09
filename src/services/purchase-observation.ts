import type { SignedMandate } from "@/services/mandates";
import type { PreparedPatronAnchor } from "@/services/patron-anchors";
import type { SignedPassportRefresh } from "@/services/passport-refresh";
import type { SignedTrustProfile } from "@/services/trust-profile";
import type { HostedPurchase } from "@/services/hosted-observation";
import type { SignedWalletStatement } from "@/services/wallet-statement";
import type { SignedReconciliation } from "@/services/settlement-reconciliation";
import type { SignedSpotCheck } from "@/services/spot-check";
import type { SignedProvenanceCheck } from "@/services/provenance-check";
import type { PreparedA2AKit } from "@/services/a2a-kit";
import type { SignedServiceAudit } from "@/services/service-audit";
import type { SignedGoodBuyerReading } from "@/services/good-buyer";
import type { SignedSignatureAgentCard } from "@/services/bot-auth-card";
import type { SignedOnpageAudit } from "@/services/onpage-audit";
import type { SignedAttestation } from "@/services/attestation";
import type { Env, MenuItem } from "@/types";
import { purchaseIdentity, purchaseIntentStore, purchaseRecovery, purchaseStatus, type PurchaseIntent } from "@/services/purchase-intent";
import { supportsObservationRecovery } from "@/lib/artifact-checkpoint";
import { SettlementDeclined } from "@/lib/payments";

export interface PreparedObservation {
  mandate?: SignedMandate;
  patronAnchor?: PreparedPatronAnchor;
  passportRefresh?: SignedPassportRefresh;
  trustProfile?: SignedTrustProfile;
  attestation?: SignedAttestation;
  bundle?: SignedAttestation[];
  serviceAudit?: SignedServiceAudit;
  goodBuyer?: SignedGoodBuyerReading;
  signatureAgentCard?: SignedSignatureAgentCard;
  onpageAudit?: SignedOnpageAudit;
  a2aKit?: PreparedA2AKit;
  spotCheck?: SignedSpotCheck;
  provenanceCheck?: SignedProvenanceCheck;
  walletStatement?: SignedWalletStatement;
  reconciliation?: SignedReconciliation;
  attests: string;
}
export interface ObservationCheckpoint {
  purchase?: HostedPurchase;
  unavailable?(error: unknown): Promise<never>;
  read(): Promise<PreparedObservation | null>;
  save(value: PreparedObservation): Promise<PreparedObservation>;
}

// The verified authorization identifies this journal before a transaction exists.
// It lives beside the purchase intent, so its alarm can retrieve the same bytes
// even when the settlement acknowledgement or transaction checkpoint was lost.
export function observationCheckpoint(env: Env, id: string, path: string, digest: string, readOnly = false): ObservationCheckpoint {
  const unavailable = async (error: unknown): Promise<never> => {
    if (readOnly) throw error; // The caller already carries the confirmed payment.
    let existing: PurchaseIntent | null | undefined;
    try {
      const record = await purchaseIntentStore(env, id).existingPurchase();
      existing = record ? JSON.parse(record) as PurchaseIntent : null;
    } catch { /* An unreadable purchase is unknown, never proof of no charge. */ }
    throw new SettlementDeclined(Response.json({ code: "observation_storage_unavailable",
      charged: existing ? existing.state === "settled" ? true : existing.state === "not_settled" ? false : null : existing === null ? false : null,
      ...(existing ? { ...purchaseStatus(existing), recovery: purchaseRecovery(env, existing) } : {}),
      settlement_attempted: false, error: "The original observation is unavailable. This request submitted no payment. Keep the same request and payment; check the retained purchase status when available." }, { status: 503 }));
  };
  const access = async (proposal?: PreparedObservation) => {
    try {
      const record = await purchaseIntentStore(env, id).existingPurchase();
      const existing = record ? JSON.parse(record) as PurchaseIntent : null;
      const value = await purchaseIntentStore(env, id).retainObservation(path, digest,
        proposal === undefined ? undefined : JSON.stringify(proposal));
      if (value === null && (readOnly || existing || proposal !== undefined)) throw new Error("Original observation unavailable");
      return value === null ? null : JSON.parse(value) as PreparedObservation;
    } catch (error) {
      return unavailable(error);
    }
  };
  return { purchase: { id, digest }, unavailable, read: () => access(), save: async value => {
    if (readOnly) throw new Error("A paid recovery cannot replace its observation");
    return (await access(value))!;
  } };
}

export async function verifiedObservationCheckpoint(env: Env, item: MenuItem | undefined,
  network: string, payer: string | undefined, payload: unknown, path: string, digest: string, readOnly = false,
): Promise<ObservationCheckpoint | undefined> {
  if (!supportsObservationRecovery(item)) return undefined;
  if (!payer) throw new Error("Observation requires a verified payer");
  const { id } = await purchaseIdentity(network, payer, payload);
  return observationCheckpoint(env, id, path, digest, readOnly);
}
