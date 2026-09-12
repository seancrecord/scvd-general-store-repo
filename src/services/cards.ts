import { counterLedger } from "@/lib/counter-ledger";
import { newCardId, newPackId } from "@/lib/ids";
import { listKeys } from "@/lib/kv-list";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import {
  publishPersonalRecord,
  retainPersonalRecord,
  type PersonalPurchase,
} from "@/services/personal-goods";
import {
  commitOf,
  drawBytes,
  indexFromBytes,
  publishSeedRecord,
  seedFor,
  unitFromBytes,
  utcDate,
} from "@/services/paywall-seed";
import {
  allEntries,
  cardsOfRarity,
  CURRENT_SEASON,
  PACK_SIZE,
  SLOT_WHEELS,
  entryByKey,
  type CardEntry,
  type Season,
} from "@/store/cards";
import type {
  CardRarity,
  CardRecord,
  Env,
  PackRecord,
  PressingSource,
  SignedCardRecord,
  SignedPackRecord,
} from "@/types";

/**
 * THE PAYWALL'S LEDGER (handoff v2). A pack is the unit of purchase
 * and the unit of recovery: prepared once, checkpointed, published
 * through the personal-goods coordinator like a lucky, so a retry
 * after a dropped response hands back the same five cards. Every
 * pressing is then projected to its own key so it resolves and
 * verifies alone, a binder row per holder wallet lists it, and the
 * pack goes in the shop window.
 *
 * THE DRAW. HMAC-SHA256(seed_d, payer || cert_id || slot): the first
 * four bytes walk the slot's wheel, the next four pick the card in
 * the tier. Print caps step to the next card in the tier — still
 * deterministic, still recomputable — and a whole capped tier falls
 * back to common. `drawSlot` is exported so anyone can redo it from
 * the revealed seed.
 *
 * THE PRINT NUMBER comes off the counter ledger (one writer, atomic)
 * where the deployment has one, and off a KV read-add-write where it
 * does not; the second is a floor under contention and is only ever
 * the test pool.
 */

/** Deterministic JSON so the signature always covers the same bytes. */
export function canonicalizeCard(card: CardRecord): string {
  const ordered: Record<string, string | number> = {
    card_id: card.card_id,
    season: card.season,
    card_no: card.card_no,
    key: card.key,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    line: card.line,
    cite: card.cite,
    print_no: card.print_no,
    source: card.source,
    date: card.date,
  };
  for (const field of ["rail", "print_cap", "slot", "pack_id", "cert_id", "commit", "patron_number", "holder"] as const) {
    const value = card[field];
    if (value !== undefined) ordered[field] = value;
  }
  return JSON.stringify(ordered);
}

export function canonicalizePack(pack: PackRecord): string {
  return JSON.stringify({
    pack_id: pack.pack_id,
    season: pack.season,
    card_ids: pack.card_ids,
    commit: pack.commit,
    seed_date: pack.seed_date,
    payer: pack.payer,
    cert_id: pack.cert_id,
    date: pack.date,
    patron_number: pack.patron_number,
  });
}

/* ── the draw ─────────────────────────────────────────────────────── */

export interface DrawnSlot {
  slot: number;
  rarity: CardRarity;
  card: CardEntry;
  /** The tier index the bytes named before any cap stepped it. */
  drawn_index: number;
  stepped: boolean;
}

/** A capped entry is closed once its counter reaches the cap. */
export type CapReader = (entry: CardEntry) => Promise<boolean>;

const neverCapped: CapReader = async () => false;

/**
 * One slot of a pack, from the day seed and the public inputs. The
 * wheel is walked by the unit interval; the tier's pool by the next
 * four bytes; a capped card steps forward within the tier.
 */
export async function drawSlot(
  seed: Uint8Array,
  payer: string,
  certId: string,
  slot: number,
  options: { season?: Season; salt?: string; wheel?: readonly CardRarity[]; capped?: CapReader } = {},
): Promise<DrawnSlot> {
  const season = options.season ?? CURRENT_SEASON;
  const wheel = options.wheel ?? SLOT_WHEELS[slot - 1] ?? ["common"];
  const bytes = await drawBytes(seed, payer, certId, slot, options.salt ?? "");
  const unit = unitFromBytes(bytes, 0);
  const rarity = wheel[Math.min(wheel.length - 1, Math.floor(unit * wheel.length))] as CardRarity;
  const pool = cardsOfRarity(season, rarity);
  if (pool.length === 0) throw new Error(`Season ${season.id} has no ${rarity} card`);
  const drawnIndex = indexFromBytes(bytes, 4, pool.length);
  const capped = options.capped ?? neverCapped;
  for (let step = 0; step < pool.length; step += 1) {
    const candidate = pool[(drawnIndex + step) % pool.length]!;
    if (!(await capped(candidate))) {
      return { slot, rarity, card: candidate, drawn_index: drawnIndex, stepped: step > 0 };
    }
  }
  // The whole tier is capped out: fall back to common, per the handoff.
  const commons = cardsOfRarity(season, "common");
  const fallback = commons[indexFromBytes(bytes, 8, commons.length)]!;
  return { slot, rarity: "common", card: fallback, drawn_index: drawnIndex, stepped: true };
}

/* ── print numbers ────────────────────────────────────────────────── */

async function readPressCount(env: Env, season: string, key: string): Promise<number> {
  const counterKey = KV_KEYS.paywallPress(season, key);
  const ledger = counterLedger(env, counterKey);
  if (ledger) return ledger.read(counterKey);
  const raw = await kvGet(env.COUNTERS, counterKey);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

async function nextPrintNumber(env: Env, season: string, key: string): Promise<number> {
  const counterKey = KV_KEYS.paywallPress(season, key);
  const ledger = counterLedger(env, counterKey);
  if (ledger) return ledger.add(counterKey, 1);
  const next = (await readPressCount(env, season, key)) + 1;
  await kvPut(env.COUNTERS, counterKey, String(next));
  return next;
}

/** Whether a capped entry has reached its cap. Uncapped entries never do. */
export function capReader(env: Env, season: Season): CapReader {
  return async (entry) => {
    if (entry.print_cap === undefined) return false;
    return (await readPressCount(env, season.id, entry.key)) >= entry.print_cap;
  };
}

/** Print status for the set page: pressed so far, and the cap where one exists. */
export async function printStatus(env: Env, season: Season): Promise<Record<string, { pressed: number; cap?: number }>> {
  const status: Record<string, { pressed: number; cap?: number }> = {};
  for (const entry of allEntries(season)) {
    const pressed = await readPressCount(env, season.id, entry.key);
    status[entry.key] = { pressed, ...(entry.print_cap !== undefined ? { cap: entry.print_cap } : {}) };
  }
  return status;
}

/* ── pressing ─────────────────────────────────────────────────────── */

export async function signCardRecord(env: Env, card: CardRecord): Promise<SignedCardRecord> {
  const { signature, publicKey } = await signMessage(canonicalizeCard(card), env.SIGNING_KEY);
  return { card, signature, public_key: publicKey };
}

interface PressOptions {
  entry: CardEntry;
  source: PressingSource;
  date: string;
  season?: Season;
  slot?: number;
  packId?: string;
  certId?: string;
  commit?: string;
  patronNumber?: number;
  holder?: string;
}

/** One pressing: the next print number, a signed record. Does not write it. */
async function press(env: Env, options: PressOptions): Promise<SignedCardRecord> {
  const season = options.season ?? CURRENT_SEASON;
  const { entry } = options;
  const printNo = await nextPrintNumber(env, season.id, entry.key);
  const card: CardRecord = {
    card_id: newCardId(),
    season: season.id,
    card_no: entry.no,
    key: entry.key,
    name: entry.name,
    type: entry.type,
    rarity: entry.rarity,
    ...(entry.rail ? { rail: entry.rail } : {}),
    line: entry.line,
    cite: entry.cite,
    print_no: printNo,
    ...(entry.print_cap !== undefined ? { print_cap: entry.print_cap } : {}),
    source: options.source,
    ...(options.slot !== undefined ? { slot: options.slot } : {}),
    ...(options.packId ? { pack_id: options.packId } : {}),
    ...(options.certId ? { cert_id: options.certId } : {}),
    ...(options.commit ? { commit: options.commit } : {}),
    date: options.date,
    ...(options.patronNumber !== undefined ? { patron_number: options.patronNumber } : {}),
    ...(options.holder ? { holder: options.holder.toLowerCase() } : {}),
  };
  return signCardRecord(env, card);
}

/** Project a signed pressing to its own key, and to the holder's binder. */
async function filePressing(env: Env, signed: SignedCardRecord): Promise<void> {
  await kvPut(env.PATRONS, KV_KEYS.card(signed.card.card_id), JSON.stringify(signed));
  if (signed.card.holder) {
    await kvPut(
      env.PATRONS,
      KV_KEYS.binder(signed.card.holder, invertedTimestamp(Date.parse(signed.card.date)), signed.card.card_id),
      JSON.stringify(binderRowOf(signed.card)),
    );
  }
}

export interface BinderRow {
  card_id: string;
  key: string;
  name: string;
  type: string;
  rarity: CardRarity;
  card_no: number;
  print_no: number;
  season: string;
  source: PressingSource;
  date: string;
  pack_id?: string;
}

function binderRowOf(card: CardRecord): BinderRow {
  return {
    card_id: card.card_id,
    key: card.key,
    name: card.name,
    type: card.type,
    rarity: card.rarity,
    card_no: card.card_no,
    print_no: card.print_no,
    season: card.season,
    source: card.source,
    date: card.date,
    ...(card.pack_id ? { pack_id: card.pack_id } : {}),
  };
}

/* ── the pack ─────────────────────────────────────────────────────── */

export interface OpenPackOptions {
  certId: string;
  patronNumber: number;
  /** The wallet that paid, when the certificate carries one; keys the binder and the draw. */
  payer?: string;
  season?: Season;
  now?: Date;
}

export async function openPack(env: Env, options: OpenPackOptions, purchase?: PersonalPurchase): Promise<SignedPackRecord> {
  const season = options.season ?? CURRENT_SEASON;
  const prepared = await retainPersonalRecord(purchase, async () => {
    const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
    const date = now.toISOString();
    const seedDate = utcDate(now);
    await publishSeedRecord(env, seedDate, now);
    const seed = await seedFor(env, seedDate);
    const commit = await commitOf(seed);
    const payer = (options.payer ?? "none").toLowerCase();
    const packId = newPackId();
    const capped = capReader(env, season);
    const cards: SignedCardRecord[] = [];
    for (let slot = 1; slot <= PACK_SIZE; slot += 1) {
      const drawn = await drawSlot(seed, payer, options.certId, slot, { season, capped });
      cards.push(
        await press(env, {
          entry: drawn.card,
          source: "pack",
          date,
          season,
          slot,
          packId,
          certId: options.certId,
          commit,
          patronNumber: options.patronNumber,
          ...(options.payer ? { holder: options.payer } : {}),
        }),
      );
    }
    const pack: PackRecord = {
      pack_id: packId,
      season: season.id,
      card_ids: cards.map((entry) => entry.card.card_id),
      commit,
      seed_date: seedDate,
      payer,
      cert_id: options.certId,
      date,
      patron_number: options.patronNumber,
    };
    const { signature, publicKey } = await signMessage(canonicalizePack(pack), env.SIGNING_KEY);
    return { kind: "pack" as const, record: { pack, cards, signature, public_key: publicKey } satisfies SignedPackRecord };
  });
  if (prepared.kind !== "pack") throw new Error("Original pack record unavailable");
  const published = (await publishPersonalRecord(env, prepared)).record;
  for (const signed of published.cards) await filePressing(env, signed);
  await kvPut(
    env.PATRONS,
    KV_KEYS.paywallWindow(invertedTimestamp(Date.parse(published.pack.date)), published.pack.pack_id),
    JSON.stringify({ pack_id: published.pack.pack_id, date: published.pack.date, cards: published.cards.map((signed) => binderRowOf(signed.card)) }),
  );
  return published;
}

/* ── the bell, the earned card, the window pick, the hand press ──── */

/** One common a day off the bell: same HMAC, slot 0, salt "bell", keyed by who rang and the day. */
export async function bellPressing(env: Env, who: string, now: Date = new Date()): Promise<SignedCardRecord> {
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const drawn = await drawSlot(seed, who.toLowerCase(), seedDate, 0, { salt: "bell", wheel: ["common"] });
  const signed = await press(env, { entry: drawn.card, source: "bell", date: now.toISOString(), commit: await commitOf(seed) });
  await filePressing(env, signed);
  return signed;
}

export interface EarnedOptions {
  /** A set entry key (an Event, usually); absent draws one common. */
  key?: string;
  certId: string;
  patronNumber?: number;
  payer?: string;
  now?: Date;
}

/**
 * A pressing that rides along on another purchase or a free errand.
 * Events name their card; everything else draws a common with the
 * salt "earned" so it never collides with a pack slot.
 */
export async function earnedPressing(env: Env, options: EarnedOptions, purchase?: PersonalPurchase): Promise<SignedCardRecord> {
  const season = CURRENT_SEASON;
  const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const commit = await commitOf(seed);
  const entry = options.key
    ? entryByKey(season, options.key)
    : (await drawSlot(seed, (options.payer ?? "none").toLowerCase(), options.certId, 0, { season, salt: "earned", wheel: ["common"] })).card;
  if (!entry) throw new Error(`No set entry ${options.key}`);
  const prepared = await retainPersonalRecord(purchase, async () => ({
    kind: "pressing" as const,
    record: await press(env, {
      entry,
      source: "earned",
      date: now.toISOString(),
      season,
      certId: options.certId,
      commit,
      ...(options.patronNumber !== undefined ? { patronNumber: options.patronNumber } : {}),
      ...(options.payer ? { holder: options.payer } : {}),
    }),
  }));
  if (prepared.kind !== "pressing") throw new Error("Original pressing unavailable");
  const published = purchase?.checkpoint ? (await publishPersonalRecord(env, prepared)).record : prepared.record;
  await filePressing(env, published);
  return published;
}

export interface WindowPack {
  pack_id: string;
  date: string;
  cards: BinderRow[];
}

export const WINDOW_SIZE = 5;

/** The last packs opened store-wide, newest first. Free to look at. */
export async function readWindow(env: Env): Promise<WindowPack[]> {
  const listed = await listKeys(env.PATRONS, { prefix: KV_KEYS.paywallWindowPrefix, cap: WINDOW_SIZE });
  const packs: WindowPack[] = [];
  for (const name of listed.names) {
    const row = await kvGetJson<WindowPack>(env.PATRONS, name, "json");
    if (row) packs.push(row);
  }
  return packs;
}

/**
 * A window pick: one of the cards on show, chosen by the same seed
 * with the window's pack ids as input — the buyer pays half a pack
 * and the store, not the buyer, says which of the five it is.
 */
export async function windowPick(env: Env, options: OpenPackOptions, purchase?: PersonalPurchase): Promise<{ pressing: SignedCardRecord; from_pack: string; window: string[] }> {
  const window = await readWindow(env);
  if (window.length === 0) throw new Error("The window is empty: nobody has opened a pack yet.");
  const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const commit = await commitOf(seed);
  const ids = window.map((pack) => pack.pack_id);
  const bytes = await drawBytes(seed, (options.payer ?? "none").toLowerCase(), options.certId, ids.join(","), "window");
  const shown = window.flatMap((pack) => pack.cards.map((card) => ({ card, pack_id: pack.pack_id })));
  const chosen = shown[indexFromBytes(bytes, 0, shown.length)]!;
  const entry = entryByKey(CURRENT_SEASON, chosen.card.key);
  if (!entry) throw new Error(`Window names an entry the set does not: ${chosen.card.key}`);
  const prepared = await retainPersonalRecord(purchase, async () => ({
    kind: "pressing" as const,
    record: await press(env, {
      entry,
      source: "window",
      date: now.toISOString(),
      certId: options.certId,
      commit,
      patronNumber: options.patronNumber,
      ...(options.payer ? { holder: options.payer } : {}),
    }),
  }));
  if (prepared.kind !== "pressing") throw new Error("Original pressing unavailable");
  const published = purchase?.checkpoint ? (await publishPersonalRecord(env, prepared)).record : prepared.record;
  await filePressing(env, published);
  return { pressing: published, from_pack: chosen.pack_id, window: ids };
}

/** The Keeper card, by the keeper's hand, to a wallet he names. */
export async function handPress(env: Env, holder: string, now: Date = new Date()): Promise<SignedCardRecord> {
  const signed = await press(env, { entry: CURRENT_SEASON.ally, source: "hand", date: now.toISOString(), holder });
  await filePressing(env, signed);
  return signed;
}

/* ── reads ────────────────────────────────────────────────────────── */

export async function getPack(env: Env, packId: string): Promise<SignedPackRecord | null> {
  return kvGetJson<SignedPackRecord>(env.PATRONS, KV_KEYS.pack(packId), "json");
}

export async function getCard(env: Env, cardId: string): Promise<SignedCardRecord | null> {
  return kvGetJson<SignedCardRecord>(env.PATRONS, KV_KEYS.card(cardId), "json");
}

export async function verifyCardSignature(record: SignedCardRecord): Promise<boolean> {
  return verifyMessageSignature(canonicalizeCard(record.card), record.signature, record.public_key);
}

export async function verifyPackSignature(record: SignedPackRecord): Promise<boolean> {
  return verifyMessageSignature(canonicalizePack(record.pack), record.signature, record.public_key);
}

export interface Binder {
  rows: BinderRow[];
  /** True when the wallet holds more than the cap and this is a floor, not the whole binder. */
  truncated: boolean;
}

export const BINDER_CAP = 100;

/** What one wallet holds, newest first. Capped, and the cap is reported. */
export async function readBinder(env: Env, wallet: string, cap = BINDER_CAP): Promise<Binder> {
  const listed = await listKeys(env.PATRONS, { prefix: KV_KEYS.binderPrefix(wallet.toLowerCase()), cap });
  const rows: BinderRow[] = [];
  for (const name of listed.names) {
    const row = await kvGetJson<BinderRow>(env.PATRONS, name, "json");
    if (row) rows.push(row);
  }
  return { rows, truncated: listed.truncated };
}

export { PACK_SIZE };
