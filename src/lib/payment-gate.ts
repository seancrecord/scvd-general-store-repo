import { HonoAdapter } from "@x402/hono";
import type {
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/server";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sendAlert } from "@/lib/alerts";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import { factBlockText, listingSpec } from "@/lib/listing-spec";
import {
  itemKeyFromPath,
  recordChallengeIssued,
  recordPaymentDecline,
  recordSettlement,
} from "@/lib/metrics";
import type { EventSignals } from "@/lib/metrics";
import { DECLINE_SLOT_KEY, takeDeclineReason } from "@/lib/payments";
import type { DeclineReason, DeclineSlot } from "@/lib/payments";
import {
  describeExactEvmPayload,
  describeMismatch,
  describePayloadShape,
  looksLikeAnException,
  mismatchReasonCode,
  sdkRefusal,
} from "@/lib/requirement-match";
import type {
  MismatchReport,
  PayloadFieldProblem,
} from "@/lib/requirement-match";
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

/** The whole decoded payload, for shape and mismatch diagnosis. */
function decodePaymentHeader(header: string | undefined): unknown {
  if (!header) {
    return undefined;
  }
  try {
    return JSON.parse(atob(header));
  } catch {
    return undefined;
  }
}

/** The 402 challenge the SDK just built, out of its own response header. */
function decodeChallengeHeader(headers: Record<string, string>): unknown {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "payment-required",
  );
  if (!entry) {
    return undefined;
  }
  try {
    return JSON.parse(atob(entry[1]));
  } catch {
    return undefined;
  }
}

/**
 * The reason the SDK refused BEFORE the facilitator was ever called.
 * Its two pre-verify exits (no matching requirement, extension refusal)
 * run no hooks, so the slot stays empty and the reason lives only in
 * the body it built. Read it there, and when it's a requirement
 * mismatch, say WHICH FIELD — we hold both objects, so "declined" is a
 * worse answer than we can give.
 */
function refusalBeforeVerify(
  headers: Record<string, string>,
  paymentHeader: string | undefined,
): { decline: DeclineReason; mismatch?: MismatchReport } | undefined {
  // The challenge rides the header, not the body — the JSON body on
  // this path is ours alone. Cost an hour to find; hence the note.
  const challenge = decodeChallengeHeader(headers);
  const stated = sdkRefusal(challenge);
  if (!stated) {
    return undefined;
  }
  const payload = decodePaymentHeader(paymentHeader);

  // The envelope first. A payload missing `accepted` makes the SDK's
  // matcher throw on undefined, and the TypeError it catches then
  // arrives here looking exactly like a crash of ours. Answer it in
  // words before that can happen.
  const shape = describePayloadShape(payload);
  if (shape) {
    return {
      decline: {
        reason: shape.code,
        message: `${shape.says} We saw these top-level fields: ${shape.keys_seen.join(", ") || "(none)"}.`,
        matched_by: "body",
      },
    };
  }

  const accepted = isRecord(payload) ? payload.accepted : undefined;
  const accepts = isRecord(challenge) ? challenge.accepts : undefined;
  const mismatch = describeMismatch(accepts, accepted);
  if (mismatch) {
    return {
      decline: {
        reason: mismatchReasonCode(mismatch),
        message: stated,
        matched_by: "body",
      },
      mismatch,
    };
  }
  // Never slug an exception into a reason code: it reads as our crash
  // and it puts an unbounded string family into the books.
  if (looksLikeAnException(stated)) {
    return {
      decline: {
        reason: "local:sdk_threw",
        message: `${stated} (That is the x402 library's own exception text, raised while reading the payment payload — not an error from the store's code. It nearly always means a field it expected was absent.)`,
        matched_by: "body",
      },
    };
  }
  return {
    decline: {
      reason: `local:${slugRefusal(stated)}`,
      message: stated,
      matched_by: "body",
    },
  };
}

/** Our reading of the inner payload, for a header we were handed. */
function payloadProblemsFor(paymentHeader: string): PayloadFieldProblem[] {
  const payload = decodePaymentHeader(paymentHeader);
  if (!isRecord(payload)) {
    return [];
  }
  return describeExactEvmPayload(payload.accepted, payload.payload);
}

/**
 * The books take one string. When the facilitator's verdict is opaque
 * (`verify_error` tells us nothing) and we found a concrete field
 * problem, the row carries both: the verdict, then ours, split by a +.
 * The verdict is never replaced — it is the fact, ours is the reading.
 */
function bookedReason(
  reason: string,
  problems: PayloadFieldProblem[],
): string {
  const first = problems[0];
  if (!first) {
    return reason;
  }
  const opaque =
    reason === "verify_error" ||
    reason === "verification_declined" ||
    reason.startsWith("unspecified");
  return opaque ? `${reason}+payload:${first.field}` : reason;
}

/** Bounded, lowercase, book-safe. The verbatim string rides alongside. */
function slugRefusal(stated: string): string {
  return stated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
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
        return respondWithInstructions(c, {
          ...result.response,
          body: await enrich402Body(
            c.env,
            c.req.path,
            result.response.body,
            decline,
            refusal?.mismatch,
            payloadProblems,
          ),
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
  if (settlement.payer) {
    settlementSignals.payer = settlement.payer;
  }
  await recordSettlement(c.env, c.req.path, settlementSignals);
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

  for (const [key, value] of Object.entries(settlement.headers)) {
    c.res.headers.set(key, value);
  }
};
