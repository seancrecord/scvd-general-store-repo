import { escapeHtml } from "@/lib/sanitize";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { catIsOut } from "@/services/porch";
import { bellLine, STORE_METADATA } from "@/store";
import {
  FEATURED_SHELVES,
  STOREFRONT_COPY as COPY,
} from "@/store/copy/storefront";
import type { GuestbookEntry } from "@/types";

/**
 * The human storefront at GET / — the one screen a person ever sees or
 * shares. Neon roadside general store at dusk. This file is the HTML
 * scaffolding ONLY; every word on the building lives in
 * src/store/copy/storefront.ts, keeper-editable.
 */

export interface StorefrontData {
  weekNote: string;
  bellCount: number;
  guestbook: GuestbookEntry[];
  /** The only public letter facts: how many in, how many answered. */
  lettersReceived: number;
  lettersAnswered: number;
  patronCount: number;
}

function featuredHtml(): string {
  return FEATURED_SHELVES.map(
    (item) => `<div class="shelf-card">
      <div class="shelf-top"><span class="shelf-name">${escapeHtml(item.name)}</span><span class="shelf-price">${escapeHtml(item.price)}</span></div>
      <p class="shelf-line">${escapeHtml(item.line)}</p>
    </div>`,
  ).join("\n");
}

/**
 * The week's note as a changeable-letter readerboard: each word set by
 * hand into the rails, a few sitting crooked, one losing its backlight.
 * The jank is deterministic (hashed per word) so the sign holds still
 * between visits, the way real signs do.
 */
function readerboardHtml(note: string): string {
  return note
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word, index) => {
      const hash = (index * 2654435761 + (word.charCodeAt(0) || 0)) >>> 0;
      const tilt = hash % 6 === 0 ? " brd-a" : hash % 6 === 3 ? " brd-b" : "";
      const dim = hash % 9 === 5 ? " brd-dim" : "";
      return `<span class="brd-w${tilt}${dim}">${escapeHtml(word)}</span>`;
    })
    .join(" ");
}

/** Odometer digits: leading zeros stay on the drum, just unlit. */
function nixieHtml(count: number): string {
  const padded = String(Math.max(0, count)).padStart(4, "0");
  const firstLit = padded.search(/[1-9]/);
  return padded
    .split("")
    .map((digit, index) => {
      const dim = firstLit === -1 || index < firstLit ? " nx-dim" : "";
      return `<span class="nx${dim}">${digit}</span>`;
    })
    .join("");
}

function guestbookHtml(entries: GuestbookEntry[]): string {
  if (entries.length === 0) {
    return `<p class="empty-night">${COPY.wallEmpty}</p>`;
  }
  return entries
    .slice(0, 3)
    .map(
      (entry) => `<div class="guest-slip">
      <span class="guest-who">${escapeHtml(entry.name)}</span>
      <span class="guest-when">${escapeHtml(entry.date.slice(0, 10))}</span>
      <p class="guest-said">${escapeHtml(entry.message)}</p>
    </div>`,
    )
    .join("\n");
}

/** Invisible plumbing for the answer engines. Inert data, not script. */
function organizationJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: STORE_METADATA.name,
    alternateName: ["scvd.store", "SCVD"],
    url: "https://scvd.store",
    description: COPY.organizationDescription,
    foundingDate: "2026-07-21",
  }).replace(/</g, "\\u003c");
}

export function renderStorefront(data: StorefrontData): string {
  const title = escapeHtml(STORE_METADATA.name);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${COPY.metaDescription}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${COPY.ogDescription}">
  <meta name="theme-color" content="#0b0a12">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>\u{1FAA8}</text></svg>">
  <script type="application/ld+json">${organizationJsonLd()}</script>
  <style>${STOREFRONT_CSS}</style>
</head>
<body class="night">
  <div class="stars"></div>
  <div class="dusk"></div>
  <main class="road">

    <header class="signfront">
      <p class="tube-line">${COPY.tubeLine}</p>
      <h1 class="neon">SEAN-CLAUDE<br>VAN DAMME<span class="flicker-slow">'</span>S<br><span class="neon-sub">GENERAL ST<span class="flicker">O</span>RE</span></h1>
      <div class="light-pool"></div>
      <p class="open-sign">${COPY.openSign}</p>
      <p class="bell-marquee">\u{1F514} ${escapeHtml(bellLine(data.bellCount).replace("\u{1F514} ", ""))}</p>
      <p class="proprietors">${escapeHtml(STORE_METADATA.proprietors)}</p>
    </header>

    <div class="gauges">
      <div class="gauge">
        <span class="gauge-label">${COPY.gaugePatrons}</span>
        <span class="nixie">${nixieHtml(data.patronCount)}</span>
      </div>
      <div class="gauge">
        <span class="gauge-label">${COPY.gaugeMailbox}</span>
        <span class="led"><em class="led-num">${data.lettersReceived}</em> in <span class="led-sep">\u00B7</span> <em class="led-num">${data.lettersAnswered}</em> answered</span>
      </div>
    </div>

    <section class="board">
      ${catIsOut() ? '<span class="cat" aria-hidden="true"><span class="cat-tail"></span><span class="cat-eye cat-eye-l"></span><span class="cat-eye cat-eye-r"></span></span>' : ""}
      <p class="board-label">${COPY.boardLabel}</p>
      <p class="board-text">${readerboardHtml(data.weekNote)}</p>
    </section>

    <section class="shelves">
      <h2 class="night-head">${COPY.shelvesHead}</h2>
      <div class="shelf-grid">
        ${featuredHtml()}
      </div>
      <p class="shelf-more">${COPY.shelvesMore}
        The whole catalog reads at <a href="/llms.txt"><code>/llms.txt</code></a>.</p>
    </section>

    <section class="doors">
      <div class="door door-human">
        <span class="pushpin"></span>
        <h3>${COPY.doorHumanHead}</h3>
        <p>${COPY.doorHumanBody}
        <a class="door-cta" href="/what">/what</a>.</p>
        <p class="door-small">${COPY.doorHumanSmall}</p>
      </div>
      <div class="door door-agent">
        <h3>${COPY.doorAgentHead}<span class="cursor">_</span></h3>
        <p class="term-line">GET <a href="/llms.txt">/llms.txt</a>       <span class="term-note">${COPY.termNoteFrontDoor}</span></p>
        <p class="term-line">GET <a href="/menu.json">/menu.json</a>     <span class="term-note">${COPY.termNoteCatalog}</span></p>
        <p class="term-line">GET <a href="/skill.md">/skill.md</a>      <span class="term-note">${COPY.termNoteSkill}</span></p>
        <p class="term-line">GET <a href="/openapi.json">/openapi.json</a>  <span class="term-note">${COPY.termNoteContract}</span></p>
        <p class="term-line">POST /api/request   <span class="term-note">${COPY.termNoteRequest}</span></p>
        <p class="term-line term-pay">${COPY.termPayLine}</p>
      </div>
    </section>

    <section class="wall">
      <h2 class="night-head">${COPY.wallHead}</h2>
      ${guestbookHtml(data.guestbook)}
    </section>

    <footer class="porch-print">
      <p>${escapeHtml(STORE_METADATA.refund_policy)}</p>
      <p>${escapeHtml(STORE_METADATA.hours)}</p>
      <p>${COPY.finePrintVerify}</p>
      <p>${COPY.finePrintPorch}</p>
      <p class="porch-est">${escapeHtml(STORE_METADATA.location)} \u00B7 ${COPY.estLine}</p>
    </footer>

  </main>
</body>
</html>`;
}
