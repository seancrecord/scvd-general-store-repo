import { parseJws } from "../../verifier/x402-verify.js";
import { CONFLICT } from "@/services/conformance";
import { storeIdentity } from "@/lib/identity";
import { ProbeTargetRefused, checkProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders, type WbaEnv } from "@/lib/web-bot-auth";
import { readPayTo } from "@/lib/pay-to";
import { checkRailReceivable } from "@/services/rail-receivable";
import { isRecord, type Env } from "@/types";

/**
 * THE FREE ENDPOINT PREFLIGHT — /api/preflight.
 *
 * WHY IT EXISTS, precisely. The buyer's-journey research (2026-08-03)
 * mapped eight failure moments in an x402 integration and found the
 * most common one is also the least served: a developer's endpoint
 * answers something other than a well-formed 402 and every tool they
 * have shows a repeating 402 or an empty parse, with no explanation.
 * 57% of one directory's listings were "listed but functionally
 * absent" when independently probed. The conformance desk checks
 * ARTIFACTS a caller pastes in; nothing free checked ENDPOINTS. This
 * closes that gap with the same posture: free, no account, works on
 * anyone, conflict declared in the response.
 *
 * WHAT ONE PROBE MEANS, said before anything else because it is the
 * honest boundary of the whole tool: ONE request, ONE moment. This is
 * a preflight, not a monitor — it can tell you your 402 is shaped
 * right today; it cannot tell you your service is reliable, and a
 * "ready" here that gets quoted as an uptime claim is a misquote.
 *
 * EVERY CHECK IS THE STORE'S OWN LAW POINTED OUTWARD. The required
 * accepts fields are the same set our offer-signing refuses to sign
 * without (lib/offer-receipt.ts); the header shape is the one our own
 * till emits; the testnet catch is the x402 FAQ's number-one stuck
 * point. We are not shipping a second opinion about the spec — we are
 * publishing the checks we already hold ourselves to, and a CI test
 * proves the store's own 402 passes its own preflight.
 *
 * THE FETCH IS A REQUEST TO AN ADDRESS A STRANGER CHOSE, so it wears
 * every guard the did:web fetcher wears (https-only, no redirects, a
 * hard timeout, a size ceiling, a global per-minute budget) plus one
 * of its own: EXACTLY ONE outbound request per call, ever. No chasing
 * bazaar URLs, no resolving the offers' did:web — the response says
 * where to take those next steps instead of taking them in your name.
 */

/**
 * WHAT BUMPS THIS, decided 2026-08-18 when the x402 Foundation went
 * operational: this battery tests x402 v2 AS SHIPPED, and "conformance
 * against published criteria" quietly becomes "conformance against
 * LAST year's criteria" the day a standards body ratifies a change
 * nobody here noticed. So the trigger is now written where the version
 * lives: when the Foundation ratifies a protocol or receipts change,
 * a new battery version is cut THE SAME WEEK, each version naming
 * which standard it tests. The old version keeps serving — a verdict
 * cites the criteria it was rendered under, forever, the same way a
 * certificate keeps its mint-day canonical form.
 */
export const PREFLIGHT_VERSION = "v1";

/**
 * The battery's citable name (roadmap 1.3 / D6): what a signed row
 * writes INSIDE its bytes to say which criteria produced the verdict.
 * Derived here, beside the version, so the audit's citation and the
 * rows' citations cannot drift apart.
 */
export const PREFLIGHT_BATTERY = `preflight-${PREFLIGHT_VERSION}`;

/**
 * THE SECOND BATTERY, AND THE FIRST ONE KEPT RUNNING (2026-08-23).
 *
 * v2 folds the Solana rail-receivability read into the VERDICT. v1
 * reported it as an advisory, which meant a door that literally cannot
 * be credited — the payTo owns no token account for the mint it asked
 * for — was still called `ready`. That is wrong on the merits and the
 * published defect vocabulary at /defects says so.
 *
 * WHY v1 DOES NOT SIMPLY CHANGE. An observatory's most valuable asset
 * is a comparable series. If the battery moves under the name `v1`,
 * then a `ready` recorded in week 34 stops meaning what a `ready`
 * recorded in week 36 means, and six weeks of hash-chained weekly
 * rounds quietly lose the property that made them worth keeping. Every
 * artifact this store has signed names the criteria it was rendered
 * under; renaming those criteria retroactively would make a signature
 * cover a claim nobody made.
 *
 * So both run. This is what an observatory does when it upgrades an
 * instrument: keep the old one going through an overlap so the records
 * join up, rather than starting a new series that cannot be compared
 * to the old one. The comment above PREFLIGHT_VERSION already promised
 * exactly this — "the old version keeps serving; a verdict cites the
 * criteria it was rendered under, forever" — and this is the first
 * time the store has had a second version to prove it with.
 *
 * ONE PROBE, TWO VERDICTS. The door is walked once. Both batteries
 * read the same observation, so the overlap costs a caller nothing and
 * the two verdicts can never disagree about what was seen — only about
 * what counts.
 */
export const PREFLIGHT_VERSION_NEXT = "v2";

/** Every battery currently served. Ordered oldest first. */
export const PREFLIGHT_VERSIONS = [
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSION_NEXT,
] as const;

export type PreflightBattery = (typeof PREFLIGHT_VERSIONS)[number];

/** The date v2 began rendering verdicts. Its series starts here. */
export const PREFLIGHT_V2_SINCE = "2026-08-23";

/**
 * What each battery folds into its verdict. Stated as data rather than
 * prose so the criteria page cannot drift from the code that renders
 * the verdict — the same derive-or-refuse rule the rest of the store
 * lives under.
 */
export const BATTERY_ADDS: Record<PreflightBattery, readonly string[]> = {
  v1: [],
  v2: ["solana-rail-receivable"],
};

/**
 * The fields an accepts entry must carry, and the derivation matters:
 * this is the exact set isSignableAccept() requires before our own
 * till will sign an offer over an entry. One law, both directions.
 */
export const ACCEPT_REQUIRED_FIELDS = [
  "scheme",
  "network",
  "amount",
  "asset",
  "payTo",
] as const;

/** Base mainnet, the only network this store's own till accepts. */
const MAINNET = "eip155:8453";
/** The testnet that the x402 FAQ names as the #1 stuck point. */
const KNOWN_TESTNETS: Record<string, string> = {
  "eip155:84532": "Base Sepolia",
  "eip155:11155111": "Ethereum Sepolia",
  // Added 2026-08-25 with the rail split. This store settles on
  // Polygon mainnet, so a seller pointing at Amoy is making exactly
  // the mistake this check exists to catch — and until today it went
  // unflagged, because the list only knew the rails the check was
  // first written for.
  "eip155:80002": "Polygon Amoy",
};

const PROBE_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * TWO CEILINGS, because one of them turned out to be nearly none.
 *
 * The per-isolate bucket shipped first, with its per-isolate nature
 * documented as an honest limit — and CV's black-box pass (2026-08-03)
 * showed what that honesty was worth as an abuse ceiling: 40
 * concurrent probes, ZERO 429s, because Cloudflare spread them across
 * isolates and every isolate held a fresh bucket of 30. For an
 * ordinary endpoint that is a cost quirk; for a free, no-auth
 * endpoint that makes outbound requests to caller-chosen hosts it is
 * a probe relay with no meter. His verdict — the one finding that
 * argues fix-before-market — is accepted:
 *
 *   - The per-isolate bucket stays: strict, free, catches the common
 *     case without a KV read.
 *   - A GLOBAL KV bucket backstops it: read-modify-write per minute,
 *     eventually consistent, so the ceiling is approximate — lost
 *     increments make it slightly generous, never tighter than
 *     stated. An approximate ceiling beats an imaginary one.
 */
export const PROBES_PER_MINUTE = 30;
export const GLOBAL_PROBES_PER_MINUTE = 60;

/**
 * THE CEILINGS, SAID OUT LOUD (roadmap 0.13, 2026-08-24).
 *
 * Both limits have been enforced since 2026-08-03 and neither was
 * ever published, so a caller building a pipeline against this
 * endpoint learned the ceiling by being refused halfway through it —
 * the least useful moment and the least informative form. The
 * conformance desk already states its budget and the trade it makes;
 * this brings the other free instrument onto the same footing.
 *
 * DERIVED FROM THE CONSTANTS THE LIMITER USES, so raising a ceiling
 * cannot leave the published figure behind (rule 46).
 */
export function statedRateLimit(base: string): {
  per_isolate_per_minute: number;
  global_per_minute: number;
  note: string;
} {
  return {
    per_isolate_per_minute: PROBES_PER_MINUTE,
    global_per_minute: GLOBAL_PROBES_PER_MINUTE,
    note: `Two ceilings, both approximate. The per-isolate bucket is exact within one isolate and Cloudflare may hold several, so it is not an abuse ceiling on its own; the global backstop is a read-modify-write on eventually consistent storage, which makes it slightly GENEROUS under load and never tighter than stated. Neither uses an IP, a cookie or any identifier — it bounds our cost rather than allocating fairly between callers, and that trade is deliberate. Past the ceiling you get 429 and nothing else is denied to you. Reading many doors at once? Take the weekly census whole from ${base}/corpus.json or ${base}/fresh-set instead — it costs you no probes and us no outbound requests.`,
  };
}
let probeMinute = "";
let probesUsed = 0;

function takeProbeBudget(): boolean {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== probeMinute) {
    probeMinute = minute;
    probesUsed = 0;
  }
  if (probesUsed >= PROBES_PER_MINUTE) {
    return false;
  }
  probesUsed += 1;
  return true;
}

async function takeGlobalProbeBudget(env: Env): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16);
  const key = `preflight_budget:${minute}`;
  const used = parseInt((await env.COUNTERS.get(key)) ?? "0", 10);
  if (used >= GLOBAL_PROBES_PER_MINUTE) {
    return false;
  }
  await env.COUNTERS.put(key, String(used + 1), { expirationTtl: 120 });
  return true;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Advisory: true and worth knowing, never folded into the verdict. */
export interface PreflightAdvisory {
  name: string;
  detail: string;
}

export interface PreflightReport {
  version: string;
  /**
   * ready = every structural check passed. not_ready = reachable but
   * failed at least one. unreachable = the probe itself could not
   * complete, which says nothing about their code and the detail says
   * whose side the failure is on.
   */
  verdict: "ready" | "not_ready" | "unreachable";
  checks: PreflightCheck[];
  advisories: PreflightAdvisory[];
  single_probe_note: string;
  what_this_cannot_tell_you: string[];
  our_conflict_of_interest: string;
  /**
   * WHAT THIS ENDPOINT WILL AND WILL NOT KEEP DOING FOR YOU (0.13).
   * Both ceilings have been enforced since 2026-08-03; publishing
   * them means a caller learns the limit while designing rather than
   * by being refused halfway through a run.
   */
  rate_limit: ReturnType<typeof statedRateLimit>;
  store_identity: ReturnType<typeof storeIdentity>;
  /**
   * THE SAME PROBE, SCORED UNDER THE OTHER BATTERY. Present while more
   * than one version is served, so a reader comparing a v1 verdict to a
   * v2 one never has to guess whether the doors differed or the rules
   * did. One probe produced both; they cannot disagree about what was
   * seen, only about what counts.
   */
  also_under?: {
    version: string;
    verdict: PreflightReport["verdict"];
    difference: string;
  };
  next_steps: Record<string, string>;
}

function report(
  base: string,
  verdict: PreflightReport["verdict"],
  checks: PreflightCheck[],
  advisories: PreflightAdvisory[],
  options: {
    battery?: PreflightBattery;
    /** The same probe, scored under the other battery. */
    alsoUnder?: {
      version: PreflightBattery;
      verdict: PreflightReport["verdict"];
      difference: string;
    };
  } = {},
): PreflightReport {
  const battery = options.battery ?? PREFLIGHT_VERSION;
  return {
    version: battery,
    verdict,
    checks,
    advisories,
    ...(options.alsoUnder ? { also_under: options.alsoUnder } : {}),
    single_probe_note:
      "One request, one moment. This says whether the endpoint is SHAPED right now, never whether it is reliable — a passing preflight quoted as an uptime claim is a misquote.",
    what_this_cannot_tell_you: [
      "Whether the service behind the 402 delivers anything after payment. No probe can; that is a fact about the world, not about bytes.",
      "Whether the endpoint stays up. This was one request at one moment.",
      "Whether the signed offers verify — this probe deliberately makes no second request, so the offers' did:web was not resolved. POST one to the conformance desk for that.",
    ],
    our_conflict_of_interest: CONFLICT,
    rate_limit: statedRateLimit(base),
    store_identity: storeIdentity(base),
    next_steps: {
      conformance_desk: `POST ${base}/api/conformance/v1 — full verification of any signed offer this 402 carried: structure, signature against the issuer's did:web key, liveness. Free.`,
      signed_report: `${base}/api/buy/service_audit — this exact readout, signed, bound into a certificate and served at a permanent URL, for when you need to hand it to somebody rather than run it yourself.`,
      across_a_week: `${base}/api/buy/conformance_watch — this exact battery once a day for seven days, each day signed alone, for catching a deploy that breaks the challenge mid-week. Our missed days are published against us.`,
      behavioral_check: `${base}/api/buy/standing_watch — the paid rung of the same ladder: a week of signed, out-of-band hourly probes on your endpoint, for when you need evidence rather than a readout.`,
    },
  };
}

export interface ProbeOutcome {
  response: Response;
  bodyOverLimit: boolean;
  /** The bytes already read to enforce the size ceiling. */
  body: string;
}

/**
 * THE ONE GUARDED OUTBOUND REQUEST, factored out so the paid service
 * audit runs EXACTLY the fetch the free preflight runs — same hard
 * timeout, same refusal to follow redirects, same bounded read. One
 * battery, two doors; the paid door must never quietly grow a longer
 * leash than the free one. Throws on network failure: the caller
 * decides what an unreachable moment means for its artifact.
 */
export async function probeOnce(
  url: string,
  fetchImpl: typeof fetch = fetch,
  ownHost = "",
  env?: WbaEnv,
): Promise<ProbeOutcome> {
  /*
   * THE BACKSTOP. Every door validates before charging, and a caller
   * should never see this throw — that is the point. It is here so
   * that the next door somebody adds inherits the rule instead of
   * hand-rolling a fourth copy of it, which is exactly how the
   * private-address hole got in.
   */
  const verdict = checkProbeTarget(new URL(url), ownHost);
  if (!verdict.ok) {
    throw new ProbeTargetRefused(verdict.reason ?? "refused target");
  }
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    /**
     * The probe introduces itself, verifiably, when it can (Web Bot
     * Auth, 2026-08-11): identity plus signature when the caller
     * passed env and the egress key is set, bare Accept otherwise.
     * Decoration on the probe, never a condition of it.
     */
    headers: env
      ? await webBotAuthHeaders(env, url, { Accept: "application/json" })
      : { Accept: "application/json" },
  });
  // Bound the read before anything parses it.
  const raw = await response.text();
  return {
    response,
    bodyOverLimit: raw.length > MAX_BODY_BYTES,
    body: raw,
  };
}

/**
 * Every post-fetch check, factored off the fetch so CI can aim it at
 * the store's OWN 402 — the test that keeps this tool honest about
 * being the law we already live under, not a second opinion.
 */
export function runChecks(
  response: Response,
  bodyOverLimit: boolean,
): {
  checks: PreflightCheck[];
  advisories: PreflightAdvisory[];
  /**
   * The offer entries this battery parsed, handed back so a caller
   * that needs the NETWORK (the Solana receivability read, which
   * cannot be synchronous) never has to decode the challenge twice
   * and never drifts from what the battery actually saw.
   */
  accepts?: Record<string, unknown>[];
} {
  const checks: PreflightCheck[] = [];
  const advisories: PreflightAdvisory[] = [];

  if (response.status >= 300 && response.status < 400) {
    checks.push({
      name: "status-402",
      ok: false,
      detail: `answered ${response.status}: a redirect. Payment clients will not follow it, and neither did this probe — the 402 must live at the URL a buyer actually calls.`,
    });
    return { checks, advisories };
  }

  checks.push(
    response.status === 402
      ? { name: "status-402", ok: true, detail: "answered 402 Payment Required" }
      : {
          name: "status-402",
          ok: false,
          detail: `answered ${response.status} instead of 402. ${
            response.status === 200
              ? "A 200 here is the 'listed but functionally absent' shape: directories will list this URL as an x402 endpoint and every buyer probing it finds no payment challenge at all."
              : "A buyer's payment client keys the entire flow off a 402; anything else reads as 'not a paid resource'."
          }`,
        },
  );
  if (response.status !== 402) {
    return { checks, advisories };
  }

  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) {
    checks.push({
      name: "payment-required-header",
      ok: false,
      detail:
        "the 402 carries no PAYMENT-REQUIRED header. x402 v2 clients read the challenge from that header (base64 JSON), not from the body — a body-only challenge fails every standard client while looking fine in a browser.",
    });
    return { checks, advisories };
  }

  let challenge: Record<string, unknown>;
  try {
    challenge = JSON.parse(atob(header)) as Record<string, unknown>;
    checks.push({
      name: "payment-required-header",
      ok: true,
      detail: "PAYMENT-REQUIRED header present, base64 JSON parses",
    });
  } catch {
    checks.push({
      name: "payment-required-header",
      ok: false,
      detail:
        "PAYMENT-REQUIRED header present but not base64-encoded JSON. The exact failure a client reports as an unparseable challenge.",
    });
    return { checks, advisories };
  }

  checks.push(
    challenge["x402Version"] === 2
      ? { name: "x402-version", ok: true, detail: "x402Version is 2" }
      : {
          name: "x402-version",
          ok: false,
          detail: `x402Version is ${JSON.stringify(challenge["x402Version"])}, expected 2.`,
        },
  );

  const accepts = Array.isArray(challenge["accepts"])
    ? (challenge["accepts"] as Record<string, unknown>[])
    : null;
  if (!accepts || accepts.length === 0) {
    checks.push({
      name: "accepts",
      ok: false,
      detail:
        "accepts is missing or empty — the challenge offers a buyer nothing to sign against.",
    });
    return { checks, advisories };
  }
  const holes: string[] = [];
  for (let index = 0; index < accepts.length; index += 1) {
    for (const field of ACCEPT_REQUIRED_FIELDS) {
      if (typeof accepts[index]?.[field] !== "string") {
        holes.push(`accepts[${index}].${field}`);
      }
    }
  }
  checks.push(
    holes.length === 0
      ? {
          name: "accepts",
          ok: true,
          detail: `${accepts.length} accepts entr${accepts.length === 1 ? "y" : "ies"}, each carrying ${ACCEPT_REQUIRED_FIELDS.join(", ")} — the same fields this store's own till refuses to sign offers without`,
        }
      : {
          name: "accepts",
          ok: false,
          detail: `missing or non-string: ${holes.join(", ")}. A client cannot construct a payment from a hole.`,
        },
  );

  for (const entry of accepts) {
    /**
     * SCHEME DRIFT, flagged since 2026-08-03. The L1 landscape
     * research found the ecosystem quietly forking at the scheme
     * identifier: Kite's reference implementation answers
     * "gokite-aa", Tempo's MPP is a different protocol entirely,
     * while the only independently verified volume (the x402
     * Foundation's ~75M payments/month) settles under the generic
     * "exact" scheme. An agent built against the vanilla spec cannot
     * pay a proprietary-scheme merchant without custom handling, and
     * nothing anywhere told it that before it burned the call.
     * Advisory, not a failure: the endpoint may be exactly what its
     * own ecosystem's clients expect — but a generic caller deserves
     * to know before paying, and the ward round recording this
     * weekly is the store's own time series on fragmentation.
     */
    const scheme = String(entry["scheme"] ?? "");
    if (scheme && scheme !== "exact") {
      advisories.push({
        name: "nonstandard-scheme",
        detail: `accepts offers scheme "${scheme}" rather than the spec's "exact". A generic x402 client will not recognize it without scheme-specific handling — fine for clients built to this vendor's stack, a silent dead end for everyone else.`,
      });
    }
    const network = String(entry["network"] ?? "");
    const testnet = KNOWN_TESTNETS[network];
    if (testnet) {
      advisories.push({
        name: "testnet-network",
        detail: `accepts offers ${network} (${testnet}). If this endpoint is meant for production, this is the single most common x402 stuck point: it works against testnet tooling and silently fails for every mainnet buyer, who sees only a repeating 402. Base mainnet is ${MAINNET}.`,
      });
    }
    /**
     * WHAT IS IN payTo, read against the network of the SAME entry.
     * The taxonomy and its remediation live in lib/pay-to.ts; the
     * first pass of this check lived here, matched ".eth", and told
     * Basename holders their buyers needed a mainnet resolver, which
     * is false on the rail this store is first on.
     */
    const verdict = readPayTo(String(entry["payTo"] ?? ""), String(entry["network"] ?? ""));
    if (!verdict.payable) {
      advisories.push({
        name:
          verdict.kind === "name"
            ? "payto-is-a-name"
            : verdict.kind === "wrong-rail"
              ? "payto-wrong-rail"
              : "payto-not-an-address",
        detail: verdict.detail,
      });
    }
    const amount = String(entry["amount"] ?? "");
    if (amount.includes(".")) {
      advisories.push({
        name: "amount-not-atomic",
        detail: `accepts amount "${amount}" contains a decimal point. x402 amounts are ATOMIC units (USDC has 6 decimals: $0.005 is "5000"). A dollar-typed amount here underprices by a factor of a million.`,
      });
    }
  }

  const extensions = (challenge["extensions"] ?? {}) as Record<string, unknown>;
  if ("bazaar" in extensions) {
    const bazaar = extensions["bazaar"] as Record<string, unknown> | null;
    const info =
      bazaar && typeof bazaar === "object"
        ? (bazaar["info"] as Record<string, unknown> | undefined)
        : undefined;
    checks.push(
      info && typeof info === "object"
        ? {
            name: "bazaar-extension",
            ok: true,
            detail: "extensions.bazaar carries a parseable info block",
          }
        : {
            name: "bazaar-extension",
            ok: false,
            /*
             * OBSERVATION AND INFERENCE, SPLIT — 2026-08-24, after an
             * independent tester captured this same 402 by hand,
             * confirmed the missing block, and declined to co-sign the
             * consequence: they do not run an indexer, and neither do
             * we. The old wording asserted what a directory WOULD do
             * as though we had watched one do it. Our own rule is that
             * every claim ships with a path to check it or an explicit
             * label saying it rests on inference; this check was
             * breaking that rule in the store's own voice.
             */
            detail:
              "extensions.bazaar is declared but carries no parseable info block — no name, no description, nothing an ingestion-based directory could render as a listing. THAT MISSING BLOCK IS WHAT WE OBSERVED. What follows from it — that an indexer drops or mangles the entry — is INFERENCE and not measurement: this store runs no directory ingester and has not tested one. Falsified by any directory that ingests this endpoint and renders a complete listing without an info block.",
          },
    );
  } else {
    advisories.push({
      name: "no-bazaar-extension",
      detail:
        "no extensions.bazaar block. Not a defect, and the rest of this sentence is inference rather than measurement: ingestion-based directories are documented as discovering services from this block, so without one we expect this endpoint to be findable mainly by buyers who already hold the URL. We do not run a directory ingester and have not watched one skip it. Falsified by this endpoint appearing in an ingestion-built directory with no bazaar block present.",
    });
  }

  /**
   * THE INPUT CONTRACT — 176 endpoints in the August field run took a
   * payment attempt and only then refused, for parameters the
   * challenge never mentioned.
   *
   * This is the most expensive shape of failure in the whole run,
   * because it fails AFTER the buyer has signed: the seller's own
   * message is correct ("Field \"url\" is required"), several even
   * said charged:false, and the buyer still walks away with a refusal
   * it could not have anticipated. Worse for the seller, the buyer's
   * ledger records it as the endpoint failing — that misreading is
   * exactly what withdrew this store's own August report.
   *
   * A single unpaid probe cannot see a post-payment refusal. What it
   * CAN see is whether the challenge declares an input contract at
   * all, which is the difference between a buyer that can prepare and
   * one that can only find out by losing. Declared inputs are echoed
   * back so a seller can check we read what they meant.
   */
  const bazaarInfo = isRecord(extensions["bazaar"])
    ? (extensions["bazaar"] as Record<string, unknown>)["info"]
    : undefined;
  const declaredInput = isRecord(bazaarInfo)
    ? (bazaarInfo as Record<string, unknown>)["input"]
    : undefined;
  const inputParams = isRecord(declaredInput)
    ? {
        ...(isRecord((declaredInput as Record<string, unknown>)["queryParams"])
          ? ((declaredInput as Record<string, unknown>)["queryParams"] as Record<string, unknown>)
          : {}),
        ...(isRecord((declaredInput as Record<string, unknown>)["bodyFields"])
          ? ((declaredInput as Record<string, unknown>)["bodyFields"] as Record<string, unknown>)
          : {}),
      }
    : {};
  const declaredNames = Object.keys(inputParams);
  if (declaredNames.length > 0) {
    advisories.push({
      name: "inputs-declared",
      detail: `the challenge declares the inputs a buyer must send (${declaredNames.join(", ")}), so a client can prepare them before signing. This is the good case and it is rare: most endpoints that need parameters only say so after taking a payment attempt.`,
    });
  } else if (!isRecord(declaredInput)) {
    advisories.push({
      name: "no-input-contract",
      detail:
        "the challenge declares no input contract (no extensions.bazaar.info.input). If this resource needs parameters, a buyer cannot discover that before paying — they sign, get refused for a missing field, and their logs record it as your endpoint failing. In the August 2026 field run this shape was the largest single cause of refused purchases at endpoints that were otherwise working. If the resource genuinely needs nothing, this advisory costs you nothing.",
    });
  }

  const offerReceipt = extensions["offer-receipt"] as
    | { info?: { offers?: { signature?: unknown }[] } }
    | undefined;
  const offers = offerReceipt?.info?.offers;
  if (Array.isArray(offers) && offers.length > 0) {
    const parsedOffers = offers.map((offer) =>
      typeof offer?.signature === "string"
        ? (parseJws(offer.signature) as { ok: boolean })
        : { ok: false },
    );
    const broken = parsedOffers.filter((parsed) => !parsed.ok).length;
    checks.push(
      broken === 0
        ? {
            name: "signed-offers",
            ok: true,
            detail: `${offers.length} signed offer${offers.length === 1 ? "" : "s"} present, each a structurally valid JWS. Signatures NOT verified here — that needs the issuer's key, which is a second request this probe refuses to make. The conformance desk does it free.`,
          }
        : {
            name: "signed-offers",
            ok: false,
            detail: `${broken} of ${offers.length} offers are not parseable JWS — a verifier rejects them before reading a field.`,
          },
    );
  } else {
    advisories.push({
      name: "no-signed-offers",
      detail:
        "no extensions['offer-receipt'] signed offers. Optional in the spec; without them a buyer has no pre-payment commitment to your terms that would survive a dispute.",
    });
  }

  if (bodyOverLimit) {
    advisories.push({
      name: "large-body",
      detail: `the 402 body exceeds ${MAX_BODY_BYTES} bytes; this probe stopped reading. Cheap clients will too.`,
    });
  }

  return { checks, advisories, accepts };
}

/**
 * ROADMAP 2.1a — THE TRI-STATE VECTOR (ledger B1, one layer down).
 *
 * runChecks early-returns, so a door that answered 200 emits ONE
 * check and every downstream check is silently absent. Silence welds
 * three different truths — "failed", "never ran because an earlier
 * check stopped the battery", and "does not apply" — into the same
 * missing row, which is the 0.14 defect at check granularity.
 *
 * BATTERY_CHECK_NAMES is the unconditional battery as data: the
 * checks that run on every door that answers a clean 402, in the
 * order the battery runs them. It exists as a registry so this
 * vector and a future published checks.json cannot disagree.
 * Conditional checks (bazaar-extension, signed-offers) are outside
 * it on purpose: they exist only when their subject does, and a
 * registry row for them would force this vector to invent an
 * "absent subject" observation the probe never made.
 */
export const BATTERY_CHECK_NAMES = [
  "status-402",
  "payment-required-header",
  "x402-version",
  "accepts",
] as const;

export interface TriStateRow {
  name: string;
  state: "pass" | "fail" | "not_reached";
  /** Set only on not_reached: the name of the check that stopped the battery. */
  blocked_by?: string;
  detail: string;
}

/**
 * Derives, never re-observes: every row comes from the checks
 * runChecks already emitted, so verdicts everywhere stay
 * byte-identical to before this vector existed. A check the battery
 * never reached says so structurally — which check blocked it —
 * and carries no observation about the door, because none was made.
 */
export function triStateVector(checks: PreflightCheck[]): TriStateRow[] {
  const ran = new Map(checks.map((check) => [check.name, check]));
  let blocker = "status-402";
  for (const name of BATTERY_CHECK_NAMES) {
    const check = ran.get(name);
    if (check && !check.ok) {
      blocker = name;
    }
  }
  const rows: TriStateRow[] = BATTERY_CHECK_NAMES.map((name) => {
    const check = ran.get(name);
    if (check) {
      return {
        name,
        state: check.ok ? ("pass" as const) : ("fail" as const),
        detail: check.detail,
      };
    }
    return {
      name,
      state: "not_reached" as const,
      blocked_by: blocker,
      detail: `never ran: the ${blocker} check stopped the battery before this one. No observation about the door exists for this row.`,
    };
  });
  const registry = new Set<string>(BATTERY_CHECK_NAMES);
  for (const check of checks) {
    if (!registry.has(check.name)) {
      rows.push({
        name: check.name,
        state: check.ok ? "pass" : "fail",
        detail: check.detail,
      });
    }
  }
  return rows;
}

export async function preflightUrl(
  rawUrl: unknown,
  env: Env,
  /** Which battery renders the headline verdict. Both are computed. */
  battery: PreflightBattery = PREFLIGHT_VERSION,
): Promise<{
  status: number;
  body: PreflightReport | { error: string };
  /** Set only where the status needs one; the 429 owes a Retry-After. */
  headers?: Record<string, string>;
}> {
  const base = env.STORE_BASE_URL;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return {
      status: 400,
      body: {
        error:
          'Send {"url": "https://your-endpoint/..."} — the URL a buyer would GET, expecting your 402.',
      },
    };
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { status: 400, body: { error: "That is not a parseable URL." } };
  }
  /**
   * ONE LAW, from lib/probe-target: https, default port, no
   * credentials, and no private, loopback, link-local or
   * reserved-internal target. The own-host refusal below stays here
   * because it gets a fuller answer than the shared rule can give.
   */
  const target = checkProbeTarget(url, "");
  if (!target.ok) {
    return { status: 400, body: { error: target.reason! } };
  }
  /**
   * OUR OWN HOST IS REFUSED WITH THE REASON, not probed. Cloudflare
   * kills a Worker's fetch to its own hostname (the 522 the
   * conformance desk shipped and fixed on 2026-08-03), and unlike the
   * desk there is no in-process stand-in for a real network probe —
   * serving ourselves a synthetic 402 and calling it a preflight would
   * be the instrument vouching for itself. CI holds the equivalent
   * fact instead: the store's own 402 passes runChecks() on every
   * build.
   */
  if (url.host.toLowerCase() === new URL(base).host.toLowerCase()) {
    return {
      status: 400,
      body: {
        error:
          "That is this store's own hostname, which a Cloudflare Worker cannot fetch (the platform kills self-requests). Our own 402s pass these exact checks in CI on every build — and you should not take our word for that: GET any /api/buy/{item} yourself and look. The checks this tool runs are published, so your own probe is as good as ours.",
      },
    };
  }
  if (!takeProbeBudget() || !(await takeGlobalProbeBudget(env))) {
    /*
     * RETRY-AFTER, because two of our own pages already promised it.
     * /developers and the OpenAPI spec both told readers a 429 here
     * "carries Retry-After" while this refusal shipped with a body
     * and no header. The house's own almanac says it plainer than
     * the docs did: "a no with a timestamp is a yes deferred."
     *
     * 60, not a computed remainder: the buckets reset on the
     * wall-clock minute, so the longest any caller waits is the rest
     * of this one. Stating the whole minute is never tighter than
     * the truth, which is the same direction of error the published
     * ceilings already commit to.
     */
    return {
      status: 429,
      headers: { "Retry-After": "60" },
      body: {
        error:
          "The probe budget for this minute is spent — a cost bound on our side, not a fact about your endpoint. Retry next minute.",
      },
    };
  }

  let outcome: ProbeOutcome;
  try {
    outcome = await probeOnce(url.toString(), fetch, "", env);
  } catch (error) {
    return {
      status: 200,
      body: report(base, "unreachable", [
        {
          name: "reachable",
          ok: false,
          detail: `the probe could not complete: ${String(error)}. This is a fact about the network path between us and that host at this moment — it does not prove the endpoint is down, and a buyer elsewhere may reach it fine.`,
        },
      ], []),
    };
  }

  const { checks, advisories, accepts } = runChecks(
    outcome.response,
    outcome.bodyOverLimit,
  );
  /*
   * THE RAIL READ, added 2026-08-23, DELIBERATELY AS AN ADVISORY.
   *
   * It reports a real defect — a payTo that owns no USDC token account
   * cannot be credited, so the door 402s perfectly and nobody can pay
   * it — and on the merits that should sink a verdict. It does not,
   * yet, and the reason is a contract rather than a doubt.
   *
   * FIVE INSTRUMENTS SHARE runChecks(): this preflight, the paid
   * service_audit, the conformance_watch, the standing_watch and the
   * census ward round. The audit's published promise is that it runs
   * "the free preflight's exact battery", and the criteria page says a
   * new battery is a NEW VERSION, named on every artifact it produces.
   * Moving this into the verdict here alone would make five
   * instruments disagree about one door; moving it into all five is a
   * preflight-v2, which renames the criteria on every signed artifact
   * the store issues. That is the keeper's call, not a side effect of
   * adding a check.
   *
   * So it rides as an advisory: outside the verdict by the existing
   * contract, in front of the operator today, and one line from
   * becoming a check the day v2 is ruled on.
   */
  const rail = accepts
    ? await checkRailReceivable(env, accepts).catch(() => ({
        check: null,
        advisory: null,
      }))
    : { check: null, advisory: null };
  if (rail.advisory) advisories.push(rail.advisory);

  /*
   * ONE PROBE, TWO BATTERIES (2026-08-23).
   *
   * v1 is frozen: the structural checks and nothing else, so a `ready`
   * recorded today means exactly what a `ready` recorded in week 34
   * meant. The rail read rides it as an advisory, outside the verdict.
   *
   * v2 folds the rail read INTO the verdict, because a door whose payTo
   * cannot be credited is not ready by any reading a buyer would accept
   * — and /defects says so in public.
   *
   * Both are computed from the SAME observation, so they can never
   * disagree about what was seen, only about what counts. That is the
   * whole reason to run an overlap rather than cut the old series.
   */
  const v1Checks = [...checks];
  const v2Checks = rail.check ? [...checks, rail.check] : [...checks];
  const scoreOf = (entries: PreflightCheck[]): PreflightReport["verdict"] =>
    entries.every((check) => check.ok) ? "ready" : "not_ready";
  const v1Verdict = scoreOf(v1Checks);
  const v2Verdict = scoreOf(v2Checks);

  const asked = battery === PREFLIGHT_VERSION_NEXT ? "v2" : "v1";
  const servedChecks = asked === "v2" ? v2Checks : v1Checks;
  const servedVerdict = asked === "v2" ? v2Verdict : v1Verdict;
  const otherVersion =
    asked === "v2" ? PREFLIGHT_VERSION : PREFLIGHT_VERSION_NEXT;
  const otherVerdict = asked === "v2" ? v1Verdict : v2Verdict;

  /*
   * If the rail read produced nothing — no Solana rail offered, or the
   * ledger would not answer — the two batteries scored identically and
   * saying so plainly beats implying a distinction that did not apply.
   */
  const difference = rail.check
    ? `v2 folds solana-rail-receivable into the verdict; v1 reports it as an advisory. On this probe the two batteries ${v1Verdict === v2Verdict ? "agreed" : "DISAGREED"}.`
    : "The rail read did not apply to this endpoint (no Solana rail offered, or the ledger could not be read), so both batteries scored the identical set of checks.";

  return {
    status: 200,
    body: report(base, servedVerdict, servedChecks, advisories, {
      battery: asked,
      alsoUnder: {
        version: otherVersion,
        verdict: otherVerdict,
        difference,
      },
    }),
  };
}
