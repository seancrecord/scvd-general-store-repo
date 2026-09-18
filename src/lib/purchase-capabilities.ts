import type { Env, MenuItem } from "@/types";
import type { PaymentRequirements } from "@x402/core/types";
import { manifestAccepts, priceTiersUsdc, USDC_DECIMALS } from "@/lib/payments";
import { BASE_NETWORK, type PaymentNetworkConfig } from "@/lib/payment-networks";
import { mppCheckoutEnabled } from "@/lib/mpp-checkout-capability";
import { ucpItemSellable } from "@/lib/ucp/launch";
import { MENU_ITEMS } from "@/store";
import { MCP_CREDENTIAL_META_KEY, MCP_PAYMENT_REQUIRED_META_KEY, MCP_RECEIPT_META_KEY } from "@/lib/mpp-mcp-keys";

export type PurchaseCapabilityConfig = PaymentNetworkConfig & Partial<Pick<Env,
  "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER" |
  "UCP_CHECKOUT_ENABLED" | "UCP_CHECKOUT_RAILS" | "UCP_CHECKOUT_ITEMS">>;

/**
 * THE UCP ROW (2026-09-18): present on an item exactly while a UCP
 * checkout can be opened for it here — the same switch and allow-lists
 * the profile reads. A directory reader that finds it knows to read
 * /.well-known/ucp and Create a checkout; one that does not still finds
 * x402 and, when enabled, MPP, untouched.
 *
 * FOUR FIELDS, ON PURPOSE. The row rides every shelf item into
 * menu.json, the compact contracts and OpenAPI, and OpenAPI has a
 * byte ceiling (test/agent-catalog-readability.spec.ts) that the
 * disclosure block of the same day already spent most of. The rails,
 * the currency and the handler are the profile's to state, once; a
 * pointer that repeated them thirty-five times would be paying bytes
 * to say less reliably what one document says exactly.
 */
export function ucpCapability(item: MenuItem, config?: PurchaseCapabilityConfig) {
  if (!config || !ucpItemSellable(config, item.id)) return undefined;
  return { protocol: "ucp", transport: "rest", path: "/ucp/v1/checkout-sessions", profile: "/.well-known/ucp" };
}

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
  const ucp = ucpCapability(item, config);
  const rows = ucp ? [x402, ucp] : [x402];
  if (!config || !mppCheckoutEnabled(config, path, "GET")) return rows;
  const terms = nativeCheckoutTerms(config, item);
  const native = { protocol: "mpp", payment_method: "evm", intent: "charge", network: terms.network, asset: terms.asset,
    currency: "USDC", decimals: USDC_DECIMALS, amount_atomic: terms.amount };
  return [...rows,
    { ...native, transport: "http", method: "GET", path,
      request_header: "Authorization", authorization_scheme: "Payment", challenge_header: "WWW-Authenticate",
      response_header: "Payment-Receipt", idempotency_header: "Idempotency-Key" },
    { ...native, ...MCP_NATIVE_SHAPE },
    { ...native, ...WEBMCP_NATIVE_SHAPE }];
}

/**
 * The browser bridge's native lane (webmcp/purchase.js, 2026-09-18): the
 * free quote carries the HTTP door's challenge keyed to the quote's retry
 * key, and the completion carries the signed credential. Item-independent
 * like the MCP row, and carried once per compact page for the same reason.
 */
const WEBMCP_NATIVE_SHAPE = { transport: "webmcp", script: "/webmcp.js",
  quote_tool: "quote_store_purchase", challenge_field: "payment_challenge",
  complete_tool: "complete_store_purchase", credential_argument: "signed_credential", receipt_field: "payment_receipt" } as const;

/** The page-level WebMCP native row: the terms are each item's own HTTP native row. */
export function nativeWebmcpCheckoutShape(config?: PurchaseCapabilityConfig) {
  if (!nativeCheckoutDoors(config).length) return undefined;
  return { protocol: "mpp", payment_method: "evm", intent: "charge", ...WEBMCP_NATIVE_SHAPE,
    terms: "each item's payment_capabilities row with transport http: same network, asset and amount_atomic" };
}

/**
 * The MCP door's native lane (lib/mcp-mpp-payment.ts), in the MPP SDK's
 * own MCP wire shape; the three keys are the SDK's, spelled once in
 * lib/mpp-mcp-keys.ts. Item-independent, so the compact catalog page
 * carries it once rather than once per row.
 */
const MCP_NATIVE_SHAPE = { transport: "mcp", method: "tools/call", path: "/mcp",
  challenge_key: MCP_PAYMENT_REQUIRED_META_KEY, challenge_location: "error.data, or result._meta with ?payment=tool-result",
  credential_meta_key: MCP_CREDENTIAL_META_KEY, receipt_meta_key: MCP_RECEIPT_META_KEY, idempotency_meta_key: "x402/idempotency-key" } as const;

/** The page-level MCP native row: the terms are each item's own HTTP native row. */
export function nativeMcpCheckoutShape(config?: PurchaseCapabilityConfig) {
  if (!nativeCheckoutDoors(config).length) return undefined;
  return { protocol: "mpp", payment_method: "evm", intent: "charge", ...MCP_NATIVE_SHAPE,
    terms: "each item's payment_capabilities row with transport http: same network, asset and amount_atomic" };
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
  return `Native MPP checkout: HTTP GET /api/buy/{item} on ${count} shelf items also offers evm/charge on ${sample.network}, ${sample.currency} (${sample.asset}), at that item's own minimum in atomic units with ${sample.decimals} decimals, no tip; the exact amount is in the door's WWW-Authenticate: Payment challenge and in its payment_capabilities row. Read the current challenge, authorize it in a compatible client, and retry identical inputs with Authorization: Payment and the quote's Idempotency-Key. Do not combine it with an x402 payment header. After an uncertain result, keep the original credential and recovery handle; do not sign another payment. The same offer stands on the MCP door: an unpaid buy_* tools/call answers with the challenge under ${MCP_PAYMENT_REQUIRED_META_KEY} (in error.data, or in result._meta with ?payment=tool-result), the retry carries the credential in _meta['${MCP_CREDENTIAL_META_KEY}'] with identical arguments, and the receipt returns in result._meta['${MCP_RECEIPT_META_KEY}']. On WebMCP, quote_store_purchase returns the same challenge as payment_challenge, keyed to the quote's retry key, and complete_store_purchase takes the signed Payment credential as signed_credential and returns payment_receipt; the packages retain their existing x402 checkout. The challenge carries no EIP-712 domain: a stock mppx client resolves the token's name and version from its own asset registry (currencies: [Assets.base.USDC]) or an explicit authorization option. Offers remain subject to input, stock and availability checks. The store-specific payment_capabilities field and OpenAPI x-scvd-payment-capabilities describe enabled rails; x-payment-info adds the enabled MPP method, intent and currency for directory readers while preserving x402 discovery. Runtime challenges remain the source of current payment terms.`;
}
