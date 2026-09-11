import { clipCodePoints } from "@/lib/unicode";
import { retainPersonalRecord, publishPersonalRecord, mutatePersonalRecord, type PersonalPurchase } from "@/services/personal-goods";
import { listKeys } from "@/lib/kv-list";
import { newConfessionId } from "@/lib/ids";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { NAME_CAP } from "@/lib/sanitize";
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
  purchase?: PersonalPurchase,
): Promise<HeardConfession> {
  const prepared = await retainPersonalRecord(purchase, () => {
    const record: ConfessionRecord = {
      id: newConfessionId(),
      confession: clipCodePoints(confessionText, CONFESSION_CAP),
      status: "pending_review",
      date: purchase?.purchasedAt ?? new Date().toISOString(),
    };
    const name = clipCodePoints(signAs ?? "", NAME_CAP);
    if (name && name.toLowerCase() !== "anonymous") {
      record.sign_as = name;
    }
    return { kind: "confession" as const, record };
  });
  if (prepared.kind !== "confession") throw new Error("Original confession record unavailable");
  const { record } = await publishPersonalRecord(env, prepared);
  return { record };
}

export interface QueuedConfession {
  record: ConfessionRecord;
  kvKey: string;
}

export async function listConfessions(env: Env): Promise<QueuedConfession[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.confessionPrefix, cap: CONFESSION_CAP });
  const values = await bulkGetJson<ConfessionRecord>(
    env.ORDERS,
    listed.names,
  );
  const confessions: QueuedConfession[] = [];
  for (const name of listed.names) {
    const record = values.get(name);
    if (record) {
      confessions.push({ record, kvKey: name });
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
  const saved = await mutatePersonalRecord(env, { kind: "confession", record: found.record, storageKey: found.kvKey }, { kind: "confession", status });
  return saved.record;
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
