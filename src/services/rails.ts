import { bulkGetText } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { monthsSinceOpening } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * WHICH CHAIN THE MONEY CAME IN ON — two records, one seam, no sale
 * counted twice and none counted on neither side.
 *
 * THE TILL IS THE RECORD, from the moment it started keeping one.
 * recordSettlement writes the rail beside the sale, and it is the same
 * call that produces the organic count, so a sale that has one has the
 * other. Penny pages — the Almanac, the Gazette's issues, the zodiac
 * archive — take real money and mint no certificate; they are exactly
 * why this cannot be read off certificates, and exactly what the till
 * catches for free.
 *
 * CERTIFICATES ARE THE RECORD FOR EVERYTHING BEFORE IT. The store sold
 * for weeks before the meter existed, and a certificate carries the
 * network it settled on, so the history is recoverable — for sales
 * that minted one. The walk stops at KV_KEYS.railMeterStart, the
 * instant the till took over, so no sale is counted on both sides.
 *
 * WHAT STAYS UNPLACEABLE, and it is a closed set: a penny page sold
 * BEFORE the meter started. No certificate, no till row, and nothing
 * else ever wrote the rail down. That number can never grow — the till
 * catches every sale now — and it is published as what it is rather
 * than hidden, or worse, guessed at.
 *
 * WHY THE CERT SIDE IS A SNAPSHOT. It walks every certificate in the
 * drawer. The storefront is a page a crawler hits for free; it gets
 * one KV read of a snapshot the cron writes. The till counters are
 * cheap counters and are read live.
 */

export interface RailSplit {
  /** Pre-meter, certificate-backed: settled on an eip155 (Base) network. */
  base: number;
  /** Pre-meter, certificate-backed: settled on a Solana network. */
  solana: number;
  /** Pre-meter, certificate-backed, network unrecognised. */
  unknown: number;
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

/** Walks the certificates, up to the seam. Cron work, never a page render. */
export async function computeRailSplit(env: Env): Promise<RailSplit> {
  const meterStart = (await env.COUNTERS.get(KV_KEYS.railMeterStart)) ?? undefined;
  const { takeSummary } = await import("@/services/books-summary");
  const summary = await takeSummary(env, meterStart ? { before: meterStart } : undefined);
  return {
    base: summary.rails.base.sales,
    solana: summary.rails.solana.sales,
    unknown: summary.rails.unknown.sales,
    truncated: summary.truncated,
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
