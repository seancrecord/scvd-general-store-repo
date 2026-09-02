import { webmcpTools } from "@/routes/webmcp";
import { uiResourceCatalog } from "@/lib/mcp-apps";
import { CONTENT_SIGNAL } from "@/routes/site-meta";
import { NEVER_A_RANKING } from "@/store/copy/doctrine";

/**
 * THE DECLINED POSITIONS, PUBLISHED (P12, 2026-08-27). The store
 * deliberately declines several scanner recommendations, and the
 * reasoning lived only in internal docs where no reader of a
 * scorecard could see it — while the store's own practice
 * (/corrections, the coverage rows) is to publish gaps beside
 * findings. Same discipline, pointed at our own scorecard: a point
 * we chose not to score is a decision, and decisions get published
 * with their reasons.
 *
 * ONE ARRAY, EVERY DIALECT. /developers renders this in HTML, JSON
 * and markdown, and the llms guide files the same section under the
 * developers area — the surfaces()/conventions() pattern, so the
 * positions cannot disagree between doors.
 */
export interface DeclinedPosition {
  heading: string;
  body: string;
}

export function declinedPositions(base: string): DeclinedPosition[] {
  /**
   * DERIVED, NOT REMEMBERED: the WebMCP entry reads the live tool
   * list from the same derivation /webmcp.js serves, so the day a
   * tool joins or leaves the browser surface this sentence moves on
   * the same deploy. Hand-typing "four tools" here is exactly the
   * drift class P12 warns about — the first draft of this section
   * nearly shipped "scoped, not built" against a surface that went
   * live from another desk the same week.
   */
  const browserTools = webmcpTools().map((tool) => tool.name);
  return [
    {
      heading: "ai-train=yes stays",
      body: `Scanners award a point for ai-train=no. This store publishes Content-Signal: ${CONTENT_SIGNAL} in robots.txt on purpose — the same constant renders both lines, so this sentence cannot argue with that file: a shop whose product is being the x402 conformance reference WANTS to be in the corpus a model learns from. Training is distribution here, not leakage. Everything on this site is already free to fetch, most of it CC BY 4.0, and a policy we would not enforce is one we should not print.`,
    },
    {
      heading: "No Wikipedia article, and no plans for one",
      body: `Diligence scans look for Wikipedia and Wikidata in sameAs and score us nought for two. Both stay absent on purpose: a company this young fails notability, an article written to game a checklist gets deleted, and a deleted article is worse than none — while a sameAs naming a page that does not exist is a false claim in machine form. Revisit at real notability, not before. The GitHub repository is in sameAs, because it exists and a reader can check claims there rather than check that a claim was filed.`,
    },
    {
      heading: "WebMCP and MCP Apps, exactly as far as they go",
      body: `WebMCP is live: ${base}/webmcp.js registers ${browserTools.length} free, read-only tools (${browserTools.join(", ")}) on document.modelContext for agents resident in the visitor's browser. The set derives from the MCP catalog's read-only tools, so nothing that writes and nothing that can take money can appear there; a test pins it. MCP Apps: ${uiResourceCatalog().length} display-only cards are served over the MCP door for hosts that support them, nothing that moves money carries one, and the keeper's G2 ruling governs the family. No browser surface can act or spend — the till is the only page code that touches money, and it signs nothing without your wallet's own prompt.`,
    },
    {
      heading: "x402 is the protocol here; UCP, ACP, AP2 and MPP are not",
      body: `Scorecards award a point each for the Universal Commerce Protocol, the Agentic Commerce Protocol and its delegate-payment profile, the Agent Payments Protocol and Tempo's MPP. This store scores nought on all five, for the sentence its catalogue rests on: never claim a protocol you do not speak. Declaring one without implementing it produces exactly the "listed but functionally absent" defect this store sells the detection of — five names in a manifest would make us the first entry in our own corpus. What an observatory can honestly do is watch them: AP2- and ACP-class doors enter the corpus as subjects the day their batteries are written.`,
    },
    {
      heading: "No sandbox, and that is the product",
      body: `Readiness checks look for a test environment and find none, and there is not going to be one. ${base}/try is a live counter: real x402 settlement, real signed artifacts, real chain, from a fraction of a cent. A sandbox is where integrations pass and production is where they fail, and that gap is the single most common thing this store observes in other people's endpoints. A test mode behaving differently from the real door is a second implementation to keep honest, and the first time it drifted, everyone who rehearsed against it rehearsed against fiction. The cheapest door here costs less than the hour it takes to configure a sandbox key.`,
    },
    {
      heading: "No hand-written SDKs in five languages",
      body: `Scorecards award points for published client packages across languages. This store ships none. The surface is plain HTTPS with an OpenAPI contract at ${base}/openapi.json and an MCP server at ${base}/mcp; a generated client in any language is one command from that contract, generated from the document that cannot drift from the code. A hand-maintained SDK in a language nobody here writes is a liability with a version number — it goes stale silently, and it becomes the thing a buyer trusts instead of the contract. What we maintain is the contract, and every door in it is walked by test.`,
    },
    {
      heading: "The MCP card CSP is stricter than the checklist wants",
      body: `A scan grades the MCP App card's Content-Security-Policy on four categories and scores 2 of 4, wanting connect-src to include our MCP origin and img-src and style-src to name specific origins. The card declares \`connect-src 'none'\`, \`form-action 'none'\` and \`img-src 'none'\` — not a narrower allowance but NO allowance, stricter than anything that could score full marks. That is the keeper's G2 ruling made into a fence a host verifies by parsing one tag: the cards are display-only, and a card that could reach the network is a card that could act. \`frame-ancestors\` is absent because CSP Level 3 says it MUST be ignored in a meta element, the only channel an MCP-served resource has.`,
    },
    {
      heading: "One MCP server, with the docs on it",
      body: `The pattern a scan looks for is two MCP servers, one to act and one to answer from the docs, and it reports ours as running both with the documentation one unreachable. There is one server, at ${base}/mcp, and the documentation surface is on it: \`resources/list\` and \`resources/read\` are free on the same door as the tools, so an agent pulls our reference material over the connection it already has. ${base}/mcp.md is a markdown PAGE about which door to use — it answers 200 and does not claim to be a server. Splitting one honest server in two so a checklist counts two would add a moving part whose only function is being counted.`,
    },
    {
      heading: "No AggregateRating, and the refusal is the product",
      body: `Structured-data checks award a point for AggregateRating or Review as social proof an answer engine can quote. This store publishes neither, for its own house sentence: ${NEVER_A_RANKING}. Every verdict it issues is one dated observation that expires and is re-taken, or a derivation that prints its rule and its fraction, and a shop that would not put stars on somebody else's endpoint has no business wearing them. The structured data carries what is checkable instead — Organization, WebSite, Product, Offer, Service, ItemList — and the evidence a rating asks you to take on trust is at ${base}/corpus.json, signed, verifiable offline.`,
    },
    {
      heading: "The agent-auth rows this store cannot score honestly",
      body: `Two checks want doors that do not exist here. One looks for a 401 carrying \`WWW-Authenticate: Bearer resource_metadata=...\`; every path it probes answers 200, because every one is free, and manufacturing a 401 on a public document would be the plainest false claim this store could make. The signpost goes where it IS true: every 402 carries that header pointing at ${base}/.well-known/oauth-protected-resource, which RFC 9110 permits outside a 401, with the scheme token X402 because no bearer token is accepted. The other wants \`register_uri\`, \`claim_uri\` and \`revocation_uri\` to resolve; all three are \`null\`, because no credential is ever issued, and standing up three endpoints that do nothing would be the stale-metadata failure that spec exists to prevent.`,
    },
    {
      heading: "Markdown by Accept, never by user-agent",
      body: `Some scanners check for serving markdown when the user-agent looks like an agent. This store negotiates on Accept instead, parsed properly with q-values, and serves ${base}/index.md, ${base}/pricing.md and a \`.md\` twin of any page that genuinely has one, for callers who would rather guess a path than send a header. The refusal is technical: an Accept header is a client stating what it wants, a user-agent string is us guessing, and guessing wrong serves a browser markdown or a search crawler something it will not index. Deciding by user-agent also obliges \`Vary: User-Agent\`, fragmenting the CDN cache for every human visitor.`,
    },
  ];
}
