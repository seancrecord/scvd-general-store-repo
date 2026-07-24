import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newLuckyId, newLuckyStockId } from "@/lib/ids";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type {
  Env,
  LuckyRecord,
  LuckyStatus,
  LuckyStrength,
  SignedLuckyRecord,
} from "@/types";

/**
 * The lucky ledger. A lucky is a small real object the keeper picks,
 * held in custody forever; its card (lucky-svg.ts) is the
 * record. Records are signed at issue and re-signed when a write-in
 * honestly moves the status, promotion is real, so is the bench.
 */

const STRENGTHS: readonly LuckyStrength[] = [
  "faint",
  "fair",
  "strong",
  "uncanny",
];

const STATUSES: readonly LuckyStatus[] = ["in_service", "promoted", "benched"];

export function parseLuckyStrength(value: unknown): LuckyStrength | null {
  return STRENGTHS.find((strength) => strength === value) ?? null;
}

export function parseLuckyStatus(value: unknown): LuckyStatus | null {
  return STATUSES.find((status) => status === value) ?? null;
}

/** Deterministic JSON so the signature always covers the same bytes. */
export function canonicalizeLucky(lucky: LuckyRecord): string {
  const ordered: Record<string, string | number> = {
    lucky_id: lucky.lucky_id,
    name: lucky.name,
    provenance: lucky.provenance,
    power: lucky.power,
    strength: lucky.strength,
    status: lucky.status,
    date: lucky.date,
    order_id: lucky.order_id,
    cert_id: lucky.cert_id,
    patron_number: lucky.patron_number,
  };
  if (lucky.status_note !== undefined) {
    ordered["status_note"] = lucky.status_note;
  }
  if (lucky.status_changed_at !== undefined) {
    ordered["status_changed_at"] = lucky.status_changed_at;
  }
  return JSON.stringify(ordered);
}

export interface CreateLuckyOptions {
  name: string;
  provenance: string;
  power: string;
  strength: LuckyStrength;
  orderId: string;
  certId: string;
  patronNumber: number;
}

export async function createLucky(
  env: Env,
  options: CreateLuckyOptions,
): Promise<SignedLuckyRecord> {
  const lucky: LuckyRecord = {
    lucky_id: newLuckyId(),
    name: options.name,
    provenance: options.provenance,
    power: options.power,
    strength: options.strength,
    status: "in_service",
    date: new Date().toISOString(),
    order_id: options.orderId,
    cert_id: options.certId,
    patron_number: options.patronNumber,
  };
  return signAndStore(env, lucky);
}

export async function getLucky(
  env: Env,
  luckyId: string,
): Promise<SignedLuckyRecord | null> {
  return env.PATRONS.get<SignedLuckyRecord>(KV_KEYS.lucky(luckyId), "json");
}

/**
 * A write-in moved the lucky. The record changes, so the signature
 * changes with it, the card re-inks accordingly, honestly.
 */
export async function setLuckyStatus(
  env: Env,
  luckyId: string,
  status: LuckyStatus,
  statusNote?: string,
): Promise<SignedLuckyRecord | null> {
  const record = await getLucky(env, luckyId);
  if (!record) {
    return null;
  }
  const lucky: LuckyRecord = {
    ...record.lucky,
    status,
    status_changed_at: new Date().toISOString(),
  };
  if (statusNote) {
    lucky.status_note = statusNote;
  } else {
    delete lucky.status_note;
  }
  return signAndStore(env, lucky);
}

export async function verifyLuckySignature(
  record: SignedLuckyRecord,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeLucky(record.lucky),
    record.signature,
    record.public_key,
  );
}

/**
 * The stocked shelf (keeper-load ruling, 2026-07-24): the keeper picks
 * objects in batches, ahead of orders — every lucky is still picked by
 * his hands, just not on the buyer's clock. Purchases take the next
 * one off the shelf and complete instantly; an empty shelf falls back
 * to the human queue and the 168h promise stands.
 */
export interface StockedLucky {
  stock_id: string;
  name: string;
  provenance: string;
  power: string;
  strength: LuckyStrength;
  stocked_at: string;
}

export async function stockLucky(
  env: Env,
  fields: Pick<StockedLucky, "name" | "provenance" | "power" | "strength">,
): Promise<StockedLucky> {
  const stocked: StockedLucky = {
    stock_id: newLuckyStockId(),
    ...fields,
    stocked_at: new Date().toISOString(),
  };
  await env.ORDERS.put(
    KV_KEYS.luckyStock(stocked.stock_id),
    JSON.stringify(stocked),
  );
  return stocked;
}

export async function listLuckyStock(env: Env): Promise<StockedLucky[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.luckyStockPrefix });
  const values = await bulkGetJson<StockedLucky>(
    env.ORDERS,
    listed.keys.map((key) => key.name),
  );
  const stock: StockedLucky[] = [];
  for (const entry of values.values()) {
    if (entry) {
      stock.push(entry);
    }
  }
  stock.sort((a, b) => a.stocked_at.localeCompare(b.stocked_at));
  return stock;
}

export async function removeLuckyStock(
  env: Env,
  stockId: string,
): Promise<void> {
  await env.ORDERS.delete(KV_KEYS.luckyStock(stockId));
}

/**
 * Oldest first, delete on take. Two same-instant buyers in different
 * colos could briefly race the same slot (same acceptable chaos as
 * the blessing jar, noted in TASKS).
 */
export async function takeStockedLucky(
  env: Env,
): Promise<StockedLucky | null> {
  const stock = await listLuckyStock(env);
  const next = stock[0];
  if (!next) {
    return null;
  }
  await removeLuckyStock(env, next.stock_id);
  return next;
}

async function signAndStore(
  env: Env,
  lucky: LuckyRecord,
): Promise<SignedLuckyRecord> {
  const { signature, publicKey } = await signMessage(
    canonicalizeLucky(lucky),
    env.SIGNING_KEY,
  );
  const record: SignedLuckyRecord = {
    lucky,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(KV_KEYS.lucky(lucky.lucky_id), JSON.stringify(record));
  return record;
}
