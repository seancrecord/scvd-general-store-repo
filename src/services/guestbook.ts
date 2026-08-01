import { listKeys } from "@/lib/kv-list";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newEntryId } from "@/lib/ids";
import {
  GUESTBOOK_MESSAGE_CAP,
  NAME_CAP,
  sanitizeText,
} from "@/lib/sanitize";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env, GuestbookEntry } from "@/types";

/** Ceiling on a guestbook keys scan. An unnamed cap is a silent one. */
const GUESTBOOK_SCAN_CAP = 1000;

/**
 * The guestbook by the door. Free to sign; every signer gets a sticker.
 *
 * THE IDENTITY SIGNING PATH, the honest fix for a boolean that could
 * never be true. identity_verified was always false because nothing
 * ever checked anything — a URL is a claim, and we said so. Now a
 * visitor MAY sign their own entry with their own ed25519 key, and the
 * boolean flips true meaning exactly one narrow thing: this content
 * was signed by this key, so the same key on later entries is the
 * same signer. It never means a real-world person was confirmed, and
 * everyone who doesn't opt in stays honestly false, same as before.
 * Reuses the same verify machinery certificates already stand on.
 */

/** What a signing visitor signs: UTF-8 of this exact string, over the
 * STORED (sanitized) values — sign what the wall will hold, not what
 * you sent. Domain-prefixed so a guestbook signature can never be
 * replayed as a signature over anything else. */
export function guestbookSigningPayload(
  name: string,
  message: string,
): string {
  return `scvd-guestbook-v1\n${name}\n${message}`;
}

const HEX_64 = /^[0-9a-f]{64}$/i;
const HEX_128 = /^[0-9a-f]{128}$/i;

export interface SignResult {
  entry: GuestbookEntry;
  key: string;
}

export type SignOutcome =
  | { ok: true; result: SignResult }
  | { ok: false; reason: "missing_fields" | "identity_signature_invalid" };

export interface IdentityProof {
  publicKeyHex: string;
  signatureHex: string;
}

export async function signGuestbook(
  env: Env,
  rawName: unknown,
  rawMessage: unknown,
  verifiedIdentity?: string,
  identity?: IdentityProof,
): Promise<SignOutcome> {
  const name = sanitizeText(rawName, NAME_CAP);
  const message = sanitizeText(rawMessage, GUESTBOOK_MESSAGE_CAP);
  if (!name || !message) {
    return { ok: false, reason: "missing_fields" };
  }
  const entry: GuestbookEntry = {
    id: newEntryId(),
    name,
    message,
    date: new Date().toISOString(),
  };
  if (verifiedIdentity) {
    // Stored as claimed; nobody here has checked it. Honest labeling.
    entry.verified_identity = verifiedIdentity;
    entry.identity_verified = false;
  }
  if (identity) {
    // Fail closed on claims: a signature that doesn't verify is
    // refused outright, never stored as a quiet downgrade to false.
    const valid =
      HEX_64.test(identity.publicKeyHex) &&
      HEX_128.test(identity.signatureHex) &&
      (await verifyMessageSignature(
        guestbookSigningPayload(name, message),
        identity.signatureHex,
        identity.publicKeyHex,
      ));
    if (!valid) {
      return { ok: false, reason: "identity_signature_invalid" };
    }
    entry.identity_public_key = identity.publicKeyHex.toLowerCase();
    entry.identity_verified = true;
  }
  const key = KV_KEYS.guestbookEntry(invertedTimestamp(Date.now()), entry.id);
  await env.GUESTBOOK.put(key, JSON.stringify(entry));
  return { ok: true, result: { entry, key } };
}

export interface ListedEntry extends GuestbookEntry {
  kv_key: string;
}

export async function listGuestbook(
  env: Env,
  limit: number,
): Promise<ListedEntry[]> {
  const listed = await listKeys(env.GUESTBOOK, { prefix: KV_KEYS.guestbookPrefix, cap: limit });
  const values = await bulkGetJson<GuestbookEntry>(
    env.GUESTBOOK,
    listed.names,
  );
  const entries: ListedEntry[] = [];
  for (const name of listed.names) {
    const entry = values.get(name);
    if (entry) {
      entries.push({ ...entry, kv_key: name });
    }
  }
  return entries;
}

export async function deleteGuestbookEntry(
  env: Env,
  kvKey: string,
): Promise<void> {
  if (kvKey.startsWith(KV_KEYS.guestbookPrefix)) {
    await env.GUESTBOOK.delete(kvKey);
  }
}
