import { jcsCanonicalize } from "@/lib/jcs";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { ArtifactCheckpoint } from "@/lib/artifact-checkpoint";
import type { CloserEntry } from "@/services/closers";
import type { ConfessionRecord, ConfessionStatus, Env, LuckyStatus, SignedCardRecord, SignedLuckyRecord, SignedPackRecord, TrainTagRecord, TrainTagStatus } from "@/types";

export const CLOSER_TTL_SECONDS = 90 * 86400;
export type PersonalRecord =
  | { kind: "confession"; record: ConfessionRecord; storageKey?: string }
  | { kind: "closer"; record: CloserEntry & { id: string } }
  | { kind: "tag"; record: TrainTagRecord; storageKey?: string }
  | { kind: "lucky"; record: SignedLuckyRecord }
  // The card table (2026-09-12): a pack is immutable once signed; no mutation kind exists for it.
  | { kind: "pack"; record: SignedPackRecord }
  // A single pressing that rode another purchase (earned) or the window.
  | { kind: "pressing"; record: SignedCardRecord };
export type PersonalMutation =
  | { kind: "confession"; status: ConfessionStatus }
  | { kind: "tag"; status: TrainTagStatus; at: string }
  | { kind: "lucky"; status: LuckyStatus; at: string; note?: string };
export interface PersonalPurchase { checkpoint?: ArtifactCheckpoint; purchasedAt?: string }

export async function retainPersonalRecord<T extends PersonalRecord>(purchase: PersonalPurchase | undefined, prepare: () => Promise<T> | T): Promise<T> {
  const saved = await purchase?.checkpoint?.read<T>("personal_record");
  if (saved) return saved;
  const value = await prepare();
  return purchase?.checkpoint ? purchase.checkpoint.save("personal_record", value) : value;
}
export function personalKey(value: PersonalRecord): string {
  // Older writers read the clock once for the record and again for its key.
  // Keep the actual key when adopting a legacy row; recomputing it can fork it.
  if ((value.kind === "confession" || value.kind === "tag") && value.storageKey) {
    const prefix = value.kind === "confession" ? KV_KEYS.confessionPrefix : KV_KEYS.trainTagPrefix;
    const tail = value.storageKey.slice(prefix.length);
    const [timestamp, id] = tail.split(":");
    if (!value.storageKey.startsWith(prefix) || !/^\d{13,14}$/.test(timestamp ?? "") || id !== value.record.id || tail !== `${timestamp}:${id}`) {
      throw new Error("Personal good storage key mismatch");
    }
    return value.storageKey;
  }
  switch (value.kind) {
    case "confession": return KV_KEYS.confession(invertedTimestamp(Date.parse(value.record.date)), value.record.id);
    case "tag": return KV_KEYS.trainTag(String(Date.parse(value.record.date)).padStart(14, "0"), value.record.id);
    case "lucky": return KV_KEYS.lucky(value.record.lucky.lucky_id);
    case "pack": return KV_KEYS.pack(value.record.pack.pack_id);
    case "pressing": return KV_KEYS.card(value.record.card.card_id);
    case "closer": return KV_KEYS.closer(invertedTimestamp(Date.parse(value.record.at)), value.record.id);
  }
}
function immutable(value: PersonalRecord): string {
  const record = value.kind === "lucky" ? value.record.lucky : value.kind === "pack" ? value.record.pack : value.kind === "pressing" ? value.record.card : value.record;
  return jcsCanonicalize(Object.fromEntries(Object.entries(record).filter(([key]) =>
    !["status", "status_note", "status_changed_at", "displayed_at"].includes(key))));
}
export function personalCoordinator(env: Env, value: PersonalRecord) {
  if (!env.PAID_RECOVERIES) throw new Error("Personal goods coordinator unavailable");
  return env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`personal:${personalKey(value)}`));
}
export async function publishPersonalRecord<T extends PersonalRecord>(env: Env, value: T): Promise<T> {
  const saved = await personalCoordinator(env, value).publishPersonalRecord(value);
  if (saved.kind !== value.kind) throw new Error("Personal good kind mismatch");
  // The coordinator validates the immutable fields before retaining this variant.
  return saved as T;
}
export async function mutatePersonalRecord<T extends PersonalRecord>(env: Env, value: T, mutation: PersonalMutation): Promise<T> {
  const saved = await personalCoordinator(env, value).publishPersonalRecord(value, mutation);
  if (saved.kind !== value.kind) throw new Error("Personal good kind mismatch");
  return saved as T;
}

/** One instance per purchased record. Both recovery and the keeper's later
 * decisions pass through the same durable journal. KV is only its projection.
 */
export class PersonalGoodsStore {
  private publication: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async publish(proposal: PersonalRecord, mutation?: PersonalMutation): Promise<PersonalRecord> {
    const work = this.publication.then(async () => {
      const key = personalKey(proposal);
      const namespace = proposal.kind === "lucky" || proposal.kind === "pack" || proposal.kind === "pressing" ? this.env.PATRONS : this.env.ORDERS;
      const durable = await this.storage.get<PersonalRecord>("personal");
      const seed = durable ? null : await kvGetJson<PersonalRecord["record"]>(namespace, key, "json");
      const selected = await this.storage.transaction(async txn => {
        const current = await txn.get<PersonalRecord>("personal") ?? (seed ? { ...proposal, record: seed } as PersonalRecord : proposal);
        if (current.kind !== proposal.kind || personalKey(current) !== key || immutable(current) !== immutable(proposal)) {
          throw new Error("Personal good purchase mismatch");
        }
        let value = current;
        if (mutation) {
          if (mutation.kind === "confession" && current.kind === "confession") {
            value = { ...current, record: { ...current.record, status: mutation.status } };
          } else if (mutation.kind === "tag" && current.kind === "tag") {
            // Approval stamps once; a later takedown or retry cannot reset it.
            value = { ...current, record: { ...current.record, status: mutation.status,
              ...(mutation.status === "approved" && !current.record.displayed_at ? { displayed_at: mutation.at } : {}) } };
          } else if (mutation.kind === "lucky" && current.kind === "lucky") {
            const lucky = { ...current.record.lucky, status: mutation.status, status_changed_at: mutation.at };
            if (mutation.note) lucky.status_note = mutation.note;
            else delete lucky.status_note;
            const { signLuckyRecord } = await import("@/services/luckies");
            value = { kind: "lucky", record: await signLuckyRecord(this.env, lucky) };
          } else throw new Error("Personal good mutation mismatch");
        }
        await txn.put("personal", value);
        return value;
      });
      if (selected.kind === "closer") {
        const remaining = Math.ceil((Date.parse(selected.record.at) + CLOSER_TTL_SECONDS * 1000 - Date.now()) / 1000);
        if (remaining > 0) await kvPut(namespace, key, JSON.stringify(selected.record), { expirationTtl: Math.max(60, remaining) });
      } else await kvPut(namespace, key, JSON.stringify(selected.record));
      return selected;
    });
    this.publication = work.then(() => undefined, () => undefined);
    return await work;
  }
}
