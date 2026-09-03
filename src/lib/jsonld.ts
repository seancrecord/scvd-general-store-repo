import { STORE_SERVICE_NAME } from "@/store/metadata";

/**
 * One place that turns a schema.org node into markup.
 *
 * THE ESCAPE IS THE WHOLE POINT. A JSON-LD block is inert data, but
 * only until a `</script>` sequence appears inside a string value and
 * ends the block early — after which the rest of the node is parsed
 * as page content. Every value we publish is derived from our own
 * copy and counts, so nothing here is attacker-controlled today; the
 * escape is what keeps that true the day a node starts carrying a
 * field somebody else wrote (a host name, an operator's own words).
 *
 * It lives in lib rather than in each route because the storefront
 * and /what each grew their own copy of this escape and the two
 * Dataset nodes grew without one — the same divergence that produces
 * one page carrying a subtly different contract from the next. One
 * helper, one behaviour, and a node added next month inherits it
 * without anybody remembering.
 */

/**
 * THE CURRENCY A VALIDATOR READS, AND THE ASSET THE TILL TAKES, KEPT
 * APART (2026-09-02, reversing the 2026-08-27 one-currency ruling for
 * JSON-LD only).
 *
 * schema.org's own priceCurrency documentation does accept crypto
 * tickers beside ISO 4217, and that was the whole basis for writing
 * "USDC" in every Offer. Google's merchant-listing validator does
 * not: Search Console read the storefront and the item pages on
 * 2026-09-02 and marked priceCurrency and currency invalid on more
 * than twenty-six pages, which is every page carrying a price. A
 * markup field nobody can parse is not a truer claim, it is no claim.
 *
 * So JSON-LD says "USD", which is true — USDC is a dollar
 * stablecoin and every price on the shelf is a dollar figure — and
 * the asset that actually settles rides beside it in
 * acceptedPaymentMethod, in words. Nothing outside JSON-LD changes:
 * menu.json, the listing spec, the 402 itself and STORE_METADATA
 * still say USDC, because those are the till's own truth and no
 * validator reads them.
 */
export const JSONLD_PRICE_CURRENCY = "USD";

/** The settlement asset, stated in words on every priced Offer. */
export const JSONLD_ACCEPTED_PAYMENT =
  "USDC over x402 v2 on Base, Polygon or Solana";

/** The fields every priced Offer carries: an ISO code and the asset in words. */
export function offerCurrencyFields(): {
  priceCurrency: string;
  acceptedPaymentMethod: string;
} {
  return {
    priceCurrency: JSONLD_PRICE_CURRENCY,
    acceptedPaymentMethod: JSONLD_ACCEPTED_PAYMENT,
  };
}

/**
 * ONE ENTITY, ONE IDENTIFIER (2026-09-02). Thirty-two JSON-LD nodes
 * named this store as provider, creator, author or publisher, under
 * two different names and with no `@id`, so an entity resolver saw
 * thirty-two organisations that happened to share a URL. Every
 * reference now points at the same node id, the one the storefront's
 * Organization block carries, so the WebSite, the Datasets and the
 * Services all resolve to one thing. The name is the naming law's
 * display name, everywhere, for the same reason.
 */
export function organizationId(base: string): string {
  return `${base}/#organization`;
}

/** A reference to the store's Organization node: id, display name, URL. */
export function organizationRef(base: string): {
  "@type": "Organization";
  "@id": string;
  name: string;
  url: string;
} {
  return {
    "@type": "Organization",
    "@id": organizationId(base),
    name: STORE_SERVICE_NAME,
    url: base,
  };
}

/** The stable identifier of the store's WebSite node, for isPartOf. */
export function websiteId(base: string): string {
  return `${base}/#website`;
}

/**
 * THE NODE EVERY ROOM CARRIES (AEO fix F22, 2026-09-03). Twenty-three
 * sitemap pages had a title, a description and a canonical, and not
 * one line of structured data, so a resolver saw a page and no entity.
 * A WebPage node is the honest minimum: it names the page, says what
 * it is in the sentence the meta description already says, and hangs
 * it off the WebSite and the Organization by their @ids so every page
 * on the domain points at the same two things. Derived from the page
 * options the renderer already has, so no room types a second copy.
 * A room with a richer node (a Service, a Dataset) keeps it beside
 * this one; two true nodes are not a contradiction.
 */
export function webPageJsonLd(page: {
  base: string;
  path: string;
  title: string;
  description: string;
  dates?: { published?: string; modified?: string };
}): Record<string, unknown> {
  return {
    ...(page.dates?.published ? { datePublished: page.dates.published } : {}),
    ...(page.dates?.modified ? { dateModified: page.dates.modified } : {}),
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${page.base}${page.path}`,
    url: `${page.base}${page.path}`,
    name: page.title,
    description: page.description,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", "@id": websiteId(page.base) },
    publisher: organizationRef(page.base),
  };
}

/** The escaped JSON body, for callers that own their own <script> tag. */
export function jsonLdBody(node: unknown): string {
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

/** The whole block: escaped body inside an inert application/ld+json tag. */
export function jsonLdScript(node: unknown): string {
  return `<script type="application/ld+json">${jsonLdBody(node)}</script>`;
}
