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

export async function listCorpus(env: Env): Promise<CorpusRecord[]> {
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
    listed.names.map((name) => resolveRecord(env, values.get(name) ?? null)),
  );
  const records = resolved.filter((record): record is CorpusRecord =>
    Boolean(record),
  );
  records.sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
  return records;
}
