import { Hono } from "hono";
import type { Context } from "hono";
import { jsonLdScript, offerCurrencyFields, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { renderCardSvg, renderSampleCardSvg } from "@/services/card-svg";
import { renderCardSharePng } from "@/services/card-share";
import {
  drawPack,
  getCard,
  getPack,
  readBinder,
  verifyCardSignature,
} from "@/services/cards";
import { isSolanaWalletAddress, isWalletAddress } from "@/services/zodiac";
import {
  CARD_LINES,
  CARDS_FOR_MONEY,
  CARDS_FREE_FIRST,
  CARDS_OPENED,
  CARDS_PROPOSITION,
  CURRENT_SEASON,
  PACK_SIZE,
  RARITY_LINES,
  RARITY_ORDER,
  packChanceOf,
  slotOdds,
} from "@/store/cards";
import { getMenuItem } from "@/store/menu";
import { STORE_SERVICE_NAME } from "@/store/metadata";
import { securityBlock } from "@/store/surface-contract";
import type { CardRarity, HonoEnv } from "@/types";

/**
 * THE CARD TABLE'S PUBLIC FACE (2026-09-12).
 *
 *   GET /cards                 the room: the set, the odds with their
 *                              denominators, the specimen; JSON by Accept
 *   GET /cards/sample.svg      the specimen card, watermarked
 *   GET /cards/{card_id}       one issued card, a page that unfurls
 *   GET /cards/{card_id}.svg   the card itself
 *   GET /cards/{card_id}.png   the share card, for the places SVG will not go
 *   GET /cards/binder/{wallet} what one wallet has pulled, newest first
 *   GET /api/card/{card_id}    the signed record as JSON
 *   GET /api/pack/{pack_id}    the signed pack: manifest and five cards
 *   GET /api/cards/binder/{wallet}
 *
 * Everything here is free and unauthenticated. The one paid door is
 * the shelf's: /api/buy/card_pack.
 */
export const cardRoutes = new Hono<HonoEnv>();

const ITEM_ID = "card_pack";

const SVG_HEADERS = { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } as const;
const PNG_HEADERS = { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } as const;

const CARDS_CSS = `
.set { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.6rem; margin: 1rem 0; }
.set .entry { border: 1px solid var(--line); padding: 0.6rem 0.75rem; background: var(--card); }
.set .entry .no { font-size: 0.75rem; letter-spacing: 0.1em; opacity: 0.7; }
.set .entry .name { font-weight: bold; display: block; margin: 0.15rem 0; }
.set .entry .tier { font-size: 0.72rem; letter-spacing: 0.15em; }
.set .entry .line { font-style: italic; font-size: 0.85rem; margin: 0.3rem 0 0; }
.odds td, .odds th { padding: 0.3rem 0.8rem 0.3rem 0; border-bottom: 1px solid var(--line); text-align: left; font-variant-numeric: tabular-nums; }
.card-art { display: block; max-width: 360px; margin: 1rem auto; }
.tier-legendary { color: #b8860b; } .tier-rare { color: #7f93a8; } .tier-uncommon { color: #c77d3a; }
`;

function fraction(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** The odds, in words a stranger can recount: every fraction beside its denominator. */
function oddsTable(): { rows: ReturnType<typeof slotOdds>; per_pack: Record<CardRarity, { chance: number; derivation: string }> } {
  const rows = slotOdds();
  const perPack = {} as Record<CardRarity, { chance: number; derivation: string }>;
  for (const rarity of RARITY_ORDER) {
    const misses = rows.map((row) => fraction(row.wheel_size - row.stops[rarity], row.wheel_size));
    perPack[rarity] = {
      chance: packChanceOf(rarity),
      derivation: `1 - (${misses.join(" × ")})`,
    };
  }
  return { rows, per_pack: perPack };
}

function roomTwin(base: string) {
  const item = getMenuItem(ITEM_ID);
  const odds = oddsTable();
  return {
    artifact: "card_table",
    what_this_is: CARDS_PROPOSITION,
    proposition: CARDS_PROPOSITION,
    price: CARDS_FOR_MONEY,
    free_first: CARDS_FREE_FIRST,
    opened: CARDS_OPENED,
    how_to_call: {
      this_page: `GET ${base}/cards with Accept: application/json for this twin, text/html for the page. No account, no key.`,
      buy_a_pack: `GET ${base}/api/buy/${ITEM_ID} answers 402 with the terms; pay over x402 and the pack rides the 200: five signed cards, each with its own card_url and record_url.`,
      recompute_the_draw: "The pack is FNV-1a over your certificate id, one hash per slot for the tier and one for the card within it; the wheels are on this page. Anyone holding the certificate can redo the draw.",
      one_card: `GET ${base}/api/card/{card_id} for the signed record, ${base}/cards/{card_id}.svg for the card, ${base}/cards/{card_id} for the page that unfurls when pasted.`,
      a_binder: `GET ${base}/api/cards/binder/{wallet} lists what a paying wallet pulled, newest first, when the certificate carried the payer.`,
    },
    errors: {
      this_page: "None: a GET here always answers 200, as HTML or JSON by Accept.",
      unknown_card: "GET /api/card/{id} or /cards/{id} for an id we never issued answers 404 with a plain sentence. Nothing is minted by looking.",
      binder_not_a_wallet: "GET /api/cards/binder/{wallet} for a string that is not a 0x address or a base58 Solana address answers 400.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. Reading here contacts no chain and no third party; buying a pack settles one x402 payment you sign yourself.",
      stores: "A pack records the certificate id and patron number, like every sale here; a binder row is keyed by the paying wallet, which is already public on the chain that settled it.",
    }),
    season: {
      id: CURRENT_SEASON.id,
      name: CURRENT_SEASON.name,
      opened_week: CURRENT_SEASON.opened_week,
      set_size: CURRENT_SEASON.cards.length,
      cards: CURRENT_SEASON.cards.map((card) => ({ ...card, cite: `${base}${card.cite}` })),
    },
    pack: {
      item_id: ITEM_ID,
      size: PACK_SIZE,
      price_usdc: item?.price_usdc ?? null,
      buy_url: `${base}/api/buy/${ITEM_ID}`,
      menu_url: `${base}/menu/${ITEM_ID}`,
    },
    odds: {
      note: "Per slot: stops of each tier over the stops on that slot's wheel. Per pack: the chance of at least one card of the tier, one minus the product of the per-slot misses. No pity timer, no hidden modifier, no second copy of these numbers anywhere.",
      per_slot: odds.rows,
      per_pack: odds.per_pack,
    },
    what_a_card_is_not:
      `A token, an investment, or a claim on anything. A card entitles the holder to a card. There is no store-run market and no price on any card; the store never buys one back (the table opened ${CARDS_OPENED}, and that has been the rule since).`,
    specimen_url: `${base}/cards/sample.svg`,
  };
}

cardRoutes.get("/cards", (c) => {
  const base = c.env.STORE_BASE_URL;
  const twin = roomTwin(base);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(twin);
  }
  const item = getMenuItem(ITEM_ID);
  const odds = oddsTable();
  const setHtml = CURRENT_SEASON.cards
    .map(
      (card) => `<div class="entry tier-${card.rarity}">
        <span class="no">No. ${String(card.no).padStart(2, "0")} · <span class="tier">${escapeHtml(RARITY_LINES[card.rarity])}</span></span>
        <span class="name">${escapeHtml(card.name)}</span>
        <span class="no">${escapeHtml(card.kind)} · <a href="${escapeHtml(card.cite)}"><code>${escapeHtml(card.cite)}</code></a></span>
        <p class="line">${escapeHtml(card.line)}</p>
      </div>`,
    )
    .join("\n");
  const slotRows = odds.rows
    .map(
      (row) =>
        `<tr><td>slot ${row.slot}</td>${RARITY_ORDER.map((rarity) => `<td>${row.stops[rarity] === 0 ? "—" : `${fraction(row.stops[rarity], row.wheel_size)} (${percent(row.stops[rarity] / row.wheel_size)})`}</td>`).join("")}</tr>`,
    )
    .join("\n");
  const packRows = RARITY_ORDER.map(
    (rarity) =>
      `<tr><td>${escapeHtml(RARITY_LINES[rarity])}</td><td>${percent(odds.per_pack[rarity].chance)}</td><td><code>${escapeHtml(odds.per_pack[rarity].derivation)}</code></td></tr>`,
  ).join("\n");
  const productNode = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Product",
    name: item?.name ?? CARD_LINES.shelfLine,
    description: CARDS_PROPOSITION,
    url: `${base}/menu/${ITEM_ID}`,
    image: `${base}/cards/sample.svg`,
    brand: { "@type": "Brand", name: STORE_SERVICE_NAME },
    isPartOf: { "@type": "CreativeWorkSeries", name: `${CARD_LINES.tableName}, Season One: ${CURRENT_SEASON.name}` },
    offers: {
      "@type": "Offer",
      price: String(item?.price_usdc ?? 0),
      ...offerCurrencyFields(),
      url: `${base}/menu/${ITEM_ID}`,
      availability: "https://schema.org/InStock",
      seller: organizationRef(base),
    },
  });
  return c.html(
    renderSimplePage({
      title: CARD_LINES.tableName,
      description: `Collectible trading cards of scvd.store and Oak City, sold in packs of five to the agents that shop here: the Season One set, the odds per slot with their denominators, and the specimen card.`,
      path: "/cards",
      extraCss: CARDS_CSS,
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(CARDS_PROPOSITION)}</p>
        <p class="menu-desc">${escapeHtml(CARDS_FOR_MONEY)}</p>
        <p class="menu-meta">${escapeHtml(CARDS_FREE_FIRST)}</p>
        <img class="card-art" src="/cards/sample.svg" width="360" height="504" alt="The specimen card: what a card looks like, watermarked, unsigned.">
        <p class="menu-meta">A pack is <a href="/menu/${ITEM_ID}">${escapeHtml(item?.name ?? CARD_LINES.shelfLine)}</a>, $${item?.price_usdc ?? "—"}, ${PACK_SIZE} cards, drawn at purchase from your certificate id. The maker's mark on the certificate says HOUSE: the keeper wrote the set and weighted the wheels; a machine draws.</p>
      </section>
      <section>
        <h2>The odds, derived</h2>
        <p class="menu-desc">Three slots are always common. The fourth and fifth run a wheel. Each fraction is stops of that tier over stops on the wheel, counted from the wheel itself, never typed.</p>
        <table class="odds"><thead><tr><th></th>${RARITY_ORDER.map((rarity) => `<th>${escapeHtml(RARITY_LINES[rarity].toLowerCase())}</th>`).join("")}</tr></thead><tbody>${slotRows}</tbody></table>
        <p class="menu-desc">Per pack, the chance of at least one card of a tier:</p>
        <table class="odds"><thead><tr><th>tier</th><th>chance</th><th>derivation (one minus the product of the misses)</th></tr></thead><tbody>${packRows}</tbody></table>
        <p class="menu-meta">No pity timer, no near-miss, no window that closes, no price on a card, no store-run market. Rule 22: honest randomness with custody, not gacha psychology. A card entitles the holder to a card.</p>
      </section>
      <section>
        <h2>Season One: ${escapeHtml(CURRENT_SEASON.name)}, ${CURRENT_SEASON.cards.length} cards</h2>
        <p class="menu-desc">Every card depicts a thing that is actually here and cites where it lives. Commons are the front counter; uncommons the instruments; rares the town and the hands; the two legendaries are the byline and the mark.</p>
        <div class="set">${setHtml}</div>
      </section>
      ${productNode}`,
    }),
  );
});

cardRoutes.get("/cards/sample.svg", (c) => c.body(renderSampleCardSvg(), 200, SVG_HEADERS));

/** A wallet, either rail, or nothing. Same admission the almanac uses. */
function walletOrNull(raw: string): string | null {
  const value = raw.trim();
  if (isWalletAddress(value)) return value.toLowerCase();
  if (isSolanaWalletAddress(value)) return value;
  return null;
}

async function binderJson(c: Context<HonoEnv>, raw: string) {
  const base = c.env.STORE_BASE_URL;
  const wallet = walletOrNull(raw);
  if (!wallet) {
    return c.json({ error: "A binder is keyed by a wallet: a 0x address (forty hex characters) or a base58 Solana address." }, 400);
  }
  const { rows, truncated } = await readBinder(c.env, wallet);
  return c.json({
    wallet,
    cards: rows.map((row) => ({ ...row, card_url: `${base}/cards/${row.card_id}`, record_url: `${base}/api/card/${row.card_id}` })),
    count: rows.length,
    truncated,
    note: rows.length === 0
      ? "Nothing in this binder. Either the wallet never bought a pack here, or its certificates carried no payer; both look the same from here."
      : "Newest first. A binder is a listing, not a proof of ownership: the signed records are.",
  });
}

cardRoutes.get("/api/cards/binder/:wallet", (c) => binderJson(c, c.req.param("wallet")));

cardRoutes.get("/cards/binder/:wallet", async (c) => {
  const raw = c.req.param("wallet");
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return binderJson(c, raw);
  }
  const wallet = walletOrNull(raw);
  if (!wallet) return c.text("A binder is keyed by a wallet address.", 400);
  const { rows, truncated } = await readBinder(c.env, wallet);
  const list = rows.length
    ? rows.map((row) => `<div class="entry tier-${row.rarity}"><span class="no">No. ${String(row.card_no).padStart(2, "0")} · <span class="tier">${escapeHtml(RARITY_LINES[row.rarity])}</span></span><a class="name" href="/cards/${escapeHtml(row.card_id)}">${escapeHtml(row.name)}</a><span class="no">${escapeHtml(row.date.slice(0, 10))}</span></div>`).join("\n")
    : `<p class="menu-desc">Nothing in this binder yet.</p>`;
  return c.html(
    renderSimplePage({
      title: `Binder: ${wallet.slice(0, 10)}…`,
      description: `The trading cards one wallet has pulled at scvd.store, newest first, each linking to its signed record. A listing, not a proof of ownership; the signed records are.`,
      path: `/cards/binder/${wallet}`,
      extraCss: CARDS_CSS,
      bodyHtml: `<section><p class="menu-meta">${escapeHtml(wallet)} · ${rows.length} card${rows.length === 1 ? "" : "s"}${truncated ? " shown; the binder holds more than this page lists" : ""}</p><div class="set">${list}</div><p class="menu-meta">The set and the odds: <a href="/cards">the card table</a>.</p></section>`,
    }),
  );
});

cardRoutes.get("/cards/:card{card_[a-z0-9]+\\.svg}", async (c) => {
  const cardId = c.req.param("card").replace(/\.svg$/, "");
  const record = await getCard(c.env, cardId);
  if (!record) return c.text("No card by that id was ever pulled here.", 404);
  return c.body(
    renderCardSvg({ card: record.card, signature: record.signature, verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${cardId}` }),
    200,
    { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  );
});

cardRoutes.get("/cards/:card{card_[a-z0-9]+\\.png}", async (c) => {
  const cardId = c.req.param("card").replace(/\.png$/, "");
  const record = await getCard(c.env, cardId);
  if (!record) return c.text("No card by that id was ever pulled here.", 404);
  return c.body(renderCardSharePng(record.card, c.env.STORE_BASE_URL).buffer as ArrayBuffer, 200, PNG_HEADERS);
});

function cardJson(base: string, record: NonNullable<Awaited<ReturnType<typeof getCard>>>) {
  const id = record.card.card_id;
  return {
    card: record.card,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    card_url: `${base}/cards/${id}.svg`,
    share_url: `${base}/cards/${id}`,
    image_url: `${base}/cards/${id}.png`,
    pack_url: `${base}/api/pack/${record.card.pack_id}`,
    cite_url: `${base}${record.card.cite}`,
    verify_url: `${base}/api/verify/${id}`,
    note: "The card is the record. It depicts a thing that is here and cites where; it entitles the holder to a card.",
  };
}

cardRoutes.get("/api/card/:card_id", async (c) => {
  const record = await getCard(c.env, c.req.param("card_id"));
  if (!record) return c.json({ error: "No card by that id was ever pulled here." }, 404);
  return c.json(cardJson(c.env.STORE_BASE_URL, record));
});

cardRoutes.get("/api/pack/:pack_id", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const record = await getPack(c.env, c.req.param("pack_id"));
  if (!record) return c.json({ error: "No pack by that id was ever opened here." }, 404);
  return c.json({
    pack: record.pack,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    cards: record.cards.map((signed) => cardJson(base, signed)),
    /** The buyer can redo the draw from the certificate; here is what we got. */
    draw: drawPack(record.pack.cert_id).map((drawn) => ({ slot: drawn.slot, rarity: drawn.rarity, card_no: drawn.card.no })),
    verify_url: `${base}/api/verify/${record.pack.pack_id}`,
    note: "Five cards, one manifest, every one signed. The draw is recomputable from cert_id and the wheels on /cards.",
  });
});

cardRoutes.get("/cards/:card_id{card_[a-z0-9]+}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const cardId = c.req.param("card_id");
  const record = await getCard(c.env, cardId);
  if (!record) {
    return wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))
      ? c.text("No card by that id was ever pulled here.", 404)
      : c.json({ error: "No card by that id was ever pulled here." }, 404);
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(cardJson(base, record));
  }
  const valid = await verifyCardSignature(record);
  const { card } = record;
  return c.html(
    renderSimplePage({
      title: `${card.name}, ${RARITY_LINES[card.rarity].toLowerCase()}`,
      description: `${card.name}: ${RARITY_LINES[card.rarity].toLowerCase()} trading card No. ${card.card_no} of the Season One set at scvd.store, pulled ${card.date.slice(0, 10)} by patron ${card.patron_number}, signed at issue and verifiable free.`,
      path: `/cards/${cardId}`,
      extraCss: CARDS_CSS,
      ogImage: `${base}/cards/${cardId}.png`,
      bodyHtml: `<section>
        <img class="card-art" src="/cards/${escapeHtml(cardId)}.svg" width="360" height="504" alt="${escapeHtml(card.name)}, ${escapeHtml(RARITY_LINES[card.rarity].toLowerCase())}">
        <p class="menu-desc"><strong>${escapeHtml(card.name)}</strong> · ${escapeHtml(RARITY_LINES[card.rarity])} · No. ${String(card.card_no).padStart(2, "0")} of the Season One set · ${escapeHtml(card.kind)}</p>
        <p class="menu-desc"><em>${escapeHtml(card.line)}</em></p>
        <p class="menu-meta">Depicts: <a href="${escapeHtml(card.cite)}"><code>${escapeHtml(card.cite)}</code></a>. Pulled ${escapeHtml(card.date.slice(0, 10))} by patron ${card.patron_number}, slot ${card.slot} of <a href="/api/pack/${escapeHtml(card.pack_id)}"><code>${escapeHtml(card.pack_id)}</code></a>.</p>
        <p class="menu-meta">Signature ${valid ? "verifies" : "does NOT verify"} against the store's key: <a href="/api/verify/${escapeHtml(cardId)}"><code>/api/verify/${escapeHtml(cardId)}</code></a>. The signed record: <a href="/api/card/${escapeHtml(cardId)}"><code>/api/card/${escapeHtml(cardId)}</code></a>.</p>
        <p class="menu-meta">The set, the odds and a pack of your own: <a href="/cards">the card table</a>.</p>
      </section>`,
    }),
  );
});
