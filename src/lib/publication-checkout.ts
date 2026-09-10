import { IDEMPOTENCY_TTL_SECONDS } from "@/lib/idempotency";
/** Publications return the page itself; the receipt header is the purchase record. */
export function publicationCheckout(base: string) {
  return {
    buyer_guidance: {
      price_effect: { higher_payment: "optional_tip", higher_payment_changes_scope: false, scope: "The entire named page at the lowest offered tier." },
      production: { kind: "existing_publication", attribution: "See the page byline and publication date; purchase does not commission new writing." },
      credit: { accrues: false },
      recovery: { how: "Retain the exact URL, original signed payment, idempotency key and receipt. Retry the same request; do not sign a fresh payment to check status.", private_status_handle: true, status_header: "Purchase-Recovery", status_header_encoding: "base64 JSON", retained_good: "The exact markdown prepared for the original payment; later edits do not replace it.", replay_cache_seconds: IDEMPOTENCY_TTL_SECONDS, replay_cache_limit: "A cache write or read can fail. Retain the original authorization; do not use a fresh one to recover a missing response." },
    },
    protocol: "x402",
    version: 2,
    currency: "USDC",
    amount_unit: "atomic",
    method: "GET",
    request_header: "PAYMENT-SIGNATURE",
    challenge_header: "PAYMENT-REQUIRED",
    response_header: "PAYMENT-RESPONSE",
    idempotency_header: "Idempotency-Key",
    delivery_mime_type: "text/markdown",
    per_purchase_certificate: false,
    steps: [
      "GET the page's buy_url without payment for a free quote. Decode the PAYMENT-REQUIRED header as base64 JSON.",
      "Choose an offered network and amount within your budget. Use accepts[].amount unchanged: it is atomic USDC, not dollars. The lowest tier buys the whole page; higher tiers are optional tips.",
      "Sign in your wallet or payment client. Without a compatible wallet, stop here. Never send private keys, seed phrases or wallet secrets.",
      "Retry the identical URL with the signed x402 v2 payload in PAYMENT-SIGNATURE. Keep one unique Idempotency-Key (16–128 characters) for this purchase and reuse it on retries.",
      "On success, save the markdown body, PAYMENT-RESPONSE header and private Purchase-Recovery header (base64 JSON). The recovery handle retrieves the retained page through a free authenticated status read. No per-purchase certificate is minted for a page. An interrupted response does not prove payment failed; retry with the same payment and idempotency key.",
    ],
    documentation_url: `${base}/agents.md`,
  };
}

export function publicationLinks(url: string) {
  const inputSchema = { type: "object", properties: {}, required: [] };
  return { buy_url: url, method: "GET", required_params: [], input_schema: inputSchema, inputSchema };
}

export function publicationCollections(base: string) {
  return ["/almanac", "/gazette", "/zodiac/archive"].map(path => ({ index_url: `${base}${path}?view=compact` }));
}

/** Bounds apply only to the opt-in compact view; the existing full indexes remain. */
export const PUBLICATION_PAGE_SIZE = 8;
export function publicationPage<T>(entries: T[], indexUrl: string, rawPage = "0") {
  const pages = Math.max(1, Math.ceil(entries.length / PUBLICATION_PAGE_SIZE));
  if (!/^\d{1,6}$/.test(rawPage) || Number(rawPage) >= pages) return null;
  const page = Number(rawPage);
  const offset = page * PUBLICATION_PAGE_SIZE;
  const rows = entries.slice(offset, offset + PUBLICATION_PAGE_SIZE);
  return {
    rows,
    pagination: { page, page_count: pages, total: entries.length, limit: PUBLICATION_PAGE_SIZE, offset, returned: rows.length, has_more: page + 1 < pages, next: page + 1 < pages ? `${indexUrl}?view=compact&page=${page + 1}` : null },
  };
}
