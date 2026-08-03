import { parseJws } from "../../verifier/x402-verify.js";
import { CONFLICT } from "@/services/conformance";
import { storeIdentity } from "@/lib/identity";
import type { Env } from "@/types";

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

export const PREFLIGHT_VERSION = "v1";

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
const PROBES_PER_MINUTE = 30;
const GLOBAL_PROBES_PER_MINUTE = 60;
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
  store_identity: ReturnType<typeof storeIdentity>;
  next_steps: Record<string, string>;
}

function report(
  base: string,
  verdict: PreflightReport["verdict"],
  checks: PreflightCheck[],
  advisories: PreflightAdvisory[],
): PreflightReport {
  return {
    version: PREFLIGHT_VERSION,
    verdict,
    checks,
    advisories,
    single_probe_note:
      "One request, one moment. This says whether the endpoint is SHAPED right now, never whether it is reliable — a passing preflight quoted as an uptime claim is a misquote.",
    what_this_cannot_tell_you: [
      "Whether the service behind the 402 delivers anything after payment. No probe can; that is a fact about the world, not about bytes.",
      "Whether the endpoint stays up. This was one request at one moment.",
      "Whether the signed offers verify — this probe deliberately makes no second request, so the offers' did:web was not resolved. POST one to the conformance desk for that.",
    ],
    our_conflict_of_interest: CONFLICT,
    store_identity: storeIdentity(base),
    next_steps: {
      conformance_desk: `POST ${base}/api/conformance/v1 — full verification of any signed offer this 402 carried: structure, signature against the issuer's did:web key, liveness. Free.`,
      behavioral_check: `${base}/api/buy/phantom_check — the paid rung of the same ladder: a signed, out-of-band probe attestation minted hours after purchase, for when you need evidence rather than a readout.`,
    },
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
): { checks: PreflightCheck[]; advisories: PreflightAdvisory[] } {
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
            detail:
              "extensions.bazaar is declared but carries no parseable info block — a discovery indexer will drop or mangle this listing.",
          },
    );
  } else {
    advisories.push({
      name: "no-bazaar-extension",
      detail:
        "no extensions.bazaar block. Not a defect — but ingestion-based directories discover services from this block, so without one this endpoint is only findable by buyers who already have the URL.",
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

  return { checks, advisories };
}

export async function preflightUrl(
  rawUrl: unknown,
  env: Env,
): Promise<{ status: number; body: PreflightReport | { error: string } }> {
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
  if (url.protocol !== "https:") {
    return {
      status: 400,
      body: {
        error:
          "https only. A payment endpoint on plain http is already failing a check no probe needs to run.",
      },
    };
  }
  if (url.port !== "" && url.port !== "443") {
    return {
      status: 400,
      body: { error: "Default https port only — this probe does not dial custom ports." },
    };
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
    return {
      status: 429,
      body: {
        error:
          "The probe budget for this minute is spent — a cost bound on our side, not a fact about your endpoint. Retry next minute.",
      },
    };
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
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

  // Bound the read before anything parses it.
  const raw = await response.text();
  const bodyOverLimit = raw.length > MAX_BODY_BYTES;

  const { checks, advisories } = runChecks(response, bodyOverLimit);
  const verdict = checks.every((check) => check.ok) ? "ready" : "not_ready";
  return { status: 200, body: report(base, verdict, checks, advisories) };
}
