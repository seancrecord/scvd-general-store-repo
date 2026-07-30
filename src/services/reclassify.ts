import { inferChannel } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * THE STANDING CORRECTION — how much of the recorded organic column is
 * machinery, computed over the WHOLE month rather than a window.
 *
 * WHY THE RECOUNT PAGE COULD NOT DO THIS. /admin/recount scans newest
 * -first and stops at a cap, because it runs inside a page load and a
 * page that times out is worse than a page that says how far it got.
 * That makes its figure a window, not a month — which is exactly the
 * mismatch that had it accusing a counter of drifting when the counter
 * was fine. A correction published from a capped scan would be a NEW
 * wrong number wearing a correction's authority, which is worse than
 * the number it replaced.
 *
 * SO THE WALK MOVED TO THE CLOCK. Nothing renders while this runs, so
 * it can read every row there is. bulkGetJson fetches 100 keys per
 * subrequest, so twenty thousand rows cost about two hundred — well
 * inside the budget of a scheduled invocation.
 *
 * WHY IT RECURS INSTEAD OF RUNNING ONCE. The fix for a stale number is
 * never "run the script and move on"; that is how three weeks pass and
 * a new pile of rows nobody re-walked is sitting there. The crawler
 * table gains entries — that is the whole point of it — and every
 * entry retroactively changes what old rows mean. A correction that
 * only knows about the table as it stood the day somebody ran a script
 * is a correction with an expiry date nobody wrote down.
 *
 * WHAT IT CANNOT SEE, stated because the number is published: rows
 * classified as infrastructure AT WRITE TIME carry no row at all (the
 * infrastructure diet), so this walk can only find machinery that was
 * recorded as organic and is known to be machinery TODAY. A crawler
 * nobody has identified yet is invisible here exactly as it is
 * invisible everywhere else, and the corrected figure is therefore an
 * upper bound on organic rather than a certified one.
 *
 * TIME-SENSITIVE BY CONSTRUCTION. Event rows carry a 90-day TTL. Every
 * row this correction depends on ages out eventually, and once it does
 * the exact figure stops being computable for that month — the caveat
 * becomes the only honest option. Running on the clock is what keeps
 * the answer from expiring quietly.
 */

/** Bounded far above any real month, so a runaway list cannot spin. */
const MAX_PAGES = 200;
const LIST_PAGE = 1000;

export interface MonthCorrection {
  month: string;
  /** Challenge rows the books recorded as organic. */
  recorded_organic: number;
  /** The same rows, re-read with today's crawler table. */
  corrected_organic: number;
  /** recorded − corrected: rows that were machinery all along. */
  moved_to_infrastructure: number;
  /** The user-agents behind the move, commonest first. */
  movers: { user_agent: string; rows: number }[];
  /** Rows read for this month. */
  rows_read: number;
  /** ISO timestamp of the walk that produced this. */
  computed_at: string;
  /**
   * False when the walk stopped early. A partial correction is never
   * published as a correction — this is the flag that decides.
   */
  complete: boolean;
}

/**
 * ONE DOCUMENT FOR EVERY MONTH, not one key per month.
 *
 * The first draft wrote a key per month inside a loop and the
 * scalability audit caught it — correctly, even though the loop is
 * bounded by months-since-opening and could never be large. Fixing it
 * rather than raising the budget turned out to be the better design
 * anyway: /pulse reads this ONCE for the whole trailing window instead
 * of once per month in a loop of its own, so the public endpoint got
 * cheaper as a side effect of satisfying a guard about writes.
 */
const CORRECTIONS_KEY = "metric:corrections";

export interface CorrectionSet {
  computed_at: string;
  /** ISO month -> correction. */
  months: Record<string, MonthCorrection>;
}

/** Every stored correction, one read. Null before the first walk. */
export async function readCorrections(
  env: Env,
): Promise<CorrectionSet | null> {
  return env.COUNTERS.get<CorrectionSet>(CORRECTIONS_KEY, "json");
}

/** The stored correction for one month, or null if none exists yet. */
export async function readCorrection(
  env: Env,
  month: string,
): Promise<MonthCorrection | null> {
  const set = await readCorrections(env);
  return set?.months[month] ?? null;
}

/**
 * Walks every event row, groups by month, and stores one correction
 * per month. Returns what it wrote, newest month first.
 */
export async function recomputeCorrections(
  env: Env,
  now: Date = new Date(),
): Promise<MonthCorrection[]> {
  const months = new Map<
    string,
    {
      recorded: number;
      corrected: number;
      rows: number;
      movers: Map<string, number>;
    }
  >();

  let cursor: string | undefined;
  let pages = 0;
  let complete = false;
  while (pages < MAX_PAGES) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    pages += 1;
    const names = listed.keys.map((k) => k.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      const event = values.get(name);
      if (!event || event.kind !== "challenge" || event.house) {
        continue;
      }
      const month = event.at.slice(0, 7);
      const bucket = months.get(month) ?? {
        recorded: 0,
        corrected: 0,
        rows: 0,
        movers: new Map<string, number>(),
      };
      bucket.rows += 1;
      // Only rows the books CALLED organic are in scope: this measures
      // the organic column, and a row already filed as machinery was
      // never in the number being corrected.
      if (event.channel !== "infrastructure") {
        bucket.recorded += 1;
        const today = inferChannel({
          userAgent: event.user_agent,
          referrer: event.referrer,
          declaredSource: event.declared_source,
        });
        if (today === "infrastructure") {
          const ua = event.user_agent ?? "(no user-agent)";
          bucket.movers.set(ua, (bucket.movers.get(ua) ?? 0) + 1);
        } else {
          bucket.corrected += 1;
        }
      }
      months.set(month, bucket);
    }
    if (listed.list_complete) {
      complete = true;
      break;
    }
    cursor = listed.cursor;
  }

  const computedAt = now.toISOString();
  const written: MonthCorrection[] = [];
  const set: CorrectionSet = { computed_at: computedAt, months: {} };
  for (const [month, bucket] of months) {
    const correction: MonthCorrection = {
      month,
      recorded_organic: bucket.recorded,
      corrected_organic: bucket.corrected,
      moved_to_infrastructure: bucket.recorded - bucket.corrected,
      movers: [...bucket.movers.entries()]
        .map(([user_agent, rows]) => ({ user_agent, rows }))
        .sort((a, b) => b.rows - a.rows)
        .slice(0, 10),
      rows_read: bucket.rows,
      computed_at: computedAt,
      complete,
    };
    set.months[month] = correction;
    written.push(correction);
  }
  // One write, outside the loop: the whole set at once.
  await env.COUNTERS.put(CORRECTIONS_KEY, JSON.stringify(set));
  return written.sort((a, b) => b.month.localeCompare(a.month));
}
