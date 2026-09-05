import { sendAlert } from "@/lib/alerts";
import { KV_KEYS, currentWeekKey, previousWeekKey, weekKeyMonday } from "@/lib/kv-keys";
import { listRoundWeeks } from "@/services/source-liveness";
import { kvGetJson } from "@/lib/kv-retry";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE WARD'S HEARTBEAT — does the weekly round still happen, and when
 * it happens does it WRITE anything?
 *
 * THE HOLE THIS FILLS, and it was a wide one. The Sunday cron alerts
 * when `runWardRound` THROWS. It has never alerted when the round did
 * not run at all: a cron that never fires throws nothing, and a
 * `waitUntil` that is never scheduled has no failure path to take. The
 * corpus would simply have a missing week — which `/corpus/brief`
 * honestly 404s, naming the weeks it holds — and no living thing would
 * be told. The store's most-cited artifact had no alarm on the machine
 * that produces it.
 *
 * THE SECOND HALF IS THE PART WORTH COPYING. A neighbouring
 * measurement project lost a full day of every source and found it two
 * weeks later; their own account puts the finding not on the outage but
 * on the watchdog: it "had never been pointed at this pipeline", and
 * when they did point it, they made it check "that a cycle actually
 * WROTE something rather than merely that it finished, so a run that
 * completes having done nothing also alerts". That distinction is the
 * whole design here. A ward round that reads every source as null,
 * probes nobody and seals an empty week is a SUCCESS by every signal
 * the store had before today, and it is indistinguishable on every
 * public surface from a healthy week in a quiet ecosystem.
 *
 * WHY IT RIDES THE HOURLY CRON AND NOT THE WEEKLY ONE. A watchdog on
 * the same schedule as the thing it watches dies with it. This runs on
 * the half-hourly press, which is the only tick that keeps firing when
 * Sunday's does not.
 *
 * WHAT IT WILL NOT DO: page every hour. Both alerts carry a stable
 * `key` so the alert layer's own dedupe holds them to one notice per
 * condition, and the overdue check waits a full grace period past the
 * cadence before it says anything — a round that is late because
 * Cloudflare moved a cron by twenty minutes is not news.
 */

/**
 * How long past a week's own length a round may be missing before the
 * heartbeat calls it overdue. The round fires Sunday 11:00 UTC; a day
 * and a half of grace covers a retried tick and a slow week without
 * covering a genuinely skipped one.
 */
export const OVERDUE_AFTER_HOURS = 24 * 8 + 12;

export type HeartbeatVerdict =
  /** A round exists for the current or previous week and it wrote something. */
  | "beating"
  /** No round has ever been stored. A fresh store, not a fault. */
  | "never_run"
  /** The newest round is older than the cadence plus its grace. */
  | "overdue"
  /** A round ran on time and recorded nothing. */
  | "ran_empty";

export interface Heartbeat {
  artifact: "ward_heartbeat";
  at: string;
  verdict: HeartbeatVerdict;
  newest_week: string | null;
  newest_at: string | null;
  hours_since_newest: number | null;
  /**
   * What the newest round actually WROTE. The three numbers the
   * emptiness test reads, published so the verdict can be recomputed
   * rather than trusted.
   */
  newest_wrote: {
    hosts: number;
    population_known: number;
    sources_answered: number;
    sources_asked: number;
  } | null;
  /**
   * ISO weeks between the oldest and newest stored round that hold no
   * round at all. A gap in an append-only record is a fact about the
   * record; leaving it merely absent lets a reader see continuous
   * coverage where there was a hole.
   */
  weeks_missing: string[];
  /** Weeks the history actually holds, oldest first. Its denominator. */
  weeks_held: number;
  detail: string;
}

/**
 * Did this round write anything at all?
 *
 * DELIBERATELY NOT A THRESHOLD. "Fewer hosts than last week" is the
 * `coverage_drop` field's job and it already exists; this asks the
 * cruder question that no existing signal asked — did the run produce
 * a record, or did it produce the SHAPE of a record with nothing in
 * it. A round that probed nobody AND enumerated nobody AND had no
 * source answer is empty by any reading.
 */
export function roundWrote(
  round: WardRound,
): NonNullable<Heartbeat["newest_wrote"]> {
  const perSource = round.population?.per_source ?? [];
  return {
    // The stored value keeps its rows in R2 since 2026-09-05 and says
    // how many; a raw read must not mistake the pointer for a quiet week.
    hosts: Array.isArray(round.hosts) && round.hosts.length > 0 ? round.hosts.length : (round.hosts_count ?? 0),
    population_known: round.population?.population_known ?? 0,
    sources_answered: perSource.filter((row) => row.hosts !== null).length,
    sources_asked: perSource.length,
  };
}

function isEmpty(wrote: NonNullable<Heartbeat["newest_wrote"]>): boolean {
  return (
    wrote.hosts === 0 &&
    wrote.population_known === 0 &&
    wrote.sources_answered === 0
  );
}

/**
 * Every ISO week between the oldest and newest round that holds no
 * round. Walks by week key rather than by date arithmetic so the
 * year boundary is the same code path as any other week.
 */
export function missingWeeks(weeksHeld: string[]): string[] {
  if (weeksHeld.length < 2) return [];
  const held = new Set(weeksHeld);
  const sorted = [...held].sort();
  const oldest = sorted[0]!;
  let cursor = sorted[sorted.length - 1]!;
  const missing: string[] = [];
  // A ceiling so a corrupt week key cannot spin here forever.
  for (let step = 0; step < 1000 && cursor !== oldest; step += 1) {
    cursor = previousWeekKey(cursor);
    if (cursor === oldest) break;
    if (!held.has(cursor)) missing.push(cursor);
  }
  return missing.reverse();
}

/**
 * `rounds` is newest-first and may be JUST THE NEWEST ROUND: the
 * emptiness and overdue tests only ever look at rounds[0], and the
 * gap walk takes its weeks from `weeksHeld` when given, so the hourly
 * caller can hand in one value and a list of key names instead of a
 * year of full snapshots. Found on the red-team read of 2026-09-04:
 * the first cut read every stored round, hundreds of kilobytes each,
 * once an hour, to answer a question about one of them.
 */
export function deriveHeartbeat(
  rounds: WardRound[],
  now = new Date(),
  weeksHeld: string[] = rounds.map((round) => round.week),
): Heartbeat {
  const at = now.toISOString();
  const weeks_missing = missingWeeks(weeksHeld);
  const newest = rounds[0];

  if (!newest) {
    return {
      artifact: "ward_heartbeat",
      at,
      verdict: "never_run",
      newest_week: null,
      newest_at: null,
      hours_since_newest: null,
      newest_wrote: null,
      weeks_missing,
      weeks_held: 0,
      detail:
        "No ward round has ever been stored. On a fresh deployment this is the truth and not a fault; on a store that has been running, it is the loudest possible finding.",
    };
  }

  const takenAt = Date.parse(newest.at);
  const hours = Number.isFinite(takenAt)
    ? Math.round(((now.getTime() - takenAt) / 3_600_000) * 10) / 10
    : null;
  const wrote = roundWrote(newest);

  if (hours !== null && hours > OVERDUE_AFTER_HOURS) {
    return {
      artifact: "ward_heartbeat",
      at,
      verdict: "overdue",
      newest_week: newest.week,
      newest_at: newest.at,
      hours_since_newest: hours,
      newest_wrote: wrote,
      weeks_missing,
      weeks_held: weeksHeld.length,
      detail: `The newest ward round is ${newest.week}, taken ${hours} hours ago, past the ${OVERDUE_AFTER_HOURS}-hour grace on a weekly cadence. The round did not fail — it did not run. Nothing in the store would have said so.`,
    };
  }

  if (isEmpty(wrote)) {
    return {
      artifact: "ward_heartbeat",
      at,
      verdict: "ran_empty",
      newest_week: newest.week,
      newest_at: newest.at,
      hours_since_newest: hours,
      newest_wrote: wrote,
      weeks_missing,
      weeks_held: weeksHeld.length,
      detail: `Round ${newest.week} completed and recorded nothing: no host probed, no host enumerated, and not one of ${wrote.sources_asked} source${wrote.sources_asked === 1 ? "" : "s"} answered. A run that finishes having done nothing looks exactly like a healthy week in a quiet ecosystem on every surface this store publishes.`,
    };
  }

  return {
    artifact: "ward_heartbeat",
    at,
    verdict: "beating",
    newest_week: newest.week,
    newest_at: newest.at,
    hours_since_newest: hours,
    newest_wrote: wrote,
    weeks_missing,
    weeks_held: weeksHeld.length,
    detail: `Round ${newest.week} wrote ${wrote.hosts} probed host${wrote.hosts === 1 ? "" : "s"} against a known population of ${wrote.population_known}, with ${wrote.sources_answered} of ${wrote.sources_asked} sources answering.`,
  };
}

export async function readHeartbeat(env: Env): Promise<Heartbeat> {
  const [newest, { weeks }] = await Promise.all([
    kvGetJson<WardRound>(env.COUNTERS, KV_KEYS.wardRoundLatest, "json"),
    listRoundWeeks(env),
  ]);
  return deriveHeartbeat(newest ? [newest] : [], new Date(), weeks);
}

/**
 * The hourly check. Pages on `overdue` and `ran_empty`, and on those
 * only: `never_run` is a fresh store and `beating` is the point.
 *
 * The alert keys are stable per condition so the alert layer holds
 * this to one notice while a fault persists. A watchdog that pages
 * every half hour gets muted, and a muted watchdog is the one that
 * was never pointed at the pipeline.
 */
export async function wardHeartbeatWatch(env: Env): Promise<Heartbeat> {
  const beat = await readHeartbeat(env);
  if (beat.verdict === "overdue" || beat.verdict === "ran_empty") {
    const missing = beat.weeks_missing.length
      ? ` Weeks the chain is missing entirely: ${beat.weeks_missing.join(", ")}.`
      : "";
    await sendAlert(env, {
      condition: "worker_health",
      key: `ward-heartbeat-${beat.verdict}-${beat.newest_week ?? "none"}`,
      detail: `${beat.detail}${missing} Read /sources for which directories are still answering, and /admin/ward for the round itself.`,
    }).catch(() => undefined);
  }
  return beat;
}

/** The week the next round is due to write, for a surface that says so. */
export function currentRoundWeek(now = new Date()): string {
  return currentWeekKey(now);
}

/** Exposed for the tests that walk the week arithmetic across a year end. */
export { weekKeyMonday };
