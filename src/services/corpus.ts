import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { signMessage } from "@/lib/signing";
import { submitDigestToOts } from "@/services/anchor-submit";
import type { SubmitOptions } from "@/services/anchor-submit";
import type { OtsAnchor } from "@/services/anchor-log";
import { latestWardRound } from "@/services/ward-round";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE CORPUS — the ecosystem's observed history, kept (the keeper's
 * ruling, 2026-08-07: the Gretzky brief's strongest play, and the one
 * that is rule 23a verbatim).
 *
 * The ward round has walked the public x402 neighbourhood weekly since
 * it shipped, and until now its observations were WORKING DATA: read
 * at /admin/ward, overwritten in spirit if never in fact, kept for the
 * week-over-week delta and nothing longer. This file turns those same
 * observations into a RECORD: each round frozen into a snapshot,
 * hash-chained to the one before it, signed by the store's key, and
 * its digest submitted to OpenTimestamps — so the corpus is
 * tamper-evident from its first entry, and the claim "we have observed
 * this ecosystem continuously since <date>" is checkable by a stranger
 * rather than taken on faith. A history like this cannot be backfilled
 * at any price, which is the entire reason to start keeping it before
 * anyone asks for it.
 *
 * WHAT IT IS NOT, said early because the ethos makes this the
 * temptation: not a rating, not a ranking, not a score on anybody.
 * Each snapshot holds what the round observed — who was listed, who
 * answered, what the probe saw — as dated facts about moments, per
 * rule 43's line: artifacts and conduct at a point in time, never an
 * accumulating judgment on an actor. The corpus is the substrate a
 * future conformance feed or audit report reads FROM; it renders no
 * verdicts of its own.
 *
 * STORAGE: R2 SINCE 2026-08-19 — the graduation this comment named
 * for itself on day one ("when snapshots stop being weekly-and-small,
 * they move to R2 and this comment moves with them") arrived with the
 * long walk: full-universe crawling at its own cadence, snapshots in
 * the hundreds of kilobytes and growing. New entries live as one R2
 * object each (corpus/{seq}.json, the full CorpusRecord) with a SLIM
 * POINTER in KV carrying the chain metadata (sequence, week, digest,
 * signature) so listings stay cheap; entries minted before the
 * graduation stay in KV untouched and verify exactly as they always
 * did — a chain migration would be rewriting history to change where
 * it is shelved. With no R2 binding present, writes fall back to the
 * legacy KV shape: a missing bucket degrades, never breaks.
 *
 * THE CHAIN IS ITS OWN. The key-history anchor log's snapshot schema
 * is versioned, load-bearing, and reproduced byte-for-byte by outside
 * verifiers; grafting corpus digests into it would be surgery on the
 * trust spine to save one KV prefix. Two chains, one shared OTS
 * submitter (extracted for exactly this), each verifiable alone.
 */

export interface CorpusSnapshot {
  version: 1;
  /** 1-based, contiguous. The chain's position. */
  sequence: number;
  taken_at: string;
  /** The digest this entry extends; null only for the first entry. */
  previous_digest: string | null;
  /** What was observed and by which instrument. One source today. */
  source: "ward_round";
  /** The ward week this snapshot freezes, e.g. 2026-W32. */
  week: string;
  /** The round's observations, verbatim as the ward recorded them. */
  round: WardRound;
}

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
 * FIXED FIELD ORDER, same law as the anchor log: everything here comes
 * from the snapshot as published, so a stranger who fetches the entry
 * can reproduce this string byte for byte and check both the digest
 * and the signature with their own tools.
 */
export function canonicalizeCorpusSnapshot(snapshot: CorpusSnapshot): string {
  return JSON.stringify({
    version: snapshot.version,
    sequence: snapshot.sequence,
    taken_at: snapshot.taken_at,
    previous_digest: snapshot.previous_digest,
    source: snapshot.source,
    week: snapshot.week,
    round: snapshot.round,
  });
}

async function digestOf(snapshot: CorpusSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalizeCorpusSnapshot(snapshot),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function corpusKey(sequence: number): string {
  return `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`;
}

function r2Key(sequence: number): string {
  return `corpus/${sequence}.json`;
}

/**
 * The slim KV entry for an R2-stored record: chain metadata only, so
 * a listing can report the chain without pulling every full round.
 * The digest/signature here are COPIES for cheap reads; the R2 object
 * is the record, and verification always recomputes from it.
 */
interface CorpusPointer {
  pointer: true;
  sequence: number;
  week: string;
  digest: string;
  signature: string;
  public_key: string;
  ots?: OtsAnchor;
  r2_key: string;
}

function isPointer(
  value: CorpusRecord | CorpusPointer,
): value is CorpusPointer {
  return "pointer" in value && value.pointer === true;
}

/**
 * Store one record: R2 object + slim KV pointer when the bucket is
 * bound, the legacy full-record-in-KV shape when it is not. The R2
 * write lands FIRST so a failure between the two leaves the entry
 * invisible (and the idempotent snapshot pass re-takes it) rather
 * than pointing at an object that does not exist.
 */
async function putCorpusRecord(env: Env, record: CorpusRecord): Promise<void> {
  const sequence = record.snapshot.sequence;
  if (env.CORPUS_R2) {
    await env.CORPUS_R2.put(r2Key(sequence), JSON.stringify(record));
    const pointer: CorpusPointer = {
      pointer: true,
      sequence,
      week: record.snapshot.week,
      digest: record.digest,
      signature: record.signature,
      public_key: record.public_key,
      ...(record.ots ? { ots: record.ots } : {}),
      r2_key: r2Key(sequence),
    };
    await env.COUNTERS.put(corpusKey(sequence), JSON.stringify(pointer));
    return;
  }
  await env.COUNTERS.put(corpusKey(sequence), JSON.stringify(record));
}

/** Resolve one stored value — pointer or legacy — to the full record. */
async function resolveRecord(
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

/** Ceiling on a corpus scan. Named because an unnamed cap is a silent one. */
const CORPUS_SCAN_CAP = 1000;

export async function listCorpus(env: Env): Promise<CorpusRecord[]> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.corpusPrefix,
    cap: CORPUS_SCAN_CAP,
  });
  const values = await bulkGetJson<CorpusRecord | CorpusPointer>(
    env.COUNTERS,
    listed.names,
  );
  const records: CorpusRecord[] = [];
  for (const name of listed.names) {
    const record = await resolveRecord(env, values.get(name) ?? null);
    if (record) {
      records.push(record);
    }
  }
  records.sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
  return records;
}

export async function latestCorpusEntry(
  env: Env,
): Promise<CorpusRecord | null> {
  const records = await listCorpus(env);
  return records[records.length - 1] ?? null;
}

export async function getCorpusEntry(
  env: Env,
  sequence: number,
): Promise<CorpusRecord | null> {
  const stored = await env.COUNTERS.get<CorpusRecord | CorpusPointer>(
    corpusKey(sequence),
    "json",
  );
  return resolveRecord(env, stored);
}

export type CorpusPass =
  | { taken: true; record: CorpusRecord }
  | { taken: false; reason: string };

/**
 * One pass: freeze the latest ward round into the chain, if it is not
 * already there. IDEMPOTENT PER WEEK — the cron can call this every
 * Sunday (or every hour) and the chain grows by at most one entry per
 * round, because the ward's week key is the identity. The OTS
 * submission fails soft onto the record, same discipline as the key
 * chain: the chain is ours and already stored by the time any
 * calendar can disappoint us.
 */
export async function takeCorpusSnapshot(
  env: Env,
  options: SubmitOptions = {},
): Promise<CorpusPass> {
  const round = await latestWardRound(env);
  if (!round) {
    return { taken: false, reason: "no ward round has run yet" };
  }
  const previous = await latestCorpusEntry(env);
  if (previous && previous.snapshot.week === round.week) {
    return {
      taken: false,
      reason: `week ${round.week} is already in the corpus (sequence ${previous.snapshot.sequence})`,
    };
  }
  const snapshot: CorpusSnapshot = {
    version: 1,
    sequence: (previous?.snapshot.sequence ?? 0) + 1,
    taken_at: (options.now ?? new Date()).toISOString(),
    previous_digest: previous?.digest ?? null,
    source: "ward_round",
    week: round.week,
    round,
  };
  const digest = await digestOf(snapshot);
  const { signature, publicKey } = await signMessage(
    canonicalizeCorpusSnapshot(snapshot),
    env.SIGNING_KEY,
  );
  const record: CorpusRecord = {
    snapshot,
    digest,
    signature,
    public_key: publicKey,
  };
  await putCorpusRecord(env, record);
  // The stamp is a courtesy that can fail; the entry above cannot be
  // taken back by a calendar outage.
  record.ots = await submitDigestToOts(digest, options);
  await putCorpusRecord(env, record);
  return { taken: true, record };
}

/**
 * Walk the chain the way a stranger would: every previous_digest must
 * equal the prior entry's digest, every digest must recompute, and
 * sequences must be contiguous from 1. Published on /corpus.json so
 * the check is a claim anyone can re-run, not a promise.
 */
export async function verifyCorpusChain(
  env: Env,
): Promise<{ intact: boolean; entries: number; problem?: string }> {
  const records = await listCorpus(env);
  let previousDigest: string | null = null;
  for (const [index, record] of records.entries()) {
    if (record.snapshot.sequence !== index + 1) {
      return {
        intact: false,
        entries: records.length,
        problem: `sequence ${record.snapshot.sequence} at position ${index + 1}: the chain is not contiguous`,
      };
    }
    if (record.snapshot.previous_digest !== previousDigest) {
      return {
        intact: false,
        entries: records.length,
        problem: `sequence ${record.snapshot.sequence} does not extend the prior entry's digest`,
      };
    }
    if ((await digestOf(record.snapshot)) !== record.digest) {
      return {
        intact: false,
        entries: records.length,
        problem: `sequence ${record.snapshot.sequence}'s digest does not recompute`,
      };
    }
    previousDigest = record.digest;
  }
  return { intact: true, entries: records.length };
}
