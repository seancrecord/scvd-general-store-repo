import { HonoAdapter } from "@x402/hono";
import { challengeHint } from "@/store/agent-auth";
import type {
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/server";
import type { Context, MiddlewareHandler } from "hono";
import { decodeBase64Json, encodeBase64Json } from "@/lib/base64-json";
import { offerExtensionsFor } from "@/lib/offer-receipt";
import { deferBookkeeping } from "@/lib/defer-bookkeeping";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sendAlert } from "@/lib/alerts";
import { isHouseTraffic } from "@/lib/channel";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import { factBlockText, listingSpec } from "@/lib/listing-spec";
import {
  itemKeyFromPath,
  metricsMonth,
  recordChallengeIssued,
  recordRouteTiming,
  recordServerError,
  recordPaymentDecline,
  recordSettlement,
} from "@/lib/metrics";
import type { EventSignals } from "@/lib/metrics";
import {
  bookedReason,
  decodePaymentHeader,
  payerFromPaymentHeader,
  payloadProblemsFor,
  preflightBlockers,
  refusalBeforeVerify,
} from "@/lib/decline-diagnosis";
import {
  idempotencyScope,
  lookupIdempotentWithBucketGrace,
  replayNote,
  SUGGESTED_KEY_BUCKET_SECONDS,
  suggestedIdempotencyKey,
  storeIdempotent,
  usableIdempotencyKey,
} from "@/lib/idempotency";
import { HOUSE_RULE, WALLET_SAFETY } from "@/store/wallet-safety";
import {
  BASE_NETWORK,
  DECLINE_SLOT_KEY,
  SOLANA_NETWORK,
  POLYGON_NETWORK,
  recordPolygonSettle,
  recordSolanaSettle,
  SIGNING_WINDOW_SECONDS,
  takeDeclineReason,
} from "@/lib/payments";
import type { DeclineReason, DeclineSlot } from "@/lib/payments";
import type {
  MismatchReport,
  PayloadFieldProblem,
} from "@/lib/requirement-match";
import { parseReferralMarker, recordReferral } from "@/lib/referrals";
import {
  closeDeliveryIntent,
  getOpenDeliveryIntent,
  openDeliveryIntent,
} from "@/services/delivery-audit";
import {
  certIdForSettlement,
  recordDeliveredSettlement,
} from "@/services/chain-reconciliation";
import {
  signedOffersForChallenge,
  withReceiptHeader,
} from "@/lib/offer-receipt";
import { cachedPublicKeyHex } from "@/lib/signing";
import { getMenuItem } from "@/store";
import { HAND_ROLLING } from "@/store/hand-rolling";
import {
  GUARANTEE_BLOCK_TEXT,
  IDENTITY_POLICY,
  SAMPLE_ARTIFACT_ID,
} from "@/store/spec";
import { isRecord } from "@/types";
import type { Env } from "@/types";
import {
  atomicToUsdc,
  priceTiersUsdc,
  usdcToAtomic,
  getPaymentStack,
  isTransientSettleFailure,
  minimumUsdcForPath,
  processSettlementWithRetry,
  rescueAmbiguousSettle,
  tipFromPaid,
} from "@/lib/payments";
import { recordSettlementUnknown } from "@/services/settlement-unknown";
import type { SettledPayment } from "@/lib/payments";
import { SettlementDeclined } from "@/lib/payments";
import {
  extractPaymentNonce,
  getSpentNonce,
  payerOfVerifiedPayload,
  recordSpentNonce,
} from "@/lib/replay-guard";
import type { HonoEnv } from "@/types";

/**
 * The store's own x402 gate. DELIVERS FIRST AND SETTLES AFTER — rule 9
 * as amended by the keeper on 2026-08-10.
 *
 * It used to say the opposite, and the old comment is worth quoting
 * because it was right about its own trade and wrong about which side
 * to take: "Deliberately settles BEFORE the route handler runs, so a
 * failed settlement can never mint a certificate… (The stock
 * middleware settles after the handler, which would leave paid-looking
 * artifacts behind on failure.)"
 *
 * What it bought was real. What it cost was worse: money moves, the
 * delivery step dies, and the buyer holds nothing — four times on
 * Base and twice on Solana, every one of them an item that read the
 * chain after settling against a rate-limited public RPC.
 *
 * HOW IT WORKS NOW. Verification, the replay guard and the paid-retry
 * lane are unchanged and still run first. Then the handler is given a
 * `pending` payment — the buyer's verified authorization, not yet
 * presented — and `next()` runs. A route that mints calls
 * `pending.settle()` at its own last line before the mint, so its
 * chain reads and probes are free to fail. A route that mints nothing
 * never calls it, and the gate settles for it after a 2xx, which is
 * stock x402's ordering.
 *
 * The gap that remains is the mint itself: signature and KV writes,
 * local and fast. The delivery audit still watches it, because small
 * is not none.
 *
 * A KV replay guard turns away already-settled nonces before the
 * facilitator is called; the chain's EIP-3009 nonce remains the source
 * of truth if the guard's TTL has lapsed.
 */

/**
 * S2, verification adjacency: the challenge is the one surface
 * guaranteed to be in a buyer's context, so the strongest evidence
 * lives in it, not one fetch away. Menu items also carry their
 * uniform spec and the C1 fact block in-payload.
 */

/** Splice the signed offers into the PAYMENT-REQUIRED header's JSON. */
function withOfferHeader(
  headers: Record<string, string>,
  offers: Record<string, unknown>,
): Record<string, string> {
  try {
    const headerName = Object.keys(headers).find(
      (name) => name.toLowerCase() === "payment-required",
    );
    if (!headerName) {
      return headers;
    }
    const decoded = decodeBase64Json(
      headers[headerName] as string,
    ) as Record<string, unknown>;
    const merged = {
      ...decoded,
      extensions: {
        ...(isRecord(decoded["extensions"]) ? decoded["extensions"] : {}),
        ...offers,
      },
    };
    return { ...headers, [headerName]: encodeBase64Json(merged) };
  } catch {
    return headers;
  }
}

/**
 * The EVM offer we are actually making, read back out of the header a
 * compliant client parses. Read rather than recomputed on purpose: a
 * template built from a second copy of payTo and amount would be a
 * second source of truth, and the first thing it would do is drift.
 */
function evmAcceptFrom(
  headers: Record<string, string>,
): Record<string, unknown> | null {
  try {
    const name = Object.keys(headers).find(
      (key) => key.toLowerCase() === "payment-required",
    );
    if (!name) return null;
    const decoded = JSON.parse(atob(headers[name] as string)) as Record<
      string,
      unknown
    >;
    const accepts = Array.isArray(decoded["accepts"]) ? decoded["accepts"] : [];
    return (
      (accepts.find(
        (entry) =>
          isRecord(entry) &&
          typeof entry["network"] === "string" &&
          entry["network"].startsWith("eip155:"),
      ) as Record<string, unknown> | undefined) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * THE FILL-IN-THE-BLANKS PAYLOAD, 2026-08-20 — for the buyer we had
 * not modelled.
 *
 * The store's help for hand-rollers assumed a reader: prose at /try, a
 * URL on the challenge, the full teaching block on declines. The
 * archetype that actually turned up writes a SCRIPT — an agent handed
 * a 402 that reaches for a general-purpose web3 library, runs headless,
 * renders no HTML and follows no documentation link. Ours did exactly
 * that against our own door and died five times in forty seconds on
 * four different envelope errors, twice on the same missing `accepted`,
 * with the full teaching block sitting in the responses it had already
 * received. Prose cannot reach a program.
 *
 * So the challenge hands it a payload instead of a lecture: every
 * value that is ours is already filled in from the offer above, and
 * the only fields left are the three that must be the buyer's — the
 * wallet, a fresh nonce, and the signature. Copy, fill three blanks,
 * base64, send. Every one of the five failures that prompted this is
 * unreachable from here: the object is an object, `accepted` is
 * present and byte-identical to what we offered, the amounts are
 * decimal strings, and validAfter has a legal value.
 *
 * The placeholders are angle-bracketed and therefore invalid hex, so a
 * client that sends one unedited gets our preflight naming the exact
 * field rather than a silent facilitator refusal. Failing loudly is
 * the point of the shape.
 */
function payloadTemplate(
  accept: Record<string, unknown>,
): Record<string, unknown> | null {
  const payTo = accept["payTo"];
  const amount = accept["amount"];
  if (typeof payTo !== "string" || typeof amount !== "string") {
    return null;
  }
  /*
   * THE ACCEPT'S OWN WINDOW, and the store's constant behind it — not
   * a third typed 300 (#90). The sentence below promises the
   * hand-roller that their validBefore is "good for the
   * maxTimeoutSeconds above"; that is only true while this reads the
   * same number the accept carries. Before #90 there were THREE
   * copies of five minutes — the library's fallback, the accepts that
   * inherited it, and this line — none of them chosen, any of which
   * could have drifted from the others in silence.
   */
  const timeout =
    typeof accept["maxTimeoutSeconds"] === "number"
      ? accept["maxTimeoutSeconds"]
      : SIGNING_WINDOW_SECONDS;
  return {
    x402Version: 2,
    // Copied whole, which is also the rule: any field you rebuild by
    // hand is a field that can disagree with ours.
    accepted: accept,
    payload: {
      signature:
        "<0x + 130 hex — your EIP-712 signature over the authorization below>",
      authorization: {
        from: "<0x + 40 hex — the wallet holding the USDC>",
        to: payTo,
        value: amount,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + timeout),
        nonce: "<0x + 64 hex — 32 random bytes, never reused>",
      },
    },
  };
}

async function enrich402Body(
  env: Env,
  path: string,
  body: unknown,
  decline?: DeclineReason,
  mismatch?: MismatchReport,
  payloadProblems: PayloadFieldProblem[] = [],
  evmAccept?: Record<string, unknown> | null,
): Promise<unknown> {
  if (!isRecord(body)) {
    return body;
  }
  const base = env.STORE_BASE_URL;
  const item = getMenuItem(itemKeyFromPath(path));
  return {
    ...body,
    ...(decline
      ? {
          payment_declined: {
            reason: decline.reason,
            ...(decline.message ? { message: decline.message } : {}),
            note: "The signed payment was not accepted; no money moved and nothing left the shelf.",
            // The one thing we can be precise about: our own matcher
            // refused before the facilitator was called, and we hold
            // both objects, so we can name the field.
            ...(mismatch ? { requirement_mismatch: mismatch } : {}),
            // What we can read of the inner payload when the
            // facilitator's own answer arrives truncated.
            ...(payloadProblems.length > 0
              ? {
                  payload_problems: payloadProblems,
                  payload_problems_note:
                    "Our reading of the shape the facilitator validates, not its verdict. Where the two disagree, it is right and we are wrong — but every field above has exactly one legal form, so these are worth fixing first.",
                }
              : {}),
          },
          /**
           * IMPERATIVE, HERE, BECAUSE THIS IS THE REACTIVE MOMENT.
           *
           * From CV's model-strength pass: weaker models are reactive
           * rather than anticipatory. They do not pre-compute a safety
           * key against a retry that has not happened — that is
           * forward-looking speculation about a failure mode, and it
           * scales hard with capability. They retry AFTER the bounce.
           *
           * The idempotency block below already rides on this response
           * (it hangs off `item`, not off the absence of a decline), so
           * the mechanism was reachable. What was missing is that it
           * read as a feature description at the one moment it needed
           * to read as an instruction. A weak model acts on "do this
           * now"; it does not reliably act on "this facility exists."
           */
          before_you_retry:
            "You are about to retry. Do this on the next attempt: copy idempotency.suggested_key from this response and send it as the Idempotency-Key header (or _meta['x402/idempotency-key'] over MCP). If your first attempt actually settled and you did not see the answer, that one header is what stops the retry becoming a second charge. It cannot refuse your purchase and costs nothing.",
          // A signature that did not clear is the exact moment the
          // domain trap costs somebody a night, so the whole block
          // rides in the response rather than a link to it.
          hand_rolling: HAND_ROLLING,
        }
      : {
          // Weightless on the common path: the values are already in
          // accepts[].extra, this only says where the prose is.
          hand_rolling_url: `${base}/try#hand-rolling`,
          // A URL helps a person; a filled payload helps a program.
          // See payloadTemplate for the buyer this is aimed at.
          ...(() => {
            const template = evmAccept ? payloadTemplate(evmAccept) : null;
            return template
              ? {
                  payload_template: template,
                  payload_template_note:
                    "Copy this object, replace only the three <angle-bracketed> values with your wallet address, a fresh random nonce and your signature, then send base64(JSON.stringify(it)) as the PAYMENT-SIGNATURE header on a retry of this same URL. Everything else is already correct for THIS challenge and should not be rebuilt — `accepted` in particular must stay byte-identical to what we offered. Amounts and times are decimal STRINGS, not numbers. validBefore is unix seconds and this one is good for the maxTimeoutSeconds above; a fresh GET always yields a fresh challenge. One more wall waits after the envelope and it fails silently: the EIP-712 domain must be built from accepted.extra (name, version), the chainId of the accepted entry's own network (eip155:8453 \u2192 8453, eip155:137 \u2192 137), and verifyingContract = accepted.asset — details at the hand_rolling_url. The solana:* entry in accepts takes a signed transaction instead of an authorization; this template covers the EVM rails (eip155:*) only.",
                }
              : {};
          })(),
        }),
    ...(item
      ? {
          spec_note: factBlockText(item),
          spec: listingSpec(item, base),
          guarantee: GUARANTEE_BLOCK_TEXT,
          /**
           * REPLAY PROTECTION FOR A CLIENT THAT NEVER READ THE DOCS.
           * An agent cannot send a header it does not know exists, so
           * the challenge hands it one to echo. Optional in the
           * strongest sense: ignore this and the till behaves exactly
           * as it did before it existed.
           */
          idempotency: {
            suggested_key: suggestedIdempotencyKey(item.id),
            how: "Send it back as the Idempotency-Key header (or _meta['x402/idempotency-key'] on MCP) with your payment. If your retry loop fires again inside the minute, the second attempt returns your ORIGINAL purchase from cache — no settlement, no second charge.",
            optional:
              "Entirely. Send your own key instead and it is used as-is; send none and you are charged normally, exactly as before. Nothing here can refuse a purchase.",
            not_a_secret:
              "This value is derived from the item and the current minute, so anyone can compute it — that is fine and deliberate. It selects a cache slot; it does not open one. Slots are keyed by the VERIFIED paying wallet, so echoing this key only ever reaches your own earlier purchase, never somebody else's.",
            stable_for_seconds: SUGGESTED_KEY_BUCKET_SECONDS,
          },
        }
      : {}),
    /**
     * THE UNITS, SPELLED OUT, BECAUSE THIS IS THE ONE MISREADING THAT
     * COSTS MONEY WITHOUT BOUNCING.
     *
     * CV's model-strength pass, 2026-08-02: a weaker model pulling the
     * amount out of a base64 PAYMENT-REQUIRED header meets an integer
     * in ATOMIC units — "5000" for half a cent — and unit confusion is
     * exactly the class small models get wrong. Every other weak-model
     * failure in the flow is loud: a malformed signature bounces, a
     * missing field 400s, nothing moves. This one is silent, because a
     * signature over the WRONG AMOUNT is still a valid signature. It is
     * the only step where getting it wrong produces a technically
     * correct payment for a number nobody meant.
     *
     * So both numbers are stated together, in the body, labelled, with
     * the conversion written out. Derived from the same tiers the
     * accepts are built from, never retyped.
     */
    ...(item
      ? {
          amount_check: {
            usdc: priceTiersUsdc(item),
            atomic: priceTiersUsdc(item).map(usdcToAtomic),
            these_are_the_same_number:
              "The PAYMENT-REQUIRED header and the accepts array carry ATOMIC units: USDC has 6 decimals, so 5000 atomic is $0.005 and $5000 would be 5000000000 atomic. If you read an amount and it looks a million times too large, you are holding atomic units and should not convert twice.",
            before_you_sign:
              "Check the amount you are about to sign against the usdc list above. This is the only step in this flow where a mistake does not bounce: a signature over the wrong amount is still a VALID signature, so nothing here will catch it for you. Every other error — bad field, malformed payload, wrong network — is refused before money moves.",
          },
        }
      : {}),
    /**
     * THE HOUSE RULE, ON THE 402, FOR THE ARRIVALS THAT READ NOTHING
     * ELSE. A stranger who got here from a Bazaar search or a bare URL
     * has seen no prose of ours at all — this response is their first
     * and possibly only document. The promise that preempts the most
     * common scam shape belongs where they will actually meet it.
     */
    house_rule: HOUSE_RULE,
    verification: {
      /**
       * NAMED AS PRE-PAYMENT, because the cold walk found step 4 — the
       * pause before spending — is where nothing forces anything and
       * the money has not moved yet. Everything in this block is
       * checkable RIGHT NOW, before you sign, and it said so nowhere.
       */
      check_these_before_you_pay:
        "Every field in this block is checkable before you sign anything, from this response and public URLs, without asking us. The key fingerprint here should match the one served at signing_key_url; the sample artifact is a live one you can verify to see what you would be getting. Nothing here costs a request you are not already making.",
      verify_url: `${base}/api/verify/{id}`,
      key_fingerprint: await cachedPublicKeyHex(env.SIGNING_KEY),
      signing_key_url: `${base}/.well-known/scvd-signing-key`,
      sample_artifact_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
      identity_policy: IDENTITY_POLICY,
    },
    /**
     * On the 402 itself because this is the exact moment a retry loop
     * is born: the agent that mishandles this response is the agent
     * about to double-fire, and the mechanism that saves its wallet
     * should be in its hands before the first signature, not in a
     * guide it never read.
     */
    wallet_safety: WALLET_SAFETY,
  };
}

function respondWithInstructions(
  c: Context<HonoEnv>,
  instructions: HTTPResponseInstructions,
): Response {
  for (const [key, value] of Object.entries(instructions.headers)) {
    c.header(key, value);
  }
  c.header("Cache-Control", "no-store");
  const status = instructions.status as ContentfulStatusCode;
  if (instructions.isHtml) {
    return c.html(String(instructions.body ?? ""), status);
  }
  return c.json(instructions.body ?? {}, status);
}

/** The nonce inside a PAYMENT-SIGNATURE header, for decline matching. */
function nonceFromPaymentHeader(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  try {
    return extractPaymentNonce(JSON.parse(atob(header)));
  } catch {
    return null;
  }
}

/**
 * Count a referral marker, if the request carried one. Deliberately
 * separate from gateSignals: `?ref=` is not `?src=` and must never
 * reach channel inference or the venue table.
 */
async function recordReferralFor(
  c: Context<HonoEnv>,
  stage: "arrived" | "settled",
  payer?: string,
): Promise<void> {
  const marker = parseReferralMarker(c.req.query("ref"));
  if (marker === undefined) {
    return;
  }
  await recordReferral(c.env, metricsMonth(), stage, {
    referralMarker: marker,
    ...(payer ? { payer } : {}),
    house: isHouseTraffic(c.env, gateSignals(c)),
  });
}

/** Attribution signals for a Hono-carried request (heuristics in lib/channel.ts). */
function gateSignals(c: Context<HonoEnv>): EventSignals {
  const signals: EventSignals = {};
  const userAgent = c.req.header("User-Agent");
  if (userAgent) {
    signals.userAgent = userAgent;
  }
  const referrer = c.req.header("Referer");
  if (referrer) {
    signals.referrer = referrer;
  }
  const declared = c.req.query("src") ?? c.req.query("source");
  if (declared) {
    signals.declaredSource = declared;
  }
  const houseHeader = c.req.header("X-House");
  if (houseHeader) {
    signals.houseHeader = houseHeader;
  }
  const houseParam = c.req.query("house");
  if (houseParam) {
    signals.houseParam = houseParam;
  }
  if (c.req.header("X-SCVD-Channel") === "mcp") {
    // Set only by our own MCP handler on internal dispatch; stripped
    // from anything a visitor could spoof by being definitive-only here.
    signals.viaMcp = true;
  }
  return signals;
}

/**
 * THE DIALECT SHIM — and it exists because a stranger paid half a cent
 * to prove we needed it.
 *
 * x402 v2 names the payment header PAYMENT-SIGNATURE. v1 named it
 * X-PAYMENT, and a large part of the live ecosystem still sends the
 * old name with a perfectly valid v2 envelope inside. The SDK reads
 * only the v2 name, so those requests got a 402 while holding a
 * signature that would have settled — the store answering "no" to
 * money it could have taken.
 *
 * HOW THIS WENT UNFIXED FOR SO LONG, recorded because the mechanism
 * matters more than the bug. Three places in this codebase read
 * `PAYMENT-SIGNATURE ?? X-PAYMENT`, and reading them was mistaken for
 * proof the store accepted both. It does not: :661 reads the alias to
 * write a DECLINE REASON after the 402 is already decided, and
 * buy.ts's isBuying() reads it to decide whether pre-payment guards
 * apply. Neither makes a payment succeed. The acceptance decision is
 * the SDK's, one layer below both. Call sites were read; behaviour was
 * never exercised. CV said the door refused X-PAYMENT and was told he
 * was wrong; Cairn then sent the identical envelope under both names
 * on a cold walk — 402 under X-PAYMENT, settled under
 * PAYMENT-SIGNATURE — and published it. Rule 52 is about lookups that
 * cannot see everything; this was a reader that could have looked and
 * inferred instead.
 *
 * WHAT THIS DOES AND DOES NOT CHANGE. It changes which header name the
 * envelope may arrive under, and nothing else. Signature verification,
 * schema validation, requirement matching and settlement are all
 * untouched — a v1-SHAPED payload under the old name still fails
 * schema, and now fails it with a named reason instead of a bare 402.
 * The store's own documented dialect is unchanged: PAYMENT-SIGNATURE
 * is what the 402 asks for and what every surface says to send. This
 * only stops punishing clients that speak the ecosystem's older name
 * correctly.
 */
/** The header x402 v2 documents, and the v1 name much of the ecosystem still sends. */
export const PAYMENT_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_HEADER_V1_ALIAS = "X-PAYMENT";

/**
 * THE ENVELOPE, IN WHICHEVER DIALECT IT ARRIVED (task #50).
 *
 * The adapter below taught the SDK to ACCEPT the old name. Everything
 * in this file that reads the envelope for its own purposes — the
 * local preflight, payer attribution, the ambiguous-settle rescue,
 * Machine 1's row — went on reading only the v2 name, so an X-PAYMENT
 * buyer could take the door while the door learned nothing about
 * them: no named diagnosis, no payer for the house flag, and no nonce
 * to ask the chain with when a settle died in transport.
 *
 * That is the SAME bug the adapter fixed, one layer up, and it stayed
 * hidden the same way: the alias was present in the file, so the file
 * looked dialect-aware. So there is exactly one reader now, and
 * test/no-bare-payment-header.spec.ts fails if a second appears.
 */
function paymentHeaderOf(c: Context<HonoEnv>): string | undefined {
  return c.req.header(PAYMENT_HEADER) ?? c.req.header(PAYMENT_HEADER_V1_ALIAS);
}

class DialectTolerantAdapter extends HonoAdapter {
  override getHeader(name: string): string | undefined {
    const direct = super.getHeader(name);
    if (direct !== undefined) {
      return direct;
    }
    // Only this one header aliases. A blanket fallback would be a
    // guess about headers nobody asked us to guess about.
    return name.toLowerCase() === PAYMENT_HEADER.toLowerCase()
      ? super.getHeader(PAYMENT_HEADER_V1_ALIAS)
      : undefined;
  }
}

/**
 * THE CHALLENGE CLOCK — roadmap 0.12, and the reason it wraps rather
 * than sits inline.
 *
 * The number worth publishing is how long a buyer waits to be told a
 * price, which is the WHOLE gate: the stack read, the preflight, the
 * SDK's own work, and the offer-receipt signing that happens after the
 * 402 is decided. An inline stamp at the top of the 402 branch would
 * miss that tail, and the tail is where the interesting milliseconds
 * have always been. So the gate runs inside a wrapper and the wrapper
 * owns the clock.
 *
 * THE WRITE IS DEFERRED AND THAT IS NOT OPTIONAL. This path already
 * awaits two counter writes before the buyer sees a price. A third,
 * awaited, would be the latency instrument making the latency worse —
 * the oldest way to be wrong about performance. waitUntil, or nothing.
 *
 * ONLY CHALLENGES ARE TIMED. A free route that falls through to next()
 * did no payment work, and folding it in would flatter the figure with
 * requests that never touched the till.
 */
/**
 * THE `WWW-Authenticate` HINT ON THE 402, for the client that arrived
 * having read nothing.
 *
 * RFC 9110 §11.6.1 permits this header on responses other than 401
 * "to indicate that supplying credentials might affect the response",
 * which is exactly the 402's situation: there IS something you can
 * send that changes this answer, and until now the only place that
 * said so was a body some clients never parse and a header
 * (PAYMENT-REQUIRED) no generic tooling knows to look at. A scan of
 * this store on 2026-08-30 read the 402s, found no standard auth
 * hint, and concluded the door had no documented way in.
 *
 * ONE PARAMETER, AND THE REASON IS A BUDGET RATHER THAN TASTE. The
 * widest item's challenge already carries nine signed offers against
 * Node's 16KB header cliff (test/challenge-header-budget.spec.ts), so
 * every byte here is spent from a real allowance. `resource_metadata`
 * is the one a probe reads (RFC 9728 §5.1) and it leads to a document
 * that carries everything else, so a second parameter would buy a
 * reader nothing and cost the buyer bytes.
 *
 * NEVER LET THE HINT FAIL THE CHALLENGE. A frozen header list on a
 * response the SDK constructed is a hint we do without; it is not a
 * reason a buyer fails to learn a price.
 */
function attachChallengeHint(
  c: Context<HonoEnv>,
  response: Response | void,
): void {
  const value = challengeHint(c.env.STORE_BASE_URL);
  try {
    (response ?? c.res)?.headers.set("WWW-Authenticate", value);
  } catch {
    // Immutable headers. The 402 body and PAYMENT-REQUIRED still say
    // everything this header points at.
  }
}

export const paymentGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const startedAt = Date.now();
  let response: Response | void;
  try {
    response = await runPaymentGate(c, next);
  } catch (error) {
    /*
     * THE GATE THREW, AND THIS USED TO RECORD NOTHING AT ALL.
     *
     * Before 2026-08-26 the timing call sat after the await with no
     * try around it, so an exception in the gate skipped the
     * instrument entirely on its way to the 500 handler. The one path
     * most worth measuring — the one where a buyer is turned away —
     * was the single path guaranteed to leave no trace.
     */
    recordGateOutcome(c, "threw");
    throw error;
  }
  const status = response?.status ?? c.res?.status;
  if (status === 402) {
    attachChallengeHint(c, response);
    const elapsed = Date.now() - startedAt;
    try {
      c.executionCtx.waitUntil(
        recordRouteTiming(c.env, "challenge", elapsed).catch(() => undefined),
      );
    } catch {
      // No execution context (direct invocation in a test): the timing
      // is a nicety, the challenge is not. Never let the instrument
      // fail the response it is measuring.
    }
  } else if (response !== undefined && status !== undefined && status >= 500) {
    /*
     * A 5xx the gate RETURNED rather than threw. Counted apart from a
     * throw because they are different bugs with different fixes, and
     * collapsing them would send an operator to the wrong file.
     *
     * Deliberately NOT counted: 2xx, 4xx, and the free pass-through
     * (`response === undefined`, where the gate called next() and did
     * no payment work). A door answering 404 is not a payment defect,
     * and folding those in would bury the failures this exists to
     * surface.
     */
    recordGateOutcome(c, `http${status}`);
  }
  return response;
};

/**
 * Record how the payment path ended, for the endings the latency
 * histogram cannot represent.
 *
 * The histogram publishes what a SUCCESSFUL challenge cost, which is
 * the right question and only half of one: a door that throws or 500s
 * never enters it, so its silence about a broken door is
 * indistinguishable from health. This counter is the other half, and
 * it is kept separate rather than folded in so the published
 * percentiles keep meaning exactly what they said before.
 */
function recordGateOutcome(c: Context<HonoEnv>, outcome: string): void {
  try {
    c.executionCtx.waitUntil(
      recordServerError(c.env, itemKeyFromPath(c.req.path), outcome).catch(
        () => undefined,
      ),
    );
  } catch {
    // No execution context. Never let the instrument fail the request.
  }
}

const runPaymentGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const stack = getPaymentStack(c.env);
  const adapter = new DialectTolerantAdapter(c);
  // The decline slot rides along on the context. The SDK shallow-copies
  // this object on its way to the verify hooks, and a shallow copy keeps
  // the slot BY REFERENCE — so the hook writes the reason here and we
  // read it back below, with no key to derive and nothing to race.
  const declineSlot: DeclineSlot = {};
  const context: HTTPRequestContext = {
    adapter,
    path: c.req.path,
    method: c.req.method,
    [DECLINE_SLOT_KEY]: declineSlot,
  } as HTTPRequestContext;

  if (!stack.httpServer.requiresPayment(context)) {
    return next();
  }

  // THE PRE-FLIGHT, and CV named why it is load-bearing rather than
  // polish: the facilitator's own errors are permanently opaque to us
  // (200-character truncation, generic union-type message), so these
  // local checks are the only thing standing between a first-time
  // builder and silence. Running them BEFORE the expensive round trip
  // means a malformed payload comes back named and instant instead of
  // cryptic and slow. Only definitively-wrong fields refuse here; see
  // `blocking` in requirement-match.ts for what we decline to judge.
  const offeredHeader = paymentHeaderOf(c);
  if (offeredHeader) {
    const preflight = preflightBlockers(offeredHeader);
    const first = preflight[0];
    if (first) {
      /*
       * ONE WAVE ON THE REFUSAL A BUYER IS WAITING FOR — rule 50.
       *
       * These two share no state, and the decline path is the more
       * expensive of the pair: recordPaymentDecline awaits sendAlert,
       * which on a repeat decline is six serial KV round trips, and on
       * a first one adds an outbound email. All of it sat between a
       * buyer's malformed header and the sentence telling them which
       * field was wrong — on the response whose own body says "we
       * check what we can check before spending the round trip."
       *
       * NOT DEFERRED, DELIBERATELY. waitUntil here would be the larger
       * win and it is what the last attempt at this reached for; it
       * broke referrals.spec because something read the value back
       * before the response. The alert log is read back by tests that
       * drive the store through SELF.fetch, and proving which ones is
       * a bigger claim than this fix needs. Removing the QUEUE is free
       * and provable; removing the AWAIT is neither, so it is not done
       * here.
       */
      await Promise.all([
        recordChallengeIssued(c.env, c.req.path, gateSignals(c)).catch(
          () => undefined,
        ),
        recordPaymentDecline(
          c.env,
          c.req.path,
          `local:preflight:${first.field}`,
          gateSignals(c),
        ).catch(() => undefined),
      ]);
      c.header("Cache-Control", "no-store");
      return c.json(
        {
          error:
            "The payment payload is malformed against the x402 v2 schema, so nothing was charged and the facilitator was never called.",
          payment_declined: {
            reason: `local:preflight:${first.field}`,
            message: `${first.field}: ${first.says}`,
            note: "Caught here on purpose. The facilitator's answer to this is a truncated union-type error that names no field, so we check what we can check before spending the round trip.",
            payload_problems: preflight,
          },
          hand_rolling: HAND_ROLLING,
        },
        402,
      );
    }
  }

  /**
   * The caller's key, read here; the REPLAY LOOKUP ITSELF happens
   * after verification, further down, and the distance between those
   * two facts is deliberate — see the note at the lookup.
   */
  const idempotencyKey = usableIdempotencyKey(c.req.header("Idempotency-Key"));

  // First facilitator sync happens on the first paid request per isolate.
  await stack.initialized;

  let result: Awaited<ReturnType<typeof stack.httpServer.processHTTPRequest>>;
  try {
    result = await stack.httpServer.processHTTPRequest(context);
  } catch (error) {
    // P1: the facilitator conversation itself broke (not a mere decline).
    await sendAlert(c.env, {
      condition: "settlement_failure",
      detail: `processHTTPRequest threw on ${c.req.path}: ${String(error)}`,
    });
    throw error;
  }

  if (result.type === "no-payment-required") {
    return next();
  }
  if (result.type === "payment-error") {
    if (result.response.status === 402) {
      /*
       * Challenge issued. The monthly gap between these and settlements
       * is the budget-cap / abandonment signal (RUN1 instrumentation).
       *
       * CAUGHT, AS OF THE NIGHT OF 2026-08-27. Five worker_health pages,
       * four doors, one cause: these counters are shared KV keys, KV
       * allows one write per second per key, and this await had no
       * catch — so a burst of price-checks turned the counter's 429
       * into a 500 handed to a visitor who owed us nothing. The 402 is
       * the product; the count is bookkeeping. bumpBy retries the blip,
       * and what still fails is logged and dropped, never charged to
       * the visitor. The uptime monitors polling these doors see the
       * 402 they came for.
       */
      // The referral marker rides along: a marker that reached a
      // priced door, counted apart from one that settled, because the
      // gap between them is the signal.
      const tally = (): Promise<unknown> =>
        Promise.all([
          recordChallengeIssued(c.env, c.req.path, gateSignals(c)).catch(
            (error) => console.error("challenge count lost:", String(error)),
          ),
          recordReferralFor(c, "arrived").catch(() => undefined),
        ]);
      // If a signed payment rode in and still got a 402, that's a
      // decline: tell the payer why and keep the reason in the books.
      const paymentHeader =
        paymentHeaderOf(c);
      if (paymentHeader) {
        // A refused payment ATTEMPT keeps its books ahead of the
        // response — declines are money-adjacent and rare, and the
        // decline row below joins the same wave of truth.
        await tally();
      } else {
        /*
         * THE QUOTE LEAVES FIRST (the keeper's ruling, 2026-08-27:
         * do it right without breaking the books — and his sharper
         * point, "the probers don't even pay and they log": the bare
         * price-check IS the measured path, hit all day by monitors
         * and directory probes that never present a signature).
         *
         * A KV write is not edge-local — the wave above was parallel
         * but the response still waited for its slowest write to
         * cross to central storage. The 402 is the product; the
         * count is bookkeeping; the count now rides waitUntil and
         * lands within the request's lifetime instead of ahead of
         * its first byte. What this costs, stated plainly: an
         * isolate killed mid-flight loses a tally mark — a CHALLENGE
         * count, never a settle, never a decline; those two stay
         * awaited on their own paths. The earlier ruling in
         * metrics.ts ("the test was right — write-before-response is
         * an observable contract") is superseded by this one for the
         * bare-quote branch only; the contract is now
         * lands-within-the-request, and the suite holds it with
         * vi.waitFor where it used to assume synchrony.
         */
        try {
          c.executionCtx.waitUntil(tally());
        } catch {
          // No execution context (bare test invocation): the old
          // contract, unchanged.
          await tally();
        }
      }
      // Slot first: it is exact and works even when the payload carries
      // no nonce to join on, which is exactly the wrong-network case.
      // The nonce map is the fallback for anything that reached the
      // hooks without our context.
      const nonce = nonceFromPaymentHeader(paymentHeader);
      // Third source, added after three declines from a known-good
      // signature all booked "reason_not_captured": the SDK's own
      // words, for the refusals that never reach a hook.
      const refusal = paymentHeader
        ? refusalBeforeVerify(result.response.headers, paymentHeader)
        : undefined;
      const decline =
        declineSlot.reason ??
        (nonce ? takeDeclineReason(nonce) : undefined) ??
        refusal?.decline;
      // Fourth source, and the only one that survives a facilitator
      // verdict we cannot read: CDP's schema error is truncated at 200
      // characters before it reaches us, so we check the shape we DO
      // know and name the field ourselves.
      const payloadProblems = paymentHeader
        ? payloadProblemsFor(paymentHeader)
        : [];
      if (paymentHeader) {
        await recordPaymentDecline(
          c.env,
          c.req.path,
          // When there is no reason at all, say WHICH way it went
          // missing. A flat "unspecified" cost a day of not knowing
          // whether the buyer or the instrument was the problem.
          // The facilitator's string stays the FACT; ours is appended
          // after a + so the desk can split it, never substituted for
          // it. A verdict we cannot read is still the verdict.
          bookedReason(
            decline?.reason ??
              (nonce
                ? "unspecified:reason_not_captured"
                : "unspecified:no_nonce_in_payload"),
            payloadProblems,
          ),
          gateSignals(c),
        ).catch(() => undefined);
      }
      if (!result.response.isHtml) {
        /**
         * x402 Signed Offers & Receipts: one JWS offer per accepts
         * tier, the store COMMITTING to its quoted terms before any
         * money moves. Spliced into the PAYMENT-REQUIRED header's own
         * JSON — the document a compliant client actually parses —
         * and mirrored onto the body for readers following the docs'
         * body-first example. Null on any failure, and the 402 goes
         * out exactly as it would have: no decoration is worth
         * blocking the till. See lib/offer-receipt.ts.
         */
        const offers = await offerExtensionsFor(c.env, result.response.headers);
        const enriched = await enrich402Body(
          c.env,
          c.req.path,
          result.response.body,
          decline,
          refusal?.mismatch,
          payloadProblems,
          evmAcceptFrom(result.response.headers),
        );
        return respondWithInstructions(c, {
          ...result.response,
          headers: offers
            ? withOfferHeader(result.response.headers, offers)
            : result.response.headers,
          body:
            offers && isRecord(enriched)
              ? {
                  ...enriched,
                  extensions: {
                    ...(isRecord(enriched["extensions"])
                      ? enriched["extensions"]
                      : {}),
                    ...offers,
                  },
                }
              : enriched,
        });
      }
    }
    return respondWithInstructions(c, result.response);
  }

  /**
   * IDEMPOTENCY REPLAY — AFTER VERIFICATION, BEFORE SETTLEMENT, and
   * the position is the security property.
   *
   * This lookup used to run at the top of the gate, off the payer
   * address read straight out of the base64 PAYMENT-SIGNATURE header.
   * That header is decoded, never checked, at that point — anyone can
   * write any `authorization.from` they like into it. So serving a
   * cached purchase there meant serving it to whoever ASSERTED the
   * buyer's address, and a buyer's address is public on Base. The only
   * thing standing between a stranger and another wallet's goods was
   * that the Idempotency-Key is a caller-held secret.
   *
   * That is a real defence and it is a single one, resting on a value
   * the caller controls and could leak through a log, a shared client,
   * or a predictable generator. Here, `result.paymentPayload` has been
   * through the facilitator: the payer is the account that actually
   * SIGNED. A replay now requires the private key, not knowledge of an
   * address, and the cache can no longer be read by anyone who merely
   * learns a key.
   *
   * Costs one verify round trip on the replay path, which the looping
   * agent this exists for is already paying — it signs a fresh
   * authorization every pass by definition (ledger #16). It settles
   * nothing, which is the whole point.
   */
  const idempotencyPayer = idempotencyKey
    ? payerOfVerifiedPayload(result.paymentPayload)
    : undefined;
  if (idempotencyKey && idempotencyPayer) {
    // The scope carries the query, so `?tag=SECOND` cannot collect the
    // signed artifact minted for `?tag=FIRST`.
    const replay = await lookupIdempotentWithBucketGrace(
      c.env,
      await idempotencyScope(c.req.path, new URL(c.req.url).searchParams),
      idempotencyPayer,
      idempotencyKey,
      itemKeyFromPath(c.req.path),
    );
    if (replay) {
      c.header("Cache-Control", "no-store");
      c.header("Idempotency-Replay", "true");
      return c.json({ ...replay.body, ...replayNote(replay.first_served_at) });
    }
  }

  // Verified. A nonce we've already settled once is refused — unless
  // the money it moved never became goods, which is the one state
  // where a spent nonce should buy something instead of a refusal.
  const nonce = extractPaymentNonce(result.paymentPayload);
  if (nonce) {
    const spent = await getSpentNonce(c.env, nonce);
    if (spent) {
      /**
       * THE PAID RETRY (2026-08-08, closing class B of "paid and got
       * nothing"). The delivery audit's ruling stands — no cron can
       * re-run a handler whose inputs it never had — but the BUYER'S
       * RETRY carries the inputs, and the 2026-08-07 incident proved
       * buyers do retry. This branch runs only when: the payload
       * VERIFIED (we are past the facilitator check, so the caller
       * holds the buyer's actually-signed authorization — the same
       * standard the idempotency cache stands on), the retry is for
       * the SAME path the money bought, and the delivery intent for
       * that settle is STILL OPEN — money taken, goods never left.
       *
       * If a certificate already names the settle, the crash landed
       * between mint and response: goods are real, the buyer never
       * saw them. Point at the artifact rather than minting a second
       * one against the same payment — a re-mint here would be the
       * double-count rule 13 exists to make impossible.
       *
       * Books are deliberately NOT rewritten on this lane: the
       * original settle already recorded the sale once. Nothing here
       * settles, charges, or counts — it only stops refusing a buyer
       * we already charged.
       */
      if (spent.transaction && spent.path === c.req.path) {
        const open = await getOpenDeliveryIntent(c.env, spent.transaction);
        if (open) {
          const lookup = await certIdForSettlement(c.env, spent.transaction);
          const existingCert = lookup.certId;
          /*
           * A LOOKUP THAT COULD NOT SEE EVERYTHING IS NOT A "NO".
           *
           * Before 2026-08-25 this answer came from a scan capped at
           * 2000 cert: rows that discarded its own `truncated` flag,
           * so past the cap it said "no certificate" for settlements
           * that had one — and this lane answers a false no by
           * minting a SECOND signed certificate with a second patron
           * number against one payment, and accruing credit twice on
           * the same money. Certificates have no TTL; the set only
           * grows, so that was a defect with a date on it rather than
           * a possibility.
           *
           * Refusing here costs a buyer one manual message in the
           * rare case; minting costs a double-counted sale in the
           * books and two certificates that both verify.
           */
          if (!existingCert && !lookup.certain) {
            c.header("Cache-Control", "no-store");
            c.header("Paid-Retry", "unverifiable");
            return c.json(
              {
                error:
                  "this authorization settled, and we cannot yet confirm whether its goods already minted — so nothing is minted again here",
                settlement_tx: spent.transaction,
                what_to_do:
                  "write to the keeper with this settlement_tx; the goods are owed and will be handed over by hand. Nothing was charged again.",
              },
              503,
            );
          }
          if (existingCert) {
            await closeDeliveryIntent(c.env, open.key).catch(() => undefined);
            c.header("Cache-Control", "no-store");
            c.header("Paid-Retry", "already-delivered");
            return c.json({
              already_delivered: true,
              settlement_tx: spent.transaction,
              certificate_id: existingCert,
              verify_url: `${c.env.STORE_BASE_URL}/api/verify/${existingCert}`,
              note: "This authorization settled once and its goods DID mint — the response just never reached you. The certificate above is yours; nothing was charged again.",
            });
          }
          const retryMinimum = minimumUsdcForPath(c.req.path);
          const retryPayment: SettledPayment = {
            paidUsdc: open.intent.paid_usdc,
            tipUsdc: tipFromPaid(open.intent.paid_usdc, retryMinimum),
            transaction: spent.transaction,
            settleHeaders: {},
          };
          const retryPayer = payerOfVerifiedPayload(result.paymentPayload);
          if (retryPayer) {
            retryPayment.payer = retryPayer;
          }
          c.set("payment", retryPayment);
          /*
           * THE RETRY LANE SETTLES NOTHING, and under rule 9 as
           * amended that has to be said in the type rather than
           * implied by the absence of a call. The money moved on the
           * FIRST attempt; this pass exists only to hand over goods
           * that were paid for and never delivered. So the pending
           * payment it gives the handler resolves instantly to the
           * original settlement — same transaction on the
           * certificate, and the facilitator is never asked twice.
           */
          c.set("pending", {
            paidUsdc: retryPayment.paidUsdc,
            tipUsdc: retryPayment.tipUsdc,
            ...(retryPayer ? { payer: retryPayer } : {}),
            settle: async () => retryPayment,
          });
          await next();
          if (c.res.status < 300) {
            await closeDeliveryIntent(c.env, open.key).catch(() => {
              // Left open on failure: a false alarm beats a silent loss.
            });
            // The goods finally went out on the retry, so the walk's
            // delivered-settlement record is written now, not at the
            // original settle whose delivery died.
            await recordDeliveredSettlement(c.env, spent.transaction);
          }
          c.res.headers.set("Paid-Retry", "true");
          c.res.headers.set("Cache-Control", "no-store");
          return c.res;
        }
      }
      // BOOK IT. This path refused a signed payment and recorded nothing
      // until 2026-07-28, which meant a buyer retrying an authorization
      // instead of re-signing was invisible in the books — the exact
      // shape of a real buyer bouncing repeatedly off a fixable wall.
      await recordPaymentDecline(
        c.env,
        c.req.path,
        "replay:nonce_already_settled",
        gateSignals(c),
      ).catch(() => undefined);
      c.header("Cache-Control", "no-store");
      return c.json(
        {
          error:
            "That payment authorization has been through this till once already. Sign a fresh one, the register remembers. (If your last attempt paid and the goods never arrived, retrying with the SAME authorization within a day delivers them without a second charge — that lane just found nothing owed.)",
        },
        402,
      );
    }
  }

  /**
   * DELIVER FIRST, SETTLE AFTER — rule 9, amended by the keeper
   * 2026-08-10. Everything below used to run HERE, before `next()`.
   * It now runs inside `settleNow`, which the handler calls at the
   * last possible moment before it commits goods, and which the gate
   * calls itself after a 2xx if the handler never did.
   *
   * WHY THE CALLBACK RATHER THAN SIMPLY MOVING THE BLOCK BELOW
   * `next()`. The signed certificate names the settlement transaction
   * — a field an outside operator's conformance list caught us
   * missing, and one of the better things on the artifact. Settling
   * strictly after the handler returns means there is no transaction
   * to name at mint time, so a literal reordering would have bought
   * the ruling by quietly gutting the receipt. Handing the handler the
   * settle instead keeps both: the buyer is not charged until the
   * goods are ready, and the artifact still cites the payment that
   * bought it.
   *
   * The window this leaves is the mint itself — signature and KV
   * writes, local and fast — instead of the old window, which included
   * chain reads against a rate-limited public RPC. That is the whole
   * production failure, closed. The delivery audit still watches what
   * remains, because "small" is not "none".
   */
  const paidUsdc = atomicToUsdc(result.paymentRequirements.amount);
  const minimumUsdc = minimumUsdcForPath(c.req.path);
  /*
   * Captured out of the narrowed result. `performSettlement` is a
   * nested function, and a narrowing does not survive into one — so
   * the verified payload is pulled out here, where TypeScript can
   * still see that this request has one.
   */
  const verifiedPayload = result.paymentPayload;
  const verifiedRequirements = result.paymentRequirements;
  const verifiedExtensions = result.declaredExtensions;
  /*
   * The till, as one object rather than four loose `let`s. Not style:
   * `performSettlement` writes these from inside a closure the
   * compiler cannot see through, and captured locals lose their
   * narrowing at every call boundary — which read, in practice, as
   * "this code is unreachable" on the whole tail below.
   */
  const till: {
    payment: SettledPayment | null;
    settled: {
      transaction: string;
      network?: string;
      payer?: string;
      headers: Record<string, string>;
    } | null;
    deliveryKey: string | null;
    payer?: string;
  } = { payment: null, settled: null, deliveryKey: null };

  const settleNow = async (): Promise<SettledPayment> => {
    // MEMOIZED. Two callers, one charge — a handler that settles and a
    // gate that settles for handlers which did not must never both
    // present the same authorization.
    if (till.payment) return till.payment;
    return performSettlement();
  };

  async function performSettlement(): Promise<SettledPayment> {
    let settlement: Awaited<
      ReturnType<typeof stack.httpServer.processSettlement>
    >;
    try {
      // One retry on a facilitator 5xx — the transport-failed shape,
      // never a verdict. Safe because the EIP-3009 nonce settles at most
      // once on-chain; rationale at processSettlementWithRetry.
      settlement = await processSettlementWithRetry(
        stack.httpServer,
        verifiedPayload,
        verifiedRequirements,
        verifiedExtensions,
        { request: context },
      );
    } catch (error) {
      // P1: the settle call errored outright — NO VERDICT, which is
      // Machine 1's whole subject: the row keeps the question open so
      // the hourly resolver can ask the chain, instead of this state
      // being findable only by hand reconciliation (2026-08-07).
      await recordSettlementUnknown(c.env, {
        path: c.req.path,
        door: "http",
        reason: `threw:${String(error).slice(0, 200)}`,
        network: verifiedRequirements.network,
        ...(paymentHeaderOf(c)
          ? { paymentHeader: paymentHeaderOf(c) }
          : {}),
      });
      await sendAlert(c.env, {
        condition: "settlement_failure",
        detail: `processSettlement threw on ${c.req.path}: ${String(error)}`,
      });
      throw error;
    }
    await persistBazaarObservations(c.env, c.req.path);
    /**
     * One settled outcome for both roads in. The facilitator's success
     * fills it directly; a transport-dead settle gets ONE chance at the
     * ambiguous-settle rescue (payments.ts) — the chain is asked whether
     * the authorization actually burned, because on 2026-08-07 three
     * "declines" turned out to be landed transfers and a real buyer paid
     * three times for nothing. A rescued settle carries no facilitator
     * headers (there is no signed PAYMENT-RESPONSE to relay — the origin
     * died); the certificate in the body, naming the found transaction,
     * is the receipt that survives.
     */
    if (settlement.success) {
      till.settled = {
        transaction: settlement.transaction,
        headers: settlement.headers,
        ...(settlement.network ? { network: settlement.network } : {}),
        ...(settlement.payer ? { payer: settlement.payer } : {}),
      };
    } else {
      const rescued = await rescueAmbiguousSettle(c.env, {
        errorReason: settlement.errorReason,
        paymentHeader: paymentHeaderOf(c),
        network: verifiedRequirements.network,
        // #55: a failed settle whose response NAMES a transaction is
        // the duplicate-submission answer with the receipt attached —
        // the rescue fires on it and the chain confirms or refuses.
        ...(settlement.transaction
          ? { failureTransaction: settlement.transaction }
          : {}),
      });
      if (!rescued) {
        // Verified but didn't settle — and the chain agrees, or the
        // question didn't apply. Same instrument, settle-side reason.
        //
        // MACHINE 1 (#56): when the rescue was ATTEMPTED and came back
        // empty, the state may still be genuinely unknown — the RPC
        // could have been down, the rail may have no inline reader, or
        // the burn may land seconds later. The decline is served (money
        // fails closed for delivery NOW), and the row keeps the
        // question open for the hourly resolver. A plain verdict
        // decline (insufficient_funds and kin) is ANSWERED and writes
        // no row.
        if (
          isTransientSettleFailure(settlement.errorReason) ||
          settlement.transaction
        ) {
          await recordSettlementUnknown(c.env, {
            path: c.req.path,
            door: "http",
            reason: `settle:${settlement.errorReason}`.slice(0, 300),
            network: verifiedRequirements.network,
            ...(paymentHeaderOf(c)
              ? { paymentHeader: paymentHeaderOf(c) }
              : {}),
          });
        }
        await recordPaymentDecline(
          c.env,
          c.req.path,
          `settle:${settlement.errorReason}`,
          gateSignals(c),
        ).catch(() => undefined);
        /*
         * The decline is thrown rather than returned, because this can
         * now happen INSIDE a handler that has already done its work.
         * The gate catches it around `next()` and serves this response;
         * no handler has to carry decline-handling of its own.
         */
        if (!settlement.response.isHtml && isRecord(settlement.response.body)) {
          throw new SettlementDeclined(
            respondWithInstructions(c, {
              ...settlement.response,
              body: {
                ...settlement.response.body,
                payment_declined: {
                  reason: settlement.errorReason,
                  ...(settlement.errorMessage
                    ? { message: settlement.errorMessage }
                    : {}),
                  note: "The payment verified but did not settle; no money moved and nothing left the shelf.",
                },
              },
            }),
          );
        }
        throw new SettlementDeclined(
          respondWithInstructions(c, settlement.response),
        );
      }
      till.settled = {
        transaction: rescued.transaction,
        network: rescued.network,
        payer: rescued.payer,
        headers: {},
      };
    }
    if (nonce) {
      // The transaction rides the spent-nonce row: it is the link the
      // paid retry stands on (nonce → settle → delivery intent).
      await recordSpentNonce(
        c.env,
        nonce,
        c.req.path,
        till.settled.transaction,
      );
    }

    const settlementSignals: Parameters<typeof recordSettlement>[2] = {
      ...gateSignals(c),
      paidUsdc,
      minimumUsdc,
    };
    // The rail, recorded at the till. Everything gated passes here,
    // including the penny pages that mint no certificate to carry it.
    if (till.settled.network) {
      settlementSignals.network = till.settled.network;
    }
    // The payer, from the facilitator if it returned one and from the
    // signed authorization if it did not. THIS MATTERS MORE THAN IT
    // LOOKS: the house flag is decided by wallet address, so a settle
    // that arrives with no payer books as ORGANIC — and an organic
    // settle is the one number this whole build is waiting on. A house
    // wallet quietly promoted to the first outside sale would be false
    // in the direction rule 13 exists to prevent. The `from` in the
    // authorization is the account that signed and is about to be
    // debited; when both are present they are the same address.
    till.payer =
      till.settled.payer ??
      payerFromPaymentHeader(paymentHeaderOf(c));
    if (till.payer) {
      settlementSignals.payer = till.payer;
    }
    /*
     * CAUGHT — this is the worst seat in the house for a throw. The
     * money has MOVED (till.settled is set) and openDeliveryIntent has
     * not run yet, so an uncaught counter 429 here would 500 a PAYING
     * buyer and prevent the one row that makes the sale recoverable
     * from ever being written: paid, undelivered, and invisible to the
     * delivery audit all at once. A settle the books undercount is
     * findable by the chain reconciliation, which reads Base rather
     * than our writes; a buyer 500'd after paying is only findable by
     * the buyer.
     */
    /*
     * ONE WAVE, NOT A QUEUE (rule 50), finishing a job metrics.ts
     * started. recordSettlement was twenty serial round trips until it
     * was folded into a single Promise.all; the rail meter was left
     * awaiting its own trip behind it, on a different key, which is
     * the same defect one layer out. Both are money counters and BOTH
     * STAY AWAITED — the fix is the queue, never the await. The
     * keeper's 08-27 ruling on money-adjacent books is untouched by
     * this: nothing here reaches the response before it has landed.
     *
     * The rail meter is the unreconciled-cap meter (PAYMENT_RAILS.md):
     * counted at the seam where money moved, alarmed past the bound,
     * never a refusal. It reads no key this wave writes, so it has no
     * reason to queue.
     */
    const railMeter =
      till.settled.network === SOLANA_NETWORK
        ? recordSolanaSettle(c.env, paidUsdc)
        : till.settled.network === POLYGON_NETWORK
          ? recordPolygonSettle(c.env, paidUsdc)
          : Promise.resolve();
    await Promise.all([
      recordSettlement(c.env, c.req.path, settlementSignals).catch(
        (error) => console.error("settle count lost:", String(error)),
      ),
      railMeter.catch(() => undefined),
    ]);
    /*
     * Beside the answer, like its own sibling. The SAME function runs
     * on arrival at the 402, where it already rides a Promise.all wave
     * and blocks nothing; this call blocked a buyer who had just paid.
     * One writer, one door, two treatments, and the difference was
     * nobody looking. The settle ledger above stays awaited — that one
     * is money in, not a courtesy.
     */
    deferBookkeeping(c, recordReferralFor(c, "settled", till.payer));
    const payment: SettledPayment = {
      paidUsdc,
      tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
      transaction: till.settled.transaction,
      settleHeaders: till.settled.headers,
    };
    if (till.settled.network) {
      payment.network = till.settled.network;
    }
    if (till.settled.payer) {
      payment.payer = till.settled.payer;
    }
    c.set("payment", payment);
    till.payment = payment;

    /**
     * THE DELIVERY INTENT, opened here because HERE is still the seam,
     * even though the seam is now much narrower. Money has moved and the
     * goods have not been committed: under the old ordering that gap
     * held the entire handler, chain reads included; under deliver-first
     * it holds whatever the handler does after calling settle, which
     * should be the mint and nothing else.
     *
     * IT IS NOT ZERO, AND THAT IS WHY THIS STAYS. A signature or a KV
     * write can still fail between the money and the goods. If the rest
     * of the request throws, returns a non-2xx, or never finishes
     * because the isolate went away, this row is the only trace that a
     * buyer paid and got nothing (problem ledger #18, where the
     * reconciliation we already had reads healthy through exactly this
     * failure).
     *
     * NEVER FAILS THE SALE. A paid customer does not get an error
     * because an audit row would not write — that would trade a real
     * delivery for a bookkeeping preference. The cost is that such a
     * sale is invisible to the audit rather than falsely flagged, which
     * is the quieter direction and is recorded as such in the service.
     */
    /*
     * The request's own parameters ride along, so a delivery that dies
     * after settlement can still be finished by hand. Without this the
     * keeper knows a buyer paid and not what for.
     */
    const askedFor = (() => {
      try {
        const params = new URL(c.req.url).searchParams;
        params.delete("payment_payload");
        const encoded = params.toString();
        return encoded.length > 0 ? encoded.slice(0, 600) : undefined;
      } catch {
        return undefined;
      }
    })();
    till.deliveryKey = await openDeliveryIntent(c.env, {
      path: c.req.path,
      ...(askedFor ? { query: askedFor } : {}),
      ...(till.settled.transaction
        ? { transaction: till.settled.transaction }
        : {}),
      ...(till.payer ? { payer: till.payer } : {}),
      paid_usdc: paidUsdc,
      settled_at: new Date().toISOString(),
    }).catch(() => null);

    return payment;
  }

  /*
   * THE HANDLER RUNS FIRST NOW. Everything above happens only if it
   * asks, or if it succeeds and never asked.
   */
  c.set("pending", {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
    ...(payerFromPaymentHeader(paymentHeaderOf(c))
      ? { payer: payerFromPaymentHeader(paymentHeaderOf(c)) }
      : {}),
    settle: settleNow,
  });

  try {
    await next();
  } catch (error) {
    /*
     * A decline raised inside the handler. The buyer's response is
     * already built and carries the facilitator's reason; serving it
     * here is what spares every handler its own decline branch.
     */
    if (error instanceof SettlementDeclined) return error.response;
    /*
     * Any other throw is a DELIVERY failure, and under this rule a
     * delivery failure costs the buyer nothing: if the handler never
     * called settle, no authorization was ever presented and there is
     * no money to refund. Rethrown so Hono's error handler answers,
     * exactly as before.
     */
    throw error;
  }

  /*
   * AND THE OTHER SHAPE THE SAME ERROR ARRIVES IN. Hono does not
   * always rethrow out of `next()`: when the app registers an
   * `onError`, a handler's throw is converted downstream and surfaces
   * as `c.error` with a 500 already built. A decline that reached the
   * buyer as "something fell off a shelf" would be this store telling
   * a customer its own shelving collapsed when in fact his card was
   * refused — so both shapes are checked, and the catch above stays
   * for the case where it does propagate.
   */
  const raised = c.error;
  if (raised instanceof SettlementDeclined) {
    c.error = undefined;
    /*
     * ASSIGNED, NOT RETURNED. After `next()` has completed, Hono has
     * already fixed the response; a Response returned from here is
     * dropped on the floor. That is not a style note — it is how a
     * DECLINED payment came back to the buyer as a cheerful 200 with
     * the goods in it, which is the single worst bug this refactor
     * could have shipped.
     */
    c.res = raised.response;
    return;
  }

  /**
   * THE HANDLER DELIVERED AND NEVER ASKED FOR THE MONEY. Every gated
   * route that mints settles explicitly, at the seam it chooses; the
   * penny pages have nothing to bind a transaction to and simply serve
   * their goods. This is where those get charged — stock x402's own
   * ordering, and the reason a route cannot accidentally give away
   * goods by forgetting a line.
   *
   * Gated on a 2xx, so a 409 SOLD OUT after the fact takes no money.
   */
  if (!till.payment && c.res.status < 300) {
    try {
      await settleNow();
    } catch (error) {
      // Assigned rather than returned — see the note above. A refused
      // card must not be served as a delivered sale.
      if (error instanceof SettlementDeclined) {
        c.res = error.response;
        return;
      }
      throw error;
    }
  }

  /*
   * Nothing was charged: the handler failed, or refused, or the route
   * simply is not a sale. There is no receipt to attach and no
   * bookkeeping to do, which is the quiet half of the whole amendment.
   */
  if (!till.payment || !till.settled) return;

  /**
   * Goods went out, so the intent stops existing. Deliberately gated
   * on a 2xx: a handler that settled the money and then returned 409
   * SOLD OUT has taken payment without delivering just as surely as
   * one that threw, and leaving the row is how that surfaces.
   *
   * A throw inside next() never reaches this line at all — Hono
   * propagates it to the error handler — which is the correct
   * behaviour and the reason the row is opened before rather than
   * cleared in a finally.
   */
  if (till.deliveryKey && c.res.status < 300) {
    await closeDeliveryIntent(c.env, till.deliveryKey).catch(() => {
      // Left open on failure: a false alarm the keeper can dismiss
      // beats a silent loss he never hears about.
    });
  }

  /**
   * The chain walk's record that this money BOUGHT SOMETHING — the
   * penny shelf's counterpart of the certificate, and the fix for the
   * reconciliation false positive (a delivered Almanac page paging as
   * possibly-undelivered money, because the walk read certificates
   * only). Written here, at the same 2xx seam that closes the intent,
   * for every settled sale: for the minting shelves it is redundant
   * with the certificate and costs one KV write; for the penny pages
   * it is the only artifact there is. Recording ALL sales rather than
   * a list of penny paths is deliberate — a path list would silently
   * reopen the false positive the day a new certificate-less shelf is
   * added.
   */
  if (c.res.status < 300) {
    await recordDeliveredSettlement(c.env, till.settled.transaction);
  }

  /**
   * The receipt, into the facilitator's PAYMENT-RESPONSE header per
   * the spec's placement — signed proof of delivery beside the proof
   * of payment. withReceiptHeader returns the ORIGINAL headers
   * untouched on any failure, because mangling the settlement header
   * to attach a receipt would break the buyer's proof of payment in
   * order to decorate it.
   */
  const outHeaders = await withReceiptHeader(c.env, till.settled.headers, {
    resourceUrl: `${c.env.STORE_BASE_URL}${c.req.path}`,
    ...(till.payer ? { payer: till.payer } : {}),
    // The rail that actually settled; Base only as the pre-second-rail fallback.
    network: till.settled.network ?? BASE_NETWORK,
    ...(till.settled.transaction
      ? { transaction: till.settled.transaction }
      : {}),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  for (const [key, value] of Object.entries(outHeaders)) {
    c.res.headers.set(key, value);
  }

  /**
   * The idempotency store, only after a REAL sale: a settled payment
   * and a 2xx with goods in it. Errors and 402s are never cached — a
   * refusal must stay retryable, only a charge must not repeat.
   */
  if (idempotencyKey && idempotencyPayer && c.res.status < 300) {
    const bodyText = await c.res
      .clone()
      .text()
      .catch(() => null);
    if (bodyText) {
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (isRecord(parsed)) {
          await storeIdempotent(
            c.env,
            await idempotencyScope(
              c.req.path,
              new URL(c.req.url).searchParams,
            ),
            idempotencyPayer,
            idempotencyKey,
            parsed,
            till.settled.transaction,
          );
        }
      } catch {
        // Non-JSON goods stay uncached; the header's absence on the
        // next attempt is honest.
      }
    }
  }
};
