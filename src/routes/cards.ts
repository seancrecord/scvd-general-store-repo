import { Hono } from "hono";
import type { Context } from "hono";
import { recoverMessageAddress } from "viem";
import { jsonLdScript, offerCurrencyFields, organizationRef } from "@/lib/jsonld";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { renderCardFace, renderSpecimenFace } from "@/services/card-svg";
import { renderShareSheet } from "@/services/card-share";
import {
  BurnRefused,
  burnForCredit,
  getCard,
  getPack,
  printStatus,
  readBinder,
  readBurn,
  readCredit,
  readWindow,
  redeemCredit,
  verifyCardSignature,
  WINDOW_SIZE,
} from "@/services/cards";
import { pressingSummary } from "@/services/instant-goods";
import { publishSeedRecord, utcDate } from "@/services/paywall-seed";
import { isSolanaWalletAddress, isWalletAddress } from "@/services/zodiac";
import {
  BURN_RATES,
  CARD_LINES,
  CARDS_FOR_MONEY,
  CARDS_FREE_FIRST,
  CARDS_OPENED,
  CARDS_PROPOSITION,
  CONDITION_CLEARS,
  CURRENT_SEASON,
  PACK_SIZE,
  RARITY_LINES,
  RARITY_ORDER,
  RESERVED_CONDITIONS,
  TYPE_LINES,
  WINDOW_LOCK_HOURS,
  allEntries,
  entryByKey,
  packChanceOf,
  slotOdds,
  type CardEntry,
  type WheelStop,
} from "@/store/cards";
import { drawnPlateKeys } from "@/store/plates";
import { getMenuItem } from "@/store/menu";
import { STORE_SERVICE_NAME } from "@/store/metadata";
import { securityBlock } from "@/store/surface-contract";
import { isRecord, type CardRecord, type HonoEnv, type SignedCardRecord } from "@/types";

/**
 * PAYWALL'S PUBLIC FACE.
 *
 *   GET  /design                        the shop window: the specimen, the 52 by
 *                                       type with how each is obtained, the share
 *                                       sheet as X renders it, today's seed commit,
 *                                       the odds, the bell, the credit, the burns
 *   GET  /p/{card_id}                   one pressing's page; OG tags point at the
 *                                       share sheet, so a posted link unfurls
 *   GET  /p/{card_id}.svg | .png        the face; the share sheet
 *   GET  /p/specimen.svg                the unsigned sample
 *   GET  /binder/{wallet}               what one wallet holds
 *   GET  /api/paywall/set               the season's set, free
 *   GET  /api/paywall/seed/{date}       the day's commit; its seed the day after
 *   GET  /api/paywall/window            the last five pressings pulled, free
 *   GET  /api/paywall/binder/{wallet}   the binder as a manifest, with the credit
 *   POST /api/paywall/challenge         { address } → a single-use challenge
 *   POST /api/paywall/burn              { address, signature, card_ids } → pack credit
 *   POST /api/paywall/redeem            { address, signature, want } → a pack or a pick
 *   GET  /api/card/{card_id}            the signed pressing (and its burn, if any)
 *   GET  /api/pack/{pack_id}            the signed pack
 *
 * Everything reads free. The paid doors are the shelf's: /api/buy/pack
 * and /api/buy/window_pick. The burn and redeem desks take the credit
 * desk's discipline: a single-use nonce, EIP-191 personal_sign, EOA only.
 */
export const cardRoutes = new Hono<HonoEnv>();

const PACK_ITEM = "pack";
const WINDOW_ITEM = "window_pick";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHALLENGE_TTL_SECONDS = 300;

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
.paywall .entry.silhouette { opacity: 0.55; }
.paywall .odds td, .paywall .odds th { padding: 0.3rem 0.8rem 0.3rem 0; border-bottom: 1px solid var(--line); text-align: left; font-variant-numeric: tabular-nums; }
.paywall .sheet { max-width: 600px; width: 100%; height: auto; display: block; border: 1px solid var(--line); }
.paywall .seed code { word-break: break-all; }
.paywall .tier-holo { color: #b8a04a; } .paywall .tier-rare { color: #9fb1c4; } .paywall .tier-uncommon { color: #c77d3a; } .paywall .tier-keeper { color: #e8dcc0; }
.paywall .rail-base { color: #6f8cff; } .paywall .rail-solana { color: #b07cff; } .paywall .rail-polygon { color: #a37cf0; }
.paywall .weather { border: 1px dashed var(--line); padding: 0.6rem 0.9rem; font-style: italic; }
`;

function fraction(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const STOPS: readonly WheelStop[] = ["common", "uncommon", "rare", "holo", "condition"];

function oddsTable() {
  const rows = slotOdds();
  const perPack = {} as Record<WheelStop, { chance: number; derivation: string }>;
  for (const stop of STOPS) {
    const misses = rows.map((row) => fraction(row.wheel_size - row.stops[stop], row.wheel_size));
    perPack[stop] = { chance: packChanceOf(stop), derivation: `1 - (${misses.join(" × ")})` };
  }
  return { rows, per_pack: perPack };
}

function postFor(card: CardRecord): string {
  return entryByKey(CURRENT_SEASON, card.key)?.post ?? card.line;
}

const OBTAINED_LINES: Record<CardEntry["obtained"], string> = {
  pack: "pack drop",
  window: "the window only",
  earned: "earned by the action",
  hand: "dropped by hand",
};

async function pressingJson(c: Context<HonoEnv>, record: SignedCardRecord) {
  const base = c.env.STORE_BASE_URL;
  const id = record.card.card_id;
  const burn = await readBurn(c.env, id);
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
    ...(burn ? { burned: burn } : {}),
    note: burn
      ? burn.burn.cleared_by === "credit"
        ? "Burned into pack credit by its holder. The pressing stays signed; the burn beside it is signed too."
        : "A Condition, cleared by the action the rule names. The pressing stays signed; the burn beside it is signed too."
      : "The card is the record. It depicts a thing that is here and cites where; it entitles the holder to a card.",
  };
}

async function setJson(c: Context<HonoEnv>) {
  const base = c.env.STORE_BASE_URL;
  const status = await printStatus(c.env, CURRENT_SEASON);
  const drawn = new Set(drawnPlateKeys());
  const entry = (card: CardEntry) => ({
    no: card.no,
    key: card.key,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    ...(card.rail ? { rail: card.rail } : {}),
    obtained: card.obtained,
    line: card.line,
    post: card.post,
    cite: `${base}${card.cite}`,
    plate: drawn.has(card.key) ? "drawn" : "not yet pressed",
    pressed: status[card.key]?.pressed ?? 0,
    ...(status[card.key]?.cap !== undefined ? { print_cap: status[card.key]!.cap } : {}),
    ...(card.door ? { door: { hash: card.door.hash, cap_is: "observation count" } } : {}),
    ...(card.defect ? { defect: card.defect, clears_on: CONDITION_CLEARS[card.key] ?? {} } : {}),
    ...(card.consent === false ? { consent: false } : {}),
  });
  return {
    season: { id: CURRENT_SEASON.id, name: CURRENT_SEASON.name, subtitle: CURRENT_SEASON.subtitle, opened_week: CURRENT_SEASON.opened_week, set_size: CURRENT_SEASON.cards.length },
    cards: CURRENT_SEASON.cards.map(entry),
    events: CURRENT_SEASON.events.map(entry),
    allies: CURRENT_SEASON.allies.map(entry),
    reserved_conditions: RESERVED_CONDITIONS,
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
      ring_the_bell: `POST ${base}/api/bell, or the ring_bell tool: once a day, one common; send wallet so it lands in your binder, and pass_id if you hold a current pass, which is two packs at full odds.`,
      the_window: `GET ${base}/api/paywall/window is the last ${WINDOW_SIZE} pressings pulled from packs here, free; GET ${base}/api/buy/${WINDOW_ITEM} takes one of them at half a pack — the seed picks, the pressing moves from the wallet that pulled it to yours, one pick per wallet per ${WINDOW_LOCK_HOURS} hours.`,
      burn_dupes: `POST ${base}/api/paywall/challenge with { address }, EIP-191 personal_sign the challenge, then POST ${base}/api/paywall/burn with { address, signature, card_ids }: ${BURN_RATES["common"]} commons or ${BURN_RATES["uncommon"]} uncommons burn into one pack of credit; rares never. POST ${base}/api/paywall/redeem with { address, signature, want: "pack" | "window_pick" } spends one.`,
      recompute_a_draw: "draw = HMAC-SHA256(seed_d, payer || cert_id || slot). The first four bytes map to [0, 1) and walk the slot's wheel; the next four pick the card within the pool; a capped card steps to the next in its tier. seed_d is published at /api/paywall/seed/{date} the day after; its sha256 is the commit on every pack.",
      a_binder: `GET ${base}/api/paywall/binder/{wallet}, or the read_binder tool, lists what a wallet holds, newest first, with its pack credit.`,
      the_set: `GET ${base}/api/paywall/set is the whole season as JSON: names, types, rarities, how each is obtained, which plates are drawn, how many of each have been pressed and the cap where one exists.`,
    },
    errors: {
      this_page: "None: a GET here always answers 200, as HTML or JSON by Accept.",
      unknown_card: "GET /api/card/{id} or /p/{id} for an id never pressed answers 404 with a plain sentence. Nothing is minted by looking.",
      binder_not_a_wallet: "GET /api/paywall/binder/{wallet} for a string that is not a 0x address or a base58 Solana address answers 400.",
      seed_not_yet: "GET /api/paywall/seed/{date} for a day that has not started answers 400; a day still running answers the commit alone.",
      window_empty: "GET /api/buy/window_pick before any pack has been opened refuses before payment terms; a second pick inside twelve hours refuses before settlement. Nothing is charged either way.",
      burn_refused: "POST /api/paywall/burn answers 400 with the reason by name: a card not in the binder, already burned, a rare, or short of a whole batch. Nothing burns on a refusal.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. Reading here contacts no chain and no third party; buying a pack settles one x402 payment you sign yourself; a burn or a redeem moves cards and credit only under a challenge your wallet signed.",
      stores: "A pressing records the certificate id and patron number like every sale here; a binder row and the pack credit are keyed by the wallet, already public on the chain that settled it; the bell keys its one-a-day on the name you gave it.",
    }),
    set,
    pack: { item_id: PACK_ITEM, size: PACK_SIZE, price_usdc: pack?.price_usdc ?? null, buy_url: `${base}/api/buy/${PACK_ITEM}`, menu_url: `${base}/menu/${PACK_ITEM}` },
    window_pick: { item_id: WINDOW_ITEM, price_usdc: pick?.price_usdc ?? null, buy_url: `${base}/api/buy/${WINDOW_ITEM}`, window_url: `${base}/api/paywall/window`, lock_hours: WINDOW_LOCK_HOURS },
    bell: { anyone: "one common a day", regular: "two packs a day at full odds, with a current pass_id", streaks: "not this build; the first pass puts the streak counter live in week two" },
    credit: { burn: BURN_RATES, rares: "never burn", spend_on: ["pack", "window_pick"], never: ["instruments", "specific cards", "cash"] },
    conditions: { clears: CONDITION_CLEARS, reserved: RESERVED_CONDITIONS, under_the_weather: "three or more Conditions at once mark the binder Under the weather until one clears; cosmetic" },
    seed: { today: seed, yesterday, sentence: CARD_LINES.seedSentence },
    odds: {
      note: "Per slot: stops of each tier over the stops on that slot's wheel. Per pack: the chance of at least one of the tier, one minus the product of the per-slot misses. Rooms, Instruments, the Keeper and Events never drop from packs; Conditions drop from slot 5 only. No pity timer, no hidden modifier, no second copy of these numbers anywhere.",
      per_slot: odds.rows,
      per_pack: odds.per_pack,
    },
    rules_that_do_not_move: [
      "A card changes what the store charges, never what the observatory says.",
      "Verify endpoints and passports carry no card text, art or offers.",
      "Print cap = observation count. A Door seen n times has n pressings, ever.",
      "Nothing is sold as a specific card. Packs and the window are random; earned cards come from the action.",
      "People never appear. Keeper is a role; a company appears only as a consenting Ally; an endpoint as a numbered Door with a hash.",
    ],
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
  const latestCard = window[0] ? await getCard(c.env, window[0].card_id) : null;
  const byType = new Map<string, CardEntry[]>();
  for (const card of CURRENT_SEASON.cards) byType.set(card.type, [...(byType.get(card.type) ?? []), card]);
  const entryHtml = (card: CardEntry) => {
    const row = set.cards.find((r) => r.key === card.key) ?? set.events.find((r) => r.key === card.key) ?? set.allies.find((r) => r.key === card.key);
    const pressed = row?.pressed ?? 0;
    const cap = row?.print_cap;
    return `<div class="entry tier-${card.rarity}${card.rail ? ` rail-${card.rail}` : ""}${!drawn.has(card.key) || pressed === 0 ? " silhouette" : ""}">
      <span class="no">${card.no ? `No. ${String(card.no).padStart(2, "0")} · ` : ""}${escapeHtml(RARITY_LINES[card.rarity])}${card.rail ? ` · ${escapeHtml(card.rail)}` : ""}</span>
      <span class="name">${escapeHtml(card.name)}</span>
      <span class="no">${escapeHtml(OBTAINED_LINES[card.obtained])}${card.consent === false ? " · consent not yet on record" : ""}</span>
      <span class="no">${pressed === 0 ? "not yet pulled by anyone" : `${pressed} pressed${cap !== undefined ? ` of ${cap}` : ""}`}${card.door ? ` · cap = observations` : ""}${drawn.has(card.key) ? "" : " · plate not yet pressed"}</span>
    </div>`;
  };
  const setHtml = [...byType.entries()]
    .map(([type, cards]) => `<h3>${escapeHtml(TYPE_LINES[type as keyof typeof TYPE_LINES])} · ${cards.length}</h3><div class="set">${cards.map(entryHtml).join("\n")}</div>`)
    .join("\n");
  const slotRows = odds.rows
    .map((row) => `<tr><td>slot ${row.slot}</td>${STOPS.map((stop) => `<td>${row.stops[stop] === 0 ? "—" : `${fraction(row.stops[stop], row.wheel_size)} (${percent(row.stops[stop] / row.wheel_size)})`}</td>`).join("")}</tr>`)
    .join("\n");
  const packRows = STOPS.map((stop) => `<tr><td>${escapeHtml(stop === "condition" ? "Condition" : RARITY_LINES[stop])}</td><td>${percent(odds.per_pack[stop].chance)}</td><td><code>${escapeHtml(odds.per_pack[stop].derivation)}</code></td></tr>`).join("\n");
  const clearRows = CURRENT_SEASON.cards.filter((card) => card.type === "condition").map((card) => {
    const rule = CONDITION_CLEARS[card.key] ?? {};
    const how = rule.items?.length ? `buying ${rule.items.map((id) => getMenuItem(id)?.name ?? id).join(" or ")}` : rule.any_idempotent ? "any purchase carrying an idempotency key" : "not yet wired; it stays until it is";
    return `<tr><td>${escapeHtml(card.name)}</td><td>${escapeHtml(how)}</td></tr>`;
  }).join("\n");
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
    ? `<div class="hero"><img src="/p/${escapeHtml(latestCard.card.card_id)}.svg" width="1000" height="1400" alt="${escapeHtml(latestCard.card.name)}, the most recent pressing"><div><p class="menu-desc">In the window now: <a href="/p/${escapeHtml(latestCard.card.card_id)}"><strong>${escapeHtml(latestCard.card.name)}</strong></a>, ${escapeHtml(RARITY_LINES[latestCard.card.rarity].toLowerCase())}, print ${latestCard.card.print_no}${latestCard.card.holder ? `, in <a href="/binder/${escapeHtml(latestCard.card.holder)}">a binder</a> until somebody picks it` : ""}.</p><p class="menu-desc">Its share sheet, exactly as X renders a pasted link:</p><img class="sheet" src="/p/${escapeHtml(latestCard.card.card_id)}.png" width="1200" height="675" alt="The share sheet for ${escapeHtml(latestCard.card.name)}"></div></div>`
    : `<p class="menu-meta">Nobody has opened a pack yet. The first pressing hangs here the moment one does.</p>`;
  return c.html(
    renderSimplePage({
      title: CARD_LINES.tableName,
      description: `Collectible trading cards of scvd.store and Oak City for the agents that shop here: the Season One set of ${CURRENT_SEASON.cards.length}, how each card is obtained, the odds per slot with their denominators, the day seed anyone can check, and the specimen card.`,
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
        <p class="menu-desc">Three slots are always common. The fourth and fifth run a wheel; a Condition can only come out of the fifth. Each fraction is stops of that tier over stops on the wheel, counted from the wheel itself, never typed.</p>
        <table class="odds"><thead><tr><th></th>${STOPS.map((stop) => `<th>${escapeHtml(stop === "condition" ? "condition" : RARITY_LINES[stop].toLowerCase())}</th>`).join("")}</tr></thead><tbody>${slotRows}</tbody></table>
        <p class="menu-desc">Per pack, the chance of at least one:</p>
        <table class="odds"><thead><tr><th>tier</th><th>chance</th><th>derivation</th></tr></thead><tbody>${packRows}</tbody></table>
        <p class="menu-meta">Rooms and Instruments are earned by the action, never pulled. The Keeper is one card, the window only, once a season. Events drop by hand on dates. Doors cap at their observation count; 402 the Chicken caps at one. No pity timer, no near-miss, no window that closes, no price on a card, no store-run market. A card entitles the holder to a card.</p>
      </section>
      <section>
        <h2>The bell, the window, the credit</h2>
        <p class="menu-desc">The bell hands out one common a day to whoever rings; send a wallet and it lands in your binder; send a current pass id and a Regular gets two packs at full odds. The window shows the last ${WINDOW_SIZE} pressings pulled from packs; a pick takes one at half a pack, the seed chooses, and the card moves from the wallet that pulled it to yours. One pick per wallet per ${WINDOW_LOCK_HOURS} hours. If you draw someone else's Stale Passport, that is your problem now.</p>
        <p class="menu-desc">Dupes are the credit economy: ${BURN_RATES["common"]} commons or ${BURN_RATES["uncommon"]} uncommons burn into one pack of credit, spent on a pack or a window pick. Rares never burn. Credit never buys an instrument, a specific card, or cash. The desks: <code>POST /api/paywall/challenge</code>, sign it, then <code>POST /api/paywall/burn</code> or <code>POST /api/paywall/redeem</code>.</p>
        <h3>Conditions, and what clears them</h3>
        <table class="odds"><thead><tr><th>condition</th><th>clears on</th></tr></thead><tbody>${clearRows}</tbody></table>
        <p class="menu-meta">Three or more Conditions at once mark a binder <em>${escapeHtml(CARD_LINES.underTheWeather)}</em> until one clears. Cosmetic, shareable, mildly humiliating. Reserved for the season: ${RESERVED_CONDITIONS.join(", ")}.</p>
      </section>
      <section>
        <h2>Season One: ${escapeHtml(CURRENT_SEASON.subtitle)}, ${CURRENT_SEASON.cards.length} cards</h2>
        <p class="menu-desc">Every card is a pressing from something the store actually recorded, and cites where it lives. Doors are endpoints the observatory watched, shown as a hash and a count, never a URL.</p>
        ${setHtml}
        <h3>Events · ${CURRENT_SEASON.events.length}, by hand on dates</h3><div class="set">${CURRENT_SEASON.events.map(entryHtml).join("")}</div>
        <h3>Allies · ${CURRENT_SEASON.allies.length}, with consent</h3><div class="set">${CURRENT_SEASON.allies.map(entryHtml).join("")}</div>
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
  if (date < CARDS_OPENED) return c.json({ error: `The table opened ${CARDS_OPENED}; there is no seed before it.` }, 404);
  const record = await publishSeedRecord(c.env, date);
  return c.json({
    ...record,
    algorithm: "ed25519",
    signed_payload: JSON.stringify({ date: record.record.date, commit: record.record.commit, published_at: record.record.published_at, ...(record.record.seed ? { seed: record.record.seed } : {}) }),
    revealed: record.record.seed !== undefined,
    how_to_check: "sha256(hex_to_bytes(seed)) equals commit. Then HMAC-SHA256(seed, payer || cert_id || slot) for any pack of that day: bytes 0..3 over 2^32 walk the slot's wheel, bytes 4..7 mod the pool's size pick the card; a capped card steps to the next in its tier.",
    note: record.record.seed ? "The day has ended; the seed is out. Every pull of that day is recomputable." : "The day is still running; the commit is out and the seed follows at the next UTC midnight.",
  });
});

cardRoutes.get("/api/paywall/window", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const window = await readWindow(c.env);
  return c.json({
    window: window.map((row) => ({ ...row, page_url: `${base}/p/${row.card_id}`, face_url: `${base}/p/${row.card_id}.svg` })),
    size: WINDOW_SIZE,
    lock_hours: WINDOW_LOCK_HOURS,
    pick_url: `${base}/api/buy/${WINDOW_ITEM}`,
    note: window.length === 0 ? "Nobody has opened a pack yet; the window is empty and a pick refuses before payment terms." : "The last pressings pulled from packs here, newest first, plus anything the keeper set out. A pick takes one of them; the seed, not the buyer, says which, and the card moves to the picker's binder.",
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
  const binder = await readBinder(c.env, wallet);
  const credit = await readCredit(c.env, wallet);
  return c.json({
    wallet,
    cards: binder.rows.map((row) => ({ ...row, page_url: `${base}/p/${row.card_id}`, face_url: `${base}/p/${row.card_id}.svg`, share_url: `${base}/p/${row.card_id}.png`, record_url: `${base}/api/card/${row.card_id}` })),
    count: binder.rows.length,
    truncated: binder.truncated,
    conditions: binder.conditions,
    under_the_weather: binder.under_the_weather,
    credit: { packs: credit, burn: BURN_RATES, redeem_url: `${base}/api/paywall/redeem` },
    note: binder.rows.length === 0
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
  const binder = await readBinder(c.env, wallet);
  const credit = await readCredit(c.env, wallet);
  const list = binder.rows.length
    ? binder.rows.map((row) => `<div class="entry tier-${row.rarity}"><span class="no">${row.card_no ? `No. ${String(row.card_no).padStart(2, "0")} · ` : ""}${escapeHtml(RARITY_LINES[row.rarity])} · print ${row.print_no}</span><a class="name" href="/p/${escapeHtml(row.card_id)}">${escapeHtml(row.name)}</a><span class="no">${escapeHtml(row.source)} · ${escapeHtml(row.date.slice(0, 10))}</span></div>`).join("\n")
    : `<p class="menu-desc">Nothing in this binder yet.</p>`;
  return c.html(
    renderSimplePage({
      title: `Binder: ${wallet.slice(0, 10)}…`,
      description: `The trading cards one wallet holds at scvd.store, newest first, each linking to its signed record, with its pack credit. A listing, not a proof of ownership; the signed records are.`,
      path: `/binder/${wallet}`,
      extraCss: DESIGN_CSS,
      bodyClass: "paywall",
      ogImage: binder.rows[0] ? `${c.env.STORE_BASE_URL}/p/${binder.rows[0].card_id}.png` : undefined,
      bodyHtml: `<section><p class="menu-meta">${escapeHtml(wallet)} · ${binder.rows.length} card${binder.rows.length === 1 ? "" : "s"}${binder.truncated ? " shown; the binder holds more than this page lists" : ""} · ${credit} pack${credit === 1 ? "" : "s"} of credit</p>${binder.under_the_weather ? `<p class="weather">${escapeHtml(CARD_LINES.underTheWeather)}: ${binder.conditions} Conditions at once. It clears when one does.</p>` : ""}<div class="set">${list}</div><p class="menu-meta">The set, the odds and a pack of your own: <a href="/design">Paywall</a>. Manifest: <a href="/api/paywall/binder/${escapeHtml(wallet)}"><code>/api/paywall/binder/${escapeHtml(wallet)}</code></a>.</p></section>`,
    }),
  );
});

/* ── the burn and redeem desks ────────────────────────────────────── */

function challengeText(address: string, nonce: string): string {
  return `scvd.store paywall desk for ${address.toLowerCase()} — nonce ${nonce}. Signing this authorizes burning cards this wallet holds into pack credit, or spending that credit on a pack or a window pick for this wallet, nowhere else.`;
}

cardRoutes.post("/api/paywall/challenge", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address = isRecord(body) && typeof body["address"] === "string" ? body["address"].trim() : "";
  if (!ADDRESS.test(address)) return c.json({ error: "Send JSON with address (0x + 40 hex). The burn and redeem desks are EVM only, like the credit desk." }, 400);
  const nonce = crypto.randomUUID();
  await kvPut(c.env.COUNTERS, KV_KEYS.paywallChallenge(address.toLowerCase()), nonce, { expirationTtl: CHALLENGE_TTL_SECONDS });
  return c.json({
    challenge: challengeText(address, nonce),
    expires_in_seconds: CHALLENGE_TTL_SECONDS,
    how: "EIP-191 personal_sign over the exact challenge string with the wallet's own key, then POST /api/paywall/burn with { address, signature, card_ids } or POST /api/paywall/redeem with { address, signature, want }. Single-use; EOA signatures only.",
  });
});

async function recoveredWallet(c: Context<HonoEnv>, body: unknown): Promise<{ wallet: string } | { error: string }> {
  const address = isRecord(body) && typeof body["address"] === "string" ? body["address"].trim() : "";
  const signature = isRecord(body) && typeof body["signature"] === "string" ? body["signature"].trim() : "";
  if (!ADDRESS.test(address) || !signature) return { error: "Send JSON with address (0x + 40 hex) and signature over the challenge from /api/paywall/challenge." };
  const key = KV_KEYS.paywallChallenge(address.toLowerCase());
  const nonce = await kvGet(c.env.COUNTERS, key);
  if (!nonce) return { error: "No live challenge for that address — challenges are single-use and expire in five minutes. Start at POST /api/paywall/challenge." };
  // Every attempt burns the nonce, so nothing about this door rewards guessing.
  await c.env.COUNTERS.delete(key);
  let recovered = "";
  try {
    recovered = await recoverMessageAddress({ message: challengeText(address, nonce), signature: signature as `0x${string}` });
  } catch {
    return { error: "The signature does not recover to an address. EIP-191 personal_sign over the exact challenge string, hex-encoded." };
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) return { error: "The signature recovers to a different address than the one named." };
  return { wallet: address.toLowerCase() };
}

cardRoutes.post("/api/paywall/burn", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const who = await recoveredWallet(c, body);
  if ("error" in who) return c.json({ error: who.error }, 400);
  const ids = isRecord(body) && Array.isArray(body["card_ids"]) ? body["card_ids"].filter((id): id is string => typeof id === "string" && /^card_[a-z0-9]+$/.test(id)).slice(0, 200) : [];
  if (ids.length === 0) return c.json({ error: "card_ids: the pressings to burn, as an array of card_ ids this wallet holds." }, 400);
  try {
    const result = await burnForCredit(c.env, who.wallet, ids);
    return c.json({ ...result, note: `Burned into pack credit, ${BURN_RATES["common"]} commons or ${BURN_RATES["uncommon"]} uncommons a pack. Spend it at POST /api/paywall/redeem.` });
  } catch (error) {
    if (error instanceof BurnRefused) return c.json({ error: error.message, burned: [] }, 400);
    throw error;
  }
});

cardRoutes.post("/api/paywall/redeem", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const who = await recoveredWallet(c, body);
  if ("error" in who) return c.json({ error: who.error }, 400);
  const want = isRecord(body) && (body["want"] === "pack" || body["want"] === "window_pick") ? body["want"] : null;
  if (!want) return c.json({ error: 'want: "pack" or "window_pick".' }, 400);
  const base = c.env.STORE_BASE_URL;
  try {
    const result = await redeemCredit(c.env, who.wallet, want);
    return c.json({
      spent: 1,
      balance: result.balance,
      ...(result.pack ? { pack_id: result.pack.pack.pack_id, pack_url: `${base}/api/pack/${result.pack.pack.pack_id}`, cards: result.pack.cards.map((signed) => pressingSummary(base, signed.card)) } : {}),
      ...(result.pressing ? { pressing: pressingSummary(base, result.pressing.card) } : {}),
    });
  } catch (error) {
    if (error instanceof BurnRefused || (error instanceof Error && error.constructor.name === "WindowRefused")) return c.json({ error: error.message }, 400);
    throw error;
  }
});

/* ── pressings ────────────────────────────────────────────────────── */

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
  return c.json(await pressingJson(c, record));
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
    cards: await Promise.all(record.cards.map((signed) => pressingJson(c, signed))),
    seed_url: `${base}/api/paywall/seed/${record.pack.seed_date}`,
    verify_url: `${base}/api/verify/${record.pack.pack_id}`,
    note: "Five cards, one manifest, every one signed as pulled. The manifest binds the day's seed commit and the draw inputs; the seed itself is at seed_url the day after, and then the whole pull recomputes. A card the window has since moved shows its current holder at /api/card/{id}.",
  });
});

cardRoutes.get("/p/:card_id{card_[a-z0-9]+}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const cardId = c.req.param("card_id");
  const record = await getCard(c.env, cardId);
  const html = wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"));
  if (!record) return html ? c.text("No card by that id was ever pressed here.", 404) : c.json({ error: "No card by that id was ever pressed here." }, 404);
  if (!html) return c.json(await pressingJson(c, record));
  const valid = await verifyCardSignature(record);
  const burn = await readBurn(c.env, cardId);
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
            <p class="menu-desc"><strong>${escapeHtml(card.name)}</strong> · ${escapeHtml(RARITY_LINES[card.rarity])} · ${escapeHtml(TYPE_LINES[card.type])}${card.rail ? ` · ${escapeHtml(card.rail)}` : ""}${card.card_no ? ` · No. ${String(card.card_no).padStart(2, "0")} of ${CURRENT_SEASON.cards.length}` : ""} · print ${card.print_no}${card.print_cap !== undefined ? ` of ${card.print_cap}` : ""}</p>
            <p class="menu-desc"><em>${escapeHtml(card.line)}</em></p>
            ${card.door_hash ? `<p class="menu-meta">A numbered Door: the endpoint is shown as its hash, <code>${escapeHtml(card.door_hash.slice(0, 16))}…</code>, and its observation count, ${card.observations ?? 0}, which is also this card's cap. Never the URL.</p>` : ""}
            ${burn ? `<p class="weather">${escapeHtml(CARD_LINES.clearedMark)}: ${burn.burn.cleared_by === "credit" ? "burned into pack credit by its holder" : burn.burn.cleared_by === "idempotency" ? "cleared by a purchase carrying an idempotency key" : `cleared by buying ${escapeHtml(getMenuItem(burn.burn.cleared_by)?.name ?? burn.burn.cleared_by)}`} on ${escapeHtml(burn.burn.at.slice(0, 10))}. The pressing stays signed; so does the burn.</p>` : ""}
            <p class="menu-meta">Depicts <a href="${escapeHtml(card.cite)}"><code>${escapeHtml(card.cite)}</code></a>. Pressed ${escapeHtml(card.date.slice(0, 10))} from the ${escapeHtml(card.source)}${card.pack_id ? `, slot ${card.slot} of <a href="/api/pack/${escapeHtml(card.pack_id)}"><code>${escapeHtml(card.pack_id)}</code></a>` : ""}${card.commit ? `, under seed commit <code>${escapeHtml(card.commit.slice(0, 16))}…</code>` : ""}.${card.holder ? ` Held by <a href="/binder/${escapeHtml(card.holder)}"><code>${escapeHtml(card.holder)}</code></a>${card.transfers ? `, moved through the window ${card.transfers} time${card.transfers === 1 ? "" : "s"}` : ""}.` : ""}</p>
            <p class="menu-meta">Signature ${valid ? "verifies" : "does NOT verify"} against the store's key: <a href="/api/verify/${escapeHtml(cardId)}"><code>/api/verify/${escapeHtml(cardId)}</code></a>. The share sheet: <a href="/p/${escapeHtml(cardId)}.png"><code>/p/${escapeHtml(cardId)}.png</code></a>. The set, the odds and a pack of your own: <a href="/design">Paywall</a>.</p>
          </div>
        </div>
      </section>`,
    }),
  );
});

