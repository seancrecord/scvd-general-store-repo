import { BATTERY_ADDS, PREFLIGHT_VERSION, PREFLIGHT_VERSION_NEXT } from "@/services/preflight";

/**
 * WHAT v2 CATCHES THAT v1 MISSES, COUNTED (2026-08-29).
 *
 * THE KEEPER'S INSTRUCTION, and the gap it exposed. Asked whether v2
 * should become the headline battery everywhere — a change that
 * renames the criteria on every signed artifact this store has issued
 * — he held it and said why: "we should revisit especially as we are
 * selling things on preflight. We are monitoring to see if v2 is more
 * effective then we should just enhance it."
 *
 * WE WERE NOT MONITORING. `also_under` rides on every reading and
 * every paid audit, saying whether the two batteries agreed on THAT
 * door — and nothing anywhere added them up. A per-artifact sentence
 * that no one aggregates is not a measurement; it is a hundred
 * anecdotes with our signature on them. The decision he deferred was
 * one nobody could have made, because the number it turns on did not
 * exist.
 *
 * WHY THE DIRECTION IS ONE-WAY, which is what makes this cheap and
 * makes the number mean something precise. v2's check set is v1's
 * plus BATTERY_ADDS.v2 — a strict superset. So v2 can never pass a
 * door v1 failed; it can only fail a door v1 passed. There is exactly
 * one kind of disagreement, and it has a plain English name:
 *
 *     a door v1 called ready, that v2 caught.
 *
 * NO NEW WRITES, NO NEW FIELDS, NOTHING RESIGNED. Every census row
 * already stores `failed` — the NAMES of the checks that failed — and
 * the census has applied v2 in full since 2026-08-24. A row is a
 * disagreement exactly when its failures are all v2-only names. That
 * is derivable from rows already written, already hash-chained and
 * already anchored, so this reads history rather than starting a
 * series: the answer covers every week we have, not the weeks after
 * somebody remembered to count.
 *
 * It also means this cannot corrupt the corpus. The sealed rows are
 * untouched; the arithmetic happens at read.
 *
 * WHAT THE NUMBER DOES NOT SETTLE, said here so it is not quoted past
 * its evidence. A high count says v2 finds real defects v1 waves
 * through — it does not say the criteria rename is worth its cost to
 * every artifact holder. A low count says the two batteries mostly
 * agree, which is an argument for the rename being cheap AND for it
 * being unnecessary. The number is an input to the keeper's call, not
 * the call.
 */

/** The checks v2 folds into its verdict that v1 does not. Derived, never retyped. */
export const V2_ONLY_CHECKS: readonly string[] = BATTERY_ADDS[PREFLIGHT_VERSION_NEXT];

/** A census row, in the only shape this reader needs from it. */
export interface ScoredRow {
  verdict: string;
  failed: readonly string[];
}

export interface BatteryDelta {
  /** Rows that carried a real verdict — the denominator. */
  scored: number;
  /** Both batteries reached the same verdict. */
  agreed: number;
  /**
   * v1 would have said ready; v2 said not_ready. The only direction
   * that exists, because v2's checks are a superset of v1's.
   */
  caught_by_v2_only: number;
  /** Which v2-only checks did the catching, and how often. */
  by_check: Record<string, number>;
  /** Names the batteries so a reader never has to guess the vintage. */
  batteries: { baseline: string; compared: string };
  what_this_does_not_settle: string;
}

const NOT_SETTLED =
  "A count of doors v2 caught is not an argument for renaming the criteria on every artifact this store has signed. It says what the stricter battery finds; the cost of the rename falls on every holder of an older artifact, and that trade is the keeper's, not this number's.";

/**
 * Read a set of scored rows and report where the two batteries parted.
 *
 * Rows without a real verdict (unreachable, not_probed) are excluded
 * from the denominator rather than counted as agreement: no battery
 * scored them, so calling them agreement would inflate the agreed
 * figure with doors nobody judged — the "measured the wrong thing"
 * failure this store keeps finding in its own work.
 */
export function batteryDelta(rows: readonly ScoredRow[]): BatteryDelta {
  const byCheck: Record<string, number> = {};
  let scored = 0;
  let caught = 0;

  for (const row of rows) {
    if (row.verdict !== "ready" && row.verdict !== "not_ready") {
      continue;
    }
    scored += 1;
    if (row.failed.length === 0) {
      continue;
    }
    const v2Only = row.failed.filter((name) => V2_ONLY_CHECKS.includes(name));
    /*
     * THE DISAGREEMENT TEST, and it is an ALL rather than an ANY. A
     * row that failed one v1 check and one v2 check was not_ready
     * under both batteries — v2 found more to say about it, but the
     * verdict did not move, and a door both batteries rejected is not
     * evidence that the stricter one is worth its cost. Only a row
     * whose EVERY failure is v2-only would have been called ready by
     * v1, and those are the doors this exists to count.
     */
    if (v2Only.length === row.failed.length) {
      caught += 1;
      for (const name of v2Only) {
        byCheck[name] = (byCheck[name] ?? 0) + 1;
      }
    }
  }

  return {
    scored,
    agreed: scored - caught,
    caught_by_v2_only: caught,
    by_check: byCheck,
    batteries: {
      baseline: PREFLIGHT_VERSION,
      compared: PREFLIGHT_VERSION_NEXT,
    },
    what_this_does_not_settle: NOT_SETTLED,
  };
}


/**
 * THE WHOLE CHAIN, WEEK BY WEEK. Every signed round we hold, read for
 * the same question — which is possible only because this derives
 * from `failed` names that rows have always carried. A tally that
 * needed a new field would have started its series today and told the
 * keeper nothing until December.
 *
 * Per week AND cumulative, because they answer different halves: a
 * single week says what the market looks like now, the total says
 * whether the stricter battery has ever been worth its cost.
 */
export interface BatteryDeltaSeries {
  weeks: Array<{ week: string; sequence: number } & BatteryDelta>;
  overall: BatteryDelta;
  v2_only_checks: readonly string[];
  what_this_is: string;
}

const WHAT_THIS_IS =
  "How often the current battery (v2) reaches a different verdict than the frozen one (v1), over every signed week this store holds. v2's checks are v1's plus four, so the disagreement runs one way only: a door v1 would have called ready that v2 caught. Derived at read time from the check names each row already carries — no row was rewritten and nothing was resigned to produce this, so it covers the whole history rather than starting the day somebody thought to count.";

/** Fold a set of already-scored rounds into per-week and overall tallies. */
export function batteryDeltaSeries(
  rounds: readonly { week: string; sequence: number; rows: readonly ScoredRow[] }[],
): BatteryDeltaSeries {
  const weeks = rounds.map((round) => ({
    week: round.week,
    sequence: round.sequence,
    ...batteryDelta(round.rows),
  }));
  return {
    weeks,
    overall: batteryDelta(rounds.flatMap((round) => [...round.rows])),
    v2_only_checks: V2_ONLY_CHECKS,
    what_this_is: WHAT_THIS_IS,
  };
}
