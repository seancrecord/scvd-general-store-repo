import type { Env, MenuItem } from "@/types";
import type { PaymentRequirements } from "@x402/core/types";
import { manifestAccepts, priceTiersUsdc, USDC_DECIMALS } from "@/lib/payments";
import { BASE_NETWORK, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { mppCheckoutEnabled, MPP_CHECKOUT_ITEM, MPP_CHECKOUT_PATH } from "@/lib/mpp-checkout-capability";
import { getMenuItem } from "@/store";

export type PurchaseCapabilityConfig = PaymentNetworkConfig & Partial<Pick<Env,
  "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">>;

/** Discovery and the actual challenge share the minimum entitlement's terms. */
export function nativeCheckoutTerms(config: PaymentNetworkConfig): PaymentRequirements {
  const item = getMenuItem(MPP_CHECKOUT_ITEM)!;
  const terms = manifestAccepts(config, priceTiersUsdc(item)).find(row => row.network === BASE_NETWORK);
  if (!terms) throw new Error("MPP terms unavailable");
  return terms as PaymentRequirements;
}

/** Store-specific capability contract; not the draft MPP x-payment-info schema. */
export function purchaseCapabilities(item: MenuItem, config?: PurchaseCapabilityConfig) {
  const x402 = { protocol: "x402", transport: "http", method: "GET", path: `/api/buy/${item.id}`,
    request_header: "PAYMENT-SIGNATURE", challenge_header: "PAYMENT-REQUIRED", currency: "USDC" };
  if (!config || item.id !== MPP_CHECKOUT_ITEM || !mppCheckoutEnabled(config, MPP_CHECKOUT_PATH, "GET")) return [x402];
  const terms = nativeCheckoutTerms(config);
  return [x402, { protocol: "mpp", transport: "http", method: "GET", path: MPP_CHECKOUT_PATH,
    payment_method: "evm", intent: "charge", network: terms.network, asset: terms.asset,
    currency: "USDC", decimals: USDC_DECIMALS, amount_atomic: terms.amount,
    request_header: "Authorization", authorization_scheme: "Payment", challenge_header: "WWW-Authenticate",
    response_header: "Payment-Receipt", idempotency_header: "Idempotency-Key" }];
}

export function nativeCheckoutGuide(config?: PurchaseCapabilityConfig): string {
  const native = purchaseCapabilities(getMenuItem(MPP_CHECKOUT_ITEM)!, config).find(row => row.protocol === "mpp");
  if (!native || !("network" in native)) return "";
  return `Native MPP checkout: HTTP GET ${native.path} also offers evm/charge on ${native.network}, ${native.currency} (${native.asset}), ${native.amount_atomic} atomic units with ${native.decimals} decimals, no tip. Read the current WWW-Authenticate: Payment challenge, authorize it in a compatible client, and retry identical inputs with Authorization: Payment and the quote's Idempotency-Key. Do not combine it with an x402 payment header. After an uncertain result, keep the original credential and recovery handle; do not sign another payment. This offer covers this HTTP product only; MCP, WebMCP and other items retain their existing x402 checkout. Offers remain subject to input, stock and availability checks. The store-specific payment_capabilities field and OpenAPI x-scvd-payment-capabilities describe enabled rails; x-payment-info adds the enabled MPP method, intent and currency for directory readers while preserving x402 discovery. Runtime challenges remain the source of current payment terms.`;
}
