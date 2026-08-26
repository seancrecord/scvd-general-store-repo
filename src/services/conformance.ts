import { CANONICAL_USDC, isCanonicalUsdc } from "@/lib/value-checks";
import {
  parseJws,
  verifyArtifact,
  resolveDidWeb,
  checkAnchoredKeyHistory,
  OFFER_REQUIRED_FIELDS,
  RECEIPT_REQUIRED_FIELDS,
} from "../../verifier/x402-verify.js";
import { buildAnchorLogDocument } from "@/services/anchor-log";
import { buildDidDocument } from "@/services/did-document";
import type { Env } from "@/types";

/**
 * THE FREE CONFORMANCE DESK — /api/conformance.
 *
 * WHAT CHANGED AND WHY IT MATTERS. The verifier in verifier/ has been
 * MIT, zero-dependency and correct for a while, and it works on ANY
 * store's x402 artifacts rather than only ours. It was also a FILE IN
 * A GITHUB REPO, which means using it required a human to clone
 * something and run node. The audience this store actually serves —
 * an agent holding an offer it does not trust — could not use it at
 * all. That is not a distribution problem, it is a reachability one.
 *
 * So the same code is served here. Nothing about the method changed;
 * only who can reach it.
 *
 * FREE, FOREVER, AND ON SOMEBODY ELSE'S ARTIFACTS. No wallet, no
 * auth, no 402. It checks a competitor's offer as readily as ours,
 * which is the point: a conformance desk that only blessed its own
 * issuer would be marketing with a JSON content-type.
 *
 * THE CONFLICT OF INTEREST IS DECLARED IN THE RESPONSE, not buried in
 * a policy page. We sell x402 goods. Some artifacts sent here will
 * have been issued by people we compete with, and a verdict from a
 * competitor is worth exactly as much as its method. Ours is
 * published and runs offline, so the honest instruction is in every
 * response: do not trust this endpoint, run the file.
 *
 * WHY IT IS NOT A 402. PROBLEMS.md sequences B before A: the free
 * verifier's ADOPTION is the evidence for whether anyone values
 * conformance checking at all, and a paid one measures willingness to
 * pay for something nobody has been shown yet. A download is
 * invisible. An endpoint is counted.
 */

/** Ceilings on what a stranger can hand us. */
const MAX_ARTIFACT_CHARS = 16_384;
/**
 * Exported so the live test can size its own budget off this number
 * rather than guessing. A test whose ceiling is only marginally above
 * the operation's own ceiling is a flake waiting for a busy runner —
 * see test/conformance-resolution-live.spec.ts.
 */
export const DID_DOC_TIMEOUT_MS = 3_000;
const MAX_DID_DOC_BYTES = 64 * 1024;

/**
 * THE CONTRACT VERSION. Frozen means frozen: fields in a v1 response
 * are never removed and never change type. New ones may be added, and
 * a reader that breaks on an unknown key was always going to break.
 * Anything that cannot be done additively becomes /v2 and v1 keeps
 * answering.
 */
export const CONFORMANCE_VERSION = "v1";

/**
 * THE RATE LIMIT, AND WHY IT BOUNDS THE NETWORK RATHER THAN THE DESK.
 *
 * PROBLEMS.md carries the RequestBin lesson: httpbin and RequestBin
 * were beloved, free and unmonetised, and RequestBin died of
 * free-target abuse. FM4 names the specific shape it would take here
 * — CI pipelines hardcoding a free endpoint, every PR across dozens
 * of repos hitting our edge, identical top-of-hour POST spikes.
 *
 * WHAT ACTUALLY COSTS. Parsing a JWS and checking an Ed25519
 * signature is microseconds of CPU on a 16KB ceiling. Resolving a
 * did:web is an outbound request to a host a stranger chose, held
 * open for up to three seconds. Those are not the same expense, so
 * they do not get the same limit: the cheap path stays unbounded and
 * the network path is budgeted.
 *
 * WHAT IT COSTS THE CALLER WHEN IT BINDS — and this is the part worth
 * getting right: nothing is denied. A caller past the budget gets a
 * verdict with the signature unchecked and an instruction to pass
 * public_key_hex, which is unbounded, faster, and makes no request in
 * their name anyway. Abuse degrades the service toward its better
 * mode rather than switching it off, so a CI pipeline that hammers us
 * gets pushed to the thing it should have been doing.
 *
 * NO IP IS INVOLVED, and that is a constraint rather than an
 * oversight. This store keeps no cookies and no IPs, and a public
 * endpoint is exactly where that discipline would be easiest to break
 * quietly. So the budget is a plain token bucket over TOTAL
 * resolutions, the same shape the porch log already uses for its
 * writes.
 *
 * ITS HONEST LIMIT: the bucket is per-isolate, so the real ceiling is
 * this number times however many isolates Cloudflare has running, and
 * it is a COST BOUND rather than a fairness mechanism. One heavy
 * caller can spend the budget that a light one would have used. That
 * is the accepted trade for not identifying anybody, and if it ever
 * binds in practice the fix is a keyed limiter, not a quieter one.
 */
const RESOLUTIONS_PER_MINUTE = 60;
let resolutionMinute = "";
let resolutionsUsed = 0;

function takeResolutionBudget(): boolean {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== resolutionMinute) {
    resolutionMinute = minute;
    resolutionsUsed = 0;
  }
  if (resolutionsUsed >= RESOLUTIONS_PER_MINUTE) {
    return false;
  }
  resolutionsUsed += 1;
  return true;
}

export interface ConformanceRequest {
  artifact?: unknown;
  kind?: unknown;
  public_key_hex?: unknown;
  resolve_key?: unknown;
  check_anchor?: unknown;
}

/**
 * THE ANCHORED-KEY-HISTORY RESULT, and why it is a separate block
 * rather than another entry in `checks`.
 *
 * Every other check answers "is this artifact well-formed and signed
 * by the key it names." This one answers a different and harder
 * question: WAS THAT KEY THE ISSUER'S KEY AT THE TIME, and can the
 * issuer prove they did not rewrite that history afterwards? A
 * self-hosted key registry can be edited; an append-only hash chain
 * whose digests are submitted to OpenTimestamps cannot be, at least
 * not without the edit being visible.
 *
 * It is `available: false` for almost every issuer alive, and that is
 * information rather than a failure — most people do not publish one.
 * Folding it into the pass/fail verdict would mark the entire
 * ecosystem non-conformant for not having adopted something almost
 * nobody has adopted.
 */
export interface AnchorFinding {
  available: boolean;
  reason?: string;
  url?: string;
  found?: boolean;
  anchor_confidence?: string;
  chain_ok?: boolean;
  chain_problems?: string[];
  first_seen_at?: string | null;
  bitcoin_confirmed?: boolean;
  what_it_does_not_prove?: string;
}

export interface ConformanceCheck {
  name: string;
  ok: boolean;
  detail: string;
  /** Reported, never folded into the verdict. See `live` below. */
  advisory?: boolean;
}

export interface ConformanceVerdict {
  /** Frozen contract marker. See CONFORMANCE_VERSION. */
  version: string;
  verdict: "conforms" | "does_not_conform" | "could_not_check";
  kind: "offer" | "receipt" | null;
  checks: ConformanceCheck[];
  /**
   * LIVENESS IS A SEPARATE QUESTION FROM CONFORMANCE, and it gets its
   * own field rather than being folded into the verdict.
   *
   * An expired offer is a perfectly valid artifact — correctly shaped,
   * correctly signed — that you can no longer pay against. Somebody
   * auditing last month's offers wants "conforms: true, live: false"
   * and would be misled by a flat failure; somebody about to pay wants
   * to see the false immediately. One word cannot serve both, and
   * collapsing two questions into one field is the mistake this
   * codebase keeps finding in its own surfaces.
   *
   * null when the artifact is a receipt (nothing to expire) or when
   * the check could not run at all.
   */
  live: boolean | null;
  liveness: string;
  key_resolution: "offline" | "did:web" | "not_attempted" | "budget_exhausted";
  /**
   * Present only when the artifact's issuer is THIS STORE. Additive to
   * the frozen v1 contract. Cloudflare refuses a Worker's subrequest
   * to its own hostname, so our own documents are read from the same
   * builders the public routes serve rather than over the network —
   * and the one thing that trade cannot attest is stated in the field.
   */
  self_resolution?: string;
  /**
   * Present only when check_anchor was requested. Never folded into
   * `verdict` — see AnchorFinding.
   */
  anchored_key_history: AnchorFinding | null;
  what_this_means: string;
  what_this_cannot_tell_you: string[];
  our_conflict_of_interest: string;
  run_it_yourself: string;
}

/**
 * A FETCH FOR A DOCUMENT AT AN ADDRESS A STRANGER CHOSE.
 *
 * The threat model is narrower here than in cross-reference.ts and
 * worth stating, because the difference is what makes this safe
 * without an allowlist — and an allowlist is impossible for a desk
 * whose whole value is working on issuers we have never heard of.
 *
 * A did:web identifier yields a URL whose PATH IS FIXED by the method
 * (`/.well-known/did.json`, or `<path>/did.json`). The caller picks a
 * host and nothing else. That removes the "use us to hit an arbitrary
 * endpoint" shape entirely: the worst available request is a GET for
 * one well-known JSON document, which is a request anybody can make
 * from anywhere for free. We are not a useful amplifier for that.
 *
 * Cloudflare Workers also cannot reach loopback, link-local or
 * RFC1918 space, so the classic SSRF targets — a metadata service, an
 * internal admin port — are not reachable from here in the first
 * place. That is the runtime's guarantee rather than ours, which is
 * why the guards below still do their own work: https only, no
 * redirects, a hard timeout, and a size ceiling.
 */
/**
 * THE ISSUER THIS DESK COULD NEVER RESOLVE WAS ITS OWN OPERATOR.
 *
 * Found live by CV on 2026-08-03, hiding directly behind the
 * redirect-value bug fixed that morning: once requests actually went
 * out, every did:web resolution of OUR OWN identifier died as a 522 —
 * while the identical URL answered 200 in 60ms from anywhere else.
 * Cloudflare refuses a Worker's subrequest to its own hostname; the
 * fetch reaches the edge, routes back toward the same Worker, and is
 * killed. So the happy path everyone actually walks — "check the
 * offer this store just handed me" — could not ever have worked over
 * the network, on any deploy, past or future. Two bugs, same symptom,
 * the first masking the second.
 *
 * THE FIX IS TO READ THE SOURCE, NOT THE WIRE. When the target host
 * is our own, the two documents did:web resolution can legitimately
 * want — the DID document and the anchor log — are served from the
 * SAME BUILDERS the public routes serve, in-process. Not a cached
 * copy, not a second implementation: the one producer both consumers
 * call, incapable of disagreeing with what the world sees.
 *
 * WHAT THIS DOES NOT PROVE, stated because the verdict says it too
 * (rule 5b): a self-served document cannot attest that scvd.store is
 * publicly reachable. A caller who wants that proof must fetch the
 * URL from their own vantage — which is exactly what the verdict
 * tells them.
 *
 * Any other path on our own host answers 404 here rather than going
 * out to die: did:web:scvd.store:anything is not an identifier this
 * store serves, and a legible refusal beats an edge timeout wearing
 * an "issuer unreachable" costume.
 */
interface SelfResolution {
  host: string;
  env: Env;
  /** Paths served in-process, recorded so the verdict can say so. */
  served: string[];
}

function selfResolutionFor(env: Env | undefined): SelfResolution | undefined {
  if (!env?.STORE_BASE_URL) {
    return undefined;
  }
  try {
    return { host: new URL(env.STORE_BASE_URL).host.toLowerCase(), env, served: [] };
  } catch {
    return undefined;
  }
}

async function serveOwnDocument(
  self: SelfResolution,
  pathname: string,
): Promise<Response> {
  if (pathname === "/.well-known/did.json") {
    self.served.push(pathname);
    return Response.json(await buildDidDocument(self.env));
  }
  if (pathname === "/.well-known/anchor-log.json") {
    self.served.push(pathname);
    return Response.json(await buildAnchorLogDocument(self.env));
  }
  return Response.json(
    { error: "this store serves no did document at this path" },
    { status: 404 },
  );
}

function guardedFetch(self?: SelfResolution): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (!url.startsWith("https://")) {
      throw new Error("did:web resolution is https-only");
    }
    if (self) {
      const parsed = new URL(url);
      if (parsed.host.toLowerCase() === self.host) {
        return serveOwnDocument(self, parsed.pathname);
      }
    }
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DID_DOC_TIMEOUT_MS),
      /**
       * NO REDIRECTS — and it must be "manual" rather than "error".
       *
       * Workers never implemented redirect: "error"; it throws
       * TypeError("Invalid redirect value") before a single byte goes
       * out. Shipped 2026-08-02 and broke every did:web resolution
       * silently, because the throw was caught by the resolver and
       * reported as "unreachable" — indistinguishable from a host that
       * really was down. The store's headline free feature answered
       * does_not_conform on its own live, valid offers, 100% of the
       * happy path, for a day.
       *
       * "manual" hands back the 3xx as a response instead of following
       * it, so the refusal below is OURS and explicit. That is strictly
       * better than relying on a runtime to throw: the security
       * property is identical and the failure is legible.
       */
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
    /**
     * THE REFUSAL "error" USED TO DO FOR US, done explicitly. With
     * "manual" a 3xx comes back as an opaque-redirect response rather
     * than being followed, so this is where the allowlist bypass gets
     * closed: a host answering 302 must not turn a fixed-path fetch
     * back into an arbitrary one.
     */
    if (response.status >= 300 && response.status < 400) {
      throw new Error(
        `did document answered ${response.status}; redirects are not followed`,
      );
    }
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_DID_DOC_BYTES) {
      throw new Error("did document is over the size ceiling and was not read");
    }
    const raw = await response.text();
    if (raw.length > MAX_DID_DOC_BYTES) {
      throw new Error("did document is over the size ceiling and was not read");
    }
    // Hand back a fresh Response so the verifier's .json() reads the
    // text we already bounded rather than an unbounded stream.
    return new Response(raw, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

/**
 * THE LIMITS, ATTACHED TO EVERY VERDICT (AT_SCALE rule 5b).
 *
 * A conformance PASS is the narrowest possible statement and reads
 * like a broad one unless the gap is spelled out. Each line below is
 * a thing somebody could reasonably assume from "conforms: true" and
 * would be wrong about.
 */
function limitsFor(keyResolution: string): string[] {
  const limits = [
    "THIS IS THE ARTIFACT YOU GAVE US, not the artifact an issuer served. We did not fetch it from their origin and cannot say they ever published it. A well-formed forgery of a schema is still well-formed.",
    "CONFORMANCE IS NOT ENDORSEMENT. A passing offer says the document is shaped correctly and signed by the key it names. It says nothing about whether the seller delivers, prices honestly, or exists tomorrow.",
    "WE CHECK STRUCTURE, SIGNATURE AND TIME. Not the goods, not the settlement, not whether the amount matches what was charged.",
  ];
  if (keyResolution === "did:web") {
    limits.push(
      "THE KEY WAS READ NOW, AND THE ARTIFACT WAS SIGNED THEN. A did:web document shows only today's key. If the issuer rotated since signing, a genuine artifact fails here, and if they rotated after a compromise, a fraudulent one could pass. Issuers who publish key history with each handover signed by the OUTGOING key close that gap; most do not, and we cannot tell you which case you are in.",
    );
  }
  if (keyResolution === "not_attempted") {
    limits.push(
      "NO SIGNATURE WAS CHECKED. You did not supply a public key and did not ask for did:web resolution, so everything below is about shape and time only. An unsigned verdict is a spell-check, not a verification.",
    );
  }
  if (keyResolution === "budget_exhausted") {
    limits.push(
      "NO SIGNATURE WAS CHECKED, AND THAT WAS OUR LIMIT RATHER THAN YOUR REQUEST. The did:web resolution budget for this minute is spent, so the shape and time checks below ran and the signature did not. NOTHING IS WRONG WITH YOUR ARTIFACT — this says nothing about it either way. Retry next minute, or better, pass public_key_hex: the offline path has no budget, is faster, and makes no network request in your name. If you are calling this from CI, the offline path is the one you want permanently.",
    );
  }
  return limits;
}

export const CONFLICT =
  "WE COMPETE WITH SOME OF THE ISSUERS YOU MIGHT SEND US. This store sells x402 goods; a verdict about a rival's artifact from us is worth exactly as much as the method behind it. That method is MIT-licensed, zero-dependency and identical to the file this endpoint runs — so the correct amount of trust to place in this response is none, and the correct thing to do with a verdict that matters is reproduce it offline.";

const RUN_IT_YOURSELF =
  "https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier — same code, runs on your machine, no network needed if you supply the public key. If this endpoint and that file ever disagree, the file is right and we want to hear about it at /api/letter.";

function meaningOf(
  verdict: ConformanceVerdict["verdict"],
  kind: string | null,
  live: boolean | null,
): string {
  if (verdict === "conforms" && live === false) {
    return `This ${kind ?? "artifact"} is well-formed and correctly signed, but it has EXPIRED — you cannot pay against it. Both halves are true and neither cancels the other: the document is genuine, the window is closed. If you are auditing history that is a pass; if you are about to settle, get a fresh offer.`;
  }
  if (verdict === "conforms") {
    return `This ${kind ?? "artifact"} is well-formed against the x402 signed-${kind ?? "artifact"} schema, carries an EdDSA signature that checks out against the key it names, and is${live === true ? " still live" : " not expired"}. Read the limits below before treating that as trust.`;
  }
  if (verdict === "does_not_conform") {
    return `At least one check failed. The failing entries below name what and why. A failure here is a fact about the document, not an accusation about whoever sent it — malformed artifacts are usually a client bug, not fraud.`;
  }
  return "Not enough was checkable to reach a verdict either way. This is deliberately not reported as a failure: an unchecked artifact and a bad one are different things, and collapsing them would make this desk useless for exactly the ambiguous cases worth bringing here.";
}

/** The did:web host, parsed the way resolveDidWeb parses it. */
function didWebHost(kid: string | undefined): string | undefined {
  if (!kid?.startsWith("did:web:")) {
    return undefined;
  }
  const first = kid.slice("did:web:".length).split("#")[0]?.split(":")[0];
  if (!first) {
    return undefined;
  }
  try {
    return decodeURIComponent(first).replace(/%3A/gi, ":").toLowerCase();
  } catch {
    return undefined;
  }
}

export async function checkConformance(
  body: ConformanceRequest,
  env?: Env,
): Promise<{ status: number; verdict?: ConformanceVerdict; error?: string }> {
  const artifact = body.artifact;
  if (typeof artifact !== "string" || artifact.trim().length === 0) {
    return {
      status: 400,
      error:
        "Send {\"artifact\": \"<compact JWS>\"}. That is an x402 signed offer or receipt: three base64url segments separated by dots. Nothing else is required.",
    };
  }
  if (artifact.length > MAX_ARTIFACT_CHARS) {
    return {
      status: 413,
      error: `The artifact is ${artifact.length} characters, over the ${MAX_ARTIFACT_CHARS} ceiling. A signed offer or receipt is a few hundred bytes; something this size is not one.`,
    };
  }

  const requestedKind =
    body.kind === "offer" || body.kind === "receipt" ? body.kind : undefined;
  const publicKeyHex =
    typeof body.public_key_hex === "string" ? body.public_key_hex : undefined;
  /**
   * RESOLUTION IS OPT-IN, and defaults ON only when no key was given.
   * A caller who supplies a key wants an offline check and should get
   * one — issuing a network request they did not ask for would be a
   * surprise, and on this endpoint a surprise request is a request
   * made to a third party in their name.
   */
  const askedForResolution =
    body.resolve_key === false ? false : publicKeyHex === undefined;
  const wantsAnchor = body.check_anchor === true;

  const parsed = parseJws(artifact);
  const kid =
    typeof parsed.header?.kid === "string" ? parsed.header.kid : undefined;

  /**
   * Self-resolution: when the kid's host is OUR OWN, the documents are
   * read in-process (see guardedFetch) — so no outbound request exists
   * for the budget to bound, and charging one would let strangers'
   * checks starve checks of our own artifacts, the single most common
   * request this desk gets.
   */
  const self = selfResolutionFor(env);
  const kidIsOurs = self !== undefined && didWebHost(kid) === self.host;

  /**
   * The budget is taken HERE, before any work, so a caller who is
   * pushed to the offline path learns it from the verdict rather than
   * from a timeout.
   */
  const budgetOk = askedForResolution
    ? kidIsOurs || takeResolutionBudget()
    : true;
  const wantsResolution = askedForResolution && budgetOk;

  /**
   * RESOLVED ONCE, HERE, rather than inside verifyArtifact.
   *
   * The anchored-key-history check needs the key AS HEX to look it up
   * in the issuer's chain. Letting the verifier resolve internally
   * would mean either resolving a second time or not offering the
   * anchor check at all, and a second outbound request to a stranger's
   * host to learn something we already knew is exactly the waste the
   * budget exists to prevent.
   */
  let resolvedHex: string | undefined = publicKeyHex;
  let resolutionProblem: string | undefined;
  if (!resolvedHex && wantsResolution && kid?.startsWith("did:web:")) {
    const resolved = (await resolveDidWeb(kid, {
      fetch: guardedFetch(self),
    })) as { ok: boolean; keys?: Map<string, Uint8Array>; problem?: string };
    if (resolved.ok) {
      const matched = resolved.keys?.get(kid);
      if (matched) {
        resolvedHex = [...matched]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      } else {
        resolutionProblem = "kid is not in the DID document";
      }
    } else {
      resolutionProblem = resolved.problem;
    }
  }

  const kind: "offer" | "receipt" | null = requestedKind
    ? requestedKind
    : parsed.ok
      ? "payer" in ((parsed.payload as Record<string, unknown>) ?? {})
        ? "receipt"
        : "offer"
      : null;

  let raw: { ok: boolean; checks: ConformanceCheck[] };
  try {
    raw = (await verifyArtifact(artifact, {
      ...(requestedKind ? { kind: requestedKind } : {}),
      ...(resolvedHex ? { publicKey: resolvedHex } : {}),
    })) as { ok: boolean; checks: ConformanceCheck[] };
    if (!resolvedHex && resolutionProblem) {
      // Keep the reason visible rather than reporting a bare "no key".
      raw.checks = raw.checks.map((check) =>
        check.name === "key-resolution"
          ? { ...check, detail: `${check.detail} (${resolutionProblem})` }
          : check,
      );
    }
  } catch (error) {
    /**
     * The verifier throwing is OUR defect, not the caller's, and it
     * must not read as a verdict about their artifact.
     */
    return {
      status: 500,
      error: `The conformance check failed on our side rather than on your artifact: ${String(error)}. That is a bug here; please send it to /api/letter.`,
    };
  }

  const keyResolution: ConformanceVerdict["key_resolution"] = publicKeyHex
    ? "offline"
    : askedForResolution && !budgetOk
      ? "budget_exhausted"
      : wantsResolution
        ? "did:web"
        : "not_attempted";

  /**
   * THE ANCHOR CHECK, opt-in and budgeted like any other outbound
   * request. It reads the issuer's /.well-known/anchor-log.json — a
   * path fixed by their DID, same as did:web resolution, so it adds
   * no new outbound shape.
   */
  let anchor: AnchorFinding | null = null;
  if (wantsAnchor) {
    if (!kid?.startsWith("did:web:")) {
      anchor = {
        available: false,
        reason:
          "the kid is not a did:web identifier, so there is no issuer origin to look for an anchor log on",
      };
    } else if (!resolvedHex) {
      anchor = {
        available: false,
        reason:
          "no public key was established, and an anchor log is searched BY key — without one this would answer a question nobody asked",
      };
    } else if (!kidIsOurs && !takeResolutionBudget()) {
      anchor = {
        available: false,
        reason:
          "the outbound budget for this minute is spent. This is our limit, not a fact about the issuer: it says nothing about whether they publish an anchor log. Retry next minute.",
      };
    } else {
      try {
        anchor = (await checkAnchoredKeyHistory(kid, resolvedHex, {
          fetch: guardedFetch(self),
        })) as AnchorFinding;
        anchor.what_it_does_not_prove =
          "An anchor proves WHEN a key state was committed, never WHO SHOULD HAVE held it. A thief holding the key could anchor it too. This bounds how far back a compromise could have been backdated; it does not prevent one, and `available: false` is the normal state of almost every issuer alive rather than a mark against them.";
      } catch (error) {
        anchor = {
          available: false,
          reason: `anchor log unreadable: ${String(error)}`,
        };
      }
    }
  }

  const expiryCheck = raw.checks.find((check) => check.name === "expiry");
  const live = expiryCheck ? expiryCheck.ok : null;

  const signatureChecked = raw.checks.some(
    (check) => check.name === "signature" && check.ok,
  );
  const anyFailed = raw.checks.some((check) => !check.ok);
  /*
   * 2.2, ADVISORY BY THE DESK'S OWN CONTRACT. The desk checks
   * structure, signature and time — value judgments never fold into
   * its verdict, and this one does not either (verdict below reads
   * raw.ok alone). But an offer that names a network we settle on and
   * an asset that is NOT that network's canonical USDC deserves a
   * note a buyer sees before pricing it in dollars: Ethereum-mainnet
   * USDC pasted into a Base offer is a real confusion, not a
   * hypothetical, and until today the desk passed it in silence.
   * Appended only when the network is one the registry knows —
   * an unknown network gets no claim either way (rule 52, both
   * directions).
   */
  if (kind === "offer" && parsed.ok) {
    const payload = (parsed.payload ?? {}) as Record<string, unknown>;
    const network = String(payload["network"] ?? "");
    const asset = String(payload["asset"] ?? "");
    if (network && asset && CANONICAL_USDC[network]) {
      const canonical = isCanonicalUsdc(network, asset);
      raw.checks = [
        ...raw.checks,
        {
          name: "asset-canonical-usdc",
          ok: canonical,
          advisory: true,
          detail: canonical
            ? `the offer's asset is the canonical USDC contract for ${network}`
            : `the offer's asset ${asset} is not the canonical USDC contract for ${network} (${CANONICAL_USDC[network]}). Not a conformance failure — x402 permits any asset — but a buyer pricing this offer in dollars should know the token is something else before paying.`,
        },
      ];
    }
  }

  const verdict: ConformanceVerdict["verdict"] = raw.ok
    ? "conforms"
    : signatureChecked || !anyFailed
      ? "does_not_conform"
      : keyResolution === "not_attempted"
        ? "could_not_check"
        : "does_not_conform";

  return {
    status: 200,
    verdict: {
      version: CONFORMANCE_VERSION,
      verdict,
      kind,
      checks: raw.checks,
      live,
      liveness:
        live === null
          ? "Not applicable: a receipt records something that already happened and has no expiry to check."
          : expiryCheck?.detail ?? "",
      key_resolution: keyResolution,
      ...(self && self.served.length > 0
        ? {
            self_resolution: `This artifact's issuer is this store, and Cloudflare forbids a Worker from fetching its own hostname — so ${self.served.join(" and ")} ${self.served.length === 1 ? "was" : "were"} read from the same code that serves ${self.served.length === 1 ? "it" : "them"} publicly, not over the network. Byte-for-byte the same document; what this cannot attest is that ${self.host} is reachable from the outside. If that matters to you, fetch the URL yourself from your own vantage — that check is exactly as free for you as it is impossible for us.`,
          }
        : {}),
      anchored_key_history: anchor,
      what_this_means: meaningOf(verdict, kind, live),
      what_this_cannot_tell_you: limitsFor(keyResolution),
      our_conflict_of_interest: CONFLICT,
      run_it_yourself: RUN_IT_YOURSELF,
    },
  };
}

/** The GET: what this desk is, before anybody posts anything to it. */
export function conformanceDoc(base: string) {
  return {
    title: "The conformance desk",
    version: CONFORMANCE_VERSION,
    contract:
      "FROZEN. Fields in a v1 response are never removed and never change type; new ones may be added, and a reader that breaks on an unknown key was always going to break. Anything that cannot be done additively becomes /v2, and v1 keeps answering. Pin the versioned path if you are calling this from CI — an endpoint that quietly reshapes itself under a pipeline is worse than one that was never free.",
    rate_limit:
      "The offline path — supply public_key_hex — is unbounded, because checking a signature is microseconds of CPU. did:web resolution is budgeted, because it is an outbound request to a host you chose, held open up to three seconds. Past the budget nothing is denied: you get the shape and time checks with the signature unchecked and key_resolution: \"budget_exhausted\". No IP, cookie or identifier is used to do this; the budget is a plain global bucket, which means it bounds our cost rather than allocating fairly between callers, and that trade is deliberate.",
    summary:
      "Send an x402 signed offer or receipt; get back a structured verdict on whether it is well-formed, correctly signed and unexpired. Free, no wallet, no account, no rate card. Works on any issuer's artifacts, including issuers we compete with.",
    method: "POST",
    url: `${base}/api/conformance/${CONFORMANCE_VERSION}`,
    request: {
      artifact: "REQUIRED. The compact JWS: three base64url segments, dot-separated.",
      kind: "Optional, \"offer\" or \"receipt\". Inferred from the payload when omitted.",
      public_key_hex:
        "Optional. Supply it and the check runs entirely offline — no network request is made in your name.",
      resolve_key:
        "Optional, defaults true when no public_key_hex is given. Set false to refuse did:web resolution and get a shape-and-time verdict only.",
      check_anchor:
        "Optional, default false. Asks whether the signing key appears in the issuer's ANCHORED key history at /.well-known/anchor-log.json — an append-only hash chain whose digests are submitted to OpenTimestamps. That answers \"was this key theirs at the time, provably un-rewritten\" rather than only \"does this signature verify against a key I chose to trust.\" One extra outbound request, reported in its own block and never folded into the verdict, because almost no issuer publishes one and absence is not a fault.",
    },
    what_it_checks: [
      "The JWS parses into three segments with JSON header and payload.",
      "alg is EdDSA. Nothing else is accepted, and `none` is not a special case here because it never reaches the signature step.",
      "The payload carries every required field for its kind.",
      "The signature verifies against the key named in the kid.",
      "Optionally (check_anchor), whether the key appears in the issuer's externally anchored key history — a different and harder question than signature validity, reported in its own block.",
      "Whether the offer is still live — reported separately as `live`, never folded into the verdict, because an expired offer is a valid artifact you simply cannot pay against.",
    ],
    required_fields: {
      offer: OFFER_REQUIRED_FIELDS,
      receipt: RECEIPT_REQUIRED_FIELDS,
    },
    /**
     * The same limits the POST returns, published where somebody
     * deciding whether to USE this can read them first.
     */
    what_it_cannot_tell_you: limitsFor("did:web"),
    our_conflict_of_interest: CONFLICT,
    run_it_yourself: RUN_IT_YOURSELF,
    why_it_is_free:
      "Because the useful version of a conformance check is one an agent reaches for without a decision, and a price is a decision. It also keeps us honest: a paid verdict has a customer, and a customer for a verdict is how verdicts start bending.",
    mailbox: `${base}/api/letter`,
  };
}
