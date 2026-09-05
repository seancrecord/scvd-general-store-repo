import { goDeeperSection } from "@/store/go-deeper";
import { isKnownCrawler } from "@/lib/crawlers";
import { negotiate } from "@/lib/accept";
import { webmcpOriginTrialTags } from "@/pages/storefront-page";
import { escapeHtml } from "@/lib/sanitize";
import { ardLinkTags } from "@/lib/ard-catalog";
import { PAPER_CSS } from "@/pages/paper-css";
import { STORE_METADATA } from "@/store";
import { ROOMS, isUnlistedRoom } from "@/store/rooms";
import { jsonLdScript, webPageJsonLd } from "@/lib/jsonld";
import { verificationMetaTags } from "@/store/site-verification";

/**
 * A plain paper page in the storefront's hand, for the smaller rooms:
 * the Town Directory, the Gazette rack.
 * Callers pass pre-escaped HTML for the body sections.
 */

export interface SimplePageOptions {
  title: string;
  /**
   * REQUIRED, and required on purpose. Every small room in this store
   * rendered through here for weeks with no meta description at all,
   * which means a search engine and an answer engine alike had nothing
   * to quote but whatever text happened to land first. Making it a
   * required field turns "somebody forgot" into a compile error, the
   * same instinct as the certificate field list.
   *
   * Write it as a sentence a stranger could read as the answer to
   * "what is this page" — not a keyword list, and never a claim the
   * page itself does not make.
   */
  description: string;
  /** Absolute path of this page, for the canonical link. */
  path?: string;
  /**
   * Opt-in for the WebMCP declaration (P8, 2026-08-28): the
   * origin-trial meta and the /webmcp.js script tag, exactly as the
   * storefront carries them. Set on the pages where a browser agent
   * has a next step worth declaring — the till pages — and nowhere by
   * default: the script feature-detects document.modelContext and
   * no-ops everywhere else, the token is inert data, and a page that
   * opts in must also send firstPartyScriptCsp() (the P7 ruling's
   * condition on any first-party script).
   */
  webmcp?: boolean;
  /**
   * Path of this page's markdown twin, when one actually answers —
   * emitted as <link rel="alternate" type="text/markdown">. Left
   * unset for pages with no twin ON PURPOSE: a link tag to a 404 is
   * worse than no tag (scanner finding P17). For Accept-negotiated
   * pages the twin is the page's own path.
   */
  markdownAlt?: string;
  /** Dates for the WebPage node, where a page is a dated record (the corrections ledger). */
  dates?: { published?: string; modified?: string };
  /**
   * The Atom feed that mirrors this page, when one does (2026-09-03,
   * the feeds): emitted as <link rel="alternate"
   * type="application/atom+xml"> so a feed reader pointed at the page
   * finds it. Unset everywhere else, for the same reason as the
   * markdown twin: a link to a feed that does not exist is worse than
   * no link.
   */
  feedAlt?: { path: string; title: string };
  /** A page's own social card; the keeper's dino at /og.png otherwise. */
  ogImage?: string;
  /** Pre-escaped HTML sections, rendered inside the paper. */
  bodyHtml: string;
  /**
   * Extra CSS for a room that earns its own look, appended after the
   * paper stylesheet so it overrides rather than replaces it. The head
   * stays identical either way — the required description, the og
   * tags, the canonical — because those are the things a room shipped
   * without in July and the reason this function exists at all. A page
   * gets to look different; it does not get to be published worse.
   */
  extraCss?: string;
  /** Body class, so extraCss can scope itself to this room only. */
  bodyClass?: string;
  /**
   * INERT MARKUP APPENDED AFTER THE PAPER — today, the browser till's
   * JSON island and its <script src> tag (see lib/till-shelf.ts).
   *
   * The name is `inertHtml` rather than `scriptHtml` because the
   * contract is the strict one and the contract is the point:
   * whatever a caller passes here MUST render as nothing. A room that
   * put visible markup through this slot would silently change what a
   * reader with scripting off sees, which is the exact property the
   * till was built not to touch. Guarded by test/browser-till.spec.ts,
   * which strips these two tags and compares the rest of the document
   * byte for byte against the same page rendered without them.
   */
  inertHtml?: string;
}

const SITE_ORIGIN = "https://scvd.store";

/**
 * EVERY ROOM, ON EVERY ROOM. Until 2026-07-30 the only route between
 * these pages was a link buried in a paragraph, so each one was an
 * island — the same orphaning the office fixed in July, repeated on
 * the public side and unnoticed because every page had a way HOME and
 * that felt like enough.
 *
 * Derived from ROOMS, so a room built tomorrow is in the nav tomorrow
 * rather than whenever somebody remembers this function. The current
 * page renders as plain text rather than a link to itself.
 */
function roomsNav(current?: string): string {
  const entries = ROOMS.map((room) =>
    room.path === current
      ? `<strong>${escapeHtml(room.name)}</strong>`
      : `<a href="${room.path}">${escapeHtml(room.name)}</a>`,
  );
  return `<nav class="rooms"><a class="nav-home" href="/">Front of the store</a>${entries.join("")}</nav>`;
}

/**
 * THE HANDLES A SCRIPT CAN HOLD — derived from the URL, which is the
 * one part of a page that is a contract.
 *
 * The six-door reading found this store shipping the very failure the
 * lineup describes: an automation tool arriving here had nothing to
 * anchor on but style classes, and a style class is exactly what a
 * redesign moves. `class="paper"` is a decision about ink, not about
 * what the room IS.
 *
 * So every room's main landmark carries `data-room`, and instance
 * pages carry `data-item` beside it. Both come off `options.path`
 * rather than off the title, deliberately: titles are copy and copy is
 * rewritten, while a URL that changes is a redirect somebody had to
 * think about. `/menu/hello` gives room "menu" and item "hello" — the
 * ROOM is the template a script targets, the ITEM is which one it
 * landed on, and a script written against `[data-room="menu"]` keeps
 * working when the shelf gains an item or the copy above it changes.
 *
 * A page with no path gets no attribute rather than a guessed one. An
 * unstable handle is worse than an absent one: absent fails loudly at
 * the selector, invented fails silently at the wrong element.
 */
export function roomHandles(path: string | undefined): string {
  if (!path) return "";
  const [room, item] = path.replace(/^\//, "").split("/");
  if (!room) return ' data-room="storefront"';
  const roomAttribute = ` data-room="${escapeHtml(room)}"`;
  return item ? `${roomAttribute} data-item="${escapeHtml(item)}"` : roomAttribute;
}

export function renderSimplePage(options: SimplePageOptions): string {
  // Suffix shortened 2026-08-20 for SERP truncation; the full name stays on the page header and homepage.
  const title = `${escapeHtml(options.title)}, scvd.store`;
  const description = escapeHtml(options.description);
  // One origin-trial tag per browser vendor, derived from the same
  // list the storefront emits — a third trial is one entry there, not
  // an edit in two files that can disagree.
  const webmcp = options.webmcp
    ? `\n${webmcpOriginTrialTags()}\n  <script src="/webmcp.js" defer></script>`
    : "";
  const markdownAlt = options.markdownAlt
    ? `\n  <link rel="alternate" type="text/markdown" href="${SITE_ORIGIN}${escapeHtml(options.markdownAlt)}">`
    : "";
  const feedAlt = options.feedAlt
    ? `\n  <link rel="alternate" type="application/atom+xml" href="${SITE_ORIGIN}${escapeHtml(options.feedAlt.path)}" title="${escapeHtml(options.feedAlt.title)}">`
    : "";
  const canonical = options.path
    ? `\n  <link rel="canonical" href="${SITE_ORIGIN}${escapeHtml(options.path)}">`
    : "";
  // Every room with a canonical carries a WebPage node (F22), derived
  // from the same title and description the head already prints. It
  // goes at the END of the body so a room's own richer node (the
  // FAQPage on /what, a Service, a Dataset) stays the first block a
  // reader meets. A room the keeper held off the index
  // (Room.in_sitemap) says so to search crawlers here, in the one
  // place the flag is read.
  const structuredData = options.path
    ? `\n  ${jsonLdScript(
        webPageJsonLd({
          base: SITE_ORIGIN,
          path: options.path,
          title: options.title,
          description: options.description,
          dates: options.dates,
        }),
      )}`
    : "";
  const robots = isUnlistedRoom(options.path)
    ? `\n  <meta name="robots" content="noindex">`
    : "";
  /*
   * THE MACHINE MAP, ON EVERY ROOM (vetted 2026-08-29 by probing the
   * live site as an arriving agent would).
   *
   * robots.txt names llms.txt, agents.md and menu.json, and does it
   * well. But an agent that lands on a room, fetches it, and parses
   * <head> — which many do instead of reading robots.txt — found a
   * markdown alternate and nothing else. The map existed and the
   * doorway did not, and a reader who arrives deep in the site
   * rather than at the front door had no way back to it.
   */
  const machineMap =
    `\n  <link rel="alternate" type="text/plain" href="${SITE_ORIGIN}/llms.txt" title="Guide for language models">` +
    `\n  <link rel="alternate" type="application/json" href="${SITE_ORIGIN}/openapi.json" title="OpenAPI contract">`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${escapeHtml(options.ogImage ?? `${SITE_ORIGIN}/og.png`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(options.ogImage ?? `${SITE_ORIGIN}/og.png`)}">${verificationMetaTags()}${canonical}${robots}${machineMap}${markdownAlt}${feedAlt}${webmcp}
  ${ardLinkTags(SITE_ORIGIN)}
  <style>${PAPER_CSS}${options.extraCss ?? ""}</style>
</head>
<body${options.bodyClass ? ` class="${escapeHtml(options.bodyClass)}"` : ""}>
  <main class="paper"${roomHandles(options.path)}>
    <header>
      <p class="est">${escapeHtml(STORE_METADATA.name)} \u2022 ${escapeHtml(STORE_METADATA.location)}</p>
      <h1>${escapeHtml(options.title)}</h1>
      ${roomsNav(options.path)}
    </header>
    ${options.bodyHtml}
    ${goDeeperSection(options.path)}
    <div class="fine-print">
      <p><a href="/">Back to the front of the store</a>. Agents: <a href="/llms.txt"><code>/llms.txt</code></a>, <a href="/skill.md"><code>/skill.md</code></a>, or <a href="/menu.json"><code>/menu.json</code></a>.</p>
    </div>
  </main>${options.inertHtml ? `\n  ${options.inertHtml}` : ""}${structuredData}
</body>
</html>`;
}

/** True when the caller is a person with a browser, not an agent. */
/**
 * WHO GETS THE PAGE (2026-09-02). A caller whose Accept names HTML
 * gets HTML, as always. A caller that states no preference (`*​/*`,
 * or no header) gets JSON, as always — that is every agent's
 * `fetch(url)` and the store's own CLI. The one change: a crawler
 * the store names in robots.txt (lib/crawlers.ts) that states no
 * preference gets the page too, because the page is where the
 * title, the description and the JSON-LD live, and probed from
 * outside every one of them was receiving the JSON. A crawler that
 * explicitly ranks JSON or markdown above HTML still gets that.
 *
 * Responses that read the User-Agent say so in Vary (VARY_ACCEPT).
 */
export function wantsHtml(
  acceptHeader: string | undefined,
  userAgent?: string | undefined,
): boolean {
  if ((acceptHeader ?? "").includes("text/html")) return true;
  if (!isKnownCrawler(userAgent)) return false;
  return (
    negotiate(acceptHeader, ["text/html", "application/json", "text/markdown"]) ===
    "text/html"
  );
}
