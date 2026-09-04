import { PREFLIGHT_BATTERY_NEXT, PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import type { SubjectHistory, SubjectRound } from "@/services/subject-history";
import { citeRow, type Citation } from "@/services/cite";

/**
 * REPRODUCE, AS ONE CALL (2026-09-04, the scorers' room's first
 * follow-up). /scorers told a reader to run the preflight and compare
 * the class of result with a signed row by hand. This is that
 * comparison, typed once: the live probe against one signed row,
 * classed by a published rule, both sides named, the row cited. It
 * is the dispute seat as an endpoint: a marketplace that is
 * challenged on a listing calls it and gets a verdict it can quote
 * with its derivation beside it.
 *
 * THE CLASS OF RESULT, defined here and nowhere else. Two probes are
 * the same class when the verdict is equal AND the set of failed
 * checks is equal, under the same battery. A different verdict or a
 * different failed set under the same battery is the DOOR moving. A
 * different battery is the INSTRUMENT moving, and the comparison is
 * still printed, but its class says the instrument first, because a
 * check the row never ran cannot have failed then. A live probe that
 * did not reach the door is a fact about the path from here, and is
 * not comparable. A week the chain does not hold for this host is
 * no_such_round, never a zero.
 */
export const RESULT_CLASS_DATED = "2026-09-04";

export type ResultClass = "same" | "moved" | "instrument_moved" | "not_comparable" | "no_such_round";

export const RESULT_CLASS_RULE: readonly { class: ResultClass; rule: string }[] = [
  { class: "same", rule: "the live verdict equals the row's verdict and the set of failed checks equals the row's set, under the same battery" },
  { class: "moved", rule: "the verdict or the set of failed checks differs from the row's, under the same battery: the door moved" },
  { class: "instrument_moved", rule: "the battery the row was taken with is not the battery run now; the verdict and the failed sets are still printed side by side, and the checks the newer battery added are named, but the class says the instrument moved first" },
  { class: "not_comparable", rule: "the live probe did not reach the door (a fact about the path from here, not the door), or the row named was not a probed row" },
  { class: "no_such_round", rule: "the chain holds no signed row for this host in the week named" },
];

export const RESULT_CLASS_NOTE =
  "The class is a function of (row verdict, row failed set, row battery, live verdict, live failed set, live battery) and nothing else. Both sides are always printed with the row cited by its entry URL and digest. A row not recorded with its battery is compared as if under the battery of its week's census and says so. One probe each side: this is two moments, never a trend.";

/** The half of a row the comparison reads. */
export interface ComparedRow {
  week: string;
  sequence: number;
  taken_at: string;
  entry_url: string;
  digest: string;
  verdict: SubjectRound["verdict"] | null;
  failed: string[];
  battery: string | null;
}

export interface LiveProbe {
  verdict: string;
  failed: string[];
  battery: string;
}

export interface Reproduction {
  rule_url: string;
  dated: string;
  asked_for: string;
  compared_with: ComparedRow | null;
  live: LiveProbe;
  class: ResultClass;
  detail: string;
  verdict_same: boolean | null;
  failed_added: string[];
  failed_cleared: string[];
  battery_same: boolean | null;
  battery_recorded: boolean;
  cite: Citation | null;
  known_weeks?: string[];
}

function sortedUnique(list: readonly string[]): string[] {
  return [...new Set(list)].sort();
}

/** The published battery id a live probe runs under, in the row's vocabulary. */
export function liveBatteryId(version: string = PREFLIGHT_VERSION_NEXT): string {
  return version.startsWith("preflight-") ? version : `preflight-${version}`;
}

/** Row from a timeline entry; null for an entry that was not probed. */
export function comparedRowOf(round: SubjectRound): ComparedRow {
  return {
    week: round.week,
    sequence: round.sequence,
    taken_at: round.taken_at,
    entry_url: round.entry_url,
    digest: round.digest,
    verdict: round.verdict ?? null,
    failed: sortedUnique(round.failed ?? []),
    battery: round.battery ?? null,
  };
}

/**
 * The comparison itself. Pure: no clock, no network. `since` is an ISO
 * week the caller named, or undefined for the last probed row.
 */
export function reproduceAgainst(
  base: string,
  host: string,
  history: Pick<SubjectHistory, "timeline">,
  live: LiveProbe,
  since?: string,
): Reproduction {
  const rule_url = `${base}/criteria#result-class`;
  const liveNormalized: LiveProbe = { ...live, failed: sortedUnique(live.failed), battery: liveBatteryId(live.battery) };
  const known = history.timeline.filter((round) => round.probed).map((round) => round.week);
  const chosen = since
    ? history.timeline.find((round) => round.week === since) ?? null
    : [...history.timeline].reverse().find((round) => round.probed) ?? null;
  const asked_for = since ?? "the last probed row";
  const empty = (cls: ResultClass, detail: string, row: ComparedRow | null): Reproduction => ({
    rule_url,
    dated: RESULT_CLASS_DATED,
    asked_for,
    compared_with: row,
    live: liveNormalized,
    class: cls,
    detail,
    verdict_same: null,
    failed_added: [],
    failed_cleared: [],
    battery_same: null,
    battery_recorded: row?.battery !== null && row?.battery !== undefined,
    cite: row ? citeRow(base, { host, ...row }) : null,
    ...(cls === "no_such_round" ? { known_weeks: known } : {}),
  });
  if (!chosen) {
    return empty(
      "no_such_round",
      since
        ? `the chain holds no signed row for ${host} in ${since}; the probed weeks it holds are ${known.length > 0 ? known.join(", ") : "none"}`
        : `the chain has never probed ${host}, so there is no row to reproduce`,
      null,
    );
  }
  const row = comparedRowOf(chosen);
  if (!chosen.probed || row.verdict === null) {
    return empty(
      "not_comparable",
      `the row for ${host} in ${chosen.week} was not a probed row (${chosen.gap ?? "no probe"}), so there is no verdict to reproduce; that gap is a fact about our coverage, not about the door`,
      row,
    );
  }
  if (liveNormalized.verdict === "unreachable") {
    return empty(
      "not_comparable",
      `the live probe did not reach the door, a fact about the path from here and not about the door, so it cannot be set against the row's ${row.verdict} in ${row.week}`,
      row,
    );
  }
  const rowBattery = row.battery ?? liveNormalized.battery;
  const battery_same = rowBattery === liveNormalized.battery;
  const verdict_same = row.verdict === liveNormalized.verdict;
  const failed_added = liveNormalized.failed.filter((name) => !row.failed.includes(name));
  const failed_cleared = row.failed.filter((name) => !liveNormalized.failed.includes(name));
  const failedSame = failed_added.length === 0 && failed_cleared.length === 0;
  const batteryNote = row.battery === null ? ` The row did not record its battery and is compared as if under ${liveNormalized.battery}.` : "";
  let cls: ResultClass;
  let detail: string;
  if (!battery_same) {
    cls = "instrument_moved";
    detail = `the row in ${row.week} was taken under ${rowBattery}; the live probe ran ${liveNormalized.battery}. Verdict ${row.verdict} then, ${liveNormalized.verdict} now${failed_added.length > 0 ? `; failing now and not then: ${failed_added.join(", ")}` : ""}${failed_cleared.length > 0 ? `; failing then and not now: ${failed_cleared.join(", ")}` : ""}. A check the row never ran cannot have failed then, so the instrument moved first; read the battery delta before reading the door.`;
  } else if (verdict_same && failedSame) {
    cls = "same";
    detail = `the door answered ${liveNormalized.verdict} now with the same failed set as the signed row in ${row.week}${row.failed.length > 0 ? ` (${row.failed.join(", ")})` : " (none)"}, under ${liveNormalized.battery}.${batteryNote}`;
  } else {
    cls = "moved";
    detail = `under ${liveNormalized.battery}, the row in ${row.week} read ${row.verdict}${row.failed.length > 0 ? ` (${row.failed.join(", ")})` : ""} and the door answered ${liveNormalized.verdict} now${failed_added.length > 0 ? `; failing now and not then: ${failed_added.join(", ")}` : ""}${failed_cleared.length > 0 ? `; failing then and not now: ${failed_cleared.join(", ")}` : ""}. Two moments, not a trend.${batteryNote}`;
  }
  return {
    rule_url,
    dated: RESULT_CLASS_DATED,
    asked_for,
    compared_with: row,
    live: liveNormalized,
    class: cls,
    detail,
    verdict_same,
    failed_added,
    failed_cleared,
    battery_same,
    battery_recorded: row.battery !== null,
    cite: citeRow(base, { host, ...row }),
  };
}

/** An ISO week as every corpus route spells it. */
export function isIsoWeek(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{4}-W[0-9]{2}$/.test(value);
}

export const REPRODUCE_BATTERY = PREFLIGHT_BATTERY_NEXT;
