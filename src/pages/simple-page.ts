import { WEBMCP_ORIGIN_TRIAL_TOKEN } from "@/pages/storefront-page";
import { escapeHtml } from "@/lib/sanitize";
import { ardLinkTags } from "@/lib/ard-catalog";
import { PAPER_CSS } from "@/pages/paper-css";
import { STORE_METADATA } from "@/store";
import { ROOMS } from "@/store/rooms";
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
   * opts in must also send FIRST_PARTY_SCRIPT_CSP (the P7 ruling's
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

export function renderSimplePage(options: SimplePageOptions): string {
  // Suffix shortened 2026-08-20 for SERP truncation; the full name stays on the page header and homepage.
  const title = `${escapeHtml(options.title)}, scvd.store`;
  const description = escapeHtml(options.description);
  const webmcp = options.webmcp
    ? `\n  <meta http-equiv="origin-trial" content="${WEBMCP_ORIGIN_TRIAL_TOKEN}">\n  <script src="/webmcp.js" defer></script>`
    : "";
  const markdownAlt = options.markdownAlt
    ? `\n  <link rel="alternate" type="text/markdown" href="${SITE_ORIGIN}${escapeHtml(options.markdownAlt)}">`
    : "";
  const canonical = options.path
    ? `\n  <link rel="canonical" href="${SITE_ORIGIN}${escapeHtml(options.path)}">`
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
  <meta property="og:image" content="${SITE_ORIGIN}/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${SITE_ORIGIN}/og.png">${verificationMetaTags()}${canonical}${machineMap}${markdownAlt}${webmcp}
  ${ardLinkTags(SITE_ORIGIN)}
  <style>${PAPER_CSS}${options.extraCss ?? ""}</style>
</head>
<body${options.bodyClass ? ` class="${escapeHtml(options.bodyClass)}"` : ""}>
  <main class="paper">
    <header>
      <p class="est">${escapeHtml(STORE_METADATA.name)} \u2022 ${escapeHtml(STORE_METADATA.location)}</p>
      <h1>${escapeHtml(options.title)}</h1>
      ${roomsNav(options.path)}
    </header>
    ${options.bodyHtml}
    <div class="fine-print">
      <p><a href="/">Back to the front of the store</a>. Agents: <a href="/llms.txt"><code>/llms.txt</code></a>, <a href="/skill.md"><code>/skill.md</code></a>, or <a href="/menu.json"><code>/menu.json</code></a>.</p>
    </div>
  </main>${options.inertHtml ? `\n  ${options.inertHtml}` : ""}
</body>
</html>`;
}

/** True when the caller is a person with a browser, not an agent. */
export function wantsHtml(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? "").includes("text/html");
}
