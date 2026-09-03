import { currentWeekKey } from "@/lib/kv-keys";
import { ALTERNATE_NAMES, ASKED_FOR_NOUNS, WRITTEN_ABOUT } from "@/store/copy/asked-for";
import { catalogLastUpdated } from "@/lib/freshness";
import {
  JSONLD_PRICE_CURRENCY,
  jsonLdBody,
  offerCurrencyFields,
  organizationId,
  organizationRef,
} from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { priceLabel } from "@/lib/price-label";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { catIsOut } from "@/services/porch";
import type { FirstDollar } from "@/lib/metrics";
import {
  bellLine,
  MENU_ITEMS,
  STORE_CONTACT_EMAIL,
  STORE_METADATA,
  STORE_SERVICE_NAME,
} from "@/store";
import { OPERATED_BY, POSITION_OPENING } from "@/store/copy/position";
import {
  CORPUS_DATASET_DESCRIPTION,
  CORPUS_DATASET_LICENSE,
  CORPUS_DATASET_NAME,
} from "@/store/corpus-dataset";
import { STOREFRONT_ROOMS } from "@/store/rooms";

/**
 * ORIGIN-TRIAL TOKENS FOR WEBMCP — ONE PER BROWSER VENDOR, and that is
 * the shape rather than a temporary annoyance.
 *
 * An origin trial is not a feature flag we set; it is a signed grant
 * from a vendor saying THIS origin may use an unfinished API, and each
 * vendor signs with its own key. Chrome and Edge run separate
 * programmes, so a store reachable in both carries two tags. Neither
 * token does anything in the other's browser.
 *
 * Every token here is origin-bound and inert anywhere else, so these
 * are PUBLIC DATA, not secrets — the same class of thing as the DNS
 * record that proves we own the domain. Neither was registered for
 * subdomains or third-party injection: the narrowest grant that does
 * the job, and it matches what the store actually serves.
 *
 * WHEN A TRIAL ENDS the API goes back to feature-detection and
 * /webmcp.js keeps no-opping gracefully — no error, no broken page,
 * and nothing on the page that says the door has shut. That silence
 * is why `npm run doors:check` reads EVERY token here and reports the
 * soonest expiry rather than the first one it finds.
 */
export const WEBMCP_ORIGIN_TRIAL_TOKENS: readonly {
  readonly browser: string;
  readonly token: string;
}[] = [
  {
    // Chrome 149+. Registered by the keeper 2026-08-27; expires 2026-11-17.
    browser: "chrome",
    token:
      "AnY9gFUhvYlqmiw6Hxg8e8ZrnXjv32OUI6c4+jD1i1cRhvnw+rUYUGSaGiLFQZgwBbatEz6ZcGm1OL/Qm51ZDgkAAABKeyJvcmlnaW4iOiJodHRwczovL3NjdmQuc3RvcmU6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=",
  },
  {
    // Edge 150+. Registered by the keeper 2026-08-31; expires 2026-10-15
    // — THIRTY-TWO DAYS BEFORE CHROME'S, which is exactly why the door
    // battery reports the soonest of the two and not the first.
    browser: "edge",
    token:
      "A0e2lG+XKqhdeqtHOL7IqB0ohyilsql6Id8blCwWJH5ptWLTQTqt5Dy75GQrQemRMYjUUbv0zt0G44WDSRUns9EAAABKeyJvcmlnaW4iOiJodHRwczovL3NjdmQuc3RvcmU6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5MjA2OTkwN30=",
  },
];

/** The tags, one per vendor. Derived, so a third trial is one entry. */
export function webmcpOriginTrialTags(indent = "  "): string {
  return WEBMCP_ORIGIN_TRIAL_TOKENS.map(
    (entry) => `${indent}<meta http-equiv="origin-trial" content="${entry.token}">`,
  ).join("\n");
}
import { EXTERNAL_RECORDS, KEEPER_SOCIAL, OPERATOR } from "@/store/trust-signals";
import { ardInPageEntries, ardLinkTags } from "@/lib/ard-catalog";
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
  /**
   * Weekly corpus entries on the record, counted from the corpus's
   * own keys — the growth gauge that replaced the mailbox LED
   * (2026-08-27, the keeper's call; reasoning on gaugeRecord in the
   * copy file). `recordTruncated` is rule 52 riding along: the count
   * comes from a capped key-list, and a capped reading that cannot
   * say "there were more" publishes a floor as a total.
   */
  recordWeeks: number;
  recordTruncated: boolean;
  patronCount: number;
  /** Live books, for the structured data. Absent rather than stale. */
  stats?: StoreStats | null;
  /**
   * C2, at shopfront length: the organic count and the rail it came in
   * on, computed live and never hand-edited. The four-sentence version
   * still exists — it is what /stats, /skill.md and the catalog print,
   * and it is one click away from here.
   */
  ledgerLine?: string;
  /** The empty frame by the register. Null means "It's waiting." */
  firstDollar?: FirstDollar | null;
  /**
   * The bounty board, read live for the strip (2026-09-01, the
   * keeper's finding that the board was buried): how many doors a
   * shopper can walk today and what is left of the week's budget.
   * Null when the read failed, and the strip says only what the
   * copy already said — never a count that might be stale.
   */
  board?: { open_count: number; budget_left_usd: number } | null;
}

/**
 * The live line under the regulars' strip. Derived, not typed: the
 * count and the budget come off the same read /api/bounties serves,
 * so the front cannot promise doors the board does not hold — which
 * is exactly what it did between 2026-08-27 and 2026-09-01.
 */
function boardLineHtml(board: StorefrontData["board"]): string {
  if (!board) return "";
  if (board.open_count === 0) {
    return `<p class="what-line">The board is between postings — it reopens with the ISO week, and the machine-readable copy at <a href="/api/bounties"><code>/api/bounties</code></a> is the one to poll.</p>`;
  }
  const doors = board.open_count === 1 ? "one door" : `${board.open_count} doors`;
  return `<p class="what-line"><strong>${doors} open on the board right now</strong>, $${board.budget_left_usd.toFixed(2)} of this week's budget unspent. The list, the prices and the expiries: <a href="/bounties">/bounties</a>.</p>`;
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

/**
 * THE WALL, SET LIKE A WALL RATHER THAN LIKE A LIST.
 *
 * Three signed slips used to render in the page's own body face, the
 * same Georgia as the shelf copy, in the same grey — so the one part
 * of this store written by visitors rather than by us looked exactly
 * like the parts we wrote. It read as more of our own prose, which is
 * the opposite of what a guestbook is for.
 *
 * Now it is a panel of pinned cards in their own hand: names in a
 * script face, what they said in a different serif from everything
 * around it, dates in the same mono the instruments use. Nothing is
 * loaded from anywhere — system stacks only, each falling back to a
 * face the page already uses, because a wall that waits on a font
 * download is a wall that flashes blank on a slow phone.
 */
function guestbookHtml(entries: GuestbookEntry[]): string {
  if (entries.length === 0) {
    return `<p class="empty-night">${COPY.wallEmpty}</p>`;
  }
  const slips = entries
    .slice(0, 3)
    .map(
      (entry) => `<div class="guest-slip">
      <span class="guest-pin" aria-hidden="true"></span>
      <p class="guest-said">${escapeHtml(entry.message)}</p>
      <p class="guest-sig"><span class="guest-who">${escapeHtml(entry.name)}</span><span class="guest-when">${escapeHtml(entry.date.slice(0, 10))}</span></p>
    </div>`,
    )
    .join("\n");
  return `<div class="wall-slips">\n${slips}\n    </div>`;
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
 * priceCurrency is "USD" with the settlement asset in words beside
 * it — see JSONLD_PRICE_CURRENCY in lib/jsonld.ts for the 2026-09-02
 * reversal and why "USDC" here was no claim at all.
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
  return jsonLdBody(value);
}

/**
 * THE SHELF AS STRUCTURED DATA (2026-08-04, the keeper's SEO/AEO
 * push): every item the page already shows, as schema.org Products
 * with live prices — derived from MENU_ITEMS at render, so the
 * markup can no more go stale than the shelf can disagree with
 * itself. priceCurrency was "USDC" from 2026-08-27 (the keeper's
 * one-currency call, on schema.org's word that tickers are accepted)
 * and is "USD" again from 2026-09-02, when Search Console's
 * merchant-listing validator rejected the ticker on every priced
 * page. The asset rides in acceptedPaymentMethod; the reasoning is
 * on JSONLD_PRICE_CURRENCY in lib/jsonld.ts.
 *
 * FILLED OUT TO MERCHANT-LISTING SHAPE, 2026-08-18, after Search
 * Console read all 23 products and called every one invalid for a
 * missing image, then warned on availability, return policy and
 * shipping. The image requirement has no per-item answer yet — the
 * only art this store publishes is the dino card at /og.png, so every
 * product wears the store's face rather than none (a sample_url,
 * where one exists, is the item's own art and wins). The other three
 * fields are facts the store states elsewhere and simply hadn't said
 * here: availability was already computed for makesOffer below,
 * returns are the settlement reality written down in refund-policy.ts
 * and served at /rights, and shipping is the one honest zero a
 * digital shelf gets — nothing ships, delivery is the response
 * itself, the handling window for human-queue items is the listing's
 * own sla_hours rather than a number typed here.
 */
function offerAvailability(item: (typeof MENU_ITEMS)[number]): string {
  return item.fulfillment === "instant"
    ? "https://schema.org/InStock"
    : "https://schema.org/LimitedAvailability";
}

/**
 * The settlement reality as schema.org speaks it: x402 moves funds
 * wallet-to-wallet at purchase, nothing is held and nothing can be
 * sent back by code, so "returns not permitted" is the true category.
 * The missed-SLA refund promise (refund-policy.ts, on /rights) is a
 * delivery guarantee the keeper pays by hand, not a return channel,
 * and dressing it up as one here would promise a mechanism that does
 * not exist. applicableCountry is where the shop stands, not a limit
 * on who may buy.
 */
const OFFER_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "US",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
};

function offerShippingDetails(item: (typeof MENU_ITEMS)[number]): object {
  const handlingDays = Math.ceil((item.sla_hours ?? 0) / 24);
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: 0,
      currency: JSONLD_PRICE_CURRENCY,
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 0,
        maxValue: handlingDays,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: 0,
        maxValue: 0,
        unitCode: "DAY",
      },
    },
  };
}

/**
 * THE FREE INSTRUMENTS, AS SERVICES RATHER THAN AS PRODUCTS.
 *
 * The shelf is Products with Offers, correctly: each one is a thing
 * you buy and receive. The three free desks are not that — nothing is
 * sold, nothing is delivered to an owner, and modelling them as
 * zero-priced Products would say something false about what they are.
 * schema.org has the right type for a capability offered rather than
 * an item transferred, and a 2026-08-30 scan noted the store's
 * structured data stopped at Organization, WebSite, ItemList and
 * Product.
 *
 * THE FREE ONES ONLY, and that is the whole point of the block. This
 * is the half of the store an answer engine most needs to be able to
 * describe — "is there anything here I can use without paying" — and
 * it was the half with no structured data of its own. `isAccessibleForFree`
 * and a zero-price Offer both say so, because different consumers read
 * different fields and neither is a claim we would not stand behind.
 *
 * NO AggregateRating and no Review, here or anywhere. See the declined
 * positions at /developers: nothing this store publishes is a ranking
 * or a verdict without its derivation, and that has to be true of our
 * own page too.
 */
function freeServicesJsonLd(base: string): string {
  const service = (options: {
    name: string;
    description: string;
    path: string;
    type: string;
  }) => ({
    "@type": "Service",
    name: options.name,
    description: options.description,
    serviceType: options.type,
    url: `${base}${options.path}`,
    isAccessibleForFree: true,
    provider: organizationRef(base),
    areaServed: "Worldwide",
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${base}${options.path}`,
    },
  });

  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${STORE_SERVICE_NAME} — the free instruments`,
    description:
      "What this store does for anyone, for nothing, with no account: check an x402 door before paying it, check any issuer's signed offers and receipts, and verify anything this store has ever signed.",
    itemListElement: [
      service({
        name: "x402 endpoint preflight",
        description:
          "Send any x402 door's URL and get back what its 402 actually serves: whether it answers a well-formed challenge, whether its payTo can be credited on the rail it named, and what was not checked. One probe, one moment — a shape check, never an uptime claim.",
        path: "/api/preflight",
        type: "API endpoint verification",
      }),
      service({
        name: "Conformance desk",
        description:
          "Check any issuer's signed x402 offers and receipts against published criteria — ours, or a competitor's. Free, no account, and the criteria are published so a verdict can be recomputed without asking us.",
        path: "/api/conformance",
        type: "Signed artifact conformance checking",
      }),
      /*
       * ANCHORED AT THE PAGE, NOT AT THE TEMPLATE. The instrument
       * itself is /api/verify/{cert_id}, which is a shape rather than
       * an address — a Service whose url carried literal braces would
       * be a link nothing can follow, and one anchored at the bare
       * /api/verify would be a 404. The room that explains what a
       * signature from this store proves is the door a reader can
       * actually open, and it names the template. Caught by this
       * file's own guard, which fetches every url it publishes.
       */
      service({
        name: "Artifact verification",
        description:
          "Verify anything this store has ever signed, free, forever, with no account and no wallet: every certificate answers at /api/verify/{cert_id}. The public key is published, so it can also be done offline, without a request to us at all.",
        path: "/attestation",
        type: "Signature verification",
      }),
    ].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item,
    })),
  });
}

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
        description: `${item.description} Paid in USDC over x402, on Base, Polygon, or Solana.`,
        url: `${base}/menu/${item.id}`,
        image: `${base}${item.sample_url ?? "/og.png"}`,
        brand: { "@type": "Brand", name: STORE_SERVICE_NAME },
        offers: {
          "@type": "Offer",
          price: String(item.price_usdc),
          ...offerCurrencyFields(),
          /**
           * THE ITEM PAGE, NOT THE BUY DOOR. This read /api/buy/{id}
           * until 2026-08-18, which hands every crawler that honors
           * the markup a URL whose one answer is 402 — Search Console
           * duly filed them under "blocked due to other 4xx". The
           * offer's public face is the item page; the 402 door is
           * printed on it for the readers who can walk through.
           */
          url: `${base}/menu/${item.id}`,
          availability: offerAvailability(item),
          hasMerchantReturnPolicy: OFFER_RETURN_POLICY,
          shippingDetails: offerShippingDetails(item),
          ...(item.pricing === "pay_what_it_deserves"
            ? { description: "Minimum; higher tiers offered in the 402, recorded as tips." }
            : {}),
        },
      },
    })),
  });
}

/**
 * THE CORPUS AS ITS OWN ENTITY.
 *
 * Marking /corpus.json as a Dataset is half the move; a Dataset
 * nothing points at is one a crawler has to stumble onto. schema.org
 * has no "organization publishes dataset" edge — the relationship runs
 * the other way, `creator`, which /corpus.json already declares. So the
 * Dataset gets its own top-level node here, where the storefront is
 * crawled, and the two halves join up through the shared identity.
 *
 * Thin, but no longer below the type's floor. The first draft omitted
 * the description on the "no second copy to drift" rule — correct
 * instinct, wrong mechanism: schema.org's Dataset requires one, and
 * Search Console read the omission as an invalid Dataset outright
 * (2026-08-16), which is worse than drift. The fix is the rule applied
 * properly — name, description and licence are the same imported
 * constants /corpus.json serves, one copy, two surfaces.
 */
function corpusDatasetJsonLd(base: string): string {
  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: CORPUS_DATASET_NAME,
    description: CORPUS_DATASET_DESCRIPTION,
    license: CORPUS_DATASET_LICENSE,
    url: `${base}/corpus.json`,
    creator: organizationRef(base),
    isAccessibleForFree: true,
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${base}/corpus.json`,
    },
  });
}

/**
 * THE TOWN, AS schema.org SPEAKS IT.
 *
 * Split from `OPERATOR.location` rather than typed out beside it, so
 * the structured data and the trust document cannot come to disagree
 * about where the store is — the failure this codebase keeps finding
 * in its own work. "Oak City, North Carolina" is one string in one
 * file; this is the only place it is taken apart.
 *
 * A region that is not there is omitted rather than guessed: an
 * addressRegion of "undefined" would parse, which is the worst
 * possible outcome for a field whose entire job is verification.
 */
function postalAddress(): object {
  const [locality, region] = OPERATOR.location.split(",").map((part) => part.trim());
  return {
    "@type": "PostalAddress",
    ...(locality ? { addressLocality: locality } : {}),
    ...(region ? { addressRegion: region } : {}),
    addressCountry: "US",
  };
}

/**
 * THE SITE AS ITS OWN ENTITY, WHICH IS NOT THE SAME AS THE COMPANY.
 *
 * The Organization block has described the business since July and an
 * entity resolver reading it learns who runs the shop. What it does
 * not learn is that "scvd.store", "SCVD General Store" and
 * "Sean-Claude Van Damme's General Store" are three names for one
 * WEBSITE — schema.org models that with WebSite, and until now this
 * page had none.
 *
 * WHY THAT MATTERS HERE SPECIFICALLY. A readiness audit searched for
 * the brand by name and the domain did not appear at all: ten results,
 * none of them us. Some of that is off-site and none of this fixes it
 * — a JSON-LD block does not earn a press mention. What it does fix is
 * the half that is ours: an engine trying to decide whether the string
 * somebody typed refers to this site had the names scattered across an
 * Organization's alternateName, a page title, and an og tag, with
 * nothing saying they are the same site at the same URL.
 *
 * `publisher` joins the two nodes rather than repeating the
 * Organization's fields, which would be a second copy free to drift.
 */
function webSiteJsonLd(base: string): string {
  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: STORE_SERVICE_NAME,
    alternateName: ALTERNATE_NAMES,
    url: `${base}/`,
    inLanguage: "en",
    description: COPY.metaDescription,
    publisher: organizationRef(base),
  });
}

function organizationJsonLd(base: string, stats?: StoreStats | null): string {
  return jsonLdSafe({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(base),
    // THE NAMING LAW, tier 2: JSON-LD is named in the tier-2 list.
    // The full name moves to alternateName, where it stays discoverable
    // as lore without being the string entity resolvers file us under.
    name: STORE_SERVICE_NAME,
    alternateName: ALTERNATE_NAMES,
    /**
     * THE CATEGORY, IN THE FIELD FOR IT (2026-09-02). alternateName
     * carries the phrases people type; knowsAbout carries them as
     * topics; subjectOf links what has been written about the store
     * under a byline. The storefront prose does not change: the
     * identity noun stays on every sentence a person reads, and these
     * are the machine fields a question in anyone's words resolves
     * through. store/copy/asked-for.ts has the reasoning.
     */
    knowsAbout: ASKED_FOR_NOUNS,
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
    legalName: OPERATED_BY,
    /**
     * THE CONTACT POINT, in the field schema.org provides for it.
     *
     * A readiness audit on 2026-08-21 marked the Organization block
     * incomplete for want of `contactPoint` and `address`. The email
     * has been published on six surfaces since July — security.txt,
     * the OpenAPI contact, llms.txt, the wind-down notice — and was
     * absent from the one block an entity resolver actually reads.
     *
     * `address` WAS DECLINED ON THE RECORD and is now answered, and
     * the reasoning that declined it is worth keeping because it was
     * half right. The objection was that the only address this store
     * has is where the keeper lives, so a PostalAddress would be
     * either a home address published to every crawler or an
     * invention. True of a STREET address. It is not true of the
     * town, which this store has printed on its own sign, its badges,
     * its stamps and /trust since July — `OPERATOR.location`, the
     * same string, imported rather than retyped.
     *
     * So the block carries locality, region and country and no
     * street line. That is not a partial address pretending to be a
     * whole one: schema.org's PostalAddress has no required
     * properties, a locality-level address is the ordinary way to
     * say where a business is without saying where a person sleeps,
     * and every field in it was already public. The premises note
     * below stays, because "which floor of which building" still has
     * no answer and a reader deserves to be told that rather than
     * left to infer it from a missing field.
     */
    address: postalAddress(),
    additionalProperty: {
      "@type": "PropertyValue",
      name: "premises",
      value:
        "There is no street address or shop floor — one person, working from the town named in the address. The locality is the whole claim.",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: STORE_CONTACT_EMAIL,
        url: `${base}/developers`,
        availableLanguage: "English",
        areaServed: "001",
      },
      {
        "@type": "ContactPoint",
        contactType: "technical support",
        email: STORE_CONTACT_EMAIL,
        url: `${base}/developers`,
        availableLanguage: "English",
        areaServed: "001",
      },
    ],
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
    // KEEPER_SOCIAL rides along: the keeper's own account is textbook
    // sameAs material, kept apart from EXTERNAL_RECORDS because those
    // promise independent records and an owned account is not one.
    ...(EXTERNAL_RECORDS.length > 0 || KEEPER_SOCIAL.length > 0
      ? {
          sameAs: [
            ...EXTERNAL_RECORDS.map((record) => record.url),
            ...KEEPER_SOCIAL,
          ],
        }
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
      ...offerCurrencyFields(),
      availability: offerAvailability(item),
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
    subjectOf: [
      ...STOREFRONT_ROOMS.map((room) => ({
        "@type": "WebPage",
        name: room.name,
        url: `${base}${room.path}`,
      })),
      /*
       * And what has been written ABOUT the store under a byline, on
       * domains the engines already cite (2026-09-02). Same edge, the
       * other direction: the piece links here, this links the piece,
       * and an engine sees one author, one store, one subject.
       */
      ...WRITTEN_ABOUT.map((piece) => ({
        "@type": "Article",
        headline: piece.title,
        url: piece.url,
        publisher: { "@type": "Organization", name: piece.where },
      })),
    ],
  });
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
  <link rel="alternate" type="text/markdown" href="${data.base ?? "https://scvd.store"}/index.md">
  <!--
    THE MACHINE MAP, IN THE HEAD (vetted 2026-08-29, probing the live
    site as an arriving agent). robots.txt already names llms.txt,
    agents.md and menu.json — and an agent that fetches the page and
    parses <head>, which many do instead of reading robots.txt, found
    a markdown alternate and a web manifest and no route to any of it.
    The map existed; the doorway did not.
  -->
  <link rel="alternate" type="text/plain" href="${data.base ?? "https://scvd.store"}/llms.txt" title="Guide for language models">
  <link rel="alternate" type="application/json" href="${data.base ?? "https://scvd.store"}/openapi.json" title="OpenAPI contract">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${COPY.ogDescription}">
  <meta property="og:url" content="${data.base ?? "https://scvd.store"}/">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${data.base ?? "https://scvd.store"}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="A brown pixel-art T-rex above the words scvd.store — an evidence observatory for agentic commerce, a general store for AI agents.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${COPY.ogDescription}">
  <meta name="twitter:image" content="${data.base ?? "https://scvd.store"}/og.png">
  <meta name="theme-color" content="#0b0a12">${verificationMetaTags()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico" sizes="32x32">
  <link rel="manifest" href="/site.webmanifest">
  ${ardLinkTags(data.base ?? "https://scvd.store")}
  <script type="application/ld+json">${organizationJsonLd(data.base ?? "https://scvd.store", data.stats)}</script>
  <!--
    ARD ENTRIES AS IN-PAGE MARKUP (spec section 5.1, mechanism two).
    The same entries the well-known manifest carries, each naming the
    ARD base context because a crawler that found them here has not
    been told what they are. Inert data, on the one page whose whole
    job is saying what this origin offers.
  -->
  <script type="application/ld+json">${jsonLdBody(ardInPageEntries(data.base ?? "https://scvd.store"))}</script>
  <script type="application/ld+json">${webSiteJsonLd(data.base ?? "https://scvd.store")}</script>
  <script type="application/ld+json">${productListJsonLd(data.base ?? "https://scvd.store")}</script>
  <script type="application/ld+json">${freeServicesJsonLd(data.base ?? "https://scvd.store")}</script>
  <script type="application/ld+json">${corpusDatasetJsonLd(data.base ?? "https://scvd.store")}</script>
  <style>${STOREFRONT_CSS}</style>
  <!--
    THE WEBMCP SURFACE (P7). Registers the store's free, read-only
    evidence instruments on document.modelContext for an agent living
    in the visitor's browser; a browser without the API loads a no-op.
    The tool set derives from the MCP catalog — see routes/webmcp.ts
    for the two construction guarantees (cannot act, cannot drift).
    The origin-trial token below unlocks the API in Chrome 149-156
    (and Chromium kin) ahead of general availability — registered by
    the keeper 2026-08-27, bound to https://scvd.store:443, feature
    "WebMCP", expires 2026-11-17 (Google will mail a renewal
    reminder). Public by design: a token is origin-bound and inert
    anywhere else. Browsers outside the trial ignore it and the
    script still no-ops gracefully.
  -->
${webmcpOriginTrialTags()}
  <script src="/webmcp.js" defer></script>
</head>
<body class="night">
  <div class="stars"></div>
  <div class="dusk"></div>
  <main class="road" data-room="storefront">

    <header class="signfront">
      <p class="tube-line">${COPY.tubeLine}</p>
      <h1 class="neon"><span class="neon-name">SEAN-CLAUDE<br>VAN DAMME<span class="flicker-slow">'</span>S<br><span class="neon-sub">GENERAL ST<span class="flicker">O</span>RE</span></span><span class="sr-only"> (${escapeHtml(STORE_SERVICE_NAME)}) — ${escapeHtml(COPY.h1Summary)}</span></h1>
      <div class="light-pool"></div>
      <p class="open-sign">${openSignForWeek(currentWeekKey())}</p>
      <p class="bell-marquee">\u{1F514} ${escapeHtml(bellLine(data.bellCount).replace("\u{1F514} ", ""))}</p>
      <p class="proprietors">${COPY.intentLine}</p>
      ${data.ledgerLine ? `<p class="track-record">${escapeHtml(data.ledgerLine)}</p>` : ""}
      <p class="pay-rails">${COPY.payRails} ${COPY.booksLink} <a href="/stats">/stats</a>.</p>
    </header>

    <div class="gauges">
      <div class="gauge">
        <span class="gauge-label">${COPY.gaugePatrons}</span>
        <span class="nixie">${nixieHtml(data.patronCount)}</span>
      </div>
      <div class="gauge">
        <span class="gauge-label">${COPY.gaugeRecord}</span>
        ${
          data.recordWeeks > 0
            ? `<span class="led"><em class="led-num">${data.recordWeeks}${data.recordTruncated ? "+" : ""}</em> week${data.recordWeeks === 1 && !data.recordTruncated ? "" : "s"} <span class="led-sep">\u00B7</span> signed, chained, anchored</span>`
            : `<span class="led">first entry pending</span>`
        }
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

    <section class="what-this-is">
      <h2 class="night-head">${COPY.whatThisIsHead}</h2>
      <p class="what-line what-lead">${escapeHtml(POSITION_OPENING)}</p>
      <p class="what-line">${COPY.whatThisIsDoors}</p>
      <p class="what-line">${COPY.whatThisIsPassport}</p>
      <p class="what-line">${escapeHtml(COPY.whatThisIsShop)}</p>
      <p class="what-line">${escapeHtml(COPY.recordReadsAsTime)}</p>
    </section>

    <section class="shelves">
      <h2 class="night-head">${COPY.shelvesHead}</h2>
      <div class="shelf-grid">
        ${featuredHtml()}
      </div>
      <p class="shelf-more">${COPY.shelvesMore}
        The whole catalog reads at <a href="/llms.txt"><code>/llms.txt</code></a>.</p>
      <p class="shelf-till"><a class="door-cta" href="/menu">${escapeHtml(COPY.shelvesTillCta)}</a> — ${escapeHtml(COPY.shelvesTillBody)}</p>
    </section>

    <section class="what-this-is promise">
      <h2 class="night-head">${COPY.promiseHead}</h2>
      <p class="what-line"><strong>${escapeHtml(STORE_METADATA.refund_policy)}</strong></p>
      <p class="what-line">${COPY.promisePointer}</p>
    </section>

    <section class="what-this-is regulars">
      <h2 class="night-head">${COPY.regularsHead}</h2>
      <p class="what-line">${COPY.regularsBody}</p>
      ${boardLineHtml(data.board)}
    </section>

    <section class="doors">
      <div class="door door-human">
        <span class="pushpin"></span>
        <h3>${COPY.doorHumanHead}</h3>
        <p>${COPY.doorHumanBody}
        <a class="door-cta" href="/what">/what</a>.</p>
        <p class="door-small">${COPY.doorHumanSmall}</p>
        <p class="door-small">${COPY.doorHumanHandoffLead}</p>
        <p class="door-small"><code>${escapeHtml(COPY.doorHumanHandoffRead)}</code></p>
        <p class="door-small"><code>${escapeHtml(COPY.doorHumanHandoffMcp)}</code></p>
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
      <p class="porch-dare"><em>${escapeHtml(dareForDay(new Date().toISOString().slice(0, 10)))}</em></p>
      <p>${COPY.finePrintVerify}</p>
      <p class="porch-rooms-label">Every room, all free to read</p>
      <p class="porch-rooms">${roomsFooterHtml()}</p>
      <p class="porch-est">${COPY.footerAddress} \u00B7 ${escapeHtml(OPERATED_BY)}</p>
    </footer>

  </main>
</body>
</html>`;
}
