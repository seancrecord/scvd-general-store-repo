import { KV_KEYS } from "@/lib/kv-keys";
import { newRequestId } from "@/lib/ids";
import { sanitizeText } from "@/lib/sanitize";
import type { CommissionRequest, Env, WaitlistEntry } from "@/types";

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
  await env.ORDERS.put(
    KV_KEYS.commissionRequest(request.id),
    JSON.stringify(request),
  );
  return request;
}

export async function listCommissions(env: Env): Promise<CommissionRequest[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.requestPrefix });
  const requests: CommissionRequest[] = [];
  for (const key of listed.keys) {
    const request = await env.ORDERS.get<CommissionRequest>(key.name, "json");
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
  await env.ORDERS.put(
    KV_KEYS.waitlist(itemId, Date.now()),
    JSON.stringify(entry),
  );
  return entry;
}

export async function listWaitlist(env: Env): Promise<WaitlistEntry[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.waitlistPrefix() });
  const entries: WaitlistEntry[] = [];
  for (const key of listed.keys) {
    const entry = await env.ORDERS.get<WaitlistEntry>(key.name, "json");
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
  const count = await env.COUNTERS.get(key);
  await env.COUNTERS.put(key, String((count ? parseInt(count, 10) : 0) + 1));
}

export async function listFailedItems(
  env: Env,
): Promise<Record<string, number>> {
  const listed = await env.COUNTERS.list({
    prefix: KV_KEYS.failedItemPrefix,
  });
  const tally: Record<string, number> = {};
  for (const key of listed.keys) {
    const count = await env.COUNTERS.get(key.name);
    tally[key.name.slice(KV_KEYS.failedItemPrefix.length)] = count
      ? parseInt(count, 10)
      : 0;
  }
  return tally;
}
