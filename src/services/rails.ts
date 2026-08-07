import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { monthsSinceOpening, railOf } from "@/lib/metrics";
import type { Env } from "@/types";

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

export interface RailSplit {
  /** Pre-seam, certificate-backed: settled on an eip155 (Base) network. */
  base: number;
  /** Pre-seam, certificate-backed: settled on a Solana network. */
  solana: number;
  /** Pre-seam, certificate-backed, network unrecognised. */
  unknown: number;
  /**
   * Certificate-backed organic sales dated before the second rail
   * opened. Subtracted from the counters' own pre-rail total to find
   * how many single-rail sales NOTHING recorded a rail for — every one
   * of which was Base, because nothing else was accepted yet.
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
    if (row.date < SECOND_RAIL_OPENED) {
      split.placed_before_second_rail += 1;
    }
    if (meterStart && row.date >= meterStart) {
      continue; // The till counted this one. Counting it here would double it.
    }
    const rail = railOf(row.network);
    if (rail === "base") {
      split.base += 1;
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
  await env.COUNTERS.put(KV_KEYS.railSplit, JSON.stringify(split));
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
  const counts: RailCounts = { base: 0, solana: 0, other: 0 };
  for (const month of monthsSinceOpening()) {
    const listed = await listKeys(env.COUNTERS, {
      prefix: `metric:${month}:rail`,
      cap: 100,
    });
    const values = await bulkGetText(env.COUNTERS, listed.names);
    for (const name of listed.names) {
      if (name.includes(":railh:")) {
        continue; // Family doesn't make the paper.
      }
      const rail = name.slice(name.lastIndexOf(":") + 1);
      const value = parseInt(values.get(name) ?? "", 10);
      if (!Number.isFinite(value)) {
        continue;
      }
      if (rail === "base" || rail === "solana" || rail === "other") {
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
  const railMonth = SECOND_RAIL_OPENED.slice(0, 7);
  return monthsSinceOpening().filter((month) => month < railMonth);
}
