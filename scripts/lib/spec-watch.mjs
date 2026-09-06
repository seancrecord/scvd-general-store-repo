/**
 * THE SPEC WATCH — the outside facts this store is built on, and when
 * each was last actually read. (2026-09-06, rule 61.)
 *
 * NOT AN INSTRUMENT. Everything else in scripts/ probes something and
 * reports what came back; this probes nothing. No machine can fetch a
 * specification and tell you whether the paragraph you depend on still
 * says what you think. What it CAN do is keep the clock: name the fact,
 * name the primary source, and say how many days since a person or an
 * agent last opened it. A diary that goes red, not a checker.
 *
 * WHY IT IS WORTH HAVING ANYWAY. The store sells into a market whose
 * conventions turn over in months, and its own code encodes dozens of
 * outside facts — a header name, a default spend cap, an extension
 * identifier, a submission rule. Each was true when it was written.
 * Nothing tells us when one stops being true, and the failure is
 * silent: the code keeps running and the claim keeps being served.
 *
 * THE CLOCK STARTS AT ADOPTION, NOT AT ZERO. A fact never deliberately
 * re-read carries no `reviewed_at` and is reported as such — the
 * register does not pretend it was read. Its due date counts from
 * REGISTER_STARTED, so the watch is honest on day one and goes red
 * ninety days later if nobody has looked. Backdating a read to make a
 * job green would be inventing the record this file exists to keep.
 *
 * ⚑ THE LIST IS THE KEEPER'S. What counts as load-bearing is a
 * judgement, and this is a first draft of it: rows to add, drop or
 * re-price, not a settled register. Each row names what in the tree
 * breaks if the fact moves, so a row nobody can answer that for is a
 * row that should not be here.
 */

/** The day the register opened. Unread facts count their age from here. */
export const REGISTER_STARTED = "2026-09-06";

/** How long any one fact may go unread before the watch goes red. */
export const REVIEW_EVERY_DAYS = 90;

/**
 * One row per outside fact the store encodes. `fact` is the thing that
 * could stop being true; `depends` is what in this tree is wrong the
 * day it does. Sources are primary where one exists.
 */
export const FACTS = Object.freeze([
  {
    id: "mcp-revisions",
    protocol: "MCP",
    fact: "The protocol revisions this server negotiates are current, and no newer revision has landed that callers expect us to speak.",
    source: "https://modelcontextprotocol.io/specification",
    depends: "PROTOCOL_VERSIONS and DEFAULT_PROTOCOL in src/routes/mcp.ts; the versions printed at /.well-known/mcp",
  },
  {
    id: "mcp-tool-annotations",
    protocol: "MCP",
    fact: "readOnlyHint, destructiveHint, idempotentHint and openWorldHint are still the annotation set, with the meanings our justifications assert.",
    source: "https://modelcontextprotocol.io/specification/server/tools",
    depends: "every annotations block in src/lib/mcp-tools.ts, and the tool justifications filed with the ChatGPT plugin",
  },
  {
    id: "mcp-apps-ui",
    protocol: "MCP Apps",
    fact: "The UI extension identifier is io.modelcontextprotocol/ui, the tool pointer is _meta.ui.resourceUri, and the ui/* postMessage handshake is unchanged.",
    source: "https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/",
    depends: "src/lib/mcp-apps.ts, both evidence cards, and the host table at /mcp.md",
  },
  {
    id: "webmcp-api",
    protocol: "WebMCP",
    fact: "The page surface is document.modelContext with registerTool, and the tool descriptor shape is unchanged. navigator.modelContext is the deprecated spelling.",
    source: "https://github.com/webmachinelearning/webmcp",
    depends: "src/routes/webmcp.ts and the declarations served at /webmcp.js",
  },
  {
    id: "webmcp-origin-trial",
    protocol: "WebMCP",
    fact: "The Chrome origin-trial token for this origin is unexpired, and a shipping Chrome still enables the API without one where we assume it does.",
    source: "https://developer.chrome.com/docs/ai/webmcp",
    depends: "the origin-trial meta on every room that declares the browser door; the WebMCP door's own criterion in the six-doors battery",
  },
  {
    id: "x402-wire",
    protocol: "x402",
    fact: "The v2 challenge shape holds: PAYMENT-REQUIRED as base64 JSON, x402Version 2, the accepts entry fields, and payment presented at _meta['x402/payment'] over MCP.",
    source: "https://github.com/coinbase/x402",
    depends: "the whole preflight battery, every 402 the till serves, and lib/mcp-payment.ts",
  },
  {
    id: "x402-client-defaults",
    protocol: "x402",
    fact: "The stock @x402/core selection logic and its $1 default per-payment cap are as check_before_you_pay replays them.",
    source: "https://github.com/coinbase/x402/tree/main/typescript",
    depends: "check_before_you_pay — a reading that models a client version nobody runs any more is a wrong answer delivered confidently",
  },
  {
    id: "offer-receipt",
    protocol: "x402 offer-receipt",
    fact: "The signed offer and receipt schemas, and the extension key they ride under, are unchanged.",
    source: "https://github.com/coinbase/x402",
    depends: "the conformance desk, the published vectors at /.well-known/conformance/offer-receipt-vectors.json, and the defect vocabulary",
  },
  {
    id: "openai-plugins",
    protocol: "Listings",
    fact: "The plugin submission process, the origin-root challenge path, the SSE probe on GET, and the physical-goods-only commerce rule.",
    source: "https://developers.openai.com/plugins/deploy/submission",
    depends: "the listing in review, /.well-known/openai-apps-challenge, and the GET listening channel on /mcp",
    reviewed_at: "2026-09-06",
  },
  {
    id: "claude-connectors",
    protocol: "Listings",
    fact: "Submission runs through a Team or Enterprise organisation's portal, and the review gates are the ones DISTRIBUTION §2 names.",
    source: "https://claude.com/docs/connectors/building/submission",
    depends: "DISTRIBUTION §2 and whether the org is worth opening",
    reviewed_at: "2026-09-06",
  },
  {
    id: "perplexity",
    protocol: "Listings",
    fact: "There is no directory to submit to: custom remote connectors are added by the user, built-in ones are partnerships.",
    source: "https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors",
    depends: "DISTRIBUTION §5, and any install instruction we publish for that client",
    reviewed_at: "2026-09-06",
  },
  {
    id: "aws-ard",
    protocol: "Discovery",
    fact: "AWS Agent Registry is a private per-account catalog with no public listing path, and ARD is the open discovery specification we serve.",
    source: "https://aws.amazon.com/blogs/machine-learning/agentic-resource-discovery-ard-an-open-specification-for-agent-discovery/",
    depends: "/.well-known/ard.json, and the keeper-list row about an AWS entry",
    reviewed_at: "2026-09-06",
  },
  {
    id: "webmcp-directories",
    protocol: "Listings",
    fact: "Which WebMCP directories exist, which list this store, and what each one verifies before listing.",
    source: "https://webmcp.ora.ai/",
    depends: "the WebMCP rows missing from src/store/trust-signals.ts, and any claim about the browser door's reach",
    reviewed_at: "2026-09-06",
  },
  {
    id: "agent-discovery-conventions",
    protocol: "Discovery / AEO",
    fact: "llms.txt, agents.md, the RFC 9727 api-catalog, ai-catalog and the A2A agent card are still the conventions agents look for, in the shapes we serve.",
    source: "https://llmstxt.org/",
    depends: "every well-known document, and rule 61's claim that discovery moves faster than the rails",
  },
]);

export function factById(id) {
  return FACTS.find((entry) => entry.id === id) ?? null;
}

/**
 * One row per fact: when it was last read, from where the clock runs,
 * and how many days are left. `source: "register"` means nobody has
 * deliberately read it since the register opened.
 */
export function readWatch(record, now = new Date(), reviewEveryDays = REVIEW_EVERY_DAYS) {
  const marks = record?.reviewed_at ?? {};
  return FACTS.map((entry) => {
    const seeded = entry.reviewed_at ?? null;
    const marked = marks[entry.id] ?? null;
    const last = marked ?? seeded;
    const from = last ?? REGISTER_STARTED;
    const age = Math.floor((now.getTime() - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    return {
      id: entry.id,
      protocol: entry.protocol,
      fact: entry.fact,
      source: entry.source,
      depends: entry.depends,
      last_read: last ? last.slice(0, 10) : null,
      counted_from: last ? "read" : "register",
      days: age,
      overdue: age >= reviewEveryDays,
    };
  });
}

export function overdue(rows) {
  return rows.filter((row) => row.overdue).sort((a, b) => b.days - a.days);
}
