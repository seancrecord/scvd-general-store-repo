import { buyerGuidance } from "@/lib/buyer-guidance";
import { publicationCollections } from "@/lib/publication-checkout";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { priceTiersUsdc, USDC_DECIMALS } from "@/lib/payments";
import { CAPABILITY_QUERY } from "@/store/spec";
import { artifactClassForItem } from "@/store/attestation-spec";
import { MENU_ITEMS } from "@/store";
import type { MenuItem } from "@/types";

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
    input_network_note: "A network input on a statement or audit selects the chain to inspect; it does not select the payment network. Pay only on a network offered in the current challenge.",
    mcp_payment_key: "x402/payment",
    mcp_idempotency_key: "x402/idempotency-key",
    steps: [
      "Choose an item and supply its required inputs. The input contract and its MCP URL describe that item alone.",
      "HTTP: GET buy_url with those query parameters. The 402 PAYMENT-REQUIRED header is base64 JSON. Asking the price costs nothing: a bare GET answers 402 too, naming required_params in the body. Supplied inputs are validated before terms, so an invalid one gets a field refusal, not a quote.",
      "A payment-capable client selects an offered network and exact amount within your budget. Copy the atomic amount unchanged; do not multiply by a million. Without a supported wallet/payment client, stop before signing.",
      "Retry the same request and inputs with the signed v2 payload in PAYMENT-SIGNATURE. Set the Idempotency-Key header to the quote body’s idempotency.suggested_key to protect retries. X-PAYMENT is an alias for the same v2 payload, not v1 support.",
      "MCP: at the item's mcp_url, tools/list gives one buy tool. Its unpaid result has isError:true and the challenge in structuredContent. Retry with payment in params._meta['x402/payment'] and the quote result._meta['x402/idempotency-key'] in params._meta['x402/idempotency-key'].",
      "Invalid inputs are refused before payment. A successful instant purchase returns the goods; a human task returns an order to poll. Goods are produced before settlement; a response lost in transit still needs the same retry key.",
    ],
    wallet_safety: "Never send private keys, seed phrases, or wallet secrets. Signing happens in the buyer's wallet or payment client.",
    documentation_url: `${base}/agents.md`,
    full_catalog_url: `${base}/menu.json`,
  };
}

export function compactItemRow(item: MenuItem, base: string) {
  const links = buyerLinks(item, base);
  return {
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

export function compactItemContract(item: MenuItem, base: string) {
  const artifact = artifactClassForItem(item.id);
  return {
    ...compactItemRow(item, base),
    buyer_guidance: buyerGuidance(item, base),
    description: item.description,
    reads: item.reads,
    ...(item.constraints ? { constraints: item.constraints } : {}),
    ...(item.sample_url ? { sample_url: item.sample_url, sample_kind: item.sample_kind ?? "unsigned_specimen" } : {}),
    input_schema: { type: "object", ...buyInputSchema(item) },
    availability: "The purchase request checks live stock, keeper availability, and any subject-specific prerequisites before charging.",
    ...(artifact ? { signs: artifact.signs, does_not_prove: artifact.does_not_prove } : {}),
    checkout: checkoutContract(base),
  };
}

/** Page numbers are limited by the actual shelf and reject malformed or out-of-range values. */
export function compactCatalog(base: string, rawPage = "0") {
  const pages = Math.max(1, Math.ceil(MENU_ITEMS.length / COMPACT_CATALOG_PAGE_SIZE));
  if (!/^\d{1,6}$/.test(rawPage) || Number(rawPage) >= pages) return null;
  const page = Number(rawPage);
  const offset = page * COMPACT_CATALOG_PAGE_SIZE;
  const items = MENU_ITEMS.slice(offset, offset + COMPACT_CATALOG_PAGE_SIZE)
    .map(item => compactItemRow(item, base));
  return {
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
