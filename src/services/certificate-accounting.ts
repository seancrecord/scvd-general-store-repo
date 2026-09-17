import { BASE_NETWORK } from "@/lib/payment-networks";
import { MPP_CHECKOUT_ITEM } from "@/lib/mpp-checkout-capability";
import { monthsSinceOpening } from "@/lib/metrics";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet } from "@/lib/kv-retry";
import { inspectPurchase } from "@/services/purchase-inspection";
import type { Certificate, Env } from "@/types";

/** The native sales that name a settlement transaction, across every monthly
 * ledger: admission and delivery can cross a month boundary, so the
 * certificate's own month is not enough. Throws when a ledger cannot answer;
 * a read that failed must never look like a sale that was not booked. */
async function nativeSaleIds(env: Env, transaction: string): Promise<string[]> {
  if (!env.COUNTER_LEDGER) throw new Error("Native ledger unavailable");
  const ids: string[] = [];
  for (const month of monthsSinceOpening()) {
    const ledger = env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${month}/mpp-sales`));
    ids.push(...await ledger.readMppSaleIdsForTransaction(transaction));
    if (ids.length > 1) break;
  }
  return ids;
}

/** Certificates predate protocol fields. The retained transaction coordinator
 * identifies the rail; the individual native sale and purchase prove accounting.
 * No status/recovery call, aggregate-count inference, or repair occurs here.
 *
 * THREE WITNESSES, IN ORDER (2026-09-17). The retained settle headers name
 * the protocol outright for every purchase that kept them. They are absent
 * on a rescued x402 settle — the ambiguous-settle rescue relays no
 * facilitator header, by design (lib/payment-gate.ts) — and on any purchase
 * whose coordinator record was never written. Without them, the ledgers
 * themselves answer: a native sale naming this transaction makes it MPP; a
 * legacy per-settle record with no native sale makes it x402. Only a settle
 * neither ledger holds stays undetermined, which is exactly the case the
 * books sweep should keep paging on. A native ledger that cannot be read
 * is never allowed to fall through to the legacy answer. */
export async function certificateProtocol(env: Env, cert: Certificate): Promise<"x402" | "mpp" | "unavailable"> {
  if (cert.item !== MPP_CHECKOUT_ITEM || cert.network !== BASE_NETWORK) return "x402";
  if (!cert.payer || !cert.settlement_tx) return "unavailable";
  let retained: "x402" | "mpp" | null = null;
  try {
    if (env.PAID_RECOVERIES) {
      const store = env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`${cert.network}:${cert.settlement_tx}`));
      retained = await store.readSettlementProtocol({ path: `/api/buy/${cert.item}`, payer: cert.payer,
        network: cert.network, transaction: cert.settlement_tx });
    }
  } catch { retained = null; }
  if (retained) return retained;
  try {
    if ((await nativeSaleIds(env, cert.settlement_tx)).length) return "mpp";
    return await kvGet(env.COUNTERS, KV_KEYS.payerSettle(cert.payer, cert.settlement_tx)) ? "x402" : "unavailable";
  } catch { return "unavailable"; }
}

export async function inspectNativeCertificate(env: Env, cert: Certificate): Promise<"matched" | "missing" | "mismatch" | "unavailable"> {
  try {
    if (!cert.settlement_tx) return "unavailable";
    const ids = await nativeSaleIds(env, cert.settlement_tx);
    if (ids.length > 1) return "mismatch";
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
