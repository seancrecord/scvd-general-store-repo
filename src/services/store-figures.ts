import { metricsMonth } from "@/lib/metrics";
import { computePulse } from "@/services/pulse";
import { computeStatsDiagnosed, type TillItemCount } from "@/services/stats";
import { readBuyerSignals } from "@/services/buyer-signals";
import type { Env, StoreBuyersDigest } from "@/types";

/**
 * THE STORE'S OWN FIGURES FOR ONE MONTH — one derivation, read by the
 * keeper's digest and by the signed public record alike.
 *
 * WHY THIS FILE EXISTS. `storeBuyersDigest` assembled these numbers
 * for the current month and nothing else could reach them. The signed
 * monthly record (services/store-month.ts) needs the same numbers for
 * a CLOSED month, and the one thing this store must not do is compute
 * them a second time: the week ledger's own note says it, and the
 * counters project spent a day proving why. A parallel set of numbers
 * is two instruments answering one question, which is the defect the
 * reader classifier had. So the derivation moved here, took a month
 * argument, and both callers read it.
 *
 * NOTHING IS COMPUTED HERE. Every figure comes off an instrument that
 * already publishes it with its population on a public surface: the
 * pulse's monthly window, the books' rail split and per-item till, and
 * the signal store's per-subject rows. This file joins them and says
 * which window each one is on — it does not add, average or rate
 * anything that is not already served under `published_counts`.
 */

/** The windows a figure here can be on. Named because they differ. */
export interface FigureWindows {
  /** The funnel and the reading concentration: this month alone. */
  month: string;
  /** True when `month` is the month in progress, so the count is partial. */
  month_to_date: boolean;
  /** When the pulse was read. */
  read_at: string;
}

export interface StoreMonthFigures {
  window: string;
  windows: FigureWindows;
  instrument: string;
  organic_challenges: number;
  organic_payments_presented: number;
  organic_settled: number;
  organic_declines: number;
  conversion_rate: number | null;
  /** All-time organic settles by network, or null when the split is withheld. */
  by_rail: Record<string, number> | null;
  /** All-time settles per item (R3), organic and house kept apart. */
  by_item: Record<string, TillItemCount>;
  /** Who reads the pages about a host: the histogram, no host named. */
  host_pages: StoreBuyersDigest["host_pages"];
  exclusions: string[];
  note: string;
}

const EXCLUSIONS = [
  "house traffic, flagged at the till",
  "infrastructure and crawlers by name",
  "family settles reclassified after the fact",
];

const INSTRUMENT =
  "the pulse's monthly window (services/pulse.ts), the books' rail split and per-item till (services/stats.ts) and the signal store's per-subject rows (services/buyer-signals.ts); every figure's population is on /pulse, /stats and /observatory under published_counts";

const NOTE =
  "Counts, not visitors; floors, not censuses; the rail split and the per-item till are all time and the rest is this month. No host is named and no wallet is here.";

/**
 * One month's figures.
 *
 * A month the pulse's trailing window no longer carries comes back
 * with its funnel at zero and `windows.read_at` saying when we looked
 * — NOT with an invented number. The caller decides whether a month
 * it cannot see is worth sealing; `monthIsReadable` is how it asks.
 */
export async function storeMonthFigures(
  env: Env,
  month: string,
): Promise<StoreMonthFigures> {
  const [pulse, books, signals] = await Promise.all([
    computePulse(env),
    // The DIAGNOSED read, because till_by_item is a diagnostic: the
    // per-item rows are the same counters the organic total is summed
    // from, left un-summed (R3), and computeStats drops them.
    computeStatsDiagnosed(env),
    readBuyerSignals(env, month),
  ]);
  const stats = books.stats;
  const window = pulse.months.find((entry) => entry.month === month);
  const toDate = month === metricsMonth();
  const { computed_at: _at, ...rail } = stats.organic_by_rail ?? {
    computed_at: "",
  };
  return {
    window: `${month}, ${toDate ? "month to date" : "closed month"}, read at ${pulse.computed_at}`,
    windows: {
      month,
      month_to_date: toDate,
      read_at: pulse.computed_at,
    },
    instrument: INSTRUMENT,
    organic_challenges: window?.organic_challenges ?? 0,
    organic_payments_presented: window?.organic_payments_presented ?? 0,
    organic_settled: window?.organic_settled ?? 0,
    organic_declines: window?.organic_declines ?? 0,
    conversion_rate: window?.conversion_rate ?? null,
    by_rail: stats.organic_by_rail ? (rail as Record<string, number>) : null,
    by_item: books.till_by_item,
    host_pages: signals.histogram,
    exclusions: EXCLUSIONS,
    note: NOTE,
  };
}

/**
 * Whether the pulse still carries this month.
 *
 * The pulse keeps a trailing window on purpose (`PULSE_MONTHS`), so a
 * month that has fallen out of it cannot be read any more. Sealing one
 * would sign a row of zeros as though it were an observation, which is
 * the overclaim every chain in this store is built to avoid. The
 * sealer refuses instead, and says which months it can still see.
 */
export async function readableMonths(env: Env): Promise<string[]> {
  const pulse = await computePulse(env);
  // The rollup row carries "all_time" rather than a month and is not
  // a month anyone can seal; it is dropped rather than special-cased
  // at the call site.
  return pulse.months
    .map((entry) => entry.month)
    .filter((month): month is string => Boolean(month));
}
