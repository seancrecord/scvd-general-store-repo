import type { Env, MenuItem } from "@/types";
import type { PaymentRequirements } from "@x402/core/types";
import { manifestAccepts, priceTiersUsdc, USDC_DECIMALS } from "@/lib/payments";
import { BASE_NETWORK, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { mppCheckoutEnabled } from "@/lib/mpp-checkout-capability";
import { MENU_ITEMS } from "@/store";

export type PurchaseCapabilityConfig = PaymentNetworkConfig & Partial<Pick<Env,
  "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">>;

/** Discovery and the actual challenge share the item's minimum entitlement on Base. */
export function nativeCheckoutTerms(config: PaymentNetworkConfig, item: MenuItem): PaymentRequirements {
  const terms = manifestAccepts(config, priceTiersUsdc(item)).find(row => row.network === BASE_NETWORK);
  if (!terms) throw new Error("MPP terms unavailable");
  return terms as PaymentRequirements;
}

/** Store-specific capability contract; not the draft MPP x-payment-info schema. */
export function purchaseCapabilities(item: MenuItem, config?: PurchaseCapabilityConfig) {
  const path = `/api/buy/${item.id}`;
  const x402 = { protocol: "x402", transport: "http", method: "GET", path,
    request_header: "PAYMENT-SIGNATURE", challenge_header: "PAYMENT-REQUIRED", currency: "USDC" };
  if (!config || !mppCheckoutEnabled(config, path, "GET")) return [x402];
  const terms = nativeCheckoutTerms(config, item);
  return [x402, { protocol: "mpp", transport: "http", method: "GET", path,
    payment_method: "evm", intent: "charge", network: terms.network, asset: terms.asset,
    currency: "USDC", decimals: USDC_DECIMALS, amount_atomic: terms.amount,
    request_header: "Authorization", authorization_scheme: "Payment", challenge_header: "WWW-Authenticate",
    response_header: "Payment-Receipt", idempotency_header: "Idempotency-Key" }];
}

/** The doors that carry a native row: derived from the shelf and the config, never typed. */
export function nativeCheckoutDoors(config?: PurchaseCapabilityConfig): MenuItem[] {
  return MENU_ITEMS.filter(item => purchaseCapabilities(item, config).some(row => row.protocol === "mpp"));
}

export function nativeCheckoutGuide(config?: PurchaseCapabilityConfig): string {
  const doors = nativeCheckoutDoors(config);
  const sample = doors[0] && purchaseCapabilities(doors[0], config).find(row => row.protocol === "mpp");
  if (!sample || !("network" in sample)) return "";
  const count = doors.length === MENU_ITEMS.length ? `every one of the ${doors.length}` : `${doors.length} of the ${MENU_ITEMS.length}`;
  return `Native MPP checkout: HTTP GET /api/buy/{item} on ${count} shelf items also offers evm/charge on ${sample.network}, ${sample.currency} (${sample.asset}), at that item's own minimum in atomic units with ${sample.decimals} decimals, no tip; the exact amount is in the door's WWW-Authenticate: Payment challenge and in its payment_capabilities row. Read the current challenge, authorize it in a compatible client, and retry identical inputs with Authorization: Payment and the quote's Idempotency-Key. Do not combine it with an x402 payment header. After an uncertain result, keep the original credential and recovery handle; do not sign another payment. This offer covers the HTTP doors only; MCP, WebMCP and the packages retain their existing x402 checkout. Offers remain subject to input, stock and availability checks. The store-specific payment_capabilities field and OpenAPI x-scvd-payment-capabilities describe enabled rails; x-payment-info retains the existing x402 discovery format and is not a native MPP discovery declaration.`;
}
