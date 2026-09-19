import { nativeCheckoutTiers, nativePublicationTiers, nativeTiersFor, nativeTierForAmount } from "@/lib/purchase-capabilities";
import type { PaymentRequirements } from "@x402/core/types";
import { hashQuotedTerms, quotedTerms } from "@/discovery/receipt-surface";
import type { Context, Next } from "hono";
import { Credential, PaymentRequest } from "mppx";
import { AuthorizationPayloadSchema } from "mppx/evm";
import { createMppEvmAdapter } from "@/lib/mpp-evm-adapter";
import { mppCheckoutEnabled, nativeCheckoutItem, nativeCommissionDoor, nativePublicationDoor, type NativePublicationDoor } from "@/lib/mpp-checkout-capability";
import { verifiedObservationCheckpoint } from "@/services/purchase-observation";
import { getPaymentStack, atomicToUsdc, tipFromPaid,
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
import { encodeBase64Json } from "@/lib/base64-json";
import type { PublicationSnapshot } from "@/lib/publication-recovery";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * THE DOOR THE KNOCK IS ON. A shelf item's door names its item, its
 * price and its tiers; a publication door (native publications,
 * 2026-09-19) names its family and the family's tiers, with no item
 * behind it. The key is the stem of the suggested purchase key and the
 * ledger's spelling of the sale. The gate already refused any path that
 * is neither before this is reached.
 */
type NativeDoor =
  | { kind: "item"; item: MenuItem; key: string; tiers: PaymentRequirements[]; minimumUsdc: number }
  | { kind: "publication"; door: NativePublicationDoor; key: string; tiers: PaymentRequirements[]; minimumUsdc: number }
  // A commission rung (2026-09-19): the desk's item at the rung's price,
  // one tier; the desk's admission fixes which quote the price honours.
  | { kind: "commission"; item: MenuItem; rung: number; key: string; tiers: PaymentRequirements[]; minimumUsdc: number };

function nativeDoorFor(c: Context<HonoEnv>): NativeDoor | undefined {
  const item = nativeCheckoutItem(c.req.path, c.req.method);
  if (item) return { kind: "item", item, key: item.id, tiers: nativeCheckoutTiers(c.env, item), minimumUsdc: item.price_usdc };
  const door = nativePublicationDoor(c.req.path, c.req.method);
  if (door) return { kind: "publication", door, key: door.family, tiers: nativePublicationTiers(c.env, door), minimumUsdc: door.tiersUsdc[0]! };
  const desk = nativeCommissionDoor(c.req.path, c.req.method);
  if (desk) return { kind: "commission", item: desk.item, rung: desk.rung, key: desk.item.id, tiers: nativeTiersFor(c.env, [desk.rung]), minimumUsdc: desk.rung };
  return undefined;
}

async function adapterFor(c: Context<HonoEnv>, purchaseKey: string, terms: PaymentRequirements) {
  // The caller names the tier (native tips, 2026-09-19); the path is the scope.
  const facilitator = getPaymentStack(c.env).facilitator;
  return createMppEvmAdapter({ secretKey: c.env.MPP_CHALLENGE_KEY!,
    realm: new URL(c.env.STORE_BASE_URL).host, scope: c.req.path,
    requestDigest: await httpArtifactDigest(c.req.url), purchaseKey, terms,
    verify: (payload, accepted) => facilitator.verify(payload, accepted),
  });
}

export async function attachMppChallenge(c: Context<HonoEnv>, response: Response): Promise<void> {
  // The gate asks on "advertised"; the store answers only when it can
  // also admit and account, so discovery never outruns the bindings.
  if (!mppCheckoutEnabled(c.env, c.req.path, c.req.method)) return;
  const supplied = c.req.header("Idempotency-Key");
  if (supplied && !usableIdempotencyKey(supplied)) return;
  const native = nativeDoorFor(c);
  if (!native) return;
  const key = supplied ?? suggestedIdempotencyKey(native.key);
  // One challenge per tier, minimum first, in one header: RFC 9110's
  // challenge list, which the SDK's client reads whole and takes the
  // first candidate of. A fixed-price door has one tier and one challenge.
  const headers: string[] = [];
  for (const terms of native.tiers) {
    const adapter = await adapterFor(c, key, terms);
    headers.push((await adapter.challenge()).header);
  }
  // A real Payment challenge replaces the informational hint. x402's own
  // PAYMENT-REQUIRED and body remain independently usable.
  response.headers.set("WWW-Authenticate", headers.join(", "));
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
  // The credential's challenge names its tier. An amount the tier list
  // never offered is refused here, before the facilitator is asked,
  // whatever its challenge id: the list is what the store agreed to sell at.
  const native = nativeDoorFor(c);
  if (!native) return refusal("mpp_checkout_unavailable", 503);
  const terms = nativeTierForAmount(native.tiers, (credential.challenge.request as { amount?: unknown }).amount);
  if (!terms) return refusal("mpp_verification_refused", 402);
  const adapter = await adapterFor(c, purchaseKey, terms);
  let verified: Awaited<ReturnType<typeof adapter.validate>>;
  try { verified = await adapter.validate(header); }
  catch { return refusal("mpp_verification_refused", 402); }
  const idempotency = { surface: await idempotencyScope(c.req.path, new URL(c.req.url).searchParams, null), key: purchaseKey };
  const saved = await lookupVerifiedPurchase(c.env, { ...identity, network: BASE_NETWORK }, request, idempotency);
  if (saved?.kind === "complete") return signedRecoveryResponse(c, saved);
  if (saved) return c.json(saved.body, saved.kind === "refused" ? 409 : 503);
  const unavailable = await c.get("purchaseAdmission")?.();
  if (unavailable) return unavailable;

  const paidUsdc = atomicToUsdc(terms.amount), tipUsdc = tipFromPaid(paidUsdc, native.minimumUsdc);
  let purchase: PurchaseIntent | undefined;
  let settled: SettledPayment | undefined;
  let deliveryKey: string | null = null;
  let attempt: Promise<SettledPayment> | undefined;
  // A publication's good is the page the handler prepares; it is
  // retained on the record before the settle, as the x402 gate does.
  let publication: PublicationSnapshot | undefined;
  // The desk's admission, run under purchaseAdmission above, captured the
  // live quote this rung honours; the record carries the desk's item at
  // that quote and the accepted terms, as the x402 gate writes them.
  const commission = native.kind === "commission" ? c.get("commissionPurchase") : undefined;
  const recordItem = native.kind === "item" ? native.item
    : native.kind === "commission" ? { ...native.item, price_usdc: commission?.quote_usdc ?? native.rung } : undefined;
  const settle = async (): Promise<SettledPayment> => {
    purchase = await beginVerifiedPurchaseIntent(c.env, { payment: verified.payment, terms,
      ...(recordItem ? { item: recordItem } : {}), ...(commission ? { commission } : {}), ...(publication ? { publication } : {}),
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
      if (native.kind !== "publication") {
        deliveryKey = await openDeliveryIntent(c.env, { path: c.req.path, query: purchase.request,
          transaction: settled.transaction, payer: settled.payer, paid_usdc: paidUsdc, settled_at: new Date().toISOString() }).catch(() => null);
      }
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
    // The observation families prepare their signed reading before the
    // settle and retain it under the purchase identity; the x402 gate
    // builds the same checkpoint from the same verified payload shape.
    // A publication has no observation to prepare.
    observation: native.kind !== "publication"
      ? await verifiedObservationCheckpoint(c.env, native.item, terms.network, verified.payment.payer, verified.payload, c.req.path, request.digest)
      : undefined,
    settle: () => attempt ??= settle(), purchaseRecovery: () => purchase && purchaseRecovery(c.env, purchase),
    purchaseCreatedAt: () => purchase?.created_at });
  await next();
  if (native.kind === "publication" && !settled && c.res.status < 300) {
    // The page handler delivers first and never settles; the gate settles
    // for it after a 2xx, stock x402's own ordering, with the page retained
    // on the record so a lost response is recovered from the journal.
    const markdown = await c.res.clone().text();
    const content_type = c.res.headers.get("Content-Type") ?? "";
    if (!markdown.trim() || !content_type.startsWith("text/markdown")) {
      c.res = c.json({ code: "publication_unavailable", charged: false, settlement_attempted: false,
        error: "The page could not be prepared. No payment was submitted. Retry this same request." }, 503);
      return;
    }
    publication = { markdown, content_type, minimum_usdc: native.minimumUsdc };
    try { await (attempt ??= settle()); }
    catch (error) {
      // A refused or uncertain settle must not be served as a delivered page.
      if (error instanceof SettlementUnknown) { c.res = error.response(); return; }
      if (error instanceof SettlementDeclined) { c.res = error.response; return; }
      throw error;
    }
  }
  if (!settled || !purchase) return;
  for (const [name, value] of Object.entries(settled.settleHeaders)) c.res.headers.set(name, value);
  if (native.kind === "publication") {
    // The retained page is the good; the record derives its delivery
    // (publicationDelivery), so nothing further joins the journal.
    c.res.headers.set("Purchase-Recovery", encodeBase64Json(purchaseRecovery(c.env, purchase)));
    c.res.headers.set("Cache-Control", "no-store");
    await recordDeliveredSettlement(c.env, settled.transaction);
    return;
  }
  if (c.res.status < 300) {
    const delivery = await c.res.clone().json<Record<string, unknown>>();
    await purchaseIntentStore(c.env, purchase.id).completeMppPurchase(delivery).catch(() => undefined);
    await recordDeliveredSettlement(c.env, settled.transaction);
    if (deliveryKey) await closeDeliveryIntent(c.env, deliveryKey).catch(() => undefined);
  }
}
