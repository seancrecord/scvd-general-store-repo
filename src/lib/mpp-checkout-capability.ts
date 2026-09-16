import type { Env } from "@/types";
import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";

/** One product and transport until the bounded release has been qualified. */
export const MPP_CHECKOUT_ITEM = "context_anchor";
export const MPP_CHECKOUT_PATH = `/api/buy/${MPP_CHECKOUT_ITEM}`;
export function mppPaymentHeader(authorization: string | undefined): string | undefined {
  return authorization && /^Payment(?:\s|$)/i.test(authorization) ? authorization : undefined;
}
export function mppCheckoutEnabled(env: Env, path: string, method: string): boolean {
  return env.MPP_CHECKOUT_ENABLED === "true" && path === MPP_CHECKOUT_PATH && method === "GET" &&
    !!env.MPP_CHALLENGE_KEY && !!env.PAID_RECOVERIES && !!env.COUNTER_LEDGER;
}

/** This one reviewed browser surface carries a payment, not a cookie session. */
export const mppCheckoutCors: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (mppCheckoutEnabled(c.env, c.req.path, "GET") && c.req.header("Origin")) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Expose-Headers", "WWW-Authenticate, PAYMENT-REQUIRED, Payment-Receipt, Paid-Retry");
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Authorization, Idempotency-Key, PAYMENT-SIGNATURE, X-PAYMENT");
      return c.body(null, 204);
    }
  }
  await next();
};
