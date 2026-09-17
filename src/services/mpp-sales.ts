import { BASE_NETWORK } from "@/lib/payment-networks";
import { BASE_USDC } from "@/lib/base-rpc";
import { MPP_CHECKOUT_ITEM } from "@/lib/mpp-checkout-capability";
import type { Env } from "@/types";
import { purchaseProtocol, type PurchaseIntent } from "@/services/purchase-intent";
import { monthsSinceOpening } from "@/lib/metrics";
import { kvGet } from "@/lib/kv-retry";

export const MPP_SALES_PREFIX = "mpp:sales:";
export const MPP_PAYER_PREFIX = "mpp:payer:";
export interface MppSalesSummary {
  organic: number;
  house: number;
  organic_amount_atomic: string;
  house_amount_atomic: string;
  /** Append-only adjustments; original sale evidence and raw totals remain intact. */
  reclassified_house?: number;
  reclassified_amount_atomic?: string;
}
export interface MppHouseCorrection {
  id: string;
  month: string;
  payer: string;
  amount: string;
  at: string;
  reason: string;
}

/** Shared by the writer and the read-only comparison; one definition of a sale. */
export function mppSaleEvidence(record: PurchaseIntent) {
  if (purchaseProtocol(record) !== "mpp" || record.state !== "settled" || !record.payment || !record.mpp ||
    record.terms.network !== BASE_NETWORK || record.terms.asset.toLowerCase() !== BASE_USDC.toLowerCase() || record.item?.id !== MPP_CHECKOUT_ITEM) {
    throw new Error("MPP sale is not confirmed");
  }
  const month = record.created_at.slice(0, 7);
  return {
    id: record.id, month, payer: record.payer, transaction: record.payment.transaction,
    amount: record.terms.amount, house: record.mpp.house,
  };
}

/** The durable receipt, not the HTTP response, owns this idempotent write. */
export async function recordMppSale(env: Env, record: PurchaseIntent): Promise<void> {
  const sale = mppSaleEvidence(record);
  if (!env.COUNTER_LEDGER) throw new Error("MPP sales ledger unavailable");
  await env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${sale.month}/mpp-sales`)).recordMppSale(sale);
}

/** Validate raw totals and their separate corrections before reading or changing them. */
export function validateMppSalesSummary(row: MppSalesSummary): void {
  if (![row.organic, row.house].every(n => Number.isSafeInteger(n) && n >= 0) ||
    ![row.organic_amount_atomic, row.house_amount_atomic].every(n => typeof n === "string" && /^\d+$/.test(n))) throw new Error("MPP sales unreadable");
  const corrected = row.reclassified_house ?? 0;
  const amount = row.reclassified_amount_atomic ?? "0";
  if (!Number.isSafeInteger(corrected) || corrected < 0 || corrected > row.organic ||
    typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) > BigInt(row.organic_amount_atomic) ||
    (corrected === 0) !== (BigInt(amount) === 0n)) throw new Error("MPP correction unreadable");
}

/** Calendar-bounded mirrors, like the legacy till; no scan over all purchases. */
export async function readMppSales(env: Env): Promise<MppSalesSummary> {
  const rows = await Promise.all(monthsSinceOpening().map(month => kvGet(env.COUNTERS, `${MPP_SALES_PREFIX}${month}`)));
  const total: MppSalesSummary = { organic: 0, house: 0, organic_amount_atomic: "0", house_amount_atomic: "0" };
  for (const raw of rows) {
    if (raw === null) continue;
    const row = JSON.parse(raw) as MppSalesSummary;
    validateMppSalesSummary(row);
    const corrected = row.reclassified_house ?? 0;
    const amount = row.reclassified_amount_atomic ?? "0";
    total.organic += row.organic - corrected;
    total.house += row.house + corrected;
    total.organic_amount_atomic = String(BigInt(total.organic_amount_atomic) + BigInt(row.organic_amount_atomic) - BigInt(amount));
    total.house_amount_atomic = String(BigInt(total.house_amount_atomic) + BigInt(row.house_amount_atomic) + BigInt(amount));
    if (corrected) {
      total.reclassified_house = (total.reclassified_house ?? 0) + corrected;
      total.reclassified_amount_atomic = String(BigInt(total.reclassified_amount_atomic ?? "0") + BigInt(amount));
    }
  }
  return total;
}
