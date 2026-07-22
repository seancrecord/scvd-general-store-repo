import { HonoAdapter } from "@x402/hono";
import type {
  HTTPRequestContext,
  HTTPResponseInstructions,
} from "@x402/core/server";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
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

  const result = await stack.httpServer.processHTTPRequest(context);

  if (result.type === "no-payment-required") {
    return next();
  }
  if (result.type === "payment-error") {
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
  const settlement = await stack.httpServer.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
    { request: context },
  );
  await persistBazaarObservations(c.env, c.req.path);
  if (!settlement.success) {
    return respondWithInstructions(c, settlement.response);
  }
  if (nonce) {
    await recordSpentNonce(c.env, nonce, c.req.path);
  }

  const minimumUsdc = minimumUsdcForPath(c.req.path);
  const paidUsdc = atomicToUsdc(result.paymentRequirements.amount);
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
