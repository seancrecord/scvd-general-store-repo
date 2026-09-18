import { Credential, Mcp, PaymentRequest, type Challenge } from "mppx";
import { AuthorizationPayloadSchema } from "mppx/evm";
import { createMppEvmAdapter } from "@/lib/mpp-evm-adapter";
import { nativeMcpCheckoutEnabled } from "@/lib/mpp-checkout-capability";
import { nativeCheckoutTerms } from "@/lib/purchase-capabilities";
import { hashQuotedTerms, quotedTerms } from "@/discovery/receipt-surface";
import { verifiedObservationCheckpoint } from "@/services/purchase-observation";
import { getPaymentStack, atomicToUsdc, tipFromPaid,
  SettlementUnknown, SettlementDeclined, type SettledPayment } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { sha256Hex, usableIdempotencyKey } from "@/lib/idempotency";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { beginVerifiedPurchaseIntent, lookupVerifiedPurchase, purchaseIntentStore, purchaseRecovery,
  purchaseProtocol, purchaseStatus, type PurchaseIntent } from "@/services/purchase-intent";
import { recoverSignedPurchase } from "@/services/signed-purchase-recovery";
import { signedRecoveryOutcome, type McpAdmissionRefusal, type McpPaymentOutcome } from "@/lib/mcp-payment";
import { isHouseTraffic, type HouseSignals } from "@/lib/channel";
import { recordSettlementUnknown } from "@/services/settlement-unknown";
import { openDeliveryIntent } from "@/services/delivery-audit";
import { isRecord, type Env, type MenuItem } from "@/types";

/**
 * THE MCP DOOR'S NATIVE LANE (2026-09-18). The HTTP door has carried
 * a real MPP challenge beside its x402 offer since the pilot; this is
 * the same lane on tools/call, in the wire shape the MPP SDK's own MCP
 * transport defines: the challenge rides under
 * `org.paymentauth/payment-required`, the credential comes back in
 * `params._meta['org.paymentauth/credential']`, and the receipt goes
 * out in `result._meta['org.paymentauth/receipt']`. The three keys
 * are read off the SDK, never spelled here.
 *
 * Same adapter, same admission, same durable purchase record and same
 * native ledger as the HTTP lane (lib/mpp-checkout.ts); only the
 * envelope and the request binding differ. The HTTP challenge binds
 * the request URL's digest; this one binds the digest of the complete
 * tool arguments, the same digest the door's idempotency surface and
 * its delivery intent already carry — so a credential minted for one
 * door cannot pay the other, and the same arguments are one purchase.
 */
export const MCP_CREDENTIAL_META_KEY = Mcp.credentialMetaKey;
export const MCP_PAYMENT_REQUIRED_META_KEY = Mcp.paymentRequiredMetaKey;
export const MCP_RECEIPT_META_KEY = Mcp.receiptMetaKey;

/** The challenge's scope names the tool door, not the HTTP path the door is a twin of. */
export function mcpNativeScope(item: MenuItem): string {
  return `mcp:buy_${item.id}`;
}

async function adapterFor(env: Env, item: MenuItem, inputDigest: string, purchaseKey: string) {
  const terms = nativeCheckoutTerms(env, item);
  const facilitator = getPaymentStack(env).facilitator;
  return { terms, adapter: createMppEvmAdapter({ secretKey: env.MPP_CHALLENGE_KEY!,
    realm: new URL(env.STORE_BASE_URL).host, scope: mcpNativeScope(item),
    requestDigest: inputDigest, purchaseKey, terms,
    verify: (payload, accepted) => facilitator.verify(payload, accepted),
  }) };
}

/**
 * The native challenge for one unpaid tools/call, or nothing when the
 * lane is not enabled here. The purchase key is the one the door
 * quotes beside it, so the credential's key and the retry's key agree.
 */
export async function readMcpMppChallenge(env: Env, item: MenuItem, inputDigest: string, purchaseKey: string): Promise<Challenge.Challenge | undefined> {
  if (!nativeMcpCheckoutEnabled(env, item) || !usableIdempotencyKey(purchaseKey)) return undefined;
  const { adapter } = await adapterFor(env, item, inputDigest, purchaseKey);
  return (await adapter.challenge()).challenge;
}

/** The SDK's payment-required data shape, for error.data and result._meta alike. */
export function mcpPaymentRequired(challenge: Challenge.Challenge): Mcp.ErrorObject["data"] {
  return { httpStatus: 402, challenges: [challenge] };
}

/** A retained purchase answers with the receipt of the challenge this credential named. */
function withChallenge(outcome: McpPaymentOutcome, challengeId: string): McpPaymentOutcome {
  return outcome.kind === "authorized" ? { ...outcome, challengeId } : outcome;
}

export type McpMppReplayCheck = (verifiedPayer: string, purchaseKey: string) => Promise<Record<string, unknown> | null>;

/**
 * Run one native MCP purchase up to the point of admission. Returns the
 * same outcome family the x402 lane returns, so the route's delivery,
 * decline and recovery branches are shared; a fresh sale's `settle` is
 * presented by fulfillment at its last line, exactly as on the HTTP door.
 */
export async function runMcpMppPayment(env: Env, item: MenuItem, credentialMeta: unknown, signals: HouseSignals,
  onVerifiedPayer: McpMppReplayCheck | undefined, askedFor: string, inputDigest: string,
  admitPurchase: () => Promise<McpAdmissionRefusal | null>, idempotencySurface: string, suppliedKey: string | undefined,
): Promise<McpPaymentOutcome> {
  const path = `/api/buy/${item.id}`;
  const request = { path, door: "mcp" as const, digest: inputDigest };
  const refusal = (code: string, error: string, status: 400 | 402): McpPaymentOutcome => ({ kind: "payment-required", status,
    body: { code, error, charged: false, settlement_attempted: false } });
  let header: string;
  let credential: Credential.Credential;
  let authorization: ReturnType<typeof AuthorizationPayloadSchema.parse>;
  try {
    // The SDK's own MCP transport accepts the credential object and
    // proves it through the canonical wire serializer; so does this.
    if (!isRecord(credentialMeta) || !("challenge" in credentialMeta) || !("payload" in credentialMeta)) throw new Error("Not a credential");
    header = Credential.serialize(credentialMeta as Credential.Credential);
    if (header.length > 16_384) throw new Error("Credential too large");
    credential = Credential.deserialize(header);
    authorization = AuthorizationPayloadSchema.parse(credential.payload);
  } catch {
    return refusal("invalid_mpp_credential", "The native credential in _meta['org.paymentauth/credential'] is not a readable MPP evm/charge credential. Nothing was charged; keep the original credential and purchase key when retrying.", 400);
  }
  const identity = await settlementPurchaseIdentity(BASE_NETWORK, authorization.from, authorization.nonce, "authorization");

  // A retained fingerprint authenticates the original bytes even after
  // expiry, key rotation or disabling checkout. No new charge here.
  try {
    const raw = await purchaseIntentStore(env, identity.id).existingPurchase();
    if (raw) {
      const record = JSON.parse(raw) as PurchaseIntent;
      const fingerprint = await sha256Hex(header);
      const bytes = new TextEncoder();
      if (purchaseProtocol(record) === "mpp" && record.payment_proof?.length === fingerprint.length &&
        crypto.subtle.timingSafeEqual(bytes.encode(record.payment_proof), bytes.encode(fingerprint))) {
        const saved = await lookupVerifiedPurchase(env, { ...identity, network: BASE_NETWORK }, request);
        if (saved?.kind === "complete") return withChallenge(signedRecoveryOutcome(saved), credential.challenge.id);
        if (saved) return { kind: "purchase-status", body: saved.body as Record<string, unknown> & { error: string } };
        return { kind: "purchase-status", body: { ...purchaseStatus(record), charged_again: false, recovery: purchaseRecovery(env, record),
          error: "Use the original purchase's private status. No new payment was submitted." } };
      }
      // The same EIP-3009 signature may have already arrived through x402.
      const { type: _type, signature, ...auth } = authorization;
      const recovered = await recoverSignedPurchase(env, { x402Version: 2, accepted: record.terms,
        payload: { authorization: auth, signature } }, request);
      if (recovered) return signedRecoveryOutcome(recovered);
    }
  } catch {
    return { kind: "purchase-status", body: { code: "purchase_record_unavailable", charged: null, charged_again: false,
      settlement_attempted: false, error: "Purchase recovery is unavailable. Keep the original payment; do not pay again." } };
  }

  if (!nativeMcpCheckoutEnabled(env, item)) return { kind: "admission-refused", refusal: { code: "mpp_checkout_unavailable",
    message: "Native MPP checkout is not enabled on this door. Nothing was charged; the x402 offer in the unpaid call's terms remains." } };
  let purchaseKey: unknown;
  try {
    const meta = credential.challenge.opaque ? PaymentRequest.deserialize(credential.challenge.opaque) : credential.challenge.meta;
    purchaseKey = meta?.purchase_key;
  } catch {
    return refusal("invalid_mpp_credential", "The credential's challenge carries no readable purchase key. Nothing was charged.", 400);
  }
  if (typeof purchaseKey !== "string" || !usableIdempotencyKey(purchaseKey) || (suppliedKey !== undefined && suppliedKey !== purchaseKey)) {
    return refusal("mpp_purchase_key_mismatch", "The credential's purchase key is missing or disagrees with _meta['x402/idempotency-key']. Send the key the challenge was minted with, or omit it. Nothing was charged.", 400);
  }
  const { terms, adapter } = await adapterFor(env, item, inputDigest, purchaseKey);
  let verified: Awaited<ReturnType<typeof adapter.validate>>;
  try { verified = await adapter.validate(header); }
  catch {
    return refusal("mpp_verification_refused", "The native credential was not accepted: it does not match this door's challenge for these exact arguments, or its signature, window or chain state failed. Nothing was charged. Read the fresh challenge beside this refusal and sign it with identical arguments.", 402);
  }
  const payer = verified.payment.payer;
  if (onVerifiedPayer) {
    const cached = await onVerifiedPayer(payer, purchaseKey);
    if (cached) return { kind: "replay", body: cached };
  }
  const idempotency = { surface: idempotencySurface, key: purchaseKey };
  const saved = await lookupVerifiedPurchase(env, { ...identity, network: BASE_NETWORK }, request, idempotency);
  if (saved?.kind === "complete") return withChallenge(signedRecoveryOutcome(saved), credential.challenge.id);
  if (saved) return { kind: "purchase-status", body: saved.body as Record<string, unknown> & { error: string } };
  const unavailable = await admitPurchase();
  if (unavailable) return { kind: "admission-refused", refusal: unavailable };

  const paidUsdc = atomicToUsdc(terms.amount), tipUsdc = tipFromPaid(paidUsdc, item.price_usdc);
  let purchase: PurchaseIntent | undefined;
  let settled: SettledPayment | undefined;
  let deliveryKey: string | null = null;
  let attempt: Promise<SettledPayment> | undefined;
  const settle = async (): Promise<SettledPayment> => {
    purchase = await beginVerifiedPurchaseIntent(env, { payment: verified.payment, terms, item, path, door: "mcp",
      request: askedFor, idempotency,
      mpp: { challenge_id: credential.challenge.id, house: isHouseTraffic(env, { ...signals, payer }) } });
    const store = purchaseIntentStore(env, purchase.id);
    let submitted = false;
    try {
      const result = await adapter.broadcast(header, async (payload, accepted) => {
        submitted = true;
        // One submission; an unanswered or unsuccessful result stays owned
        // by chain reconciliation, never a new authorization on a retry.
        return getPaymentStack(env).facilitator.settle(payload, accepted);
      });
      if (!result.result.success || !result.header) throw new Error("Unconfirmed settlement");
      settled = { paidUsdc, tipUsdc, payer, network: terms.network,
        transaction: result.result.transaction, settleHeaders: { "Payment-Receipt": result.header } };
      await store.updatePurchase({ state: "settled", payment: settled }).catch(() => undefined);
      await store.accountMppPurchase().catch(() => undefined);
      deliveryKey = await openDeliveryIntent(env, { path, query: purchase.request, transaction: settled.transaction,
        payer: settled.payer, paid_usdc: paidUsdc, settled_at: new Date().toISOString() }).catch(() => null);
      return settled;
    } catch {
      if (!submitted) {
        await store.updatePurchase({ state: "not_settled" }).catch(() => undefined);
        throw new SettlementDeclined(Response.json({ code: "mpp_pre_submission_refused", charged: false, settlement_attempted: false,
          recovery: purchaseRecovery(env, purchase),
          error: "The authorization could not be accepted before submission. Read its private status before signing again." }, { status: 402 }));
      }
      const unknown = new SettlementUnknown(terms.network);
      unknown.purchaseRecovery = purchaseRecovery(env, purchase);
      unknown.reconciliationReference = await recordSettlementUnknown(env, { path, door: "mcp", purchaseId: purchase.id,
        reason: "mpp:submission_unconfirmed", network: terms.network,
        paymentHeader: btoa(JSON.stringify(verified.payload)), quotedUsdc: paidUsdc });
      if (unknown.reconciliationReference) await store.updatePurchase({ reconciliation_reference: unknown.reconciliationReference }).catch(() => undefined);
      throw unknown;
    }
  };
  const quote = quotedTerms(terms);
  return {
    kind: "authorized", verifiedPayer: payer, challengeId: credential.challenge.id,
    pending: { ...(quote ? { quote: await hashQuotedTerms(quote) } : {}), paidUsdc, tipUsdc, payer, network: terms.network,
      observation: await verifiedObservationCheckpoint(env, item, terms.network, payer, verified.payload, path, inputDigest),
      settle: () => attempt ??= settle(), purchaseRecovery: () => purchase && purchaseRecovery(env, purchase),
      purchaseCreatedAt: () => purchase?.created_at },
    settledSoFar: () => settled ?? null,
    deliveryKeySoFar: () => deliveryKey,
    // Same paid journal as the HTTP door's 2xx seam: the delivered goods
    // join the durable record, so a lost response never mints twice.
    completeDelivery: async delivery => {
      if (purchase && settled) await purchaseIntentStore(env, purchase.id).completeMppPurchase(delivery).catch(() => undefined);
    },
  };
}
