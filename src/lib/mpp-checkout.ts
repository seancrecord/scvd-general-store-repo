import { hashQuotedTerms, quotedTerms } from "@/discovery/receipt-surface";
import type { Context, Next } from "hono";
import type { PaymentRequirements } from "@x402/core/types";
import { Credential, PaymentRequest } from "mppx";
import { AuthorizationPayloadSchema } from "mppx/evm";
import { createMppEvmAdapter } from "@/lib/mpp-evm-adapter";
import { mppCheckoutEnabled, MPP_CHECKOUT_ITEM } from "@/lib/mpp-checkout-capability";
import { getPaymentStack, manifestAccepts, priceTiersUsdc, atomicToUsdc, tipFromPaid,
  SettlementUnknown, SettlementDeclined, type SettledPayment } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { idempotencyScope, sha256Hex, suggestedIdempotencyKey, usableIdempotencyKey } from "@/lib/idempotency";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { beginVerifiedPurchaseIntent, lookupVerifiedPurchase, purchaseIntentStore, purchaseRecovery,
  purchaseProtocol, purchaseStatus, type PurchaseIntent } from "@/services/purchase-intent";
import { recoverSignedPurchase } from "@/services/signed-purchase-recovery";
import { signedRecoveryResponse, paymentHeaderOf, gateSignals } from "@/lib/payment-gate";
import { isHouseTraffic } from "@/lib/channel";
import { recordDeliveredSettlement } from "@/services/settlement-records";
import { recordSettlementUnknown } from "@/services/settlement-unknown";
import { openDeliveryIntent, closeDeliveryIntent } from "@/services/delivery-audit";
import { getMenuItem } from "@/store";
import type { HonoEnv } from "@/types";

function termsFor(c: Context<HonoEnv>): PaymentRequirements {
  const item = getMenuItem(MPP_CHECKOUT_ITEM)!;
  // The first native offer is the existing minimum entitlement, without a new price.
  const terms = manifestAccepts(c.env, priceTiersUsdc(item)).find(row => row.network === BASE_NETWORK);
  if (!terms) throw new Error("MPP terms unavailable");
  return terms as PaymentRequirements;
}
async function adapterFor(c: Context<HonoEnv>, purchaseKey: string) {
  const terms = termsFor(c);
  const facilitator = getPaymentStack(c.env).facilitator;
  return { terms, adapter: createMppEvmAdapter({ secretKey: c.env.MPP_CHALLENGE_KEY!,
    realm: new URL(c.env.STORE_BASE_URL).host, scope: c.req.path,
    requestDigest: await httpArtifactDigest(c.req.url), purchaseKey, terms,
    verify: (payload, accepted) => facilitator.verify(payload, accepted),
  }) };
}

export async function attachMppChallenge(c: Context<HonoEnv>, response: Response): Promise<void> {
  const supplied = c.req.header("Idempotency-Key");
  if (supplied && !usableIdempotencyKey(supplied)) return;
  const key = supplied ?? suggestedIdempotencyKey(MPP_CHECKOUT_ITEM);
  const { adapter } = await adapterFor(c, key);
  const challenge = await adapter.challenge();
  // A real Payment challenge replaces the informational hint. x402's own
  // PAYMENT-REQUIRED and body remain independently usable.
  response.headers.set("WWW-Authenticate", challenge.header);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Vary", "Authorization, Idempotency-Key");
}

export async function runMppCheckout(c: Context<HonoEnv>, next: Next, header: string): Promise<Response | void> {
  c.header("Cache-Control", "no-store");
  c.header("Vary", "Authorization, Idempotency-Key");
  const refusal = (code: string, status: 400 | 402 | 503) => c.json({ code, charged: false, settlement_attempted: false,
    error: "Native payment was not submitted. Keep the original credential and purchase key when retrying." }, status);
  if (paymentHeaderOf(c) !== undefined || c.req.query("payment_payload") !== undefined) return refusal("ambiguous_payment_credentials", 400);
  let credential: Credential.Credential;
  let authorization: ReturnType<typeof AuthorizationPayloadSchema.parse>;
  try {
    if (header.length > 16_384) throw new Error("Credential too large");
    credential = Credential.deserialize(header);
    authorization = AuthorizationPayloadSchema.parse(credential.payload);
  } catch { return refusal("invalid_mpp_credential", 400); }
  const identity = await settlementPurchaseIdentity(BASE_NETWORK, authorization.from, authorization.nonce, "authorization");
  const request = { path: c.req.path, door: "http" as const, digest: await httpArtifactDigest(c.req.url) };

  // A retained fingerprint authenticates the original bytes even after expiry,
  // key rotation or disabling checkout. No new charge or fulfillment occurs here.
  try {
    const raw = await purchaseIntentStore(c.env, identity.id).existingPurchase();
    if (raw) {
      const record = JSON.parse(raw) as PurchaseIntent;
      const fingerprint = await sha256Hex(header);
      const bytes = new TextEncoder();
      if (purchaseProtocol(record) === "mpp" && record.payment_proof?.length === fingerprint.length &&
        crypto.subtle.timingSafeEqual(bytes.encode(record.payment_proof), bytes.encode(fingerprint))) {
        const saved = await lookupVerifiedPurchase(c.env, { ...identity, network: BASE_NETWORK }, request);
        if (saved?.kind === "complete") return signedRecoveryResponse(c, saved);
        if (saved) return c.json(saved.body, saved.kind === "refused" ? 409 : 503);
        // A known payment without retained goods is still not permission to submit.
        return c.json({ ...purchaseStatus(record), charged_again: false, recovery: purchaseRecovery(c.env, record),
          error: "Use the original purchase's private status. No new payment was submitted." }, record.state === "not_settled" ? 409 : 503);
      }
      // The same EIP-3009 signature may have already arrived through x402.
      // Its local cryptographic verifier authenticates recovery, not fresh payment.
      const { type: _type, signature, ...auth } = authorization;
      const recovered = await recoverSignedPurchase(c.env, { x402Version: 2, accepted: record.terms,
        payload: { authorization: auth, signature } }, request);
      if (recovered) return signedRecoveryResponse(c, recovered);
    }
  } catch { return c.json({ code: "purchase_record_unavailable", charged: null, charged_again: false,
    settlement_attempted: false, error: "Purchase recovery is unavailable. Keep the original payment; do not pay again." }, 503); }

  if (!mppCheckoutEnabled(c.env, c.req.path, c.req.method)) return refusal("mpp_checkout_unavailable", 503);
  let purchaseKey: unknown;
  try {
    const meta = credential.challenge.opaque ? PaymentRequest.deserialize(credential.challenge.opaque) : credential.challenge.meta;
    purchaseKey = meta?.purchase_key;
  } catch { return refusal("invalid_mpp_credential", 400); }
  const supplied = c.req.header("Idempotency-Key");
  if (typeof purchaseKey !== "string" || !usableIdempotencyKey(purchaseKey) ||
    (supplied !== undefined && supplied !== purchaseKey)) return refusal("mpp_purchase_key_mismatch", 400);
  const { terms, adapter } = await adapterFor(c, purchaseKey);
  let verified: Awaited<ReturnType<typeof adapter.validate>>;
  try { verified = await adapter.validate(header); }
  catch { return refusal("mpp_verification_refused", 402); }
  const idempotency = { surface: await idempotencyScope(c.req.path, new URL(c.req.url).searchParams, null), key: purchaseKey };
  const saved = await lookupVerifiedPurchase(c.env, { ...identity, network: BASE_NETWORK }, request, idempotency);
  if (saved?.kind === "complete") return signedRecoveryResponse(c, saved);
  if (saved) return c.json(saved.body, saved.kind === "refused" ? 409 : 503);
  const unavailable = await c.get("purchaseAdmission")?.();
  if (unavailable) return unavailable;

  const item = getMenuItem(MPP_CHECKOUT_ITEM)!;
  const paidUsdc = atomicToUsdc(terms.amount), tipUsdc = tipFromPaid(paidUsdc, item.price_usdc);
  let purchase: PurchaseIntent | undefined;
  let settled: SettledPayment | undefined;
  let deliveryKey: string | null = null;
  let attempt: Promise<SettledPayment> | undefined;
  const settle = async (): Promise<SettledPayment> => {
    purchase = await beginVerifiedPurchaseIntent(c.env, { payment: verified.payment, terms, item,
      path: c.req.path, door: "http", request: new URL(c.req.url).searchParams.toString(), idempotency,
      mpp: { challenge_id: credential.challenge.id, house: isHouseTraffic(c.env, { ...gateSignals(c), payer: verified.payment.payer }) },
    });
    const store = purchaseIntentStore(c.env, purchase.id);
    let submitted = false;
    try {
      const result = await adapter.broadcast(header, async (payload, accepted) => {
        submitted = true;
        // One submission. Any unanswered or unsuccessful result stays owned by
        // chain reconciliation, never a new authorization on an HTTP retry.
        return getPaymentStack(c.env).facilitator.settle(payload, accepted);
      });
      if (!result.result.success || !result.header) throw new Error("Unconfirmed settlement");
      settled = { paidUsdc, tipUsdc, payer: verified.payment.payer, network: terms.network,
        transaction: result.result.transaction, settleHeaders: { "Payment-Receipt": result.header } };
      await store.updatePurchase({ state: "settled", payment: settled }).catch(() => undefined);
      await store.accountMppPurchase().catch(() => undefined);
      deliveryKey = await openDeliveryIntent(c.env, { path: c.req.path, query: purchase.request,
        transaction: settled.transaction, payer: settled.payer, paid_usdc: paidUsdc, settled_at: new Date().toISOString() }).catch(() => null);
      c.set("payment", settled);
      return settled;
    } catch {
      if (!submitted) {
        await store.updatePurchase({ state: "not_settled" }).catch(() => undefined);
        throw new SettlementDeclined(c.json({ code: "mpp_pre_submission_refused", charged: false, settlement_attempted: false,
          recovery: purchaseRecovery(c.env, purchase), error: "The authorization could not be accepted before submission. Read its private status before signing again." }, 402));
      }
      const unknown = new SettlementUnknown(terms.network);
      unknown.purchaseRecovery = purchaseRecovery(c.env, purchase);
      unknown.reconciliationReference = await recordSettlementUnknown(c.env, { path: c.req.path, door: "http",
        purchaseId: purchase.id, reason: "mpp:submission_unconfirmed", network: terms.network,
        paymentHeader: btoa(JSON.stringify(verified.payload)), quotedUsdc: paidUsdc });
      if (unknown.reconciliationReference) await store.updatePurchase({ reconciliation_reference: unknown.reconciliationReference }).catch(() => undefined);
      throw unknown;
    }
  };
  const quote = quotedTerms(terms);
  c.set("pending", { ...(quote ? { quote: await hashQuotedTerms(quote) } : {}), paidUsdc, tipUsdc, payer: verified.payment.payer, network: terms.network,
    settle: () => attempt ??= settle(), purchaseRecovery: () => purchase && purchaseRecovery(c.env, purchase),
    purchaseCreatedAt: () => purchase?.created_at });
  await next();
  if (!settled || !purchase) return;
  for (const [name, value] of Object.entries(settled.settleHeaders)) c.res.headers.set(name, value);
  if (c.res.status < 300) {
    const delivery = await c.res.clone().json<Record<string, unknown>>();
    await purchaseIntentStore(c.env, purchase.id).completeMppPurchase(delivery).catch(() => undefined);
    await recordDeliveredSettlement(c.env, settled.transaction);
    if (deliveryKey) await closeDeliveryIntent(c.env, deliveryKey).catch(() => undefined);
  }
}
