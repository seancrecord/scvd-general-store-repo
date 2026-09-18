import type { Env, MenuItem } from "@/types";
import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";
import { getMenuItem } from "@/store";

/**
 * THE PILOT'S ONE PRODUCT (2026-09-16 to 2026-09-18). Native checkout
 * opened on Context Anchor alone, and the sales the ledger booked in
 * that window carry no item of their own: a native row without an
 * item means this product. The whole-store release (2026-09-18) writes
 * the item on every sale from then on; this name is what the older rows
 * mean, the way railOf keeps the pre-second-rail meaning of "base".
 */
export const LEGACY_NATIVE_ITEM = "context_anchor";

export function mppPaymentHeader(authorization: string | undefined): string | undefined {
  return authorization && /^Payment(?:\s|$)/i.test(authorization) ? authorization : undefined;
}

/**
 * THE NATIVE DOOR SET IS THE SHELF (whole store, 2026-09-18). Every
 * product the HTTP door sells over x402 is offered over MPP too, from
 * the same catalog row, at the same minimum: an unpaid GET on
 * /api/buy/{item} for an item on the shelf. The path is matched
 * exactly; a trailing slash is not a door (test/doors-parity.spec.ts
 * holds the edges). MCP, WebMCP and the packages keep their existing
 * x402 checkout, and nothing here claims otherwise for them.
 */
export function nativeCheckoutItem(path: string, method: string): MenuItem | undefined {
  if (method !== "GET") return undefined;
  const match = /^\/api\/buy\/([a-z0-9_-]+)$/.exec(path);
  return match ? getMenuItem(match[1]!) : undefined;
}

/**
 * Advertised: the flag is on and the path is a native door. The doors
 * Worker asks this to decide whether the knock has a native answer at
 * all; it holds no durable bindings, so it is never asked the fuller
 * question below.
 */
export function nativeOfferAdvertised(env: Pick<Env, "MPP_CHECKOUT_ENABLED">, path: string, method: string): boolean {
  return env.MPP_CHECKOUT_ENABLED === "true" && nativeCheckoutItem(path, method) !== undefined;
}

/** Mintable: advertised, and this Worker holds the challenge key. The doors mint on this alone. */
export function nativeChallengeMintable(env: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY">, path: string, method: string): boolean {
  return nativeOfferAdvertised(env, path, method) && !!env.MPP_CHALLENGE_KEY;
}

/** Enabled: mintable, and this Worker can admit and account for it too. */
export function mppCheckoutEnabled(env: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">, path: string, method: string): boolean {
  return nativeOfferAdvertised(env, path, method) && !!env.MPP_CHALLENGE_KEY && !!env.PAID_RECOVERIES && !!env.COUNTER_LEDGER;
}

/** This one reviewed browser surface carries a payment, not a cookie session. */
export const mppCheckoutCors: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // Both Workers answer this surface; the doors have no durable bindings,
  // so the test is whether a challenge can be minted here, not settled.
  if (nativeChallengeMintable(c.env, c.req.path, "GET") && c.req.header("Origin")) {
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
