import type { Env, MenuItem } from "@/types";
import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";
import { getMenuItem } from "@/store";
import { commissionRungFromPath, publicationFamilyForPath, type PublicationFamily } from "@/lib/door-paths";
import { COMMISSION_ITEM_ID } from "@/store/commission-desk";
import { quotedMethod } from "@/lib/quote-method";

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
 * /api/buy/{item} for an item on the shelf. A trailing slash is the
 * same door, as it is for the x402 lane (routes/buy.ts turns strict
 * matching off and lib/metrics.ts drops the slash from the item key;
 * until 2026-09-19 this lane refused it while the other answered, so
 * the slashed knock got a thinner 402 with no native challenge).
 * test/doors-parity.spec.ts holds the edges. MCP, WebMCP and the
 * packages keep their existing x402 checkout, and nothing here claims
 * otherwise for them.
 */
export function nativeCheckoutItem(path: string, method: string): MenuItem | undefined {
  // A HEAD asks the same question a GET asks (lib/quote-method).
  if (quotedMethod(method) !== "GET") return undefined;
  const match = /^\/api\/buy\/([a-z0-9_-]+)\/?$/.exec(path);
  return match ? getMenuItem(match[1]!) : undefined;
}

/**
 * THE PUBLICATION DOORS ARE NATIVE DOORS TOO (2026-09-19). An almanac
 * page, a gazette issue, an archived zodiac week and an Open for
 * Business issue sell over x402 at their family's tiers with no shelf
 * item behind them; the native lane offers the same tiers on the same
 * unpaid GET. The family is the ledger's spelling for the sale, the way
 * an item id is for a shelf sale. The doors Worker never fronts these
 * paths, so this is the store's answer alone.
 */
export interface NativePublicationDoor { family: PublicationFamily }
export function nativePublicationDoor(path: string, method: string): NativePublicationDoor | undefined {
  if (quotedMethod(method) !== "GET") return undefined;
  const family = publicationFamilyForPath(path);
  return family ? { family } : undefined;
}

/**
 * The publication doors are enabled by the same flag, key and bindings
 * as the shelf; one representative page path asks the shared check, so
 * the guide, the discovery descriptor and the indexes' checkout block
 * cannot say yes when the gate would say no.
 */
export const NATIVE_PUBLICATION_PROBE_PATH = "/almanac/probe";
export function nativePublicationsEnabled(env?: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">): boolean {
  return !!env && mppCheckoutEnabled(env, NATIVE_PUBLICATION_PROBE_PATH, "GET");
}

/**
 * THE HTTP LANE'S HEADERS, SPELLED ONCE. The shelf's payment_capabilities
 * row and the publication checkout block both tell a reader which header
 * carries the challenge list, which carries the credential and which
 * returns the receipt; two spellings would be a contract that could
 * drift from itself with nothing failing.
 */
export const NATIVE_HTTP_HEADERS = { request_header: "Authorization", authorization_scheme: "Payment", challenge_header: "WWW-Authenticate",
  response_header: "Payment-Receipt", idempotency_header: "Idempotency-Key" } as const;

/**
 * THE COMMISSION DESK'S RUNGS ARE NATIVE DOORS (2026-09-19). A rung
 * pays a live keeper quote at exactly its price, against ?commission=
 * naming a request quoted there; the route fixes the price and the
 * desk's admission fixes which quote it honours, before any settlement.
 * The native lane offers one challenge at the rung on the same unpaid
 * GET; the desk's own item is the sale's spelling in the ledger.
 */
export interface NativeCommissionDoor { rung: number; item: MenuItem }
export function nativeCommissionDoor(path: string, method: string): NativeCommissionDoor | undefined {
  if (quotedMethod(method) !== "GET") return undefined;
  const rung = commissionRungFromPath(path);
  const item = rung === null ? undefined : getMenuItem(COMMISSION_ITEM_ID);
  return rung !== null && item ? { rung, item } : undefined;
}

/**
 * Advertised: the flag is on and the path is a native door, a shelf
 * item's, a publication's or a commission rung. The doors Worker asks this to decide
 * whether the knock has a native answer at all; it holds no durable
 * bindings, so it is never asked the fuller question below.
 */
export function nativeOfferAdvertised(env: Pick<Env, "MPP_CHECKOUT_ENABLED">, path: string, method: string): boolean {
  return env.MPP_CHECKOUT_ENABLED === "true" && (nativeCheckoutItem(path, method) !== undefined || nativePublicationDoor(path, method) !== undefined || nativeCommissionDoor(path, method) !== undefined);
}

/** Mintable: advertised, and this Worker holds the challenge key. The doors mint on this alone. */
export function nativeChallengeMintable(env: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY">, path: string, method: string): boolean {
  return nativeOfferAdvertised(env, path, method) && !!env.MPP_CHALLENGE_KEY;
}

/** Enabled: mintable, and this Worker can admit and account for it too. */
export function mppCheckoutEnabled(env: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">, path: string, method: string): boolean {
  return nativeOfferAdvertised(env, path, method) && !!env.MPP_CHALLENGE_KEY && !!env.PAID_RECOVERIES && !!env.COUNTER_LEDGER;
}

/**
 * The MCP door sells the same shelf through tools/call, and its native
 * lane (lib/mcp-mpp-payment.ts) is enabled exactly when the item's HTTP
 * door is: one flag, one key, the same durable bindings. Derived from
 * the HTTP answer so the two doors cannot drift apart.
 */
export function nativeMcpCheckoutEnabled(env: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">, item: MenuItem): boolean {
  return mppCheckoutEnabled(env, `/api/buy/${item.id}`, "GET");
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
