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
  lookupIdempotent,
  replayNote,
  storeIdempotent,
  usableIdempotencyKey,
} from "@/lib/idempotency";
import { BASE_NETWORK, DECLINE_SLOT_KEY, takeDeclineReason } from "@/lib/payments";
import type { DeclineReason, DeclineSlot } from "@/lib/payments";
import type {
  MismatchReport,
  PayloadFieldProblem,
} from "@/lib/requirement-match";
import { parseReferralMarker, recordReferral } from "@/lib/referrals";
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
  getPaymentStack,
  minimumUsdcForPath,
  tipFromPaid,
} from "@/lib/payments";
import type { SettledPayment } from "@/lib/payments";
import {
  extractPaymentNonce,
  isNonceSpent,
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
        }
      : {}),
    verification: {
      verify_url: `${base}/api/verify/{id}`,
      key_fingerprint: await cachedPublicKeyHex(env.SIGNING_KEY),
      signing_key_url: `${base}/.well-known/scvd-signing-key`,
      sample_artifact_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
      identity_policy: IDENTITY_POLICY,
    },
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
   * IDEMPOTENCY REPLAY, before any money conversation happens. A
   * usable key + a payment header whose payer matches a purchase this
   * same payer already made under this same key means the agent is
   * retrying, not re-buying: serve the original result and settle
   * nothing. Scoped by (path, payer, hashed key) so honoring a replay
   * requires knowing the paying wallet AND its secret key. Every
   * failure direction here falls through to a normal charge — the
   * cache is a courtesy, the till is the product.
   */
  const idempotencyKey = usableIdempotencyKey(
    c.req.header("Idempotency-Key"),
  );
  const idempotencyPayer = idempotencyKey
    ? payerFromPaymentHeader(offeredHeader)
    : undefined;
  if (idempotencyKey && idempotencyPayer) {
    const replay = await lookupIdempotent(
      c.env,
      c.req.path,
      idempotencyPayer,
      idempotencyKey,
    );
    if (replay) {
      c.header("Cache-Control", "no-store");
      c.header("Idempotency-Replay", "true");
      return c.json({ ...replay.body, ...replayNote(replay.first_served_at) });
    }
  }

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
    settlement = await stack.httpServer.processSettlement(
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
  if (!settlement.success) {
    // Verified but didn't settle: same instrument, settle-side reason.
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
    settlement.payer ?? payerFromPaymentHeader(c.req.header("PAYMENT-SIGNATURE"));
  if (payer) {
    settlementSignals.payer = payer;
  }
  await recordSettlement(c.env, c.req.path, settlementSignals);
  await recordReferralFor(c, "settled", payer).catch(() => undefined);
  const payment: SettledPayment = {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
    transaction: settlement.transaction,
    settleHeaders: settlement.headers,
  };
  if (settlement.payer) {
    payment.payer = settlement.payer;
  }
  c.set("payment", payment);

  await next();

  /**
   * The receipt, into the facilitator's PAYMENT-RESPONSE header per
   * the spec's placement — signed proof of delivery beside the proof
   * of payment. withReceiptHeader returns the ORIGINAL headers
   * untouched on any failure, because mangling the settlement header
   * to attach a receipt would break the buyer's proof of payment in
   * order to decorate it.
   */
  const outHeaders = await withReceiptHeader(c.env, settlement.headers, {
    resourceUrl: `${c.env.STORE_BASE_URL}${c.req.path}`,
    ...(payer ? { payer } : {}),
    network: BASE_NETWORK,
    ...(settlement.transaction ? { transaction: settlement.transaction } : {}),
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
            settlement.transaction,
          );
        }
      } catch {
        // Non-JSON goods stay uncached; the header's absence on the
        // next attempt is honest.
      }
    }
  }
};
