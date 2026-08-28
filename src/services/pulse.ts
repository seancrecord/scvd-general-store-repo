import {
  LATENCY_BUCKET_EDGES_MS,
  readLatencyHistograms,
  readMonthLedger,
} from "@/lib/metrics";
import { HOUSE_FLAG_POLICY, monthsSinceOpening } from "@/services/stats";
import type { Env } from "@/types";
import {
  monthReclassAdjustments,
  readCorrections,
  totalReclassified,
} from "@/services/reclassify";

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
  /**
   * THE FUNNEL'S MIDDLE (#53), and it is a DERIVATION rather than a
   * meter: the till books every payment actually presented as exactly
   * one of settled or declined, so this is their sum and cannot drift
   * from the two numbers beside it. Five outside reports in a row
   * had read organic_verifies as this step — the field name read
   * like the protocol step — and the honest answer was to publish
   * the real middle, from counters that already existed, with zero
   * new writes on the paid path.
   */
  organic_payments_presented: number;
  /**
   * Payments that settled from organic traffic, WITH THE HOUSE
   * RECLASSIFICATION ALREADY TAKEN OUT — the same arithmetic /stats
   * does, from the same ledger.
   *
   * WHY THIS ONE IS SUBTRACTED WHEN known_machinery IS NOT. The
   * crawler correction below is an ESTIMATE published beside the
   * recorded figure so a reader can check our working. A
   * reclassification is not an estimate: it is a decision the books
   * already made and already apply, and /stats has been serving
   * `organic − reclassified` since it was built. Publishing the raw
   * column here made two public surfaces disagree about the word
   * "organic" — /pulse said 33 while /stats and /rails said 14 — and
   * the 19 between them were this store's own subagent tests. Being
   * out of step with the ledger is not an editorial choice, it is a
   * stale read, and the flattering direction of the error is exactly
   * why it had to be the one we went and fixed.
   */
  organic_settled: number;
  /**
   * Settles this month that were later reclassified from organic to
   * house, already removed from organic_settled above. Published so
   * the subtraction can be checked rather than taken on trust.
   */
  misbooked_house?: number;
  /**
   * ROLLUP ONLY. True when the per-month split of the reclassification
   * could not be reconciled against its exact lifetime total, so the
   * months will not sum to all_time.organic_settled. The rollup is
   * still exact — it subtracts the frozen total, which cannot
   * truncate — but the reader is owed the fact that the split under
   * it is partial rather than left to discover it by adding up.
   */
  reclass_split_incomplete?: boolean;
  /**
   * Payments presented and refused, organic only. Each attempt counts
   * once — a buyer bouncing three times off the same wall is three
   * refusals, which is what their ledger records too.
   */
  organic_declines: number;
  /**
   * Free re-checks of ALREADY-ISSUED artifacts at /api/verify,
   * organic only. RENAMED from organic_verifies (2026-08-27): that
   * name read like the x402 verify step and four frontier models in
   * a row built a false funnel out of it. This is a different event
   * at a different time by different callers, and now says so.
   */
  organic_rechecks: number;
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

export interface LatencyRoute {
  /** Timings recorded for this route class this month. A FLOOR — see note. */
  samples: number;
  /** Bucket label -> count, exactly as stored. The raw histogram. */
  buckets: Record<string, number>;
  /**
   * The interval the median falls in, in milliseconds: [at least, under].
   * A null upper bound means the bucket is open-ended (over the last edge).
   *
   * A RANGE, NOT A NUMBER, and this is the point of the whole block. A
   * histogram can tell you which interval a percentile lands in; it
   * cannot tell you the percentile. Every latency figure in this market
   * is quoted as a single number with no method beside it. The honest
   * form is wider and less flattering, and a reader can check it.
   */
  p50_ms_range: [number, number | null] | null;
  /** Same shape at the 95th percentile — the tail that loses buyers. */
  p95_ms_range: [number, number | null] | null;
}

export interface Latency {
  what_this_is: string;
  method: string;
  /** The independent monitor the method text points at. Never ours. */
  external_monitor: string;
  /** The histogram's resolution, published so the ranges can be read. */
  bucket_edges_ms: number[];
  /** Route class -> histogram. */
  routes: Record<string, LatencyRoute>;
  /** True when the key scan hit its cap; the figures are then partial. */
  truncated: boolean;
}

export interface Pulse {
  computed_at: string;
  house_flag_policy: string;
  all_time: PulseWindow;
  /** Newest first. */
  months: PulseWindow[];
  note: string;
  /** Roadmap 0.12: what our own clock saw, with its denominators. */
  latency: Latency;
  /** Tier 3: how to check the artifacts these numbers count. */
  verify_url: string;
  signing_key: string;
}


/**
 * THE READING THAT OWES US NO FAVOURS (roadmap 0.12, second half).
 * Keeper stood the monitor up 2026-08-26 — the day two people
 * reported the site down and the store had only its own clock to
 * answer with. External, independently operated, checked from
 * outside our network. If this URL ever changes, the pin test fails
 * by name and the new address gets published deliberately.
 */
export const EXTERNAL_MONITOR_URL =
  "https://stats.uptimerobot.com/VuHaG1k2c5";

const LATENCY_WHAT =
  "How long this store's own server took to produce a 402 challenge, in buckets. SERVER-SIDE ONLY: the clock starts when the payment gate is entered and stops when the challenge is ready, so it excludes DNS, TLS, network transit and everything the buyer's own client does. A reader measuring from outside will always see a larger number than this, and the difference is the network, not us.";

const LATENCY_METHOD =
  "One counter per route class per bucket per month, bumped after the response is sent so the instrument never slows the thing it measures. Percentiles are published as the INTERVAL they fall in rather than as a point value, because that is all a histogram can honestly support. THE SAMPLE COUNT IS A FLOOR, NOT A CENSUS: the counters are read-modify-write against Workers KV, which is last-write-wins with no compare-and-swap, so two requests landing in the same bucket in the same instant can record as one. That biases the count down and never up. House and infrastructure traffic are counted here, unlike everywhere else in this document, because latency is a fact about our own server doing work and our own probes run the same code a stranger does — excluding them would shrink the sample without making it truer. This is the store timing itself, which is exactly the reading nobody should take on trust: the external monitor linked from this store is the one that owes you no favours.";

/**
 * The interval a percentile falls in, read off the cumulative counts.
 *
 * Returns [lowerEdge, upperEdge], upper null when the sample landed in
 * the open-ended bucket past the last edge. Null when there is nothing
 * to read — an empty histogram has no median, and printing 0 there
 * would be a claim rather than an absence.
 */
function percentileRange(
  buckets: Record<string, number>,
  fraction: number,
): [number, number | null] | null {
  const labels = [
    ...LATENCY_BUCKET_EDGES_MS.map(
      (edge) => `u${String(edge).padStart(5, "0")}`,
    ),
    "over",
  ];
  const total = labels.reduce((sum, label) => sum + (buckets[label] ?? 0), 0);
  if (total === 0) return null;
  // Ceiling, so p50 of a two-sample set names the bucket holding the
  // upper of the two rather than rounding a median off the bottom.
  const target = Math.ceil(total * fraction);
  let seen = 0;
  for (let i = 0; i < labels.length; i += 1) {
    seen += buckets[labels[i]!] ?? 0;
    if (seen >= target) {
      const lower = i === 0 ? 0 : LATENCY_BUCKET_EDGES_MS[i - 1]!;
      const upper =
        i < LATENCY_BUCKET_EDGES_MS.length
          ? LATENCY_BUCKET_EDGES_MS[i]!
          : null;
      return [lower, upper];
    }
  }
  return null;
}

async function computeLatency(env: Env): Promise<Latency> {
  const { histograms, truncated } = await readLatencyHistograms(env).catch(
    () => ({ histograms: {}, truncated: false }),
  );
  const routes: Record<string, LatencyRoute> = {};
  for (const [routeClass, buckets] of Object.entries(histograms)) {
    const samples = Object.values(buckets).reduce((sum, n) => sum + n, 0);
    routes[routeClass] = {
      samples,
      buckets,
      p50_ms_range: percentileRange(buckets, 0.5),
      p95_ms_range: percentileRange(buckets, 0.95),
    };
  }
  return {
    what_this_is: LATENCY_WHAT,
    method: LATENCY_METHOD,
    external_monitor: EXTERNAL_MONITOR_URL,
    bucket_edges_ms: [...LATENCY_BUCKET_EDGES_MS],
    routes,
    truncated,
  };
}

const NOTE =
  "The whole funnel, not the flattering end of it. Organic only: house traffic is the proprietors' own wallets and tests, flagged at the till and excluded here exactly as it is excluded from /stats. A conversion rate of null means nobody has been offered a price yet in that window, which is different from nobody paying. These are counts and nothing else — no user-agents, no referrers, no wallet addresses, no per-visitor rows — and the counters they read predate this endpoint, so the collection cannot have been tuned to flatter the publication. Every settlement counted here is EXPECTED to have minted a signed artifact you can verify yourself without asking us — and that is a claim with an instrument behind it rather than an assurance. The settlement counter is bumped before the handler that mints, so a sale that settled and then failed to deliver would be counted here with nothing to show for it. Two checks look for exactly that: a delivery audit that flags a settled sale whose goods never went out, and an hourly walk of USDC arriving on Base against the certificates minted, which is independent of every write this store makes. If either ever finds one, it goes on /corrections with a date, like everything else. Settles later reclassified from organic to house are subtracted here, exactly as /stats subtracts them, and the amount taken out is published beside the figure as misbooked_house rather than left implicit. WHAT THAT CORRECTION DOES NOT REACH, said plainly because it inflates the denominator's opposite: the reclassification ledger freezes a SETTLE count per wallet and nothing else, so the challenges, declines and re-checks those same wallets generated are still counted organic here. organic_challenges, organic_declines and organic_rechecks are therefore ceilings, and the conversion rate computed from them is a floor. THE FUNNEL'S MIDDLE IS DERIVED, NOT SEPARATELY METERED: the till books every payment actually presented as exactly one of settled or declined, so organic_payments_presented is their sum and cannot drift from the two numbers published beside it. And a naming correction, dated 2026-08-27: the field once called organic_verifies is now organic_rechecks, because it counts free re-checks of already-issued artifacts at /api/verify — NOT the x402 verify step — and the old name kept being read as the protocol step it never was.";

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
  /*
   * ONE WAVE, NOT A QUEUE — rule 50's pattern, applied to the reading
   * side (#54, measured 1.6-12s live). Ten independent reads ran here
   * one after another: four top-level records and then SIX month
   * ledgers in a serial for-await, so the page's latency was their
   * SUM. None of them reads what another wrote — the months are
   * disjoint key prefixes, the corrections and the reclassification
   * are their own records — so the ordering bought nothing at all.
   * Same reads, same payload byte for byte (the specs on this surface
   * are the proof), wall clock now the slowest single read:
   *
   * - corrections: one read for the whole window, not one per month.
   * - the reclassification, from the two records that hold it: the
   *   frozen ledger rows give the EXACT lifetime total, and a walk of
   *   the certificates gives the per-month split. The total cannot
   *   truncate; the split can, and the rollup below says so out loud
   *   when the two fail to reconcile.
   * - latency (roadmap 0.12): one prefix scan over at most (route
   *   classes x buckets) keys — cheap enough to sit beside the funnel
   *   rather than earn a surface of its own.
   */
  const [corrections, reclassSplit, reclassTotal, latency, ledgers] =
    await Promise.all([
      readCorrections(env).catch(() => null),
      monthReclassAdjustments(env).catch(() => null),
      totalReclassified(env).catch(() => null),
      computeLatency(env),
      Promise.all(months.map((month) => readMonthLedger(env, month))),
    ]);

  for (let index = 0; index < months.length; index += 1) {
    const month = months[index]!;
    const ledger = ledgers[index]!;
    const rows = Object.values(ledger.items);
    /**
     * Only the organic columns are read. The house counters live in
     * separate keys (paidh/402h/verifyh) and are never summed in — the
     * exclusion is structural rather than a filter that could be
     * forgotten.
     */
    const challenges = rows.reduce((sum, row) => sum + row.challenges, 0);
    const recordedSettled = rows.reduce((sum, row) => sum + row.settled, 0);
    const misbooked = reclassSplit?.months[month]?.settles ?? 0;
    // Never below zero: the ledger row and the monthly counter are
    // different instruments, and a correction larger than the column
    // it corrects means one of them lost a write — a real direction,
    // not a licence to print a negative settlement count.
    const settled = Math.max(0, recordedSettled - misbooked);
    const verifies = rows.reduce((sum, row) => sum + row.verifies, 0);
    const declines = rows.reduce((sum, row) => sum + row.declines, 0);
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
      // Derived from the two published beside it, never metered apart.
      organic_payments_presented: settled + declines,
      organic_settled: settled,
      organic_declines: declines,
      organic_rechecks: verifies,
      conversion_rate: rate(settled, challenges),
      ...(misbooked > 0 ? { misbooked_house: misbooked } : {}),
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
      verifies: acc.verifies + window.organic_rechecks,
      declines: acc.declines + window.organic_declines,
    }),
    { challenges: 0, settled: 0, verifies: 0, declines: 0 },
  );

  /**
   * THE ROLLUP IS SUBTRACTED FROM THE EXACT TOTAL, not from the sum of
   * whatever the split happened to place. `total.settled` already has
   * the placed months removed, so adding them back and taking the
   * frozen lifetime figure off gives a number that matches /stats even
   * when the certificate walk came up short — and being unable to
   * split a correction is not a reason to publish an uncorrected
   * lifetime figure in the flattering direction.
   */
  const appliedReclass = windows.reduce(
    (sum, window) => sum + (window.misbooked_house ?? 0),
    0,
  );
  const allTimeSettled =
    reclassTotal === null
      ? total.settled
      : Math.max(0, total.settled + appliedReclass - reclassTotal);
  const splitIncomplete =
    reclassTotal !== null &&
    (reclassSplit?.truncated === true || appliedReclass !== reclassTotal);

  const base = env.STORE_BASE_URL;
  return {
    computed_at: new Date().toISOString(),
    house_flag_policy: HOUSE_FLAG_POLICY,
    all_time: {
      organic_challenges: total.challenges,
      // Same derivation as every window: the published settled plus
      // the published declines, so the invariant holds on the payload
      // a reader actually has in hand.
      organic_payments_presented: allTimeSettled + total.declines,
      organic_settled: allTimeSettled,
      organic_declines: total.declines,
      organic_rechecks: total.verifies,
      conversion_rate: rate(allTimeSettled, total.challenges),
      ...(reclassTotal ? { misbooked_house: reclassTotal } : {}),
      ...(splitIncomplete ? { reclass_split_incomplete: true } : {}),
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
    latency,
    note: NOTE,
    verify_url: `${base}/api/verify/{id}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
  };
}
