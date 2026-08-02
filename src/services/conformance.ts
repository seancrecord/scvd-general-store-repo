import {
  parseJws,
  verifyArtifact,
  OFFER_REQUIRED_FIELDS,
  RECEIPT_REQUIRED_FIELDS,
} from "../../verifier/x402-verify.js";

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
const DID_DOC_TIMEOUT_MS = 3_000;
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
function guardedFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (!url.startsWith("https://")) {
      throw new Error("did:web resolution is https-only");
    }
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DID_DOC_TIMEOUT_MS),
      /**
       * NO REDIRECTS. A host answering 302 turns a fixed-path fetch
       * back into an arbitrary one, which is the exact property that
       * made this safe to offer without an allowlist.
       */
      redirect: "error",
      headers: { Accept: "application/json" },
    });
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

const CONFLICT =
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

export async function checkConformance(
  body: ConformanceRequest,
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
  /**
   * The budget is taken HERE, before any work, so a caller who is
   * pushed to the offline path learns it from the verdict rather than
   * from a timeout.
   */
  const budgetOk = askedForResolution ? takeResolutionBudget() : true;
  const wantsResolution = askedForResolution && budgetOk;

  const parsed = parseJws(artifact);
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
      ...(publicKeyHex ? { publicKey: publicKeyHex } : {}),
      ...(wantsResolution ? { fetch: guardedFetch() } : {}),
    })) as { ok: boolean; checks: ConformanceCheck[] };
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

  const expiryCheck = raw.checks.find((check) => check.name === "expiry");
  const live = expiryCheck ? expiryCheck.ok : null;

  const signatureChecked = raw.checks.some(
    (check) => check.name === "signature" && check.ok,
  );
  const anyFailed = raw.checks.some((check) => !check.ok);
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
    },
    what_it_checks: [
      "The JWS parses into three segments with JSON header and payload.",
      "alg is EdDSA. Nothing else is accepted, and `none` is not a special case here because it never reaches the signature step.",
      "The payload carries every required field for its kind.",
      "The signature verifies against the key named in the kid.",
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
