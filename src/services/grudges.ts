import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { createRefund } from "@/services/refunds";
import type { Env } from "@/types";

/**
 * The grudge register: the register IS the holding. Written at
 * purchase, permanent, private to the certificate holder, read by the
 * keeper on Sundays. Abuse gets refused: the entry flips to refused
 * and a refund lands on the ledger for the keeper's Sunday payouts.
 */

export type GrudgeStatus = "held" | "released" | "refused";

export interface GrudgeEntry {
  key: string;
  grievance: string;
  patron_number: number;
  cert_id: string;
  paid_usdc: number;
  at: string;
  status: GrudgeStatus;
}

export async function recordGrudge(
  env: Env,
  fields: Omit<GrudgeEntry, "key" | "at" | "status">,
): Promise<GrudgeEntry> {
  const key = KV_KEYS.grudgeEntry(invertedTimestamp(Date.now()));
  const entry: GrudgeEntry = {
    ...fields,
    key,
    at: new Date().toISOString(),
    status: "held",
  };
  await env.ORDERS.put(key, JSON.stringify(entry));
  return entry;
}

export async function listGrudges(
  env: Env,
  limit = 30,
): Promise<GrudgeEntry[]> {
  const listed = await env.ORDERS.list({
    prefix: KV_KEYS.grudgePrefix,
    limit,
  });
  const values = await bulkGetJson<GrudgeEntry>(
    env.ORDERS,
    listed.keys.map((key) => key.name),
  );
  const grudges: GrudgeEntry[] = [];
  for (const [key, entry] of values.entries()) {
    if (entry) {
      grudges.push({ ...entry, key });
    }
  }
  return grudges;
}

async function setGrudgeStatus(
  env: Env,
  key: string,
  status: GrudgeStatus,
): Promise<GrudgeEntry | null> {
  const entry = await env.ORDERS.get<GrudgeEntry>(key, "json");
  if (!entry) {
    return null;
  }
  const updated: GrudgeEntry = { ...entry, key, status };
  await env.ORDERS.put(key, JSON.stringify(updated));
  return updated;
}

/** The buyer wrote in to let it go. */
export async function releaseGrudge(
  env: Env,
  key: string,
): Promise<GrudgeEntry | null> {
  return setGrudgeStatus(env, key, "released");
}

/** Abuse: refused and refunded, honestly and unmanned thereafter. */
export async function refuseGrudge(
  env: Env,
  key: string,
): Promise<GrudgeEntry | null> {
  const entry = await setGrudgeStatus(env, key, "refused");
  if (entry) {
    await createRefund(env, {
      item: "grudge",
      amountUsdc: entry.paid_usdc,
    });
  }
  return entry;
}
