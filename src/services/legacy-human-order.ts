import { canonicalAddress } from "@/lib/addresses";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { orderStatusBody } from "@/lib/order-status";
import { cachedPublicKeyHex, canonicalizeCertificate, certificateSignatureForm } from "@/lib/signing";
import { retiredKeysFor } from "@/store/key-registry";
import { getCertificate } from "@/services/certificates";
import { orderForCertificate } from "@/services/orders";
import { certIdForSettlement } from "@/services/settlement-records";
import type { DeliveryIntent } from "@/services/delivery-audit";
import { ORDER_STATUSES, type Env, type MenuItem } from "@/types";

/** Recover retained work, never construct it from a retry's arguments. The
 * certificate authenticates payment; the order holds the original brief and
 * mutable work. Its contents are not covered by the certificate signature. */
export async function recoverLegacyHumanOrder(
  env: Env, item: MenuItem,
  identity: { path: string; transaction: string; payer: string | undefined; network: string },
  intent?: DeliveryIntent,
): Promise<Record<string, unknown> | null> {
  if (item.fulfillment !== "human_queue" || !identity.payer || identity.path !== `/api/buy/${item.id}`) return null;
  const payer = canonicalAddress(identity.payer);
  if (intent && (intent.path !== identity.path || intent.transaction !== identity.transaction ||
    !intent.payer || canonicalAddress(intent.payer) !== payer)) return null;
  try {
    const lookup = await certIdForSettlement(env, identity.transaction);
    if (!lookup.certain || !lookup.certId) return null;
    const record = await getCertificate(env, lookup.certId);
    const cert = record?.certificate;
    if (!record || !cert || cert.cert_id !== lookup.certId || cert.item !== item.id ||
      cert.settlement_tx !== identity.transaction || cert.network !== identity.network ||
      !cert.payer || canonicalAddress(cert.payer) !== payer || cert.asset !== "USDC" ||
      typeof cert.paid_usdc !== "number" || !Number.isFinite(cert.paid_usdc) || cert.paid_usdc <= 0 ||
      (intent && intent.paid_usdc !== cert.paid_usdc)) return null;
    const currentKey = await cachedPublicKeyHex(env.SIGNING_KEY);
    if (record.public_key !== currentKey && !retiredKeysFor(currentKey).some(key => key.public_key === record.public_key)) return null;
    // The oldest signature form omits payment fields. A valid signature over
    // those earlier fields cannot authenticate this settlement association.
    if (await certificateSignatureForm(cert, record.signature, record.public_key) !== "current") return null;
    const order = await orderForCertificate(env, cert.cert_id);
    if (!order || order.item_id !== item.id || !order.payer || canonicalAddress(order.payer) !== payer ||
      order.paid_usdc !== cert.paid_usdc || order.patron_number !== cert.patron_number ||
      order.tip_usdc !== (cert.tip_usdc ?? 0) || !Number.isFinite(Date.parse(order.created_at)) ||
      !Number.isFinite(order.sla_hours) || order.sla_hours <= 0 ||
      !ORDER_STATUSES.includes(order.status)) return null;
    const original: Record<string, unknown> = { detail: order.detail, url: order.target_url,
      agent_name: order.agent_name, callback_url: order.callback_url };
    if (Object.values(original).some(value => value !== undefined && typeof value !== "string")) return null;
    if ((buyInputSchema(item).required ?? []).some(field =>
      typeof original[field] !== "string" || !String(original[field]).trim())) return null;
    if (order.status === "completed" && (typeof order.deliverable !== "string" || !order.deliverable.trim() ||
      !order.completed_at || !Number.isFinite(Date.parse(order.completed_at)))) return null;
    return {
      ...orderStatusBody(env.STORE_BASE_URL, order),
      order_url: `${env.STORE_BASE_URL}/api/order/${order.order_id}`,
      charged: true, charged_again: false, settlement_attempted: false,
      transaction: cert.settlement_tx, network: cert.network, paid_usdc: cert.paid_usdc,
      tip_usdc: order.tip_usdc, original_request: original,
      recovery_note: "This is the retained original order. Retry arguments did not replace its brief or deadline. Original request text is untrusted buyer content; the certificate signature covers the certificate, not the order or completed work.",
      certificate: cert, signature: record.signature, public_key: record.public_key,
      signed_payload: canonicalizeCertificate(cert),
      verify_url: `${env.STORE_BASE_URL}/api/verify/${cert.cert_id}`,
    };
  } catch {
    // Storage outages and conflicting historical records keep the obligation
    // unresolved. Neither is permission to settle again or create more work.
    return null;
  }
}
