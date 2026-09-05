import { Hono, type Context } from "hono";
import {
  MARKDOWN_MEDIA_TYPE,
  prefersMarkdown,
  VARY_ACCEPT,
} from "@/lib/accept";
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
import { PROBE_DOOR_ERRORS, securityBlock } from "@/store/surface-contract";
import { ladderRung } from "@/services/menu-markdown";
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
    /**
     * THE LADDER, PRICED (rule 57.3, 2026-08-29). It named four buy
     * URLs and not one price or cadence, so an agent reading the free
     * tool's own documentation had to leave and find the shelf before
     * it could decide anything. Prices and terms are read off the
     * menu, never typed here.
     */
    the_ladder: {
      free_first: {
        artifact: `${base}/api/conformance/v1 — any issuer's signed offer or receipt, verified free.`,
        endpoint: `${base}/api/preflight/${PREFLIGHT_VERSION} — this tool. Free.`,
        the_buyer_side: `${base}/api/before-you-pay/v1 — whether YOUR client would actually pay it. Free.`,
        a_sample_of_the_paid_one: `${base}/samples/once-over.json — every field the $5 artifact carries, unsigned, so you can see it before buying it.`,
      },
      paid: [
        ladderRung(
          base,
          "service_audit",
          "these exact checks, signed and bound into a certificate at a permanent URL: for when you need to hand somebody the readout rather than run it",
        ),
        ladderRung(
          base,
          "conformance_watch",
          "these exact checks once a day, each day signed alone: for catching a deploy that quietly breaks the challenge mid-week",
        ),
        ladderRung(
          base,
          "standing_watch",
          "out-of-band hourly probes, signed: evidence rather than a readout",
        ),
      ].filter(Boolean),
    },
    expected_outcome:
      "HTTP 200 and a report naming every check with ok true or false, the advisories, the verdict under this battery, and `also_under` carrying the other battery's verdict on the same probe. A not_ready verdict is a successful call — the tool worked and found something. Only the codes below mean the call itself did not happen.",
    /**
     * THE FAILURES OF CALLING US (rule 57.4). This file has always
     * documented, at length and by name, the failures it finds in
     * OTHER people's endpoints — and never once said what it returns
     * when the caller gets it wrong. The codes are new and additive;
     * the English `error` sentence is unchanged and still served.
     */
    errors: PROBE_DOOR_ERRORS,
    security: securityBlock(base, {
      does_in_your_name:
        "Exactly one outbound GET, to the URL you supplied, with no credentials and no body, bounded in time and in response size. Nothing is signed, no wallet is touched, and we never follow a redirect — payment clients refuse them and so do we. Your URL is the only thing we act on.",
      stores:
        "Nothing keyed to you. The probe result is returned and not retained; the only thing that persists is an unattributed counter of how many probes ran this minute, which is how the budget below is enforced.",
    }),
    try_it_against_a_live_endpoint:
      "Any of this store's own buy URLs is a permanent, free, working example of what a passing challenge looks like — GET one and compare. We cannot probe our own hostname from inside the Worker (the platform forbids self-fetch), so CI proves the store passes these exact checks on every build instead, and you are encouraged to probe us from your side rather than take that on faith.",
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
  preflightRoutes.get(`/api/preflight/${battery}`, (c) => {
    const base = c.env.STORE_BASE_URL;
    c.header("Vary", VARY_ACCEPT);
    /*
     * JSON stays the default — this is an API door and a caller who
     * stated no preference wants the machine form. Markdown fires only
     * when a client ranked it above JSON, which is the same rule every
     * negotiating surface here follows.
     */
    if (prefersMarkdown(c.req.header("Accept"), "application/json", c.req.header("User-Agent"))) {
      return c.text(docMarkdown(base, battery), 200, {
        "content-type": MARKDOWN_MEDIA_TYPE,
        Vary: VARY_ACCEPT,
        ...withLifecycle(c, `/api/preflight/${battery}`),
      });
    }
    return c.json(
      doc(base, battery),
      200,
      withLifecycle(c, `/api/preflight/${battery}`),
    );
  });
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

/**
 * THE SAME DOCUMENT, LAID OUT FOR A READER.
 *
 * Every sentence here is already in `doc()` — this writes none of its
 * own. What it does is give the prose a shape a person or an agent can
 * read straight through, instead of a nested object they have to walk.
 * The distinction matters and is the reason this is a hand-written
 * layout rather than a generic JSON-to-markdown printer: a mechanical
 * dump would publish a document nobody wrote, which is the one thing
 * this store does not do. The words are the keeper's; only the
 * headings are new.
 *
 * It exists because /api/preflight/v1 answered a reader who wanted to
 * know what the instrument checks with a JSON blob, and a 2026-08-30
 * scan sampled exactly this path with a `.md` suffix and found
 * nothing. The suffix works now too — index.ts's twin fallback asks
 * this route for markdown and passes the answer through — so one
 * change serves both mechanisms.
 */
function docMarkdown(base: string, battery: PreflightBattery): string {
  const d = doc(base, battery) as Record<string, unknown>;
  const list = (value: unknown): string =>
    Array.isArray(value)
      ? value.map((line) => `- ${String(line)}`).join("\n")
      : "";
  const pairs = (value: unknown): string =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
          .map(([key, entry]) => `- **\`${key}\`** — ${String(entry)}`)
          .join("\n")
      : "";

  return `---
title: "${String(d["title"])} (${battery})"
description: "${String(d["summary"]).replace(/"/g, "'")}"
canonical: "${base}/api/preflight/${battery}"
url: "${base}/api/preflight/${battery}"
battery: "${battery}"
method: "POST"
price: "free"
auth: "none"
defect_vocabulary: "${base}/defects"
---

# ${String(d["title"])} — ${battery}

${String(d["summary"])}

## How to call it

\`\`\`
POST ${base}/api/preflight/${battery}
Content-Type: application/json

{"url": "https://your-endpoint/..."}
\`\`\`

${pairs(d["request"])}

Free, and no account exists to open. The whole procedure for every door
in this store is at ${base}/auth.md.

## What it checks

${list(d["what_it_checks"])}

## What it cannot check

${list(d["what_it_cannot_check"])}

## Common failures this catches

${pairs(d["common_failures_this_catches"])}

## Rate limits

${String(d["rate_limit"])}

## What a verdict means

${String(d["expected_outcome"])}

The named defect vocabulary every verdict cites: ${base}/defects.
The battery manifest, with the stable check ids and a recomputable
ruleset digest: ${base}/api/preflight/checks.

## Several doors at once

${base}/api/preflight/batch takes up to ten URLs in one call. Each one
is a real probe and is metered as one — batching saves you connections,
not outbound requests.
`;
}

/**
 * THE MOST A BATCH MAY CARRY, and why there is a ceiling at all.
 *
 * Each entry is a real outbound GET to a host the caller chose. Ten is
 * where a convenience stops being a convenience and starts being a
 * relay somebody else's infrastructure sees as us — and this door's
 * whole defence of itself is that it is a checker rather than a relay.
 * A caller with a hundred doors sends ten batches, and the rate limiter
 * meters those the same as a hundred single calls, which is the point.
 */
const BATCH_MAX = 10;

/**
 * POST /api/preflight/batch — the same probe, several doors, one call.
 *
 * WHY THIS EXISTS. The single-URL door has always been the whole
 * instrument, and for the reader it was built for — somebody stuck on
 * one endpoint at two in the morning — it is the right shape. It is
 * the wrong shape for the other real reader: an agent holding a
 * directory listing, checking whether thirty advertised x402 doors
 * actually answer 402. That reader had to open thirty connections and
 * write the loop, and a 2026-08-30 scan noted the absence.
 *
 * WHAT IT IS NOT: cheaper. Ten URLs is ten probes and is metered as
 * ten, against the same buckets a single call draws on. Nothing here
 * buys a discount on somebody else's bandwidth, and the response says
 * so in `not_a_discount` rather than leaving a caller to discover it
 * from a 429 halfway down their list.
 *
 * SEQUENTIAL, DELIBERATELY. Firing ten concurrent GETs from one worker
 * at hosts we do not run is the behaviour that gets an instrument
 * blocked, and it would also make the rate limiter's accounting
 * approximate at exactly the moment it matters. Slower and countable
 * beats fast and arguable.
 *
 * 200 WITH PER-ITEM STATUS, not 207. A batch that half-worked is a
 * successful batch containing failures — the caller's parse is the
 * same either way, and 207 is a WebDAV status most HTTP clients treat
 * as an oddity. Each entry carries the status its own probe returned,
 * so nothing is flattened.
 */
preflightRoutes.post("/api/preflight/batch", async (c) => {
  const base = c.env.STORE_BASE_URL;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error:
          'Body must be JSON: {"urls": ["https://one/...", "https://two/..."]}',
        max_urls: BATCH_MAX,
      },
      400,
    );
  }
  const urls =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["urls"]
      : undefined;
  if (!Array.isArray(urls) || urls.length === 0) {
    return c.json(
      {
        error:
          '`urls` must be a non-empty array of the https URLs a buyer would GET expecting a 402.',
        max_urls: BATCH_MAX,
        single_door: `${base}/api/preflight`,
      },
      400,
    );
  }
  if (urls.length > BATCH_MAX) {
    /*
     * REFUSED WHOLE, not silently truncated. Serving the first ten of
     * thirty and saying nothing would hand a caller a clean-looking
     * report about twenty doors nobody looked at — which is precisely
     * the "listed but functionally absent" failure this instrument
     * exists to catch, committed by the instrument.
     */
    return c.json(
      {
        error: `A batch carries at most ${BATCH_MAX} URLs; you sent ${urls.length}. Nothing was probed — a truncated batch would report on doors nobody looked at.`,
        max_urls: BATCH_MAX,
        sent: urls.length,
        what_to_do: `Send ${Math.ceil(urls.length / BATCH_MAX)} batches. They are metered exactly as the same number of single calls, so nothing is lost by splitting.`,
      },
      400,
    );
  }

  const results: Record<string, unknown>[] = [];
  /**
   * THE LIVE BUDGET, CARRIED OUT OF THE LAST PROBE.
   *
   * Each entry is metered exactly as a single call is, and each one's
   * answer carries the IETF RateLimit fields. Discarding them would
   * have left this door advertising a ceiling in the contract and
   * returning nothing a caller could pace against — which is the
   * "documents a ceiling nothing enforces" failure the store's own
   * guard catches, committed by the door that batches the instrument
   * whose limiter is the whole reason the fields exist.
   *
   * The LAST probe's headers are the ones that ride out, because they
   * are the only ones still true when the response leaves: they report
   * what remains AFTER the whole batch, which is what a caller pacing
   * its next batch needs.
   */
  let budgetHeaders: Record<string, string> = {};
  for (const url of urls) {
    // One at a time. See the note above the handler.
    const result = await preflightUrl(url, c.env, PREFLIGHT_VERSION);
    budgetHeaders = result.headers ?? budgetHeaders;
    results.push({
      url: typeof url === "string" ? url : null,
      status: result.status,
      result: result.body,
    });
  }

  return c.json(
    {
      battery: PREFLIGHT_VERSION,
      count: results.length,
      results,
      not_a_discount: `Each entry was a real probe and was metered as one. ${results.length} URLs cost ${results.length} probes against the same budget a single call draws on; batching saves you connections, not our outbound requests or anyone else's bandwidth.`,
      one_moment_each:
        "Every entry is one GET at one moment, exactly like the single-URL door. None of these are uptime claims, and a door that answered here can be down a minute later.",
      single_door: `${base}/api/preflight`,
      defect_vocabulary: `${base}/defects`,
    },
    200,
    {
      "Cache-Control": "no-store",
      ...withLifecycle(c, "/api/preflight"),
      // What the limiter had left when the last entry finished.
      ...budgetHeaders,
    },
  );
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
