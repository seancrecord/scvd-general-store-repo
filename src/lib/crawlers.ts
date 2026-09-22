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
  // `anthropic-ai` and `Claude-Web` stood here until 2026-09-10; both
  // were retired by Anthropic in favour of ClaudeBot (their support
  // page names these three and no other), and the rule at the top of
  // routes/site-meta.ts is that a stanza for a crawler its operator
  // has retired is the same class of false claim as a sameAs pointing
  // at a page nobody wrote. Traffic still carrying the old string is
  // legacy or spoofed, and the wildcard answers it either way.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
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
  /*
   * THE FIELD, WALKED A THIRD TIME 2026-09-10, against the community
   * roster at ai-robots-txt/ai.robots.txt (170-odd strings) and the
   * keeper's ask that every potential reader be answered by name.
   * The rule that decided which of the 170 land here is unchanged:
   * a token appears only where its OPERATOR publishes it. Each line
   * below names the vendor page it was read against, because a name
   * copied from a third-party directory is a permission stated to a
   * string nobody may send.
   */
  // Google's two user-triggered fetchers added to its crawler list
  // in 2026 (developers.google.com, crawlers-fetchers): Google-Agent
  // is the identity for agents on Google infrastructure browsing on a
  // person's behalf; Google-NotebookLM fetches a page a NotebookLM
  // user added as a source.
  "Google-Agent",
  "Google-NotebookLM",
  // Amazon's two beside Amazonbot (developer.amazon.com/amazonbot):
  // Amzn-SearchBot indexes for Alexa and Amazon search experiences,
  // Amzn-User fetches live for an Alexa answer. Neither trains.
  "Amzn-SearchBot",
  "Amzn-User",
  // Meta's search indexer beside its training crawler and fetcher
  // (developers.facebook.com, web-crawlers): "allowing Meta-WebIndexer
  // helps us cite and link to your content in Meta AI's responses",
  // which is the sentence this store is built to receive.
  "Meta-WebIndexer",
  // Mistral's index for Le Chat's search (docs.mistral.ai/robots),
  // beside MistralAI-User above; Mistral states it does not train.
  "MistralAI-Index",
  // Moonshot's pair (kimi.ai/policies/kimi-crawlers): KimiBot gathers
  // for training, Kimi-SearchBot builds Kimi's search index.
  "KimiBot",
  "Kimi-SearchBot",
  // Diffbot's user-initiated twin of the Diffbot crawler above
  // (docs.diffbot.com).
  "Diffbot-User",
  // AWS's crawler for a Bedrock customer's own knowledge base
  // (docs.aws.amazon.com/bedrock, web crawler data source): the same
  // shape as Google-CloudVertexBot, grounding somebody else's app.
  "bedrockbot",
  /*
   * THE KEEPER'S RULING, 2026-09-10, SAME DAY: name these too. Each
   * was held back from the walk above because its operator publishes
   * no bots page, and the xAI precedent is the shape that covers
   * them — a permission stated to a string we cannot confirm anyone
   * reads, worth stating because the alternative is a major reader
   * with no line addressed to it. Every one is an indexer below, for
   * the reason the xAI block gives: a purpose the vendor never
   * published is not a purpose this store can class on, and unsure
   * loses least as the page. The day one of them publishes a bots
   * page, its line moves to the walk above and its class follows.
   */
  // Three model builders whose corpora we will never be told about.
  "DeepSeekBot",
  "QwenBot",
  "DoubaoBot",
  // Mistral's training crawler: the roster says Mistral documents it
  // beside MistralAI-Index, but the page could not be read from the
  // build that added this line, so it waits here rather than above.
  "MistralAI-Training",
  // The retrieval layers agents actually call — Firecrawl, Exa,
  // Tavily — are the Diffbot case: structured indexes other agents
  // buy from, and a store that sells evidence wants to be inside them.
  "FirecrawlAgent",
  "ExaSearchBot",
  "TavilyBot",
  // Anthropic's coding agent fetching a URL a developer pointed it at.
  "Claude-Code",
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
  // Brave's index (search.brave.com/help/brave-search-crawler), which
  // also feeds the Search API that agents and RAG pipelines read.
  "Bravebot",
];

/**
 * THE UNFURLERS (2026-09-14, found by the keeper posting his own card).
 *
 * A social unfurler is not a crawler and not a reader. It fetches one
 * URL, reads the `<head>`, throws the body away, and renders a preview
 * card from the Open Graph tags. It sends `Accept: * / *` and a bot
 * User-Agent, which is exactly the shape this store answers with JSON
 * — so every one of them has been getting a signed record with no
 * `og:image` in it since the day the card table opened.
 *
 * The cost was total and silent. The store's own copy promises "a page
 * that unfurls wherever it is posted" on the menu, in the MCP tool
 * description and in the spec; the share sheet is rendered at 1200x675
 * for precisely this; and no post of a scvd.store link to X, Slack,
 * Discord, LinkedIn or iMessage has ever shown a picture. Nothing
 * failed, so nothing said so.
 *
 * These are listed separately from the indexers because they want a
 * different thing for a different reason: an indexer wants the page
 * for its JSON-LD, an unfurler wants the page for its meta tags, and
 * a training crawler wants the prose. Only the first two want HTML.
 *
 * Tokens are the vendor-published ones. Note facebookexternalhit is
 * also what Instagram and WhatsApp send, and Slackbot-LinkExpanding is
 * the unfurl half of Slack's two agents.
 */
export const SOCIAL_UNFURLERS: readonly string[] = [
  "Twitterbot",
  "facebookexternalhit",
  "Slackbot-LinkExpanding",
  "Slackbot",
  "Discordbot",
  "LinkedInBot",
  "WhatsApp",
  "TelegramBot",
  "redditbot",
  "Pinterestbot",
  "Mastodon",
  "Bluesky",
  // iMessage, Mail.app and every other macOS link preview.
  "facebookcatalog",
  "SkypeUriPreview",
  "vkShare",
  "Iframely",
  "Embedly",
];

const UNFURLER_TOKENS = SOCIAL_UNFURLERS.map((token) => token.toLowerCase());

/**
 * True when the User-Agent is a link-preview fetcher. It gets HTML on
 * any Accept header, because the meta tags it came for exist nowhere
 * else — a JSON twin is a preview that cannot be drawn.
 */
export function isSocialUnfurler(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return UNFURLER_TOKENS.some((token) => lower.includes(token));
}

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
   * The 2026-09-10 additions, classed on the same published purposes:
   * KimiBot gathers for training; Google-NotebookLM, Amzn-User and
   * Diffbot-User each fetch one page because one person asked for it.
   *
   * WHO IS DELIBERATELY NOT HERE from the same walk: Google-Agent is
   * user-initiated too, but it is an agent driving a browser, and a
   * browser agent handed markdown loses the buttons it came to press.
   * It sends a browser Accept in practice, so this classification
   * mostly never fires — and where it does, unsure is an indexer, as
   * below. Amzn-SearchBot, Meta-WebIndexer, MistralAI-Index and
   * Kimi-SearchBot are indexes and want the JSON-LD; bedrockbot
   * grounds a customer's app, the Google-CloudVertexBot case.
   */
  "KimiBot",
  "Google-NotebookLM",
  "Amzn-User",
  "Diffbot-User",
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

/**
 * WHO IS A PERSON'S ERRAND, NOT A CRAWL (2026-09-21). The named list
 * splits once more, this time for the counters rather than the
 * negotiation: a user-initiated fetcher reads one page because one
 * person asked a model to, in a chat, now. That is neither an index
 * walk nor a typed URL, and for a month the observatory filed every
 * one of them as organic "direct" while the signals page filed the
 * same request as a crawler — two instruments, two answers, on the
 * same row. Each name here is the vendor's own published purpose,
 * the same reading MARKDOWN_READERS makes; nothing is guessed from a
 * string.
 */
export const USER_INITIATED_FETCHERS: readonly string[] = [
  "Claude-User",
  "ChatGPT-User",
  "Perplexity-User",
  "MistralAI-User",
  "Meta-ExternalFetcher",
  "Google-NotebookLM",
  "Amzn-User",
  "Diffbot-User",
  // An agent driving a browser on a person's behalf: an errand too.
  "Google-Agent",
  // Grounding a customer's app: one fetch because one user asked.
  "bedrockbot",
  "Google-CloudVertexBot",
];

/**
 * Named in robots.txt so the permission is stated, but a buyer's own
 * client rather than anybody's crawler: it can pay, and a client that
 * can pay is never the noise floor.
 */
export const AGENT_CLIENTS: readonly string[] = ["Claude-Code"];

/**
 * Everyone named who is neither a person's errand nor a buyer's
 * client is machinery: training corpora, answer and search indexes,
 * link unfurlers. Derived, so a name added to the lists above lands
 * in exactly one counter class or a test says so. The channel
 * classifier (lib/channel.ts) reads this beside its own table of
 * self-describing machinery.
 */
export const MACHINERY_CRAWLERS: readonly string[] = [
  ...NAMED_AI_CRAWLERS.filter(
    (token) => !USER_INITIATED_FETCHERS.includes(token) && !AGENT_CLIENTS.includes(token),
  ),
  ...SEARCH_CRAWLERS,
  ...SOCIAL_UNFURLERS,
];

const FETCHER_TOKENS = USER_INITIATED_FETCHERS.map((token) => token.toLowerCase());
const MACHINERY_TOKENS = MACHINERY_CRAWLERS.map((token) => token.toLowerCase());

/** True when the User-Agent names a user-initiated fetcher. Checked before machinery: Diffbot-User contains Diffbot. */
export function isUserInitiatedFetcher(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return FETCHER_TOKENS.some((token) => lower.includes(token));
}

/** True when the User-Agent names a training crawler, an index or an unfurler, and not a fetcher. */
export function isMachineryCrawler(userAgent: string | undefined | null): boolean {
  if (!userAgent || isUserInitiatedFetcher(userAgent)) return false;
  const lower = userAgent.toLowerCase();
  return MACHINERY_TOKENS.some((token) => lower.includes(token));
}

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
