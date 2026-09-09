import { CLOSER_TTL_SECONDS, retainPersonalRecord, publishPersonalRecord, type PersonalPurchase } from "@/services/personal-goods";
import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
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
  id?: string;
  win: string;
  patron_number: number;
  at: string;
}

export async function recordCloser(
  env: Env,
  win: string,
  patronNumber: number,
  purchase?: PersonalPurchase & { certId?: string },
): Promise<void> {
  const prepared = await retainPersonalRecord(purchase, () => ({ kind: "closer" as const, record: {
    id: purchase?.certId ?? crypto.randomUUID(), win, patron_number: patronNumber,
    at: purchase?.purchasedAt ?? new Date().toISOString(),
  } }));
  if (prepared.kind !== "closer") throw new Error("Original closer record unavailable");
  await publishPersonalRecord(env, prepared);
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
    if (entry && Date.now() - Date.parse(entry.at) < CLOSER_TTL_SECONDS * 1000) {
      closers.push(entry);
    }
  }
  return closers;
}
