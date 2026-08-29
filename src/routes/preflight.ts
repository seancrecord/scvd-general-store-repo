import { PUBLISHED_LICENCE } from "@/lib/dataset-envelope";
import {
  freeInstrumentPrice,
  surfaceSecurity,
  type SurfaceError,
} from "@/store/surface-contract";
import { Hono, type Context } from "hono";
import {
  ACCEPT_REQUIRED_FIELDS,
  BATTERY_ADDS,
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSIONS,
  PREFLIGHT_VERSION_NEXT,
  PREFLIGHT_V2_SINCE,
  preflightUrl,
  type PreflightBattery,
  ADVISORY_NAMES,
  BATTERY_CHANGELOG,
  BATTERY_CHECK_NAMES,
  CONDITIONAL_CHECK_NAMES,
  VERDICT_FOLD_CHECK_NAMES,
} from "@/services/preflight";
import { lifecycleHeaders } from "@/store/api-lifecycle";
import type { HonoEnv } from "@/types";

/**
 * /api/preflight — the endpoint half of the free verification ladder.
 * The desk checks artifacts; this checks the door they come out of.
 * See services/preflight.ts for why it exists and what one probe can
 * and cannot say.
 */
/**
 * WHAT THIS DOOR ITSELF CAN REFUSE, by name (rule 57.4).
 *
 * `common_failures_this_catches` above is about the door you POINT
 * this at. These are about THIS call — the ones a small model has to
 * be able to branch on without guessing, and the reason a bare
 * "invalid_url" was not enough: a name with no next step is a label,
 * not a category.
 */
const PREFLIGHT_ERRORS: readonly SurfaceError[] = [
  {
    code: "missing_url",
    http: 400,
    means: "the request body carried no `url` field, or it was not a string",
    what_to_do:
      'POST {"url": "https://your.host/your-paid-endpoint"} as JSON. The URL is the one a buyer would GET expecting a 402 — the buy endpoint, not the homepage.',
  },
  {
    code: "unsupported_url",
    http: 400,
    means:
      "the URL was not https, named a private, loopback or link-local address, or named this store's own hostname",
    what_to_do:
      "Give a public https URL on the open internet. We refuse private addresses so this stays a checker rather than a probe somebody points at an internal network, and we refuse our own hostname because a store grading itself is not evidence.",
  },
  {
    code: "rate_limited",
    http: 429,
    means:
      "you passed one of the two ceilings — the per-isolate bucket or the global best-effort cap of 60 probes a minute across all callers",
    what_to_do:
      "Wait and retry; the body says which ceiling and the cap is our cost bound, never a fact about your endpoint. Nothing you can buy raises it, so backing off is the whole remedy.",
  },
  {
    code: "unreachable",
    http: 200,
    means:
      "we reached the network and the host did not answer — DNS failure, TLS failure, connection refused or a timeout. This is a VERDICT, not an error status, and it must not be retried as one",
    what_to_do:
      "Read `verdict: unreachable` and the reason beside it. It is a dated fact about one moment from one vantage: if you believe the door is up, probe it yourself from your side and tell us — the corrections desk takes it.",
  },
] as const;

export const preflightRoutes = new Hono<HonoEnv>();

/**
 * THE GET IS THE DOCUMENT, and it deliberately carries the literal
 * failure strings a stuck developer pastes into a search box or an
 * assistant — "stuck returning 402", "eip155:84532", the CDP reason
 * codes. A tool findable only by people who already know its name
 * helps nobody at the moment of failure, and the moment of failure
 * is the only moment this tool is for.
 */
function doc(base: string, battery: PreflightBattery = PREFLIGHT_VERSION) {
  return {
    title: "The x402 endpoint preflight",
    version: battery,
    /**
     * BOTH BATTERIES, AND WHY THE OLD ONE KEPT RUNNING. An observatory
     * that changes an instrument in place loses the ability to compare
     * this week to last. v1 is frozen so its series keeps its meaning;
     * v2 folds in the Solana rail-receivability read, whose series
     * starts on its own stated date. One probe scores both, so the two
     * verdicts can never disagree about what was seen.
     */
    batteries: {
      served: PREFLIGHT_VERSIONS,
      this_one: battery,
      v2_adds: BATTERY_ADDS[PREFLIGHT_VERSION_NEXT],
      v2_series_begins: PREFLIGHT_V2_SINCE,
      why_both:
        "v1 is frozen: a `ready` rendered under it today means what a `ready` rendered under it in week 34 meant, and every artifact this store has signed names the criteria it was rendered under. v2 folds the rail read into the verdict, because a payTo that owns no token account for the mint it asked for cannot be credited and is not ready by any reading a buyer would accept. Both are computed from the SAME probe and every response carries the other one's verdict in `also_under`, so a reader comparing two reports never has to guess whether the doors differed or the rules did.",
      defect_vocabulary: `${base}/defects`,
    },
    summary:
      "Send a URL; we GET it once and report whether it answers a well-formed x402 v2 payment challenge: a 402 status, a parseable base64 PAYMENT-REQUIRED header, accepts entries a client can actually sign against, and structurally valid signed offers if declared. Free, no account. One probe, one moment — a shape check, never an uptime claim.",
    method: "POST",
    url: `${base}/api/preflight/${PREFLIGHT_VERSION}`,
    request: {
      url: "REQUIRED. The https URL a buyer would GET expecting your 402 — your buy endpoint, not your homepage.",
    },
    rate_limit:
      "Two ceilings, both ours: a strict per-isolate bucket and a global best-effort cap of 60 probes/minute across all callers. Past either you get a 429 that says the budget is our cost bound, not a fact about your endpoint. The global cap is eventually-consistent, so it can run slightly generous — never tighter than stated. This endpoint makes one outbound GET per call to a host you chose; the cap is what keeps it a checker rather than a relay.",
    what_it_checks: [
      "The endpoint answers 402 Payment Required (a 200 is the 'listed but functionally absent' failure; a redirect is refused, because payment clients refuse it too).",
      "PAYMENT-REQUIRED header present and base64-JSON parseable — x402 v2 clients read the challenge there, not from the body.",
      "x402Version is 2.",
      `Every accepts entry carries ${ACCEPT_REQUIRED_FIELDS.join(", ")} as strings — the same fields this store's own till refuses to sign offers without.`,
      "extensions.bazaar, if declared, carries a parseable info block (what discovery ingestion actually reads).",
      "extensions['offer-receipt'] signed offers, if present, are structurally valid JWS. Their signatures are NOT verified here — that needs a second request to the issuer's did:web, which this probe refuses to make in your name. The conformance desk does it free.",
    ],
    common_failures_this_catches: {
      stuck_repeating_402:
        "A client that keeps getting 402 after attaching PAYMENT-SIGNATURE is very often paying against the wrong network: accepts offering eip155:84532 (Base Sepolia) or another testnet while the buyer is on Base mainnet, eip155:8453. The probe flags known testnets as an advisory.",
      listed_but_functionally_absent:
        "A directory lists your URL as an x402 endpoint but it answers 200, 404 or 500 instead of a 402. Independent probing found the majority of one directory's listings in this state. This is check one.",
      unparseable_challenge:
        "PAYMENT-REQUIRED header missing or not base64 JSON — surfaces client-side as 'Invalid payment header format' or a silent parse failure.",
      amount_units:
        "Amounts are ATOMIC units (USDC: 6 decimals, $0.005 = \"5000\"). A decimal point in an accepts amount usually means dollar-typed pricing, off by a factor of a million; the probe flags it.",
      unpayable_payto:
        "payTo must be the bytes a payment signs over — a 20-byte 0x address on EVM rails, a base58 pubkey on Solana. A name (ENS, Basename, SNS, Unstoppable) is a resolution step the protocol does not define, so most clients throw inside their signing library and you never learn a buyer came; the probe names the registry and the chain it resolves on. It also catches the wallet pasted into the wrong rail's entry — a 0x address in a solana accepts entry or base58 in an eip155 one — which nobody can pay, resolver or not.",
      inputs_only_discovered_by_paying:
        "If your resource needs parameters and the challenge does not declare them (extensions.bazaar.info.input), a buyer finds out by being refused AFTER signing a payment — and their ledger records that as YOUR endpoint failing. In the August 2026 field run this was the largest single cause of refused purchases at otherwise-working endpoints. The probe flags the missing contract and credits a declared one.",
      after_verify_failures: `Facilitator codes like invalid_exact_evm_payload_signature or settle_exact_failed_onchain happen AFTER the challenge stage, at verify/settle time, and depend on the specific payment attempt — a preflight cannot catch them and this one does not pretend to. For the artifact half (do the signed offers verify against the issuer's published key), use POST ${base}/api/conformance/v1.`,
    },
    what_it_cannot_check: [
      "Delivery. Whether anything real happens after payment is a fact about the world; the paid behavioral rung of this ladder is standing_watch.",
      "Reliability. One probe is one moment; this is not a monitor and its output is not an uptime claim.",
      "Verify/settle-time failures — wallet state, signatures over a specific payment, on-chain conditions. Those belong to the payment attempt, not the endpoint's shape.",
    ],
    the_ladder: {
      artifact: `${base}/api/conformance/v1 — any issuer's signed offer or receipt, verified free.`,
      endpoint: `${base}/api/preflight/${PREFLIGHT_VERSION} — this tool.`,
      this_moment_signed: `${base}/api/buy/service_audit — these exact checks, signed and bound into a certificate, served at a permanent report URL: for when you need to hand somebody the readout rather than run it.`,
      across_a_week: `${base}/api/buy/conformance_watch — these exact checks once a day for seven days, each day signed alone: for catching a deploy that quietly breaks the challenge mid-week.`,
      behavior: `${base}/api/buy/standing_watch — a paid, signed week of out-of-band hourly probes, for evidence rather than a readout.`,
    },
    try_it_against_a_live_endpoint:
      "Any of this store's own buy URLs is a permanent, free, working example of what a passing challenge looks like — GET one and compare. We cannot probe our own hostname from inside the Worker (the platform forbids self-fetch), so CI proves the store passes these exact checks on every build instead, and you are encouraged to probe us from your side rather than take that on faith.",

    /* ---- the five answers rule 57 requires (2026-08-29) ---- */

    what_you_can_use_it_for:
      `Anything a structural read of somebody's 402 is good for. Some obvious ones: gating a door before your client spends a signature on it, triaging a payment that keeps failing, checking your OWN endpoint before you announce it, screening a directory listing you did not write, or sampling the ecosystem for research. There is no use case we are reserving, and the answer is yours under the same terms as every dataset here (${PUBLISHED_LICENCE}) — if you build something we did not think of, that is the point of publishing it free.`,

    expected_outcome:
      "HTTP 200 and a JSON object carrying `verdict` (ready | not_ready | unreachable | refused), `checks` — one entry per check named in what_it_checks, each with its own pass and the reason for a fail — `advisories` naming defects from the published vocabulary, and `also_under` with the other battery's verdict on the same probe. A `not_ready` is a successful call: the answer is about the door you named, not about this request. Only a 4xx or 5xx here is a failure of ours.",

    errors: PREFLIGHT_ERRORS,

    price: freeInstrumentPrice(base, [
      {
        id: "service_audit",
        instead:
          "these exact checks, signed and bound into a certificate at a permanent report URL — for when you need to hand somebody the readout rather than run it",
      },
      {
        id: "conformance_watch",
        instead:
          "these exact checks once a day for seven days, each day signed alone, our own missed days counted against us",
      },
      {
        id: "standing_watch",
        instead:
          "the same question hour by hour across a week, which catches a door that answers two different ways inside one minute",
      },
    ]),

    security: surfaceSecurity({
      what_this_surface_reads:
        "One HTTPS GET to the URL you name, from our infrastructure, with no credentials of yours and no payment attached. We read the response's status, headers and body to score the challenge. We refuse private and loopback addresses, refuse redirects, and refuse our own hostname; we never follow a link out of the response, and we never send anything of yours to the host you named.",
      what_it_stores_about_you:
        "No account, no cookie, no key. The URL you submit and the verdict are counted for rate limiting and for the store's own published traffic tallies; nothing is keyed to you as a caller, and the body of the probed response is not retained.",
      what_the_data_is:
        "One observation of a PUBLIC endpoint, taken by one unauthenticated GET of the kind any buyer would make. No authentication is bypassed, no rate limit is evaded, and nothing private is read to produce a verdict.",
      integrity:
        "THIS ANSWER IS NOT SIGNED. It is a live read handed back over TLS and nothing more — you cannot hand it to a third party as evidence, because there is nothing in it they could check. The paid rungs above exist for exactly that: they run these same checks and bind the result into an ed25519-signed certificate at a permanent URL. Do not represent a free preflight as an audit.",
    }),
  };
}

/**
 * THE LIFECYCLE HEADERS, WIRED RATHER THAN PROMISED.
 *
 * /deprecation says a retiring version carries RFC 8594 Sunset and
 * Deprecation for at least ninety days. This is where that sentence
 * becomes a mechanism: every versioned answer asks the same table the
 * policy page prints whether its own path is on the way out. Nothing
 * is today, so this adds nothing to the wire today — and the day a
 * row in store/api-lifecycle.ts gains a date, the headers appear
 * without anybody remembering that a second place needed editing.
 * A policy nobody wired up is a paragraph.
 */
function withLifecycle(c: Context<HonoEnv>, path: string): Record<string, string> {
  return lifecycleHeaders(path, c.env.STORE_BASE_URL);
}

for (const battery of PREFLIGHT_VERSIONS) {
  preflightRoutes.get(`/api/preflight/${battery}`, (c) =>
    c.json(
      doc(c.env.STORE_BASE_URL, battery),
      200,
      withLifecycle(c, `/api/preflight/${battery}`),
    ),
  );
}
preflightRoutes.get("/api/preflight", (c) => c.json(doc(c.env.STORE_BASE_URL)));

/**
 * 2.3 — THE BATTERY MANIFEST, DERIVED AND DIGESTED. Every field comes
 * from the same registries runChecks reads; nothing here is typed by
 * hand, so the criteria cannot drift from the code that renders
 * verdicts. ruleset_digest is recomputable by a stranger from the
 * document alone: SHA-256 over JSON.stringify of the covered fields,
 * in the order ruleset_digest_covers names them.
 */
preflightRoutes.get("/api/preflight/checks", async (c) => {
  const covered: Record<string, unknown> = {
    core_checks: [...BATTERY_CHECK_NAMES],
    conditional_checks: [...CONDITIONAL_CHECK_NAMES],
    verdict_fold_checks: [...VERDICT_FOLD_CHECK_NAMES],
    advisories: [...ADVISORY_NAMES],
    batteries: Object.fromEntries(
      PREFLIGHT_VERSIONS.map((version) => [
        version,
        { adds: [...BATTERY_ADDS[version]] },
      ]),
    ),
    changelog: BATTERY_CHANGELOG.map((entry) => ({ ...entry })),
  };
  const coversList = Object.keys(covered);
  const payload = JSON.stringify(
    Object.fromEntries(coversList.map((f) => [f, covered[f]])),
  );
  const digestBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  const digest = [...new Uint8Array(digestBytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return c.json({
    ...covered,
    ruleset_digest_covers: coversList.join(", "),
    ruleset_digest: digest,
    how_to_recompute:
      "JSON.stringify an object holding the fields ruleset_digest_covers names, in that order, exactly as served; SHA-256 the UTF-8 bytes; hex-encode. No canonicalizer beyond field order — the served bytes are the canonical form.",
    note: "Derived from the same registries the battery runs. A criteria page and a verdict can no longer disagree, because both read this.",
  });
});

async function handle(
  c: Context<HonoEnv>,
  battery: PreflightBattery = PREFLIGHT_VERSION,
) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: 'Body must be JSON: {"url": "https://your-endpoint/..."}' },
      400,
    );
  }
  const url =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["url"]
      : undefined;
  const result = await preflightUrl(url, c.env, battery);
  return c.json(result.body, result.status as 200, {
    "Cache-Control": "no-store",
    ...withLifecycle(c, `/api/preflight/${battery}`),
    // The answer carries its own headers — the RFC RateLimit fields on
    // anything the limiter metered, and Retry-After on the refusal,
    // which two of our own pages had already promised readers.
    ...result.headers,
  });
}

for (const battery of PREFLIGHT_VERSIONS) {
  preflightRoutes.post(`/api/preflight/${battery}`, (c) => handle(c, battery));
}
/* The unversioned door keeps rendering v1, so an existing caller's
 * verdicts stay comparable to the ones it already holds. */
preflightRoutes.post("/api/preflight", (c) => handle(c, PREFLIGHT_VERSION));
