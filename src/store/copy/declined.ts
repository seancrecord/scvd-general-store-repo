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
 *
 * ⚑ KEEPER REVIEW: new public prose, drafted not canon; recut freely
 * (rule 7). The FACTS in each entry are derived or register-bound;
 * the sentences are mine until they are yours.
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
  ];
}
