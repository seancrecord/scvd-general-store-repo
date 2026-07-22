import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import {
  GUESTBOOK_MESSAGE_CAP,
  NAME_CAP,
  sanitizeText,
} from "@/lib/sanitize";
import type { Env, GuestbookEntry } from "@/types";

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
  const listed = await env.GUESTBOOK.list({
    prefix: KV_KEYS.guestbookPrefix,
    limit,
  });
  const entries: ListedEntry[] = [];
  for (const key of listed.keys) {
    const entry = await env.GUESTBOOK.get<GuestbookEntry>(key.name, "json");
    if (entry) {
      entries.push({ ...entry, kv_key: key.name });
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
