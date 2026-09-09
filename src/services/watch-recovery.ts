import { jcsCanonicalize } from "@/lib/jcs";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { ArtifactCheckpoint } from "@/lib/artifact-checkpoint";
import type { StandingWatchRecord, WatchProbe } from "@/services/standing-watch";
import type { ConformanceWatchRecord, ConformancePass } from "@/services/conformance-watch";
import type { Env } from "@/types";
import { signMessage } from "@/lib/signing";
import { purchaseRecoveryAlarmAt } from "@/lib/purchase-recovery-clock";

export const WATCH_SPACING_MS = { standing: 55 * 60_000, conformance: 23 * 3600_000 } as const;
export interface WatchCommission {
  signed_payload: string;
  signature: string;
  public_key: string;
  signature_covers: string;
}

export type RecoverableWatch =
  | { kind: "standing"; record: StandingWatchRecord }
  | { kind: "conformance"; record: ConformanceWatchRecord };
export interface WatchPurchase { checkpoint?: ArtifactCheckpoint; purchasedAt?: string; certId?: string }
interface WatchJournal { value: RecoverableWatch; count: number }
type WatchStorage = Pick<DurableObjectStorage, "get" | "list">;
const entryKey = (index: number) => `watch:entry:${String(index).padStart(9, "0")}`;
async function readEntries<T>(storage: WatchStorage, count: number): Promise<T[]> {
  if (count === 0) return [];
  // The manifest is written atomically with these rows. Fetch one extra so a
  // corrupt count cannot silently publish an incomplete history.
  const rows = await storage.list<T>({ prefix: "watch:entry:", limit: count + 1 });
  if (rows.size !== count) throw new Error("Watch journal incomplete");
  return Array.from({ length: count }, (_, index) => {
    const row = rows.get(entryKey(index));
    if (!row) throw new Error("Watch journal entry missing");
    return row;
  });
}
async function readWatch(storage: WatchStorage): Promise<RecoverableWatch | null> {
  const saved = await storage.get<WatchJournal>("watch");
  if (!saved) return null;
  if (saved.value.kind === "standing") return { kind: "standing", record: {
    ...saved.value.record, probes: await readEntries<WatchProbe>(storage, saved.count),
  } };
  return { kind: "conformance", record: {
    ...saved.value.record, passes: await readEntries<ConformancePass>(storage, saved.count),
  } };
}
const entriesOf = (value: RecoverableWatch) => value.kind === "standing" ? value.record.probes : value.record.passes;
function withoutEntries(value: RecoverableWatch): RecoverableWatch {
  return value.kind === "standing" ? { kind: "standing", record: { ...value.record, probes: [] } }
    : { kind: "conformance", record: { ...value.record, passes: [] } };
}

export async function retainWatch<T extends RecoverableWatch>(purchase: WatchPurchase | undefined, prepare: () => Promise<T>): Promise<T> {
  const saved = await purchase?.checkpoint?.read<T>("watch_record");
  if (saved) return saved;
  const value = await prepare();
  return purchase?.checkpoint ? purchase.checkpoint.save("watch_record", value) : value;
}
export async function signWatchCommission(env: Env, kind: RecoverableWatch["kind"], record: RecoverableWatch["record"], certId?: string): Promise<WatchCommission | undefined> {
  if (!certId) return undefined; // Existing direct-service callers and legacy rows carry no purchase certificate.
  const signed_payload = jcsCanonicalize({ type: "scvd.watch-commission.v1", cert_id: certId,
    item_id: kind === "standing" ? "standing_watch" : "conformance_watch", watch_id: record.watch_id,
    url: record.url, started_at: record.started_at, ends_at: record.ends_at,
    interval_hours: kind === "standing" ? 1 : 24 });
  const signed = await signMessage(signed_payload, env.SIGNING_KEY);
  return { signed_payload, signature: signed.signature,
    public_key: signed.publicKey, signature_covers: "UTF-8 bytes of signed_payload, RFC 8785 canonical JSON. The commission binds this watch to its purchase certificate; observations are signed separately." };
}
function watchKey(value: RecoverableWatch): string {
  return value.kind === "standing" ? KV_KEYS.standingWatch(value.record.watch_id) : KV_KEYS.conformanceWatch(value.record.watch_id);
}
function commission(value: RecoverableWatch): string {
  return jcsCanonicalize(Object.fromEntries(Object.entries(value.record).filter(([key]) => key !== "probes" && key !== "passes")));
}
export async function publishWatch<T extends RecoverableWatch>(env: Env, value: T): Promise<T> {
  if (!env.PAID_RECOVERIES) throw new Error("Watch coordinator unavailable");
  const saved = await env.PAID_RECOVERIES.get(env.PAID_RECOVERIES.idFromName(`watch:${watchKey(value)}`)).publishWatch(value);
  if (saved.kind !== value.kind) throw new Error("Watch kind mismatch");
  return saved as T; // The coordinator checks the immutable commission and variant.
}

/** Both purchase recovery and cron publication use the same journal. A stale
 * empty purchase record can never replace signed observations made since it.
 * No external probe runs in a storage transaction or while publication waits.
 */
export class WatchRecoveryStore {
  private publication: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async repair(): Promise<boolean> {
    const saved = await readWatch(this.storage);
    if (!saved) return false;
    await this.storage.setAlarm(purchaseRecoveryAlarmAt(300_000));
    try { await this.publish(saved); }
    catch { /* Publication re-arms before I/O; another outage remains recoverable. */ }
    return true;
  }

  async publish(proposal: RecoverableWatch): Promise<RecoverableWatch> {
    const work = this.publication.then(async () => {
      const key = watchKey(proposal);
      const durable = await this.storage.get<WatchJournal>("watch");
      const legacy = durable ? null : await kvGetJson<RecoverableWatch["record"]>(this.env.ORDERS, key, "json");
      const saved = await this.storage.transaction(async txn => {
        const journal = await readWatch(txn);
        const current = journal ?? (legacy ? { ...proposal, record: legacy } as RecoverableWatch : proposal);
        if (current.kind !== proposal.kind || commission(current) !== commission(proposal)) throw new Error("Watch commission mismatch");
        let selected: RecoverableWatch;
        if (current.kind === "standing" && proposal.kind === "standing") {
          selected = { kind: "standing", record: { ...current.record, probes: merge(current.record.probes, proposal.record.probes, WATCH_SPACING_MS.standing) } };
        } else if (current.kind === "conformance" && proposal.kind === "conformance") {
          selected = { kind: "conformance", record: { ...current.record, passes: merge(current.record.passes, proposal.record.passes, WATCH_SPACING_MS.conformance) } };
        } else throw new Error("Watch kind mismatch");
        const entries = entriesOf(selected), retained = journal ? entriesOf(journal).length : 0;
        // A full week can exceed SQLite's per-value limit. Retain each signed
        // row separately; only newly appended observations need a write.
        await Promise.all(entries.slice(retained).map((entry, index) => txn.put(entryKey(retained + index), entry)));
        await txn.put("watch", { value: withoutEntries(selected), count: entries.length } satisfies WatchJournal);
        // A cron can persist a paid observation and then lose its KV write.
        // Its own wake-up repairs that projection even after purchase delivery.
        await txn.setAlarm(purchaseRecoveryAlarmAt(300_000));
        return selected;
      });
      await kvPut(this.env.ORDERS, key, JSON.stringify(saved.record));
      await this.storage.deleteAlarm();
      return saved;
    });
    this.publication = work.then(() => undefined, () => undefined);
    return work;
  }
}

function merge<T extends { at: string }>(current: T[], proposal: T[], spacing: number): T[] {
  const result = [...current];
  // Existing signed rows win over stale or duplicate cron reads. Append only;
  // recovery does not rewrite the evidence or fill a missed slot retroactively.
  for (const entry of proposal) {
    const last = result[result.length - 1];
    if (!last || Date.parse(entry.at) - Date.parse(last.at) >= spacing) result.push(entry);
  }
  return result;
}
