import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * C2: the public ledger summary. Computed live from the same counters
 * the office reads, never hand-edited. House traffic is excluded from
 * the organic figure and the exclusion policy is published beside the
 * numbers; the store's most distinctive sentence is a true zero.
 */

export const OPERATING_SINCE = "2026-07-22";

export const HOUSE_FLAG_POLICY =
  "House traffic (the proprietors' own wallets and tests) is flagged at the till and excluded from every organic figure. Family doesn't make the paper.";

export interface StoreStats {
  operating_since: string;
  settled_purchases_total: number;
  organic_settlements: number;
  house_settlements: number;
  /** Settles from before the channel meter existed; counted, attributed to nobody. */
  pre_meter_settlements: number;
  computed_at: string;
}

function monthsSinceOpening(now: Date = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(2026, 6, 1));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  while (cursor.getTime() <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export async function computeStats(env: Env): Promise<StoreStats> {
  const total = parseInt(
    (await env.COUNTERS.get(KV_KEYS.patronNumber)) ?? "0",
    10,
  );
  let organic = 0;
  let house = 0;
  for (const month of monthsSinceOpening()) {
    const listed = await env.COUNTERS.list({
      prefix: `metric:${month}:paid`,
    });
    const names = listed.keys.map((key) => key.name);
    const values = await bulkGetJson<number>(env.COUNTERS, names);
    for (const name of names) {
      const count = values.get(name) ?? 0;
      // metric:<m>:paid:<item> is organic; metric:<m>:paidh:<item> is house.
      if (name.includes(":paidh:")) {
        house += count;
      } else {
        organic += count;
      }
    }
  }
  return {
    operating_since: OPERATING_SINCE,
    settled_purchases_total: total,
    organic_settlements: organic,
    house_settlements: house,
    pre_meter_settlements: Math.max(0, total - organic - house),
    computed_at: new Date().toISOString(),
  };
}

/**
 * The honest track-record line, including at zero. Rewrites itself as
 * the ledger grows; never needs marketing review. ⚑ KEEPER REVIEW
 * PENDING on the connective wording (the numbers are not editable).
 */
export function trackRecordLine(stats: StoreStats, base: string): string {
  const exclusions: string[] = [];
  if (stats.house_settlements > 0) {
    exclusions.push(
      `${stats.house_settlements} house-flagged proprietor tests`,
    );
  }
  if (stats.pre_meter_settlements > 0) {
    exclusions.push(
      `${stats.pre_meter_settlements} from before the channel meter`,
    );
  }
  const exclusionNote =
    exclusions.length > 0
      ? `, of which ${exclusions.join(" and ")} are excluded from the organic figure`
      : "";
  return [
    `Operating since ${stats.operating_since}.`,
    `Settled purchases: ${stats.settled_purchases_total}${exclusionNote}.`,
    `Organic settlements: ${stats.organic_settlements}.`,
    `Every number here is computed live from ${base}/stats; every artifact ever issued verifies at ${base}/api/verify/{id}.`,
  ].join(" ");
}
