import { listKeys } from "@/lib/kv-list";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { Env } from "@/types";

/**
 * The closers list. Every coffees_for_closers win lands here so the
 * keeper's Sunday coffee has the week's list in hand — the deliverable
 * says the coffee gets drunk to the closers, and this is what makes
 * that mechanically true. Rows expire after 90 days; the certificates
 * keep the wins forever.
 */

export interface CloserEntry {
  win: string;
  patron_number: number;
  at: string;
}

const CLOSER_TTL_SECONDS = 90 * 86400;

export async function recordCloser(
  env: Env,
  win: string,
  patronNumber: number,
): Promise<void> {
  const entry: CloserEntry = {
    win,
    patron_number: patronNumber,
    at: new Date().toISOString(),
  };
  await env.ORDERS.put(
    KV_KEYS.closer(invertedTimestamp(Date.now())),
    JSON.stringify(entry),
    { expirationTtl: CLOSER_TTL_SECONDS },
  );
}

/** Newest first; the counter shows the recent list for Sunday's coffee. */
export async function listClosers(
  env: Env,
  limit = 20,
): Promise<CloserEntry[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.closerPrefix, cap: limit });
  const values = await bulkGetJson<CloserEntry>(
    env.ORDERS,
    listed.names,
  );
  const closers: CloserEntry[] = [];
  for (const entry of values.values()) {
    if (entry) {
      closers.push(entry);
    }
  }
  return closers;
}
