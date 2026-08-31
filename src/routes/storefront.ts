import { Hono } from "hono";
import {
  MARKDOWN_MEDIA_TYPE,
  prefersJson,
  prefersMarkdown,
  VARY_ACCEPT,
} from "@/lib/accept";
import { agentsMd } from "@/routes/agents-md";
import { FIRST_PARTY_SCRIPT_CSP } from "@/lib/csp";
import { KV_KEYS } from "@/lib/kv-keys";
import { getFirstDollar } from "@/lib/metrics";
import { renderStorefront } from "@/pages/storefront-page";
import { listGuestbook } from "@/services/guestbook";
import { listKeys } from "@/lib/kv-list";
import { computeStats, storefrontLedgerLine } from "@/services/stats";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { HonoEnv } from "@/types";
import { kvGet } from "@/lib/kv-retry";

/**
 * GET /, the human storefront. Reads the weekly note, bell count, and
 * recent guestbook entries; falls back gracefully if any shelf is bare.
 */
export const storefrontRoutes = new Hono<HonoEnv>();

storefrontRoutes.get("/", async (c) => {
  /**
   * THE FRONT DOOR, IN THE DIALECT THAT WAS ASKED FOR.
   *
   * The store has served an agent-shaped front door since /llms.txt
   * and /agents.md shipped — but only to a caller who already knew
   * those paths. A crawler doing the ordinary thing, GET / with
   * `Accept: text/markdown`, got the neon page: 84KB of HTML wrapped
   * around a sign made of flickering letters. Readiness audit,
   * 2026-08-21, and it is a fair hit.
   *
   * So the apex negotiates. HTML stays the default and the design is
   * untouched — this fires only when a client ranks markdown ABOVE
   * html, which a browser never does and an agent asking in the
   * convention's own terms always does. The body is /agents.md, the
   * operational manual, because a caller who asked a store for
   * markdown wants the transaction flow and not a description of the
   * porch.
   */
  c.header("Vary", VARY_ACCEPT);
  /*
   * AND IN JSON, FOR THE CALLER WHO ASKED IN JSON (2026-08-29).
   *
   * Vetting the site as an arriving agent found the apex answering
   * `Accept: application/json` with the neon page — an agent's very
   * first request, spent on 84KB it cannot parse. The markdown door
   * above has been open since the readiness audit; the JSON one was
   * not, for no reason anybody had decided.
   *
   * It hands back the atlas: the goal-first map of the whole store,
   * which is what a caller arriving at the front door in JSON is
   * actually looking for. Narrow by construction — only a client
   * that ranked JSON above HTML sees it, so browsers and `*​/*`
   * crawlers keep the storefront exactly as it is.
   */
  /**
   * ?mode=agent — THE SAME AGENT VIEW, ASKED FOR IN THE OTHER DIALECT.
   *
   * The apex has negotiated an agent-shaped front door since the
   * readiness audit: rank markdown above HTML and you get the
   * operational manual instead of the neon. That mechanism is the
   * right one and it is not the only one anybody uses — a 2026-08-30
   * scan asked for `?mode=agent`, got the storefront, and reported no
   * dedicated agent view, which was a fair reading of what it saw.
   *
   * A QUERY PARAMETER IS A CLIENT STATING A PREFERENCE, exactly as an
   * Accept header is, so it gets the same answer from the same
   * function rather than a second document that could drift from the
   * first. It sits ABOVE the Accept branches deliberately: a caller
   * who put the request in the URL meant it, and should not be
   * overruled by whatever their HTTP library puts in Accept by
   * default.
   *
   * The canonical link points at `/` because this is one document at
   * two addresses, and Vary names both dimensions so a cache cannot
   * serve one caller's dialect to another.
   */
  if (c.req.query("mode") === "agent") {
    return c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
      Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
    });
  }
  if (prefersJson(c.req.header("Accept"))) {
    const { buildAtlas } = await import("@/store/atlas");
    return c.json(buildAtlas(c.env.STORE_BASE_URL), 200, {
      Vary: VARY_ACCEPT,
      Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
    });
  }
  if (prefersMarkdown(c.req.header("Accept"), "text/html")) {
    return c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
      Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
    });
  }
  const [
    weekNote,
    bellCountRaw,
    guestbook,
    corpusKeys,
    patronRaw,
    stats,
    firstDollar,
  ] = await Promise.all([
    kvGet(c.env.COUNTERS, KV_KEYS.weekNote),
    kvGet(c.env.COUNTERS, KV_KEYS.bellCount),
    listGuestbook(c.env, 8).catch(() => []),
    /*
     * The record gauge: keys only, values never read. The corpus keys
     * are sequence-numbered, so counting names counts weeks, and one
     * capped list is the whole cost. 1,000 is ~19 years of Sundays;
     * if it ever truncates, the gauge shows "+" rather than a floor
     * dressed as a total (rule 52). Fail-soft to zero like every
     * other gauge read here: a KV hiccup shows "first entry pending",
     * never a broken front page.
     */
    listKeys(c.env.COUNTERS, {
      prefix: KV_KEYS.corpusPrefix,
      cap: 1000,
    }).catch(() => ({ names: [], truncated: false })),
    kvGet(c.env.COUNTERS, KV_KEYS.patronNumber),
    computeStats(c.env).catch(() => null),
    getFirstDollar(c.env).catch(() => null),
  ]);
  /*
   * A CSP arrives with the storefront's first first-party script
   * (webmcp.js), per the P7 ruling: the store's own scripts only,
   * nothing injected, nothing embedded. The JSON-LD blocks are data
   * (never prepared as scripts) and the inline <style> is untouched —
   * only script execution is being fenced, and 'self' is the fence.
   */
  c.header("Content-Security-Policy", FIRST_PARTY_SCRIPT_CSP);
  /**
   * THE MAP, IN HEADERS, BEFORE THE 84KB OF NEON PARSES.
   *
   * Every one of these documents was already published and already
   * named in the page's own <link> tags — but a link tag is only
   * reachable by a client that downloaded the body and parsed the
   * head, which is the expensive half of the visit and the half an
   * agent least wants. RFC 8288 puts the same relations where a HEAD
   * request can read them, so a machine deciding what to fetch next
   * spends one round trip instead of eighty-four kilobytes.
   *
   * A 2026-08-30 scan reported no Link headers on this door and it was
   * right: the apex sent one on its markdown and JSON dialects and
   * none at all on the HTML, which is the dialect a crawler actually
   * lands in.
   *
   * ONLY DOORS THAT ANSWER. A Link header pointing at a 404 is the
   * same defect as a rel=alternate tag pointing at one (finding P17),
   * one layer down, and harder to notice.
   */
  c.header(
    "Link",
    [
      `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
      `<${c.env.STORE_BASE_URL}/index.md>; rel="alternate"; type="text/markdown"`,
      `<${c.env.STORE_BASE_URL}/sitemap.xml>; rel="sitemap"; type="application/xml"`,
      `<${c.env.STORE_BASE_URL}/openapi.json>; rel="service-desc"; type="application/openapi+json"`,
      `<${c.env.STORE_BASE_URL}/developers>; rel="service-doc"; type="text/html"`,
      // RFC 9727 §4: from any API-ish resource to the catalog of the
      // whole surface. /developers already sends this one.
      `<${c.env.STORE_BASE_URL}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
      // RFC 9728 §5.1's companion: the same document the 402s point at.
      `<${c.env.STORE_BASE_URL}/.well-known/oauth-protected-resource>; rel="describedby"; type="application/json"`,
    ].join(", "),
  );
  return c.html(
    renderStorefront({
      base: c.env.STORE_BASE_URL,
      weekNote: weekNote || DEFAULT_WEEK_NOTE,
      bellCount: bellCountRaw ? parseInt(bellCountRaw, 10) : 0,
      guestbook,
      recordWeeks: corpusKeys.names.length,
      recordTruncated: corpusKeys.truncated,
      patronCount: patronRaw ? parseInt(patronRaw, 10) : 0,
      stats,
      ledgerLine: stats ? storefrontLedgerLine(stats) : undefined,
      firstDollar,
    }),
  );
});

/**
 * GET /index.md — the site root, at the URL a markdown convention
 * points at (2026-08-26).
 *
 * The apex already negotiates: `GET /` with `Accept: text/markdown`
 * has served the operational manual since the readiness audit asked
 * for it. What it could not serve was a caller that does not
 * negotiate — an agent handed a bare URL, a crawler that fetches with
 * a wildcard Accept, a person pasting a link into a tool that strips
 * headers. The convention those readers know is `/index.md`, and it
 * answered 404, which reads as "this site publishes no markdown root"
 * rather than "you asked for it the wrong way".
 *
 * THE SAME BYTES, NOT A SECOND DOCUMENT. This calls the exact function
 * the negotiated root calls, so there is nothing here that can drift
 * from it — and the canonical link points at `/`, because this is one
 * document at two addresses and saying otherwise would hand an indexer
 * a duplicate to adjudicate.
 */
storefrontRoutes.get("/index.md", (c) =>
  c.text(agentsMd(c.env.STORE_BASE_URL), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    /*
     * Vary on Accept even though this path does not negotiate: it is
     * the same resource as `/`, which does, and a cache that learned
     * one without the other would be able to serve a stale dialect.
     */
    Vary: VARY_ACCEPT,
    Link: `<${c.env.STORE_BASE_URL}/>; rel="canonical"`,
  }),
);
