import { newCardId, newPackId } from "@/lib/ids";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { fnv1a } from "@/services/luckies";
import {
  publishPersonalRecord,
  retainPersonalRecord,
  type PersonalPurchase,
} from "@/services/personal-goods";
import {
  cardsOfRarity,
  CURRENT_SEASON,
  PACK_SIZE,
  SLOT_WHEELS,
  type CardEntry,
  type Season,
} from "@/store/cards";
import type {
  CardRarity,
  CardRecord,
  Env,
  PackRecord,
  SignedCardRecord,
  SignedPackRecord,
} from "@/types";

/**
 * THE CARD TABLE'S LEDGER. A pack is the unit of purchase and the unit
 * of recovery: prepared once, checkpointed, published through the
 * personal-goods coordinator like a lucky, so a retry after a dropped
 * response hands back the same five cards rather than five new ones.
 * Each card is then projected to its own key so it resolves and
 * verifies alone, and a binder row per paying wallet lists the pull.
 *
 * THE DRAW (rule 22, the luckies' precedent): FNV-1a over the
 * certificate id, one hash per slot for the tier and one for the card
 * within the tier. Random per purchase, deterministic per record, and
 * recomputable by anyone holding the certificate — `drawPack` is
 * exported so a test, or a buyer, can redo it.
 */

/** Deterministic JSON so the signature always covers the same bytes. */
export function canonicalizeCard(card: CardRecord): string {
  const ordered: Record<string, string | number> = {
    card_id: card.card_id,
    season: card.season,
    card_no: card.card_no,
    name: card.name,
    rarity: card.rarity,
    kind: card.kind,
    line: card.line,
    cite: card.cite,
    slot: card.slot,
    pack_id: card.pack_id,
    date: card.date,
    cert_id: card.cert_id,
    patron_number: card.patron_number,
  };
  return JSON.stringify(ordered);
}

export function canonicalizePack(pack: PackRecord): string {
  const ordered: Record<string, string | number | string[]> = {
    pack_id: pack.pack_id,
    season: pack.season,
    card_ids: pack.card_ids,
    date: pack.date,
    cert_id: pack.cert_id,
    patron_number: pack.patron_number,
  };
  return JSON.stringify(ordered);
}

export interface DrawnSlot {
  slot: number;
  rarity: CardRarity;
  card: CardEntry;
}

/**
 * The whole pack from one certificate id. Slot wheels first (the tier),
 * then the card within the tier; both hashes salt the slot number so
 * five slots on one wheel do not land together.
 */
export function drawPack(certId: string, season: Season = CURRENT_SEASON): DrawnSlot[] {
  return SLOT_WHEELS.map((wheel, index) => {
    const slot = index + 1;
    const rarity = wheel[fnv1a(`${certId}:${season.id}:slot:${slot}:tier`) % wheel.length] as CardRarity;
    const pool = cardsOfRarity(season, rarity);
    if (pool.length === 0) {
      throw new Error(`Season ${season.id} has no ${rarity} card for slot ${slot}`);
    }
    const card = pool[fnv1a(`${certId}:${season.id}:slot:${slot}:card`) % pool.length] as CardEntry;
    return { slot, rarity, card };
  });
}

export async function signCardRecord(env: Env, card: CardRecord): Promise<SignedCardRecord> {
  const { signature, publicKey } = await signMessage(canonicalizeCard(card), env.SIGNING_KEY);
  return { card, signature, public_key: publicKey };
}

export interface OpenPackOptions {
  certId: string;
  patronNumber: number;
  /** The wallet that paid, when the certificate carries one; keys the binder. */
  payer?: string;
  season?: Season;
}

export async function openPack(
  env: Env,
  options: OpenPackOptions,
  purchase?: PersonalPurchase,
): Promise<SignedPackRecord> {
  const season = options.season ?? CURRENT_SEASON;
  const prepared = await retainPersonalRecord(purchase, async () => {
    const packId = newPackId();
    const date = purchase?.purchasedAt ?? new Date().toISOString();
    const cards: SignedCardRecord[] = [];
    for (const drawn of drawPack(options.certId, season)) {
      cards.push(
        await signCardRecord(env, {
          card_id: newCardId(),
          season: season.id,
          card_no: drawn.card.no,
          name: drawn.card.name,
          rarity: drawn.rarity,
          kind: drawn.card.kind,
          line: drawn.card.line,
          cite: drawn.card.cite,
          slot: drawn.slot,
          pack_id: packId,
          date,
          cert_id: options.certId,
          patron_number: options.patronNumber,
        }),
      );
    }
    const pack: PackRecord = {
      pack_id: packId,
      season: season.id,
      card_ids: cards.map((entry) => entry.card.card_id),
      date,
      cert_id: options.certId,
      patron_number: options.patronNumber,
    };
    const { signature, publicKey } = await signMessage(canonicalizePack(pack), env.SIGNING_KEY);
    const record: SignedPackRecord = { pack, cards, signature, public_key: publicKey };
    return { kind: "pack" as const, record };
  });
  if (prepared.kind !== "pack") throw new Error("Original pack record unavailable");
  const published = (await publishPersonalRecord(env, prepared)).record;
  // The projections: idempotent puts of the same bytes, so a retry
  // that re-reads the checkpointed pack rewrites nothing different.
  for (const signed of published.cards) {
    await kvPut(env.PATRONS, KV_KEYS.card(signed.card.card_id), JSON.stringify(signed));
    if (options.payer) {
      await kvPut(
        env.PATRONS,
        KV_KEYS.binder(options.payer.toLowerCase(), invertedTimestamp(Date.parse(published.pack.date)), signed.card.card_id),
        JSON.stringify({ card_id: signed.card.card_id, pack_id: published.pack.pack_id, name: signed.card.name, rarity: signed.card.rarity, card_no: signed.card.card_no, season: signed.card.season, date: published.pack.date }),
      );
    }
  }
  return published;
}

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

export interface BinderRow {
  card_id: string;
  pack_id: string;
  name: string;
  rarity: CardRarity;
  card_no: number;
  season: string;
  date: string;
}

export interface Binder {
  rows: BinderRow[];
  /** True when the wallet holds more than the cap and this is a floor, not the whole binder. */
  truncated: boolean;
}

/** What one wallet has pulled, newest first. Capped, and the cap is reported. */
export const BINDER_CAP = 100;

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
