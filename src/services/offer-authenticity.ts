import {
  parseJws,
  resolveDidWeb,
  verifyArtifact,
} from "../../verifier/x402-verify.js";
import { latestWardRound, type WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * L3c, ENDPOINT SIDE — is a live door's signed offer actually signed
 * by who it says?
 *
 * THE GAP THIS CLOSES. The conformance desk verifies artifacts people
 * BRING us. No probe has ever verified the offers a door SERVES. So a
 * forged offer — valid JWS structure, a kid naming someone else's
 * did:web, a signature that does not check out — reads `ready` on our
 * preflight, on our ward round, and on everyone else's. The store has
 * been publishing "signed offers served" as an observation about
 * shape while saying nothing about authenticity, which is honest but
 * thin: `signer_kids` records WHO CLAIMED to sign, and nothing has
 * ever asked whether the claim holds.
 *
 * Deferred by the keeper 2026-08-28 ("save it for later on down the
 * road"), reopened 2026-08-29 to measure whether it is worth having.
 *
 * COSTS THE SUBJECT NOTHING. This reads the challenge bytes the ward
 * round already stored — no door is knocked on twice, no paid
 * resource is burned. The only outbound traffic is one resolution per
 * distinct ISSUER did:web host, cached inside the run, and the
 * issuer's DID document is a public well-known file rather than
 * anybody's shop.
 *
 * RETROACTIVE BY CONSTRUCTION. The bytes are already frozen in the
 * signed corpus, so whenever this runs it can speak about every round
 * ever captured — which is exactly why parking it cost nothing.
 *
 * WHAT A FAILURE WOULD MEAN, AND WHY THIS READING NAMES NOBODY.
 * "This door's offer signature does not verify" is a serious claim
 * about a named party — far heavier than anything the round publishes
 * today. Per-host rows exist for the keeper's own screen; the reading
 * itself is counts. Publishing a named failure needs its own ruling,
 * and this instrument does not presume one.
 */

/** One resolution per distinct issuer host, and a ceiling on those. */
export const ISSUER_RESOLUTION_BUDGET = 60;
const DID_TIMEOUT_MS = 3_000;
const DID_DOC_MAX_BYTES = 64 * 1024;

export type AuthenticityVerdict =
  /** A signature verified against the key the issuer publishes. */
  | "verified"
  /** A signature did NOT verify. The finding this instrument exists for. */
  | "failed"
  /** The issuer's did:web would not resolve. OUR gap, never their defect. */
  | "issuer_unreachable"
  /** The issuer resolved and does not list the key the offer names. */
  | "kid_not_in_document"
  /** The door served offers, none of them signed. Not a failure. */
  | "unsigned"
  /** No readable challenge stored for this door. Nothing to say. */
  | "not_served";

export interface HostAuthenticity {
  host: string;
  verdict: AuthenticityVerdict;
  offers_seen: number;
  offers_verified: number;
  offers_failed: number;
  /** did:web hosts that signed for this door. */
  issuers: string[];
  detail?: string;
}

export interface OfferAuthenticityReading {
  observed_at: string;
  week: string;
  /** Every host the round carried. */
  hosts_in_round: number;
  /** Of those, how many stored a challenge this reader could parse. */
  hosts_with_evidence: number;
  /**
   * THE EFFECTIVENESS NUMBER. Hosts serving at least one signed
   * offer — the entire population L3c can say anything about. If this
   * is near zero the instrument is correct and useless, and that is
   * worth knowing before building more of it.
   */
  hosts_serving_signed: number;
  by_verdict: Record<AuthenticityVerdict, number>;
  /** Signature-level tallies, across every door. */
  offers_seen: number;
  offers_verified: number;
  offers_failed: number;
  /**
   * Signed offers whose SCHEMA did not conform — counted apart from
   * authenticity on purpose. A genuinely signed offer with a sloppy
   * field is not a forgery, and folding the two would have this
   * instrument accusing honest issuers of fraud over a typo.
   */
  offers_schema_failed: number;
  /** Distinct issuer did:web hosts, and how the resolutions went. */
  issuers_seen: number;
  issuers_resolved: number;
  issuers_unreachable: number;
  resolutions_spent: number;
  resolution_budget: number;
  /** True when the budget stopped the walk before every issuer. */
  budget_bound: boolean;
  what_this_counts: string;
  what_this_is_not: string;
}

/** Every compact JWS a stored challenge carries, in order. */
export function signedOffersFromChallenge(
  challengeBytes: string | null | undefined,
): string[] {
  if (!challengeBytes) return [];
  let challenge: Record<string, unknown>;
  try {
    challenge = JSON.parse(atob(challengeBytes)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const extensions = (challenge["extensions"] ?? {}) as Record<string, unknown>;
  const block = extensions["offer-receipt"] as
    | { info?: { offers?: { signature?: unknown }[] } }
    | undefined;
  const offers = block?.info?.offers;
  if (!Array.isArray(offers)) return [];
  return offers
    .map((offer) => offer?.signature)
    .filter((signature): signature is string => typeof signature === "string");
}

/** The did:web host inside a kid, or undefined when it is not one. */
export function issuerHostOf(kid: string | undefined): string | undefined {
  if (!kid?.startsWith("did:web:")) return undefined;
  const rest = kid.slice("did:web:".length).split("#")[0] ?? "";
  const host = rest.split(":")[0]?.replace(/%3A/gi, ":");
  return host ? host.toLowerCase() : undefined;
}

/**
 * Outbound to a stranger's well-known document, on the store's usual
 * terms: https only, no redirects followed, timed, and sized. The
 * verifier itself is never allowed to fetch — resolution is this
 * reader's, done once per issuer.
 */
function guardedFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!url.startsWith("https://")) {
      throw new Error("did:web resolution is https-only");
    }
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(DID_TIMEOUT_MS),
    });
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > DID_DOC_MAX_BYTES) {
      throw new Error("did document over size ceiling");
    }
    return response;
  }) as typeof fetch;
}

type Resolution =
  | { ok: true; keys: Map<string, Uint8Array> }
  | { ok: false; problem: string };

/**
 * The reading. Walks the round's stored evidence; contacts issuers
 * only, and only once each.
 */
async function walk(
  env: Env,
  now: Date,
  options: { round?: WardRound; budget?: number },
): Promise<{ reading: OfferAuthenticityReading; rows: HostAuthenticity[] } | null> {
  const round = options.round ?? (await latestWardRound(env));
  if (!round) return null;
  const budget = options.budget ?? ISSUER_RESOLUTION_BUDGET;

  const resolutions = new Map<string, Resolution>();
  let spent = 0;
  let budgetBound = false;

  async function resolveIssuer(kid: string): Promise<Resolution | undefined> {
    const host = issuerHostOf(kid);
    if (!host) return undefined;
    const cached = resolutions.get(host);
    if (cached) return cached;
    if (spent >= budget) {
      budgetBound = true;
      return undefined;
    }
    spent += 1;
    let outcome: Resolution;
    try {
      const resolved = (await resolveDidWeb(kid, {
        fetch: guardedFetch(),
      })) as { ok: boolean; keys?: Map<string, Uint8Array>; problem?: string };
      outcome = resolved.ok
        ? { ok: true, keys: resolved.keys ?? new Map() }
        : { ok: false, problem: resolved.problem ?? "issuer did not resolve" };
    } catch (error) {
      outcome = { ok: false, problem: String(error) };
    }
    resolutions.set(host, outcome);
    return outcome;
  }

  const hosts: HostAuthenticity[] = [];
  const issuerHosts = new Set<string>();
  let offersSeen = 0;
  let offersVerified = 0;
  let offersFailed = 0;
  let offersSchemaFailed = 0;

  for (const host of round.hosts ?? []) {
    const signatures = signedOffersFromChallenge(host.evidence?.challenge_bytes);
    if (!host.evidence?.challenge_bytes) {
      hosts.push({
        host: host.host,
        verdict: "not_served",
        offers_seen: 0,
        offers_verified: 0,
        offers_failed: 0,
        issuers: [],
      });
      continue;
    }
    if (signatures.length === 0) {
      hosts.push({
        host: host.host,
        verdict: "unsigned",
        offers_seen: 0,
        offers_verified: 0,
        offers_failed: 0,
        issuers: [],
      });
      continue;
    }

    let verified = 0;
    let failed = 0;
    let schemaFailed = 0;
    let unreachable = false;
    let kidMissing = false;
    const issuers: string[] = [];
    let detail: string | undefined;

    for (const signature of signatures) {
      offersSeen += 1;
      const parsed = parseJws(signature) as { header?: { kid?: unknown } };
      const kid =
        typeof parsed.header?.kid === "string" ? parsed.header.kid : undefined;
      const issuer = issuerHostOf(kid);
      if (issuer) {
        issuerHosts.add(issuer);
        if (!issuers.includes(issuer)) issuers.push(issuer);
      }
      if (!kid) {
        // A signature naming no key cannot be checked either way.
        unreachable = true;
        detail = detail ?? "signature carries no kid";
        continue;
      }
      const resolution = await resolveIssuer(kid);
      if (!resolution) {
        unreachable = true;
        detail = detail ?? "issuer not resolved (budget or non-did:web kid)";
        continue;
      }
      if (!resolution.ok) {
        unreachable = true;
        detail = detail ?? resolution.problem;
        continue;
      }
      const key = resolution.keys.get(kid);
      if (!key) {
        kidMissing = true;
        detail = detail ?? "issuer resolved and does not list this kid";
        continue;
      }
      const publicKey = [...key]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      try {
        const result = (await verifyArtifact(signature, {
          publicKey,
          nowSeconds: Math.floor(now.getTime() / 1000),
          // The verifier never fetches: resolution is this reader's,
          // done once per issuer and guarded. Without this the
          // library falls back to bare fetch on any unresolved path.
          fetch: () => {
            throw new Error("resolution is the reader's, done once and guarded");
          },
        })) as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
        /*
         * AUTHENTICITY IS THE SIGNATURE CHECK, NOT THE ROLLED-UP OK.
         *
         * Caught by this file's own positive control before it ever
         * ran on a real door: verifyArtifact's `ok` folds schema,
         * alg, kid and signature together, so an offer that was
         * genuinely signed but carries a sloppy field — a string
         * "1" where the revision wants a number, say — came back
         * ok:false and this reader booked it as a FORGERY.
         *
         * Calling a real signature a forgery because a field was
         * typed wrong is the worst thing this instrument could do,
         * and schema conformance is the ward round's and the
         * conformance desk's question anyway. So the verdict reads
         * the named `signature` check alone, and a schema problem is
         * counted beside it rather than folded into an accusation.
         */
        const named = (name: string) =>
          result.checks?.find((check) => check.name === name);
        const signatureCheck = named("signature");
        const schemaCheck = named("schema");
        if (schemaCheck && !schemaCheck.ok) schemaFailed += 1;
        if (signatureCheck?.ok) {
          verified += 1;
        } else if (signatureCheck) {
          failed += 1;
        } else {
          unreachable = true;
          detail = detail ?? "verifier returned no signature check";
        }
      } catch (error) {
        unreachable = true;
        detail = detail ?? `verification threw: ${String(error)}`;
      }
    }

    offersVerified += verified;
    offersFailed += failed;
    offersSchemaFailed += schemaFailed;

    /*
     * VERDICT ORDER IS A RULING, NOT A CONVENIENCE. A failure
     * outranks everything: a door serving one signature that does not
     * verify is the finding, whatever else it served. Below that,
     * "the issuer does not list this key" is decidable and theirs;
     * "we could not reach the issuer" is ours and must never read as
     * their defect (rule 52, B6's shape).
     */
    const verdict: AuthenticityVerdict = failed > 0
      ? "failed"
      : kidMissing
        ? "kid_not_in_document"
        : unreachable
          ? "issuer_unreachable"
          : verified > 0
            ? "verified"
            : "unsigned";

    hosts.push({
      host: host.host,
      verdict,
      offers_seen: signatures.length,
      offers_verified: verified,
      offers_failed: failed,
      issuers,
      ...(detail ? { detail } : {}),
    });
  }

  const byVerdict: Record<AuthenticityVerdict, number> = {
    verified: 0,
    failed: 0,
    issuer_unreachable: 0,
    kid_not_in_document: 0,
    unsigned: 0,
    not_served: 0,
  };
  for (const row of hosts) byVerdict[row.verdict] += 1;

  const withEvidence = hosts.filter((row) => row.verdict !== "not_served").length;
  const servingSigned = hosts.filter((row) => row.offers_seen > 0).length;
  const resolved = [...resolutions.values()].filter((r) => r.ok).length;

  const reading: OfferAuthenticityReading = {
    observed_at: now.toISOString(),
    week: round.week,
    hosts_in_round: (round.hosts ?? []).length,
    hosts_with_evidence: withEvidence,
    hosts_serving_signed: servingSigned,
    by_verdict: byVerdict,
    offers_seen: offersSeen,
    offers_verified: offersVerified,
    offers_failed: offersFailed,
    offers_schema_failed: offersSchemaFailed,
    issuers_seen: issuerHosts.size,
    issuers_resolved: resolved,
    issuers_unreachable: resolutions.size - resolved,
    resolutions_spent: spent,
    resolution_budget: budget,
    budget_bound: budgetBound,
    what_this_counts: `${offersVerified} of ${offersSeen} signed offers, served by ${servingSigned} of the ${withEvidence} doors whose challenge this round stored, carried a signature that verified against the key their own issuer publishes. ${offersFailed} did not. Read from bytes already captured — no door was knocked on for this, and the only outbound requests were ${spent} did:web resolutions across ${issuerHosts.size} distinct issuers. Authenticity here is the signature check alone: ${offersSchemaFailed} signed offers also failed the offer schema, which is counted separately because a genuinely signed offer with a sloppy field is not a forgery.`,
    what_this_is_not: `Not a claim about any named door: counts only, because "this door's signature does not verify" is a far heavier accusation than anything this store publishes today and it needs its own ruling first. An unreachable issuer is OUR gap and is never counted as a door's failure. A door serving unsigned offers has not failed anything — x402 does not require signed offers, and ${byVerdict.unsigned} doors here simply do not serve them. Verifying a signature says the named key signed those bytes; it does not say the signer was authorised to sell that resource, which the offer-receipt spec gives nobody a way to establish.`,
  };
  return { reading, rows: hosts };
}

/**
 * THE READING — counts only, and the shape any published version
 * would have to take. No door is named, deliberately: see the ruling
 * note at the top of this file.
 */
export async function readOfferAuthenticity(
  env: Env,
  now: Date = new Date(),
  options: { round?: WardRound; budget?: number } = {},
): Promise<OfferAuthenticityReading | null> {
  const walked = await walk(env, now, options);
  return walked ? walked.reading : null;
}

/**
 * THE SAME WALK, WITH ITS ROWS, for the keeper's own screen.
 *
 * A separate export rather than a field on the reading, so the
 * publishable shape cannot carry a named door by accident — which is
 * what a `hosts` key on the reading would eventually do, the first
 * time somebody serialised it somewhere new.
 */
export async function readOfferAuthenticityDetail(
  env: Env,
  now: Date = new Date(),
  options: { round?: WardRound; budget?: number } = {},
): Promise<{ reading: OfferAuthenticityReading; rows: HostAuthenticity[] } | null> {
  return walk(env, now, options);
}
