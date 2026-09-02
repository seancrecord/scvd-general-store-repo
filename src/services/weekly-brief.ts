import type { CorpusRecord } from "@/services/corpus";
import { deriveTrajectory, type WeekPoint } from "@/services/trajectory";
import { defectClass } from "@/store/defect-vocabulary";

/**
 * THE WEEK'S DOORS — the weekly brief a stranger can quote (roadmap
 * S1; the name is the keeper's ink, 2026-09-01).
 *
 * One page per signed week, DERIVED from the trajectory point that
 * week already serves — never a parallel set of numbers. It says what
 * the corpus's own fields say, in the order a reader asks: how many
 * doors were named, how many were knocked on, how many could be paid
 * and how many could not, which defects by name, and the gaps that
 * are ours. Counts travel with their denominators; no ratio is served
 * and no host is named, because a page that names the not-ready hosts
 * beside the ready ones is a leaderboard wearing a brief's clothes.
 * The hosts are one click away on /doors, alphabetical, as they
 * always were.
 */
export interface DefectCount {
  id: string;
  title: string;
  count: number;
}

export interface WeeklyBrief {
  artifact: "weekly_brief";
  name: "The Week's Doors";
  week: string;
  taken_at: string;
  /** The signed snapshot this brief re-reads. */
  sequence: number;
  digest: string;
  /** Which battery the week's verdicts cite, when the rows say. */
  battery?: string;
  doors: {
    /** Every host the round's feeds named. */
    listed: number;
    /** Hosts actually knocked on. */
    probed: number;
    /** Answered with a challenge a buyer could pay. */
    payable: number;
    /** Answered, but with a challenge a buyer could not pay as served. */
    not_payable: number;
    /** No answer, attributed to the door (our blind ticks are below). */
    unreachable: number;
    /** Listed doors whose 402 carried a parseable offer. */
    offers_seen: number;
  };
  /** Doors per chain, from each offer's own declared networks. */
  networks: Record<string, number>;
  /** Failed checks by their registered name, most frequent first. */
  defects: DefectCount[];
  /** Ours, stated: the gaps counted against the observer. */
  our_gaps: {
    /** Named by a feed, never reached by the round. */
    not_probed: number;
    /** Ticks where OUR vantage was blind, not anyone's outage. */
    observer_degraded: number;
    /** The round itself said its coverage was suspect. */
    coverage_suspect: boolean;
  };
  /** The week before, for a reader who wants the direction, never a trend line. */
  previous?: { week: string; payable: number; not_payable: number; probed: number };
  not_a_ranking: string;
  how_to_rederive: string;
  every_door: string;
}

export const NOT_A_RANKING =
  "Counts, with their denominators, for one signed week. No host is ranked or named on this page; the doors themselves are listed alphabetically at /doors, each with its own dated observation. Every figure here carries the two numbers it came from, which is the house sentence: never a ranking, and never a verdict without its derivation and denominator beside it.";

function briefOf(point: WeekPoint, previous: WeekPoint | undefined, base: string): WeeklyBrief {
  const defects = Object.entries(point.failure_classes)
    .map(([id, count]) => ({ id, title: defectClass(id)?.title ?? id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    artifact: "weekly_brief",
    name: "The Week's Doors",
    week: point.week,
    taken_at: point.taken_at,
    sequence: point.sequence,
    digest: point.digest,
    ...(point.battery ? { battery: point.battery } : {}),
    doors: {
      listed: point.hosts_listed,
      probed: point.hosts_probed,
      payable: point.ready,
      not_payable: point.not_ready,
      unreachable: point.unreachable,
      offers_seen: point.offers_seen,
    },
    networks: point.networks,
    defects,
    our_gaps: {
      not_probed: point.not_probed,
      observer_degraded: point.observer_degraded,
      coverage_suspect: point.coverage_suspect,
    },
    ...(previous
      ? {
          previous: {
            week: previous.week,
            payable: previous.ready,
            not_payable: previous.not_ready,
            probed: previous.hosts_probed,
          },
        }
      : {}),
    not_a_ranking: NOT_A_RANKING,
    how_to_rederive: `Every number here is a count over ${base}/corpus/${point.sequence}.json, the signed snapshot for ${point.week} (digest ${point.digest}); recount it with your own tools and compare against the chain at ${base}/corpus.json.`,
    every_door: `${base}/doors`,
  };
}

/**
 * The brief for a named week, or the latest signed week when none is
 * named. A week the chain does not hold returns null with the weeks it
 * does — never a guessed baseline (rule 52).
 */
export function deriveWeeklyBrief(
  records: CorpusRecord[],
  base: string,
  week?: string,
): { brief: WeeklyBrief | null; known_weeks: string[] } {
  const { weeks } = deriveTrajectory(records);
  const known = weeks.map((point) => point.week);
  const index = week ? weeks.findIndex((point) => point.week === week) : weeks.length - 1;
  if (index < 0) return { brief: null, known_weeks: known };
  return {
    brief: briefOf(weeks[index]!, index > 0 ? weeks[index - 1] : undefined, base),
    known_weeks: known,
  };
}
