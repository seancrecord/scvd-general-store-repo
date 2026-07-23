import { KV_KEYS } from "@/lib/kv-keys";
import { newLuckyId } from "@/lib/ids";
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
 * held in custody with the rocks; its card (lucky-svg.ts) is the
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
