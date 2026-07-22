import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { Env, RetiredWordEntry } from "@/types";

/**
 * The public registry of words the keeper has retired from his
 * vocabulary. Entries are added from the back room when a retired_word
 * order is fulfilled; the registry itself is free to read forever.
 */

export interface AddRetiredWordInput {
  word: unknown;
  epitaph: unknown;
  patronNumber?: number;
}

export async function addRetiredWord(
  env: Env,
  input: AddRetiredWordInput,
): Promise<RetiredWordEntry | null> {
  const word = sanitizeText(input.word, 60);
  const epitaph = sanitizeText(input.epitaph, 300);
  if (!word || !epitaph) {
    return null;
  }
  const entry: RetiredWordEntry = {
    word,
    epitaph,
    retired_at: new Date().toISOString(),
  };
  if (input.patronNumber !== undefined && Number.isInteger(input.patronNumber)) {
    entry.patron_number = input.patronNumber;
  }
  await env.ORDERS.put(
    KV_KEYS.retiredWord(invertedTimestamp(Date.now())),
    JSON.stringify(entry),
  );
  return entry;
}

export async function listRetiredWords(
  env: Env,
): Promise<RetiredWordEntry[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.retiredWordPrefix });
  const entries: RetiredWordEntry[] = [];
  for (const key of listed.keys) {
    const entry = await env.ORDERS.get<RetiredWordEntry>(key.name, "json");
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}
