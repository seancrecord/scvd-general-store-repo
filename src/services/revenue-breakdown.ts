import { formatUnits } from "viem";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { inspectPurchase, validPurchaseId } from "@/services/purchase-inspection";
import { isRecord, type Env } from "@/types";
import type { TaxRow } from "@/services/tax-export";

export const REVENUE_STUDY_CAP = 300;
export const REVENUE_PURCHASE_CAP = 100;
interface ReceiptTotal { sales: number; usdc: number }
export interface RevenueBreakdown {
  research: ReceiptTotal;
  outside_unlinked: ReceiptTotal;
  house: ReceiptTotal;
  unknown_payer: ReceiptTotal;
  study_purchases: number;
  study_purchases_inspected: number;
  rewards_authorized_usdc: number;
  incomplete: boolean;
}

/** Use purchase evidence, never wallet membership, to attribute a receipt. */
export async function revenueBreakdown(env: Env, receipts: TaxRow[], receiptsTruncated: boolean): Promise<RevenueBreakdown> {
  const result: RevenueBreakdown = { research: { sales: 0, usdc: 0 }, outside_unlinked: { sales: 0, usdc: 0 },
    house: { sales: 0, usdc: 0 }, unknown_payer: { sales: 0, usdc: 0 }, study_purchases: 0,
    study_purchases_inspected: 0, rewards_authorized_usdc: 0, incomplete: receiptsTruncated };
  const ids = new Set<string>();
  try {
    const listed = await listKeys(env.COUNTERS, { prefix: KV_KEYS.studyPrefix, cap: REVENUE_STUDY_CAP });
    result.incomplete ||= listed.truncated;
    const rows = await bulkGetJson<unknown>(env.COUNTERS, listed.names);
    for (const key of listed.names) {
      const row = rows.get(key);
      if (!isRecord(row)) { result.incomplete = true; continue; }
      if (!row.debrief) continue;
      const d = row.debrief;
      if (!isRecord(d) || !Array.isArray(d.legs) || typeof d.reward_usd !== "number" || !Number.isFinite(d.reward_usd) || d.reward_usd < 0) {
        result.incomplete = true; continue;
      }
      // A signed reward authorization is not proof that it was redeemed.
      result.rewards_authorized_usdc += d.reward_usd;
      for (const leg of d.legs) {
        if (!isRecord(leg) || !isRecord(leg.observed) || typeof leg.purchase_id !== "string" || !validPurchaseId(leg.purchase_id)) {
          result.incomplete = true; continue;
        }
        if (leg.observed.settled === true) ids.add(leg.purchase_id);
      }
    }
  } catch { result.incomplete = true; }
  result.study_purchases = ids.size;
  result.incomplete ||= ids.size > REVENUE_PURCHASE_CAP;
  const purchases = await Promise.all([...ids].slice(0, REVENUE_PURCHASE_CAP).map(id => inspectPurchase(env, id).catch(() => null)));
  const observed = purchases.flatMap(reading => {
    const p = reading?.body.purchase;
    if (!reading || reading.status !== 200 || !p || p.payment_state !== "settled" || !p.transaction ||
      (p.protocol === "mpp" && p.ledger.state !== "matched")) { result.incomplete = true; return []; }
    result.study_purchases_inspected++;
    return [p];
  });
  for (const row of receipts) {
    if (row.row_type !== "sale") continue; // Refunds have no reliable per-purchase join; show them separately.
    const match = observed.some(p => p.transaction === row.settlement_tx && p.network === row.network && p.payer === row.payer &&
      p.path === `/api/buy/${row.item}` && p.currency === "USDC" && p.decimals !== null &&
      Number(formatUnits(BigInt(p.amount_atomic), p.decimals)) === row.amount_usdc);
    const bucket = row.house_flagged === "house" ? result.house : row.house_flagged === "unknown" ? result.unknown_payer :
      match ? result.research : result.outside_unlinked;
    bucket.sales++;
    bucket.usdc += row.amount_usdc + row.tip_usdc;
  }
  return result;
}
