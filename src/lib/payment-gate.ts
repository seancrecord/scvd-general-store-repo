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
      const decline =
        declineSlot.reason ?? (nonce ? takeDeclineReason(nonce) : undefined);
      if (paymentHeader) {
        await recordPaymentDecline(
          c.env,
          c.req.path,
          // When there is no reason at all, say WHICH way it went
          // missing. A flat "unspecified" cost a day of not knowing
          // whether the buyer or the instrument was the problem.
          decline?.reason ??
            (nonce
              ? "unspecified:reason_not_captured"
              : "unspecified:no_nonce_in_payload"),
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
