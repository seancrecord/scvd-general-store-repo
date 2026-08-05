import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { FOUNDING_SETTLES_WITHOUT_PAYER_ROW } from "@/lib/metrics";
import type { Env } from "@/types";

/** Ceiling on a paid counters scan. An unnamed cap is a silent one. */
const PAID_METRIC_CAP = 2000;

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
  /**
   * Family settles that booked organic before their wallets were
   * listed, corrected at read from the reclassification ledger —
   * subtracted from organic, added to house, raw counters untouched.
   * Story at /corrections. Zero is the normal state.
   */
  reclassified_house: number;
  /** Settles from before the channel meter existed; counted, attributed to nobody. */
  pre_meter_settlements: number;
  /**
   * The patron counter: every artifact ever minted, FREE SHELF
   * INCLUDED — stamps, free certs, the lot. Published as what it is.
   * This number used to masquerade as settled_purchases_total, which
   * is how the front page came to subtract counters from two
   * different substrates and publish 88 − 85 beside an organic 5.
   */
  artifacts_issued: number;
  computed_at: string;
}

export function monthsSinceOpening(now: Date = new Date()): string[] {
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
  /**
   * THE IDENTITY FIX, 2026-08-05, found by the keeper reading two of
   * his own pages: the front said 88 settled purchases with 85 house
   * excluded and organic 5 — and 88−85 is 3, not 5. The old `total`
   * was the patron_number counter, which increments for EVERY
   * artifact ever minted, free stamps included; organic and house
   * came from the settle counters, a different substrate entirely.
   * Two substrates can disagree freely, and the Math.max clamp on
   * pre_meter swallowed the contradiction instead of failing loudly.
   *
   * Now the total is DERIVED from the same counters as its parts,
   * plus the one founding settle that predates the meter — so
   * total = organic + house + pre_meter holds by construction and
   * no surface can publish a subtraction that doesn't come out.
   * The patron counter is still published, as what it actually is:
   * artifacts_issued, free shelf included, not a purchase count.
   */
  const artifactsIssued = parseInt(
    (await env.COUNTERS.get(KV_KEYS.patronNumber)) ?? "0",
    10,
  );
  let organic = 0;
  let house = 0;
  for (const month of monthsSinceOpening()) {
    const listed = await listKeys(env.COUNTERS, { prefix: `metric:${month}:paid`, cap: PAID_METRIC_CAP });
    const names = listed.names;
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
  /**
   * THE RECLASSIFICATION LEDGER, applied at read (2026-08-04): family
   * settles that booked organic before their wallets were listed
   * (the cross-model UX walkers) are subtracted here and added to
   * house, with the raw counters untouched and the whole story on
   * /corrections. The organic number is the store's proudest claim,
   * and a proud number that quietly includes family money is the one
   * lie this store cannot afford.
   */
  const { totalReclassified } = await import("@/services/reclassify");
  const reclassified = await totalReclassified(env);
  return {
    operating_since: OPERATING_SINCE,
    settled_purchases_total:
      organic + house + FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    organic_settlements: Math.max(0, organic - reclassified),
    house_settlements: house + reclassified,
    reclassified_house: reclassified,
    pre_meter_settlements: FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    artifacts_issued: artifactsIssued,
    computed_at: new Date().toISOString(),
  };
}

/**
 * The honest track-record line, including at zero. Rewrites itself as
 * the ledger grows; never needs marketing review. ⚑ KEEPER REVIEW
 * PENDING on the connective wording (the numbers are not editable).
 */
export function trackRecordLine(stats: StoreStats, base: string): string {
  /**
   * The arithmetic is SHOWN, never implied: the old wording invited
   * the reader to subtract ("88, of which 85 excluded") and get a
   * number that contradicted the organic figure printed beside it —
   * the keeper did exactly that subtraction and caught it. Now the
   * sentence IS the identity, and it comes out by construction.
   */
  const parts = [
    `${stats.organic_settlements} organic`,
    `${stats.house_settlements} house-flagged proprietor tests`,
    ...(stats.pre_meter_settlements > 0
      ? [`${stats.pre_meter_settlements} from before the channel meter`]
      : []),
  ];
  return [
    `Operating since ${stats.operating_since}.`,
    `Settled purchases: ${stats.settled_purchases_total} — ${parts.join(" + ")}.`,
    `Only the organic figure counts as proof.`,
    `Every number here is computed live from ${base}/stats; every artifact ever issued (${stats.artifacts_issued}, free shelf included) verifies at ${base}/api/verify/{id}.`,
  ].join(" ");
}
