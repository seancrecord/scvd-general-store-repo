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
 * STORAGE: KV, deliberately, for now. One snapshot a week at tens of
 * kilobytes is decades of headroom under KV's limits, and the corpus
 * rides the same store as the anchor log it mirrors. The named
 * graduation trigger is full-universe crawling at its own cadence —
 * when snapshots stop being weekly-and-small, they move to R2 and
 * this comment moves with them. Fifty-two keys a year does not need
 * an object store; pretending it does would be carry cost, and the
 * option discipline is carry near zero.
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

/** Ceiling on a corpus scan. Named because an unnamed cap is a silent one. */
const CORPUS_SCAN_CAP = 1000;

export async function listCorpus(env: Env): Promise<CorpusRecord[]> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.corpusPrefix,
    cap: CORPUS_SCAN_CAP,
  });
  const values = await bulkGetJson<CorpusRecord>(env.COUNTERS, listed.names);
  const records: CorpusRecord[] = [];
  for (const name of listed.names) {
    const record = values.get(name);
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
  return env.COUNTERS.get<CorpusRecord>(corpusKey(sequence), "json");
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
  await env.COUNTERS.put(corpusKey(snapshot.sequence), JSON.stringify(record));
  // The stamp is a courtesy that can fail; the entry above cannot be
  // taken back by a calendar outage.
  record.ots = await submitDigestToOts(digest, options);
  await env.COUNTERS.put(corpusKey(snapshot.sequence), JSON.stringify(record));
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
