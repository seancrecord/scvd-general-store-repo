import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
  monthsSinceOpening,
} from "@/lib/metrics";
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

/**
 * PRE-METER SALES WHOSE RAIL WAS IDENTIFIED BY HAND, and the only
 * hand-typed figures in this file.
 *
 * A sale settled before the till recorded rails, that also minted no
 * certificate to carry one, cannot be placed from our own books — the
 * store's records simply do not contain the answer. The CHAIN does:
 * the store's Base, Polygon, and Solana receiving wallets are public, every
 * settle is a USDC transfer into one of them, and a transfer with no
 * certificate against it is precisely what the bank reconciliation
 * already hunts for. So the answer is recoverable; it is just
 * recoverable by a person reading a block explorer rather than by this
 * code.
 *
 * THE BAR FOR ADDING TO THIS is now the SHAPE, not a comment asking
 * nicely: each entry IS its transaction hash, and the count the books
 * use is the length of the list. A hand-placed sale without its
 * evidence is unrepresentable — there is no integer to bump — and a
 * test holds each entry to its chain's hash format. Same standard as
 * the founding settle in metrics.ts, which carries its own hash;
 * here the hash is the value rather than the comment beside it.
 *
 * Empty is the honest starting state and the set is closed: nothing
 * can join it, because every sale from the meter's start is counted
 * at the till.
 */
export const RAILS_ENTERED_BY_HAND: {
  base: readonly string[];
  polygon: readonly string[];
  solana: readonly string[];
} = {
  base: [],
  polygon: [],
  solana: [],
};

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
  /**
   * THE RAIL SPLIT: the organic figure above, divided by the chain the
   * money actually arrived on. Absent — never zeroed — when there is
   * nothing to divide it by yet, because "0 on Solana" and "we haven't
   * measured Solana" are different claims.
   *
   * base + solana + rail_not_recorded === organic_settlements, always,
   * by construction. The last term is a CLOSED SET and shrinking: sales
   * settled before the till started recording rails that also minted no
   * certificate to carry one — in practice a penny page, which takes
   * real money and issues no artifact by design. Nothing joins it, so
   * it can only go down, and it goes down by hand as the keeper
   * identifies each one against the chain.
   */
  organic_by_rail?: {
    base: number;
    polygon: number;
    solana: number;
    rail_not_recorded: number;
    computed_at: string;
  };
  computed_at: string;
}

/**
 * Re-exported, not redefined: the implementation moved to lib/metrics
 * beside the counters it enumerates, so services/rails could use it
 * without importing this file and closing a cycle. Callers that always
 * asked stats for it keep asking stats for it.
 */
export { monthsSinceOpening };

/**
 * The same computation, with its self-doubt attached. computeStats
 * publishes; this also reports what publishing chose to omit — today,
 * a rail tally that overshoots the organic count, which the public
 * path drops (an absent split is honest) and the invariant sweep must
 * hear about (a dropped split means two substrates disagree, and that
 * is a defect wherever it is quiet). One computation, two readers;
 * the diagnostic can no more drift from the page than the page from
 * itself.
 */
export interface BooksDiagnostics {
  stats: StoreStats;
  /** Set when the rail records claim more sales than the counters know. */
  rail_overshoot: { rail_total: number; organic: number } | null;
}

export async function computeStats(env: Env): Promise<StoreStats> {
  return (await computeStatsDiagnosed(env)).stats;
}

export async function computeStatsDiagnosed(
  env: Env,
): Promise<BooksDiagnostics> {
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
  /** Organic settles from the months the store was single-rail. */
  let organicBeforeSecondRail = 0;
  const { monthsBeforeSecondRail } = await import("@/services/rails");
  const singleRailMonths = new Set(monthsBeforeSecondRail());
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
        if (singleRailMonths.has(month)) {
          organicBeforeSecondRail += count;
        }
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
  const organicSettlements = Math.max(0, organic - reclassified);
  /**
   * THE TWO RAIL RECORDS, added rather than chosen between, because
   * they cover disjoint sets of sales: the till counts everything from
   * the moment it started, the certificate walk stops at exactly that
   * instant. Neither can see the other's sales, so nothing is counted
   * twice and the sum is the whole of what we know.
   */
  const { readRailSplit, readRailCounters } = await import("@/services/rails");
  const [split, till] = await Promise.all([
    readRailSplit(env).catch(() => null),
    readRailCounters(env).catch(() => null),
  ]);
  /**
   * THE THIRD RECORD, and the strongest of the three: what the store
   * was CAPABLE of accepting. Every organic settle from the months
   * before the Solana door was built had exactly one rail available to
   * it, so a pre-rail sale that neither ledger placed is not unknown —
   * it is Base, necessarily. This is the keeper's argument, and it
   * beats a block explorer: an explorer tells you where a payment
   * landed, this tells you where it COULD have landed, and there was
   * one answer.
   *
   * Only the ones the certificates did not already place are added, or
   * a July sale with a certificate would be counted twice.
   */
  const singleRailUnplaced = Math.max(
    0,
    organicBeforeSecondRail - (split?.placed_before_second_rail ?? 0),
  );
  const railBase =
    (split?.base ?? 0) +
    (till?.base ?? 0) +
    singleRailUnplaced +
    RAILS_ENTERED_BY_HAND.base.length;
  const railSolana =
    (split?.solana ?? 0) + (till?.solana ?? 0) + RAILS_ENTERED_BY_HAND.solana.length;
  const railPolygon =
    (split?.polygon ?? 0) +
    (till?.polygon ?? 0) +
    RAILS_ENTERED_BY_HAND.polygon.length;
  const haveRails = split !== null || till !== null;
  const railTotal = railBase + railPolygon + railSolana;
  const overshoot = railTotal > organicSettlements;
  const stats: StoreStats = {
    operating_since: OPERATING_SINCE,
    settled_purchases_total:
      organic + house + FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    organic_settlements: organicSettlements,
    house_settlements: house + reclassified,
    reclassified_house: reclassified,
    pre_meter_settlements: FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    artifacts_issued: artifactsIssued,
    ...(haveRails && railTotal > 0 && !overshoot
      ? {
          organic_by_rail: {
            base: railBase,
            polygon: railPolygon,
            solana: railSolana,
            rail_not_recorded: organicSettlements - railTotal,
            computed_at: split?.computed_at ?? new Date().toISOString(),
          },
        }
      : {}),
    computed_at: new Date().toISOString(),
  };
  return {
    stats,
    rail_overshoot: overshoot
      ? { rail_total: railTotal, organic: organicSettlements }
      : null,
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
    ...(stats.organic_by_rail ? [railSentence(stats.organic_by_rail)] : []),
    `Every number here is computed live from ${base}/stats; every artifact ever issued (${stats.artifacts_issued}, free shelf included) verifies at ${base}/api/verify/{id}.`,
  ].join(" ");
}

/** The rail split as one sentence, remainder named. Machine surfaces. */
function railSentence(rail: NonNullable<StoreStats["organic_by_rail"]>): string {
  const tail =
    rail.rail_not_recorded > 0
      ? ` and ${rail.rail_not_recorded} settled before this store recorded the rail at the till, on a page that mints no certificate to carry one — a closed set that nothing can join`
      : "";
  const polygon = rail.polygon > 0 ? `, ${rail.polygon} in USDC on Polygon` : "";
  return `Of the organic figure, ${rail.base} settled in USDC on Base${polygon}, ${rail.solana} in USDC on Solana${tail}.`;
}

/**
 * THE SAME BOOKS, AT THE LENGTH A SHOPFRONT CAN CARRY.
 *
 * The front of the store used to print trackRecordLine whole: four
 * sentences, six figures, two URLs and the house-flagging policy, set
 * in 0.72rem grey under the neon. It is the right paragraph — for
 * /stats, for the skill, for the catalog, where a reader arrived
 * wanting the ledger. On the storefront it was a wall of small type
 * between the sign and the shelves, and the keeper read it the way
 * everybody else did: not at all.
 *
 * So the shopfront gets the one number that is the claim — organic
 * sales, the figure this whole store is built to earn — split by the
 * rail the money came in on, and the paragraph stays one click away.
 * Same source, same instant, no second copy to drift: this function
 * takes the same StoreStats the long line does.
 */
export function storefrontLedgerLine(stats: StoreStats): string {
  const sales = `${stats.organic_settlements} organic ${stats.organic_settlements === 1 ? "sale" : "sales"}`;
  const rail = stats.organic_by_rail;
  if (!rail || rail.base + rail.solana === 0) {
    return `${sales}, from wallets we don't control.`;
  }
  /**
   * "unattributed" was the first word here and it was the wrong one on
   * a shopfront: beside a page that says it takes two chains, it reads
   * as a third chain we can't name, or as money we lost track of. It
   * was neither — it was a penny page sold before the till wrote the
   * rail down. The count says what happened to the RECORD, not to the
   * money, and it cannot grow.
   */
  const parts = [
    ...(rail.base > 0 ? [`${rail.base} on Base`] : []),
    ...(rail.solana > 0 ? [`${rail.solana} on Solana`] : []),
    ...(rail.rail_not_recorded > 0
      ? [`${rail.rail_not_recorded} from before we logged the rail`]
      : []),
  ];
  return `${sales} — ${parts.join(", ")}.`;
}
