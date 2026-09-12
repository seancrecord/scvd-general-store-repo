import { counterLedger } from "@/lib/counter-ledger";
import { newCardId, newPackId } from "@/lib/ids";
import { listKeys } from "@/lib/kv-list";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { getPass, passIsCurrent } from "@/services/patronage";
import { effectiveObservation } from "@/services/passport";
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
  BURN_RATES,
  CONDITION_CLEARS,
  conditionPool,
  CURRENT_SEASON,
  EARNED_BY_ITEM,
  entryByKey,
  PACK_SIZE,
  packPool,
  SLOT_WHEELS,
  WINDOW_LOCK_HOURS,
  type CardEntry,
  type Season,
  type WheelStop,
} from "@/store/cards";
import type {
  CardRarity,
  CardRecord,
  ConditionBurn,
  Env,
  PackRecord,
  PressingSource,
  SignedCardRecord,
  SignedConditionBurn,
  SignedPackRecord,
} from "@/types";

/**
 * PAYWALL'S LEDGER (handoff v2 over the first-pass plan).
 *
 * A pack is the unit of purchase and of recovery: prepared once,
 * checkpointed, published through the personal-goods coordinator like
 * a lucky, so a retry hands back the same five. Every pressing is
 * projected to its own key, filed in the holder's binder, and — for a
 * pack pull — set in the shop window.
 *
 * THE DRAW. HMAC-SHA256(seed_d, payer || cert_id || slot): the first
 * four bytes walk the slot's wheel (the first-pass odds table, with
 * "condition" a stop on slot 5 alone), the next four pick the card in
 * the pool. Print caps step within the tier; a capped tier falls back
 * to common. A Door's cap is its observation count, read off the
 * corpus once a day (first-pass rule 3).
 *
 * THE WINDOW moves pressings: a pick TRANSFERS the pressing from the
 * wallet that pulled it to the wallet that picked, re-signed with the
 * new holder. "If you draw someone else's Stale Passport, that is
 * your problem now." One pick per wallet per twelve hours.
 *
 * CONDITIONS CLEAR on the purchase the rule names; the burn is a
 * signed record beside the pressing, which itself never changes.
 * DUPES BURN into pack credit at the first pass's rates; rares never.
 */

/* ── canonical forms ─────────────────────────────────────────────── */

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
  for (const field of ["rail", "print_cap", "slot", "pack_id", "cert_id", "commit", "patron_number", "holder", "transfers", "door_hash", "observations"] as const) {
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

export function canonicalizeBurn(burn: ConditionBurn): string {
  const ordered: Record<string, string> = { card_id: burn.card_id, key: burn.key, holder: burn.holder, cleared_by: burn.cleared_by, at: burn.at };
  if (burn.cert_id) ordered["cert_id"] = burn.cert_id;
  return JSON.stringify(ordered);
}

/* ── the draw ─────────────────────────────────────────────────────── */

export interface DrawnSlot {
  slot: number;
  stop: WheelStop;
  card: CardEntry;
  drawn_index: number;
  stepped: boolean;
}

/** A capped entry is closed once its counter reaches the cap. */
export type CapReader = (entry: CardEntry) => Promise<boolean>;

const neverCapped: CapReader = async () => false;

export async function drawSlot(
  seed: Uint8Array,
  payer: string,
  certId: string,
  slot: number,
  options: { season?: Season; salt?: string; wheel?: readonly WheelStop[]; capped?: CapReader } = {},
): Promise<DrawnSlot> {
  const season = options.season ?? CURRENT_SEASON;
  const wheel = options.wheel ?? SLOT_WHEELS[slot - 1] ?? ["common"];
  const bytes = await drawBytes(seed, payer, certId, slot, options.salt ?? "");
  const unit = unitFromBytes(bytes, 0);
  const stop = wheel[Math.min(wheel.length - 1, Math.floor(unit * wheel.length))] as WheelStop;
  const pool = stop === "condition" ? conditionPool(season) : packPool(season, stop);
  if (pool.length === 0) throw new Error(`Season ${season.id} has nothing to draw for ${stop}`);
  const drawnIndex = indexFromBytes(bytes, 4, pool.length);
  const capped = options.capped ?? neverCapped;
  for (let step = 0; step < pool.length; step += 1) {
    const candidate = pool[(drawnIndex + step) % pool.length]!;
    if (!(await capped(candidate))) return { slot, stop, card: candidate, drawn_index: drawnIndex, stepped: step > 0 };
  }
  const commons = packPool(season, "common");
  const fallback = commons[indexFromBytes(bytes, 8, commons.length)]!;
  return { slot, stop: "common", card: fallback, drawn_index: drawnIndex, stepped: true };
}

/* ── counters: print numbers, door observations, credit ───────────── */

async function readCounter(env: Env, key: string): Promise<number> {
  const ledger = counterLedger(env, key);
  if (ledger) return ledger.read(key);
  const raw = await kvGet(env.COUNTERS, key);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

async function addCounter(env: Env, key: string, amount: number): Promise<number> {
  const ledger = counterLedger(env, key);
  if (ledger) return ledger.add(key, amount);
  const next = (await readCounter(env, key)) + amount;
  await kvPut(env.COUNTERS, key, String(next));
  return next;
}

async function readPressCount(env: Env, season: string, key: string): Promise<number> {
  return readCounter(env, KV_KEYS.paywallPress(season, key));
}

/**
 * A DOOR'S CAP IS ITS OBSERVATION COUNT (first-pass rule 3): the
 * rounds the corpus actually probed that host, read once a day and
 * remembered, so a draw never walks the chain. A host the corpus
 * never reached counts zero and never presses — honest, and printed
 * on the card if it ever does.
 */
export async function doorObservations(env: Env, entry: CardEntry, now: Date = new Date()): Promise<number> {
  if (!entry.door) return 0;
  const key = KV_KEYS.paywallDoorObservations(entry.key, utcDate(now));
  const cached = await kvGet(env.COUNTERS, key);
  if (cached !== null && cached !== undefined) return parseInt(cached, 10) || 0;
  let count = 0;
  try {
    const observation = await effectiveObservation(env, entry.door.host, now);
    count = observation.history.rounds_probed;
  } catch {
    count = 0;
  }
  await kvPut(env.COUNTERS, key, String(count), { expirationTtl: 86_400 });
  return count;
}

/** The cap in force for an entry now: fixed, or a Door's observation count, or none. */
export async function capOf(env: Env, entry: CardEntry, now: Date = new Date()): Promise<number | undefined> {
  if (entry.door) return doorObservations(env, entry, now);
  return entry.print_cap;
}

export function capReader(env: Env, season: Season, now: Date = new Date()): CapReader {
  return async (entry) => {
    const cap = await capOf(env, entry, now);
    if (cap === undefined) return false;
    return (await readPressCount(env, season.id, entry.key)) >= cap;
  };
}

export async function printStatus(env: Env, season: Season): Promise<Record<string, { pressed: number; cap?: number }>> {
  const status: Record<string, { pressed: number; cap?: number }> = {};
  for (const entry of allEntries(season)) {
    const pressed = await readPressCount(env, season.id, entry.key);
    const cap = await capOf(env, entry);
    status[entry.key] = { pressed, ...(cap !== undefined ? { cap } : {}) };
  }
  return status;
}

export async function readCredit(env: Env, wallet: string): Promise<number> {
  return readCounter(env, KV_KEYS.paywallCredit(wallet.toLowerCase()));
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
  observations?: number;
}

/** One pressing: the next print number, a signed record. Does not file it. */
async function press(env: Env, options: PressOptions): Promise<SignedCardRecord> {
  const season = options.season ?? CURRENT_SEASON;
  const { entry } = options;
  const printNo = await addCounter(env, KV_KEYS.paywallPress(season.id, entry.key), 1);
  const cap = entry.door ? options.observations : entry.print_cap;
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
    ...(cap !== undefined ? { print_cap: cap } : {}),
    source: options.source,
    ...(options.slot !== undefined ? { slot: options.slot } : {}),
    ...(options.packId ? { pack_id: options.packId } : {}),
    ...(options.certId ? { cert_id: options.certId } : {}),
    ...(options.commit ? { commit: options.commit } : {}),
    date: options.date,
    ...(options.patronNumber !== undefined ? { patron_number: options.patronNumber } : {}),
    ...(options.holder ? { holder: options.holder.toLowerCase() } : {}),
    ...(entry.door ? { door_hash: entry.door.hash, observations: options.observations ?? 0 } : {}),
  };
  return signCardRecord(env, card);
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
  holder?: string;
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
    ...(card.holder ? { holder: card.holder } : {}),
  };
}

function binderKey(card: CardRecord): string | null {
  return card.holder ? KV_KEYS.binder(card.holder, invertedTimestamp(Date.parse(card.date)), card.card_id) : null;
}

/** Project a signed pressing to its own key, and to the holder's binder. */
async function filePressing(env: Env, signed: SignedCardRecord): Promise<void> {
  await kvPut(env.PATRONS, KV_KEYS.card(signed.card.card_id), JSON.stringify(signed));
  const key = binderKey(signed.card);
  if (key) await kvPut(env.PATRONS, key, JSON.stringify(binderRowOf(signed.card)));
}

async function setInWindow(env: Env, signed: SignedCardRecord): Promise<void> {
  await kvPut(
    env.PATRONS,
    KV_KEYS.paywallWindow(invertedTimestamp(Date.parse(signed.card.date)), signed.card.card_id),
    JSON.stringify(binderRowOf(signed.card)),
  );
}

/* ── the pack ─────────────────────────────────────────────────────── */

export interface OpenPackOptions {
  certId: string;
  patronNumber: number;
  payer?: string;
  season?: Season;
  now?: Date;
  source?: PressingSource;
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
    const capped = capReader(env, season, now);
    const cards: SignedCardRecord[] = [];
    for (let slot = 1; slot <= PACK_SIZE; slot += 1) {
      const drawn = await drawSlot(seed, payer, options.certId, slot, { season, capped });
      cards.push(
        await press(env, {
          entry: drawn.card,
          source: options.source ?? "pack",
          date,
          season,
          slot,
          packId,
          certId: options.certId,
          commit,
          patronNumber: options.patronNumber,
          ...(options.payer ? { holder: options.payer } : {}),
          ...(drawn.card.door ? { observations: await doorObservations(env, drawn.card, now) } : {}),
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
  for (const signed of published.cards) {
    await filePressing(env, signed);
    await setInWindow(env, signed);
  }
  return published;
}

/* ── the bell ─────────────────────────────────────────────────────── */

export interface BellPressingOptions {
  wallet?: string;
  passId?: string;
  now?: Date;
}

export interface BellPressings {
  pressing: SignedCardRecord;
  /** Two packs for a current Regular (first pass), full odds. */
  packs: SignedPackRecord[];
  regular: boolean;
}

/**
 * One common a day off the bell — same HMAC, slot 0, salt "bell" —
 * and, for a wallet holding a current pass, two packs at full odds.
 * The bell is keyed on a name; the wallet and the pass are what the
 * ringer offers, and the pass is checked live, never assumed.
 */
export async function bellPressing(env: Env, who: string, options: BellPressingOptions = {}): Promise<BellPressings> {
  const now = options.now ?? new Date();
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const commit = await commitOf(seed);
  const drawn = await drawSlot(seed, who.toLowerCase(), seedDate, 0, { salt: "bell", wheel: ["common"] });
  const pressing = await press(env, { entry: drawn.card, source: "bell", date: now.toISOString(), commit, ...(options.wallet ? { holder: options.wallet } : {}) });
  await filePressing(env, pressing);
  let regular = false;
  const packs: SignedPackRecord[] = [];
  if (options.passId) {
    const pass = await getPass(env, options.passId).catch(() => null);
    regular = Boolean(pass && passIsCurrent(pass));
    if (regular) {
      for (let n = 1; n <= 2; n += 1) {
        packs.push(
          await openPack(env, {
            certId: `bell:${seedDate}:${who.toLowerCase()}:${n}`,
            patronNumber: pass!.patron_number,
            ...(options.wallet ? { payer: options.wallet } : {}),
            now,
            source: "bell",
          }),
        );
      }
    }
  }
  return { pressing, packs, regular };
}

/* ── earned ───────────────────────────────────────────────────────── */

export interface EarnedOptions {
  /** A set entry key; or the shelf item that earns one (EARNED_BY_ITEM). */
  key?: string;
  itemId?: string;
  certId: string;
  patronNumber?: number;
  payer?: string;
  now?: Date;
}

/** The card an action earns, pressed to the wallet that acted. Null when the action earns nothing. */
export async function earnedPressing(env: Env, options: EarnedOptions, purchase?: PersonalPurchase): Promise<SignedCardRecord | null> {
  const season = CURRENT_SEASON;
  const key = options.key ?? (options.itemId ? EARNED_BY_ITEM[options.itemId] : undefined);
  if (!key) return null;
  const entry = entryByKey(season, key);
  if (!entry) throw new Error(`No set entry ${key}`);
  const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const commit = await commitOf(await seedFor(env, seedDate));
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

/* ── the window ───────────────────────────────────────────────────── */

export const WINDOW_SIZE = 5;

/** The last pressings pulled from packs store-wide, newest first, plus anything the keeper set out. */
export async function readWindow(env: Env): Promise<BinderRow[]> {
  const listed = await listKeys(env.PATRONS, { prefix: KV_KEYS.paywallWindowPrefix, cap: WINDOW_SIZE });
  const rows: BinderRow[] = [];
  for (const name of listed.names) {
    const row = await kvGetJson<BinderRow>(env.PATRONS, name, "json");
    if (row) rows.push(row);
  }
  return rows;
}

export class WindowRefused extends Error {}

/**
 * A window pick TRANSFERS one of the pressings on show to the buyer:
 * the record is re-signed with the new holder and one more transfer,
 * the old binder row goes, the window row goes. The seed, the payer,
 * the certificate and the window's card ids say which of the five.
 * One pick per wallet per twelve hours; a second inside the window
 * refuses before anything settles, so nothing is charged.
 */
/**
 * The refusals that must land BEFORE the money moves: the twelve-hour
 * lock and an emptied window. Fulfillment asks this above its settle
 * line, so a refused pick costs nothing; windowPick asks again for
 * the callers that do not pay (credit, the keeper).
 */
export async function assertWindowOpenFor(env: Env, wallet?: string): Promise<BinderRow[]> {
  if (wallet) {
    const locked = await kvGet(env.COUNTERS, KV_KEYS.paywallWindowLock(wallet.toLowerCase()));
    if (locked) {
      throw new WindowRefused(`One window pick per wallet per ${WINDOW_LOCK_HOURS} hours; this wallet picked at ${locked}. Nothing charged.`);
    }
  }
  const window = await readWindow(env);
  if (window.length === 0) throw new WindowRefused("The window is empty: nobody has opened a pack yet. Nothing charged.");
  return window;
}

export async function windowPick(env: Env, options: OpenPackOptions, purchase?: PersonalPurchase): Promise<{ pressing: SignedCardRecord; from_holder: string | null; window: string[] }> {
  const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
  const wallet = options.payer?.toLowerCase();
  const window = await assertWindowOpenFor(env, wallet);
  const seedDate = utcDate(now);
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const ids = window.map((row) => row.card_id);
  const bytes = await drawBytes(seed, wallet ?? "none", options.certId, ids.join(","), "window");
  const chosen = window[indexFromBytes(bytes, 0, window.length)]!;
  const existing = await getCard(env, chosen.card_id);
  if (!existing) throw new WindowRefused("The card in the window is gone. Try again; nothing charged.");
  const fromHolder = existing.card.holder ?? null;
  const moved = await signCardRecord(env, {
    ...existing.card,
    ...(wallet ? { holder: wallet } : {}),
    transfers: (existing.card.transfers ?? 0) + 1,
  });
  // The old binder row and the window row go; the new holder's row comes.
  const oldKey = binderKey(existing.card);
  if (oldKey) await env.PATRONS.delete(oldKey);
  await env.PATRONS.delete(KV_KEYS.paywallWindow(invertedTimestamp(Date.parse(existing.card.date)), existing.card.card_id));
  await filePressing(env, moved);
  if (wallet) {
    await kvPut(env.COUNTERS, KV_KEYS.paywallWindowLock(wallet), now.toISOString(), { expirationTtl: WINDOW_LOCK_HOURS * 3600 });
  }
  return { pressing: moved, from_holder: fromHolder, window: ids };
}

/* ── the keeper's hand ────────────────────────────────────────────── */

/** Any entry, by hand: to a wallet's binder, or set out in the window for whoever picks it. */
export async function handPress(env: Env, key: string, destination: { wallet?: string; window?: boolean }, now: Date = new Date()): Promise<SignedCardRecord> {
  const entry = entryByKey(CURRENT_SEASON, key);
  if (!entry) throw new Error(`No set entry ${key}`);
  const signed = await press(env, { entry, source: "hand", date: now.toISOString(), ...(destination.wallet ? { holder: destination.wallet } : {}) });
  await filePressing(env, signed);
  if (destination.window) await setInWindow(env, signed);
  return signed;
}

/* ── conditions clear, dupes burn ─────────────────────────────────── */

export async function readBurn(env: Env, cardId: string): Promise<SignedConditionBurn | null> {
  return kvGetJson<SignedConditionBurn>(env.PATRONS, KV_KEYS.paywallBurn(cardId), "json");
}

async function burnPressing(env: Env, card: CardRecord, clearedBy: string, certId: string | undefined, now: Date): Promise<SignedConditionBurn> {
  const burn: ConditionBurn = { card_id: card.card_id, key: card.key, holder: card.holder ?? "", cleared_by: clearedBy, ...(certId ? { cert_id: certId } : {}), at: now.toISOString() };
  const { signature, publicKey } = await signMessage(canonicalizeBurn(burn), env.SIGNING_KEY);
  const signed: SignedConditionBurn = { burn, signature, public_key: publicKey };
  await kvPut(env.PATRONS, KV_KEYS.paywallBurn(card.card_id), JSON.stringify(signed));
  const key = binderKey(card);
  if (key) await env.PATRONS.delete(key);
  return signed;
}

/**
 * THE PURCHASE THAT CLEARS A CONDITION (first pass): after any
 * purchase by a wallet, every Condition in its binder whose rule names
 * that item — or any item, with an idempotency key, for Double Charge
 * — burns. Never charged for, never automatic on the clock.
 */
export async function clearConditions(env: Env, wallet: string, cleared: { itemId: string; certId?: string; idempotent?: boolean; now?: Date }): Promise<SignedConditionBurn[]> {
  const now = cleared.now ?? new Date();
  const { rows } = await readBinder(env, wallet);
  const burns: SignedConditionBurn[] = [];
  for (const row of rows) {
    if (row.type !== "condition") continue;
    const rule = CONDITION_CLEARS[row.key];
    if (!rule) continue;
    const byItem = rule.items?.includes(cleared.itemId) ?? false;
    const byKey = Boolean(rule.any_idempotent && cleared.idempotent);
    if (!byItem && !byKey) continue;
    const record = await getCard(env, row.card_id);
    if (!record || (await readBurn(env, row.card_id))) continue;
    burns.push(await burnPressing(env, record.card, byItem ? cleared.itemId : "idempotency", cleared.certId, now));
  }
  return burns;
}

export class BurnRefused extends Error {}

/**
 * DUPES BURN INTO PACK CREDIT (first pass): twenty commons or five
 * uncommons a pack, rares never. Only whole batches burn; the rest
 * stay in the binder untouched. Ownership was proved upstream by the
 * challenge desk; this trusts its caller for that one fact.
 */
export async function burnForCredit(env: Env, wallet: string, cardIds: readonly string[], now: Date = new Date()): Promise<{ burned: string[]; credits: number; balance: number }> {
  const holder = wallet.toLowerCase();
  const byRarity: Record<string, CardRecord[]> = { common: [], uncommon: [] };
  for (const cardId of new Set(cardIds)) {
    const record = await getCard(env, cardId);
    if (!record) throw new BurnRefused(`No card ${cardId} was ever pressed here.`);
    if (record.card.holder !== holder) throw new BurnRefused(`${cardId} is not in this wallet's binder.`);
    if (await readBurn(env, cardId)) throw new BurnRefused(`${cardId} has already burned.`);
    if (record.card.type === "condition") throw new BurnRefused(`${cardId} is a Condition; it clears on the fix, it does not burn for credit.`);
    const bucket = byRarity[record.card.rarity];
    if (!bucket) throw new BurnRefused(`${cardId} is ${record.card.rarity}; rares never burn.`);
    bucket.push(record.card);
  }
  const burned: string[] = [];
  let credits = 0;
  for (const [rarity, cards] of Object.entries(byRarity)) {
    const rate = BURN_RATES[rarity]!;
    const batches = Math.floor(cards.length / rate);
    for (const card of cards.slice(0, batches * rate)) {
      await burnPressing(env, card, "credit", undefined, now);
      burned.push(card.card_id);
    }
    credits += batches;
  }
  if (credits === 0) throw new BurnRefused(`Nothing burned: a pack of credit takes ${BURN_RATES["common"]} commons or ${BURN_RATES["uncommon"]} uncommons, whole batches only.`);
  const balance = await addCounter(env, KV_KEYS.paywallCredit(holder), credits);
  return { burned, credits, balance };
}

/** Spend one pack of credit on a pack or a window pick. The credit is the payment; nothing settles. */
export async function redeemCredit(env: Env, wallet: string, want: "pack" | "window_pick", now: Date = new Date()): Promise<{ pack?: SignedPackRecord; pressing?: SignedCardRecord; balance: number }> {
  const holder = wallet.toLowerCase();
  const key = KV_KEYS.paywallCredit(holder);
  const balance = await readCounter(env, key);
  if (balance < 1) throw new BurnRefused("No pack credit on this wallet. Twenty commons or five uncommons burn into one.");
  const after = await addCounter(env, key, -1);
  const certId = `credit:${holder}:${now.toISOString()}`;
  try {
    if (want === "pack") {
      const pack = await openPack(env, { certId, patronNumber: 0, payer: holder, now, source: "credit" });
      return { pack, balance: after };
    }
    const picked = await windowPick(env, { certId, patronNumber: 0, payer: holder, now });
    return { pressing: picked.pressing, balance: after };
  } catch (error) {
    await addCounter(env, key, 1);
    throw error;
  }
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
  truncated: boolean;
  /** Three or more Conditions at once (first pass): cosmetic, shareable, mildly humiliating. */
  under_the_weather: boolean;
  conditions: number;
}

export const BINDER_CAP = 100;

export async function readBinder(env: Env, wallet: string, cap = BINDER_CAP): Promise<Binder> {
  const listed = await listKeys(env.PATRONS, { prefix: KV_KEYS.binderPrefix(wallet.toLowerCase()), cap });
  const rows: BinderRow[] = [];
  for (const name of listed.names) {
    const row = await kvGetJson<BinderRow>(env.PATRONS, name, "json");
    if (row) rows.push(row);
  }
  const conditions = rows.filter((row) => row.type === "condition").length;
  return { rows, truncated: listed.truncated, under_the_weather: conditions >= 3, conditions };
}

export { PACK_SIZE };
