import { readMonthLedger } from "@/lib/metrics";
import { HOUSE_FLAG_POLICY, monthsSinceOpening } from "@/services/stats";
import type { Env } from "@/types";

/**
 * THE PULSE — the whole funnel, organic only, in public.
 *
 * The store has been computing organic-against-house challenges,
 * settles and verifies since the meter went in, and publishing exactly
 * one number from it: the settled total. That is the win with the
 * denominator left off, which is the shape of every startup metric
 * anybody has learned to distrust.
 *
 * A competitor publishes their own full funnel — probes, paid
 * transactions, revenue to the cent — and it reads as credible for a
 * reason worth being precise about: it is not that the numbers are
 * good, because they are not. It is that the SHAPE IS WHOLE. A
 * conversion rate of five in eight hundred is a fact you can check
 * against your own experience of the market; "five sales" is a
 * sentence with the interesting part removed.
 *
 * SO THE DENOMINATOR MAKES OUR ZERO STRONGER, NOT WEAKER, and this is
 * the whole argument for the endpoint: "organic settlements: 0" reads
 * as either a young store or a broken one, and there is no way to tell
 * which from the outside. "N agents were offered a price and none of
 * them paid" is a specific, falsifiable claim about a specific market
 * at a specific moment, which is a far more useful thing to hand
 * somebody than a zero on its own.
 *
 * NEW SHAPE, NOT NEW INSTRUMENTATION. Nothing here is collected for
 * this endpoint; it is a public reading of counters the office has
 * been keeping all along. That matters for trust in a way worth
 * stating: we cannot have tuned the collection to flatter the
 * publication, because the collection predates it.
 *
 * WHAT IT DELIBERATELY CANNOT SAY: no user-agents, no referrers, no
 * wallet addresses, no per-visitor rows, no raw events. Aggregate
 * counts only. The store already refuses to keep IPs or cookies; a
 * public funnel is exactly the surface where that discipline would be
 * easiest to quietly break, so a test walks the response for anything
 * that looks like a person.
 */

/** Trailing window. Older months stay in the office, not in public. */
export const PULSE_MONTHS = 6;

export interface PulseWindow {
  /** ISO month, or "all_time" on the rollup. */
  month?: string;
  /** 402s offered to organic traffic. The denominator. */
  organic_challenges: number;
  /** Payments that settled from organic traffic. */
  organic_settled: number;
  /** Free re-verifications of artifacts, organic only. */
  organic_verifies: number;
  /**
   * settled / challenges, three decimals. NULL when nothing was ever
   * offered — a rate with a zero denominator is not zero, it is
   * undefined, and printing 0 there would be a claim we cannot make.
   */
  conversion_rate: number | null;
}

export interface Pulse {
  computed_at: string;
  house_flag_policy: string;
  all_time: PulseWindow;
  /** Newest first. */
  months: PulseWindow[];
  note: string;
  /** Tier 3: how to check the artifacts these numbers count. */
  verify_url: string;
  signing_key: string;
}

const NOTE =
  "The whole funnel, not the flattering end of it. Organic only: house traffic is the proprietors' own wallets and tests, flagged at the till and excluded here exactly as it is excluded from /stats. A conversion rate of null means nobody has been offered a price yet in that window, which is different from nobody paying. These are counts and nothing else — no user-agents, no referrers, no wallet addresses, no per-visitor rows — and the counters they read predate this endpoint, so the collection cannot have been tuned to flatter the publication. Every settlement counted here minted a signed artifact you can verify yourself without asking us.";

function rate(settled: number, challenges: number): number | null {
  if (challenges <= 0) {
    return null;
  }
  return Math.round((settled / challenges) * 1000) / 1000;
}

export async function computePulse(env: Env): Promise<Pulse> {
  const months = monthsSinceOpening().slice(-PULSE_MONTHS).reverse();
  const windows: PulseWindow[] = [];

  for (const month of months) {
    const ledger = await readMonthLedger(env, month);
    const rows = Object.values(ledger.items);
    /**
     * Only the organic columns are read. The house counters live in
     * separate keys (paidh/402h/verifyh) and are never summed in — the
     * exclusion is structural rather than a filter that could be
     * forgotten.
     */
    const challenges = rows.reduce((sum, row) => sum + row.challenges, 0);
    const settled = rows.reduce((sum, row) => sum + row.settled, 0);
    const verifies = rows.reduce((sum, row) => sum + row.verifies, 0);
    windows.push({
      month,
      organic_challenges: challenges,
      organic_settled: settled,
      organic_verifies: verifies,
      conversion_rate: rate(settled, challenges),
    });
  }

  const total = windows.reduce(
    (acc, window) => ({
      challenges: acc.challenges + window.organic_challenges,
      settled: acc.settled + window.organic_settled,
      verifies: acc.verifies + window.organic_verifies,
    }),
    { challenges: 0, settled: 0, verifies: 0 },
  );

  const base = env.STORE_BASE_URL;
  return {
    computed_at: new Date().toISOString(),
    house_flag_policy: HOUSE_FLAG_POLICY,
    all_time: {
      organic_challenges: total.challenges,
      organic_settled: total.settled,
      organic_verifies: total.verifies,
      conversion_rate: rate(total.settled, total.challenges),
    },
    months: windows,
    note: NOTE,
    verify_url: `${base}/api/verify/{id}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
  };
}
