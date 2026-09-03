import type { CorpusRecord } from "@/services/corpus";
import { deriveTrajectory, type WeekPoint } from "@/services/trajectory";
import { defectClass } from "@/store/defect-vocabulary";

/**
 * THE STATE OF x402, BY MONTH (2026-09-03, roadmap V5). The weekly
 * brief answers "what did this Sunday's round see"; this answers the
 * question press and researchers actually ask, which is monthly:
 * how many doors were listed, how many answered, how many could be
 * paid, which defects by name, and how that compares with the month
 * before. Derived at request from the same signed chain the brief
 * reads — every number is a count over snapshots anyone can fetch and
 * recount — and nothing here is stored.
 *
 * TWO KINDS OF NUMBER, KEPT APART. A month holds several rounds, and
 * a door probed in four rounds was probed four times. So the month
 * carries (a) its CLOSING reading — the last signed week's counts,
 * which is what "the state at month end" means — and (b) its
 * DOOR-WEEK totals — every round's counts summed, labelled as such,
 * which is what "how much did the round see this month" means. The
 * page never divides one by the other and never prints a share; a
 * reader with the two numbers can.
 *
 * NEVER A RANKING. No host is named. The comparison with the month
 * before is two closing readings side by side, and the direction is
 * the reader's to read.
 */

export interface MonthDefect {
  id: string;
  title: string;
  /** Door-weeks carrying this failed check across the month's rounds. */
  door_weeks: number;
}

export interface MonthReading {
  listed: number;
  probed: number;
  payable: number;
  not_payable: number;
  unreachable: number;
  offers_seen: number;
}

export interface MonthState {
  artifact: "monthly_state";
  name: "The state of x402";
  month: string;
  /** The signed weeks the month is read from, in chain order. */
  weeks: { week: string; sequence: number; digest: string; taken_at: string }[];
  /** Batteries the month's verdicts cite, when the rows say. */
  batteries: string[];
  /** The last signed week of the month: the state at month end. */
  closing: MonthReading & { week: string };
  /** Every round's counts summed: door-weeks, not doors. */
  door_weeks: MonthReading & { rounds: number };
  /** Failed checks by registered name, in door-weeks, most frequent first. */
  defects: MonthDefect[];
  /** Doors per chain at the closing week, from the offers' own declarations. */
  networks: Record<string, number>;
  our_gaps: {
    not_probed_door_weeks: number;
    observer_degraded_ticks: number;
    coverage_suspect_weeks: number;
  };
  /** The month before's closing reading beside this one; absent for the first month on the chain. */
  against_the_last?: { month: string; closing: MonthReading & { week: string } };
  what_this_is_not: string;
  how_to_rederive: string;
}

export const MONTHLY_NOT_A_RANKING =
  "Counts with their denominators, for one calendar month of signed rounds. No door is named; the closing reading is the last signed week's, and the door-week totals are every round's counts summed and labelled as such, never divided into a share. The month before is beside this one as two readings, and the direction is the reader's to read. Never a ranking, and never a verdict without its derivation and denominator beside it.";

function reading(point: WeekPoint): MonthReading {
  return {
    listed: point.hosts_listed,
    probed: point.hosts_probed,
    payable: point.ready,
    not_payable: point.not_ready,
    unreachable: point.unreachable,
    offers_seen: point.offers_seen,
  };
}

function sum(points: WeekPoint[]): MonthReading & { rounds: number } {
  return points.reduce(
    (acc, point) => ({
      rounds: acc.rounds + 1,
      listed: acc.listed + point.hosts_listed,
      probed: acc.probed + point.hosts_probed,
      payable: acc.payable + point.ready,
      not_payable: acc.not_payable + point.not_ready,
      unreachable: acc.unreachable + point.unreachable,
      offers_seen: acc.offers_seen + point.offers_seen,
    }),
    { rounds: 0, listed: 0, probed: 0, payable: 0, not_payable: 0, unreachable: 0, offers_seen: 0 },
  );
}

/** The calendar month a snapshot was taken in, UTC. */
export function monthOf(point: Pick<WeekPoint, "taken_at">): string {
  return point.taken_at.slice(0, 7);
}

function stateOf(month: string, points: WeekPoint[], previous: { month: string; points: WeekPoint[] } | undefined, base: string): MonthState {
  const closingPoint = points[points.length - 1]!;
  const defects = new Map<string, number>();
  for (const point of points) {
    for (const [id, count] of Object.entries(point.failure_classes)) {
      defects.set(id, (defects.get(id) ?? 0) + count);
    }
  }
  const previousClosing = previous ? previous.points[previous.points.length - 1]! : undefined;
  return {
    artifact: "monthly_state",
    name: "The state of x402",
    month,
    weeks: points.map((point) => ({ week: point.week, sequence: point.sequence, digest: point.digest, taken_at: point.taken_at })),
    batteries: [...new Set(points.map((point) => point.battery).filter((battery): battery is string => Boolean(battery)))],
    closing: { week: closingPoint.week, ...reading(closingPoint) },
    door_weeks: sum(points),
    defects: [...defects.entries()]
      .map(([id, door_weeks]) => ({ id, title: defectClass(id)?.title ?? id, door_weeks }))
      .sort((a, b) => b.door_weeks - a.door_weeks || a.id.localeCompare(b.id)),
    networks: closingPoint.networks,
    our_gaps: {
      not_probed_door_weeks: points.reduce((acc, point) => acc + point.not_probed, 0),
      observer_degraded_ticks: points.reduce((acc, point) => acc + point.observer_degraded, 0),
      coverage_suspect_weeks: points.filter((point) => point.coverage_suspect).length,
    },
    ...(previous && previousClosing
      ? { against_the_last: { month: previous.month, closing: { week: previousClosing.week, ...reading(previousClosing) } } }
      : {}),
    what_this_is_not: MONTHLY_NOT_A_RANKING,
    how_to_rederive: `Every number here is a count over the signed snapshots ${points.map((point) => `${base}/corpus/${point.sequence}.json`).join(", ")} (weeks ${points.map((point) => point.week).join(", ")}); recount them with your own tools and compare against the chain at ${base}/corpus.json.`,
  };
}

/**
 * One state per calendar month on the chain, oldest first; the caller
 * picks. `known_months` is the whole list so a page can link them.
 */
export function deriveMonthlyStates(records: CorpusRecord[], base: string): MonthState[] {
  return statesFromPoints(deriveTrajectory(records).weeks, base);
}

/** The same derivation over trajectory points already in hand; the unit the tests hold. */
export function statesFromPoints(weeks: readonly WeekPoint[], base: string): MonthState[] {
  const byMonth = new Map<string, WeekPoint[]>();
  for (const point of weeks) {
    const month = monthOf(point);
    byMonth.set(month, [...(byMonth.get(month) ?? []), point]);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  return months.map(([month, points], index) => {
    const before = index > 0 ? months[index - 1] : undefined;
    return stateOf(month, points, before ? { month: before[0], points: before[1] } : undefined, base);
  });
}

export function deriveMonthlyState(
  records: CorpusRecord[],
  base: string,
  month?: string,
): { state: MonthState | null; known_months: string[] } {
  const states = deriveMonthlyStates(records, base);
  const known = states.map((state) => state.month);
  const found = month ? states.find((state) => state.month === month) : states[states.length - 1];
  return { state: found ?? null, known_months: known };
}
