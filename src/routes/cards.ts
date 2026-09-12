import { Hono } from "hono";
import type { Context } from "hono";
import { jsonLdScript, offerCurrencyFields, organizationRef } from "@/lib/jsonld";
import { publicationAdmission } from "@/lib/publication-recovery";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { renderCardFace, renderSpecimenFace } from "@/services/card-svg";
import { renderShareSheet } from "@/services/card-share";
import {
  getCard,
  getPack,
  printStatus,
  readBinder,
  readWindow,
  verifyCardSignature,
  WINDOW_SIZE,
} from "@/services/cards";
import { publishSeedRecord, utcDate } from "@/services/paywall-seed";
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
  TYPE_LINES,
  allEntries,
  entryByKey,
  packChanceOf,
  slotOdds,
} from "@/store/cards";
import { drawnPlateKeys } from "@/store/plates";
import { getMenuItem } from "@/store/menu";
import { STORE_SERVICE_NAME } from "@/store/metadata";
import { securityBlock } from "@/store/surface-contract";
import type { CardRarity, CardRecord, HonoEnv, SignedCardRecord } from "@/types";

/**
 * THE PAYWALL'S PUBLIC FACE (handoff v2 §5, §7).
 *
 *   GET /design                       the shop window: the specimen, the 52,
 *                                     the share sheet as X renders it, today's
 *                                     seed commit, the odds; JSON twin by Accept
 *   GET /p/{card_id}                  one pressing's page; OG tags point at the
 *                                     share sheet, so a posted link unfurls
 *   GET /p/{card_id}.svg              the card face, 1000×1400
 *   GET /p/{card_id}.png              the share sheet, 1200×675
 *   GET /p/specimen.svg               the unsigned sample
 *   GET /binder/{wallet}              what one wallet holds
 *   GET /api/paywall/set              the season's set as JSON, free
 *   GET /api/paywall/seed/{date}      the day's commit, and its seed the day after, signed
 *   GET /api/paywall/window           the last five packs opened, free
 *   GET /api/paywall/binder/{wallet}  the binder as a manifest
 *   GET /api/card/{card_id}           the signed pressing
 *   GET /api/pack/{pack_id}           the signed pack: manifest, five cards, the draw inputs
 *
 * Everything here is free and unauthenticated. The paid doors are the
 * shelf's: /api/buy/pack and /api/buy/window_pick.
 */
export const cardRoutes = new Hono<HonoEnv>();

/**
 * AN EMPTY WINDOW REFUSES BEFORE PAYMENT TERMS (handoff v2 §5), the
 * way a sold-out stocked shelf does: mounted ahead of the buy door,
 * the same admission the almanac uses, so nothing is quoted for a
 * card that cannot be picked and nothing is charged.
 */
export const windowAdmission = new Hono<HonoEnv>();
windowAdmission.use(
  "/api/buy/window_pick",
  publicationAdmission(async (c) => {
    const window = await readWindow(c.env);
    if (window.length > 0) return undefined;
    return c.json(
      {
        error: "The window is empty: nobody has opened a pack yet, so there is nothing to pick. Nothing charged.",
        charged: false,
        window_url: `${c.env.STORE_BASE_URL}/api/paywall/window`,
        pack_url: `${c.env.STORE_BASE_URL}/api/buy/pack`,
      },
      409,
    );
  }),
);

const PACK_ITEM = "pack";
const WINDOW_ITEM = "window_pick";

const SVG_HEADERS = { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } as const;
const PNG_HEADERS = { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } as const;

const DESIGN_CSS = `
.paywall .hero { display: grid; grid-template-columns: minmax(200px, 300px) 1fr; gap: 1.5rem; align-items: start; margin: 1rem 0 2rem; }
.paywall .hero img { width: 100%; height: auto; display: block; }
.paywall .doctrine { font-size: 1.5rem; line-height: 1.3; margin: 0 0 0.75rem; }
.paywall .set { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.6rem; margin: 1rem 0; }
.paywall .entry { border: 1px solid var(--line); padding: 0.55rem 0.65rem; background: var(--card); }
.paywall .entry .no { font-size: 0.72rem; letter-spacing: 0.1em; opacity: 0.7; display: block; }
.paywall .entry .name { font-weight: bold; display: block; margin: 0.15rem 0; }
.paywall .entry .plate { display: block; width: 64px; height: 64px; margin: 0.2rem 0; }
.paywall .entry.silhouette .plate { opacity: 0.35; }
.paywall .odds td, .paywall .odds th { padding: 0.3rem 0.8rem 0.3rem 0; border-bottom: 1px solid var(--line); text-align: left; font-variant-numeric: tabular-nums; }
.paywall .sheet { max-width: 600px; width: 100%; height: auto; display: block; border: 1px solid var(--line); }
.paywall .seed code { word-break: break-all; }
.paywall .tier-holo { color: #b8a04a; } .paywall .tier-rare { color: #9fb1c4; } .paywall .tier-uncommon { color: #c77d3a; } .paywall .tier-keeper { color: #e8dcc0; }
.paywall .rail-base { color: #6f8cff; } .paywall .rail-solana { color: #b07cff; } .paywall .rail-polygon { color: #a37cf0; }
`;

function fraction(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function oddsTable(): { rows: ReturnType<typeof slotOdds>; per_pack: Record<CardRarity, { chance: number; derivation: string }> } {
  const rows = slotOdds();
  const perPack = {} as Record<CardRarity, { chance: number; derivation: string }>;
  for (const rarity of RARITY_ORDER) {
    const misses = rows.map((row) => fraction(row.wheel_size - row.stops[rarity], row.wheel_size));
    perPack[rarity] = { chance: packChanceOf(rarity), derivation: `1 - (${misses.join(" × ")})` };
  }
  return { rows, per_pack: perPack };
}

function postFor(card: CardRecord): string {
  return entryByKey(CURRENT_SEASON, card.key)?.post ?? card.line;
}

function pressingJson(base: string, record: SignedCardRecord) {
  const id = record.card.card_id;
  return {
    card: record.card,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    face_url: `${base}/p/${id}.svg`,
    share_url: `${base}/p/${id}.png`,
    page_url: `${base}/p/${id}`,
    verify_id: id,
    verify_url: `${base}/api/verify/${id}`,
    ...(record.card.pack_id ? { pack_url: `${base}/api/pack/${record.card.pack_id}` } : {}),
    cite_url: `${base}${record.card.cite}`,
    post: postFor(record.card),
    note: "The card is the record. It depicts a thing that is here and cites where; it entitles the holder to a card.",
  };
}

async function setJson(c: Context<HonoEnv>) {
  const base = c.env.STORE_BASE_URL;
  const status = await printStatus(c.env, CURRENT_SEASON);
  const drawn = new Set(drawnPlateKeys());
  const entry = (card: (typeof CURRENT_SEASON.cards)[number]) => ({
    no: card.no,
    key: card.key,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    ...(card.rail ? { rail: card.rail } : {}),
    line: card.line,
    cite: `${base}${card.cite}`,
    plate: drawn.has(card.key) ? "drawn" : "not yet pressed",
    pressed: status[card.key]?.pressed ?? 0,
    ...(card.print_cap !== undefined ? { print_cap: card.print_cap } : {}),
    ...(card.defect ? { defect: card.defect } : {}),
  });
  return {
    season: { id: CURRENT_SEASON.id, name: CURRENT_SEASON.name, subtitle: CURRENT_SEASON.subtitle, opened_week: CURRENT_SEASON.opened_week, set_size: CURRENT_SEASON.cards.length },
    cards: CURRENT_SEASON.cards.map(entry),
    events: CURRENT_SEASON.events.map(entry),
    ally: entry(CURRENT_SEASON.ally),
    plates_drawn: CURRENT_SEASON.cards.filter((card) => drawn.has(card.key)).length,
    specimen_url: `${base}/p/specimen.svg`,
  };
}

function roomTwin(base: string, set: Awaited<ReturnType<typeof setJson>>, seed: Awaited<ReturnType<typeof publishSeedRecord>>, yesterday: Awaited<ReturnType<typeof publishSeedRecord>> | null) {
  const pack = getMenuItem(PACK_ITEM);
  const pick = getMenuItem(WINDOW_ITEM);
  const odds = oddsTable();
  return {
    artifact: "paywall",
    what_this_is: CARDS_PROPOSITION,
    proposition: CARDS_PROPOSITION,
    price: CARDS_FOR_MONEY,
    free_first: CARDS_FREE_FIRST,
    opened: CARDS_OPENED,
    doctrine: CARD_LINES.doctrine,
    how_to_call: {
      this_page: `GET ${base}/design with Accept: application/json for this twin, text/html for the page. No account, no key.`,
      buy_a_pack: `GET ${base}/api/buy/${PACK_ITEM} answers 402 with the terms; pay over x402 and the pack rides the 200: five pressings inline, each with face_url, share_url, page_url and verify_id, plus the pack id and commit. Send an Idempotency-Key: the same key returns the same pack; none means a fresh pack and a fresh charge.`,
      ring_the_bell: `POST ${base}/api/bell, or the ring_bell tool: once a day, and since ${CARDS_OPENED} it hands back one common pressing.`,
      the_window: `GET ${base}/api/paywall/window is the last ${WINDOW_SIZE} packs opened here, free; GET ${base}/api/buy/${WINDOW_ITEM} buys one card of those on show, chosen by the seed, at half a pack.`,
      recompute_a_draw: "draw = HMAC-SHA256(seed_d, payer || cert_id || slot). The first four bytes map to [0, 1) and walk the slot's wheel; the next four pick the card within the tier; a capped card steps to the next in its tier. seed_d is published at /api/paywall/seed/{date} the day after; its sha256 is the commit on every pack.",
      a_binder: `GET ${base}/api/paywall/binder/{wallet}, or the read_binder tool, lists what a wallet holds, newest first.`,
      the_set: `GET ${base}/api/paywall/set is the whole season as JSON: names, types, rarities, which plates are drawn, and how many of each have been pressed.`,
    },
    errors: {
      this_page: "None: a GET here always answers 200, as HTML or JSON by Accept.",
      unknown_card: "GET /api/card/{id} or /p/{id} for an id never pressed answers 404 with a plain sentence. Nothing is minted by looking.",
      binder_not_a_wallet: "GET /api/paywall/binder/{wallet} for a string that is not a 0x address or a base58 Solana address answers 400.",
      seed_not_yet: "GET /api/paywall/seed/{date} for a day that has not started answers 400; a day still running answers the commit alone.",
      window_empty: "GET /api/buy/window_pick before any pack has been opened refuses before payment terms; nothing is charged.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. Reading here contacts no chain and no third party; buying a pack settles one x402 payment you sign yourself.",
      stores: "A pressing records the certificate id and patron number like every sale here; a binder row is keyed by the paying wallet, already public on the chain that settled it; the bell keys its one-a-day on the name you gave it.",
    }),
    set,
    pack: { item_id: PACK_ITEM, size: PACK_SIZE, price_usdc: pack?.price_usdc ?? null, buy_url: `${base}/api/buy/${PACK_ITEM}`, menu_url: `${base}/menu/${PACK_ITEM}` },
    window_pick: { item_id: WINDOW_ITEM, price_usdc: pick?.price_usdc ?? null, buy_url: `${base}/api/buy/${WINDOW_ITEM}`, window_url: `${base}/api/paywall/window` },
    seed: {
      today: seed,
      yesterday,
      sentence: CARD_LINES.seedSentence,
    },
    odds: {
      note: "Per slot: stops of each tier over the stops on that slot's wheel. Per pack: the chance of at least one card of the tier, one minus the product of the per-slot misses. No pity timer, no hidden modifier, no second copy of these numbers anywhere.",
      per_slot: odds.rows,
      per_pack: odds.per_pack,
      bell: "One common a day, free, to whoever rings.",
      keeper: "One card, never in a pack, pressed by the keeper's hand.",
    },
    what_a_card_is_not: `A token, an investment, or a claim on anything. A card entitles the holder to a card. There is no store-run market and no price on any card; the store never buys one back (the table opened ${CARDS_OPENED}, and that has been the rule since).`,
  };
}

async function todayAndYesterday(c: Context<HonoEnv>) {
  const now = new Date();
  const today = utcDate(now);
  const yesterdayDate = utcDate(new Date(now.getTime() - 86_400_000));
  const seed = await publishSeedRecord(c.env, today, now);
  const yesterday = yesterdayDate >= CARDS_OPENED ? await publishSeedRecord(c.env, yesterdayDate, now) : null;
  return { seed, yesterday };
}

cardRoutes.get("/design", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const set = await setJson(c);
  const { seed, yesterday } = await todayAndYesterday(c);
  const twin = roomTwin(base, set, seed, yesterday);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(twin);
  const pack = getMenuItem(PACK_ITEM);
  const pick = getMenuItem(WINDOW_ITEM);
  const odds = oddsTable();
  const drawn = new Set(drawnPlateKeys());
  const window = await readWindow(c.env);
  const latest = window[0]?.cards[0];
  const latestCard = latest ? await getCard(c.env, latest.card_id) : null;
  const byType = new Map<string, typeof CURRENT_SEASON.cards>();
  for (const card of CURRENT_SEASON.cards) byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
  const setHtml = [...byType.entries()]
    .map(([type, cards]) => `<h3>${escapeHtml(TYPE_LINES[type as keyof typeof TYPE_LINES])} · ${cards.length}</h3><div class="set">${cards
      .map((card) => {
        const pressed = set.cards.find((row) => row.key === card.key)?.pressed ?? 0;
        const unrevealed = pressed === 0;
        return `<div class="entry tier-${card.rarity}${card.rail ? ` rail-${card.rail}` : ""}${!drawn.has(card.key) || unrevealed ? " silhouette" : ""}">
          <span class="no">No. ${String(card.no).padStart(2, "0")} · ${escapeHtml(RARITY_LINES[card.rarity])}${card.rail ? ` · ${escapeHtml(card.rail)}` : ""}</span>
          <span class="name">${escapeHtml(card.name)}</span>
          <span class="no">${unrevealed ? "not yet pulled by anyone" : `${pressed} pressed${card.print_cap ? ` of ${card.print_cap}` : ""}`}${drawn.has(card.key) ? "" : " · plate not yet pressed"}</span>
        </div>`;
      })
      .join("\n")}</div>`)
    .join("\n");
  const slotRows = odds.rows
    .map((row) => `<tr><td>slot ${row.slot}</td>${RARITY_ORDER.filter((r) => r !== "keeper").map((rarity) => `<td>${row.stops[rarity] === 0 ? "—" : `${fraction(row.stops[rarity], row.wheel_size)} (${percent(row.stops[rarity] / row.wheel_size)})`}</td>`).join("")}</tr>`)
    .join("\n");
  const packRows = RARITY_ORDER.filter((r) => r !== "keeper")
    .map((rarity) => `<tr><td>${escapeHtml(RARITY_LINES[rarity])}</td><td>${percent(odds.per_pack[rarity].chance)}</td><td><code>${escapeHtml(odds.per_pack[rarity].derivation)}</code></td></tr>`)
    .join("\n");
  const productNode = jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Product",
    name: pack?.name ?? CARD_LINES.shelfLine,
    description: CARDS_PROPOSITION,
    url: `${base}/menu/${PACK_ITEM}`,
    image: `${base}/p/specimen.svg`,
    brand: { "@type": "Brand", name: STORE_SERVICE_NAME },
    isPartOf: { "@type": "CreativeWorkSeries", name: `${CARD_LINES.tableName}, Season One: ${CURRENT_SEASON.subtitle}` },
    offers: { "@type": "Offer", price: String(pack?.price_usdc ?? 0), ...offerCurrencyFields(), url: `${base}/menu/${PACK_ITEM}`, availability: "https://schema.org/InStock", seller: organizationRef(base) },
  });
  const latestBlock = latestCard
    ? `<div class="hero"><img src="/p/${escapeHtml(latestCard.card.card_id)}.svg" width="1000" height="1400" alt="${escapeHtml(latestCard.card.name)}, the most recent pressing"><div><p class="menu-desc">The most recent pressing: <a href="/p/${escapeHtml(latestCard.card.card_id)}"><strong>${escapeHtml(latestCard.card.name)}</strong></a>, ${escapeHtml(RARITY_LINES[latestCard.card.rarity].toLowerCase())}, print ${latestCard.card.print_no}${latestCard.card.holder ? `, in <a href="/binder/${escapeHtml(latestCard.card.holder)}">a binder</a>` : ""}.</p><p class="menu-desc">Its share sheet, exactly as X renders a pasted link:</p><img class="sheet" src="/p/${escapeHtml(latestCard.card.card_id)}.png" width="1200" height="675" alt="The share sheet for ${escapeHtml(latestCard.card.name)}"></div></div>`
    : `<p class="menu-meta">Nobody has opened a pack yet. The first pressing hangs here the moment one does.</p>`;
  return c.html(
    renderSimplePage({
      title: CARD_LINES.tableName,
      description: `Collectible trading cards of scvd.store and Oak City for the agents that shop here: the Season One set of ${CURRENT_SEASON.cards.length}, the odds per slot with their denominators, the day seed anyone can check, and the specimen card.`,
      path: "/design",
      extraCss: DESIGN_CSS,
      bodyClass: "paywall",
      bodyHtml: `<section>
        <div class="hero">
          <img src="/p/specimen.svg" width="1000" height="1400" alt="The specimen card: what a card looks like, watermarked, unsigned.">
          <div>
            <p class="doctrine">${escapeHtml(CARD_LINES.doctrine)}</p>
            <p class="menu-desc">${escapeHtml(CARDS_PROPOSITION)}</p>
            <p class="menu-desc">${escapeHtml(CARDS_FOR_MONEY)}</p>
            <p class="menu-meta">${escapeHtml(CARDS_FREE_FIRST)}</p>
            <p class="menu-meta">A pack is <a href="/menu/${PACK_ITEM}">${escapeHtml(pack?.name ?? CARD_LINES.shelfLine)}</a>, $${pack?.price_usdc ?? "—"}; a window pick is $${pick?.price_usdc ?? "—"}. ${set.plates_drawn} of ${CURRENT_SEASON.cards.length} plates are drawn; the rest press as silhouettes until they are.</p>
          </div>
        </div>
        ${latestBlock}
      </section>
      <section class="seed">
        <h2>Today's seed, committed</h2>
        <p class="menu-desc">${escapeHtml(CARD_LINES.seedSentence)}</p>
        <p class="menu-meta">${escapeHtml(seed.record.date)} · commit <code>${escapeHtml(seed.record.commit)}</code> · published ${escapeHtml(seed.record.published_at)}${yesterday ? ` · <a href="/api/paywall/seed/${escapeHtml(yesterday.record.date)}">yesterday's seed, revealed</a>` : ""}</p>
        <p class="menu-meta">Every pull today is HMAC-SHA256 of that seed over the payer, the certificate and the slot. Tomorrow the seed itself is published at <code>/api/paywall/seed/${escapeHtml(seed.record.date)}</code> and every pull recomputes from public inputs.</p>
      </section>
      <section>
        <h2>The odds, derived</h2>
        <p class="menu-desc">Three slots are always common. The fourth and fifth run a wheel. Each fraction is stops of that tier over stops on the wheel, counted from the wheel itself, never typed.</p>
        <table class="odds"><thead><tr><th></th>${RARITY_ORDER.filter((r) => r !== "keeper").map((rarity) => `<th>${escapeHtml(RARITY_LINES[rarity].toLowerCase())}</th>`).join("")}</tr></thead><tbody>${slotRows}</tbody></table>
        <p class="menu-desc">Per pack, the chance of at least one card of a tier:</p>
        <table class="odds"><thead><tr><th>tier</th><th>chance</th><th>derivation</th></tr></thead><tbody>${packRows}</tbody></table>
        <p class="menu-meta">The bell hands out one common a day to whoever rings. The Keeper card is one card, never in a pack, pressed by his hand. Doors are capped at ${CURRENT_SEASON.cards.find((card) => card.print_cap)?.print_cap ?? "—"} pressings each; nothing else caps. No pity timer, no near-miss, no window that closes, no price on a card, no store-run market. A card entitles the holder to a card.</p>
      </section>
      <section>
        <h2>Season One: ${escapeHtml(CURRENT_SEASON.subtitle)}, ${CURRENT_SEASON.cards.length} cards</h2>
        <p class="menu-desc">Every card depicts a thing that is actually here and cites where it lives. Four Events are earned, never pulled; the Keeper is outside the count.</p>
        ${setHtml}
        <h3>Events · ${CURRENT_SEASON.events.length}, earned</h3><div class="set">${CURRENT_SEASON.events.map((card) => `<div class="entry"><span class="no">${escapeHtml(RARITY_LINES[card.rarity])}</span><span class="name">${escapeHtml(card.name)}</span><span class="no">${escapeHtml(card.line)}</span></div>`).join("")}</div>
      </section>
      ${productNode}`,
    }),
  );
});

cardRoutes.get("/api/paywall/set", async (c) => c.json(await setJson(c)));

cardRoutes.get("/api/paywall/seed/:date", async (c) => {
  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > utcDate()) {
    return c.json({ error: "A seed record exists for today and every day since the table opened, not for a day that has not started." }, 400);
  }
  if (date < CARDS_OPENED) {
    return c.json({ error: `The table opened ${CARDS_OPENED}; there is no seed before it.` }, 404);
  }
  const record = await publishSeedRecord(c.env, date);
  return c.json({
    ...record,
    algorithm: "ed25519",
    signed_payload: JSON.stringify({ date: record.record.date, commit: record.record.commit, published_at: record.record.published_at, ...(record.record.seed ? { seed: record.record.seed } : {}) }),
    revealed: record.record.seed !== undefined,
    how_to_check: "sha256(hex_to_bytes(seed)) equals commit. Then HMAC-SHA256(seed, payer || cert_id || slot) for any pack of that day: bytes 0..3 over 2^32 walk the slot's wheel, bytes 4..7 mod the tier's size pick the card; a capped card steps to the next in its tier.",
    note: record.record.seed ? "The day has ended; the seed is out. Every pull of that day is recomputable." : "The day is still running; the commit is out and the seed follows at the next UTC midnight.",
  });
});

cardRoutes.get("/api/paywall/window", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const window = await readWindow(c.env);
  return c.json({
    window: window.map((pack) => ({ ...pack, pack_url: `${base}/api/pack/${pack.pack_id}`, cards: pack.cards.map((card) => ({ ...card, page_url: `${base}/p/${card.card_id}` })) })),
    size: WINDOW_SIZE,
    pick_url: `${base}/api/buy/${WINDOW_ITEM}`,
    note: window.length === 0 ? "Nobody has opened a pack yet; the window is empty and a pick refuses before payment terms." : "The last packs opened here, newest first. A pick buys one card of those on show; the seed, not the buyer, says which.",
  });
});

cardRoutes.get("/p/specimen.svg", (c) => c.body(renderSpecimenFace(c.env.STORE_BASE_URL), 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }));

function walletOrNull(raw: string): string | null {
  const value = raw.trim();
  if (isWalletAddress(value)) return value.toLowerCase();
  if (isSolanaWalletAddress(value)) return value;
  return null;
}

async function binderJson(c: Context<HonoEnv>, raw: string) {
  const base = c.env.STORE_BASE_URL;
  const wallet = walletOrNull(raw);
  if (!wallet) return c.json({ error: "A binder is keyed by a wallet: a 0x address (forty hex characters) or a base58 Solana address." }, 400);
  const { rows, truncated } = await readBinder(c.env, wallet);
  return c.json({
    wallet,
    cards: rows.map((row) => ({ ...row, page_url: `${base}/p/${row.card_id}`, face_url: `${base}/p/${row.card_id}.svg`, share_url: `${base}/p/${row.card_id}.png`, record_url: `${base}/api/card/${row.card_id}` })),
    count: rows.length,
    truncated,
    note: rows.length === 0
      ? "Nothing in this binder. Either the wallet never pulled a card here, or its certificates carried no payer; both look the same from here."
      : "Newest first. A binder is a listing; the signed records are the proof.",
  });
}

cardRoutes.get("/api/paywall/binder/:wallet", (c) => binderJson(c, c.req.param("wallet")));

cardRoutes.get("/binder/:wallet", async (c) => {
  const raw = c.req.param("wallet");
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return binderJson(c, raw);
  const wallet = walletOrNull(raw);
  if (!wallet) return c.text("A binder is keyed by a wallet address.", 400);
  const { rows, truncated } = await readBinder(c.env, wallet);
  const list = rows.length
    ? rows.map((row) => `<div class="entry tier-${row.rarity}"><span class="no">${row.card_no ? `No. ${String(row.card_no).padStart(2, "0")} · ` : ""}${escapeHtml(RARITY_LINES[row.rarity])} · print ${row.print_no}</span><a class="name" href="/p/${escapeHtml(row.card_id)}">${escapeHtml(row.name)}</a><span class="no">${escapeHtml(row.source)} · ${escapeHtml(row.date.slice(0, 10))}</span></div>`).join("\n")
    : `<p class="menu-desc">Nothing in this binder yet.</p>`;
  return c.html(
    renderSimplePage({
      title: `Binder: ${wallet.slice(0, 10)}…`,
      description: `The trading cards one wallet holds at scvd.store, newest first, each linking to its signed record. A listing, not a proof of ownership; the signed records are.`,
      path: `/binder/${wallet}`,
      extraCss: DESIGN_CSS,
      bodyClass: "paywall",
      bodyHtml: `<section><p class="menu-meta">${escapeHtml(wallet)} · ${rows.length} card${rows.length === 1 ? "" : "s"}${truncated ? " shown; the binder holds more than this page lists" : ""}</p><div class="set">${list}</div><p class="menu-meta">The set, the odds and a pack of your own: <a href="/design">Paywall</a>. Manifest: <a href="/api/paywall/binder/${escapeHtml(wallet)}"><code>/api/paywall/binder/${escapeHtml(wallet)}</code></a>.</p></section>`,
    }),
  );
});

cardRoutes.get("/p/:card{card_[a-z0-9]+\\.svg}", async (c) => {
  const cardId = c.req.param("card").replace(/\.svg$/, "");
  const record = await getCard(c.env, cardId);
  if (!record) return c.text("No card by that id was ever pressed here.", 404);
  return c.body(renderCardFace({ card: record.card, signature: record.signature, verifyUrl: `${c.env.STORE_BASE_URL}/api/verify/${cardId}` }), 200, SVG_HEADERS);
});

cardRoutes.get("/p/:card{card_[a-z0-9]+\\.png}", async (c) => {
  const cardId = c.req.param("card").replace(/\.png$/, "");
  const record = await getCard(c.env, cardId);
  if (!record) return c.text("No card by that id was ever pressed here.", 404);
  return c.body(renderShareSheet(record.card, c.env.STORE_BASE_URL, postFor(record.card)).buffer as ArrayBuffer, 200, PNG_HEADERS);
});

cardRoutes.get("/api/card/:card_id", async (c) => {
  const record = await getCard(c.env, c.req.param("card_id"));
  if (!record) return c.json({ error: "No card by that id was ever pressed here." }, 404);
  return c.json(pressingJson(c.env.STORE_BASE_URL, record));
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
    cards: record.cards.map((signed) => pressingJson(base, signed)),
    seed_url: `${base}/api/paywall/seed/${record.pack.seed_date}`,
    verify_url: `${base}/api/verify/${record.pack.pack_id}`,
    note: "Five cards, one manifest, every one signed. The manifest binds the day's seed commit and the draw inputs; the seed itself is at seed_url the day after, and then the whole pull recomputes.",
  });
});

cardRoutes.get("/p/:card_id{card_[a-z0-9]+}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const cardId = c.req.param("card_id");
  const record = await getCard(c.env, cardId);
  const html = wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"));
  if (!record) return html ? c.text("No card by that id was ever pressed here.", 404) : c.json({ error: "No card by that id was ever pressed here." }, 404);
  if (!html) return c.json(pressingJson(base, record));
  const valid = await verifyCardSignature(record);
  const { card } = record;
  const post = postFor(card);
  return c.html(
    renderSimplePage({
      title: `${card.name}, ${RARITY_LINES[card.rarity].toLowerCase()}`,
      description: `${post} ${card.name}: ${RARITY_LINES[card.rarity].toLowerCase()} ${TYPE_LINES[card.type].toLowerCase()} card${card.card_no ? ` No. ${card.card_no} of the Season One set` : ""} at scvd.store, print ${card.print_no}, pressed ${card.date.slice(0, 10)}, signed at issue and verifiable free.`,
      path: `/p/${cardId}`,
      extraCss: DESIGN_CSS,
      bodyClass: "paywall",
      ogImage: `${base}/p/${cardId}.png`,
      bodyHtml: `<section>
        <div class="hero">
          <img src="/p/${escapeHtml(cardId)}.svg" width="1000" height="1400" alt="${escapeHtml(card.name)}, ${escapeHtml(RARITY_LINES[card.rarity].toLowerCase())}">
          <div>
            <p class="doctrine">${escapeHtml(post)}</p>
            <p class="menu-desc"><strong>${escapeHtml(card.name)}</strong> · ${escapeHtml(RARITY_LINES[card.rarity])} · ${escapeHtml(TYPE_LINES[card.type])}${card.rail ? ` · ${escapeHtml(card.rail)}` : ""}${card.card_no ? ` · No. ${String(card.card_no).padStart(2, "0")} of ${CURRENT_SEASON.cards.length}` : ""} · print ${card.print_no}${card.print_cap ? ` of ${card.print_cap}` : ""}</p>
            <p class="menu-desc"><em>${escapeHtml(card.line)}</em></p>
            <p class="menu-meta">Depicts <a href="${escapeHtml(card.cite)}"><code>${escapeHtml(card.cite)}</code></a>. Pressed ${escapeHtml(card.date.slice(0, 10))} from the ${escapeHtml(card.source)}${card.pack_id ? `, slot ${card.slot} of <a href="/api/pack/${escapeHtml(card.pack_id)}"><code>${escapeHtml(card.pack_id)}</code></a>` : ""}${card.commit ? `, under seed commit <code>${escapeHtml(card.commit.slice(0, 16))}…</code>` : ""}.${card.holder ? ` Held by <a href="/binder/${escapeHtml(card.holder)}"><code>${escapeHtml(card.holder)}</code></a>.` : ""}</p>
            <p class="menu-meta">Signature ${valid ? "verifies" : "does NOT verify"} against the store's key: <a href="/api/verify/${escapeHtml(cardId)}"><code>/api/verify/${escapeHtml(cardId)}</code></a>. The share sheet: <a href="/p/${escapeHtml(cardId)}.png"><code>/p/${escapeHtml(cardId)}.png</code></a>. The set, the odds and a pack of your own: <a href="/design">Paywall</a>.</p>
          </div>
        </div>
      </section>`,
    }),
  );
});

