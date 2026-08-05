import { currentWeekKey } from "@/lib/kv-keys";
import { catalogLastUpdated } from "@/lib/freshness";
import { escapeHtml } from "@/lib/sanitize";
import { priceLabel } from "@/lib/price-label";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { catIsOut } from "@/services/porch";
import type { FirstDollar } from "@/lib/metrics";
import {
  bellLine,
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
} from "@/store";
import { STOREFRONT_ROOMS } from "@/store/rooms";
import { EXTERNAL_RECORDS } from "@/store/trust-signals";
import type { StoreStats } from "@/services/stats";
import { dareForDay } from "@/store/copy/the-dare";
import { SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import { verificationMetaTags } from "@/store/site-verification";
import {
  FEATURED_SHELVES,
  openSignForWeek,
  STOREFRONT_COPY as COPY,
} from "@/store/copy/storefront";
import type { GuestbookEntry } from "@/types";

/**
 * The human storefront at GET /, the one screen a person ever sees or
 * shares. Neon roadside general store at dusk. This file is the HTML
 * scaffolding ONLY; every word on the building lives in
 * src/store/copy/storefront.ts, keeper-editable.
 */

export interface StorefrontData {
  /** Origin, for the offer URLs in the structured data. */
  base?: string;
  weekNote: string;
  bellCount: number;
  guestbook: GuestbookEntry[];
  /** The only public letter facts: how many in, how many answered. */
  lettersReceived: number;
  lettersAnswered: number;
  patronCount: number;
  /** Live books, for the structured data. Absent rather than stale. */
  stats?: StoreStats | null;
  /** C2: the honest track-record line, computed live, never hand-edited. */
  trackRecord?: string;
  /** The empty frame by the register. Null means "It's waiting." */
  firstDollar?: FirstDollar | null;
}

/** Canon 2026-07-24: the frame holds the first organic settlement, forever. */
function firstDollarHtml(firstDollar: FirstDollar | null | undefined): string {
  if (!firstDollar) {
    return `<span class="frame-line">It's waiting.</span>`;
  }
  return `<span class="frame-line">${escapeHtml(firstDollar.item)} \u00B7 $${firstDollar.paid_usdc} \u00B7 ${escapeHtml(firstDollar.at.slice(0, 10))} \u00B7 money zone</span>`;
}

/**
 * The six shelves on the sign, in MENU_ITEMS order and priced from
 * MENU_ITEMS. Both were hand-maintained until 2026-07-30, which is why
 * the cheap-door reorder reached menu.json, llms.txt, skill.md and the
 * MCP tool list and never reached the front of the building — the one
 * surface a person actually looks at kept the old order and its own
 * typed prices. A shelf whose id is not on the menu is dropped rather
 * than rendered with a blank price; a test fails first, so this is a
 * belt on a surface that shows money.
 */
function featuredHtml(): string {
  const order = new Map(MENU_ITEMS.map((item, index) => [item.id, index]));
  return [...FEATURED_SHELVES]
    .filter((shelf) => order.has(shelf.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((shelf) => {
      const item = MENU_ITEMS.find((entry) => entry.id === shelf.id);
      const price = item ? priceLabel(item) : "";
      return `<div class="shelf-card">
      <div class="shelf-top"><span class="shelf-name">${escapeHtml(shelf.name)}</span><span class="shelf-price">${escapeHtml(price)}</span></div>
      <p class="shelf-line">${escapeHtml(shelf.line)}</p>
    </div>`;
    })
    .join("\n");
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

/**
 * A LINK IS THE ONLY THING THAT MAKES A PAGE REACHABLE. The sitemap
 * tells a crawler a URL exists; it does not tell anything why to go, and
 * an answer engine that never parses XML never learns the room is there
 * at all. /attestation and /pulse shipped reachable by sitemap alone,
 * which is how a page ends up published and unread.
 *
 * Derived from ROOMS rather than typed out, so the next room is linked
 * from the front of the store the day it is built rather than the day
 * somebody remembers this footer exists.
 */
function roomsFooterHtml(): string {
  return STOREFRONT_ROOMS.map(
    (room) => `<a href="${room.path}">${escapeHtml(room.name)}</a>`,
  ).join(" · ");
}

/**
 * Invisible plumbing for the answer engines. Inert data, not script.
 *
 * Now carries the catalogue as well as the identity: an engine asked
 * "what does this store sell and for how much" could previously only
 * paraphrase our prose. An OfferCatalog lets it answer exactly, with
 * prices, and every offer's description is the item's capability line
 * rather than its charm.
 *
 * priceCurrency is "USDC", which is not an ISO 4217 code and may be
 * ignored by a strict reader. That is the correct trade: writing
 * "USD" would parse better and would not be true, and this store
 * loses more by being approximately right than by being unparsed.
 */
/**
 * THE ONE ESCAPE AN INLINE <script> BLOCK NEEDS.
 *
 * JSON inside a script tag is not HTML, so escapeHtml is the wrong
 * tool and would corrupt it. But the HTML parser does not know it is
 * looking at JSON: it ends the block at the first `</script`,
 * wherever that appears — including inside a string. One `<` in a
 * keeper-written item description and the storefront's structured
 * data stops parsing, silently as far as any answer engine is
 * concerned, with markup after it landing in the document.
 *
 * `\u003c` is the fix and it is free: JSON.parse decodes it back to
 * `<`, so every consumer sees the original string, while the HTML
 * parser never sees a tag at all. Applied to the serialized output
 * rather than to each field, so a field added later is covered
 * without anybody remembering.
 *
 * Nothing in the block contains a `<` today. That is exactly why it
 * is worth doing now: the descriptions this maps over are the
 * keeper's to edit, and the failure would show up as answer engines
 * quietly ignoring us rather than as anything breaking.
 */
function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * THE SHELF AS STRUCTURED DATA (2026-08-04, the keeper's SEO/AEO
 * push): every item the page already shows, as schema.org Products
 * with live prices — derived from MENU_ITEMS at render, so the
 * markup can no more go stale than the shelf can disagree with
 * itself. priceCurrency is "USD" because schema.org wants ISO-4217
 * and the shelf prices in dollar-denominated USDC; the description
 * says USDC plainly, so nothing is hidden by the code.
 */
function productListJsonLd(base: string): string {
  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${STORE_SERVICE_NAME} — the shelf`,
    numberOfItems: MENU_ITEMS.length,
    itemListElement: MENU_ITEMS.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: item.name,
        description: `${item.description} Paid in USDC over x402, on Base or Solana.`,
        url: `${base}/menu/${item.id}`,
        brand: { "@type": "Brand", name: STORE_SERVICE_NAME },
        offers: {
          "@type": "Offer",
          price: String(item.price_usdc),
          priceCurrency: "USD",
          url: `${base}/api/buy/${item.id}`,
          ...(item.pricing === "pay_what_it_deserves"
            ? { description: "Minimum; higher tiers offered in the 402, recorded as tips." }
            : {}),
        },
      },
    })),
  });
}

function organizationJsonLd(base: string, stats?: StoreStats | null): string {
  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "Organization",
    // THE NAMING LAW, tier 2: JSON-LD is named in the tier-2 list.
    // The full name moves to alternateName, where it stays discoverable
    // as lore without being the string entity resolvers file us under.
    name: STORE_SERVICE_NAME,
    alternateName: [STORE_METADATA.name, "scvd.store", "SCVD"],
    url: "https://scvd.store",
    description: COPY.organizationDescription,
    foundingDate: "2026-07-21",
    /**
     * THE REGISTERED ENTITY, in the structured data only.
     *
     * A diligence check asks "is there a company" and schema.org has
     * the field for it. The shop's own voice does not change: a buyer
     * deals with one person out of Oak City, and the company adds no
     * second pair of hands, no support desk and nobody else who can
     * sign. It is an answer to a question, not a thing for the sign
     * above the door.
     */
    legalName: "Record Creative Co. LLC",
    /**
     * THE FIELD schema.org PROVIDES FOR "here is independent record of
     * us," and the direct answer to an outside model reporting it
     * could find no external reputation footprint. Derived from
     * EXTERNAL_RECORDS so this list and the trust document cannot
     * disagree, and so an entry is added in exactly one place.
     *
     * ONLY URLS SOMEBODY HAS OPENED. A dead or invented link here is
     * worse than an empty array: sameAs is the one field a resolver
     * follows, and a broken one in the middle of an identity claim is
     * the strongest possible argument that the identity is not real.
     */
    ...(EXTERNAL_RECORDS.length > 0
      ? { sameAs: EXTERNAL_RECORDS.map((record) => record.url) }
      : {}),
    /**
     * A NUMBER TO PARSE INSTEAD OF A PARAGRAPH TO INTERPRET.
     *
     * The books were already public, live and honest at /stats and
     * /pulse.json — and entirely in prose or in a document a schema
     * reader has no reason to fetch. An agent doing pre-purchase
     * diligence parses the JSON-LD on the page it is already looking
     * at, and found no figures there at all.
     *
     * PUBLISHED SMALL RATHER THAN NOT PUBLISHED. Organic settlements
     * here are a single digit and the number goes out anyway, because
     * a nine-day-old store reporting one honest settlement is a more
     * plausible object than one reporting nothing — and the figure is
     * checkable against /stats in the same minute. House traffic is
     * excluded structurally rather than filtered, which is the only
     * reason the number is worth reading at all.
     *
     * COMPUTED LIVE AND OMITTED ENTIRELY WHEN THE READ FAILS. A count
     * frozen into a render would be one more hand-typed figure with an
     * expiry date, which is the defect this store spent the day
     * removing from four other surfaces. If stats cannot be computed
     * the block is absent — an absent number is honest, a stale one
     * is not.
     *
     * AND IT POINTS AT /stats ONLY. The first draft named /pulse.json
     * beside it, which walked straight through the keeper's standing
     * instruction that /pulse stays off the storefront — caught by the
     * test that has held that line since the room shipped, for the
     * second time. A derived or generated string is not exempt from a
     * decision somebody made on purpose, and structured data is still
     * the storefront speaking.
     */
    ...(stats
      ? {
          interactionStatistic: [
            {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/BuyAction",
              name: "Settled purchases from outside the house",
              userInteractionCount: stats.organic_settlements,
              description:
                "Purchases settled by a wallet this store does not control. House wallets are excluded structurally at the till rather than filtered afterwards; the split, the totals and the method are at /stats.",
            },
          ],
        }
      : {}),
    // When the catalog was last written or re-checked by hand. An
    // undated organization looks equally current whether it was
    // touched today or abandoned in the spring.
    dateModified: catalogLastUpdated(),
    makesOffer: MENU_ITEMS.map((item) => ({
      "@type": "Offer",
      name: item.name,
      description:
        SPEC_WHY_USE[item.id] ?? SPEC_RETURNS[item.id] ?? item.description,
      price: String(item.price_usdc),
      priceCurrency: "USDC",
      availability:
        item.fulfillment === "instant"
          ? "https://schema.org/InStock"
          : "https://schema.org/LimitedAvailability",
      url: `${base}/menu/${item.id}`,
    })),
    /**
     * THE ROOMS, AS A GRAPH RATHER THAN AS PROSE. Until this was added
     * the structured data described what the store SELLS and nothing
     * about what it PUBLISHES, so an engine asked "does this store say
     * what its signatures prove" had only the sitemap — an XML file
     * with no names in it — to work from. subjectOf is the right edge:
     * these are documents about the organization, not parts of it.
     *
     * Names only, no descriptions. Each page already writes its own
     * meta description and is required by the type to; repeating it
     * here would be a second copy free to drift from the first, which
     * is the defect this store keeps finding in its own work.
     */
    subjectOf: STOREFRONT_ROOMS.map((room) => ({
      "@type": "WebPage",
      name: room.name,
      url: `${base}${room.path}`,
    })),
  }).replace(/</g, "\\u003c");
}

export function renderStorefront(data: StorefrontData): string {
  const title = escapeHtml(COPY.pageTitle);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${COPY.metaDescription}">
  <link rel="canonical" href="${data.base ?? "https://scvd.store"}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${COPY.ogDescription}">
  <meta property="og:url" content="${data.base ?? "https://scvd.store"}/">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${COPY.ogDescription}">
  <meta name="theme-color" content="#0b0a12">${verificationMetaTags()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico" sizes="32x32">
  <link rel="manifest" href="/site.webmanifest">
  <script type="application/ld+json">${organizationJsonLd(data.base ?? "https://scvd.store", data.stats)}</script>
  <script type="application/ld+json">${productListJsonLd(data.base ?? "https://scvd.store")}</script>
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
      <p class="open-sign">${openSignForWeek(currentWeekKey())}</p>
      <p class="bell-marquee">\u{1F514} ${escapeHtml(bellLine(data.bellCount).replace("\u{1F514} ", ""))}</p>
      <p class="proprietors">${COPY.intentLine}</p>
      ${data.trackRecord ? `<p class="track-record">${escapeHtml(data.trackRecord)}</p>` : ""}
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
      <div class="gauge">
        <span class="gauge-label">The first dollar</span>
        ${firstDollarHtml(data.firstDollar)}
      </div>
    </div>

    <section class="board">
      ${catIsOut() ? '<span class="cat" aria-hidden="true"><span class="cat-tail"></span><span class="cat-eye cat-eye-l"></span><span class="cat-eye cat-eye-r"></span></span>' : ""}
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
        <p class="term-line">GET <a href="/try">/try</a>          <span class="term-note">${COPY.termNoteTry}</span></p>
        <p class="term-line">POST /api/request   <span class="term-note">${COPY.termNoteRequest}</span></p>
        <p class="term-line term-pay">${COPY.termPayLine}</p>
      </div>
    </section>

    <section class="wall">
      <h2 class="night-head">${COPY.wallHead}</h2>
      ${guestbookHtml(data.guestbook)}
      <p class="menu-meta"><a href="/visitors">The whole register's in the doorway.</a> <a href="/train">The train's out back.</a></p>
    </section>

    <footer class="porch-print">
      <p>${escapeHtml(STORE_METADATA.refund_policy)}</p>
      <p>${escapeHtml(STORE_METADATA.hours)}</p>
      <p><em>${escapeHtml(dareForDay(new Date().toISOString().slice(0, 10)))}</em></p>
      <p>${COPY.finePrintVerify}</p>
      <p>${COPY.finePrintFounding}</p>
      <p>${COPY.finePrintHouseLucky}</p>
      <p>${COPY.finePrintPorch}</p>
      <p class="porch-rooms">Every room, all free to read: ${roomsFooterHtml()}</p>
      <p class="porch-est">${COPY.footerAddress}</p>
    </footer>

  </main>
</body>
</html>`;
}
