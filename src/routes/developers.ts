import { Hono } from "hono";
import { EVIDENCE_TOOLS_SOURCE, EVIDENCE_TOOLS_DESCRIPTION } from "@/store/evidence-tools";
import { DEVELOPER_PACKAGES, PREFLIGHT_LANGUAGE_GUIDES } from "@/store/developer-packages";
import { DISCOVERY_PROTOCOLS, ENDPOINT_INSPECTION_DESCRIPTION } from "@/store/discovery-protocols";
import {
  GLOBAL_PROBES_PER_MINUTE,
  PROBES_PER_MINUTE,
} from "@/services/preflight";
import { MARKDOWN_MEDIA_TYPE, negotiate, VARY_ACCEPT } from "@/lib/accept";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { checkoutMethod, nativeMcpInstruction, type PurchaseCapabilityConfig } from "@/lib/purchase-capabilities";
import { escapeHtml } from "@/lib/sanitize";
import { declinedPositions } from "@/store/copy/declined";
import { mcpResourceCatalog } from "@/lib/mcp-resources";
import { renderSimplePage } from "@/pages/simple-page";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { STORE_CONTACT_EMAIL, STORE_SERVICE_NAME } from "@/store";
import { SUNSET_NOTICE_DAYS } from "@/store/api-lifecycle";
import {
  CLI_COMMANDS,
  CLI_BIN,
  CLI_INSTALL,
  CLI_PACKAGE,
  CLI_PUBLISHED,
  CLI_REGISTRY_URL,
  CLI_RUN_FROM_SOURCE,
  CLI_SOURCE_URL,
} from "@/store/cli";
import type { HonoEnv } from "@/types";

/**
 * GET /developers — the one page that answers "how do I build against
 * this", with /docs and /api as the two paths people actually type.
 *
 * WHY IT DID NOT EXIST UNTIL 2026-08-21. Every fact on this page was
 * already published: the contract at /openapi.json, the manual at
 * /agents.md, the briefing at /llms.txt, the MCP server at /mcp, the
 * criteria at /api/preflight/v1. What was missing was the ADDRESS. A
 * readiness audit searched for this store's developer resources by
 * name and found nothing relevant, then probed /developers, /docs and
 * /api and got three 404s — so a developer arriving with the habit
 * every other API taught them hit a wall in front of a library.
 *
 * This page invents nothing. It is an index with the store's name in
 * the title and heading, at the paths a stranger guesses first.
 *
 * NO KEYS, NO ACCOUNTS, AND THAT IS THE INTERESTING PART. The usual
 * developer portal exists to issue credentials. This one exists to
 * explain that there is nothing to issue: free shelves are open, paid
 * ones take a signed x402 payment per request, and the store never
 * holds an account, a key, or a card. A portal that offered a signup
 * form here would be describing a different store.
 */
export const developerRoutes = new Hono<HonoEnv>();

interface Entry {
  href: string;
  label: string;
  what: string;
}

function mcpDescription(config?: PurchaseCapabilityConfig): string {
  return `Streamable HTTP MCP. tools/list and endpoint inspection are free; buy_* tools accept the offered x402 terms. ${nativeMcpInstruction(config)} ${mcpResourceCatalog().length} resources are readable without payment. The two free evidence instruments carry _meta.ui.resourceUri, so a host with the MCP Apps extension renders the reading as a card — gaps at the same weight as findings. Nothing paid carries one, by construction and by test.`;
}

function surfaces(base: string, config?: PurchaseCapabilityConfig): Array<{ heading: string; entries: Entry[] }> {
  return [
    {
      heading: "SCVD libraries and SDKs — source versions; check npm before installing",
      entries: [...DEVELOPER_PACKAGES, ...PREFLIGHT_LANGUAGE_GUIDES],
    },
    {
      heading: "Protocols and their scope",
      entries: DISCOVERY_PROTOCOLS.filter(p => ['x402', 'mpp', 'mcp', 'webmcp', 'a2a', 'ucp'].includes(p.id))
        .map(p => ({ href: `${base}${p.id === "mcp" ? "/mcp.md" : p.path}`, label: p.label, what: p.scope })),
    },
    {
      heading: "Start here",
      entries: [
        {
          href: `${base}/llms.txt`,
          label: "/llms.txt",
          what: "The full briefing: what this store is, what it sells, and what it refuses to claim. Read this before writing any code against it.",
        },
        {
          href: `${base}/agents.md`,
          label: "/agents.md",
          what: "The operational manual — the x402 purchase flow step by step, for an agent executing rather than evaluating.",
        },
        {
          href: `${base}/openapi.json`,
          label: "/openapi.json",
          what: "OpenAPI 3.1 for every endpoint: unique operationIds, typed parameters, typed error responses, and the x402 terms on every paid operation.",
        },
        {
          href: `${base}/openapi-tools.json`,
          label: "/openapi-tools.json",
          what: "The free instruments as function-calling tool definitions; calls may update usage counters, one worked call each, derived from the same catalog the MCP door serves. For wrapping them in your own agent without reading the whole contract.",
        },
      ],
    },
    {
      heading: "Free, no payment, no account",
      entries: [
        {
          href: `${base}/api/preflight/${PREFLIGHT_VERSION}`,
          label: `POST /api/preflight/${PREFLIGHT_VERSION}`,
          what: ENDPOINT_INSPECTION_DESCRIPTION,
        },
        {
          href: `${base}/api/conformance/v1`,
          label: "POST /api/conformance/v1",
          what: "A conformance verdict on any x402 signed offer or receipt, whoever issued it.",
        },
        {
          href: `${base}/fresh-set`,
          label: "GET /fresh-set",
          what: "This week's x402 doors that answered a conformant challenge, with rails and cheapest ask per host. Routing data, CC BY 4.0.",
        },
        {
          href: `${base}/defects.json`,
          label: "GET /defects.json",
          what: "Stable names for the ways an x402 endpoint can be broken — what each asserts, what falsifies a finding, and whether an unpaid probe can see it at all. CC BY 4.0.",
        },
        {
          href: `${base}/okf/index.md`,
          label: "GET /okf/index.md",
          what: "The same evidence as an Open Knowledge Format v0.2 bundle — markdown concepts with YAML frontmatter, cross-linked, machine-confirmed and dated.",
        },
        {
          href: `${base}/corpus/index.json`,
          label: "GET /corpus/index.json",
          what: "Compact paginated snapshot metadata. Follow next; fetch and verify each snapshot separately. No embedded newest snapshot.",
        },
        {
          href: `${base}/corpus.json`,
          label: "GET /corpus.json",
          what: "The weekly signed census of the public x402 web, as a dataset.",
        },
        {
          href: `${base}/corpus/brief`,
          label: "The Week's Doors",
          what: "The existing weekly corpus digest: observed coverage, named defects and gaps, with links to the underlying evidence.",
        },
        {
          href: `${base}/corpus/trajectory.json`,
          label: "GET /corpus/trajectory.json",
          what: "The chain read as time: one point per signed week — counts with denominators, every point naming the snapshot digest it derives from. Re-derivable from the entries with your own tools.",
        },
        {
          href: `${base}/corpus/diff.json`,
          label: "GET /corpus/diff.json?since={week}",
          what: "What changed since a signed week you already saw: doors appeared and disappeared, verdict transitions, drift in a door's own declared terms. The cheapest honest agent loop is polling this.",
        },
        {
          href: `${base}/corpus/wallet-facts.json`,
          label: "GET /corpus/wallet-facts.json",
          what: "How many receiving addresses this week's doors advertised and how many receive at more than one door — counts with denominators, no names, no addresses, never an operator claim.",
        },
        {
          href: `${base}/api/standing-note`,
          label: "GET|POST /api/standing-note",
          what: "Attach your own dated statement to a door or wallet this store has observed — prove control (wallet signature or well-known file) and your words ride beside the observation, never replacing it.",
        },
        {
          href: `${base}/api/verify/{id}`,
          label: "GET /api/verify/{id}",
          what: "Verify anything this store ever signed. No account, no wallet, free forever — including artifacts you did not buy.",
        },
      ],
    },
    {
      heading: "Reselling the shelf: the trade counter",
      entries: [
        {
          href: `${base}/trade`,
          label: "/trade",
          what: "For marketplaces, aggregators and payment layers: your customer pays you, you send one HMAC-signed webhook, we deliver the same signed goods the front door sells and bill your account on a statement. Prices by a published rule, receivable public, no x402 in your customer's path.",
        },
        {
          href: `${base}/api/trade/sandbox/check`,
          label: "POST /api/trade/sandbox/check",
          what: "The check desk on the sandbox account, whose secret is published: send the headers and body you would send to the order door and get every one of the four signature checks reported by name, plus the signature we expected. Nothing delivered, nothing consumed.",
        },
        {
          href: `${base}/api/trade/contract`,
          label: "GET /api/trade/contract",
          what: "The contract: the door, the signing dialects, the pricing rule with every trade price derived from the live menu, every open account's row, every refusal by name.",
        },
        {
          href: `${base}/api/trade/catalog`,
          label: "GET /api/trade/catalog",
          what: "A listing feed: every item at the counter with its copy, specimen, artifact class and price at your share, derived from the same rows our own shelf renders.",
        },
      ],
    },
    {
      heading: "Connect over MCP",
      entries: [
        {
          href: `${base}/mcp.md`,
          label: "/mcp.md",
          what: "WHICH DOOR TO USE, and what each one cannot do: remote MCP, local stdio, the browser (WebMCP), or none at all. Carries the rendering gap as a dated observation — which hosts render the evidence cards and which return the same JSON they always did — and an honest list of what is not built. Start here if you are choosing.",
        },
        {
          href: `${base}/.well-known/mcp`,
          label: "/.well-known/mcp",
          what: "Where the MCP server is and what it serves.",
        },
        {
          href: `${base}/mcp`,
          label: "POST /mcp",
          what: mcpDescription(config),
        },
        {
          href: `${base}/webmcp.js`,
          label: "GET /webmcp.js",
          what: "The browser door. Loaded by the storefront, it registers the free instruments on document.modelContext for an agent living in the visitor's browser — no connection to configure, no key, no directory: discovery is arrival. The instrument set derives from the MCP catalog, including metered verification calls. Visitor-entry and paid MCP tools are excluded; payment uses the separate buyer-authorized bridge. A browser without the API loads a no-op.",
        },
      ],
    },
    {
      heading: "On the command line",
      entries: [
        { href: EVIDENCE_TOOLS_SOURCE, label: "Portable evidence — export and offline verification", what: EVIDENCE_TOOLS_DESCRIPTION },
        {
          /**
           * THE LINK THAT WORKS TODAY, WHICHEVER DAY IT IS.
           *
           * Before the publish this pointed at the source, because an
           * npmjs.com link to a package that 404s, in the middle of a
           * page whose whole job is being trusted, is the exact
           * species of claim /corrections exists to catch. The keeper
           * published on 2026-08-28, so it points at the registry now
           * — and it moved by reading CLI_PUBLISHED rather than by
           * anyone remembering this line existed, which is the whole
           * reason these constants are constants.
           */
          href: CLI_PUBLISHED ? CLI_REGISTRY_URL : CLI_SOURCE_URL,
          label: `${CLI_BIN} — the official CLI`,
          what: `\`${CLI_BIN} preflight <url>\` checks any x402 door, \`${CLI_BIN} conformance <file>\` reads any issuer's signed offer or receipt, \`${CLI_BIN} verify <id>\` verifies anything this store ever signed, and \`${CLI_BIN} catalog\` walks the API catalog. Zero dependencies, MIT, no account and no key — and it holds no key either, so it cannot spend money. \`--json\` prints this store's own response verbatim. ${
            CLI_PUBLISHED
              ? `Install it with \`${CLI_INSTALL}\`. The package is \`${CLI_PACKAGE}\` and the command is \`${CLI_BIN}\`: npm's typosquat guard refuses the bare name, and it polices package names rather than commands. Or skip the install — the whole tool is one file: \`${CLI_RUN_FROM_SOURCE}\`.`
              : `NOT ON npm YET: the package is \`${CLI_PACKAGE}\` (npm refused the bare name \`${CLI_BIN}\` as too close to scss/save/send — the command is still \`${CLI_BIN}\`) and the install will be \`${CLI_INSTALL}\`, but publishing is the keeper's hand and has not run. Until it does, the whole tool is one file in the repo: clone and run \`${CLI_RUN_FROM_SOURCE}\`.`
          }`,
        },
        {
          href: "https://www.npmjs.com/package/scvd-tab",
          label: "npm i -g scvd-tab",
          what: "The tab: a local, append-only ledger of what your agent spent and what it got, with a pooled corpus you can contribute to. Two binaries — `scvd-tab` and `scvd-tab-pager`. MIT, zero required config, and it works against any x402 store, not only this one.",
        },
      ],
    },
    {
      heading: "Fixed paths a machine can know without guessing",
      entries: [
        {
          href: `${base}/.well-known/api-catalog`,
          label: "/.well-known/api-catalog",
          what: "RFC 9727. Every API surface at this origin as an RFC 9264 linkset — the HTTP API, the MCP server, each versioned free instrument, the CLI — with the contract, documentation, metadata and status links for each. This page answers a person who guesses a URL; that document answers a scanner, which never guesses.",
        },
        {
          href: `${base}/deprecation`,
          label: "/deprecation",
          what: "The versioning and deprecation policy, with a live table of every version served: status, start date, announced sunset. Nothing is deprecated today and the table says so rather than leaving it to be inferred.",
        },
      ],
    },
  ];
}

/** The three questions a developer portal exists to answer. */
function conventions(base: string, config?: PurchaseCapabilityConfig): Array<{ q: string; a: string }> {
  return [
    {
      q: "Authentication",
      a: `No account or API key is issued. Free tools need no payment. Paid requests use ${checkoutMethod(config)}. Read the current quote and payment_capabilities before signing; payment is per request. Native MPP challenges and x402 terms have different retry formats. The operational instructions are at ${base}/auth.md and ${base}/agents.md; the service's authorization description is at ${base}/.well-known/oauth-protected-resource.`,
    },
    {
      q: "Errors",
      a: "4xx and 5xx return an RFC 9457 problem object (application/problem+json): type, title, status, detail, instance. The store's long-standing human-readable `error` field rides beside them and is always present, so nothing that reads it breaks.",
    },
    {
      q: "Rate limits",
      a: `Free preflight allows ${PROBES_PER_MINUTE} probes per isolate per minute, with a global backstop of ${GLOBAL_PROBES_PER_MINUTE} per minute. Metered answers (200 and 429) carry RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset for the nearer ceiling; RateLimit and RateLimit-Policy name both buckets. Validation refusals (400) spend no probe and carry no limiter fields. The global counter uses eventually consistent storage, so its remaining count can read high under load. A limit refusal returns 429 with Retry-After; it describes our probe budget, not the target endpoint. Other routes enforce their own limits, including the mailbox's daily allowance, and the edge can also refuse abusive traffic. Read the affected route's response before retrying.`,
    },
    {
      q: "Versioning and deprecation",
      a: `Breaking changes arrive as a new version in the URL path (/api/preflight/v1 → /v2). Within a published version, fields are added and never removed or retyped. A version being retired serves RFC 8594 Deprecation and Sunset headers on every response for at least ${SUNSET_NOTICE_DAYS} days first, and the date is published before the headers appear. Nothing is deprecated today. The whole policy, and a live table of every version served with its status and sunset date, is at ${base}/deprecation — the routes read that same table before deciding whether to emit the headers, so the page cannot promise a window the wire does not honour.`,
    },
    {
      q: "Content negotiation",
      a: `Send Accept: text/markdown and the agent-facing surfaces answer in markdown, including ${base}/ itself. Responses carry Vary: Accept, Accept-Encoding, User-Agent so a cache keeps the variants apart. Accept is parsed by q-value, not substring-matched. For callers that would rather guess a path than send a header, ${base}/index.md and ${base}/pricing.md serve the same bytes their negotiated originals do, with a canonical link back. An explicit supported Accept preference takes precedence. Without a format preference, recognized agent readers may receive Markdown; ordinary search crawlers receive HTML.`,
    },
  ];
}

function developersMarkdown(base: string, config?: PurchaseCapabilityConfig): string {
  const sections = surfaces(base, config)
    .map(
      (section) =>
        `## ${section.heading}\n\n${section.entries
          .map((entry) => `- \`${entry.label}\` — ${entry.what}\n  ${entry.href}`)
          .join("\n")}`,
    )
    .join("\n\n");
  const rules = conventions(base, config)
    .map((row) => `### ${row.q}\n\n${row.a}`)
    .join("\n\n");
  return `# ${STORE_SERVICE_NAME} — developer documentation

> Build against ${base}. No account, no API key, no SDK required.
> Free endpoints are plain HTTPS; paid ones take one signed payment
> per request: ${checkoutMethod(config)}.

${sections}

## Conventions

${rules}

## What we don't do, on purpose

${declinedPositions(base)
  .map((position) => `### ${position.heading}\n\n${position.body}`)
  .join("\n\n")}

## Contact

A person reads this address: ${STORE_CONTACT_EMAIL}
`;
}

function developersHtml(base: string, config?: PurchaseCapabilityConfig): string {
  const sections = surfaces(base, config)
    .map(
      (section) => `
      <h2>${escapeHtml(section.heading)}</h2>
      <ul class="dev-list">
        ${section.entries
          .map(
            (entry) => `<li>
          <a href="${escapeHtml(entry.href)}"><code>${escapeHtml(entry.label)}</code></a>
          <span class="dev-what">${escapeHtml(entry.what)}</span>
        </li>`,
          )
          .join("")}
      </ul>`,
    )
    .join("");
  const rules = conventions(base, config)
    .map(
      (row) =>
        `<h3>${escapeHtml(row.q)}</h3><p>${escapeHtml(row.a)}</p>`,
    )
    .join("");
  /*
   * NO <h1> HERE. renderSimplePage already emits one from the title
   * this route passes it, and this body carried a second — the only
   * room in the store with two, found 2026-08-30 by measuring rule
   * 58.1 across all 35. Two h1s is not a style quibble on a page
   * whose whole job is being found: it splits the document outline a
   * search engine builds, and this is the room a readiness audit
   * already reported as missing once.
   */
  return `
    <p class="lede">Build against <code>${escapeHtml(base)}</code>. No account,
    no API key, no SDK. Free endpoints are plain HTTPS; paid ones take one signed
    payment per request: ${escapeHtml(checkoutMethod(config))}.</p>
    ${sections}
    <h2>Conventions</h2>
    ${rules}
    <h2>What we don't do, on purpose</h2>
    ${declinedPositions(base)
      .map(
        (position) =>
          `<h3>${escapeHtml(position.heading)}</h3><p>${escapeHtml(position.body)}</p>`,
      )
      .join("")}
    <h2>Contact</h2>
    <p>A person reads this address:
      <a href="mailto:${escapeHtml(STORE_CONTACT_EMAIL)}">${escapeHtml(STORE_CONTACT_EMAIL)}</a>.</p>
    ${jsonLdScript({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      name: `${STORE_SERVICE_NAME} — developer documentation`,
      headline: `${STORE_SERVICE_NAME} — developer documentation`,
      description: DESCRIPTION,
      url: `${base}/developers`,
      author: organizationRef(base),
    })}
    ${jsonLdScript({
      /*
       * THE TOOLS, AS THE TYPE ENGINES LIFT FOR "is there a tool that"
       * (2026-09-03, PR 3): the MCP server, the CLI and the two npm
       * packages, each a SoftwareApplication with where to get it and
       * what it costs. The names come from the same constants the
       * guides print.
       */
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          name: `${STORE_SERVICE_NAME} MCP server`,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          url: `${base}/mcp`,
          description: mcpDescription(config),
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: organizationRef(base),
        },
        {
          "@type": "SoftwareApplication",
          name: CLI_PACKAGE,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          downloadUrl: CLI_REGISTRY_URL,
          installUrl: CLI_REGISTRY_URL,
          codeRepository: CLI_SOURCE_URL,
          description:
            "The command line for scvd.store: preflight any x402 door, verify any issuer's signed offer or receipt, read the weekly corpus and the fresh set, and verify anything the store ever signed. Zero dependencies, no account, no key.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: organizationRef(base),
        },
        {
          "@type": "SoftwareApplication",
          name: "x402-verify",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          downloadUrl: "https://www.npmjs.com/package/x402-verify",
          description:
            "Zero-dependency verifier for x402 Signed Offers and Receipts: JWS (EdDSA/Ed25519), did:web resolution, schema conformance, and externally anchored key history. Works on any issuer's artifacts.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: organizationRef(base),
        },
        {
          "@type": "SoftwareApplication",
          name: "x402-sign",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          downloadUrl: "https://www.npmjs.com/package/x402-sign",
          description:
            "Zero-dependency signer for x402 Signed Offers and Receipts: mint spec-conformant JWS offers (EdDSA/Ed25519) for your 402s and generate your did:web document. The issuing half of x402-verify.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: organizationRef(base),
        },
      ],
    })}`;
}

const DEV_CSS = `
.dev-list { list-style: none; padding-left: 0; }
.dev-list li { margin-bottom: 0.9em; }
.dev-list code { font-weight: 700; }
.dev-what { display: block; font-size: 0.95em; opacity: 0.85; margin-top: 0.15em; }
.lede { font-size: 1.05em; }
`;

const DESCRIPTION =
  "Developer documentation for scvd.store: free x402/MPP inspection, signed-artifact verification, checkout capabilities, MCP and WebMCP tools, A2A and UCP profiles, errors and rate limits. No account or API key required.";

/**
 * THREE PATHS, ONE PAGE. /developers is the canonical one; /docs and
 * /api are what people type. Redirecting would cost a round trip and
 * hide the apex from anything that does not follow 301s, so all three
 * serve, and the canonical link tells a crawler which is which.
 */
for (const path of ["/developers", "/docs", "/api"] as const) {
  developerRoutes.get(path, (c) => {
    const base = c.env.STORE_BASE_URL;
    c.header("Vary", VARY_ACCEPT);
    c.header(
      "Link",
      [
        `<${base}/developers>; rel="canonical"`,
        // RFC 9727 §4: the link relation that points a client from any
        // API-ish resource to the catalog of the whole API surface.
        `<${base}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
      ].join(", "),
    );
    /**
     * HTML IS THE DEFAULT HERE, AND IT WAS NOT UNTIL 2026-08-26.
     *
     * The route decided its representation with `wantsHtml`, which
     * asks whether the Accept header CONTAINS "text/html" — the
     * store's own accept.ts opens by naming that as the convention's
     * one famous mistake, and this route made it. `Accept: * / *` is
     * not a request for JSON; it is a client with no preference, and
     * a client with no preference asking a DOCUMENTATION page should
     * be handed the documentation.
     *
     * It matters because of who sends it. curl sends `* / *`. So does
     * most of what crawls a site to find out whether its developer
     * docs exist. A readiness audit found the link from the homepage,
     * followed it, got 6KB of JSON where a page should have been, and
     * reported /developers as "thin or unreachable" — which, in the
     * dialect it asked in, it was.
     *
     * So the whole decision is one `negotiate` call, listed in the
     * store's own preference order. An explicit `Accept:
     * application/json` still gets exactly the JSON it always got;
     * nothing that stated what it wanted sees any change at all.
     */
    const representation = negotiate(c.req.header("Accept"), [
      "text/html",
      "application/json",
      "text/markdown",
    ]);
    if (representation === "text/markdown") {
      return c.text(developersMarkdown(base, c.env), 200, {
        "content-type": MARKDOWN_MEDIA_TYPE,
        Vary: VARY_ACCEPT,
      });
    }
    if (representation === "application/json") {
      return c.json({
        name: `${STORE_SERVICE_NAME} — developer documentation`,
        description: DESCRIPTION,
        authentication: conventions(base, c.env)[0]!.a,
        openapi: `${base}/openapi.json`,
        guide: `${base}/llms.txt`,
        manual: `${base}/agents.md`,
        mcp: `${base}/.well-known/mcp`,
        api_catalog: `${base}/.well-known/api-catalog`,
        deprecation_policy: `${base}/deprecation`,
        cli: {
          npm: CLI_PACKAGE,
          /**
           * FALSE UNTIL THE KEEPER RUNS `npm publish`, and stated as a
           * boolean rather than left to be inferred from a link: an
           * agent reading this field decides whether to try an
           * install, and "we intend to" and "you can" are different
           * answers to that question.
           */
          published: CLI_PUBLISHED,
          install: CLI_INSTALL,
          install_available: CLI_PUBLISHED,
          source: CLI_SOURCE_URL,
          run_from_source: CLI_RUN_FROM_SOURCE,
          bin: [CLI_BIN],
          license: "MIT",
          registry: CLI_REGISTRY_URL,
          commands: [...CLI_COMMANDS],
          note: `Zero dependencies. Holds no key and cannot spend money; --json prints the store's own response verbatim. ${
            CLI_PUBLISHED
              ? `On npm as ${CLI_PACKAGE}, installing the ${CLI_BIN} command; it also runs straight from the source with no install at all.`
              : "The npm publish is the keeper's hand and has not run — until it does, run it from the source."
          }`,
          also: {
            npm: "scvd-tab",
            install: "npm i -g scvd-tab",
            bin: ["scvd-tab", "scvd-tab-pager"],
            license: "MIT",
            registry: "https://www.npmjs.com/package/scvd-tab",
            note: "The tab: a local ledger of what your agent spent. Works against any x402 store, not only this one.",
          },
        },
        sections: surfaces(base, c.env),
        conventions: conventions(base, c.env),
        // The gaps beside the findings, same as /corrections: a
        // scanner recommendation declined is a decision, and
        // decisions publish with their reasons (P12).
        declined_on_purpose: declinedPositions(base),
        contact: STORE_CONTACT_EMAIL,
      });
    }
    return c.html(
      renderSimplePage({
        title: `${STORE_SERVICE_NAME} developer documentation`,
        description: DESCRIPTION,
        path: "/developers",
        bodyHtml: `<p><a href="/bot-auth">Agent calling-card setup</a>: local public-profile import, a Node fetch integration, and the optional signed directory record.</p><p><a href="/a2a-desk">A2A checks and repair kits</a>: free card checks, authorized runtime tests and signed reports.</p>` + developersHtml(base, c.env),
        extraCss: DEV_CSS,
      }),
    );
  });
}
