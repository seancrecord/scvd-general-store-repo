import { readMonthLedger } from "@/lib/metrics";
import { HOUSE_FLAG_POLICY, monthsSinceOpening } from "@/services/stats";
import type { Env } from "@/types";
import { readCorrections } from "@/services/reclassify";

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
   * settled / challenges. NULL when nothing was ever offered — a rate
   * with a zero denominator is undefined, not zero, and printing 0
   * there would be a claim we cannot make. Zero means offered and
   * nobody paid. Anything above zero keeps enough significant figures
   * to survive: see rate() for why that sentence had to be written.
   */
  conversion_rate: number | null;
  /**
   * KNOWN MACHINERY INSIDE organic_challenges, from re-reading the raw
   * rows with today's crawler table.
   *
   * PUBLISHED BESIDE THE RECORDED FIGURE RATHER THAN SUBTRACTED FROM
   * IT. A number that silently changed is a number nobody can check,
   * and the whole argument of this page is that ours can be. So the
   * recorded column stays exactly what the counters say, and the
   * correction sits next to it with the method named.
   *
   * Absent when no walk has run for that month yet, or when the walk
   * did not finish — a partial correction is not published as a
   * correction, because that is how a window gets mistaken for a
   * month, which is the error this whole mechanism exists to avoid.
   */
  known_machinery?: number;
  /** organic_challenges − known_machinery, when the walk is complete. */
  corrected_challenges?: number;
  /** settled / corrected_challenges. Same three states as above. */
  corrected_conversion_rate?: number | null;
  /**
   * THE USER-AGENTS BEHIND THE CORRECTION ARE DELIBERATELY NOT HERE.
   * This endpoint's own note promises no user-agents, and the first
   * draft of this field published them — narrowing a standing privacy
   * promise to fit a new feature, which is backwards. The count and
   * the method are public; the named clients stay in the office, on
   * /admin/recount, where the same walk lists them.
   */
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

/**
 * NEVER ROUND A REAL RATE TO ZERO.
 *
 * This rounded to three decimals, which annihilates anything below
 * 0.0005 — and one sale against several thousand challenges is
 * exactly that. 1/7892 is 0.000127 and was being published as 0,
 * while organic_settled on the same row said 1. The page rendered
 * "0.0%" beside "1 settled".
 *
 * That is not a display nit. This endpoint's own copy promises: "we
 * will not print 0% for it, because 0% would say agents were offered
 * something and declined." A zero here says nobody paid, on a window
 * where somebody did — the store printing the one number it wrote a
 * paragraph swearing it would never print.
 *
 * Three states, kept apart on purpose, because collapsing any two of
 * them is how this page starts lying:
 *   null  nobody was offered a price — undefined, not zero
 *   0     offered, and none of them paid — a real zero
 *   >0    somebody paid, at whatever precision that takes
 */
function rate(settled: number, challenges: number): number | null {
  if (challenges <= 0) {
    return null;
  }
  if (settled === 0) {
    return 0;
  }
  // Significant figures rather than decimal places: a small rate keeps
  // its resolution instead of being rounded out of existence.
  return Number((settled / challenges).toPrecision(3));
}

export async function computePulse(env: Env): Promise<Pulse> {
  const months = monthsSinceOpening().slice(-PULSE_MONTHS).reverse();
  const windows: PulseWindow[] = [];
  // One read for the whole window, not one per month inside the loop.
  const corrections = await readCorrections(env).catch(() => null);

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
    /**
     * The standing correction, computed on the clock over every row of
     * the month rather than here over a window. Only a COMPLETE walk is
     * published: a partial one would be a window figure again, wearing
     * a correction's authority.
     */
    const correction = corrections?.months[month];
    const machinery =
      correction?.complete === true
        ? correction.moved_to_infrastructure
        : undefined;
    windows.push({
      month,
      organic_challenges: challenges,
      organic_settled: settled,
      organic_verifies: verifies,
      conversion_rate: rate(settled, challenges),
      ...(machinery !== undefined
        ? {
            known_machinery: machinery,
            // Never below zero: the counter and the rows are different
            // instruments and lost increments can put the row count
            // above the counter, which is a real and expected
            // direction rather than a reason to print a negative.
            corrected_challenges: Math.max(0, challenges - machinery),
            // The same rate against the denominator with the machinery
            // taken out. Published beside the recorded one rather than
            // replacing it: both are real, and which one a reader wants
            // depends on the question they came with.
            corrected_conversion_rate: rate(
              settled,
              Math.max(0, challenges - machinery),
            ),
          }
        : {}),
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
      /**
       * ALL OR NOTHING, and this is the whole lesson of the recount
       * bug in one condition. Summing the corrections that happen to
       * exist would produce an all-time figure corrected over SOME of
       * its months and not others — a window total wearing a lifetime
       * label, which is precisely the mistake that had a page calling
       * a healthy counter a bug. If any month in the window lacks a
       * complete walk, the rollup carries no correction at all and
       * says nothing rather than something shaped like an answer.
       */
      ...(windows.length > 0 &&
      windows.every((window) => window.known_machinery !== undefined)
        ? {
            known_machinery: windows.reduce(
              (sum, window) => sum + (window.known_machinery ?? 0),
              0,
            ),
            corrected_challenges: windows.reduce(
              (sum, window) => sum + (window.corrected_challenges ?? 0),
              0,
            ),
          }
        : {}),
    },
    months: windows,
    note: NOTE,
    verify_url: `${base}/api/verify/{id}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
  };
}
