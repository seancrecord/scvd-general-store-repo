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
} from "@/services/preflight";
import type { HonoEnv } from "@/types";

/**
 * /api/preflight — the endpoint half of the free verification ladder.
 * The desk checks artifacts; this checks the door they come out of.
 * See services/preflight.ts for why it exists and what one probe can
 * and cannot say.
 */
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
  };
}

for (const battery of PREFLIGHT_VERSIONS) {
  preflightRoutes.get(`/api/preflight/${battery}`, (c) =>
    c.json(doc(c.env.STORE_BASE_URL, battery)),
  );
}
preflightRoutes.get("/api/preflight", (c) => c.json(doc(c.env.STORE_BASE_URL)));

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
    // The refusal carries its own headers — a 429 owes Retry-After,
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
