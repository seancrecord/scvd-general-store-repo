import { paymentMiddleware } from "x402-hono";
import { exact } from "x402/schemes";
import type { FacilitatorConfig, RoutesConfig } from "x402/types";
import { createCdpAuthHeaders } from "@coinbase/x402";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";

/**
 * x402 payment plumbing. USDC on Base, CDP as facilitator.
 * Each menu item gates GET /api/buy/<item_id> at its minimum price;
 * anything paid above the minimum is recorded as a tip.
 */

const USDC_DECIMALS = 6;
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

type PaymentMiddleware = ReturnType<typeof paymentMiddleware>;

function buildRoutesConfig(env: Env): RoutesConfig {
  const routes: RoutesConfig = {};
  for (const item of MENU_ITEMS) {
    routes[`GET /api/buy/${item.id}`] = {
      price: `$${item.price_usdc}`,
      network: "base",
      config: {
        description: `${item.name} — ${item.note_402}`,
        mimeType: "application/json",
        resource: `${env.STORE_BASE_URL}/api/buy/${item.id}` as `${string}://${string}`,
        errorMessages: {
          paymentRequired: item.note_402,
        },
      },
    };
  }
  return routes;
}

function buildFacilitatorConfig(env: Env): FacilitatorConfig {
  return {
    url: CDP_FACILITATOR_URL,
    createAuthHeaders: createCdpAuthHeaders(
      env.CDP_API_KEY_ID,
      env.CDP_API_KEY_SECRET,
    ),
  };
}

let cachedMiddleware: PaymentMiddleware | undefined;

/** Built lazily because env bindings only exist at request time. */
export function getPaymentMiddleware(env: Env): PaymentMiddleware {
  if (!cachedMiddleware) {
    cachedMiddleware = paymentMiddleware(
      env.PAY_TO_ADDRESS as `0x${string}`,
      buildRoutesConfig(env),
      buildFacilitatorConfig(env),
    );
  }
  return cachedMiddleware;
}

export interface PaidAmount {
  paidUsdc: number;
  payer?: string;
}

/**
 * Reads how much the visitor actually put on the counter, so overpayment
 * above the minimum can be recorded as a tip. Returns the minimum if the
 * header can't be decoded — the middleware already verified payment.
 */
export function decodePaidAmount(
  paymentHeader: string | undefined,
  minimumUsdc: number,
): PaidAmount {
  if (!paymentHeader) {
    return { paidUsdc: minimumUsdc };
  }
  try {
    const payload = exact.evm.decodePayment(paymentHeader);
    if (!("authorization" in payload.payload)) {
      return { paidUsdc: minimumUsdc };
    }
    const atomic = BigInt(payload.payload.authorization.value);
    const paidUsdc = Number(atomic) / 10 ** USDC_DECIMALS;
    return {
      paidUsdc: Math.max(paidUsdc, minimumUsdc),
      payer: payload.payload.authorization.from,
    };
  } catch {
    return { paidUsdc: minimumUsdc };
  }
}

export function tipFromPaid(paidUsdc: number, minimumUsdc: number): number {
  const tip = Math.max(0, paidUsdc - minimumUsdc);
  return Math.round(tip * 100) / 100;
}
