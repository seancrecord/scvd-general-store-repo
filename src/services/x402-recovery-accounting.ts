import { ARC_NETWORK } from "@/lib/payment-networks";
import { canonicalAddress } from "@/lib/addresses";
import { isHouseTraffic } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { itemKeyFromPath } from "@/lib/metrics";
import { purchaseProtocol, type PurchaseIntent } from "@/services/purchase-intent";
import type { Env } from "@/types";

/** The retained purchase owns this obligation, including after delivery. */
export function needsX402Accounting(record: PurchaseIntent): boolean {
  return record.state === "settled" && record.terms.network !== ARC_NETWORK &&
    purchaseProtocol(record) === "x402" && !record.x402?.accounted;
}

/**
 * Recovery used to finish the goods and retire its alarm without the x402
 * settle record. Never replay recordSettlement here: some of its counters
 * may already have advanced before the request died. Retain the missing
 * transaction evidence only; the existing hourly raise derives floors from
 * it and the certificate without adding the same sale twice.
 */
export async function retainX402Settlement(env: Env, record: PurchaseIntent): Promise<void> {
  if (!needsX402Accounting(record)) return;
  const payment = record.payment;
  if (!payment?.transaction || !payment.payer || payment.network !== record.terms.network ||
    canonicalAddress(payment.payer) !== canonicalAddress(record.payer)) {
    throw new Error("Confirmed x402 settlement identity unavailable");
  }
  const key = KV_KEYS.payerSettle(record.payer, payment.transaction);
  // Preserve the normal writer's timestamp and house attribution. Historical
  // journals lack the request's house flag; only wallet evidence survives.
  if (await kvGet(env.COUNTERS, key)) return;
  const house = record.x402?.house ?? isHouseTraffic(env, { payer: record.payer });
  await kvPut(env.COUNTERS, key, JSON.stringify({
    item: record.item?.id ?? itemKeyFromPath(record.path), at: record.created_at,
    transaction: payment.transaction, ...(house ? { house: true } : {}),
    source: "purchase_recovery",
  }));
}
