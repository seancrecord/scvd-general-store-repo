import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { SOURCE_ROSTER, type RosterEntry } from "@/services/ward-sources";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * SOURCE LIVENESS, DERIVED FROM RUN HISTORY (2026-09-04).
 *
 * THE DEFECT THIS CLOSES. The ward's roster used to state its own
 * health in prose: two directories described as unreadable in a
 * hand-written constant, last edited by a person, re-checked by
 * nothing. That is a claim about the present tense with no mechanism
 * to make it false. It could rot for a year and read exactly the same
 * on the day it was written and the day it stopped being true.
 *
 * The borrowed lesson, from a neighbouring measurement project's
 * coverage page: liveness is "derived from actual run history after
 * every pipeline cycle, not hand-maintained, so it cannot quietly
 * drift out of date the way a written list does". Their table earns
 * that sentence with one column — LAST SUCCESSFUL PULL — which no
 * amount of careful prose can fake, because it is a timestamp taken
 * off a real run.
 *
 * SO THIS MODULE STATES NO FACT OF ITS OWN. Every field below is read
 * out of stored ward rounds, which already carry `population.per_source`
 * — one row per source per week, `hosts: null` meaning the source could
 * not be READ, distinct from a source that answered with nothing.
 * That field has ridden every round since the population layer shipped
 * and no surface had ever looked at it across rounds. The history was
 * already there. Nobody had asked it a question.
 *
 * WHAT `stale` MEANS, and why it is not a threshold argument. A source
 * is stale when its most recent answer is older than the most recent
 * round — that is, the round ran, asked, and this source did not
 * answer. It deliberately does not mean "older than N days": the ward
 * is weekly, so a day count would encode the cadence twice and drift
 * the moment the cadence changed. Rounds are the clock.
 *
 * THE DISAGREEMENT IS THE PRODUCT. A source the roster calls `read`
 * and the history calls `never_answered` is a reader built against a
 * shape that never existed — the "configured and silently records
 * nothing" failure, caught by construction rather than by somebody
 * noticing a number looked low. `roster_disagrees` is set on exactly
 * that row, and it is the first thing the page shows.
 */

/**
 * How many stored rounds the register reads back.
 *
 * FIFTY-TWO, NOT TWO HUNDRED, and the reason is cost rather than
 * relevance. Each stored round is the full weekly snapshot — the
 * hosts, their evidence, the census — which is why the corpus moved
 * its copies to R2 at "hundreds of kilobytes and growing". This
 * register needs one small block out of each (population.per_source)
 * and reads the whole value to get it, on every /sources request and
 * every hourly heartbeat. A year of rounds bounds that at a few tens
 * of megabytes of KV reads a request; two hundred would not.
 *
 * `history_truncated` says when this binds, and a year is more than
 * the liveness question needs: a source that last answered fifty-two
 * rounds ago is stale by any reading. THE RIGHT FIX, when the count
 * gets there, is a slim per-source history the round writer appends
 * to — the door bank's pattern — so this reads kilobytes instead.
 * Named here so it is a known next step, not a surprise.
 */
const HISTORY_CAP = 52;

export type SourceStatus =
  /** Answered on the most recent round the register can see. */
  | "live"
  /**
   * ANSWERED, AND THE CENSUS REFUSED TO COUNT IT. A page-capped listing
   * cannot tell "delisted" from "on page two", so the population law
   * records it as unreadable — while the round still walked every
   * door it named. Found on the register's first live read
   * (2026-09-04): the CDP discovery feed, the store's primary source,
   * showed never_answered with five failed rounds beside a heartbeat
   * saying the round probed a thousand hosts off that same feed. Both
   * were true and the word was wrong. This is the word.
   */
  | "partial"
  /** Has answered before, but not on the most recent round. */
  | "stale"
  /** A reader exists and has been called; no round ever got an answer. */
  | "never_answered"
  /** No reader exists. The roster says why. */
  | "unread";

export interface SourceLiveness {
  source: string;
  home: string;
  what: string;
  status: SourceStatus;
  /**
   * The `at` of the most recent round where this source returned a
   * host list. Null when it never has. This is the column that cannot
   * be faked by prose.
   */
  last_successful_read: string | null;
  /** The week of that read, so it can be joined to the signed corpus. */
  last_successful_week: string | null;
  /** Hosts it returned on that read. */
  hosts_on_last_read: number | null;
  /** Rounds since the last answer. 0 = answered on the newest round. */
  rounds_since_answer: number | null;
  /** Consecutive newest-first rounds where it was asked and did not answer. */
  consecutive_failures: number;
  /** Rounds in which this source appears at all, answered or not. */
  rounds_seen: number;
  /**
   * Rounds where the source answered but the census would not count
   * it (see `partial`). Published beside the failures so a reader can
   * tell a dark feed from a feed we refuse to count on principle.
   */
  partial_rounds: number;
  /** The newest week the source answered in ANY way, countable or not. */
  last_answered_week: string | null;
  /**
   * Set when the roster and the history contradict each other: a
   * source declared readable that no round has ever read. The reader
   * is wrong, the shape moved, or the host is unreachable from the
   * Worker — all three are findings, and all three are invisible
   * without this field.
   */
  roster_disagrees: boolean;
  /** From the roster, for an `unread` source: why, and what dissolves it. */
  why_unread?: string;
  unblock?: string;
}

export interface SourceRegister {
  artifact: "source_register";
  /** When this register was derived. It is derived at read, never stored. */
  at: string;
  /** The newest round the register could see; null if there are none. */
  newest_round: { week: string; at: string } | null;
  /** How many stored rounds it read. Its own denominator. */
  rounds_read: number;
  /** True when the history cap bound — the register saw a window, not all time. */
  history_truncated: boolean;
  sources: SourceLiveness[];
  what_this_is_not: string;
  how_to_rederive: string;
}

export const REGISTER_IS_NOT =
  "Not a rating of these directories and not a verdict on their uptime. Every row says what OUR round got when it asked, from our vantage, on our cadence. A source we cannot read may be perfectly healthy for everyone else; that is a fact about this instrument's reach, counted against the instrument.";

const HOW_TO_REDERIVE =
  "Every field is read out of the stored ward rounds' own `population.per_source` block, newest first, where `hosts: null` means the source could not be read that round. Nothing here is written by hand or cached: fetch the rounds and recount.";

/**
 * A ceiling on how many round KEY NAMES the walk below will page
 * through. Names are cheap — no values are read — so this is a
 * runaway guard, not a budget: at one round a week it is a century.
 */
const NAME_WALK_CAP = 5000;

/**
 * Every stored round's week, oldest first, read as KEY NAMES ONLY.
 *
 * KV lists ascending, and a capped list therefore returns the OLDEST
 * keys under a prefix. The first cut of this file handed a capped
 * list straight to a bulk read, which meant that the day the store
 * held one more round than the cap, every liveness row would have
 * been derived from the oldest year on file and every source would
 * have read as stale — silently, with `history_truncated: true` as
 * the only tell. Found on the red-team read of 2026-09-04. So the
 * names are walked to the end here (cheap: no values), and the caller
 * slices the NEWEST of them before reading any value at all.
 */
export async function listRoundWeeks(env: Env): Promise<{ weeks: string[]; truncated: boolean }> {
  const weeks: string[] = [];
  let cursor: string | undefined;
  let truncated = false;
  for (let pass = 0; pass < NAME_WALK_CAP / 100 + 1; pass += 1) {
    const listed = await listKeys(env.COUNTERS, {
      prefix: KV_KEYS.wardRoundPrefix,
      cap: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const name of listed.names) weeks.push(name.slice(KV_KEYS.wardRoundPrefix.length));
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
    if (weeks.length >= NAME_WALK_CAP) {
      truncated = true;
      break;
    }
  }
  weeks.sort();
  return { weeks, truncated };
}

/** Newest-first rounds, the newest HISTORY_CAP of them, values read last. */
export async function readRoundHistory(
  env: Env,
): Promise<{ rounds: WardRound[]; truncated: boolean }> {
  const { weeks, truncated: namesTruncated } = await listRoundWeeks(env);
  const newest = weeks.slice(-HISTORY_CAP);
  const values = await bulkGetJson<WardRound>(
    env.COUNTERS,
    newest.map((week) => KV_KEYS.wardRound(week)),
  );
  const rounds: WardRound[] = [];
  for (const week of newest) {
    const round = values.get(KV_KEYS.wardRound(week));
    if (round && typeof round.week === "string" && typeof round.at === "string") {
      rounds.push(round);
    }
  }
  rounds.sort((a, b) => b.week.localeCompare(a.week));
  return { rounds, truncated: namesTruncated || weeks.length > HISTORY_CAP };
}

/**
 * One source's row, walked newest-first over the rounds.
 *
 * A round that carries NO census at all (every round before the
 * population layer existed) is skipped rather than counted as a
 * failure — it is a round where nobody asked, and scoring a source
 * down for a question that was never put to it would be the same
 * error as counting an unprobed host as dead.
 */
/**
 * Did the round itself show this source answered, even though the
 * census row is null? Evidence is per source and only where the round
 * carries some: the discovery feed's resource count is written on
 * every round, and a round that declared resources off a feed and then
 * walked them was not fed by silence. No other source leaves such a
 * mark, so for every other source a null row is what it says.
 */
function answeredUncountably(source: string, round: WardRound): boolean {
  return (
    source === "discovery" &&
    round.coverage_suspect === true &&
    typeof round.listed_resources === "number" &&
    round.listed_resources > 0
  );
}

function livenessOf(entry: RosterEntry, rounds: WardRound[]): SourceLiveness {
  let lastAt: string | null = null;
  let lastWeek: string | null = null;
  let lastHosts: number | null = null;
  let roundsSince: number | null = null;
  let consecutiveFailures = 0;
  let roundsSeen = 0;
  let partialRounds = 0;
  let lastAnsweredWeek: string | null = null;
  let newestWasPartial: boolean | null = null;
  let stillCountingFailures = true;
  let asked = 0;

  for (const round of rounds) {
    const rows = round.population?.per_source;
    if (!Array.isArray(rows)) continue;
    const row = rows.find((candidate) => candidate.source === entry.source);
    if (!row) continue;
    roundsSeen += 1;

    if (row.hosts === null || row.hosts === undefined) {
      if (answeredUncountably(entry.source, round)) {
        // Answered; uncountable. Not a failure, and it ends the streak.
        partialRounds += 1;
        if (lastAnsweredWeek === null) lastAnsweredWeek = round.week;
        if (newestWasPartial === null) newestWasPartial = true;
        stillCountingFailures = false;
        asked += 1;
        continue;
      }
      if (stillCountingFailures) consecutiveFailures += 1;
      if (newestWasPartial === null) newestWasPartial = false;
      asked += 1;
      continue;
    }
    if (lastAnsweredWeek === null) lastAnsweredWeek = round.week;
    if (newestWasPartial === null) newestWasPartial = false;
    // The first answer we meet walking newest-first is the last one taken.
    if (lastAt === null) {
      lastAt = round.at;
      lastWeek = round.week;
      lastHosts = row.hosts;
      roundsSince = asked;
    }
    stillCountingFailures = false;
    asked += 1;
  }

  const declaredRead = entry.readiness.state === "read";
  let status: SourceStatus;
  if (!declaredRead) {
    status = "unread";
  } else if (newestWasPartial === true) {
    status = "partial";
  } else if (lastAt === null && lastAnsweredWeek === null) {
    status = "never_answered";
  } else if (lastAt === null) {
    // Answered uncountably before, and not at all on the newest round.
    status = "stale";
  } else {
    status = roundsSince === 0 ? "live" : "stale";
  }

  const row: SourceLiveness = {
    source: entry.source,
    home: entry.home,
    what: entry.what,
    status,
    last_successful_read: lastAt,
    last_successful_week: lastWeek,
    hosts_on_last_read: lastHosts,
    rounds_since_answer: roundsSince,
    consecutive_failures: consecutiveFailures,
    rounds_seen: roundsSeen,
    partial_rounds: partialRounds,
    last_answered_week: lastAnsweredWeek,
    /*
     * Only claimed once a round has actually run and asked, and never
     * for a source the rounds show answering: a feed we decline to
     * count is not a reader that got nothing. A store with no history
     * yet has no evidence against its own roster, and saying otherwise
     * would make every fresh deploy accuse itself.
     */
    roster_disagrees:
      declaredRead && lastAt === null && lastAnsweredWeek === null && roundsSeen > 0,
  };
  if (entry.readiness.state === "unread") {
    row.why_unread = entry.readiness.why;
    row.unblock = entry.readiness.unblock;
  }
  return row;
}

/** The whole register, derived. Nothing is stored. */
export function deriveRegister(
  rounds: WardRound[],
  truncated: boolean,
  now = new Date(),
): SourceRegister {
  const newest = rounds[0];
  return {
    artifact: "source_register",
    at: now.toISOString(),
    newest_round: newest ? { week: newest.week, at: newest.at } : null,
    rounds_read: rounds.length,
    history_truncated: truncated,
    sources: SOURCE_ROSTER.map((entry) => livenessOf(entry, rounds)),
    what_this_is_not: REGISTER_IS_NOT,
    how_to_rederive: HOW_TO_REDERIVE,
  };
}

export async function sourceRegister(env: Env): Promise<SourceRegister> {
  const { rounds, truncated } = await readRoundHistory(env);
  return deriveRegister(rounds, truncated);
}

/** Rows worth a keeper's attention: a contradiction or a dead reader. */
export function registerFindings(register: SourceRegister): string[] {
  const findings: string[] = [];
  for (const row of register.sources) {
    if (row.roster_disagrees) {
      findings.push(
        `${row.source} is on the roster as readable and no round has ever read it (${row.rounds_seen} round${row.rounds_seen === 1 ? "" : "s"} asked). The reader, the shape, or the reach is wrong.`,
      );
    } else if (row.status === "partial") {
      findings.push(
        `${row.source} answered on ${row.last_answered_week} and the census would not count it: the listing is page-capped, and a partial enumeration cannot tell a delisting from a page we never reached. The round still walked every door it named; only the denominator leaves it out.`,
      );
    } else if (row.status === "stale") {
      findings.push(
        `${row.source} last answered on ${row.last_successful_week} and has failed the ${row.consecutive_failures} round${row.consecutive_failures === 1 ? "" : "s"} since. Its hosts are on the register by carry-forward, not by observation.`,
      );
    }
  }
  return findings;
}
