import { canonicalAddress } from "@/lib/addresses";
import { getCertificate } from "@/services/certificates";
import { loadHumanResolution, humanResolutionKey, humanResolutionBody } from "@/services/human-resolution-record";
import { resolvedHumanDelivery } from "@/services/resolved-human-purchase";
import { getOrder } from "@/services/orders";
import { orderStatusBody } from "@/lib/order-status";
import { verifyMessageSignature } from "@/lib/signing";
import { isRecord, type Env } from "@/types";

/** Only the Claims route's verified wallet may call this. Reads never acquire
 * a fulfillment claim: missing historical bytes cannot authorize a re-mint. */
export async function claimedGood(env: Env, payer: string, certId: string): Promise<{ status: 200 | 404 | 503; body: Record<string, unknown> }> {
  const noPayment = { settlement_attempted: false, charged_again: false };
  let known: Record<string, unknown> | undefined;
  try {
    const stored = await getCertificate(env, certId), cert = stored?.certificate;
    if (!stored || !cert?.payer || canonicalAddress(cert.payer) !== canonicalAddress(payer)) return { status: 404, body: {
      ...noPayment, code: "purchase_status_not_found", error: "No purchase available with these credentials.",
    } };
    const base = { ...noPayment, address: canonicalAddress(payer), cert_id: certId,
      verify_url: `${env.STORE_BASE_URL}/api/verify/${certId}`, transaction: cert.settlement_tx ?? null,
      network: cert.network ?? null, charged: cert.settlement_tx ? true : cert.paid_usdc ? null : false };
    known = base;
    const unavailable = () => ({ status: 200 as const, body: { ...base, recovery_state: "unavailable", next_action: "contact_keeper",
      fulfillment: undefined, contact_url: `${env.STORE_BASE_URL}/api/letter`,
      error: "The receipt is yours, but this read could not recover its original good. Keep this certificate id and transaction and contact the keeper. Do not pay again to recover it. No replacement was created; this is not proof that the original was delivered." } });
    if (!cert.network || !cert.settlement_tx) return unavailable();
    const ns = env.PAID_RECOVERIES;
    if (!ns) throw new Error("Purchase storage unavailable");
    const identity = { payer, network: cert.network, transaction: cert.settlement_tx };
    const retained = await ns.get(ns.idFromName(`${cert.network}:${cert.settlement_tx}`)).readClaimedGood(identity);
    const recorded = await loadHumanResolution(env, identity.network, identity.transaction);
    const statement = recorded?.statement;
    const resolution = statement && statement.network === identity.network &&
      humanResolutionKey(statement.network, statement.transaction) === humanResolutionKey(identity.network, identity.transaction) &&
      canonicalAddress(statement.payer) === canonicalAddress(payer) && (!retained || statement.path === retained.path) ? recorded : null;
    if (resolution) return { status: 200, body: { ...base, ...humanResolutionBody(resolution), recovery_state: "resolved",
      next_action: "read_resolution", fulfillment: resolvedHumanDelivery(resolution) ?? undefined } };
    if (!retained || retained.response === null) return unavailable();
    const original: unknown = JSON.parse(retained.response);
    if (!isRecord(original)) throw new Error("Original response malformed");
    const originalCert = isRecord(original.certificate) ? original.certificate : original;
    // Wallet ownership alone must not turn a cross-wired checkpoint into the
    // requested artifact. Compare the original receipt and its exact signature.
    if (originalCert.cert_id !== certId || original.signature !== stored.signature || original.public_key !== stored.public_key ||
      typeof original.signed_payload !== "string") throw new Error("Original certificate mismatch");
    if (!await verifyMessageSignature(original.signed_payload, stored.signature, stored.public_key)) throw new Error("Original signature mismatch");
    const signed: unknown = JSON.parse(original.signed_payload);
    if (!isRecord(signed) || signed.cert_id !== certId || signed.settlement_tx !== cert.settlement_tx || signed.network !== cert.network ||
      typeof signed.payer !== "string" || canonicalAddress(signed.payer) !== canonicalAddress(payer)) throw new Error("Original identity mismatch");
    let fulfillment = original;
    // An original queued acceptance is not completed work. Refresh from the
    // same order, preserving its proof and the original purchase certificate.
    if (typeof original.order_id === "string") {
      const order = await getOrder(env, original.order_id);
      if (!order || order.cert_id !== certId || !order.payer || canonicalAddress(order.payer) !== canonicalAddress(payer)) throw new Error("Purchased order unavailable");
      fulfillment = { ...original, ...orderStatusBody(env.STORE_BASE_URL, order) };
    }
    return { status: 200, body: { ...base, recovery_state: "ready", next_action: "use_fulfillment", fulfillment } };
  } catch {
    return { status: 503, body: { ...noPayment, ...(known ?? { charged: null }), code: "purchase_status_unavailable",
      recovery_state: "unavailable", next_action: "repeat_wallet_claim", temporary: null,
      error: "Original purchase recovery is unavailable. Get a fresh wallet challenge and repeat this claim later with the same cert_id. Do not submit a new payment. No original good or record was changed." } };
  }
}
