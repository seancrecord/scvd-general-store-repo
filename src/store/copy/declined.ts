import { webmcpTools } from "@/routes/webmcp";
import { uiResourceCatalog } from "@/lib/mcp-apps";
import { CONTENT_SIGNAL } from "@/routes/site-meta";

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
      body: `WebMCP is live: ${base}/webmcp.js registers ${browserTools.length} free, read-only tools (${browserTools.join(", ")}) on document.modelContext for agents resident in the visitor's browser. The set derives from the MCP catalog's read-only tools, so nothing that writes and nothing that can take money can appear there — a test pins it. MCP Apps: ${uiResourceCatalog().length} display-only cards (the preflight and verify readings) are served over the MCP door for hosts that support them; nothing that moves money carries a card, a test pins that too, and the keeper's G2 ruling governs the family. What is deliberately NOT here: no browser surface can act or spend — the till is the only page code that touches money, and it signs nothing without your wallet's own prompt.`,
    },
    {
      heading: "x402 is the protocol here; UCP, ACP, AP2 and MPP are not",
      body: `Agentic-commerce scorecards award points for each of the Universal Commerce Protocol, the Agentic Commerce Protocol and its delegate-payment profile, the Agent Payments Protocol and Tempo's MPP. This store scores nought on all five and the reason is the same sentence its whole catalogue rests on: never claim a protocol you do not speak. Each of those is a real specification with real settlement obligations, and declaring support without implementing it produces exactly the "listed but functionally absent" defect this store sells the detection of — an endpoint advertised in a directory that does not answer the way the directory says it will. Scoring five checklist rows by writing five names into a manifest would make us the first entry in our own corpus. What this store DOES do with them is the honest thing available to an observatory: it watches them. AP2- and ACP-class doors enter the evidence corpus as subjects the day their batteries are written, exactly as x402 doors do, and being cross-protocol by design means the observation layer is ready for them — not that the till is.`,
    },
    {
      heading: "No sandbox, and that is the product",
      body: `Readiness checks look for a test environment and find none. There is not going to be one. ${base}/try is a live counter: real x402 settlement, real signed artifacts, real chain, from a fraction of a cent — because a sandbox is where integrations pass and production is where they fail, and the gap between the two is the single most common thing this store observes in other people's endpoints. A test mode that behaved differently from the real door would be a second implementation to keep honest, and the first time it drifted, every buyer who rehearsed against it would have rehearsed against fiction. The cheapest door on the shelf costs less than the engineering hour it takes to configure a sandbox key.`,
    },
    {
      heading: "No hand-written SDKs in five languages",
      body: `Scorecards award points for published client packages across languages. This store ships none and does not intend to. The surface is plain HTTPS with an OpenAPI contract at ${base}/openapi.json and an MCP server at ${base}/mcp; a generated client in any language is one command away from that contract, and it is generated from the document that cannot drift from the code. A hand-maintained SDK in a language nobody at this store writes is a liability with a version number: it goes stale silently, it is the thing a buyer trusts instead of the contract, and there is one person here. What we do maintain is the contract itself, and every door in it is walked by test.`,
    },
    {
      heading: "No AggregateRating, and the refusal is the product",
      body: `Structured-data checks award a point for AggregateRating or Review in the JSON-LD, as social proof an answer engine can quote. This store publishes neither and the reason is the first sentence of its own position: nothing here is a score, a rating, or a ranking. Every verdict this shop issues is one dated observation that expires and is re-taken, and a store that would not put a star rating on somebody else's endpoint has no business wearing one itself. The structured data instead carries what is checkable — Organization, WebSite, Product, Offer, ItemList, MerchantReturnPolicy — and the evidence a reader would otherwise have to take a rating's word for is at ${base}/corpus.json, signed, where anyone can verify it offline without asking us.`,
    },
    {
      heading: "No 401 from a store with nothing to authenticate",
      body: `Agent-auth checks look for a 401 carrying \`WWW-Authenticate: Bearer resource_metadata=...\` on an API entry point, and probe /api, /v1, /mcp and /openapi.json for it. Every one of those answers 200 here, because every one of them is free — and manufacturing a 401 on a public document to satisfy a probe would be the plainest false claim this store could make about itself. What it does instead is the same signpost at the moment it is actually true: every 402 challenge carries a \`WWW-Authenticate\` header pointing at ${base}/.well-known/oauth-protected-resource, which RFC 9110 §11.6.1 expressly permits outside a 401 for exactly this case. The scheme token is X402 rather than Bearer, because no bearer token is accepted and naming one would send an agent looking for a credential that does not exist.`,
    },
    {
      heading: "The register, claim and revoke endpoints are null on purpose",
      body: `The auth.md convention asks for \`register_uri\`, \`claim_uri\` and \`revocation_uri\`, and scores an endpoint that resolves. All three are \`null\` in this store's \`agent_auth\` block and will stay null while the store works the way it does: no credential is ever issued to anybody, so there is nothing to register for, nothing to claim, and nothing to revoke. The spec's own reachability rule is the argument for the absence rather than against it — it exists because a discovery URI that resolves to nothing sends agents to doors that are not there, and inventing three of them to score two points would be that failure, committed deliberately, by a shop whose product is detecting it in other people's endpoints. \`identity_types_supported\` says \`anonymous\` for the same reason: it is the accurate entry from the spec's own enum, not a gap.`,
    },
    {
      heading: "Markdown by Accept, never by user-agent",
      body: `The convention some scanners check for is serving markdown when the user-agent looks like an agent. This store negotiates on Accept instead, parsed properly with q-values (${base}/index.md and ${base}/pricing.md exist for callers that would rather guess a path than send a header). The refusal is technical, not philosophical: an Accept header is a client stating what it wants, a user-agent string is us guessing, and guessing wrong serves a browser markdown or serves a search crawler something it will not index. Worse, deciding by user-agent obliges Vary: User-Agent, which fragments the CDN cache for every human visitor to serve a dialect the caller could have asked for outright.`,
    },
  ];
}
