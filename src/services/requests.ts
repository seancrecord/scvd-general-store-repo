import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson, bulkGetText } from "@/lib/kv-bulk";
import { newRequestId } from "@/lib/ids";
import { sanitizeText } from "@/lib/sanitize";
import type { CommissionRequest, Env, WaitlistEntry } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/** Ceiling on a failed-item counters scan. An unnamed cap is a silent one. */
const FAILED_ITEM_CAP = 1000;

/** Ceiling on a requests scan. Named because an unnamed cap is a silent one. */
const REQUEST_CAP = 500;
/** Ceiling on a waitlist entries scan. Named because an unnamed cap is a silent one. */
const WAITLIST_CAP = 500;

/**
 * The request ledger: open commissions, waitlists, and the failed-item
 * tally (every 404'd /api/buy/:unknown is free market research).
 */

export interface CommissionInput {
  description: unknown;
  offer: unknown;
  contact: unknown;
  verifiedIdentity: string | undefined;
  suggestListing: unknown;
}

export async function recordCommission(
  env: Env,
  input: CommissionInput,
): Promise<CommissionRequest | null> {
  const suggestListing = sanitizeText(input.suggestListing, 300);
  const description =
    sanitizeText(input.description, 1000) ||
    (suggestListing ? "Directory listing suggestion" : "");
  const contact =
    sanitizeText(input.contact, 200) ||
    (suggestListing ? "none given" : "");
  const offer =
    typeof input.offer === "number" &&
    Number.isFinite(input.offer) &&
    input.offer >= 0
      ? input.offer
      : suggestListing
        ? 0
        : Number.NaN;
  if (!description || !contact || Number.isNaN(offer)) {
    return null;
  }
  const request: CommissionRequest = {
    id: newRequestId(),
    description,
    offer_usdc: offer,
    contact,
    date: new Date().toISOString(),
  };
  if (input.verifiedIdentity) {
    // Stored as claimed; nobody here has checked it. Honest labeling.
    request.verified_identity = input.verifiedIdentity;
    request.identity_verified = false;
  }
  if (suggestListing) {
    request.suggest_listing = suggestListing;
  }
  await kvPut(env.ORDERS, 
    KV_KEYS.commissionRequest(request.id),
    JSON.stringify(request),
  );
  return request;
}

export async function listCommissions(env: Env): Promise<CommissionRequest[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.requestPrefix, cap: REQUEST_CAP });
  const values = await bulkGetJson<CommissionRequest>(
    env.ORDERS,
    listed.names,
  );
  const requests: CommissionRequest[] = [];
  for (const request of values.values()) {
    if (request) {
      requests.push(request);
    }
  }
  requests.sort((a, b) => b.date.localeCompare(a.date));
  return requests;
}

export async function joinWaitlist(
  env: Env,
  itemId: string,
  rawAgentName: unknown,
  callbackUrl: string | undefined,
): Promise<WaitlistEntry> {
  const entry: WaitlistEntry = {
    item_id: itemId,
    date: new Date().toISOString(),
  };
  const agentName = sanitizeText(rawAgentName, 80);
  if (agentName) {
    entry.agent_name = agentName;
  }
  if (callbackUrl) {
    entry.callback_url = callbackUrl;
  }
  await kvPut(env.ORDERS, 
    KV_KEYS.waitlist(itemId, Date.now()),
    JSON.stringify(entry),
  );
  return entry;
}

export async function listWaitlist(env: Env): Promise<WaitlistEntry[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.waitlistPrefix(), cap: WAITLIST_CAP });
  const values = await bulkGetJson<WaitlistEntry>(
    env.ORDERS,
    listed.names,
  );
  const entries: WaitlistEntry[] = [];
  for (const entry of values.values()) {
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Tally a request for something we don't stock. The keeper reads these. */
export async function recordFailedItem(
  env: Env,
  itemId: string,
): Promise<void> {
  const clean = sanitizeText(itemId, 80);
  if (!clean) {
    return;
  }
  const key = KV_KEYS.failedItem(clean);
  const count = await kvGet(env.COUNTERS, key);
  await kvPut(env.COUNTERS, key, String((count ? parseInt(count, 10) : 0) + 1));
}

export async function listFailedItems(
  env: Env,
): Promise<Record<string, number>> {
  const listed = await listKeys(env.COUNTERS, { prefix: KV_KEYS.failedItemPrefix, cap: FAILED_ITEM_CAP });
  const values = await bulkGetText(
    env.COUNTERS,
    listed.names,
  );
  const tally: Record<string, number> = {};
  for (const name of listed.names) {
    const count = values.get(name);
    tally[name.slice(KV_KEYS.failedItemPrefix.length)] = count
      ? parseInt(count, 10)
      : 0;
  }
  return tally;
}
