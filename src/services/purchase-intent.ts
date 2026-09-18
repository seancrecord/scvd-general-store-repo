import { x402PurchasePayment, settlementPurchaseIdentity, assertPurchasePayment, type PurchasePayment, type PurchaseProtocol } from "@/lib/purchase-payment";
import { orderStatusBody } from "@/lib/order-status";
import { laborCapacity } from "@/services/labor-reservations";
import { publicationDelivery, type PublicationSnapshot } from "@/lib/publication-recovery";
import type { CommissionPurchase } from "@/services/commission-purchase";
import { recordedHumanResolution, resolvedHumanDelivery } from "@/services/resolved-human-purchase";
import { humanResolutionBody } from "@/services/human-resolution-record";
import { supportsObservationRecovery, httpArtifactDigest } from "@/lib/artifact-checkpoint";
import type { PaymentRequirements } from "@x402/core/types";
import { jcsCanonicalize } from "@/lib/jcs";
import { idempotencySlotName, idempotentPurchaseSlot, idempotentPurchaseStore, sha256Hex } from "@/lib/idempotency";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { SettlementDeclined, SettlementUnknown, type SettledPayment } from "@/lib/payments";
import { isRecord, type Env, type MenuItem } from "@/types";

export const PURCHASE_RECORD_CODES = {
  unavailable: "purchase_record_unavailable",
  pending: "purchase_recovery_pending",
  refused: "purchase_not_settled",
} as const;

// Advisory polling cadence, not a fulfillment deadline or alarm guarantee.
export const PURCHASE_STATUS_POLL_SECONDS = 60;

export interface PurchaseIntent {
  version: 1 | 2;
  /** Present on v2; v1 records retain their historical x402 interpretation. */
  payment_context?: PurchasePayment;
  request_digest?: string;
  id: string;
  token: string;
  path: string;
  door: "http" | "mcp" | "ucp";
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
  /**
   * The durable idempotency slot this purchase claimed, if it was keyed —
   * a one-way name (lib/idempotency idempotencySlotName), never the key.
   * Carried so a CONFIRMED non-payment can hand the key back without the
   * releasing writer being told the secret. Absent on unkeyed purchases
   * and on every record written before this field existed; both simply
   * have no claim to release.
   */
  idempotency_slot?: string;
  payment?: SettledPayment;
  reconciliation_reference?: string;
  reconciliation?: { start_block?: number; next_block?: number; before_signature?: string; checked_at: string };
  delivery?: Record<string, unknown>;
  /** Retained before submission; bookkeeping must survive delivery and lost acknowledgements. */
  mpp?: { challenge_id: string; house: boolean; accounted?: true };

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
    status_token: record.token, status_tool: "check_purchase", original_door: record.door, original_path: record.path,
    status_auth: "GET status_url with Authorization: Bearer <status_token>. Keep the token private. This read is free and never submits payment." };
}

/**
 * THE WRONG-SCOPE REFUSAL, built in one place so the replay kit
 * (services/replay-kit.ts) serves the same bytes the door does: a
 * settled payment re-presented against a different product or inputs
 * is refused, charged once and never twice, with the original
 * purchase's private recovery handle attached. Derived by both
 * callers from this function, never typed beside it.
 */
export function inputMismatchRefusal(recovery?: Record<string, unknown>, charged: boolean | null = true) {
  return {
    error: recovery
      ? "This payment belongs to a different original request or interface. Read its private purchase status, or retry the original product and inputs through the original interface named in recovery. No additional payment was submitted. Repeating this mismatched request will not recover the purchase."
      : "This payment bought different inputs. Retry the original product, inputs and interface with the original payment. No additional payment was submitted; repeating this mismatched request will not recover the purchase.",
    code: "purchase_input_mismatch" as const, charged, charged_again: false, settlement_attempted: false,
    temporary: false, retry_with_same_request: false,
    next_action: recovery ? "read_purchase_status" : "retry_original_request",
    ...(recovery ? { recovery } : {}),
  };
}

export function purchaseProtocol(record: PurchaseIntent): PurchaseProtocol {
  if (record.version === 1) return "x402";
  if (record.version !== 2 || !record.payment_context || !/^[a-f0-9]{64}$/.test(record.request_digest ?? "")) throw new Error("Unknown purchase record format");
  assertPurchasePayment(record.payment_context, record.terms, record.payer);
  if (record.payment_context.identity !== record.id || record.payment_context.proof_digest !== record.payment_proof ||
    jcsCanonicalize(record.payment_context.authorization ?? null) !== jcsCanonicalize(record.authorization ?? null) ||
    jcsCanonicalize(record.payment_context.solana ?? null) !== jcsCanonicalize(record.solana ?? null)) throw new Error("Purchase evidence mismatch");
  return record.payment_context.protocol;
}

export function purchaseStatus(record: PurchaseIntent) {
  const delivery = record.delivery ?? publicationDelivery(record);
  const pending = !delivery && record.state !== "not_settled";
  return { purchase_id: record.id, payment_protocol: purchaseProtocol(record), payment_state: record.state,
    settlement_attempted: false,
    recovery_state: delivery ? "ready" : pending ? "pending" : "not_settled",
    next_action: delivery ? "use_fulfillment" : pending ? "read_purchase_status" : "review_unsettled_purchase",
    retry_after_seconds: pending ? PURCHASE_STATUS_POLL_SECONDS : null,
    charged: record.state === "unknown" ? null : record.state === "settled",
    path: record.path, door: record.door, request: record.request,
    terms: record.terms, created_at: record.created_at,
    transaction: record.payment?.transaction ?? null,
    // A saved settlement is not evidence of delivery. Artifact recovery follows
    // the existing transaction journal; this status never calls a cert a good.
    delivery_state: delivery ? (record.item?.fulfillment === "human_queue" ? "order_created" : "delivered") : "not_established_by_this_record",
    ...(delivery ? { fulfillment: delivery } : {}),
    reconciliation_reference: record.reconciliation_reference ?? null,
    retry: pending
      ? `Recovery is pending; this record does not yet contain the goods. Read the same private status again after ${PURCHASE_STATUS_POLL_SECONDS} seconds, using GET with the same Bearer token or check_purchase with the same purchase_id and status_token. This interval is advice, not a delivery deadline or guarantee. Status reads are free and submit no payment. Keep the original payment and key; do not pay again to recover this purchase.`
      : delivery ? "Use the retained fulfillment. Keep the original payment and key; no additional payment is needed to recover this purchase."
        : "This purchase is recorded as not settled. No payment was submitted by this status read. Review this result before starting a new purchase.",
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
  const nonce = extractPaymentNonce(payment);
  const payload = isRecord(payment) && isRecord(payment.payload) ? payment.payload : {};
  const raw = nonce ?? payload.transaction;
  if (typeof raw !== "string" || !raw) throw new Error("Missing payment identity");
  return settlementPurchaseIdentity(network, verifiedPayer, raw, nonce ? "authorization" : "transaction");
}

type RecordedPurchaseLookup =
  | { kind: "complete"; delivery: Record<string, unknown>; payment: SettledPayment; recovery: Record<string, unknown> }
  | { kind: "refused" | "pending"; body: Record<string, unknown> & { error: string } }
  | null;

/** Authenticated completed goods outlive the replay cache; never run fulfillment again. */
export async function lookupRecordedPurchase(env: Env, network: string, payer: string | undefined, payload: unknown,
  request: { path: string; door: "http" | "mcp" | "ucp"; digest: string | undefined },
  idempotency?: { surface: string; key: string },
): Promise<RecordedPurchaseLookup> {
  if (!payer) return null;
  const identity = await purchaseIdentity(network, payer, payload).catch(() => null);
  if (!identity) return { kind: "pending", body: { error: "Purchase status is unavailable. This request did not submit payment; an earlier attempt may remain unresolved.",
    code: PURCHASE_RECORD_CODES.unavailable, charged: null, settlement_attempted: false, payment_state: "unknown" } };
  return lookupVerifiedPurchase(env, { ...identity, network }, request, idempotency);
}

/** Identity must come from an authenticated protocol adapter, never request labels. */
export async function lookupVerifiedPurchase(env: Env, identity: { id: string; payer: string; network: string },
  request: { path: string; door: "http" | "mcp" | "ucp"; digest: string | undefined },
  idempotency?: { surface: string; key: string },
): Promise<RecordedPurchaseLookup> {
  const network = identity.network;
  let known: PurchaseIntent | undefined;
  try {
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
    purchaseProtocol(record);
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
    const digest = await purchaseRequestDigest(env, record.door, record.path, record.request);
    if (record.version === 2 && digest !== record.request_digest) throw new Error("Stored purchase input mismatch");
    if (record.path !== request.path || record.door !== request.door || digest !== request.digest) {
      return { kind: "refused", body: inputMismatchRefusal(purchaseRecovery(env, record)) };
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

/**
 * THE REQUEST DIGEST, DECIDED PER DOOR RATHER THAN DEFAULTED.
 *
 * Widening `door` to admit "ucp" (2026-09-16) produced zero
 * compiler errors, which was the finding rather than the relief: the
 * two ternaries that read this field said "mcp or else HTTP", so a
 * third door would have silently been treated as an HTTP query string
 * it does not have. That is the silent-default shape this store keeps
 * a document about, arriving in the one place where a wrong digest
 * means a recovered purchase is matched against the wrong request.
 *
 * So the decision is a function with a case per door and no `else`:
 *
 *   http  the resource URL with its query, the buyer's own request
 *   mcp   the JCS-canonical tool arguments
 *   ucp   the JCS-canonical completion identity — which checkout, at
 *         which version, against which quoted terms. A UCP completion
 *         has no query string and no tool arguments; what identifies
 *         it is the checkout it completes, and the digest has to be
 *         reproducible from the stored checkout alone so a recovery
 *         can recompute it without the original request body.
 */
export async function purchaseRequestDigest(
  env: Env,
  door: "http" | "mcp" | "ucp",
  path: string,
  request: string,
): Promise<string> {
  switch (door) {
    case "mcp":
      return sha256Hex(jcsCanonicalize(JSON.parse(request)));
    case "ucp":
      return sha256Hex(jcsCanonicalize(JSON.parse(request)));
    case "http":
      return httpArtifactDigest(`${env.STORE_BASE_URL}${path}?${request}`);
  }
}

type PurchaseInput = {
  path: string; door: "http" | "mcp" | "ucp";
  idempotency?: { surface: string; key: string };
  terms: PaymentRequirements; request: string; item?: MenuItem; commission?: CommissionPurchase; publication?: PublicationSnapshot;
  mpp?: PurchaseIntent["mpp"];
};

/** Called only after x402 verification, at the last seam before settlement. */
export async function beginPurchaseIntent(env: Env, input: PurchaseInput & { payer: string | undefined; payload: unknown }): Promise<PurchaseIntent> {
  let payment: PurchasePayment;
  try {
    if (!input.payer) throw new Error("Missing verified payer");
    payment = await x402PurchasePayment(input.terms, input.payer, input.payload);
  } catch { throw purchaseUnavailable(); }
  return beginVerifiedPurchaseIntent(env, { ...input, payment });
}

function purchaseUnavailable() {
  return new SettlementDeclined(Response.json({ code: PURCHASE_RECORD_CODES.unavailable, charged: null, settlement_attempted: false,
    payment_state: "unknown", error: "The purchase record is unavailable. This request did not submit payment; an earlier attempt may still be unresolved. Retry the same request with the same payment and key." },
    { status: 503, headers: { "Cache-Control": "no-store" } }));
}

/** Shared admission for verified adapters. No credential or signature is retained. */
export async function beginVerifiedPurchaseIntent(env: Env, input: PurchaseInput & { payment: PurchasePayment }): Promise<PurchaseIntent> {
  let record: PurchaseIntent;
  let started: boolean;
  try {
    const { payer, identity: id } = input.payment;
    assertPurchasePayment(input.payment, input.terms, payer);
    if (input.payment.authorization && (await settlementPurchaseIdentity(input.terms.network, payer,
      input.payment.authorization.nonce, "authorization")).id !== id) throw new Error("Payment identity mismatch");
    let claimedSlot: string | undefined;
    if (input.idempotency) {
      claimedSlot = await idempotencySlotName(input.idempotency.surface, payer, input.idempotency.key);
      const slot = idempotentPurchaseSlot(env, claimedSlot);
      const owner = await slot.claimIdempotentPurchase(id);
      if (owner !== id) {
        const saved = await purchaseIntentStore(env, owner).existingPurchase();
        if (!saved) throw new Error("Original purchase admission pending");
        const original = JSON.parse(saved) as PurchaseIntent;
        purchaseProtocol(original);
        if (original.id !== owner || original.payer !== payer || original.path !== input.path || original.door !== input.door) {
          throw new Error("Original purchase owner mismatch");
        }
        throw new RecordedPurchase(env, original);
      }
    }
    const requestDigest = await purchaseRequestDigest(env, input.door, input.path, input.request);
    const observationDigest = supportsObservationRecovery(input.item) ? requestDigest : undefined;
    const result = await purchaseIntentStore(env, id).beginPurchase(JSON.stringify({ version: 2, id,
      payment_context: input.payment, request_digest: requestDigest,
      ...(input.mpp ? { mpp: input.mpp } : {}),
      token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
      path: input.path, door: input.door, payer, terms: input.terms, request: input.request,
      payment_proof: input.payment.proof_digest,
      ...(input.payment.authorization ? { authorization: input.payment.authorization } : {}),
      ...(input.payment.solana ? { solana: input.payment.solana } : {}),
      ...(observationDigest ? { observation_digest: observationDigest } : {}),
      ...(claimedSlot ? { idempotency_slot: claimedSlot } : {}),
      ...(input.publication ? { publication: input.publication } : {}),
      ...(input.item ? { item: input.item } : {}), ...(input.commission ? { commission: input.commission } : {}), created_at: new Date().toISOString(), state: "unknown" } satisfies PurchaseIntent));
    record = JSON.parse(result.record) as PurchaseIntent;
    purchaseProtocol(record);
    started = result.started;
  } catch (error) {
    if (error instanceof RecordedPurchase) throw error;
    throw purchaseUnavailable();
  }
  if (!started) throw new RecordedPurchase(env, record);
  if (record.item?.fulfillment === "human_queue") {
    let verdict: Awaited<ReturnType<ReturnType<typeof laborCapacity>["reserveLabor"]>>;
    try {
      verdict = await laborCapacity(env).reserveLabor(record.id, record.item, record.created_at);
    } catch {
      // Settlement has not been called on this newly-created journal. Even a
      // lost reservation acknowledgement can therefore be released as unpaid.
      await purchaseIntentStore(env, record.id).updatePurchase({ state: "not_settled" }).catch(() => undefined);
      throw new SettlementDeclined(Response.json({ code: "capacity_unavailable", charged: false, settlement_attempted: false,
        recovery: purchaseRecovery(env, record),
        error: "Human capacity could not be reserved. No charge, and this attempt released its idempotency key. Retry with the SAME key and a fresh payment once capacity is available. Read this attempt's status first; if it does not yet confirm not_settled, the key is still held and a retry is refused rather than charged." }, { status: 503 }));
    }
    if (!verdict.ok) {
      await purchaseIntentStore(env, record.id).updatePurchase({ state: "not_settled" }).catch(() => undefined);
      throw new SettlementDeclined(Response.json({ code: "capacity_unavailable", charged: false, settlement_attempted: false,
        ...(verdict.scope === "week" ? { sold_this_week: verdict.open } : { open_orders: verdict.open }), cap: verdict.cap, capacity_scope: verdict.scope,
        recovery: purchaseRecovery(env, record),
        error: "The available human capacity was taken before payment. No charge, and this attempt released its idempotency key. Retry with the SAME key and a fresh payment when capacity opens. Read this attempt's status first; if it does not yet confirm not_settled, the key is still held and a retry is refused rather than charged." }, { status: 503 }));
    }
  }
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
    return { ...record.delivery, ...orderStatusBody(env.STORE_BASE_URL, order) };
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
    purchaseProtocol(record);
    known = record;
    const resolution = await recordedHumanResolution(env, record);
    if (resolution) return { status: 200, body: { ...purchaseStatus(record), ...humanResolutionBody(resolution),
      delivery_state: "resolved", recovery_state: "resolved", next_action: "read_resolution", retry_after_seconds: null,
      retry: "Keep the signed resolution and its work or refund evidence. Do not pay again to recover this purchase.",
      fulfillment: resolvedHumanDelivery(resolution) ?? undefined } };
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
