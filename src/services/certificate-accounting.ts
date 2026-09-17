import { BASE_NETWORK } from "@/lib/payment-networks";
import { MPP_CHECKOUT_ITEM } from "@/lib/mpp-checkout-capability";
import { monthsSinceOpening } from "@/lib/metrics";
import { inspectPurchase } from "@/services/purchase-inspection";
import type { Certificate, Env } from "@/types";

/** Certificates predate protocol fields. The retained transaction coordinator
 * identifies the rail; the individual native sale and purchase prove accounting.
 * No status/recovery call, aggregate-count inference, or repair occurs here. */
export async function certificateProtocol(env: Env, cert: Certificate): Promise<"x402" | "mpp" | "unavailable"> {
  if (cert.item !== MPP_CHECKOUT_ITEM || cert.network !== BASE_NETWORK) return "x402";
  try {
    if (!env.PAID_RECOVERIES || !cert.payer || !cert.settlement_tx) return "unavailable";
    const store = env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`${cert.network}:${cert.settlement_tx}`));
    return await store.readSettlementProtocol({ path: `/api/buy/${cert.item}`, payer: cert.payer,
      network: cert.network, transaction: cert.settlement_tx }) ?? "unavailable";
  } catch { return "unavailable"; }
}

export async function inspectNativeCertificate(env: Env, cert: Certificate): Promise<"matched" | "missing" | "mismatch" | "unavailable"> {
  try {
    if (!env.COUNTER_LEDGER || !cert.settlement_tx) return "unavailable";
    const ids: string[] = [];
    // Admission and delivery can cross a month boundary. Read each bounded
    // calendar ledger, not only the certificate's publication month.
    for (const month of monthsSinceOpening()) {
      const ledger = env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${month}/mpp-sales`));
      ids.push(...await ledger.readMppSaleIdsForTransaction(cert.settlement_tx));
      if (ids.length > 1) return "mismatch";
    }
    if (!ids.length) return "missing";
    const result = await inspectPurchase(env, ids[0]!);
    if (result.status === 503) return "unavailable";
    const purchase = result.body.purchase;
    if (!purchase || purchase.protocol !== "mpp" || purchase.ledger.state !== "matched" ||
      purchase.payment_state !== "settled" || purchase.network !== cert.network ||
      purchase.path !== `/api/buy/${cert.item}` || purchase.payer.toLowerCase() !== cert.payer?.toLowerCase() ||
      purchase.transaction?.toLowerCase() !== cert.settlement_tx.toLowerCase() ||
      purchase.currency !== cert.asset || purchase.decimals === null ||
      typeof cert.paid_usdc !== "number" || !Number.isSafeInteger(cert.paid_usdc * 10 ** purchase.decimals) ||
      purchase.amount_atomic !== String(cert.paid_usdc * 10 ** purchase.decimals)) return "mismatch";
    return "matched";
  } catch { return "unavailable"; }
}
