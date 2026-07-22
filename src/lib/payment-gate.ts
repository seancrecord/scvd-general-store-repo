import { HonoAdapter } from "@x402/hono";
import type {
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/server";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sendAlert } from "@/lib/alerts";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import { recordChallengeIssued, recordSettlement } from "@/lib/metrics";
import type { EventSignals } from "@/lib/metrics";
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
  const context: HTTPRequestContext = {
    adapter,
    path: c.req.path,
    method: c.req.method,
  };

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
    }
    return respondWithInstructions(c, result.response);
  }

  // Verified. Refuse a nonce we've already settled once.
  const nonce = extractPaymentNonce(result.paymentPayload);
  if (nonce && (await isNonceSpent(c.env, nonce))) {
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        error:
          "That payment authorization has been through this till once already. Sign a fresh one — the register remembers.",
      },
      402,
    );
  }

  // Settle now — money first, then the goods.
  let settlement: Awaited<ReturnType<typeof stack.httpServer.processSettlement>>;
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
