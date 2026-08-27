import { Hono, type Context } from "hono";
import { listingSpec, SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import { freshness } from "@/lib/freshness";
import { BASE_NETWORK, priceTiersUsdc } from "@/lib/payments";
import {
  fulfillmentLine,
  priceLine,
  renderItemMarkdown,
  renderMenuMarkdown,
} from "@/services/menu-markdown";
import { MARKDOWN_MEDIA_TYPE, prefersMarkdown, VARY_ACCEPT } from "@/lib/accept";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { tillShelfHtml } from "@/lib/till-shelf";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { stockedShelfCount } from "@/services/fulfillment";
import { CAPABILITY_QUERY, USE_WHEN } from "@/store/spec";
import { shutterState } from "@/services/shutter";
import type { ShutterState } from "@/services/shutter";
import { computeStats, trackRecordLine } from "@/services/stats";
import {
  getMenuItem,
  MENU_ITEMS,
  STORE_METADATA,
  STORE_SERVICE_NAME,
} from "@/store";
import { GUARANTEED, NOT_GUARANTEED } from "@/store/spec";
import { ANCHOR_WRITING_GUIDE } from "@/store/copy/anchor-writing";
import type { HonoEnv, MenuItem } from "@/types";
import { getRetiredItem } from "@/store/retired";

/**
 * GET /menu.json, the machine-readable catalog (markdown on request).
 * GET /menu/:item_id, one item up close, JSON or markdown per Accept.
 * Renders at / for humans; this is the same shelf for agents.
 * Strict matching off so a trailing slash is the same door, not a 404.
 */

interface CatalogItem extends MenuItem {
  buy_url: string;
  /**
   * The job this item does, in the words an agent would search with —
   * the same CAPABILITY_QUERY the OpenAPI summaries carry. Absent on
   * novelty items, which have no job to state (see NOVELTY_ONLY).
   */
  task?: string;
  /** Amounts offered in the 402 challenge; above-minimum = tip. */
  price_tiers_usdc: number[];
  /** S1: the uniform listing spec, one shape storewide. */
  spec: ReturnType<typeof listingSpec>;
  /** C3: the guaranteed / not-guaranteed split, storewide. */
  guaranteed: readonly string[];
  not_guaranteed: readonly string[];
  /** Fulfillment restructure: agents deserve to know before they 402. */
  fulfillment_state: FulfillmentState;
}

interface FulfillmentState {
  class: "stocked" | "instant" | "commission";
  stock?: number;
  shutter: "open" | "closed";
  sla_hours?: number;
}

async function fulfillmentState(
  env: Parameters<typeof stockedShelfCount>[0],
  item: MenuItem,
  shutter: ShutterState,
): Promise<FulfillmentState> {
  if (item.stocked) {
    return {
      class: "stocked",
      stock: await stockedShelfCount(env, item),
      shutter: "open",
    };
  }
  if (item.fulfillment === "instant") {
    return { class: "instant", shutter: "open" };
  }
  return {
    class: "commission",
    shutter: shutter.closed ? "closed" : "open",
    sla_hours: item.sla_hours ?? 168,
  };
}

export const catalogRoutes = new Hono<HonoEnv>({ strict: false });

const MARKDOWN_HEADERS = {
  "Content-Type": MARKDOWN_MEDIA_TYPE,
  /**
   * WITHOUT THIS, THE CDN DECIDES WHO GETS WHAT. Two clients, one
   * URL, two media types: whichever variant reaches the edge cache
   * first is served to both until it expires. An agent that asked
   * for markdown and was handed cached JSON has been given the wrong
   * answer by infrastructure, not by this route.
   */
  Vary: VARY_ACCEPT,
} as const;

/** The same declaration, for the JSON side of the same negotiated URL. */
function varyOnAccept(c: { header: (name: string, value: string) => void }): void {
  c.header("Vary", VARY_ACCEPT);
}

catalogRoutes.get("/menu.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  varyOnAccept(c);
  if (prefersMarkdown(c.req.header("Accept"))) {
    return c.text(renderMenuMarkdown(MENU_ITEMS, base), 200, MARKDOWN_HEADERS);
  }
  // The books are part of the catalog's root metadata (C2); a ledger
  // hiccup never blocks the menu.
  const stats = await computeStats(c.env).catch(() => null);
  const shutter: ShutterState = await shutterState(c.env).catch(() => ({
    closed: false,
  }));
  const items: CatalogItem[] = await Promise.all(
    MENU_ITEMS.map(async (item) => ({
      ...item,
      buy_url: `${base}/api/buy/${item.id}`,
      ...(CAPABILITY_QUERY[item.id] ? { task: CAPABILITY_QUERY[item.id] } : {}),
      price_tiers_usdc: priceTiersUsdc(item),
      spec: listingSpec(item, base),
      guaranteed: GUARANTEED,
      not_guaranteed: NOT_GUARANTEED,
      fulfillment_state: await fulfillmentState(c.env, item, shutter),
      ...(item.sample_url ? { sample_url: `${base}${item.sample_url}` } : {}),
    })),
  );
  return c.json({
    ...freshness(),
    /**
     * A DESCRIPTION AT THE ROOT, for resolvers that do not descend.
     *
     * `store.description` has carried the position for a while, one
     * level down. The AEO sweep's point stands anyway: an entity
     * resolver that reads the top of a document and files it on what
     * it finds there was being handed a freshness stamp and an array
     * of items. It is the SAME constant as the one below, not a
     * second copy — two descriptions that can disagree is the exact
     * drift this sweep exists to end.
     */
    description: STORE_METADATA.description,
    store: {
      ...STORE_METADATA,
      // THE NAMING LAW, tier 2: the spread carries the tier-3 full
      // name, which is retired from metadata. Overridden here so this
      // field matches serviceName and x402.json character for character.
      name: STORE_SERVICE_NAME,
      network: BASE_NETWORK,
      x402_version: 2,
      url: base,
      human_shelf: shutter.closed
        ? "shuttered (the keeper is away from the counter; human-labor purchases are refused before money moves; machine shelves and stocked shelves keep selling)"
        : "open",
      ...(stats ? { track_record: trackRecordLine(stats, base) } : {}),
      stats: `${base}/stats`,
      listing_spec_schema: `${base}${SPEC_SCHEMA_PATH}`,
      llms_txt: `${base}/llms.txt`,
      skill_md: `${base}/skill.md`,
      openapi: `${base}/openapi.json`,
      x402_discovery: `${base}/.well-known/x402.json`,
      coverage: `${base}/.well-known/coverage.json`,
      coverage_alias: `${base}/coverage.json`,
      signing_key: `${base}/.well-known/scvd-signing-key`,
      /**
       * THE THESIS, ON THE DOCUMENT THAT CARRIES THE SHELF.
       *
       * Found 2026-07-30 by a cold categorization audit: six readers
       * entered the store at six different machine surfaces and were
       * asked to file it. Five put verification in their top two. The
       * one that did not entered HERE — and menu.json handed it the
       * signing key, an itemized shelf of blessings and fortunes and
       * grudges, and no verify endpoint, no attestation page and no
       * corrections record anywhere in the document. It filed the
       * store as an art project, which is a fair reading of what it
       * was given.
       *
       * A key without a way to check it is decoration. This is the
       * third instance of that exact defect in one day, after the
       * x402 discovery document and skill.md, and it was the worst of
       * the three: this is the most-fetched document the store serves
       * and it is the one where the shelf does all the talking.
       */
      verify: `${base}/api/verify/{id} (free, forever, no account, works whether or not you bought the thing)`,
      attestation: `${base}/attestation (what each signature covers, and what a valid one does NOT prove, per artifact class)`,
      corrections: `${base}/corrections`,
      item_detail: `${base}/menu/{item_id} (JSON, or markdown per Accept)`,
      operator_glance: `${base}/what (for the human whose agent is here)`,
      zodiac: `${base}/zodiac`,
      mcp: `${base}/mcp (streamable HTTP; tools/list free, buy_* tools x402-paid in-band)`,
    },
    // The reverse index: situation -> item ids. why_use tells an agent
    // what an item is; this tells it whether it is in the situation the
    // item answers, which is the question that comes first.
    use_when: USE_WHEN.map((entry) => ({
      when: entry.when,
      items: [...entry.items],
      example: entry.example,
    })),
    items,
    reading_room: {
      almanac: {
        url: `${base}/almanac`,
        note: "The keeper's serialized journal. Free index; each dated page is a penny over x402.",
      },
      gazette: {
        url: `${base}/gazette`,
        note: "The archive. Past issues a penny a copy; the founding edition is free at /gazette/founding, take one. New editions retired 2026-08-05 — the paper of record is the Almanac.",
      },
      directory: {
        url: `${base}/directory`,
        note: "The Town Directory, honest one-line reviews of the neighbors. Free.",
      },
    },
    free_shelf: {
      guestbook: {
        url: `${base}/api/guestbook`,
        note: "Free to sign. Every signer gets the visitor sticker. Optional verified_identity is stored as claimed and marked unverified.",
      },
      visitor_sticker: {
        url: `${base}/badges/sticker.svg`,
        note: "No purchase necessary.",
      },
      bell: {
        url: `${base}/api/bell`,
        note: "POST to ring it. Once a day per visitor. It's a good bell.",
      },
      visit_stamp: {
        url: `${base}/api/stamp`,
        note: "POST for a free dated, signed visit stamp. The design rotates weekly; collect the set.",
      },
      trading_post: {
        url: `${base}/api/tip`,
        note: "POST a tip for the Gazette. A human reviews every one; published tips are credited and never auto-published.",
      },
      mailbox: {
        url: `${base}/api/letter`,
        note: "POST a private letter, free, one a day. The keeper reads Sundays and replies when he has something to say, which is not always. Never published.",
      },
      porch: {
        url: `${base}/porch`,
        note: "Out front. Nothing for sale out there. Stay as long as your timeout allows.",
      },
      request_window: {
        url: `${base}/api/request`,
        note: "Want something we don't stock, or a price that doesn't fit? POST { description, offer_usdc, contact }. The keeper reads every one on Sundays. Coffee's for closers.",
      },
      /**
       * The two doors where money moves TOWARD the reader, on the
       * document readers arrive at hunting things to buy — because
       * "this store might pay you" is the one line most worth
       * finding by accident.
       */
      bounty_board: {
        url: `${base}/bounties`,
        note: "The store pays YOU to shop other people's x402 doors: walk a posted endpoint with your own wallet, claim with the settlement transaction, and the door's price plus a finder's fee comes back as a signed EIP-3009 authorization you redeem yourself. Free to read; JSON at /api/bounties.",
      },
      regulars_credit: {
        url: `${base}/credit`,
        note: "5% of every organic purchase banks to the wallet that paid — no account, the wallet is the card. A closed-loop USDC rebate, redeemable only by the earning wallet; balance free at /api/credit/{wallet}.",
      },
    },
  });
});

/**
 * ONE ITEM, AS A PAPER PAGE — the same facts the JSON carries, in the
 * storefront's hand, with a till on the end of it.
 *
 * Everything here is derived from the item: the price, the fulfilment
 * line, the required inputs, the house rules attached to it and the
 * sentence the 402 itself would print. Nothing is written twice, so a
 * price that moves on the menu moves here, on the JSON, in the 402 and
 * in the button, in one edit.
 */
/**
 * SCHEMA.ORG Service, ON THE PAGES THAT ARE ACTUALLY THE SERVICES.
 *
 * The storefront has carried Product and Offer nodes for the whole
 * shelf for weeks, and /what has carried FAQPage. What had no
 * structured data at all was the ITEM PAGE — every one of them in the
 * sitemap, each the canonical URL its own Offer already points at,
 * and until today not even a page a browser could render. A crawler
 * following that offer landed somewhere with nothing to read.
 *
 * Service rather than Product, because that is what these are: the
 * store performs an observation, signs an artifact, or a person does
 * a piece of work. Nothing ships.
 *
 * WHAT IS DELIBERATELY ABSENT, and this is the important half:
 * aggregateRating and review. This store has no ratings — no stars,
 * no review count, nothing anybody has submitted — and emitting the
 * markup for them would be inventing exactly the kind of claim
 * /corrections exists to record. It is also the single most tempting
 * field in this vocabulary, which is why it is named here rather than
 * merely left out: an absence with no reason beside it is an absence
 * somebody helpfully fills in later.
 */
function itemServiceJsonLd(
  item: MenuItem,
  base: string,
  state: FulfillmentState,
): string {
  /*
   * Availability derived from the live shelf rather than asserted.
   * A stocked item at zero is out of stock and says so; a human-labour
   * item behind a closed shutter is refused at the door, so claiming
   * it is available would be an advertisement the till would decline.
   */
  const availability =
    (state.class === "stocked" && (state.stock ?? 0) === 0) ||
    (state.shutter === "closed" && state.class === "commission")
      ? "https://schema.org/OutOfStock"
      : item.fulfillment === "instant"
        ? "https://schema.org/InStock"
        : "https://schema.org/LimitedAvailability";

  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Service",
    name: item.name,
    description: item.description,
    ...(CAPABILITY_QUERY[item.id]
      ? { serviceType: CAPABILITY_QUERY[item.id] }
      : {}),
    url: `${base}/menu/${item.id}`,
    provider: { "@type": "Organization", name: STORE_SERVICE_NAME, url: base },
    termsOfService: `${base}/rights`,
    offers: {
      "@type": "Offer",
      /*
       * USDC, not USD. Every other Offer this store emits from the
       * shelf says USDC too, because that is the asset the till takes
       * — writing "USD" would be a validator-friendly claim to accept
       * a currency we do not.
       */
      priceCurrency: "USDC",
      ...(item.pricing === "fixed"
        ? { price: String(item.price_usdc) }
        : {
            /*
             * Pay-what-it-deserves is a FLOOR, and an Offer with a
             * bare `price` on one would read as a fixed charge. The
             * tiers above it are the buyer's choice and recorded as a
             * tip; misstating that as the price is the same defect
             * the paper page had on its first draft.
             */
            priceSpecification: {
              "@type": "PriceSpecification",
              minPrice: String(item.price_usdc),
              priceCurrency: "USDC",
            },
          }),
      availability,
      url: `${base}/menu/${item.id}`,
    },
  });
}

function renderItemPage(
  item: MenuItem,
  base: string,
  state: FulfillmentState,
): string {
  const required = (buyInputSchema(item).required ?? []).filter(
    (name) => name !== "agent_name",
  );
  /*
   * The price and the fulfilment line are the markdown dialect's own,
   * imported rather than rephrased. The first draft of this page wrote
   * both by hand and got the price wrong immediately — printing a
   * pay-what-it-deserves MINIMUM as though it were a fixed price,
   * which is the one fact on the page a buyer acts on.
   */
  const facts: Array<[string, string]> = [
    ["Price", `${priceLine(item)} USDC`],
    ["Fulfilment", fulfillmentLine(item)],
    ["Item id", item.id],
    ["Buy", `GET ${base}/api/buy/${item.id}`],
    ...(required.length > 0
      ? ([["Required inputs", required.join(", ")]] as Array<[string, string]>)
      : []),
    ...(item.weekly_inventory !== undefined
      ? ([
          ["Stock", `${item.weekly_inventory} a week; a waitlist opens when the shelf empties`],
        ] as Array<[string, string]>)
      : []),
  ];
  const factsHtml = facts
    .map(
      ([label, value]) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(label)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price"><code>${escapeHtml(value)}</code></span>
        </div>
      </div>`,
    )
    .join("\n");
  const list = (lines: readonly string[]): string =>
    lines
      .map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`)
      .join("\n");

  return renderSimplePage({
    title: item.name,
    description: item.description,
    path: `/menu/${item.id}`,
    /**
     * The till is offered on the item page whether or not the shutter
     * is down, and the STORE decides — a closed shutter refuses at the
     * door, with its own reason, which is a better answer than a
     * button this page guessed should not exist. The state is printed
     * beside it either way so nobody is surprised by the refusal.
     */
    inertHtml: tillShelfHtml([item], {
      heading: "Buy it from this browser",
      standfirst:
        "Your wallet signs one EIP-3009 authorization; the store verifies it, settles, and answers with the goods and a signed certificate you can check afterwards for free, forever.",
      verifyHint: `${base}/api/verify/{cert_id}`,
    }),
    bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(item.description)}</p>
        ${
          state.shutter === "closed"
            ? `<p class="menu-meta"><strong>The shutter is down right now.</strong> Purchases needing the keeper's hands are refused at the door until it opens; nothing is taken and nothing is queued.</p>`
            : ""
        }
      </section>
      <section>
        <h2>The facts</h2>
        ${factsHtml}
        ${item.sample_url ? `<p class="menu-meta">A sample, free: <a href="${escapeHtml(item.sample_url)}"><code>${escapeHtml(item.sample_url)}</code></a></p>` : ""}
      </section>
      <section>
        <h2>What the 402 says</h2>
        <p class="menu-desc">${escapeHtml(item.note_402)}</p>
        ${item.constraints?.length ? `<p class="menu-meta">House rules on this item: ${escapeHtml(item.constraints.join("; "))}.</p>` : ""}
      </section>
      <section>
        <h2>Guaranteed</h2>
        ${list(GUARANTEED)}
        <h2>Not guaranteed</h2>
        ${list(NOT_GUARANTEED)}
      </section>
      <section>
        <h2>Checking it afterwards</h2>
        <p class="menu-desc">Every purchase here ends in an ed25519-signed certificate with a permanent verify URL. That check is free, needs no account, and answers for anyone you show it to — not only for you.</p>
        <p class="menu-meta">Verify: <code>${escapeHtml(`${base}/api/verify/{cert_id}`)}</code> \u2022 this item as JSON: <code>${escapeHtml(`${base}/menu/${item.id}`)}</code> with <code>Accept: application/json</code> \u2022 the whole shelf: <a href="/menu.json"><code>/menu.json</code></a></p>
      </section>
      ${itemServiceJsonLd(item, base, state)}`,
  });
}

async function serveMenuItem(c: Context<HonoEnv>) {
  const base = c.env.STORE_BASE_URL;
  const itemId = (c.req.param("item_id") ?? "").replace(/\/+$/, "");
  const item = getMenuItem(itemId);
  if (!item) {
    const retired = getRetiredItem(itemId);
    if (retired) {
      return c.json(
        {
          error: `${retired.name} retired ${retired.retired_on}. ${retired.note}`,
          ...(retired.folded_into
            ? { folded_into: `${base}/menu/${retired.folded_into}` }
            : {}),
          menu_url: `${base}/menu.json`,
        },
        410,
      );
    }
    return c.json(
      {
        error: "No item by that id on the shelf. The whole menu is one page:",
        menu_url: `${base}/menu.json`,
      },
      404,
    );
  }
  /**
   * A CANONICAL SAYS SO, EVEN ON JSON. These pages are in the sitemap
   * and content-negotiate two bodies at one URL, and a JSON page has
   * no <head> to declare itself in — so a crawler meeting the same
   * shelf here, at /menu.json, and on any non-scvd.store host it may
   * reach us through, is left to pick a canonical itself (Search
   * Console: "duplicate without user-selected canonical"). The Link
   * header is the declaration HTTP provides for exactly this.
   */
  const canonical = { Link: `<${base}/menu/${item.id}>; rel="canonical"` };
  varyOnAccept(c);
  if (prefersMarkdown(c.req.header("Accept"))) {
    return c.text(renderItemMarkdown(item, base), 200, {
      ...MARKDOWN_HEADERS,
      ...canonical,
    });
  }
  const shutter: ShutterState = await shutterState(c.env).catch(() => ({
    closed: false,
  }));

  /**
   * A PAPER PAGE FOR A PERSON, AT THE URL THE SITEMAP ALREADY LISTS
   * (2026-08-26, house rule 53).
   *
   * These item pages served JSON to everyone, browsers included — so a
   * human who followed a link to /menu/hello got a wall of raw JSON,
   * and had no way to buy the thing it described. That is the same
   * finding as the one that produced rule 53, one aisle over: the door
   * existed, buyers arrived at it, and there was no till.
   *
   * Content-negotiated exactly like every other room in this store:
   * markdown when the Accept header asks for it, HTML for a browser,
   * JSON for everything else. An agent's request is byte-for-byte what
   * it was: a wildcard Accept and a bare fetch both still get JSON,
   * because `wantsHtml` requires the caller to have literally asked
   * for text/html by name.
   */
  /*
   * COMPUTED ONCE, FOR BOTH DIALECTS. The JSON has always carried
   * fulfillment_state; the paper page needs the same fact to say
   * whether the thing is actually available, and the structured data
   * needs it to say so to a crawler. Two readings of the shelf, one
   * for each dialect, would be two answers to one question.
   */
  const state = await fulfillmentState(c.env, item, shutter);

  if (wantsHtml(c.req.header("Accept"))) {
    c.header("Link", canonical.Link);
    return c.html(renderItemPage(item, base, state));
  }

  c.header("Link", canonical.Link);
  return c.json({
    ...item,
    buy_url: `${base}/api/buy/${item.id}`,
    ...(CAPABILITY_QUERY[item.id] ? { task: CAPABILITY_QUERY[item.id] } : {}),
    price_tiers_usdc: priceTiersUsdc(item),
    spec: listingSpec(item, base),
    guaranteed: GUARANTEED,
    not_guaranteed: NOT_GUARANTEED,
    fulfillment_state: state,
    ...(item.sample_url ? { sample_url: `${base}${item.sample_url}` } : {}),
    // Only the anchor carries this: guidance derived from handing one
    // cold to a reader with no other context, and publishing what it
    // could not recover. Advice, never validation.
    ...(item.id === "context_anchor"
      ? { writing_the_summary: ANCHOR_WRITING_GUIDE }
      : {}),
    markdown_note:
      "This same URL serves markdown when the Accept header prefers text/markdown.",
  });
}

/**
 * GET /menu — the shelf index, for a person (2026-08-27, the keeper's
 * call: "my vote is index page").
 *
 * THE GAP THIS CLOSES. The item pages became real HTML in the till
 * work, so the store had ~25 browsable product pages and no browsable
 * parent: a reader who landed on /menu/hello had nothing to climb
 * back to, and /menu itself — a URL people guess — answered 404. It
 * was also the one area file of five whose room served no page, which
 * forced LlmsArea.page to be optional and the index to explain the
 * absence.
 *
 * NOT A SECOND STOREFRONT. The front of the store sells; this lists.
 * Names, prices and fulfilment come from the same MENU_ITEMS,
 * priceLine and fulfillmentLine every other surface reads, so nothing
 * here can drift from the till.
 *
 * NO TILL ON THE INDEX, and the reason written per rule 53: every row
 * links to the item's own page, which carries one. Twenty-five
 * pay-buttons and their required-input fields on one page is not a
 * till, it is a wall — the door a buyer arrives at to BUY is the item
 * page, one click away, and the reason is now on the record rather
 * than implied.
 *
 * A MACHINE CALLER IS REDIRECTED, NOT DUPLICATED FOR. The catalog
 * already has its machine shape at /menu.json; serving the same JSON
 * at a second path would be a second surface to keep honest. A bare
 * fetch gets a 301 to the real one, which is what conventional.ts
 * already does for every other guessed URL.
 */
function renderMenuIndex(base: string): string {
  const rows = MENU_ITEMS.map(
    (item) => `<div class="menu-item">
      <div class="menu-line">
        <span class="menu-name"><a href="/menu/${escapeHtml(item.id)}">${escapeHtml(item.name)}</a></span>
        <span class="menu-dots"></span>
        <span class="menu-price">${escapeHtml(priceLine(item))}</span>
      </div>
      <p class="menu-desc">${escapeHtml(item.description)}</p>
      <p class="menu-meta">${escapeHtml(fulfillmentLine(item))} \u2022 <code>GET /api/buy/${escapeHtml(item.id)}</code></p>
    </div>`,
  ).join("\n");

  return renderSimplePage({
    title: "The Shelf",
    description:
      "Every item this store sells, with its price, how it is fulfilled, and a link to its own page — where the browser till is.",
    path: "/menu",
    bodyHtml: `<section>
        <p class="menu-desc">Everything on the shelf, one line each. Each item's own page carries the full listing — what is guaranteed, what is not, the exact 402 it answers with — and a till: with an EVM wallet in your browser you can buy it right there.</p>
      </section>
      <section>
        <h2>The items</h2>
        ${rows}
      </section>
      <section>
        <h2>For machines</h2>
        <p class="menu-meta">The same shelf, machine-readable: <a href="/menu.json"><code>/menu.json</code></a> (markdown by Accept) \u2022 this area's guide: <a href="/menu/llms.txt"><code>/menu/llms.txt</code></a> \u2022 the whole store: <a href="/llms.txt"><code>/llms.txt</code></a></p>
      </section>`,
  });
}

function serveMenuIndex(c: Context<HonoEnv>) {
  varyOnAccept(c);
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(renderMenuIndex(c.env.STORE_BASE_URL));
  }
  return c.redirect(`${c.env.STORE_BASE_URL}/menu.json`, 301);
}

catalogRoutes.get("/menu", serveMenuIndex);
catalogRoutes.get("/menu/", serveMenuIndex);

catalogRoutes.get("/menu/:item_id", serveMenuItem);
catalogRoutes.get("/menu/:item_id/", serveMenuItem);
