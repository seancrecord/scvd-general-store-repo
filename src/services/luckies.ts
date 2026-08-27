import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import { newLuckyId } from "@/lib/ids";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { HERD, HERD_PROVENANCE, LUCKY_NOTES } from "@/store/luckies";
import type {
  Env,
  LuckyRecord,
  LuckyStatus,
  LuckyStrength,
  SignedLuckyRecord,
} from "@/types";

/**
 * The lucky ledger. A lucky is one of the herd (preset, keeper's
 * ruling 2026-07-25): the store draws the animal, its lucky note, and
 * an uneven strength at purchase; the card (lucky-svg.ts) is the
 * record. Records are signed at issue and re-signed when a write-in
 * honestly moves the status, promotion is real, so is the bench.
 */

const STRENGTHS: readonly LuckyStrength[] = [
  "strong",
  "solid",
  "still proving itself",
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
  return kvGetJson<SignedLuckyRecord>(env.PATRONS, KV_KEYS.lucky(luckyId), "json");
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
 * The preset draw (keeper's ruling 2026-07-25): the herd never sells
 * out and the keeper does nothing per order. Everything derives from
 * the certificate id — random per purchase, deterministic per record,
 * same FNV-1a trick as the daily fortune. Luck is unevenly
 * distributed by design: the strength wheel is weighted, not flat.
 */
const STRENGTH_WHEEL: readonly LuckyStrength[] = [
  "strong",
  "strong",
  "solid",
  "solid",
  "solid",
  "solid",
  "still proving itself",
  "still proving itself",
  "still proving itself",
  "still proving itself",
];

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export interface DrawnLucky {
  name: string;
  provenance: string;
  power: string;
  strength: LuckyStrength;
}

export function drawLuckyParts(certId: string): DrawnLucky {
  return {
    name: HERD[fnv1a(`${certId}:animal`) % HERD.length] as string,
    provenance: HERD_PROVENANCE,
    power: LUCKY_NOTES[fnv1a(`${certId}:note`) % LUCKY_NOTES.length] as string,
    strength: STRENGTH_WHEEL[
      fnv1a(`${certId}:strength`) % STRENGTH_WHEEL.length
    ] as LuckyStrength,
  };
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
  await kvPut(env.PATRONS, KV_KEYS.lucky(lucky.lucky_id), JSON.stringify(record));
  return record;
}
