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
  /*
   * THE FIELD, WALKED AGAIN 2026-09-06, at the keeper's ask to account
   * for every major reader rather than the ones we happened to name
   * first. Each of these was already welcome under the wildcard; what
   * was missing was the store SAYING so by name, which is the only
   * form of permission a crawler reads.
   */
  // Google's two crawlers that are not Googlebot and not the
  // AI-training token: GoogleOther is the generic non-search fetch,
  // Google-CloudVertexBot grounds a Vertex customer's own app.
  "GoogleOther",
  "Google-CloudVertexBot",
  // Meta's user-initiated fetcher, the twin of Meta-ExternalAgent:
  // one page, because a person in a Meta product asked for it.
  "Meta-ExternalFetcher",
  // The answer engines that were missing from the roster.
  "DuckAssistBot",
  "YouBot",
  "PetalBot",
  // The Allen Institute's open academic corpus.
  "AI2Bot",
  /*
   * ora-agent (2026-09-09): the agent-readiness scanner that scores
   * whether a site can be reached and read by machine readers. Its
   * own report marked this store "unknown" for its own user-agent
   * while naming every neighbour reachable — the one string on this
   * roster that cannot be read off a vendor page, because it belongs
   * to the instrument doing the reading. Already welcome under the
   * wildcard; named so the answer is a yes and not a shrug. Its
   * purpose is to score the page and its structured data, so it is
   * an indexer by derivation: it keeps the HTML and the JSON-LD it
   * came to measure.
   */
  "ora-agent",
  /*
   * xAI, AND THE REASON THIS ENTRY IS DIFFERENT FROM THE OTHERS.
   *
   * Every other name above comes from a vendor's own published bots
   * page. xAI has none: these three strings circulate in third-party
   * crawler directories, and operators report that what actually
   * arrives carries an iPhone user-agent instead. So this is a
   * permission stated to a name we cannot confirm anyone reads, which
   * is worth doing anyway — the alternative is a major model builder
   * with no line addressed to it at all — and worth writing down
   * rather than leaving for someone to discover in a log. It is also
   * why none of the three is a markdown reader below: a purpose the
   * vendor never published is not a purpose this store can class on.
   */
  "GrokBot",
  "xAI-Grok",
  "Grok-DeepSearch",
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

/**
 * THE READERS AND THE INDEXERS (2026-09-05, at the keeper's ask).
 *
 * The 2026-09-02 rule above gave every named crawler the HTML page on
 * a bare wildcard, for one reason: the JSON-LD an index reads lives
 * only in the HTML. That reason holds for an INDEXER — a search or
 * answer engine that cites pages — and holds for nobody else. A
 * training crawler is building a corpus a model learns from, and a
 * user-initiated fetcher is reading one page on a person's behalf,
 * in a chat, right now; both want the prose, and this store's prose
 * for machines is markdown (index.md, agents.md, the item twins). A
 * probe on 2026-09-05 found GPTBot and a browser receiving the same
 * 142,731 bytes of storefront, which is neon a model has to strip.
 *
 * So the named list splits by what each agent is FOR, per its
 * vendor's own published purpose — never by guessing at a string.
 * A reader that states no preference gets markdown where a markdown
 * representation of the page genuinely exists (the nine routes that
 * serve one), and the page everywhere else; an indexer keeps the
 * page and its JSON-LD; an Accept header that says anything at all
 * still wins over both. Vary already names User-Agent.
 */
export const MARKDOWN_READERS: readonly string[] = [
  // Training corpora.
  "ClaudeBot",
  "anthropic-ai",
  "GPTBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "meta-externalagent",
  "Bytespider",
  "cohere-ai",
  "CCBot",
  // User-initiated fetches: one page, one person, now.
  "Claude-User",
  "ChatGPT-User",
  "Perplexity-User",
  "MistralAI-User",
  "Meta-ExternalFetcher",
  /*
   * The Allen Institute's crawler builds an open academic corpus,
   * which is the training case by its own description.
   *
   * WHO IS DELIBERATELY NOT HERE, of the names added the same day:
   * GoogleOther and Google-CloudVertexBot, whose published purposes
   * are broad enough to include grounding an answer; DuckAssistBot,
   * YouBot and PetalBot, which are answer and search engines and want
   * the page's structured data; and all three xAI strings, which
   * carry no published purpose at all. Unsure is an indexer here, on
   * purpose: an indexer handed markdown loses the JSON-LD it came
   * for, while a reader handed the page still gets every word.
   */
  "AI2Bot",
];

/**
 * Everyone named who is NOT a reader is an indexer: derived, so a
 * crawler added to the named list lands in exactly one class or a
 * test says so.
 */
export const HTML_INDEXERS: readonly string[] = [
  ...NAMED_AI_CRAWLERS.filter((token) => !MARKDOWN_READERS.includes(token)),
  ...SEARCH_CRAWLERS,
];

const CRAWLER_TOKENS = [...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS].map((token) =>
  token.toLowerCase(),
);
const READER_TOKENS = MARKDOWN_READERS.map((token) => token.toLowerCase());

/** True when the User-Agent names a training crawler or a user-initiated fetcher. */
export function isMarkdownReader(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return READER_TOKENS.some((token) => lower.includes(token));
}

/** True when the User-Agent names a crawler from either list. */
export function isKnownCrawler(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return CRAWLER_TOKENS.some((token) => lower.includes(token));
}
