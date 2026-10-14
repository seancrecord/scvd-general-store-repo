import { metricsMonth, readMonthLedger, type MonthLedger } from "@/lib/metrics";
import { atomicToUsdc } from "@/lib/payments";
import { readMppSalesMonth } from "@/services/mpp-sales";
import type { Env } from "@/types";

/** Keep the legacy funnel intact; native sales are a separate, corrected source. */
export async function readCommerceMonthLedger(env: Env, month = metricsMonth()): Promise<MonthLedger> {
  const [ledger, native_mpp] = await Promise.all([readMonthLedger(env, month), readMppSalesMonth(env, month)]);
  return { ...ledger, native_mpp };
}

/** A missing native reading is not an observed zero; old cached ledgers must be refreshed. */
export function commerceMonthTotals(ledger: MonthLedger, correction?: { settles: number; usdc: number } | null) {
  const native = ledger.native_mpp;
  if (!native) return null;
  const legacy = Math.max(0, Object.values(ledger.items).reduce((sum, row) => sum + row.settled, 0) - (correction?.settles ?? 0));
  return {
    organic: legacy + native.organic,
    house: Object.values(ledger.items).reduce((sum, row) => sum + row.settledHouse, 0) + (correction?.settles ?? 0) + native.house,
    revenue_usdc: Math.max(0, ledger.revenueUsdc - (correction?.usdc ?? 0)) + atomicToUsdc(native.organic_amount_atomic),
    house_revenue_usdc: ledger.revenueHouseUsdc + (correction?.usdc ?? 0) + atomicToUsdc(native.house_amount_atomic),
    mpp_organic: native.organic,
  };
}
