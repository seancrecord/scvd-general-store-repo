/**
 * THE CRAWLERS THE STORE NAMES, in one list two readers share.
 *
 * robots.txt prints these by name (routes/site-meta.ts carries the
 * reasoning for each: training, user-initiated fetch and search
 * indexing are three permissions and all three are yes). Since
 * 2026-09-02 the same list decides content negotiation: probed from
 * outside, every one of these agents received `application/json`
 * from the item pages and the conformance desk, because they send a bare
 * wildcard Accept or nothing, and the store's negotiated routes answer
 * a bare wildcard with JSON for the agents that actually transact.
 * JSON carries no title, no description and no JSON-LD, so the
 * structured data on those pages had plausibly never been read by
 * the engines it was written for.
 *
 * So a named crawler that states no preference gets the page. A
 * caller that ranks JSON or markdown above HTML still gets what it
 * asked for, crawler or not. Everyone else is unchanged: an agent's
 * `fetch(url)` keeps getting JSON. One list, so robots.txt and the
 * negotiation cannot come to name different crawlers.
 */
export const NAMED_AI_CRAWLERS: readonly string[] = [
  // Anthropic: training, user-initiated fetch, search indexing.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // OpenAI: training, user-initiated fetch, search indexing.
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Google's AI-training opt-out token (Googlebot proper is covered
  // by the wildcard and has never been an AI-policy question).
  "Google-Extended",
  // Answer engines that cite their sources, which is the traffic this
  // store is actually built to receive.
  "PerplexityBot",
  "Perplexity-User",
  // Apple's AI-training token, same shape as Google-Extended.
  "Applebot-Extended",
  // Meta, Amazon, ByteDance, Mistral, Cohere, Common Crawl — the
  // corpora that end up inside models we will never be told about.
  "Meta-ExternalAgent",
  "meta-externalagent",
  "Amazonbot",
  "Bytespider",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
  // Diffbot and Timpi build structured indexes that other agents buy
  // from; a store that sells evidence wants to be inside those.
  "Diffbot",
  "Timpibot",
];

/**
 * Search crawlers proper. They send a browser Accept header and get
 * HTML that way already; named so the rule reads the same for all of
 * them and a future one that sends a wildcard is covered.
 */
export const SEARCH_CRAWLERS: readonly string[] = [
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "Applebot",
  "YandexBot",
];

const CRAWLER_TOKENS = [...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS].map((token) =>
  token.toLowerCase(),
);

/** True when the User-Agent names a crawler from either list. */
export function isKnownCrawler(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return CRAWLER_TOKENS.some((token) => lower.includes(token));
}
