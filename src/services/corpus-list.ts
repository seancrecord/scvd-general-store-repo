/**
 * THE CORPUS, READ (2026-09-05, the doors Worker). listCorpus and the
 * record it returns moved here from services/corpus.ts, unchanged: the
 * 402's archive_depth reads the corpus, so the payment gate imports
 * this, and the doors Worker imports the gate. corpus.ts also writes,
 * seals and anchors — behind the ward round, behind preflight, behind
 * most of the observatory — and a Worker that only answers a price
 * must not carry that. corpus.ts re-exports everything here, so every
 * caller that read from it still does.
 */
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { OtsAnchor } from "@/services/anchor-log";
import type { CorpusSnapshot } from "@/services/corpus";
import type { Env } from "@/types";

export interface CorpusRecord {
  snapshot: CorpusSnapshot;
  /** sha256 of the canonical snapshot, hex. */
  digest: string;
  /** ed25519 over the canonical snapshot, the store's live key. */
  signature: string;
  public_key: string;
  ots?: OtsAnchor;
}

/**
 * The slim KV entry for an R2-stored record: chain metadata only, so
 * a listing can report the chain without pulling every full round.
 * The digest/signature here are COPIES for cheap reads; the R2 object
 * is the record, and verification always recomputes from it.
 */
export interface CorpusPointer {
  pointer: true;
  sequence: number;
  week: string;
  digest: string;
  signature: string;
  public_key: string;
  ots?: OtsAnchor;
  r2_key: string;
}

export function isPointer(
  value: CorpusRecord | CorpusPointer,
): value is CorpusPointer {
  return "pointer" in value && value.pointer === true;
}

/** Resolve one stored value — pointer or legacy — to the full record. */
export async function resolveRecord(
  env: Env,
  stored: CorpusRecord | CorpusPointer | null,
): Promise<CorpusRecord | null> {
  if (!stored) return null;
  if (!isPointer(stored)) return stored;
  const object = env.CORPUS_R2
    ? await env.CORPUS_R2.get(stored.r2_key)
    : null;
  if (!object) {
    // A pointer whose object is gone is a chain problem, not a quiet
    // absence — surface it as missing and let verifyCorpusChain say
    // the chain is not contiguous rather than papering over it.
    return null;
  }
  return JSON.parse(await object.text()) as CorpusRecord;
}

export const CORPUS_SCAN_CAP = 1000;

/**
 * THE RESOLVED RECORDS, REMEMBERED PER ISOLATE (2026-09-10).
 *
 * Every corpus reader — the host pages, the round pages, the sitemap,
 * the doors, the 402's archive depth — called listCorpus, and
 * listCorpus resolved every pointer through R2 on every call: one KV
 * list, one bulk get, then one R2 get and one text read per record,
 * for a corpus that gains a record every week forever. A host page
 * cost about a second of that and nothing else; the Cloudflare AI
 * crawler panel showed those pages being walked by the thousand, and
 * a 12-way walk of the sitemap from outside drew 503s on fifty of
 * them. The crawlers were paying R2 to re-read bytes the chain
 * guarantees have not changed.
 *
 * A record is immutable by construction: it is a signed, hash-chained
 * snapshot, and its pointer carries the digest. So a pointer resolved
 * once in this isolate need not be resolved again, keyed on the R2
 * key AND the digest, so a pointer rewritten to a different object
 * misses the memo rather than serving the old one. The KV list still
 * runs every call, because the list is what changes: a new week's
 * record is a new name, resolved once and remembered.
 *
 * WHAT THIS DOES NOT HIDE, said plainly: an R2 object deleted from
 * under a live pointer stays readable from a warm isolate until the
 * isolate recycles. That is a chain problem the cold path still
 * surfaces (resolveRecord returns null and the chain check reports a
 * gap), and a cache that survived it for the life of an isolate is a
 * smaller lie than a 503 to a reader. The chain check itself is not
 * weakened: verifyCorpusChain recomputes every digest from the
 * remembered bytes, which are the bytes R2 served. A pointer whose
 * object was never found is never remembered, so the gap is asked
 * about on every read. forgetResolvedRecords is for tests.
 */
const resolvedRecords = new Map<string, CorpusRecord>();

function memoKey(pointer: CorpusPointer): string {
  return `${pointer.r2_key}#${pointer.digest}`;
}

/** Drop the isolate's memo. For the chain check and for tests. */
export function forgetResolvedRecords(): void {
  resolvedRecords.clear();
}

/** How many resolved pointers this isolate remembers. For tests. */
export function resolvedRecordCount(): number {
  return resolvedRecords.size;
}

async function resolveRemembered(
  env: Env,
  stored: CorpusRecord | CorpusPointer | null,
): Promise<CorpusRecord | null> {
  if (!stored || !isPointer(stored)) return resolveRecord(env, stored);
  const key = memoKey(stored);
  const remembered = resolvedRecords.get(key);
  if (remembered) return remembered;
  const record = await resolveRecord(env, stored);
  if (record) resolvedRecords.set(key, record);
  return record;
}

export async function listCorpus(env: Env): Promise<CorpusRecord[]> {
  // BOUNDED-READ-SAFE: the corpus is one record a week (takeCorpusSnapshot
  // is idempotent per week), so a cap of 1,000 is nineteen years of
  // snapshots; the flag cannot trip before 2045. Rule 52 wants that
  // said here, per file, not assumed (test/bounded-read-honesty.spec.ts).
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.corpusPrefix,
    cap: CORPUS_SCAN_CAP,
  });
  const values = await bulkGetJson<CorpusRecord | CorpusPointer>(
    env.COUNTERS,
    listed.names,
  );
  /*
   * ONE WAVE OVER THE POINTERS — rule 50.
   *
   * Every record written since the R2 move is a POINTER, and
   * resolveRecord turns each one into an R2 get plus a text read: two
   * serial round trips per record, awaited one after another, up to
   * CORPUS_SCAN_CAP. The corpus gains an entry every week forever, so
   * this got one record slower every Sunday with no commit to notice.
   *
   * The records do not depend on each other here — the CHAIN check
   * does, and it stays sequential over the resolved set below.
   */
  const resolved = await Promise.all(
    listed.names.map((name) => resolveRemembered(env, values.get(name) ?? null)),
  );
  const records = resolved.filter((record): record is CorpusRecord =>
    Boolean(record),
  );
  records.sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
  return records;
}
