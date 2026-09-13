import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import { signMessage } from "@/lib/signing";
import type { Env, SeedRecord } from "@/types";

/**
 * THE DAY SEED — commit at midnight, reveal the morning after
 * (handoff v2 §4).
 *
 * HOW THE SEED IS MADE. Not drawn at random and stored — derived:
 *   seed_d = HMAC-SHA256(K, "paywall:seed:" + date)
 * where K is the store's signing secret run through a domain-
 * separated HMAC once, so the signing key is never used raw for
 * anything but signing. Deriving rather than storing means there is
 * no midnight race, no cron the pulls wait on, and no way for the
 * store to pick a friendlier seed after seeing the day's pulls: the
 * seed for a date was fixed the day the key was.
 *
 * WHAT IS PUBLISHED. `commit_d = sha256(seed_d)` from the moment the
 * day starts (the half-hourly cron writes the signed record, and a
 * first pull on a day the cron has not reached writes it too), and
 * `seed_d` itself once the UTC day has ended. Both signed. Anyone
 * can recompute every pull of the day from the revealed seed and the
 * public inputs on the pack record.
 */

const enc = new TextEncoder();

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** The seed for a UTC date, as bytes. Never leaves this module before the date has ended. */
export async function seedFor(env: Env, date: string): Promise<Uint8Array> {
  // Domain-separated: the signing secret is only ever an HMAC key here, never a signing key.
  const master = await hmac(enc.encode(env.SIGNING_KEY), "paywall:master");
  return hmac(master, `paywall:seed:${date}`);
}

export async function commitOf(seed: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", seed as BufferSource));
}

export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True once the whole UTC day is behind us. */
export function dayHasEnded(date: string, now: Date = new Date()): boolean {
  return date < utcDate(now);
}

export interface SignedSeedRecord {
  record: SeedRecord;
  signature: string;
  public_key: string;
}

export function canonicalizeSeed(record: SeedRecord): string {
  const ordered: Record<string, string> = { date: record.date, commit: record.commit, published_at: record.published_at };
  if (record.seed !== undefined) ordered["seed"] = record.seed;
  return JSON.stringify(ordered);
}

/**
 * The day's public record. Writes the commit the first time a day is
 * asked about, and adds the seed the first time a finished day is
 * asked about — so the KV row is the dated evidence of when each
 * half was published, and a re-read returns the same bytes.
 */
export async function publishSeedRecord(env: Env, date: string, now: Date = new Date()): Promise<SignedSeedRecord> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > utcDate(now)) {
    throw new Error("A seed record exists for today and every day before it, not for a day that has not started.");
  }
  const existing = await kvGetJson<SignedSeedRecord>(env.PATRONS, KV_KEYS.paywallSeed(date), "json");
  const seed = await seedFor(env, date);
  const commit = await commitOf(seed);
  const ended = dayHasEnded(date, now);
  if (existing && (existing.record.seed !== undefined || !ended)) {
    return existing;
  }
  const record: SeedRecord = {
    date,
    commit,
    published_at: existing?.record.published_at ?? now.toISOString(),
    ...(ended ? { seed: hex(seed) } : {}),
  };
  const { signature, publicKey } = await signMessage(canonicalizeSeed(record), env.SIGNING_KEY);
  const signed: SignedSeedRecord = { record, signature, public_key: publicKey };
  await kvPut(env.PATRONS, KV_KEYS.paywallSeed(date), JSON.stringify(signed));
  return signed;
}

/**
 * THE DRAW. HMAC-SHA256(seed_d, payer || cert_id || slot) — with a salt
 * for the bell and the window so a bell pull on the same certificate
 * never collides with a pack slot. The first four bytes map to [0, 1)
 * for the wheel; the next four pick the card within the tier.
 */
export async function drawBytes(seed: Uint8Array, payer: string, certId: string, slot: number | string, salt = ""): Promise<Uint8Array> {
  return hmac(seed, `${payer}||${certId}||${slot}${salt ? `||${salt}` : ""}`);
}

export function unitFromBytes(bytes: Uint8Array, offset: number): number {
  const value = ((bytes[offset]! << 24) >>> 0) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
  return value / 0x1_0000_0000;
}

export function indexFromBytes(bytes: Uint8Array, offset: number, size: number): number {
  const value = ((bytes[offset]! << 24) >>> 0) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
  return value % size;
}

export { hex as bytesToHex };
