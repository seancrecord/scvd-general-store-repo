import { purchaseCapabilities, type PurchaseCapabilityConfig, nativeMcpCheckoutShape, nativeWebmcpCheckoutShape } from "@/lib/purchase-capabilities";
import { purchaseChecklist } from "@/lib/purchase-checklist";
import { buyerGuidance } from "@/lib/buyer-guidance";
import { publicationCollections } from "@/lib/publication-checkout";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { priceTiersUsdc, USDC_DECIMALS } from "@/lib/payments";
import { CAPABILITY_QUERY } from "@/store/spec";
import { artifactClassForItem } from "@/store/attestation-spec";
import { MENU_ITEMS } from "@/store";
import type { MenuItem } from "@/types";
import { DISCLOSURE_FIELDS } from "@/lib/disclosure";

/** Fixed views of the existing shelf; no session, cursor storage, or second catalog. */
export const COMPACT_CATALOG_PAGE_SIZE = 8;
export const MCP_TOOL_RESULT_PAYMENT = "tool-result";

export function buyerLinks(item: MenuItem, base: string) {
  return {
    required_params: [...(buyInputSchema(item).required ?? [])],
    input_contract_url: `${base}/menu/${item.id}?view=compact`,
    mcp_url: `${base}/mcp?view=compact&item_id=${item.id}&payment=${MCP_TOOL_RESULT_PAYMENT}`,
  };
}

/** Instructions at the point of use, including the buyer whose training predates x402. */
export function checkoutContract(base: string) {
  return {
    protocol: "x402",
    version: 2,
    currency: "USDC",
    amount_unit: "atomic",
    asset_decimals: USDC_DECIMALS,
    automatic_renewal: false,
    // A bare GET of buy_url answers 402 with required_params in the
    // body (the probe rule). Inputs that ARE supplied are validated
    // before terms, signed or not.
    valid_inputs_required_before_quote: false,
    bare_probe_answers_402: true,
    price_discovery_url: `${base}/api/catalog/v1`,
    request_header: "PAYMENT-SIGNATURE",
    legacy_header_alias: "X-PAYMENT",
    legacy_payload_supported: false,
    challenge_header: "PAYMENT-REQUIRED",
    response_header: "PAYMENT-RESPONSE",
    payment_network_source: "PAYMENT-REQUIRED.accepts[].network",
    input_network_note: "A network input selects the chain to inspect; it does not select the payment network. Pay only on a network offered in the current quote.",
    mcp_payment_key: "x402/payment",
    mcp_idempotency_key: "x402/idempotency-key",
    steps: [
      "Use the item's input contract and mcp_url for required inputs and its single buy tool.",
      "GET buy_url with query inputs. The free 402 quote names required_params; PAYMENT-REQUIRED is base64 JSON. A bare GET also quotes; invalid supplied inputs are refused.",
      "Select an offered network and amount within budget; copy atomic amounts unchanged. Without a supported wallet/client, stop before signing.",
      "Retry identical inputs with the signed v2 payload in PAYMENT-SIGNATURE and Idempotency-Key from quote.idempotency.suggested_key. X-PAYMENT also accepts v2, never v1.",
      "MCP: tools/list at mcp_url. Unpaid: isError:true and structuredContent quote. Retry with params._meta['x402/payment']; copy result._meta['x402/idempotency-key'] to the same key in params._meta.",
      "Invalid inputs never pay. Instant goods precede settlement; human work returns an order to poll. After a lost response, reuse payment, inputs and retry key.",
    ],
    wallet_safety: "Never send keys, seed phrases or wallet secrets. Sign in your wallet or payment client.",
    documentation_url: `${base}/agents.md`,
    full_catalog_url: `${base}/menu.json`,
  };
}

export function compactItemRow(item: MenuItem, base: string, config?: PurchaseCapabilityConfig) {
  const links = buyerLinks(item, base);
  const capabilities = purchaseCapabilities(item, config);
  return {
    // The compact document already carries the full x402 checkout contract.
    // Spend its reading budget on an additional protocol only when enabled,
    // and on the item-independent MCP row once per page (compactCatalog),
    // not once per item; the item contract carries every row.
    ...(capabilities.some(row => row.protocol === "mpp") ? { payment_capabilities: capabilities.filter(row => row.transport === "http") } : {}),
    id: item.id,
    name: item.name,
    task: CAPABILITY_QUERY[item.id] ?? item.name,
    price_usdc: item.price_usdc,
    pricing: item.pricing,
    price_tiers_usdc: priceTiersUsdc(item),
    cadence: item.cadence,
    ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
    fulfillment: item.fulfillment,
    method: "GET",
    buy_url: `${base}/api/buy/${item.id}`,
    listing_url: `${base}/menu/${item.id}`,
    ...links,
    price_discovery_url: links.input_contract_url,
  };
}

/**
 * The item's inputs WITHOUT the six disclosure fields (lib/disclosure).
 * The compact contract lives under a 16,000-byte budget and the
 * biggest item, under the all-rails config, had 60 bytes to spare —
 * not enough for even the field names. So the typed block, with what
 * each field changes and never touches, rides the 402 body, the MCP
 * shelf and openapi.json's DisclosureBlock, which is where a buyer
 * fills it; a reader of this view learns of it at the quote.
 */
function compactInputSchema(item: MenuItem): Record<string, unknown> {
  const schema = buyInputSchema(item);
  return {
    type: "object",
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties).filter(([name]) => !(DISCLOSURE_FIELDS as readonly string[]).includes(name)),
    ),
  };
}

export function compactItemContract(item: MenuItem, base: string, config?: PurchaseCapabilityConfig) {
  const artifact = artifactClassForItem(item.id);
  const capabilities = purchaseCapabilities(item, config);
  return {
    ...compactItemRow(item, base, config),
    ...(capabilities.some(row => row.protocol === "mpp") ? { payment_capabilities: capabilities } : {}),
    buyer_guidance: buyerGuidance(item, base),
    purchase_checklist: purchaseChecklist(item, config),
    description: item.description,
    reads: item.reads,
    ...(item.constraints ? { constraints: item.constraints } : {}),
    ...(item.sample_url ? { sample_url: item.sample_url, sample_kind: item.sample_kind ?? "unsigned_specimen" } : {}),
    input_schema: compactInputSchema(item),
    availability: "Checkout checks stock, keeper availability and subject prerequisites before charging.",
    ...(artifact ? { signs: artifact.signs, does_not_prove: artifact.does_not_prove } : {}),
    checkout: checkoutContract(base),
  };
}

/** Page numbers are limited by the actual shelf and reject malformed or out-of-range values. */
export function compactCatalog(base: string, rawPage = "0", config?: PurchaseCapabilityConfig) {
  const pages = Math.max(1, Math.ceil(MENU_ITEMS.length / COMPACT_CATALOG_PAGE_SIZE));
  if (!/^\d{1,6}$/.test(rawPage) || Number(rawPage) >= pages) return null;
  const page = Number(rawPage);
  const offset = page * COMPACT_CATALOG_PAGE_SIZE;
  const items = MENU_ITEMS.slice(offset, offset + COMPACT_CATALOG_PAGE_SIZE)
    .map(item => compactItemRow(item, base, config));
  const mcpNative = nativeMcpCheckoutShape(config);
  const webmcpNative = nativeWebmcpCheckoutShape(config);
  return {
    ...(mcpNative ? { native_mcp_checkout: mcpNative } : {}),
    ...(webmcpNative ? { native_webmcp_checkout: webmcpNative } : {}),
    publications: publicationCollections(base),
    total: MENU_ITEMS.length,
    page,
    pages,
    limit: COMPACT_CATALOG_PAGE_SIZE,
    offset,
    returned: items.length,
    has_more: page + 1 < pages,
    items,
    next: page + 1 < pages ? `${base}/menu.json?view=compact&page=${page + 1}` : null,
    checkout: checkoutContract(base),
  };
}

export function buyerQuickStart(base: string): string {
  return `Small-context purchase guide: ${base}/menu.json?view=compact (paged). Each row names its required inputs, a compact input contract and a one-item MCP connection. Free tools: ${base}/openapi-tools.json. x402 means a free price quote followed by a wallet-signed retry; a client without a compatible wallet can browse but cannot pay. Prerequisites checklist and full instructions: ${base}/agents.md.`;
}
