import type { Env } from "@/types";
import { ZODIAC_STATUS } from "@/store/zodiac";
import { IDEMPOTENCY_TTL_SECONDS } from "@/lib/idempotency";
import { NATIVE_HTTP_HEADERS, nativePublicationsEnabled } from "@/lib/mpp-checkout-capability";
import { BASE_NETWORK } from "@/lib/payment-networks";

/**
 * THE NATIVE LANE ON THE PAGE'S OWN CONTRACT (2026-09-19, the
 * publications follow-through). The publication release put one
 * Payment challenge per tier on every page's 402 and left the
 * indexes' checkout block describing the x402 shape alone, with the
 * guide carrying the native clause instead: the block could not ask
 * whether the lane is offered without an import cycle. lib/door-paths.ts
 * broke it. The block now names the lane from the same enabled answer
 * the challenge is minted on, so a reader of /almanac learns here what
 * the 402 will carry, and a store with the lane withheld says exactly
 * what it said before. The header names are the shelf row's own.
 */
export function nativePublicationCheckout() {
  return {
    protocol: "mpp",
    payment_method: "evm",
    intent: "charge",
    network: BASE_NETWORK,
    currency: "USDC",
    amount_unit: "atomic",
    method: "GET",
    ...NATIVE_HTTP_HEADERS,
    delivery_mime_type: "text/markdown",
    per_purchase_certificate: false,
    steps: [
      `GET the page's buy_url without payment: the same free quote. ${NATIVE_HTTP_HEADERS.challenge_header} carries one Payment challenge per price tier (an RFC 9110 challenge list, minimum first); the first buys the whole page and a higher one is an optional tip. Keep the quote's ${NATIVE_HTTP_HEADERS.idempotency_header}.`,
      "Authorize one listed challenge in a compatible MPP client, unchanged. Never combine it with an x402 payment header. Never send private keys, seed phrases or wallet secrets.",
      `Retry the identical URL with ${NATIVE_HTTP_HEADERS.request_header}: ${NATIVE_HTTP_HEADERS.authorization_scheme} <credential> and the same ${NATIVE_HTTP_HEADERS.idempotency_header}. On success, save the markdown body, the ${NATIVE_HTTP_HEADERS.response_header} header and the private Purchase-Recovery header (base64 JSON). The same credential again returns the retained page without a second settle; an interrupted response does not prove payment failed.`,
    ],
  };
}

/** Publications return the page itself; the receipt header is the purchase record. */
export function publicationCheckout(base: string, config?: Pick<Env, "MPP_CHECKOUT_ENABLED" | "MPP_CHALLENGE_KEY" | "PAID_RECOVERIES" | "COUNTER_LEDGER">) {
  return {
    // Present exactly while the page's 402 carries the challenge list.
    ...(nativePublicationsEnabled(config) ? { mpp: nativePublicationCheckout() } : {}),
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

export const PUBLICATION_COLLECTIONS_SCHEMA = {
  type: "array",
  description: "Publication indexes outside menu search; archived collections are opt-in, not current offerings.",
  items: { type: "object", required: ["index_url", "status"], properties: {
    index_url: { type: "string", format: "uri" },
    status: { type: "string", enum: ["active", "archived"] },
  } },
};

export function publicationCollections(base: string) {
  return [
    { index_url: `${base}/almanac?view=compact`, status: "active" },
    { index_url: `${base}/open-for-business?view=compact`, status: "active" },
    { index_url: `${base}/gazette?view=compact`, status: "archived" },
    { index_url: `${base}/zodiac/archive?view=compact`, status: ZODIAC_STATUS },
  ];
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
