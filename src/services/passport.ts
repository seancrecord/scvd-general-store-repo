import { signJcs, JCS_DISCIPLINE } from "@/lib/jcs";
import { readPassportRefresh } from "@/services/passport-refresh";
import { signMessage } from "@/lib/signing";
import { subjectHistory, type SubjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE ENDPOINT PASSPORT — one canonical object per endpoint
 * (outside-reads log item 1, P2 of the ROI order; three independent
 * reads converged on it: "the artifact people link to, not five
 * separate product concepts").
 *
 * A passport bundles what the store's instruments already know about
 * one host — the census verdicts, the observation history, the
 * offered rails — into a single dated, SIGNED, EXPIRING object with
 * a freshness state an agent can act on mechanically. It derives; it
 * never re-observes. The signature is the store's ordinary ed25519
 * pair (declared-field-order primary + RFC 8785 signature_jcs, the
 * dual-discipline rule for new artifact classes), so any passport
 * verifies exactly like every other scvd artifact.
 *
 * THE NAMES LINE, held from the fresh set: a PUBLIC passport is
 * served only for hosts whose latest observed verdict is READY, plus
 * this store itself. The census's row-level readings of failing
 * doors stay on the private side (their owners can run the free
 * preflight, or buy the signed failure diagnosis when that door
 * ships — P5). Names appear only on the ready side, everywhere.
 *
 * FRESHNESS DECAYS BY ITSELF (item 2): evidence in agent commerce
 * rots — payTo addresses, prices, manifests all move — so a passport
 * carries its own decay schedule and an agent should refuse expired
 * evidence without asking anybody. Sell the refresh, never the grade.
 */

export type FreshnessState =
  | "fresh"
  | "aging"
  | "expired"
  | "broken"
  | "indeterminate";

/** The census walks weekly; evidence is fresh inside one cadence,
 * aging inside two, expired after. Stated on the artifact itself. */
export const FRESH_DAYS = 8;
export const AGING_DAYS = 16;

export function freshnessOf(
  lastObserved: string | null,
  latestVerdict: string | undefined,
  now: Date,
): FreshnessState {
  if (!lastObserved || !latestVerdict) return "indeterminate";
  if (latestVerdict !== "ready") return "broken";
  const ageDays =
    (now.getTime() - new Date(lastObserved).getTime()) / 86_400_000;
  if (ageDays <= FRESH_DAYS) return "fresh";
  if (ageDays <= AGING_DAYS) return "aging";
  return "expired";
}

export interface PassportPayload {
  artifact: "endpoint_passport";
  host: string;
  issued_at: string;
  /** The date past which an agent should refuse this passport. */
  expires: string;
  freshness: FreshnessState;
  freshness_rule: string;
  /** Latest observed verdict and when. */
  latest: {
    verdict: string;
    observed_at: string | null;
    week: string | null;
    /** Rails/asks the door's own 402 offered, when captured. */
    networks?: string[];
    min_usdc?: number;
    max_usdc?: number;
    /** Absent on census observations; names the paid refresh when a
     * buyer-commissioned observation is the newest evidence. */
    source?: string;
  } | null;
  /** The observation record behind this passport, summarized. */
  history: {
    first_observed: string | null;
    rounds_probed: number;
    rounds_gapped: number;
    observation_coverage_pct: number | null;
    verdict_changes: number;
    full_history_url: string;
  };
  /** The free, freshness-degrading embeddable face of this passport. */
  chip_url: string;
  /** Who observed, said plainly — load-bearing for the self passport. */
  observer: string;
  not_a_guarantee: string;
}

export interface EndpointPassport {
  payload: PassportPayload;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  signature_jcs_covers: string;
  public_key: string;
  verify_hint: string;
}

/** Passport refusal, with the reason a caller can act on. */
export type PassportOutcome =
  | { issued: true; passport: EndpointPassport }
  | {
      issued: false;
      reason: "never-observed" | "not-ready";
      detail: string;
    };

const NOT_A_GUARANTEE =
  "A passport is evidence, not endorsement: it says what this store's instruments observed at the stated moments, nothing about delivery quality, solvency, or anything after expiry. Not an escrow, not a guarantor. Verify the signature yourself and refuse expired evidence.";

function expiryFrom(lastObserved: string): string {
  const expires = new Date(
    new Date(lastObserved).getTime() + AGING_DAYS * 86_400_000,
  );
  return expires.toISOString();
}

async function signPassport(
  env: Env,
  payload: PassportPayload,
): Promise<EndpointPassport> {
  const signedPayload = JSON.stringify(payload);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  const signatureJcs = await signJcs(
    payload as unknown as Record<string, unknown>,
    env.SIGNING_KEY,
  );
  return {
    payload,
    signed_payload: signedPayload,
    signature,
    signature_jcs: signatureJcs,
    signature_jcs_covers: `${JCS_DISCIPLINE} (RFC 8785) canonicalization of the same payload object — jcs(payload) -> utf8 -> ed25519_verify with the same public_key; see /spec/scvd-attestation/v1.`,
    public_key: publicKey,
    verify_hint:
      "ed25519_verify(utf8(signed_payload), hex(signature), hex(public_key)); key history at /.well-known/scvd-signing-key. signature_jcs verifies the RFC 8785 canonicalization of payload with the same key.",
  };
}

/**
 * The passport for any census-observed host. Ready-side only; the
 * refusals carry the reason so the route can answer honestly.
 */
export async function issuePassport(
  env: Env,
  rawHost: string,
  now: Date = new Date(),
): Promise<PassportOutcome> {
  const base = env.STORE_BASE_URL;
  const host = rawHost.trim().toLowerCase();
  const history: SubjectHistory = await subjectHistory(env, host, base, now);
  const latestProbed = [...history.timeline]
    .reverse()
    .find((round) => round.probed && round.verdict);
  /**
   * THE PAID REFRESH FOLDS IN HERE (keeper's "both" ruling): a
   * buyer-commissioned observation from the census's own instrument
   * outranks the weekly round wherever it is NEWER — in both
   * directions. A refresh that found the door broken makes the
   * passport refuse and the chip go dark; payment bought the check,
   * never the grade.
   */
  const refresh = await readPassportRefresh(env, host);
  const censusObserved = latestProbed ? history.last_observed : null;
  const refreshIsNewest =
    refresh !== null &&
    (censusObserved === null || refresh.observed_at > censusObserved);
  const effectiveVerdict = refreshIsNewest
    ? refresh.verdict
    : latestProbed?.verdict;
  if (!latestProbed && !refresh) {
    return {
      issued: false,
      reason: "never-observed",
      detail: `${host} has never been probed by the census — there is no evidence to passport. If you operate it, the free self-check is POST ${base}/api/preflight.`,
    };
  }
  if (effectiveVerdict !== "ready") {
    return {
      issued: false,
      reason: "not-ready",
      detail: `${host}'s latest observation is not on the ready side, and this store publishes names only on the ready side. If you operate it: the free self-check is POST ${base}/api/preflight, and the census will read the door again on its weekly pass.`,
    };
  }
  const lastObserved = refreshIsNewest
    ? refresh.observed_at
    : history.last_observed;
  const payload: PassportPayload = {
    artifact: "endpoint_passport",
    host,
    issued_at: now.toISOString(),
    expires: expiryFrom(lastObserved ?? now.toISOString()),
    freshness: freshnessOf(lastObserved, effectiveVerdict, now),
    freshness_rule: `fresh <= ${FRESH_DAYS} days since last observation, aging <= ${AGING_DAYS}, expired after; broken when the latest verdict is not ready; refuse expired passports.`,
    latest: refreshIsNewest
      ? {
          verdict: refresh.verdict,
          observed_at: refresh.observed_at,
          week: null,
          source:
            "paid refresh — buyer-commissioned, census instrument; same probe, same rules, no favor",
        }
      : {
          verdict: latestProbed!.verdict!,
          observed_at: lastObserved,
          week: latestProbed!.week,
        },
    history: {
      first_observed: history.first_observed,
      rounds_probed: history.rounds_probed,
      rounds_gapped: history.rounds_gapped,
      observation_coverage_pct: history.observation_coverage_pct,
      verdict_changes: history.verdict_changes.length,
      full_history_url: `${base}/corpus/host/${host}.json`,
    },
    chip_url: `${base}/badges/passport/${host}.svg`,
    observer: `${new URL(base).host} weekly census (signed corpus; one GET per host per week, Web Bot Auth)`,
    not_a_guarantee: NOT_A_GUARANTEE,
  };
  return { issued: true, passport: await signPassport(env, payload) };
}

/**
 * OUR OWN PASSPORT — the public example every read asked for, and
 * the one passport where observer and subject are the same party,
 * which the artifact says OUT LOUD instead of hoping nobody notices.
 * It derives from what is checkable by anyone: the store's own
 * public surfaces and their live behavior, each named so the reader
 * re-checks rather than trusts.
 */
export async function issueSelfPassport(
  env: Env,
  now: Date = new Date(),
): Promise<EndpointPassport> {
  const base = env.STORE_BASE_URL;
  const host = new URL(base).host.toLowerCase();
  const payload: PassportPayload = {
    artifact: "endpoint_passport",
    host,
    issued_at: now.toISOString(),
    expires: expiryFrom(now.toISOString()),
    freshness: "fresh",
    freshness_rule: `Re-issued on every request from live self-observation; fresh by construction, expires ${AGING_DAYS} days after issue if you keep a copy.`,
    latest: {
      verdict: "ready",
      observed_at: now.toISOString(),
      week: null,
    },
    history: {
      first_observed: "2026-07-21",
      rounds_probed: 0,
      rounds_gapped: 0,
      observation_coverage_pct: null,
      verdict_changes: 0,
      full_history_url: `${base}/corpus.json`,
    },
    chip_url: `${base}/badges/passport/${host}.svg`,
    observer:
      "SELF-OBSERVED — the subject and the observer are the same party. Do not weight this like a census passport; every claim in it is re-checkable at the public surfaces it names (/llms.txt, /openapi.json, /.well-known/x402.json, /api/verify), which is the only reason it is worth issuing at all.",
    not_a_guarantee: NOT_A_GUARANTEE,
  };
  return signPassport(env, payload);
}
