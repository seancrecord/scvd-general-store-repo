import { Hono } from "hono";
import {
  GLOBAL_PROBES_PER_MINUTE,
  PROBES_PER_MINUTE,
} from "@/services/preflight";
import { MARKDOWN_MEDIA_TYPE, prefersMarkdown, VARY_ACCEPT } from "@/lib/accept";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { mcpResourceCatalog } from "@/lib/mcp-resources";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { PREFLIGHT_VERSION } from "@/services/preflight";
import { STORE_CONTACT_EMAIL, STORE_SERVICE_NAME } from "@/store";
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

function surfaces(base: string): Array<{ heading: string; entries: Entry[] }> {
  return [
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
      ],
    },
    {
      heading: "Free, no payment, no account",
      entries: [
        {
          href: `${base}/api/preflight/${PREFLIGHT_VERSION}`,
          label: `POST /api/preflight/${PREFLIGHT_VERSION}`,
          what: "Check whether any x402 endpoint answers a well-formed payment challenge. Send {\"url\": \"...\"}; get back a named-check verdict. The published criteria are at the same path over GET.",
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
          href: `${base}/corpus.json`,
          label: "GET /corpus.json",
          what: "The weekly signed census of the public x402 web, as a dataset.",
        },
        {
          href: `${base}/api/verify/{id}`,
          label: "GET /api/verify/{id}",
          what: "Verify anything this store ever signed. No account, no wallet, free forever — including artifacts you did not buy.",
        },
      ],
    },
    {
      heading: "Connect over MCP",
      entries: [
        {
          href: `${base}/.well-known/mcp`,
          label: "/.well-known/mcp",
          what: "Where the MCP server is and what it serves.",
        },
        {
          href: `${base}/mcp`,
          label: "POST /mcp",
          what: `Streamable HTTP MCP. tools/list is free; buy_* tools are x402-paid. ${mcpResourceCatalog().length} resources are readable without payment.`,
        },
      ],
    },
    {
      heading: "On the command line",
      entries: [
        {
          href: "https://www.npmjs.com/package/scvd-tab",
          label: "npm i -g scvd-tab",
          what: "The tab: a local, append-only ledger of what your agent spent and what it got, with a pooled corpus you can contribute to. Two binaries — `scvd-tab` and `scvd-tab-pager`. MIT, zero required config, and it works against any x402 store, not only this one.",
        },
      ],
    },
  ];
}

/** The three questions a developer portal exists to answer. */
function conventions(base: string): Array<{ q: string; a: string }> {
  return [
    {
      q: "Authentication",
      a: "There is none, and there is nothing to sign up for. Free shelves are open to anyone. Paid endpoints answer HTTP 402 with x402 v2 terms in the PAYMENT-REQUIRED header (base64 JSON); you sign one of the offered accepts and retry with the payment. Payment is per request and settles wallet-to-wallet — this store never holds your funds, issues a key, or keeps an account.",
    },
    {
      q: "Errors",
      a: "4xx and 5xx return an RFC 9457 problem object (application/problem+json): type, title, status, detail, instance. The store's long-standing human-readable `error` field rides beside them and is always present, so nothing that reads it breaks.",
    },
    {
      q: "Rate limits",
      a: `One path is limited and the rest are not. The free preflight at /api/preflight/v2 spends outbound requests to a host you choose, so it carries ${PROBES_PER_MINUTE} probes per isolate per minute and a global backstop of ${GLOBAL_PROBES_PER_MINUTE} per minute; past either you get a 429 with Retry-After, and the body says plainly that the budget is our cost bound and not a fact about your endpoint. Nothing else here has an application-level ceiling, and so returns no RateLimit-Limit/-Remaining/-Reset headers — a ceiling nothing enforces is worse than no ceiling, because you would throttle against a fiction. A 429 can also arrive from the edge under abuse conditions. A refused request is never charged for. THESE TWO NUMBERS ARE READ FROM THE LIMITER ITSELF: this sentence said "there is no application-level rate limit" for a day after one shipped, which is exactly what a hand-typed claim does.`,
    },
    {
      q: "Versioning and deprecation",
      a: "Breaking changes arrive as a new version in the URL path (/api/preflight/v1 → /v2). Within a published version, fields are added and never removed or retyped. A version being retired serves RFC 8594 Deprecation and Sunset headers on every response for at least 90 days first, and the date is published here before the headers appear. Nothing is deprecated today.",
    },
    {
      q: "Content negotiation",
      a: `Send Accept: text/markdown and the agent-facing surfaces answer in markdown, including ${base}/ itself. Responses carry Vary: Accept so a cache keeps the variants apart. Accept is parsed by q-value, not substring-matched.`,
    },
  ];
}

function developersMarkdown(base: string): string {
  const sections = surfaces(base)
    .map(
      (section) =>
        `## ${section.heading}\n\n${section.entries
          .map((entry) => `- \`${entry.label}\` — ${entry.what}\n  ${entry.href}`)
          .join("\n")}`,
    )
    .join("\n\n");
  const rules = conventions(base)
    .map((row) => `### ${row.q}\n\n${row.a}`)
    .join("\n\n");
  return `# ${STORE_SERVICE_NAME} — developer documentation

> Build against ${base}. No account, no API key, no SDK required.
> Free endpoints are plain HTTPS; paid ones take a signed x402 v2
> payment in USDC on Base, Polygon or Solana, per request.

${sections}

## Conventions

${rules}

## Contact

A person reads this address: ${STORE_CONTACT_EMAIL}
`;
}

function developersHtml(base: string): string {
  const sections = surfaces(base)
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
  const rules = conventions(base)
    .map(
      (row) =>
        `<h3>${escapeHtml(row.q)}</h3><p>${escapeHtml(row.a)}</p>`,
    )
    .join("");
  return `
    <h1>${escapeHtml(STORE_SERVICE_NAME)} — developer documentation</h1>
    <p class="lede">Build against <code>${escapeHtml(base)}</code>. No account,
    no API key, no SDK. Free endpoints are plain HTTPS; paid ones take a signed
    x402 v2 payment in USDC on Base, Polygon or Solana, one payment per request.</p>
    ${sections}
    <h2>Conventions</h2>
    ${rules}
    <h2>Contact</h2>
    <p>A person reads this address:
      <a href="mailto:${escapeHtml(STORE_CONTACT_EMAIL)}">${escapeHtml(STORE_CONTACT_EMAIL)}</a>.</p>
    ${jsonLdScript({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      name: `${STORE_SERVICE_NAME} — developer documentation`,
      headline: `${STORE_SERVICE_NAME} — developer documentation`,
      description:
        "API documentation for scvd.store: OpenAPI contract, free conformance and preflight endpoints, the MCP server, x402 payment flow, error model, rate limits and versioning policy.",
      url: `${base}/developers`,
      author: { "@type": "Organization", name: STORE_SERVICE_NAME, url: base },
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
  "Developer documentation for scvd.store: the OpenAPI 3.1 contract, the free preflight and conformance endpoints, the MCP server, the x402 payment flow, the typed error model, rate-limit headers and the versioning policy. No account or API key exists to obtain.";

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
    c.header("Link", `<${base}/developers>; rel="canonical"`);
    if (prefersMarkdown(c.req.header("Accept"), "text/html")) {
      return c.text(developersMarkdown(base), 200, {
        "content-type": MARKDOWN_MEDIA_TYPE,
        Vary: VARY_ACCEPT,
      });
    }
    if (!wantsHtml(c.req.header("Accept"))) {
      return c.json({
        name: `${STORE_SERVICE_NAME} — developer documentation`,
        description: DESCRIPTION,
        authentication:
          "None. No account or API key exists. Paid endpoints take a signed x402 v2 payment per request.",
        openapi: `${base}/openapi.json`,
        guide: `${base}/llms.txt`,
        manual: `${base}/agents.md`,
        mcp: `${base}/.well-known/mcp`,
        cli: {
          npm: "scvd-tab",
          install: "npm i -g scvd-tab",
          bin: ["scvd-tab", "scvd-tab-pager"],
          license: "MIT",
          registry: "https://www.npmjs.com/package/scvd-tab",
          note: "Works against any x402 store, not only this one.",
        },
        sections: surfaces(base),
        conventions: conventions(base),
        contact: STORE_CONTACT_EMAIL,
      });
    }
    return c.html(
      renderSimplePage({
        title: `${STORE_SERVICE_NAME} developer documentation`,
        description: DESCRIPTION,
        path: "/developers",
        bodyHtml: developersHtml(base),
        extraCss: DEV_CSS,
      }),
    );
  });
}
