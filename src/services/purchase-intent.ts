import { humanOrderEvidence } from "@/services/human-order-proof";
import { publicationDelivery, type PublicationSnapshot } from "@/lib/publication-recovery";
import type { CommissionPurchase } from "@/services/commission-purchase";
import { recordedHumanResolution, resolvedHumanDelivery } from "@/services/resolved-human-purchase";
import { humanResolutionBody } from "@/services/human-resolution-record";
import { supportsObservationRecovery, httpArtifactDigest } from "@/lib/artifact-checkpoint";
import type { PaymentRequirements } from "@x402/core/types";
import { jcsCanonicalize } from "@/lib/jcs";
import { idempotentPurchaseStore, sha256Hex } from "@/lib/idempotency";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { SettlementDeclined, SettlementUnknown, type SettledPayment } from "@/lib/payments";
import { isRecord, type Env, type MenuItem } from "@/types";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";

export const PURCHASE_RECORD_CODES = {
  unavailable: "purchase_record_unavailable",
  pending: "purchase_recovery_pending",
  refused: "purchase_not_settled",
} as const;

export interface PurchaseIntent {
  version: 1;
  id: string;
  token: string;
  path: string;
  door: "http" | "mcp";
  payer: string;
  terms: PaymentRequirements;
  /** One-way fingerprint of the verified wire payment, never executable bytes. */
  payment_proof?: string;
  /** Exact query (duplicates retained) or full MCP arguments; never payment credentials. */
  request: string;
  item?: MenuItem;
  created_at: string;
  observation_digest?: string;
  commission?: CommissionPurchase;
  publication?: PublicationSnapshot;
  authorization?: { nonce: string; valid_after: string; valid_before: string };
  solana?: { message_hash: string };
  state: "unknown" | "settled" | "not_settled";
  payment?: SettledPayment;
  reconciliation_reference?: string;
  reconciliation?: { start_block?: number; next_block?: number; before_signature?: string; checked_at: string };
  delivery?: Record<string, unknown>;

}

export function purchaseIntentStore(env: Env, id: string) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Purchase storage unavailable");
  return namespace.get(namespace.idFromName(`purchase:${id}`));
}

export async function paymentRecoveryFingerprint(payment: unknown): Promise<string> {
  return sha256Hex(jcsCanonicalize(payment));
}

export function purchaseRecovery(env: Env, record: PurchaseIntent) {
  return { purchase_recorded: true, purchase_id: record.id, status_url: `${env.STORE_BASE_URL}/api/purchase-status/${record.id}`,
    status_token: record.token, status_tool: "check_purchase",
    status_auth: "GET status_url with Authorization: Bearer <status_token>. Keep the token private. This read is free and never submits payment." };
}

export function purchaseStatus(record: PurchaseIntent) {
  const delivery = record.delivery ?? publicationDelivery(record);
  return { purchase_id: record.id, payment_state: record.state,
    charged: record.state === "unknown" ? null : record.state === "settled",
    path: record.path, door: record.door, request: record.request,
    terms: record.terms, created_at: record.created_at,
    transaction: record.payment?.transaction ?? null,
    // A saved settlement is not evidence of delivery. Artifact recovery follows
    // the existing transaction journal; this status never calls a cert a good.
    delivery_state: delivery ? (record.item?.fulfillment === "human_queue" ? "order_created" : "delivered") : "not_established_by_this_record",
    ...(delivery ? { fulfillment: delivery } : {}),
    reconciliation_reference: record.reconciliation_reference ?? null,
    retry: "Keep the original signed payment and idempotency key. Do not sign a new payment while this purchase is unresolved.",
  };
}

class RecordedPurchase extends SettlementUnknown {
  constructor(private readonly env: Env, private readonly record: PurchaseIntent) {
    super(record.terms.network);
    this.reconciliationReference = record.reconciliation_reference ?? null;
  }
  override body() {
    return { ...super.body(), ...purchaseStatus(this.record), charged_again: false, settlement_attempted: false,
      error: "This payment already has a purchase record. No new settlement was attempted. Read its status; fulfillment recovery may still be required.",
      code: this.record.state === "unknown" ? "settlement_unknown" : this.record.state === "settled" ? PURCHASE_RECORD_CODES.pending : PURCHASE_RECORD_CODES.refused,
      recovery: { reference: this.reconciliationReference, recorded: true, ...purchaseRecovery(this.env, this.record),
        retry: "Keep the original signed payment and idempotency key; do not sign a new payment while this one is unresolved." },
    };
  }
}

export async function purchaseIdentity(network: string, verifiedPayer: string, payment: unknown) {
  const payer = network.startsWith("eip155:") ? verifiedPayer.toLowerCase() : verifiedPayer;
  const nonce = extractPaymentNonce(payment);
  const payload = isRecord(payment) && isRecord(payment.payload) ? payment.payload : {};
  const raw = nonce ?? payload.transaction;
  if (typeof raw !== "string" || !raw) throw new Error("Missing payment identity");
  // Equivalent hex/base64 spellings must not open another settlement attempt.
  const identity = nonce ? nonce.toLowerCase() : btoa(atob(raw));
  return { payer, id: await sha256Hex(jcsCanonicalize({ network, payer, identity })) };
}

type RecordedPurchaseLookup =
  | { kind: "complete"; delivery: Record<string, unknown>; payment: SettledPayment; recovery: Record<string, unknown> }
  | { kind: "refused" | "pending"; body: Record<string, unknown> & { error: string } }
  | null;

/** Authenticated completed goods outlive the replay cache; never run fulfillment again. */
export async function lookupRecordedPurchase(env: Env, network: string, payer: string | undefined, payload: unknown,
  request: { path: string; door: "http" | "mcp"; digest: string | undefined },
  idempotency?: { surface: string; key: string },
): Promise<RecordedPurchaseLookup> {
  if (!payer) return null;
  let known: PurchaseIntent | undefined;
  try {
    const identity = await purchaseIdentity(network, payer, payload);
    let saved = await purchaseIntentStore(env, identity.id).existingPurchase();
    let owner = identity.id;
    if (!saved && idempotency) {
      const slot = await idempotentPurchaseStore(env, idempotency.surface, identity.payer, idempotency.key);
      const claimed = await slot.readIdempotentPurchase();
      if (claimed) {
        owner = claimed;
        saved = await purchaseIntentStore(env, owner).existingPurchase();
        if (!saved && owner !== identity.id) throw new Error("Original purchase admission pending");
      }
    }
    if (!saved) return null;
    const record = JSON.parse(saved) as PurchaseIntent;
    // EVM wallets share the existing key scope across EVM rails. A Solana
    // address is case-sensitive and never authenticated by an EVM signature.
    const sameNetworkFamily = record.terms.network === network ||
      (owner !== identity.id && record.terms.network.startsWith("eip155:") && network.startsWith("eip155:"));
    if (record.id !== owner || record.payer !== identity.payer || !sameNetworkFamily) {
      throw new Error("Purchase owner mismatch");
    }
    known = record;
    if (record.state === "unknown" || (owner !== identity.id && record.state === "not_settled")) return { kind: "pending", body: new RecordedPurchase(env, record).body() };
    if (record.state === "settled" && !record.delivery && record.item?.fulfillment === "human_queue") {
      // The complete brief predates the artifact journal. If that journal could
      // not open, its alarm still owns reconstruction from these original terms.
      return { kind: "pending", body: { ...new RecordedPurchase(env, record).body(), charged_again: false } };
    }
    if (record.state !== "settled" || !(record.delivery ?? publicationDelivery(record)) || !record.payment) return null;
    const digest = record.door === "mcp"
      ? await sha256Hex(jcsCanonicalize(JSON.parse(record.request)))
      : await httpArtifactDigest(`${env.STORE_BASE_URL}${record.path}?${record.request}`);
    if (record.path !== request.path || record.door !== request.door || digest !== request.digest) {
      return { kind: "refused", body: {
        error: "This payment bought a different request. Retry the original product and inputs, or read its purchase status. No additional payment was submitted.",
        code: "purchase_input_mismatch", charged: true, charged_again: false, settlement_attempted: false,
        recovery: purchaseRecovery(env, record),
      } };
    }
    return { kind: "complete", delivery: (await purchaseDelivery(env, record))!, payment: record.payment, recovery: purchaseRecovery(env, record) };
  } catch {
    return { kind: "pending", body: {
      error: "Purchase status is unavailable. This request did not submit payment; an earlier attempt may remain unresolved.",
      code: PURCHASE_RECORD_CODES.unavailable, charged: known ? purchaseStatus(known).charged : null,
      settlement_attempted: false, payment_state: known?.state ?? "unknown",
      ...(known ? { recovery: purchaseRecovery(env, known) } : {}),
    } };
  }
}

/** Called only after verification, at the last seam before settlement. */
export async function beginPurchaseIntent(env: Env, input: {
  path: string; door: "http" | "mcp"; payer: string | undefined;
  idempotency?: { surface: string; key: string };
  terms: PaymentRequirements; payload: unknown; request: string; item?: MenuItem; commission?: CommissionPurchase; publication?: PublicationSnapshot;
}): Promise<PurchaseIntent> {
  let record: PurchaseIntent;
  let started: boolean;
  try {
    if (!input.payer) throw new Error("Missing verified payer");
    const { payer, id } = await purchaseIdentity(input.terms.network, input.payer, input.payload);
    if (input.idempotency) {
      const slot = await idempotentPurchaseStore(env, input.idempotency.surface, payer, input.idempotency.key);
      const owner = await slot.claimIdempotentPurchase(id);
      if (owner !== id) {
        const saved = await purchaseIntentStore(env, owner).existingPurchase();
        if (!saved) throw new Error("Original purchase admission pending");
        const original = JSON.parse(saved) as PurchaseIntent;
        if (original.id !== owner || original.payer !== payer || original.path !== input.path || original.door !== input.door) {
          throw new Error("Original purchase owner mismatch");
        }
        throw new RecordedPurchase(env, original);
      }
    }
    const payload = isRecord(input.payload) && isRecord(input.payload.payload) ? input.payload.payload : {};
    const auth = isRecord(payload.authorization) ? payload.authorization : {};
    const nonce = extractPaymentNonce(input.payload);
    const solana = input.terms.network.startsWith("solana:")
      ? await solanaPaymentEvidence(String(payload.transaction)) : null;
    const observationDigest = supportsObservationRecovery(input.item)
      ? input.door === "mcp" ? await sha256Hex(jcsCanonicalize(JSON.parse(input.request)))
        : await httpArtifactDigest(`${env.STORE_BASE_URL}${input.path}?${input.request}`)
      : undefined;
    const result = await purchaseIntentStore(env, id).beginPurchase(JSON.stringify({ version: 1, id,
      token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
      path: input.path, door: input.door, payer, terms: input.terms, request: input.request,
      payment_proof: await paymentRecoveryFingerprint(input.payload),
      ...(nonce ? { authorization: { nonce: nonce.toLowerCase(), valid_after: String(auth.validAfter), valid_before: String(auth.validBefore) } } : {}),
      ...(solana ? { solana: { message_hash: solana.message_hash } } : {}),
      ...(observationDigest ? { observation_digest: observationDigest } : {}),
      ...(input.publication ? { publication: input.publication } : {}),
      ...(input.item ? { item: input.item } : {}), ...(input.commission ? { commission: input.commission } : {}), created_at: new Date().toISOString(), state: "unknown" } satisfies PurchaseIntent));
    record = JSON.parse(result.record) as PurchaseIntent;
    started = result.started;
  } catch (error) {
    if (error instanceof RecordedPurchase) throw error;
    throw new SettlementDeclined(Response.json({ code: PURCHASE_RECORD_CODES.unavailable, charged: null, settlement_attempted: false,
      payment_state: "unknown", error: "The purchase record is unavailable. This request did not submit payment; an earlier attempt may still be unresolved. Retry the same request with the same payment and key." },
      { status: 503, headers: { "Cache-Control": "no-store" } }));
  }
  if (!started) throw new RecordedPurchase(env, record);
  return record;
}

export async function notePurchaseUnknown(env: Env, record: PurchaseIntent, reference: string | null, error: SettlementUnknown) {
  error.purchaseRecovery = purchaseRecovery(env, record);
  error.reconciliationReference = reference;
  if (reference) await purchaseIntentStore(env, record.id).updatePurchase({ reconciliation_reference: reference }).catch(() => undefined);
}

async function purchaseDelivery(env: Env, record: PurchaseIntent): Promise<Record<string, unknown> | undefined> {
  if (record.item?.fulfillment === "human_queue" && typeof record.delivery?.order_id === "string") {
    const { getOrder } = await import("@/services/orders");
    const order = await getOrder(env, record.delivery.order_id);
    if (!order) throw new Error("Purchased order unavailable");
    return { ...record.delivery, ...humanOrderEvidence(order), status: order.status,
      ...(order.deliverable !== undefined ? { deliverable: order.deliverable } : {}) };
  }
  return record.delivery ?? publicationDelivery(record);
}

export async function readPurchaseStatus(env: Env, id: unknown, token: unknown): Promise<{ status: 200 | 404 | 503; body: Record<string, unknown> }> {
  const missing = { status: 404 as const, body: { code: "purchase_status_not_found", error: "No purchase status available with these credentials." } };
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return missing;
  let known: PurchaseIntent | undefined;
  try {
    const saved = await purchaseIntentStore(env, id).readPurchase(token);
    if (!saved) return missing;
    const record = JSON.parse(saved) as PurchaseIntent;
    known = record;
    const resolution = await recordedHumanResolution(env, record);
    if (resolution) return { status: 200, body: { ...purchaseStatus(record), ...humanResolutionBody(resolution),
      delivery_state: "resolved", fulfillment: resolvedHumanDelivery(resolution) ?? undefined } };
    const body = purchaseStatus(record);
    if (record.delivery) {
      body.fulfillment = await purchaseDelivery(env, record);
      if (record.item?.fulfillment === "human_queue") {
        body.delivery_state = body.fulfillment?.status === "completed" ? "delivered" : "order_created";
      }
    }
    return { status: 200, body };
  } catch {
    // A failed order refresh does not erase the settlement we just read.
    // Only an authenticated retained record earns a recovery capability.
    return { status: 503, body: {
      ...(known ? { purchase_id: known.id, payment_state: known.state, charged: purchaseStatus(known).charged,
        transaction: known.payment?.transaction ?? null, delivery_state: "unavailable",
        recovery: purchaseRecovery(env, known) } : { charged: null }),
      code: "purchase_status_unavailable", error: "Purchase status is temporarily unavailable. No payment was submitted by this status check.",
    } };
  }
}
