import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { StudyRecord, StudyLeg } from "@/services/field-study";
import type { Env } from "@/types";

/*
 * THE COLLECTOR CANNOT PAY, and this module sits on the collector's
 * side of that line — the same ruling crowd-walks.ts is written under
 * and for the same reason. Borrowing field-study's own reader would
 * borrow with it a path to the field signer, and a module that only
 * counts has no business being one import from a module that signs.
 * The records are read straight off KV; the type import above erases.
 */

/**
 * WHAT THE STUDIES SHOW (FIELD_STUDY.md).
 *
 * The reason to pay for a study is not the study. It is this table,
 * which is the only place in the whole store where the question "what
 * is it actually like to shop here" has a number beside it.
 *
 * The rule that shapes every row below is the one the store applies to
 * its own corpus: a verdict never appears without its derivation and
 * its denominator. Six studies is six studies. A settle rate over four
 * legs says four legs. Where the denominator is small this says so in
 * the row rather than in a footnote nobody reads, because a percentage
 * of three is a sentence about three things wearing a percentage's
 * clothes.
 *
 * TWO TIERS, NEVER BLENDED, exactly as the bounty board keeps them:
 *
 *   observed  our own books. Which door, which protocol, which rail,
 *             settled or not. We do not need the researcher to be
 *             honest for any of this to be true.
 *   declared  what they told us — the model, the harness, the task,
 *             and every word of free text. Theirs, labelled, quoted
 *             rather than summarised, and never counted as if it were
 *             a measurement.
 *
 * The most interesting row in here is the one that compares the two:
 * `surface_confusion` counts the studies that believed they were using
 * a surface our books recorded differently. That is not a researcher
 * getting it wrong. It is the store finding out that what it calls a
 * door and what an agent calls a door are different things, which is
 * the sort of thing no amount of reading our own logs would ever
 * surface.
 */
export interface StudyFindings {
  /** The denominator for everything below it. */
  studies: number;
  legs: number;
  settled_legs: number;
  /** Distinct models and harnesses that have ever completed a study. */
  distinct_models: number;
  distinct_harnesses: number;
  /** OURS: per observed door+protocol, how it went. */
  surfaces: SurfaceFinding[];
  /** OURS: per observed rail, how it went. */
  rails: RailFinding[];
  /** OURS vs THEIRS: legs whose declared surface our books recorded differently. */
  surface_confusion: {
    legs: number;
    of_legs: number;
    examples: string[];
  };
  /** THEIRS: the counted answers. */
  would_return: { yes: number; no: number; unclear: number };
  abandoned_something: { studies: number; of_studies: number };
  prior_x402: { yes: number; no: number };
  autonomy: Record<string, number>;
  harnesses: Record<string, number>;
  models: Record<string, number>;
  /** THEIRS: defects noticed along the way, by their own severity call. */
  defects: { total: number; blocking: number; annoying: number; cosmetic: number; unrated: number };
  /** THEIRS, verbatim: the free text, quoted rather than summarised. */
  voices: StudyVoice[];
  /**
   * TRUE WHEN THE SCAN HIT ITS CAP, and the whole page is then a
   * FLOOR rather than a count (house rule: a lookup that cannot see
   * everything must not answer as though it could). Every number above
   * is computed from the records this read reached; if there are more
   * on file than the cap admits, saying "12 studies" would be answering
   * a question this read did not ask. The caveat says so in words as
   * well, because the flag is for a parser and the sentence is for the
   * reader who will quote the number.
   */
  truncated: boolean;
  /** Said out loud wherever the numbers are thin. */
  caveat: string;
}

export interface SurfaceFinding {
  /** The door and protocol our own books recorded. */
  observed: string;
  studies: number;
  legs: number;
  settled: number;
}

export interface RailFinding {
  network: string;
  studies: number;
  legs: number;
  settled: number;
}

/**
 * ONE RESEARCHER'S WORDS, kept whole.
 *
 * WHAT RIDES AND WHAT DOES NOT, and this is the promise the debrief
 * door makes at the moment of payment, kept here: the model and the
 * harness ride, because "a Claude-family agent on ClawHub could not
 * find the price" is a finding and "somebody could not find the price"
 * is not. The operator string and the payout address never ride, in
 * any aggregate, ever. A stranger's stated intent, their model, their
 * operator and their wallet published on one row is a dossier, and
 * this store has no business keeping one in the window.
 *
 * Summarising was considered and refused. A paraphrase of a complaint
 * is this store deciding what the complaint was, which is exactly the
 * grading the reward refuses to do — it would be odd to refuse it with
 * money and then do it with prose.
 */
export interface StudyVoice {
  at: string;
  model: string;
  harness: string;
  autonomy: string;
  first_read: string;
  price_read: string;
  hardest_step: string;
  abandoned: string;
  surprises: string;
  compared_to: string;
  would_return: string;
}

/** Studies read for one aggregate. Bounded; the instrument's own scale. */
const STUDY_SCAN_CAP = 300;
/** Voices published on the room. Newest first; the rest are on the desk. */
const VOICE_CAP = 25;

/**
 * "NOTHING HAPPENED" IN THE WORDS AN AGENT ACTUALLY USES.
 *
 * `abandoned` is a required question whose honest answer is very often
 * "nothing", so counting a non-empty string as an abandonment would
 * report 100% abandonment forever. Matching a short list of negations
 * is a heuristic and it is WRONG sometimes — "nothing blocked me but
 * the MCP door took three tries" reads as a negation and is not one.
 * So the number is published as what it is (a count of answers that
 * did not begin with a negation) and the voices are published beside
 * it in full, so a reader who distrusts the heuristic can check every
 * answer themselves. A derived number whose derivation is printed is
 * allowed to be imperfect; one whose derivation is hidden is not.
 */
const NOTHING = /^\s*(nothing|none|n\/a|na|no|never|nope|nothing\.|no abandonment)\b/i;

function isYes(answer: string): "yes" | "no" | "unclear" {
  const text = answer.trim().toLowerCase();
  if (/^(true|yes\b|y\b)/.test(text)) return "yes";
  if (/^(false|no\b|n\b)/.test(text)) return "no";
  return "unclear";
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

/** The aggregate, off debriefed studies alone. Exported for the test. */
export function findingsFrom(
  records: readonly StudyRecord[],
  truncated = false,
): StudyFindings {
  const debriefed = records
    .filter((record) => record.status === "debriefed" && record.debrief)
    .sort((a, b) => (b.debrief?.at ?? "").localeCompare(a.debrief?.at ?? ""));

  const surfaces = new Map<string, { studies: Set<string>; legs: number; settled: number }>();
  const rails = new Map<string, { studies: Set<string>; legs: number; settled: number }>();
  const harnesses: Record<string, number> = {};
  const models: Record<string, number> = {};
  const autonomy: Record<string, number> = {};
  const wouldReturn = { yes: 0, no: 0, unclear: 0 };
  const priorX402 = { yes: 0, no: 0 };
  const defects = { total: 0, blocking: 0, annoying: 0, cosmetic: 0, unrated: 0 };
  const confusionExamples: string[] = [];
  const voices: StudyVoice[] = [];
  let legs = 0;
  let settledLegs = 0;
  let confusedLegs = 0;
  let abandonedStudies = 0;

  for (const record of debriefed) {
    const debrief = record.debrief!;
    bump(harnesses, record.roster.harness_other ?? record.roster.harness);
    bump(models, record.roster.model);
    bump(autonomy, record.roster.autonomy);
    record.roster.prior_x402 ? (priorX402.yes += 1) : (priorX402.no += 1);
    wouldReturn[isYes(debrief.answers.would_return)] += 1;
    if (!NOTHING.test(debrief.answers.abandoned)) abandonedStudies += 1;

    for (const leg of debrief.legs as StudyLeg[]) {
      legs += 1;
      if (leg.observed.settled) settledLegs += 1;
      if (leg.mismatch) {
        confusedLegs += 1;
        if (confusionExamples.length < 8) {
          confusionExamples.push(
            `declared \`${leg.declared.surface}\`, our books recorded \`${leg.observed.door}\``,
          );
        }
      }
      const surfaceKey = `${leg.observed.door}+${leg.observed.protocol}`;
      const surface = surfaces.get(surfaceKey) ?? { studies: new Set(), legs: 0, settled: 0 };
      surface.studies.add(record.study_id);
      surface.legs += 1;
      if (leg.observed.settled) surface.settled += 1;
      surfaces.set(surfaceKey, surface);

      const railKey = leg.observed.network.toLowerCase();
      const rail = rails.get(railKey) ?? { studies: new Set(), legs: 0, settled: 0 };
      rail.studies.add(record.study_id);
      rail.legs += 1;
      if (leg.observed.settled) rail.settled += 1;
      rails.set(railKey, rail);
    }

    for (const defect of debrief.defects ?? []) {
      defects.total += 1;
      if (defect.severity === "blocking") defects.blocking += 1;
      else if (defect.severity === "annoying") defects.annoying += 1;
      else if (defect.severity === "cosmetic") defects.cosmetic += 1;
      else defects.unrated += 1;
    }

    if (voices.length < VOICE_CAP) {
      voices.push({
        at: debrief.at,
        model: record.roster.model,
        harness: record.roster.harness_other ?? record.roster.harness,
        autonomy: record.roster.autonomy,
        ...debrief.answers,
      });
    }
  }

  const finding = (
    map: Map<string, { studies: Set<string>; legs: number; settled: number }>,
  ) =>
    [...map.entries()]
      .map(([key, value]) => ({
        key,
        studies: value.studies.size,
        legs: value.legs,
        settled: value.settled,
      }))
      .sort((a, b) => b.legs - a.legs);

  return {
    studies: debriefed.length,
    legs,
    settled_legs: settledLegs,
    distinct_models: Object.keys(models).length,
    distinct_harnesses: Object.keys(harnesses).length,
    surfaces: finding(surfaces).map(({ key, ...rest }) => ({ observed: key, ...rest })),
    rails: finding(rails).map(({ key, ...rest }) => ({ network: key, ...rest })),
    surface_confusion: {
      legs: confusedLegs,
      of_legs: legs,
      examples: confusionExamples,
    },
    would_return: wouldReturn,
    abandoned_something: { studies: abandonedStudies, of_studies: debriefed.length },
    prior_x402: priorX402,
    autonomy: sortCounts(autonomy),
    harnesses: sortCounts(harnesses),
    models: sortCounts(models),
    defects,
    voices,
    truncated,
    caveat: `${caveatFor(debriefed.length, legs)}${
      truncated
        ? ` And this read hit its own cap of ${STUDY_SCAN_CAP} records, so every figure above is a FLOOR and not a count — there are studies on file this page did not reach. Raise the cap or page the scan before quoting any of it.`
        : ""
    }`,
  };
}

/**
 * THE DENOMINATOR, SAID OUT LOUD, and it changes as the instrument
 * fills. A store that publishes "60% of agents could not find the
 * price" off five studies has published a rumour with a decimal point
 * in it. The caveat is derived from the count rather than written once
 * and left to rot, so the page cannot keep apologising for a sample it
 * has long outgrown — or stop apologising for one it has not.
 */
export function caveatFor(studies: number, legs: number): string {
  if (studies === 0) {
    return "No study has been debriefed yet. Every number on this page is zero because nothing has happened, not because nothing went wrong.";
  }
  if (studies < 5) {
    return `${studies} ${studies === 1 ? "study" : "studies"}, ${legs} ${legs === 1 ? "leg" : "legs"}. This is far too few to be a rate and nothing here should be read as one: treat every row as a list of specific things that specifically happened, and read the voices, which are the whole of the evidence at this size.`;
  }
  if (studies < 20) {
    return `${studies} studies, ${legs} legs. Enough to notice a pattern and nowhere near enough to size one. A surface that failed twice here has failed twice — it has not "failed 40% of the time".`;
  }
  return `${studies} studies, ${legs} legs. Large enough that the surface and rail rows are worth comparing to each other; still a self-selected sample of agents willing to be paid to shop, which is not the same population as agents that shop. That bias runs one way and it is worth naming: a paid researcher finishes walks a real buyer would have abandoned, so every settle rate here is an upper bound.`;
}

/** The aggregate, off KV. One bounded prefix read. */
export async function studyFindings(env: Env): Promise<StudyFindings> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.studyPrefix,
    cap: STUDY_SCAN_CAP,
  });
  const values = await bulkGetJson<StudyRecord>(env.COUNTERS, listed.names);
  const records = [...values.values()].filter((record): record is StudyRecord =>
    Boolean(record),
  );
  /*
   * THE FLAG IS READ, not assumed away. `listKeys` returns `truncated`
   * beside its names precisely so a caller cannot publish a count it
   * could not take, and the instrument this page describes is one whose
   * whole selling point is that a verdict arrives with its denominator.
   * It would be a poor advertisement for that if the page reporting it
   * quietly rounded its own denominator down.
   */
  return findingsFrom(records, listed.truncated);
}
