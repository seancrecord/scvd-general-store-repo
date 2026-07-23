import { newConfessionId } from "@/lib/ids";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { ConfessionRecord, ConfessionStatus, Env } from "@/types";

/**
 * The confession drawer. Anonymized by construction, the record
 * holds no wallet and no name unless sign_as was given. The keeper
 * approves before ANY Gazette appearance; never auto-published;
 * printing happens at edition publish, one per edition at most.
 * The store absolves phantom successes, dropped contexts, and lies
 * told to operators. It does not judge.
 */

export const CONFESSION_CAP = 500;

export interface HeardConfession {
  record: ConfessionRecord;
}

export async function hearConfession(
  env: Env,
  confessionText: string,
  signAs?: string,
): Promise<HeardConfession> {
  const record: ConfessionRecord = {
    id: newConfessionId(),
    confession: confessionText.slice(0, CONFESSION_CAP),
    status: "pending_review",
    date: new Date().toISOString(),
  };
  const name = sanitizeText(signAs, 80);
  if (name && name.toLowerCase() !== "anonymous") {
    record.sign_as = name;
  }
  await env.ORDERS.put(
    KV_KEYS.confession(invertedTimestamp(Date.now()), record.id),
    JSON.stringify(record),
  );
  return { record };
}

export interface QueuedConfession {
  record: ConfessionRecord;
  kvKey: string;
}

export async function listConfessions(env: Env): Promise<QueuedConfession[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.confessionPrefix });
  const confessions: QueuedConfession[] = [];
  for (const key of listed.keys) {
    const record = await env.ORDERS.get<ConfessionRecord>(key.name, "json");
    if (record) {
      confessions.push({ record, kvKey: key.name });
    }
  }
  return confessions;
}

export async function setConfessionStatus(
  env: Env,
  confessionId: string,
  status: ConfessionStatus,
): Promise<ConfessionRecord | null> {
  const confessions = await listConfessions(env);
  const found = confessions.find((entry) => entry.record.id === confessionId);
  if (!found) {
    return null;
  }
  found.record.status = status;
  await env.ORDERS.put(found.kvKey, JSON.stringify(found.record));
  return found.record;
}

/** The oldest approved, unprinted confession, the Gazette's candidate. */
export async function nextApprovedConfession(
  env: Env,
): Promise<ConfessionRecord | null> {
  const confessions = await listConfessions(env);
  const approved = confessions
    .filter((entry) => entry.record.status === "approved")
    .sort((a, b) => a.record.date.localeCompare(b.record.date));
  return approved[0]?.record ?? null;
}
