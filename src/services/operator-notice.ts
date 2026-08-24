import { DEFECT_CLASSES, type DefectClass } from "@/store/defect-vocabulary";
import { subjectHistory, type SubjectRound } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE LETTER TO THE OPERATOR, AND HOW IT REACHES THEM WITHOUT A MAILBOX.
 *
 * A free check that finds a defect and tells nobody has done half a
 * job. The operator is the one party who can fix the door and the one
 * party who cannot see the problem: a payTo with no token account 402s
 * perfectly, passes every structural check, and simply never gets
 * paid. From their own logs it looks like a shop with no customers.
 *
 * WE HAVE NO MAILBOX, AND THIS IS BETTER THAN ONE ANYWAY. Cold
 * outbound mail about somebody's broken endpoint is the exact shape
 * spam filters punish, and it would put the store's own domain
 * reputation behind a message most recipients never asked for. The
 * channel we already have is the one identity.ts named on 2026-07-30:
 * our user-agent is in their access log, and an operator whose door
 * takes no money is READING THAT LOG. So the notice sits at a stable
 * path, and the calling card in the log is the thing that leads here.
 *
 * BE HONEST ABOUT THE REACH. This finds operators who read their logs
 * and nobody else. It is strictly more than the nothing we had, and
 * strictly less than delivery. When there is a mailbox, the notice
 * below is already the letter body — the composition does not change,
 * only the carriage.
 *
 * NOT PUBLISHED, AND THAT IS THE NAMING LAW, NOT SHYNESS. The census
 * counts failing doors in aggregates and names nobody; only the
 * ready side is ever listed. A per-host notice is reachable by an
 * operator who knows their own hostname and is linked from no index,
 * named in no listing, and marked noindex. Unlisted is not secret:
 * the page says so about itself, because a page that hid its own
 * status would be doing something the store does not do.
 *
 * DERIVED ON READ, NEVER PROBED ON READ. Every word comes from
 * observations already in the signed chain. A GET here makes no
 * outbound request, so nobody can point this route at a third party
 * and use the store as a prober.
 */

/** A finding, with the vocabulary entry that explains what it means. */
export interface NoticeFinding {
  /** The check name as the census recorded it. */
  signal: string;
  /** The published class, when the signal maps to one. */
  defect_class: string | null;
  asserts: string | null;
  costs: string | null;
  falsified_by: string | null;
  /** True when we could see this without anybody paying. */
  seen_unpaid: boolean;
}

export interface OperatorNotice {
  host: string;
  as_of: string;
  /** What the store is, for a reader who arrived from a log line. */
  why_you_are_reading_this: string;
  /** Null when we have listed the host but never knocked on it. */
  last_observation: {
    at: string;
    week: string;
    url: string | null;
    verdict: string;
    findings: NoticeFinding[];
    advisories: string[];
  } | null;
  /** Our own coverage of this host, stated against us. */
  our_coverage: {
    rounds_since_we_met_you: number;
    rounds_we_probed: number;
    first_seen: string | null;
    last_seen: string | null;
    history_url: string;
  };
  listing_status: string;
  what_this_is_not: string[];
  how_to_answer: string[];
}

/** Reverse index from a check name to the class that explains it. */
const BY_SIGNAL: ReadonlyMap<string, DefectClass> = new Map(
  DEFECT_CLASSES.flatMap((entry) =>
    entry.our_signal ? [[entry.our_signal, entry] as const] : [],
  ),
);

/** The published class for a raw check name, when one is mapped. */
export function defectBySignal(signal: string): DefectClass | undefined {
  return BY_SIGNAL.get(signal);
}

function toFinding(signal: string): NoticeFinding {
  const entry = defectBySignal(signal);
  return {
    signal,
    defect_class: entry?.id ?? null,
    asserts: entry?.asserts ?? null,
    costs: entry?.costs ?? null,
    falsified_by: entry?.falsified_by ?? null,
    /*
     * An unmapped signal defaults to unpaid because every check the
     * census runs IS unpaid — the paid classes come from the launch
     * check, which does not feed this route. Claiming otherwise would
     * tell an operator we spent money we did not spend.
     */
    seen_unpaid: entry ? entry.detectable === "unpaid" : true,
  };
}

/** The most recent round that actually produced a verdict. */
function lastProbed(timeline: SubjectRound[]): SubjectRound | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const round = timeline[index]!;
    if (round.probed) return round;
  }
  return null;
}

/**
 * Compose the notice for one host, or null when we have never so much
 * as seen the name. Silence about a stranger is the correct output:
 * inventing a page for any hostname somebody types would turn this
 * into a directory of every domain on the internet.
 */
export async function buildOperatorNotice(
  env: Env,
  rawHost: string,
  base: string,
  now: Date = new Date(),
): Promise<OperatorNotice | null> {
  const host = rawHost.trim().toLowerCase();
  const history = await subjectHistory(env, host, base, now);

  const known =
    history.listing !== null || history.timeline.some((round) => round.probed);
  if (!known) return null;

  const probed = lastProbed(history.timeline);

  return {
    host,
    as_of: now.toISOString(),
    why_you_are_reading_this:
      "This store walks the public x402 directories once a week and records what each door answered. If you found us in your access log, that was our calling card — scvd-general-store, or scvd-walkabout on a paid walk. This page is everything we observed about your endpoint, free, with the method attached so you can check it rather than take our word.",
    last_observation: probed
      ? {
          at: probed.taken_at,
          week: probed.week,
          url: probed.url ?? null,
          verdict: probed.verdict ?? "unknown",
          findings: (probed.failed ?? []).map(toFinding),
          advisories: probed.advisories ?? [],
        }
      : null,
    our_coverage: {
      rounds_since_we_met_you: history.rounds_since_first_sighting,
      rounds_we_probed: history.rounds_probed,
      first_seen: history.listing?.first_seen ?? null,
      last_seen: history.listing?.last_seen ?? null,
      history_url: `${base}/corpus/host/${host}.json`,
    },
    listing_status:
      "This page is not linked from any index of ours, named in no listing, and served noindex. Doors that failed a round are counted in our public aggregates and never named there; only the ready side is listed. Nothing on this page is published about you anywhere else. It is unlisted, which is not the same as secret — you are reading it, and so could anyone who knows your hostname.",
    what_this_is_not: [
      "Not a score and not a ranking. Every line is one observation at one dated moment; nothing here accumulates across weeks into a judgment on you.",
      "Not a statement that your service is down. We check the SHAPE of a payment challenge, never whether what sits behind it works.",
      "Not a bill, not a sales call, and not a condition on anything. The check was free, this page is free, and there is nothing to buy to make it go away.",
    ],
    how_to_answer: [
      `Disagree with a finding? Every class we use is defined at ${base}/defects, including what would prove it wrong. Show that and the observation is corrected in place with the date — this store appends corrections and never overwrites them.`,
      `Want the current state rather than last week's? POST {"url":"<your endpoint>"} to ${base}/api/preflight/v2. Free, no account, no wallet, and it runs the same checks you see above.`,
      `Want our whole record on you, including the weeks we did NOT look and why? ${base}/corpus/host/${host}.json.`,
    ],
  };
}
