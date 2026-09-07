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
 *
 * `caveat` is optional and carries what is WRONG OR UNSETTLED about
 * the row itself — a source nobody here has opened, a fact stated two
 * ways by two places, a URL that may already have moved. A register
 * whose own rows are presumed sound is the thing rule 61 warns about,
 * so the doubt travels with the row and prints beside it.
 */
export const FACTS = Object.freeze([
  {
    id: "desvela-registry-watch",
    protocol: "Desvela Registry Watch",
    fact: "Registry Watch signs raw-body HMAC-SHA256 with the per-watch secret, batches changes weekly, and uses the six documented event types and four surface kinds.",
    source: "https://desvela.dev/registry-watch",
    depends: "src/routes/desvela-registry.ts, src/services/desvela-registry.ts and docs/DESVELA_REGISTRY_WATCH.md",
  },
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
    fact: "Which object carries registerTool — document.modelContext or navigator.modelContext — and whether the tool descriptor shape is unchanged. The W3C Web Machine Learning CG draft is the spec of record.",
    source: "https://github.com/webmachinelearning/webmcp",
    depends: "src/routes/webmcp.ts and the declarations served at /webmcp.js",
    caveat: "STATED TWO WAYS AND NOT SETTLED HERE (2026-09-06). This repository has recorded document.modelContext as the surface and navigator.modelContext as deprecated; sources read the same day still show navigator.modelContext.registerTool(), at least in the @mcp-b polyfill. Both can be true at once — a spec that moved and a polyfill that has not — but nobody here has opened the draft to find out, and the answer decides what /webmcp.js should serve. Read this one before touching the browser door.",
  },
  {
    id: "webmcp-origin-trial",
    protocol: "WebMCP",
    fact: "The Chrome origin-trial window (reported as Chrome 149 to 156) and whether our token for this origin outlives it — plus whether a shipping Chrome enables the API without one where we assume it does. Google moved WebMCP to a public origin trial at I/O 2026, which makes Chrome the door's landlord.",
    source: "https://developer.chrome.com/docs/ai/webmcp",
    caveat: "The 149-to-156 window is secondhand (rule 55): developer.chrome.com is egress-blocked from the build sandbox and nobody here has opened it. A trial that ends without the API shipping closes the browser door, so this row is a date, not an opinion.",
    depends: "the origin-trial meta on every room that declares the browser door; the WebMCP door's own criterion in the six-doors battery",
  },
  {
    id: "x402-wire",
    protocol: "x402",
    fact: "The v2 challenge shape holds: PAYMENT-REQUIRED as base64 JSON, x402Version 2, the accepts entry fields, and payment presented at _meta['x402/payment'] over MCP.",
    source: "https://github.com/x402-foundation/x402",
    depends: "the whole preflight battery, every 402 the till serves, and lib/mcp-payment.ts",
    caveat: "THE SPEC MOVED AND THIS ROW WAS WRONG ON ITS FIRST DAY (corrected 2026-09-06). Governance went to the x402 Foundation — announced with Cloudflare 2025-09-23, formalised under the Linux Foundation 2026-04-02 — and coinbase/x402 is now a development fork, not the spec of record. Both x402 rows pointed at the fork. The new URL is itself secondhand; github.com is egress-blocked from here.",
  },
  {
    id: "x402-client-defaults",
    protocol: "x402",
    fact: "The stock @x402/core selection logic and its $1 default per-payment cap are as check_before_you_pay replays them.",
    source: "https://github.com/x402-foundation/x402",
    caveat: "The reference implementations moved with the spec; the client this row models may now live under the foundation rather than in the Coinbase tree this store installed from. Which package a caller actually runs is the fact, not which repository we read.",
    depends: "check_before_you_pay — a reading that models a client version nobody runs any more is a wrong answer delivered confidently",
  },
  {
    id: "offer-receipt",
    protocol: "x402 offer-receipt",
    fact: "The signed offer and receipt schemas, and the extension key they ride under, are unchanged.",
    source: "https://github.com/x402-foundation/x402",
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
    /*
     * SPLIT OUT 2026-09-06, answering this register's own caveat: the
     * A2A specification's URL was written down nowhere in the tree, so
     * the store served an agent card at three paths against a shape it
     * could not cite. It can now, and the card was right all along —
     * the gap was in the record, not the behaviour.
     */
    id: "a2a-agent-card",
    protocol: "A2A",
    fact: "The agent card's shape and its well-known location. A2A was donated to the Linux Foundation by Google in June 2025 for neutral governance and reached v1.0 in 2026; the spec recommends the card at /.well-known/agent-card.json under RFC 8615, which is where this store serves it.",
    source: "https://a2a-protocol.org/",
    depends: "src/services/a2a-evidence.ts, the card at /.well-known/agent-card.json and its aliases, and the read-only tasks that card advertises",
    caveat: "The source is the versionless site on purpose: the specification is versioned (v0.3.0 was current when this was written) and a pinned URL would rot on the next release. The reference repository is github.com/a2aproject/A2A. Secondhand — neither was opened from here.",
  },
  {
    id: "llms-txt",
    protocol: "Discovery / AEO",
    fact: "llms.txt and agents.md are still the conventions a model reaches for first, in the shapes we serve them.",
    source: "https://llmstxt.org/",
    depends: "/llms.txt, /agents.md, the per-area llms files, and every claim that a model can read this store without a crawler",
  },
  {
    id: "well-known-catalogs",
    protocol: "Discovery",
    fact: "The RFC 9727 api-catalog and the ARD document still name records in the shapes those specifications define.",
    source: "https://www.rfc-editor.org/info/rfc9727",
    depends: "/.well-known/api-catalog, /.well-known/ard.json, /.well-known/ai-catalog.json",
    caveat: "TWO SPECIFICATIONS, ONE SOURCE. RFC 9727 has a specification host; ARD's is an AWS blog post, which is where an open specification announced by one vendor starts and not where it should stay. Split this row if ARD gains its own. The A2A half moved out on 2026-09-06, the day its URL was established — this caveat's own first read, answered.",
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
      caveat: entry.caveat ?? null,
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
