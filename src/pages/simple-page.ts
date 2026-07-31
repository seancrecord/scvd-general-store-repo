import { escapeHtml } from "@/lib/sanitize";
import { PAPER_CSS } from "@/pages/paper-css";
import { STORE_METADATA } from "@/store";
import { ROOMS } from "@/store/rooms";

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
  const title = `${escapeHtml(options.title)}, ${escapeHtml(STORE_METADATA.name)}`;
  const description = escapeHtml(options.description);
  const canonical = options.path
    ? `\n  <link rel="canonical" href="${SITE_ORIGIN}${escapeHtml(options.path)}">`
    : "";
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
  <meta name="twitter:card" content="summary">${canonical}
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
  </main>
</body>
</html>`;
}

/** True when the caller is a person with a browser, not an agent. */
export function wantsHtml(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? "").includes("text/html");
}
