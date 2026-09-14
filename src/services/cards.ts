import { counterLedger, countersSerialized } from "@/lib/counter-ledger";
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
  bytesToHex,
  commitOf,
  deriveSecret,
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
  RAIL_HOLO_KEY,
  releasable,
  RELEASE_CEILING,
  RELEASE_FLOOR,
  SLOT_WHEELS,
  type CardEntry,
  type Season,
  type WheelStop,
  WINDOW_LOCK_HOURS,
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

export class CapReached extends Error {}

/**
 * One pressing: the next print number, a signed record. Does not
 * file it. The cap holds HERE too, not only in the draw's stepping:
 * a one-of-one pressed by hand a second time hands the number back
 * and refuses, so the Keeper and CV stay one print a season.
 */
async function press(env: Env, options: PressOptions): Promise<SignedCardRecord> {
  const season = options.season ?? CURRENT_SEASON;
  const { entry } = options;
  /**
   * A CAP NOBODY CAN ENFORCE IS NOT A CAP (2026-09-12). Print numbers
   * are atomic on the counter ledger and a read-modify-write without
   * it, so on a deployment with no COUNTER_LEDGER bound two presses of
   * a one-of-one could both come back number one. Rather than print a
   * second "1 / 1" and let the face tell that lie, the press refuses
   * and says why. Fixed caps only: a Door's cap is its observation
   * count, which moves on its own and was never a promise of scarcity.
   */
  if (entry.print_cap !== undefined && !countersSerialized(env)) {
    throw new CapReached(`${entry.name} is capped at ${entry.print_cap}, and this deployment has no serialized counter to enforce it. Nothing pressed.`);
  }
  const printNo = await addCounter(env, KV_KEYS.paywallPress(season.id, entry.key), 1);
  const cap = entry.door ? options.observations : entry.print_cap;
  if (cap !== undefined && printNo > cap) {
    await addCounter(env, KV_KEYS.paywallPress(season.id, entry.key), -1);
    throw new CapReached(`${entry.name} is capped at ${cap} print${cap === 1 ? "" : "s"} this season, and ${cap === 1 ? "it is" : "they are"} pressed.`);
  }
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
  // The Rail holo leaves a marker on its holder, so the perk below is one
  // KV read on the money path instead of a listing of the whole binder.
  if (signed.card.key === RAIL_HOLO_KEY && signed.card.holder) {
    await kvPut(env.COUNTERS, KV_KEYS.paywallHolo(signed.card.holder.toLowerCase()), signed.card.card_id);
  }
}

async function setInWindow(env: Env, signed: SignedCardRecord): Promise<void> {
  await kvPut(
    env.PATRONS,
    KV_KEYS.paywallWindow(invertedTimestamp(Date.parse(signed.card.date)), signed.card.card_id),
    JSON.stringify(binderRowOf(signed.card)),
  );
}

/* ── the release wheel ────────────────────────────────────────────── */

/** A one-of-one's wheel: the secret bytes, their commit, and the milestone they fix. */
export interface ReleaseWheel {
  key: string;
  name: string;
  /** sha256 of the secret bytes. Published from the day the season opened. */
  commit: string;
  /** Packs opened this season that the release lands on. Secret until it lands. */
  milestone: number;
  /** The bytes themselves, hex. Only ever published beside a landed release. */
  reveal: string;
}

/** The public record of a landing: written once, the moment the pack carries it. */
export interface ReleaseRecord {
  season: string;
  key: string;
  name: string;
  commit: string;
  milestone: number;
  reveal: string;
  /** The pack count this actually landed on; equals the milestone unless it was pulled forward. */
  pack_no: number;
  pack_id: string;
  card_id: string;
  holder: string | null;
  at: string;
  pulled_forward: boolean;
}

export async function releaseWheel(env: Env, season: Season, entry: CardEntry): Promise<ReleaseWheel> {
  const bytes = await deriveSecret(env, `paywall:release:${season.id}:${entry.key}`);
  const span = RELEASE_CEILING - RELEASE_FLOOR + 1;
  return {
    key: entry.key,
    name: entry.name,
    commit: await commitOf(bytes),
    milestone: RELEASE_FLOOR + indexFromBytes(bytes, 0, span),
    reveal: bytesToHex(bytes),
  };
}

/**
 * THE COMMITS ALONE, WITHOUT TOUCHING KV (2026-09-13). The storefront
 * puts these two hashes on the front page, and the front page is the
 * hottest door in the store: this is four HMACs and two digests and
 * not a single read, so a card rack on the homepage costs nothing to
 * serve. The milestone the same bytes fix never leaves this module.
 */
export async function releaseCommits(env: Env, season: Season = CURRENT_SEASON): Promise<{ key: string; name: string; commit: string }[]> {
  return Promise.all(
    releasable(season).map(async (entry) => {
      const { key, name, commit } = await releaseWheel(env, season, entry);
      return { key, name, commit };
    }),
  );
}

/** Packs opened this season. The denominator every milestone is counted on. */
export async function packsOpened(env: Env, season: Season = CURRENT_SEASON): Promise<number> {
  return readCounter(env, KV_KEYS.paywallPacks(season.id));
}

export async function readRelease(env: Env, season: Season, key: string): Promise<ReleaseRecord | null> {
  return (await kvGetJson<ReleaseRecord>(env.PATRONS, KV_KEYS.paywallRelease(season.id, key), "json")) ?? null;
}

export interface ReleaseState {
  key: string;
  name: string;
  commit: string;
  floor: number;
  ceiling: number;
  landed: ReleaseRecord | null;
  pulled_forward_at: string | null;
}

/**
 * What the store can say out loud about the wheel: the commit for each
 * one-of-one from day one, the range, whether it has landed, and — only
 * once it has — the milestone and the bytes that prove the commit.
 */
export async function releaseStates(env: Env, season: Season = CURRENT_SEASON): Promise<ReleaseState[]> {
  const states: ReleaseState[] = [];
  for (const entry of releasable(season)) {
    const wheel = await releaseWheel(env, season, entry);
    const landed = await readRelease(env, season, entry.key);
    const forced = await kvGet(env.COUNTERS, KV_KEYS.paywallReleaseNow(season.id, entry.key));
    states.push({
      key: entry.key,
      name: entry.name,
      commit: wheel.commit,
      floor: RELEASE_FLOOR,
      ceiling: RELEASE_CEILING,
      landed,
      pulled_forward_at: forced ?? null,
    });
  }
  return states;
}

/**
 * THE KEEPER'S ONE LEVER. Not a wallet and not a pack: a mark that says
 * this one rides the very next pack somebody opens, whoever they are.
 * The record it lands with says it was pulled forward, and reveals the
 * milestone it would otherwise have waited for.
 */
export async function pullReleaseForward(env: Env, key: string, now: Date = new Date(), season: Season = CURRENT_SEASON): Promise<ReleaseState> {
  const entry = releasable(season).find((card) => card.key === key);
  if (!entry) throw new Error(`${key} is not a one-of-one on the release wheel this season`);
  if (await readRelease(env, season, key)) throw new CapReached(`${entry.name} has already landed. One print a season.`);
  await kvPut(env.COUNTERS, KV_KEYS.paywallReleaseNow(season.id, key), now.toISOString());
  const states = await releaseStates(env, season);
  return states.find((state) => state.key === key)!;
}

/** Undo the lever before it fires. */
export async function holdRelease(env: Env, key: string, season: Season = CURRENT_SEASON): Promise<void> {
  await env.COUNTERS.delete(KV_KEYS.paywallReleaseNow(season.id, key));
}

interface DueRelease {
  entry: CardEntry;
  wheel: ReleaseWheel;
  pulled_forward: boolean;
}

/**
 * Is a one-of-one due on this pack? At most one a pack: if both wheels
 * come due at the same count the second waits for the next pack, so a
 * single buyer never sweeps the season's one-of-ones in one purchase.
 */
async function dueRelease(env: Env, season: Season, packNo: number): Promise<DueRelease | null> {
  // No serialized counter means press() would refuse a capped card anyway.
  if (!countersSerialized(env)) return null;
  for (const entry of releasable(season)) {
    if (await readRelease(env, season, entry.key)) continue;
    if ((await readPressCount(env, season.id, entry.key)) > 0) continue;
    const forced = await kvGet(env.COUNTERS, KV_KEYS.paywallReleaseNow(season.id, entry.key));
    const wheel = await releaseWheel(env, season, entry);
    if (!forced && packNo < wheel.milestone) continue;
    return { entry, wheel, pulled_forward: Boolean(forced) };
  }
  return null;
}

/** Write the landing once, and never a second time for the same season and key. */
async function recordRelease(env: Env, season: Season, signed: SignedCardRecord, packId: string, packNo: number, now: Date): Promise<void> {
  const key = signed.card.key;
  if (await readRelease(env, season, key)) return;
  const entry = releasable(season).find((card) => card.key === key);
  if (!entry) return;
  const wheel = await releaseWheel(env, season, entry);
  const forced = await kvGet(env.COUNTERS, KV_KEYS.paywallReleaseNow(season.id, key));
  const record: ReleaseRecord = {
    season: season.id,
    key,
    name: entry.name,
    commit: wheel.commit,
    milestone: wheel.milestone,
    reveal: wheel.reveal,
    pack_no: packNo,
    pack_id: packId,
    card_id: signed.card.card_id,
    holder: signed.card.holder ?? null,
    at: now.toISOString(),
    pulled_forward: Boolean(forced),
  };
  await kvPut(env.PATRONS, KV_KEYS.paywallRelease(season.id, key), JSON.stringify(record));
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
  /** The count this pack was, kept for the release record below; a retained replay re-reads it. */
  let packNo: number | null = null;
  const prepared = await retainPersonalRecord(purchase, async () => {
    const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
    const date = now.toISOString();
    const seedDate = utcDate(now);
    await publishSeedRecord(env, seedDate, now);
    const seed = await seedFor(env, seedDate);
    const commit = await commitOf(seed);
    const payer = (options.payer ?? "none").toLowerCase();
    const packId = newPackId();
    /**
     * A CAP MUST NEVER COST A PAID PACK (2026-09-12, found by walking
     * our own doors). The draw steps past a card whose cap is already
     * spent, but the read and the press are two moments: two buyers can
     * both draw the last print of a one-of-one, and the second press
     * refuses. This function runs BELOW the settle line, so a refusal
     * there would be money taken and no pack handed over. So the slot
     * re-draws instead, with the exhausted key added to what counts as
     * capped, and the pull stays inside its tier the same way the
     * draw's own stepping does.
     */
    const exhausted = new Set<string>();
    const capReadThrough = capReader(env, season, now);
    const capped: CapReader = async (entry) => exhausted.has(entry.key) || (await capReadThrough(entry));
    /**
     * THE RELEASE WHEEL TURNS HERE. This pack's number comes off the
     * serialized counter before a single slot is drawn, so two packs
     * opened at once are two different counts and only one of them can
     * be the one that crosses a milestone. If one is due, the day seed
     * says which of the five slots it takes — the ordinary draw for
     * that slot is simply not made — and a press that loses the race
     * falls back to that draw, below the settle line, so a one-of-one
     * never costs somebody their pack.
     */
    packNo = await addCounter(env, KV_KEYS.paywallPacks(season.id), 1);
    const due = await dueRelease(env, season, packNo);
    const landingSlot = due ? 1 + indexFromBytes(await drawBytes(seed, payer, options.certId, "release"), 0, PACK_SIZE) : 0;
    const cards: SignedCardRecord[] = [];
    for (let slot = 1; slot <= PACK_SIZE; slot += 1) {
      let pressed: SignedCardRecord | null = null;
      if (due && slot === landingSlot) {
        try {
          pressed = await press(env, {
            entry: due.entry,
            source: options.source ?? "pack",
            date,
            season,
            slot,
            packId,
            certId: options.certId,
            commit,
            patronNumber: options.patronNumber,
            ...(options.payer ? { holder: options.payer } : {}),
          });
        } catch (error) {
          if (!(error instanceof CapReached)) throw error;
        }
      }
      for (let attempt = 0; attempt < PACK_SIZE && !pressed; attempt += 1) {
        const drawn = await drawSlot(seed, payer, options.certId, slot, { season, capped });
        try {
          pressed = await press(env, {
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
          });
        } catch (error) {
          if (!(error instanceof CapReached)) throw error;
          exhausted.add(drawn.card.key);
        }
      }
      if (!pressed) throw new Error("Every card the wheel offered this slot is capped");
      cards.push(pressed);
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
  /**
   * A landed one-of-one gets its public record and its holder's perk.
   * Read off the published pack rather than off the closure, so a
   * retained replay that never re-ran the draw still writes the record
   * exactly once (recordRelease refuses a second).
   */
  const landed = published.cards.find((signed) => signed.card.rarity === "keeper");
  if (landed) {
    const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
    await recordRelease(env, season, landed, published.pack.pack_id, packNo ?? (await packsOpened(env, season)), now);
    await grantHolderPerk(env, landed.card);
  }
  return published;
}

/* ── the bell ─────────────────────────────────────────────────────── */

export interface BellPressingOptions {
  wallet?: string;
  passId?: string;
  now?: Date;
}

export interface BellStreak {
  /** Consecutive UTC days this wallet has rung, today included. */
  days: number;
  /** Day 7, 14, 21…: a pack at full odds (the first pass's streak rule). */
  pack?: SignedPackRecord;
  /** Day 30: Bellringer II, once. */
  bellringer_ii?: SignedCardRecord;
}

export interface BellPressings {
  pressing: SignedCardRecord;
  /** Two packs for a current Regular (first pass), full odds. */
  packs: SignedPackRecord[];
  regular: boolean;
  /** Present when the ringer sent a wallet: the streak, and what it handed out today. */
  streak?: BellStreak;
}

interface StreakRecord {
  last: string;
  days: number;
  /** The last day a streak reward was handed out, so a repeat ring on the same day hands nothing twice. */
  rewarded?: string;
}

export const STREAK_PACK_EVERY = 7;
export const STREAK_BELLRINGER_II_DAY = 30;

function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return utcDate(at);
}

/**
 * THE STREAK (first pass, "bell": day 7 a pack, day 30 Bellringer II),
 * keyed on the wallet the ringer sent, never on the name or the IP
 * the bell itself counts. A ring on the day after the last ring
 * extends the run; a gap resets it to one. The rewards land on the
 * day the run reaches them and never twice for one day.
 */
async function advanceStreak(env: Env, wallet: string, seedDate: string, now: Date, patronNumber: number): Promise<BellStreak> {
  const key = KV_KEYS.paywallStreak(wallet.toLowerCase());
  const current = await kvGetJson<StreakRecord>(env.COUNTERS, key, "json");
  const days = current?.last === seedDate ? current.days : current?.last === dayBefore(seedDate) ? current.days + 1 : 1;
  const alreadyRewarded = current?.last === seedDate && current.rewarded === seedDate;
  const streak: BellStreak = { days };
  if (!alreadyRewarded) {
    if (days % STREAK_PACK_EVERY === 0) {
      streak.pack = await openPack(env, { certId: `bell:streak:${seedDate}:${wallet.toLowerCase()}:${days}`, patronNumber, payer: wallet, now, source: "bell" });
    }
    if (days === STREAK_BELLRINGER_II_DAY) {
      const pressed = await earnedPressing(env, { key: "bellringer-ii", certId: `bell:streak:${seedDate}:${wallet.toLowerCase()}:30`, patronNumber, payer: wallet, now });
      if (pressed) streak.bellringer_ii = pressed;
    }
  }
  const next: StreakRecord = { last: seedDate, days, ...(streak.pack || streak.bellringer_ii || alreadyRewarded ? { rewarded: seedDate } : {}) };
  await kvPut(env.COUNTERS, key, JSON.stringify(next));
  return streak;
}

/** Whether a wallet has ever pressed a set entry (so the Room a first ring earns is pressed once). */
async function holds(env: Env, wallet: string, key: string): Promise<boolean> {
  const { rows } = await readBinder(env, wallet);
  return rows.some((row) => row.key === key);
}

/**
 * One common a day off the bell — same HMAC, slot 0, salt "bell" —
 * and, for a wallet holding a current pass, two packs at full odds.
 * The bell is keyed on a name; the wallet and the pass are what the
 * ringer offers, and the pass is checked live, never assumed.
 */
export async function bellPressing(env: Env, who: string, options: BellPressingOptions = {}): Promise<BellPressings | null> {
  const now = options.now ?? new Date();
  const seedDate = utcDate(now);
  /**
   * ONE CARD A DAY MEANS ONE CARD A DAY (2026-09-12, found by walking
   * our own doors). The bell's own repeat guard keys on the name the
   * caller gave, which the caller invents: twenty-two names rang
   * twenty-two free commons into one binder in one afternoon, and
   * twenty commons burn into a pack of credit. The card now keys on
   * the WALLET it would land in, so a binder takes one a day however
   * many names knock. A ring with no wallet still presses — that card
   * has no holder, so it can never burn — and the bell itself is
   * unchanged: it rings, it counts, it says its line.
   */
  if (options.wallet) {
    const dayKey = KV_KEYS.paywallBellDay(options.wallet.toLowerCase(), seedDate);
    if (await kvGet(env.COUNTERS, dayKey)) return null;
    await kvPut(env.COUNTERS, dayKey, now.toISOString(), { expirationTtl: 2 * 86400 });
  }
  await publishSeedRecord(env, seedDate, now);
  const seed = await seedFor(env, seedDate);
  const commit = await commitOf(seed);
  // The first ring from a wallet earns the Bellringer Room (the action
  // presses it, once); every ring after that hands out one common.
  const firstRing = options.wallet ? !(await holds(env, options.wallet, "bellringer")) : false;
  const drawn = firstRing
    ? null
    : await drawSlot(seed, who.toLowerCase(), seedDate, 0, { salt: "bell", wheel: ["common"] });
  const pressing = await press(env, {
    entry: drawn ? drawn.card : entryByKey(CURRENT_SEASON, "bellringer")!,
    source: drawn ? "bell" : "earned",
    date: now.toISOString(),
    commit,
    ...(options.wallet ? { holder: options.wallet } : {}),
  });
  await filePressing(env, pressing);
  let regular = false;
  const packs: SignedPackRecord[] = [];
  let pass: Awaited<ReturnType<typeof getPass>> | null = null;
  if (options.passId) {
    pass = await getPass(env, options.passId).catch(() => null);
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
  const streak = options.wallet ? await advanceStreak(env, options.wallet, seedDate, now, pass?.patron_number ?? 0) : undefined;
  return { pressing, packs, regular, ...(streak ? { streak } : {}) };
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
  // A window holding nothing but one-of-ones has nothing to sell, and
  // the refusal belongs above the settle line with the empty one.
  if (wallet) {
    const locked = await kvGet(env.COUNTERS, KV_KEYS.paywallWindowLock(wallet.toLowerCase()));
    if (locked) {
      throw new WindowRefused(`One window pick per wallet per ${WINDOW_LOCK_HOURS} hours; this wallet picked at ${locked}. Nothing charged.`);
    }
  }
  const window = await readWindow(env);
  if (window.length === 0) throw new WindowRefused("The window is empty: nobody has opened a pack yet. Nothing charged.");
  if (window.every((row) => row.rarity === "keeper")) {
    throw new WindowRefused("Everything in the window is one of one: on show, released by the wheel into somebody's pack, never sold. Nothing charged.");
  }
  return window;
}

/**
 * A ONE-OF-ONE IS ON SHOW, NOT FOR SALE (2026-09-12, after walking our
 * own doors). The pick's twelve-hour lock is per wallet, and a buyer
 * with five wallets can sweep a five-deep window: two dollars and
 * forty-five cents bought the Keeper with certainty, which is not a
 * lottery, it is a price on a specific card — the one thing the table
 * promises it will never do. So the seed draws from the window's
 * ordinary pressings; a one-of-one that passes through the window on
 * its way to the binder it landed in can be looked at and not bought.
 * (2026-09-13: and it gets there off the release wheel, so the keeper
 * does not choose its wallet either.) ⚑ To sell them again, delete
 * this filter: one line.
 */
function pickable(rows: readonly BinderRow[]): BinderRow[] {
  return rows.filter((row) => row.rarity !== "keeper");
}

export async function windowPick(env: Env, options: OpenPackOptions, purchase?: PersonalPurchase): Promise<{ pressing: SignedCardRecord; from_holder: string | null; window: string[] }> {
  const now = options.now ?? (purchase?.purchasedAt ? new Date(purchase.purchasedAt) : new Date());
  const wallet = options.payer?.toLowerCase();
  const window = pickable(await assertWindowOpenFor(env, wallet));
  if (window.length === 0) throw new WindowRefused("Everything in the window is one of one: on show, released by the wheel into somebody's pack, never sold. Nothing charged.");
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
    await grantHolderPerk(env, moved.card);
  }
  return { pressing: moved, from_holder: fromHolder, window: ids };
}

/* ── the holder's perk ────────────────────────────────────────────── */

/**
 * THE ONE-OF-ONE'S PERK (first pass, "holder perks", the part that is
 * not a price): the wallet a Keeper or CV lands with gets one pack of
 * credit, once per pressing, to spend on a pack or the window. The
 * plan's 5% off for a Rail holo is a price and waits on the pricing
 * charter's one-price clause; this is not, and does not.
 */
export async function grantHolderPerk(env: Env, card: CardRecord): Promise<number | null> {
  if (card.rarity !== "keeper" || !card.holder) return null;
  const marker = KV_KEYS.paywallPerk(card.card_id);
  if (await kvGet(env.COUNTERS, marker)) return null;
  await kvPut(env.COUNTERS, marker, card.holder.toLowerCase());
  return addCounter(env, KV_KEYS.paywallCredit(card.holder.toLowerCase()), 1);
}

/* ── the keeper's hand ────────────────────────────────────────────── */

/** Any entry, by hand: to a wallet's binder, or set out in the window for whoever picks it. */
export async function handPress(env: Env, key: string, destination: { wallet?: string; window?: boolean }, now: Date = new Date()): Promise<SignedCardRecord> {
  const entry = entryByKey(CURRENT_SEASON, key);
  if (!entry) throw new Error(`No set entry ${key}`);
  const signed = await press(env, { entry, source: "hand", date: now.toISOString(), ...(destination.wallet ? { holder: destination.wallet } : {}) });
  await filePressing(env, signed);
  if (destination.window) await setInWindow(env, signed);
  else await grantHolderPerk(env, signed.card);
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
  /**
   * CLAIM EACH CARD BEFORE IT COUNTS (2026-09-12, found by walking our
   * own doors). The challenge nonce is single-use, but two requests
   * carrying one signature can both read it before either deletes it,
   * and then both would burn the same twenty cards and both bank a
   * credit. The claim counter is the ledger's atomic add where the
   * deployment has one: the request that takes a card from 0 to 1 owns
   * it, and a second request finds 2 and counts nothing. Where no
   * ledger is bound the add is a KV read-modify-write and this is a
   * narrowing, not a proof — the same honest limit every counter here
   * carries, and the desk says so.
   */
  const burned: string[] = [];
  let credits = 0;
  for (const [rarity, cards] of Object.entries(byRarity)) {
    const rate = BURN_RATES[rarity]!;
    const mine: CardRecord[] = [];
    for (const card of cards) {
      if ((await addCounter(env, KV_KEYS.paywallBurnClaim(card.card_id), 1)) === 1) mine.push(card);
    }
    const batches = Math.floor(mine.length / rate);
    for (const card of mine.slice(0, batches * rate)) {
      await burnPressing(env, card, "credit", undefined, now);
      burned.push(card.card_id);
    }
    // A card claimed but not burned (the remainder of a part batch) is released.
    for (const card of mine.slice(batches * rate)) await addCounter(env, KV_KEYS.paywallBurnClaim(card.card_id), -1);
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
  /**
   * SPEND FIRST, THEN LOOK (2026-09-12, found by walking our own
   * doors). Reading the balance and then decrementing let two
   * concurrent redemptions both see one credit, both take a pack, and
   * leave the balance at minus one — a number the books cannot mean.
   * The decrement is the check now: the request that lands below zero
   * puts its credit back and is refused, and the ledger never holds a
   * negative.
   */
  const after = await addCounter(env, key, -1);
  if (after < 0) {
    await addCounter(env, key, 1);
    throw new BurnRefused("No pack credit on this wallet. Twenty commons or five uncommons burn into one.");
  }
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

export async function readBinder(env: Env, wallet: string, cap = BINDER_CAP, now: Date = new Date()): Promise<Binder> {
  const listed = await listKeys(env.PATRONS, { prefix: KV_KEYS.binderPrefix(wallet.toLowerCase()), cap });
  const rows: BinderRow[] = [];
  for (const name of listed.names) {
    const row = await kvGetJson<BinderRow>(env.PATRONS, name, "json");
    if (!row) continue;
    // A Condition that clears on the clock (Rate Limited) burns at the
    // first read after its hours are up: a signed burn, cleared_by "time".
    const hours = row.type === "condition" ? CONDITION_CLEARS[row.key]?.hours : undefined;
    if (hours !== undefined && Date.parse(row.date) + hours * 3_600_000 <= now.getTime()) {
      const record = await getCard(env, row.card_id);
      if (record && !(await readBurn(env, row.card_id))) await burnPressing(env, record.card, "time", undefined, now);
      continue;
    }
    rows.push(row);
  }
  const conditions = rows.filter((row) => row.type === "condition").length;
  return { rows, truncated: listed.truncated, under_the_weather: conditions >= 3, conditions };
}

/**
 * Whether a wallet holds the season's Rail holo (the plan's 5% perk
 * rides on this). Read off the marker filePressing leaves, then
 * confirmed against the pressing itself — the window can move a card
 * out of a binder, and a marker alone would keep paying its old
 * holder. Two KV reads at most, on a path that runs per sale.
 */
export async function holdsRailHolo(env: Env, wallet: string): Promise<boolean> {
  const holder = wallet.toLowerCase();
  const cardId = await kvGet(env.COUNTERS, KV_KEYS.paywallHolo(holder));
  if (!cardId) return false;
  const record = await getCard(env, cardId);
  return record?.card.holder?.toLowerCase() === holder;
}

export { PACK_SIZE };
