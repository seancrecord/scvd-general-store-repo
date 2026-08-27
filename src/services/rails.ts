import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { monthsSinceOpening, railOf } from "@/lib/metrics";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * WHICH CHAIN THE MONEY CAME IN ON — three records, no sale counted
 * twice, and the one gap that remains named rather than guessed at.
 *
 * THE TILL IS THE RECORD, from the moment it started keeping one.
 * recordSettlement writes the rail beside the sale, and it is the same
 * call that produces the organic count, so a sale that has one has the
 * other. Penny pages — the Almanac, the Gazette's issues, the zodiac
 * archive — take real money and mint no certificate; they are exactly
 * why this cannot be read off certificates, and exactly what the till
 * catches for free.
 *
 * CERTIFICATES ARE THE RECORD FOR EVERYTHING BEFORE IT, for sales that
 * minted one. The walk stops at KV_KEYS.railMeterStart, the instant the
 * till took over, so no sale is counted on both sides of the seam.
 *
 * AND THE STORE'S OWN CONFIGURATION IS THE RECORD FOR THE REST. This is
 * the keeper's argument and it is a better one than either ledger: for
 * the store's first two weeks there was no second rail to arrive on.
 * The Solana door was built on 2026-08-04 (commit c45c6b1, the flag and
 * the register; PAYMENT_RAILS.md Part B records the same day's
 * registration run). Before it, acceptedNetworks() returned exactly one
 * network, because SOLANA_NETWORK did not exist in the source. So a
 * sale settled before that date did not PROBABLY settle on Base — Base
 * was the only thing this store was capable of accepting. That is a
 * deduction from what the code could do, not an inference about a
 * wallet, and it needs no block explorer to confirm.
 *
 * WHAT IS LEFT UNPLACED after all three: a sale from the window between
 * the second rail opening and the till learning to write rails down,
 * that also minted no certificate. Small, closed, and shrinking to
 * nothing on its own as the till covers everything from here.
 *
 * WHY THE CERT SIDE IS A SNAPSHOT. It walks every certificate in the
 * drawer. The storefront is a page a crawler hits for free; it gets one
 * KV read of a snapshot the cron writes. The till counters are cheap
 * counters and are read live.
 */

/**
 * THE DAY THIS STORE COULD FIRST TAKE ANYTHING BUT BASE.
 *
 * Load-bearing: everything organic settled before it is Base by
 * necessity, and that is how the books place sales no ledger recorded a
 * rail for. Evidence, so the next reader does not have to take it on
 * faith — `git show c45c6b1` (2026-08-04, "The Solana rail, built
 * behind its flag"), and PAYMENT_RAILS.md's registration run the same
 * day. Before that commit `acceptedNetworks()` could only return Base.
 *
 * If a third rail ever opens, this constant does NOT move. It marks
 * when the store stopped being single-rail, which happened once.
 */
export const SECOND_RAIL_OPENED = "2026-08-04";

/**
 * The single-rail window at MONTH grain — the only grain the paid
 * counters can express. True for a date (or a bare "YYYY-MM" month)
 * whose whole month ended before the month the second rail opened in.
 *
 * THE 2026-08-13 MISCOUNT LIVED IN A WINDOW MISMATCH: the cert walk
 * credited placed_before_second_rail for sales dated Aug 1–3 — before
 * the second rail OPENED, but inside the rail month, which the counter
 * side (monthsBeforeSecondRail) never counts. Subtracting August
 * placements from a July-only total swallowed the July 30 penny page,
 * which mints no certificate and had nothing else to place it — and
 * the front of the store said "1 from before we logged the rail"
 * about a sale that settled when Base was the only door this store
 * had. Both sides now ask this one function, so their windows cannot
 * drift apart again.
 */
export function inSingleRailWindow(dateOrMonth: string): boolean {
  return dateOrMonth.slice(0, 7) < SECOND_RAIL_OPENED.slice(0, 7);
}

export interface RailSplit {
  /** Pre-seam, certificate-backed: settled on an eip155 (Base) network. */
  base: number;
  /** Pre-seam, certificate-backed: settled on Polygon (eip155:137).
   * Structurally zero before 2026-08-20 — the rail did not exist —
   * and absent from snapshots stored before the field was born, which
   * read as zero rather than invalid. */
  polygon?: number;
  /** Pre-seam, certificate-backed: settled on a Solana network. */
  solana: number;
  /** Pre-seam, certificate-backed, network unrecognised. */
  unknown: number;
  /**
   * Certificate-backed organic sales dated in the SINGLE-RAIL MONTHS —
   * the same month-grain window the counter side uses, and it must be:
   * this figure exists only to be subtracted from that counter.
   * Subtracting a sale the counter never counted (an Aug 1–3 cert
   * sale, say — before the second rail opened, but inside its month)
   * un-places a July sale that had nothing else to place it. That
   * exact miscount shipped and is told at inSingleRailWindow.
   */
  placed_before_second_rail: number;
  /** True when the cert scan hit its cap: the split is a floor, not a total. */
  truncated: boolean;
  /** The seam this walk stopped at, carried so the snapshot explains itself. */
  meter_start?: string;
  computed_at: string;
}

export interface RailCounts {
  base: number;
  polygon: number;
  solana: number;
  other: number;
}

/**
 * Walks the certificates once, tallying both windows in the same pass:
 * the rails up to the seam, and how many pre-second-rail sales the
 * certificates already account for. Cron work, never a page render.
 */
export async function computeRailSplit(env: Env): Promise<RailSplit> {
  const meterStart =
    (await env.COUNTERS.get(KV_KEYS.railMeterStart)) ?? undefined;
  const { taxRows } = await import("@/services/tax-export");
  const { rows, truncated } = await taxRows(env);
  const split = {
    base: 0,
    polygon: 0,
    solana: 0,
    unknown: 0,
    placed_before_second_rail: 0,
  };
  for (const row of rows) {
    // Sales only (a refund is its own row), and family doesn't make the
    // paper — the same organic test the take applies.
    if (row.row_type !== "sale" || row.house_flagged === "house") {
      continue;
    }
    if (inSingleRailWindow(row.date)) {
      split.placed_before_second_rail += 1;
    }
    if (meterStart && row.date >= meterStart) {
      continue; // The till counted this one. Counting it here would double it.
    }
    const rail = railOf(row.network);
    if (rail === "base") {
      split.base += 1;
    } else if (rail === "polygon") {
      split.polygon += 1;
    } else if (rail === "solana") {
      split.solana += 1;
    } else {
      split.unknown += 1;
    }
  }
  return {
    ...split,
    truncated,
    ...(meterStart ? { meter_start: meterStart } : {}),
    computed_at: new Date().toISOString(),
  };
}

export async function refreshRailSplit(env: Env): Promise<RailSplit> {
  const split = await computeRailSplit(env);
  await kvPut(env.COUNTERS, KV_KEYS.railSplit, JSON.stringify(split));
  return split;
}

/** The snapshot, or null. Null renders as no split at all, never as zeroes. */
export async function readRailSplit(env: Env): Promise<RailSplit | null> {
  const stored = await env.COUNTERS.get<RailSplit>(KV_KEYS.railSplit, "json");
  if (
    !stored ||
    typeof stored.base !== "number" ||
    typeof stored.solana !== "number"
  ) {
    return null;
  }
  return stored;
}

/**
 * The till's own rails, organic only, all months. Same scan shape as the
 * paid counters in computeStats — `rail:` is organic, `railh:` is house,
 * and house never reaches a public figure.
 */
export async function readRailCounters(env: Env): Promise<RailCounts> {
  const counts: RailCounts = { base: 0, polygon: 0, solana: 0, other: 0 };
  // One wave over the months, not a queue — the loop bound here is the
  // CALENDAR, so a serial read gets one round trip slower every month
  // with no commit for anybody to notice. Rule 50.
  const perMonth = await Promise.all(
    monthsSinceOpening().map(async (month) => {
      const listed = await listKeys(env.COUNTERS, {
        prefix: `metric:${month}:rail`,
        cap: 100,
      });
      return {
        month,
        listed,
        values: await bulkGetText(env.COUNTERS, listed.names),
      };
    }),
  );
  for (const { listed, values } of perMonth) {
    for (const name of listed.names) {
      if (name.includes(":railh:")) {
        continue; // Family doesn't make the paper.
      }
      const rail = name.slice(name.lastIndexOf(":") + 1);
      const value = parseInt(values.get(name) ?? "", 10);
      if (!Number.isFinite(value)) {
        continue;
      }
      if (
        rail === "base" ||
        rail === "polygon" ||
        rail === "solana" ||
        rail === "other"
      ) {
        counts[rail] += value;
      }
    }
  }
  return counts;
}

/**
 * Months that ended before the second rail opened. Every organic settle
 * counted in one of them was Base, whatever else we did or didn't write
 * down about it.
 *
 * Deliberately conservative at the boundary: the month the rail opened
 * is NOT included, even though its first three days were also
 * single-rail, because the paid counters are monthly and cannot be cut
 * finer without reaching for the event rows — which expire at ninety
 * days and would quietly un-place a sale months later. Under-claiming
 * survives; a number that changes its mind does not.
 */
export function monthsBeforeSecondRail(): string[] {
  return monthsSinceOpening().filter((month) => inSingleRailWindow(month));
}


/** One month's organic till counts, for the public /rails chart. */
export interface RailMonth {
  month: string;
  base: number;
  polygon: number;
  solana: number;
  other: number;
  /**
   * Set when the month's key scan hit its cap before the listing
   * completed — the row may undercount, and it says so. Cannot fire
   * today (four rail buckets exist per month against a cap of 100),
   * but "truncation must be visible" is the house pattern everywhere
   * else a listing is capped, and this was the one scan that dropped
   * the flag on the floor. CV's batch-4 note, 2026-08-21.
   */
  truncated?: true;
}

/**
 * The till's rails BY MONTH, organic only — the /rails chart's data.
 * Same counter scan as readRailCounters, kept separate because the
 * aggregate reader's callers want one number and a chart wants the
 * shape of time. Months with no settles at all are omitted; a chart
 * of leading zeroes would just push the story off the right edge.
 */
export async function readRailCountersByMonth(env: Env): Promise<RailMonth[]> {
  const months: RailMonth[] = [];
  // Same wave as readRailCounters. Promise.all preserves order, so the
  // rows still come back oldest-first without sorting them again.
  const reads = await Promise.all(
    monthsSinceOpening().map(async (month) => {
      const listed = await listKeys(env.COUNTERS, {
        prefix: `metric:${month}:rail`,
        cap: 100,
      });
      return {
        month,
        listed,
        values: await bulkGetText(env.COUNTERS, listed.names),
      };
    }),
  );
  for (const { month, listed, values } of reads) {
    const row: RailMonth = { month, base: 0, polygon: 0, solana: 0, other: 0 };
    if (listed.truncated) {
      row.truncated = true;
    }
    for (const name of listed.names) {
      if (name.includes(":railh:")) {
        continue; // Family doesn't make the paper.
      }
      const rail = name.slice(name.lastIndexOf(":") + 1);
      const value = parseInt(values.get(name) ?? "", 10);
      if (!Number.isFinite(value)) {
        continue;
      }
      if (
        rail === "base" ||
        rail === "polygon" ||
        rail === "solana" ||
        rail === "other"
      ) {
        row[rail] += value;
      }
    }
    // A truncated month rides even at zero: its zeros are suspect,
    // and omitting it would hide exactly the row that needs the flag.
    if (row.truncated || row.base + row.polygon + row.solana + row.other > 0) {
      months.push(row);
    }
  }
  return months;
}
