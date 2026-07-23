import { newTipId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import type { Env, TipRecord, TipStatus } from "@/types";

/**
 * The Trading Post tip jar. Tips land in the keeper's review queue and
 * are NEVER auto-published, a human reads every one before it can
 * appear in a Gazette issue.
 */

export const TIP_CAP = 1000;

export interface RecordTipInput {
  tip: unknown;
  contributorName: unknown;
  verifiedIdentity: string | undefined;
}

export interface StoredTip {
  record: TipRecord;
  kvKey: string;
}

export async function recordTip(
  env: Env,
  input: RecordTipInput,
): Promise<StoredTip | null> {
  const tip = sanitizeText(input.tip, TIP_CAP);
  if (!tip) {
    return null;
  }
  const record: TipRecord = {
    id: newTipId(),
    tip,
    status: "pending_review",
    date: new Date().toISOString(),
  };
  const contributorName = sanitizeText(input.contributorName, 80);
  if (contributorName) {
    record.contributor_name = contributorName;
  }
  if (input.verifiedIdentity) {
    record.verified_identity = input.verifiedIdentity;
    record.identity_verified = false;
  }
  const kvKey = KV_KEYS.tip(invertedTimestamp(Date.now()), record.id);
  await env.ORDERS.put(kvKey, JSON.stringify(record));
  return { record, kvKey };
}

export async function listTips(env: Env): Promise<StoredTip[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.tipPrefix });
  const values = await bulkGetJson<TipRecord>(
    env.ORDERS,
    listed.keys.map((key) => key.name),
  );
  const tips: StoredTip[] = [];
  for (const key of listed.keys) {
    const record = values.get(key.name);
    if (record) {
      tips.push({ record, kvKey: key.name });
    }
  }
  return tips;
}

export async function findTip(
  env: Env,
  tipId: string,
): Promise<StoredTip | null> {
  const tips = await listTips(env);
  return tips.find((tip) => tip.record.id === tipId) ?? null;
}

export async function setTipStatus(
  env: Env,
  tipId: string,
  status: TipStatus,
): Promise<TipRecord | null> {
  const stored = await findTip(env, tipId);
  if (!stored) {
    return null;
  }
  stored.record.status = status;
  await env.ORDERS.put(stored.kvKey, JSON.stringify(stored.record));
  return stored.record;
}
