import type { PaymentRequirements } from "@x402/core/types";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { SettlementDeclined, SettlementUnknown, type SettledPayment } from "@/lib/payments";
import { isRecord, type Env, type MenuItem } from "@/types";

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
  /** Exact query (duplicates retained) or full MCP arguments; never payment credentials. */
  request: string;
  item?: MenuItem;
  created_at: string;
  authorization?: { nonce: string; valid_after: string; valid_before: string };
  state: "unknown" | "settled" | "not_settled";
  payment?: SettledPayment;
  reconciliation_reference?: string;
  reconciliation?: { start_block?: number; next_block?: number; checked_at: string };
  delivery?: Record<string, unknown>;

}

export function purchaseIntentStore(env: Env, id: string) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Purchase storage unavailable");
  return namespace.get(namespace.idFromName(`purchase:${id}`));
}

export function purchaseRecovery(env: Env, record: PurchaseIntent) {
  return { purchase_recorded: true, purchase_id: record.id, status_url: `${env.STORE_BASE_URL}/api/purchase-status/${record.id}`,
    status_token: record.token, status_tool: "check_purchase",
    status_auth: "GET status_url with Authorization: Bearer <status_token>. Keep the token private. This read is free and never submits payment." };
}

export function purchaseStatus(record: PurchaseIntent) {
  return { purchase_id: record.id, payment_state: record.state,
    charged: record.state === "unknown" ? null : record.state === "settled",
    path: record.path, door: record.door, request: record.request,
    terms: record.terms, created_at: record.created_at,
    transaction: record.payment?.transaction ?? null,
    // A saved settlement is not evidence of delivery. Artifact recovery follows
    // the existing transaction journal; this status never calls a cert a good.
    delivery_state: record.delivery ? (record.item?.fulfillment === "human_queue" ? "order_created" : "delivered") : "not_established_by_this_record",
    ...(record.delivery ? { fulfillment: record.delivery } : {}),
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
    return { ...super.body(), ...purchaseStatus(this.record),
      error: "This payment already has a purchase record. No new settlement was attempted. Read its status; fulfillment recovery may still be required.",
      code: this.record.state === "unknown" ? "settlement_unknown" : this.record.state === "settled" ? PURCHASE_RECORD_CODES.pending : PURCHASE_RECORD_CODES.refused,
      recovery: { reference: this.reconciliationReference, recorded: true, ...purchaseRecovery(this.env, this.record),
        retry: "Keep the original signed payment and idempotency key; do not sign a new payment while this one is unresolved." },
    };
  }
}

async function purchaseIdentity(network: string, verifiedPayer: string, payment: unknown) {
  const payer = network.startsWith("eip155:") ? verifiedPayer.toLowerCase() : verifiedPayer;
  const nonce = extractPaymentNonce(payment);
  const payload = isRecord(payment) && isRecord(payment.payload) ? payment.payload : {};
  const raw = nonce ?? payload.transaction;
  if (typeof raw !== "string" || !raw) throw new Error("Missing payment identity");
  // Equivalent hex/base64 spellings must not open another settlement attempt.
  const identity = nonce ? nonce.toLowerCase() : btoa(atob(raw));
  return { payer, id: await sha256Hex(jcsCanonicalize({ network, payer, identity })) };
}

/** Unknown retries precede new-sale admission: a closed shelf cannot say no charge. */
export async function unresolvedPurchase(env: Env, network: string, payer: string | undefined, payload: unknown) {
  if (!payer) return null;
  try {
    const { id } = await purchaseIdentity(network, payer, payload);
    const saved = await purchaseIntentStore(env, id).existingPurchase();
    if (!saved) return null;
    const record = JSON.parse(saved) as PurchaseIntent;
    return record.state === "unknown" ? new RecordedPurchase(env, record).body() : null;
  } catch {
    return { error: "Purchase status is unavailable. This request did not submit payment; an earlier attempt may remain unresolved.",
      code: PURCHASE_RECORD_CODES.unavailable, charged: null, settlement_attempted: false, payment_state: "unknown" };
  }
}

/** Called only after verification, at the last seam before settlement. */
export async function beginPurchaseIntent(env: Env, input: {
  path: string; door: "http" | "mcp"; payer: string | undefined;
  terms: PaymentRequirements; payload: unknown; request: string; item?: MenuItem;
}): Promise<PurchaseIntent> {
  let record: PurchaseIntent;
  let started: boolean;
  try {
    if (!input.payer) throw new Error("Missing verified payer");
    const { payer, id } = await purchaseIdentity(input.terms.network, input.payer, input.payload);
    const payload = isRecord(input.payload) && isRecord(input.payload.payload) ? input.payload.payload : {};
    const auth = isRecord(payload.authorization) ? payload.authorization : {};
    const nonce = extractPaymentNonce(input.payload);
    const result = await purchaseIntentStore(env, id).beginPurchase(JSON.stringify({ version: 1, id,
      token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
      path: input.path, door: input.door, payer, terms: input.terms, request: input.request,
      ...(nonce ? { authorization: { nonce: nonce.toLowerCase(), valid_after: String(auth.validAfter), valid_before: String(auth.validBefore) } } : {}),
      ...(input.item ? { item: input.item } : {}), created_at: new Date().toISOString(), state: "unknown" } satisfies PurchaseIntent));
    record = JSON.parse(result.record) as PurchaseIntent;
    started = result.started;
  } catch {
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

export async function readPurchaseStatus(env: Env, id: unknown, token: unknown): Promise<{ status: 200 | 404 | 503; body: Record<string, unknown> }> {
  const missing = { status: 404 as const, body: { code: "purchase_status_not_found", error: "No purchase status available with these credentials." } };
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return missing;
  try {
    const saved = await purchaseIntentStore(env, id).readPurchase(token);
    if (!saved) return missing;
    const record = JSON.parse(saved) as PurchaseIntent;
    const body = purchaseStatus(record);
    if (record.item?.fulfillment === "human_queue" && typeof record.delivery?.order_id === "string") {
      const { getOrder } = await import("@/services/orders");
      const order = await getOrder(env, record.delivery.order_id);
      if (!order) throw new Error("Purchased order unavailable");
      body.delivery_state = order.status === "completed" ? "delivered" : "order_created";
      body.fulfillment = { ...record.delivery, status: order.status,
        ...(order.deliverable !== undefined ? { deliverable: order.deliverable } : {}) };
    }
    return { status: 200, body };
  } catch {
    return { status: 503, body: { code: "purchase_status_unavailable", charged: null, error: "Purchase status is temporarily unavailable. No payment was submitted by this status check." } };
  }
}
