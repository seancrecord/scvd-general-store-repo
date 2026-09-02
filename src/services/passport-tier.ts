import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import type { CorpusRecord } from "@/services/corpus";
import { listCorpus } from "@/services/corpus";
import type { RefreshObservation } from "@/services/passport-refresh";
import type { SubjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE PASSPORT TIER — the first derived verdict published under the
 * 2026-09-02 doctrine ("never a ranking, and never a verdict without
 * its derivation and denominator beside it"), roadmap N7(b), the
 * keeper's prompt verbatim in docs/PROMPTS_2026-09-02.md §1.
 *
 * A tier is a FUNCTION of four things and nothing else: the rounds in
 * the window, how many of them found the door ready, the most recent
 * signed observation (round or paid refresh, newest wins — the same
 * fold the passport and the profile already share), and whether our
 * own coverage of this host was suspect inside the window. It is
 * derived at read from the signed per-host history, never stored,
 * and every rendering prints the fraction it came from and links the
 * rows, so a reader can redo the arithmetic or apply a different rule
 * to the same rows.
 *
 * WHAT IT IS NOT. Not a ranking: nothing here orders one host against
 * another, and /corpus/tiers.json is alphabetical for exactly that
 * reason. Not a score on an operator: a tier is a reading of a DOOR's
 * rounds. Not a number: there is no 0–100 anything, and the only
 * figures are a count over a count with both printed.
 *
 * THE RULE IS TYPED ONCE — here, as TIER_RULE — and /criteria renders
 * it verbatim. A test walks every served surface and fails on a tier
 * word that appears without its fraction beside it.
 */

export type PassportTier =
  | "observed"
  | "established"
  | "standing"
  | "broken"
  | "indeterminate";

/** The rounds the two earned tiers need. Typed here, nowhere else. */
export const ESTABLISHED_ROUNDS = 4;
export const STANDING_ROUNDS = 8;

/** The rule, verbatim, in the keeper's shape. /criteria prints this. */
export const TIER_RULE: readonly { tier: PassportTier; rule: string }[] = [
  { tier: "observed", rule: "at least 1 signed round" },
  {
    tier: "established",
    rule: `ready in at least ${ESTABLISHED_ROUNDS} of the last ${ESTABLISHED_ROUNDS} weekly rounds, no unreachable`,
  },
  {
    tier: "standing",
    rule: `ready in at least ${STANDING_ROUNDS} of the last ${STANDING_ROUNDS} weekly rounds, no unreachable`,
  },
  {
    tier: "broken",
    rule: "most recent signed observation (round or paid refresh) is not_ready or unreachable",
  },
  {
    tier: "indeterminate",
    rule: "fewer rounds than the rule needs, or our coverage of this host was suspect in the window",
  },
];

export const TIER_RULE_NOTE =
  "The tier is a function of (rounds in window, ready count, latest observation, coverage_suspect) and nothing else. Every rendering prints the fraction it came from and links the rows. No ratio without its denominator, no tier without its rows. Newest wins between a weekly round and a paid refresh, so a refresh that finds the door broken moves the tier to broken that hour. Nothing orders one host against another.";

/** One round of the window, as the tier read it. */
export interface TierRow {
  sequence: number;
  week: string;
  taken_at: string;
  /** The signed corpus entry this row came from. */
  entry_url: string;
  /** We knocked and got a verdict. */
  observed: boolean;
  verdict?: "ready" | "not_ready" | "unreachable";
  /** Why there is no verdict, when there is none. */
  gap?: string;
  /**
   * Our coverage that round was suspect FOR THIS HOST: we did not
   * observe it and the round itself recorded capped or suspect
   * coverage, or the instrument was degraded on this row. A fact
   * about our instrument, never about the door.
   */
  coverage_suspect: boolean;
}

export interface TierLatest {
  verdict: string | null;
  observed_at: string | null;
  /** Which instrument the newest observation came from. */
  source: "census" | "paid_refresh" | null;
}

export interface TierInput {
  /** Rounds since first sighting, ascending, at most STANDING_ROUNDS. */
  rounds: TierRow[];
  latest: TierLatest;
}

export interface TierFraction {
  /** Rounds in the window that found the door ready. */
  ready: number;
  /** Rounds in the window — the denominator, always printed. */
  rounds: number;
  first_week: string | null;
  last_week: string | null;
  /** "W33–W36", or "W36" for a one-round window, or "no rounds". */
  weeks: string;
}

export interface TierReading {
  tier: PassportTier;
  /** "established — 4 of 4, W33–W36": the tier never travels without this. */
  line: string;
  fraction: TierFraction;
  /** The rule this tier was derived under, verbatim. */
  rule: string;
  latest: TierLatest;
  /** Whether our coverage was suspect anywhere in the window. */
  coverage_suspect: boolean;
  window: {
    /** Rounds the reading looked at. */
    rounds: number;
    established_needs: number;
    standing_needs: number;
  };
  /** The rows behind the fraction — the tier never travels without them. */
  rows: TierRow[];
  criteria_url: string;
}

const READY_SIDE_SOURCES = new Set(["ready"]);

function weeksLabel(rows: readonly TierRow[]): string {
  if (rows.length === 0) return "no rounds";
  const first = rows[0]!.week.replace(/^\d{4}-/, "");
  const last = rows[rows.length - 1]!.week.replace(/^\d{4}-/, "");
  return first === last ? first : `${first}–${last}`;
}

function fractionOf(rows: readonly TierRow[]): TierFraction {
  const ready = rows.filter(
    (row) => row.observed && row.verdict !== undefined && READY_SIDE_SOURCES.has(row.verdict),
  ).length;
  return {
    ready,
    rounds: rows.length,
    first_week: rows[0]?.week ?? null,
    last_week: rows[rows.length - 1]?.week ?? null,
    weeks: weeksLabel(rows),
  };
}

function ruleFor(tier: PassportTier): string {
  return TIER_RULE.find((entry) => entry.tier === tier)!.rule;
}

/**
 * The derivation. Pure; reads no clock and no store. The order of the
 * checks IS the rule's precedence: broken first (the newest signed
 * observation says the door is not on the ready side), then the two
 * ways the window cannot support a reading (no signed round in it, or
 * our coverage suspect inside the established window), then the two
 * earned tiers longest-first, then observed.
 */
export function deriveTier(input: TierInput, criteriaUrl: string): TierReading {
  const rounds = input.rounds.slice(-STANDING_ROUNDS);
  const windowEstablished = rounds.slice(-ESTABLISHED_ROUNDS);
  const observedRows = rounds.filter((row) => row.observed);
  const suspect = windowEstablished.some((row) => row.coverage_suspect);
  const finish = (tier: PassportTier, window: readonly TierRow[]): TierReading => {
    const fraction = fractionOf(window);
    return {
      tier,
      line: `${tier} — ${fraction.ready} of ${fraction.rounds}, ${fraction.weeks}`,
      fraction,
      rule: ruleFor(tier),
      latest: input.latest,
      coverage_suspect: suspect,
      window: {
        rounds: window.length,
        established_needs: ESTABLISHED_ROUNDS,
        standing_needs: STANDING_ROUNDS,
      },
      rows: [...window],
      criteria_url: criteriaUrl,
    };
  };

  const latest = input.latest.verdict;
  if (latest === "not_ready" || latest === "unreachable") {
    return finish("broken", windowEstablished);
  }
  if (observedRows.length === 0) {
    return finish("indeterminate", windowEstablished);
  }
  if (suspect) {
    return finish("indeterminate", windowEstablished);
  }
  const allReady = (window: readonly TierRow[], needs: number): boolean =>
    window.length === needs &&
    window.every((row) => row.observed && row.verdict === "ready");
  if (allReady(rounds, STANDING_ROUNDS)) {
    return finish("standing", rounds);
  }
  if (allReady(windowEstablished, ESTABLISHED_ROUNDS)) {
    return finish("established", windowEstablished);
  }
  return finish("observed", windowEstablished);
}

/**
 * The per-host input, from the replayed history the passport already
 * holds. Rounds before first sighting are not rounds of this window;
 * `coverage_suspect` on a SubjectRound is chain-derived (the round's
 * own flags, or a degraded instrument row), so this input and the
 * index fold below read the same facts and cannot disagree.
 */
export function tierInputFromHistory(
  history: SubjectHistory,
  observation: {
    verdict: string | null;
    observed_at: string | null;
    refreshIsNewest: boolean;
  },
): TierInput {
  const rounds: TierRow[] = history.timeline
    .filter((round) => round.gap !== "before_first_sighting")
    .map((round) => {
      const observed =
        round.probed && round.verdict !== undefined && round.verdict !== "not_probed";
      return {
        sequence: round.sequence,
        week: round.week,
        taken_at: round.taken_at,
        entry_url: round.entry_url,
        observed,
        ...(observed ? { verdict: round.verdict as TierRow["verdict"] } : {}),
        ...(round.gap ? { gap: round.gap } : {}),
        coverage_suspect: !observed && round.coverage_suspect,
      };
    })
    .slice(-STANDING_ROUNDS);
  return {
    rounds,
    latest: {
      verdict: observation.verdict,
      observed_at: observation.observed_at,
      source:
        observation.verdict === null
          ? null
          : observation.refreshIsNewest
            ? "paid_refresh"
            : "census",
    },
  };
}

/** A row of the index: one host's tier with its fraction. */
export interface TierIndexEntry {
  host: string;
  tier: PassportTier;
  line: string;
  fraction: TierFraction;
  latest: TierLatest;
  coverage_suspect: boolean;
  rows_url: string;
  passport_url: string;
}

export interface TierIndex {
  what_this_is: string;
  what_this_is_not: string;
  rule_url: string;
  derived_at: string;
  weeks_read: number;
  latest_week: string | null;
  total_hosts: number;
  /** A census of readings, not a table: the same host moves between these week to week. */
  by_tier: Record<PassportTier, number>;
  /** Alphabetical by host. Ordered by tier would be a ranking. */
  hosts: TierIndexEntry[];
}

interface ChainRow {
  host?: unknown;
  verdict?: unknown;
  observer_status?: unknown;
}

/**
 * Whether a round's own coverage was suspect: capped, the feed read
 * flagged, or the probe count collapsed. A fact about our instrument
 * that round, applied to every host we did not observe in it.
 */
export function roundCoverageSuspect(round: {
  capped?: boolean;
  coverage_suspect?: boolean;
  coverage_drop?: unknown;
}): boolean {
  return (
    round.capped === true ||
    round.coverage_suspect === true ||
    (round.coverage_drop !== undefined && round.coverage_drop !== null)
  );
}

/**
 * The index: every host the chain has carried, each with its tier,
 * folded in ONE pass over the signed records (the door index's own
 * shape) plus one bulk read of the paid refreshes, so the newest-wins
 * fold holds here exactly as it does on the passport.
 */
export async function tierIndex(env: Env, base: string, now: Date = new Date()): Promise<TierIndex> {
  const records = await listCorpus(env);
  return foldTierIndex(records, await refreshesFor(env, records), base, now);
}

async function refreshesFor(
  env: Env,
  records: readonly CorpusRecord[],
): Promise<Map<string, RefreshObservation>> {
  const hosts = new Set<string>();
  for (const record of records) {
    for (const row of (record.snapshot.round.hosts ?? []) as ChainRow[]) {
      if (typeof row.host === "string" && row.host) hosts.add(row.host.toLowerCase());
    }
  }
  const names = [...hosts].map((host) => KV_KEYS.passportRefresh(host));
  const read = await bulkGetJson<RefreshObservation>(env.COUNTERS, names);
  const byHost = new Map<string, RefreshObservation>();
  for (const host of hosts) {
    const value = read.get(KV_KEYS.passportRefresh(host));
    if (value) byHost.set(host, value);
  }
  return byHost;
}

export function foldTierIndex(
  records: readonly CorpusRecord[],
  refreshes: ReadonlyMap<string, RefreshObservation>,
  base: string,
  now: Date = new Date(),
): TierIndex {
  const firstSeen = new Map<string, number>();
  for (const record of records) {
    for (const row of (record.snapshot.round.hosts ?? []) as ChainRow[]) {
      if (typeof row.host !== "string" || !row.host) continue;
      const host = row.host.toLowerCase();
      if (!firstSeen.has(host)) firstSeen.set(host, record.snapshot.sequence);
    }
  }
  const rowsByHost = new Map<string, TierRow[]>();
  const lastObservedByHost = new Map<string, { verdict: string; at: string }>();
  for (const record of records) {
    const { snapshot } = record;
    const round = snapshot.round;
    const suspectRound = roundCoverageSuspect(round);
    const rows = new Map<string, ChainRow>();
    for (const row of (round.hosts ?? []) as ChainRow[]) {
      if (typeof row.host === "string" && row.host) rows.set(row.host.toLowerCase(), row);
    }
    for (const [host, first] of firstSeen) {
      if (snapshot.sequence < first) continue;
      const row = rows.get(host);
      const verdict = typeof row?.verdict === "string" ? row.verdict : undefined;
      const degraded = verdict === "unreachable" && row?.observer_status === "degraded";
      const observed =
        verdict !== undefined && verdict !== "not_probed" && !degraded;
      const list = rowsByHost.get(host) ?? [];
      list.push({
        sequence: snapshot.sequence,
        week: snapshot.week,
        taken_at: snapshot.taken_at,
        entry_url: `${base}/corpus/${snapshot.sequence}.json`,
        observed,
        ...(observed ? { verdict: verdict as TierRow["verdict"] } : {}),
        ...(observed ? {} : { gap: degraded ? "instrument_degraded" : row ? "not_probed" : "not_observed" }),
        coverage_suspect: !observed && (suspectRound || degraded),
      });
      rowsByHost.set(host, list);
      if (observed) lastObservedByHost.set(host, { verdict: verdict!, at: snapshot.taken_at });
    }
  }
  const hosts: TierIndexEntry[] = [];
  const byTier: Record<PassportTier, number> = {
    observed: 0,
    established: 0,
    standing: 0,
    broken: 0,
    indeterminate: 0,
  };
  for (const host of [...rowsByHost.keys()].sort()) {
    const census = lastObservedByHost.get(host) ?? null;
    const refresh = refreshes.get(host) ?? null;
    const refreshIsNewest =
      refresh !== null && (census === null || refresh.observed_at > census.at);
    const latest: TierLatest = refreshIsNewest
      ? { verdict: refresh!.verdict, observed_at: refresh!.observed_at, source: "paid_refresh" }
      : census
        ? { verdict: census.verdict, observed_at: census.at, source: "census" }
        : { verdict: null, observed_at: null, source: null };
    const reading = deriveTier(
      { rounds: (rowsByHost.get(host) ?? []).slice(-STANDING_ROUNDS), latest },
      `${base}/criteria`,
    );
    byTier[reading.tier] += 1;
    hosts.push({
      host,
      tier: reading.tier,
      line: reading.line,
      fraction: reading.fraction,
      latest: reading.latest,
      coverage_suspect: reading.coverage_suspect,
      rows_url: `${base}/corpus/host/${host}.json`,
      passport_url: `${base}/passport/${host}`,
    });
  }
  return {
    what_this_is:
      "Every host the signed chain has carried, each with the tier derived from its own rounds by the rule on /criteria, printed with the fraction it came from. Derived at read from the signed records, never stored; the rows behind every line are at each host's rows_url.",
    what_this_is_not:
      "Not a ranking: the list is alphabetical by host, and nothing here orders one host against another. Not a score on any operator: a tier is a reading of a door's rounds. Never a verdict without its derivation and denominator beside it.",
    rule_url: `${base}/criteria`,
    derived_at: now.toISOString(),
    weeks_read: records.length,
    latest_week: records[records.length - 1]?.snapshot.week ?? null,
    total_hosts: hosts.length,
    by_tier: byTier,
    hosts,
  };
}
