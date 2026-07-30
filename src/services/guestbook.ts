import { listKeys } from "@/lib/kv-list";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newEntryId } from "@/lib/ids";
import {
  GUESTBOOK_MESSAGE_CAP,
  NAME_CAP,
  sanitizeText,
} from "@/lib/sanitize";
import type { Env, GuestbookEntry } from "@/types";

/** Ceiling on a guestbook keys scan. An unnamed cap is a silent one. */
const GUESTBOOK_SCAN_CAP = 1000;

/**
 * The guestbook by the door. Free to sign; every signer gets a sticker.
 */

export interface SignResult {
  entry: GuestbookEntry;
  key: string;
}

export async function signGuestbook(
  env: Env,
  rawName: unknown,
  rawMessage: unknown,
  verifiedIdentity?: string,
): Promise<SignResult | null> {
  const name = sanitizeText(rawName, NAME_CAP);
  const message = sanitizeText(rawMessage, GUESTBOOK_MESSAGE_CAP);
  if (!name || !message) {
    return null;
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
  const key = KV_KEYS.guestbookEntry(invertedTimestamp(Date.now()), entry.id);
  await env.GUESTBOOK.put(key, JSON.stringify(entry));
  return { entry, key };
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
