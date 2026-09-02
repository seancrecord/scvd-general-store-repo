import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { ladderRung } from "@/services/menu-markdown";
import { DEPTH_HOLD_SECONDS } from "@/services/archive-depth";
import {
  decisionOf,
  freshnessOf,
  effectiveObservation,
  type AgentDecision,
  type FreshnessState,
} from "@/services/passport";
import { deriveTier, tierInputFromHistory, type TierReading } from "@/services/passport-tier";
import {
  PREFLIGHT_VERSION_NEXT,
  preflightUrl,
  type PreflightReport,
} from "@/services/preflight";
import type { SubjectHistory, SubjectRound } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE LOOK (roadmap L6, named by the keeper 2026-09-02): "what do you
 * hold about this door?" answered in one free call.
 *
 * Two halves, kept apart on the artifact because they are two
 * different kinds of fact. NOW is one live probe of the door — the
 * same preflightUrl() the free preflight serves, same battery, same
 * limiter, same refusals, so this door cannot be used to walk around
 * the rate limit and cannot disagree with the preflight about what a
 * probe saw. HELD is what the signed chain already carries about the
 * host: the rounds since we first met it, the tier with its fraction
 * and its rows, the last probed round with its failed checks and the
 * catalog's agreement, the passport decision, the shared-wallet fact.
 * Nothing in HELD comes from the probe; nothing in NOW comes from the
 * chain.
 *
 * NEVER A SCORE. The row L6 grew from said "not a wallet trust score,
 * not KYA", and the doctrine sentence says the rest: never a ranking,
 * and never a verdict without its derivation and denominator beside
 * it. So the held half is counts with their denominators and the
 * tier line the passport already prints, and the one comparison this
 * door adds — did the door answer now the way the last signed round
 * saw it — is stated as same, changed, or no_prior, with both sides
 * named. A threshold ("is it safe") is the reader's to draw and is
 * not offered.
 *
 * THE HOLD. Folding the chain for one host reads the whole corpus,
 * which is what the S7 depth did on every free 402 the morning after
 * it shipped and cost three doors a few hundred milliseconds each.
 * The held half is derived once per host and kept in KV for the same
 * hold the depth uses; the live half is never held.
 */

export const LOOK_VERSION = "v1";
export const LOOK_HOLD_SECONDS = DEPTH_HOLD_SECONDS;

export type HoldLine = "same" | "changed" | "no_prior" | "not_comparable";

export interface HeldHalf {
  host: string;
  /** Neither the census nor a paid refresh has ever seen this host. */
  never_met: boolean;
  rounds_in_chain: number;
  rounds_since_first_sighting: number;
  rounds_probed: number;
  rounds_gapped: number;
  first_observed: string | null;
  last_observed: string | null;
  gaps_by_reason: SubjectHistory["gaps_by_reason"];
  /** The passport's derived tier, with its fraction and its rows: it never travels without them. */
  tier: TierReading;
  /** The passport's four-way decision over the newest signed observation, and the freshness it came from. */
  passport: {
    decision: AgentDecision;
    freshness: FreshnessState;
    observed_at: string | null;
    verdict: string | null;
    source: "census" | "paid_refresh" | null;
    url: string;
  };
  /** The last round that actually knocked, with what it found. Null when none did. */
  last_probed_round: {
    week: string;
    taken_at: string;
    url?: string;
    verdict?: SubjectRound["verdict"];
    failed: string[];
    advisories: string[];
    catalog?: SubjectRound["catalog"];
    offer?: SubjectRound["offer"];
    entry_url: string;
  } | null;
  verdict_changes: number;
  /** The host's own shared-wallet fact, when the chain has met it (G2 ruling). */
  payment_address?: SubjectHistory["payment_address"];
  standing_note?: SubjectHistory["standing_note"];
  what_this_cannot_see: string[];
  rows_url: string;
  derived_at: string;
  held_for_seconds: number;
}

export interface LookReport {
  version: string;
  url: string;
  host: string;
  asked_at: string;
  /** One sentence, derived: what the door said now and what the chain holds. */
  headline: string;
  now: {
    battery: string;
    verdict: PreflightReport["verdict"];
    observed_at: string;
    failed: string[];
    advisories: string[];
    /** The whole preflight, carried rather than summarized, so this and the free preflight can never be quoted against each other. */
    the_door: PreflightReport;
  };
  held: HeldHalf;
  /**
   * The one comparison this door adds: the live answer against the
   * last signed round. Both sides named; no number.
   */
  now_against_held: {
    line: HoldLine;
    detail: string;
  };
  counts_travel_with_denominators: string;
  what_this_is_not: string;
  the_ladder: {
    free_first: Record<string, string>;
    paid: Record<string, unknown>[];
  };
  next_steps: Record<string, string>;
}

interface HeldEnvelope {
  derived_at: string;
  held: HeldHalf;
}

export const NOT_A_SCORE =
  "Not a score, a rating, a rank, or a safety threshold. Two kinds of fact, kept apart: what the door answered to one probe just now, and what the signed chain already holds about the host, as counts with their denominators and the tier line with its fraction and rows. Whether that is enough to pay is the reader's decision; this store does not draw the line and sells nothing that would.";

const DENOMINATORS =
  "Every count here travels with the number it is out of — rounds probed out of rounds since first sighting, ready rounds out of rounds in the tier's window — and no share or percentage is served, so a reader divides for themselves and can see when the denominator is small.";

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/** The chain's half, folded once and held. Exported for the specimen and the tests. */
export async function heldHalfOf(env: Env, host: string, now: Date = new Date()): Promise<HeldHalf> {
  const base = env.STORE_BASE_URL;
  const observation = await effectiveObservation(env, host, now);
  const history = observation.history;
  const tier = deriveTier(tierInputFromHistory(history, observation), `${base}/criteria`);
  const freshness = freshnessOf(observation.observed_at, observation.verdict ?? undefined, now);
  const last = [...history.timeline].reverse().find((round) => round.probed) ?? null;
  return {
    host,
    never_met: observation.never_observed,
    rounds_in_chain: history.rounds_in_chain,
    rounds_since_first_sighting: history.rounds_since_first_sighting,
    rounds_probed: history.rounds_probed,
    rounds_gapped: history.rounds_gapped,
    first_observed: history.first_observed,
    last_observed: history.last_observed,
    gaps_by_reason: history.gaps_by_reason,
    tier,
    passport: {
      decision: decisionOf(freshness),
      freshness,
      observed_at: observation.observed_at,
      verdict: observation.verdict,
      source: observation.verdict === null ? null : observation.refreshIsNewest ? "paid_refresh" : "census",
      url: `${base}/passport/${host}`,
    },
    last_probed_round: last
      ? {
          week: last.week,
          taken_at: last.taken_at,
          ...(last.url ? { url: last.url } : {}),
          ...(last.verdict ? { verdict: last.verdict } : {}),
          failed: last.failed ?? [],
          advisories: last.advisories ?? [],
          ...(last.catalog ? { catalog: last.catalog } : {}),
          ...(last.offer ? { offer: last.offer } : {}),
          entry_url: last.entry_url,
        }
      : null,
    verdict_changes: history.verdict_changes.length,
    ...(history.payment_address ? { payment_address: history.payment_address } : {}),
    ...(history.standing_note ? { standing_note: history.standing_note } : {}),
    what_this_cannot_see: history.what_this_cannot_see,
    rows_url: `${base}/corpus/host/${host}.json`,
    derived_at: now.toISOString(),
    held_for_seconds: LOOK_HOLD_SECONDS,
  };
}

/** Serve the held fold while it is younger than the hold; otherwise fold, hold, serve. */
async function heldHalf(env: Env, host: string, now: Date): Promise<HeldHalf> {
  const key = KV_KEYS.look(host);
  const stored = await kvGetJson<HeldEnvelope>(env.COUNTERS, key, "json").catch(() => null);
  if (stored?.derived_at && stored.held) {
    const age = (now.getTime() - Date.parse(stored.derived_at)) / 1000;
    if (Number.isFinite(age) && age >= 0 && age < LOOK_HOLD_SECONDS) return stored.held;
  }
  const held = await heldHalfOf(env, host, now);
  await kvPut(env.COUNTERS, key, JSON.stringify({ derived_at: held.derived_at, held } satisfies HeldEnvelope), {
    expirationTtl: LOOK_HOLD_SECONDS,
  }).catch(() => undefined);
  return held;
}

/** The live answer against the last signed round: same, changed, or nothing to compare with. */
export function nowAgainstHeld(now: PreflightReport["verdict"], held: HeldHalf): LookReport["now_against_held"] {
  const last = held.last_probed_round;
  if (!last || !last.verdict) {
    return {
      line: "no_prior",
      detail: held.never_met
        ? "the signed chain has never probed this host, so there is nothing to compare the live answer with; the first signed round would be Sunday's, if a feed names it"
        : "no signed round has a verdict for this host yet, so there is nothing to compare the live answer with",
    };
  }
  if (now === "unreachable") {
    return {
      line: "not_comparable",
      detail: `the live probe did not reach the door (a fact about the path from here, not about the door), so it cannot be set against the last signed round's ${last.verdict} in ${last.week}`,
    };
  }
  const same = now === last.verdict;
  return {
    line: same ? "same" : "changed",
    detail: same
      ? `the door answered ${now} now, as the last signed round saw it in ${last.week}`
      : `the door answered ${now} now; the last signed round saw ${last.verdict} in ${last.week}. One probe each side, so this is two moments and not a trend`,
  };
}

function headlineOf(url: string, now: LookReport["now"], held: HeldHalf): string {
  const door = `The door at ${url} answered ${now.verdict} to one probe at ${now.observed_at}${now.failed.length > 0 ? ` (failed: ${now.failed.join(", ")})` : ""}.`;
  if (held.never_met) {
    return `${door} The signed chain has never met ${held.host}: no round has probed it, so there is no history to weigh and no tier to read.`;
  }
  const catalog = held.last_probed_round?.catalog?.state;
  return `${door} The chain holds ${held.rounds_probed} probed round${held.rounds_probed === 1 ? "" : "s"} of ${held.rounds_since_first_sighting} since it first met ${held.host}; tier ${held.tier.line}${catalog ? `; the catalog's copy ${catalog === "agrees" ? "agrees with" : catalog === "differs" ? "differs from" : catalog === "not_listed" ? "does not list" : "is not comparable with"} the door as of the last round` : ""}.`;
}

export async function lookAtDoor(
  rawUrl: unknown,
  env: Env,
  now: Date = new Date(),
): Promise<{
  status: number;
  body: LookReport | { error: string; code?: string };
  headers?: Record<string, string>;
}> {
  const base = env.STORE_BASE_URL;
  /*
   * EVERY REFUSAL IS THE PREFLIGHT'S REFUSAL, unchanged: the URL law,
   * the private-address law, the own-host answer (the instrument does
   * not look at itself), the rate limit and its Retry-After. One law
   * in one place; this door inherits it rather than agreeing with it.
   */
  const preflight = await preflightUrl(rawUrl, env, PREFLIGHT_VERSION_NEXT);
  if (preflight.status !== 200 || !("verdict" in preflight.body)) {
    return {
      status: preflight.status,
      body: preflight.body as { error: string; code?: string },
      ...(preflight.headers ? { headers: preflight.headers } : {}),
    };
  }
  const report = preflight.body;
  const url = String(rawUrl);
  const host = hostOf(url);
  const held = await heldHalf(env, host, now);
  const live: LookReport["now"] = {
    battery: PREFLIGHT_VERSION_NEXT,
    verdict: report.verdict,
    observed_at: now.toISOString(),
    failed: report.checks.filter((check) => !check.ok).map((check) => check.name),
    advisories: (report.advisories ?? []).map((advisory) => advisory.name),
    the_door: report,
  };
  return {
    status: 200,
    ...(preflight.headers ? { headers: preflight.headers } : {}),
    body: {
      version: LOOK_VERSION,
      url,
      host,
      asked_at: now.toISOString(),
      headline: headlineOf(url, live, held),
      now: live,
      held,
      now_against_held: nowAgainstHeld(report.verdict, held),
      counts_travel_with_denominators: DENOMINATORS,
      what_this_is_not: NOT_A_SCORE,
      the_ladder: {
        free_first: {
          the_door: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT} — the live half on its own. Free.`,
          the_history: `${held.rows_url} — the held half's rows, every one naming the signed entry it came from. Free.`,
          the_passport: `${held.passport.url} — the decision and its expiry rule. Free.`,
        },
        paid: [
          ladderRung(
            base,
            "service_audit",
            "this probe as a signed, dated artifact at its own URL, with the door's other surfaces read beside the 402",
          ),
          ladderRung(
            base,
            "passport_refresh",
            "a census look at this host now rather than Sunday, folded into the passport the same hour",
          ),
        ].filter((rung): rung is Record<string, unknown> => rung !== null),
      },
      next_steps: {
        if_you_will_pay_it: `${base}/api/before-you-pay/v1 — whether YOUR client would sign what this door serves, free; a door can be ready and still be refused on your own machine.`,
        if_the_history_is_thin: `Thin history is a fact about our coverage, not about the door: ${held.rounds_probed} probed round${held.rounds_probed === 1 ? "" : "s"} of ${held.rounds_since_first_sighting} is what we hold, and the gaps are counted against us by reason.`,
        if_something_here_is_wrong: `${base}/corrections`,
      },
    },
  };
}
