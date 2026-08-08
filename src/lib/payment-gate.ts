import { HonoAdapter } from "@x402/hono";
import type {
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/server";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sendAlert } from "@/lib/alerts";
import { isHouseTraffic } from "@/lib/channel";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import { factBlockText, listingSpec } from "@/lib/listing-spec";
import {
  itemKeyFromPath,
  metricsMonth,
  recordChallengeIssued,
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
  recordSolanaSettle,
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
  openDeliveryIntent,
} from "@/services/delivery-audit";
import { signedOffersForChallenge, withReceiptHeader } from "@/lib/offer-receipt";
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
  minimumUsdcForPath,
  processSettlementWithRetry,
  rescueAmbiguousSettle,
  tipFromPaid,
} from "@/lib/payments";
import type { SettledPayment } from "@/lib/payments";
import {
  extractPaymentNonce,
  isNonceSpent,
  payerOfVerifiedPayload,
  recordSpentNonce,
} from "@/lib/replay-guard";
import type { HonoEnv } from "@/types";

/**
 * The store's own x402 gate. Deliberately settles BEFORE the route handler
 * runs, so a failed settlement can never mint a certificate, create an
 * order, or consume inventory. (The stock middleware settles after the
 * handler, which would leave paid-looking artifacts behind on failure.)
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
/**
 * Signed offers, sourced from the PAYMENT-REQUIRED header — because on
 * THIS store the 402 body is the keeper's prose, not the standard
 * payment-required JSON. The accepts[] a client actually signs against
 * travel base64-encoded in the header, which is where the first cut of
 * this looked for them in the body and found nothing; the probe test
 * caught it before it shipped. Reading the header means the offers
 * commit to exactly the terms a client pays, never a copy.
 */
async function offerExtensionsFor(
  env: Env,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const headerName = Object.keys(headers).find(
      (name) => name.toLowerCase() === "payment-required",
    );
    if (!headerName) {
      return null;
    }
    const decoded = JSON.parse(atob(headers[headerName] as string)) as Record<
      string,
      unknown
    >;
    const resource = decoded["resource"];
    const resourceUrl =
      typeof resource === "string"
        ? resource
        : isRecord(resource) && typeof resource["url"] === "string"
          ? resource["url"]
          : undefined;
    if (!resourceUrl) {
      return null;
    }
    return await signedOffersForChallenge(
      env,
      resourceUrl,
      decoded["accepts"],
      Math.floor(Date.now() / 1000),
    );
  } catch {
    // Fail open: a 402 without offers is a working 402.
    return null;
  }
}

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
    const decoded = JSON.parse(atob(headers[headerName] as string)) as Record<
      string,
      unknown
    >;
    const merged = {
      ...decoded,
      extensions: {
        ...(isRecord(decoded["extensions"]) ? decoded["extensions"] : {}),
        ...offers,
      },
    };
    return { ...headers, [headerName]: btoa(JSON.stringify(merged)) };
  } catch {
    return headers;
  }
}

async function enrich402Body(
  env: Env,
  path: string,
  body: unknown,
  decline?: DeclineReason,
  mismatch?: MismatchReport,
  payloadProblems: PayloadFieldProblem[] = [],
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

export const paymentGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const stack = getPaymentStack(c.env);
  const adapter = new HonoAdapter(c);
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
  const offeredHeader = c.req.header("PAYMENT-SIGNATURE");
  if (offeredHeader) {
    const preflight = preflightBlockers(offeredHeader);
    const first = preflight[0];
    if (first) {
      await recordChallengeIssued(c.env, c.req.path, gateSignals(c));
      await recordPaymentDecline(
        c.env,
        c.req.path,
        `local:preflight:${first.field}`,
        gateSignals(c),
      ).catch(() => undefined);
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
  const idempotencyKey = usableIdempotencyKey(
    c.req.header("Idempotency-Key"),
  );

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
      // Challenge issued. The monthly gap between these and settlements
      // is the budget-cap / abandonment signal (RUN1 instrumentation).
      await recordChallengeIssued(c.env, c.req.path, gateSignals(c));
      // A marker that reached a priced door. Counted apart from one
      // that settled, because the gap between them is the signal.
      await recordReferralFor(c, "arrived").catch(() => undefined);
      // If a signed payment rode in and still got a 402, that's a
      // decline: tell the payer why and keep the reason in the books.
      const paymentHeader =
        c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT");
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
    const replay = await lookupIdempotentWithBucketGrace(
      c.env,
      c.req.path,
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

  // Verified. Refuse a nonce we've already settled once.
  const nonce = extractPaymentNonce(result.paymentPayload);
  if (nonce && (await isNonceSpent(c.env, nonce))) {
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
          "That payment authorization has been through this till once already. Sign a fresh one, the register remembers.",
      },
      402,
    );
  }

  // Settle now, money first, then the goods.
  let settlement: Awaited<
    ReturnType<typeof stack.httpServer.processSettlement>
  >;
  try {
    // One retry on a facilitator 5xx — the transport-failed shape,
    // never a verdict. Safe because the EIP-3009 nonce settles at most
    // once on-chain; rationale at processSettlementWithRetry.
    settlement = await processSettlementWithRetry(
      stack.httpServer,
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
      { request: context },
    );
  } catch (error) {
    // P1: the settle call errored outright.
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
  let settled: {
    transaction: string;
    network?: string;
    payer?: string;
    headers: Record<string, string>;
  } | null = null;
  if (settlement.success) {
    settled = {
      transaction: settlement.transaction,
      headers: settlement.headers,
      ...(settlement.network ? { network: settlement.network } : {}),
      ...(settlement.payer ? { payer: settlement.payer } : {}),
    };
  } else {
    const rescued = await rescueAmbiguousSettle(c.env, {
      errorReason: settlement.errorReason,
      paymentHeader: c.req.header("PAYMENT-SIGNATURE"),
      network: result.paymentRequirements.network,
    });
    if (!rescued) {
      // Verified but didn't settle — and the chain agrees, or the
      // question didn't apply. Same instrument, settle-side reason.
      await recordPaymentDecline(
        c.env,
        c.req.path,
        `settle:${settlement.errorReason}`,
        gateSignals(c),
      ).catch(() => undefined);
      if (!settlement.response.isHtml && isRecord(settlement.response.body)) {
        return respondWithInstructions(c, {
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
        });
      }
      return respondWithInstructions(c, settlement.response);
    }
    settled = {
      transaction: rescued.transaction,
      network: rescued.network,
      payer: rescued.payer,
      headers: {},
    };
  }
  if (nonce) {
    await recordSpentNonce(c.env, nonce, c.req.path);
  }

  const minimumUsdc = minimumUsdcForPath(c.req.path);
  const paidUsdc = atomicToUsdc(result.paymentRequirements.amount);
  const settlementSignals: Parameters<typeof recordSettlement>[2] = {
    ...gateSignals(c),
    paidUsdc,
    minimumUsdc,
  };
  // The rail, recorded at the till. Everything gated passes here,
  // including the penny pages that mint no certificate to carry it.
  if (settled.network) {
    settlementSignals.network = settled.network;
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
  const payer =
    settled.payer ?? payerFromPaymentHeader(c.req.header("PAYMENT-SIGNATURE"));
  if (payer) {
    settlementSignals.payer = payer;
  }
  await recordSettlement(c.env, c.req.path, settlementSignals);
  await recordReferralFor(c, "settled", payer).catch(() => undefined);
  const payment: SettledPayment = {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
    transaction: settled.transaction,
    settleHeaders: settled.headers,
  };
  if (settled.network) {
    payment.network = settled.network;
  }
  if (settled.payer) {
    payment.payer = settled.payer;
  }
  if (payment.network === SOLANA_NETWORK) {
    // The unreconciled-cap meter (PAYMENT_RAILS.md ruling): counted at
    // the seam where money moved, alarmed past the bound, never a refusal.
    await recordSolanaSettle(c.env, paidUsdc).catch(() => undefined);
  }
  c.set("payment", payment);

  /**
   * THE DELIVERY INTENT, opened here because HERE is the seam. Money
   * has moved and the handler has not run; every counter this store
   * keeps has already been written. If `next()` throws, returns a
   * non-2xx, or never finishes because the isolate went away, this row
   * is the only trace that a buyer paid and got nothing (problem
   * ledger #18, where the reconciliation we already had reads healthy
   * through exactly this failure).
   *
   * NEVER FAILS THE SALE. A paid customer does not get an error
   * because an audit row would not write — that would trade a real
   * delivery for a bookkeeping preference. The cost is that such a
   * sale is invisible to the audit rather than falsely flagged, which
   * is the quieter direction and is recorded as such in the service.
   */
  const deliveryKey = await openDeliveryIntent(c.env, {
    path: c.req.path,
    ...(settled.transaction ? { transaction: settled.transaction } : {}),
    ...(payer ? { payer } : {}),
    paid_usdc: paidUsdc,
    settled_at: new Date().toISOString(),
  }).catch(() => null);

  await next();

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
  if (deliveryKey && c.res.status < 300) {
    await closeDeliveryIntent(c.env, deliveryKey).catch(() => {
      // Left open on failure: a false alarm the keeper can dismiss
      // beats a silent loss he never hears about.
    });
  }

  /**
   * The receipt, into the facilitator's PAYMENT-RESPONSE header per
   * the spec's placement — signed proof of delivery beside the proof
   * of payment. withReceiptHeader returns the ORIGINAL headers
   * untouched on any failure, because mangling the settlement header
   * to attach a receipt would break the buyer's proof of payment in
   * order to decorate it.
   */
  const outHeaders = await withReceiptHeader(c.env, settled.headers, {
    resourceUrl: `${c.env.STORE_BASE_URL}${c.req.path}`,
    ...(payer ? { payer } : {}),
    // The rail that actually settled; Base only as the pre-second-rail fallback.
    network: settled.network ?? BASE_NETWORK,
    ...(settled.transaction ? { transaction: settled.transaction } : {}),
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
    const bodyText = await c.res.clone().text().catch(() => null);
    if (bodyText) {
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (isRecord(parsed)) {
          await storeIdempotent(
            c.env,
            c.req.path,
            idempotencyPayer,
            idempotencyKey,
            parsed,
            settled.transaction,
          );
        }
      } catch {
        // Non-JSON goods stay uncached; the header's absence on the
        // next attempt is honest.
      }
    }
  }
};
