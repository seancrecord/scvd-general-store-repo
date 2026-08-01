import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { cachedPublicKeyHex } from "@/lib/signing";
import { RETIRED_KEYS, retiredKeysFor } from "@/store/key-registry";
import type { Env } from "@/types";

/**
 * THE ANCHOR LOG — an append-only hash chain over this store's key
 * state, externally timestamped so "signed before date X" stops being
 * our word.
 *
 * THE GAP IT CLOSES (problem ledger #2): the key registry is
 * self-hosted and mutable. The transition chain is cryptographic and
 * the git history is third-party timestamped, but neither is
 * immutability, and a thief who took the key could in principle
 * rewrite what we published about when. What an outside verifier
 * wants is a commitment we could not have made after the fact.
 *
 * HOW: each run appends a snapshot of the key state, hashed, carrying
 * the PREVIOUS digest. That makes the log a chain — altering any past
 * entry changes every digest after it — and the newest digest is what
 * gets submitted to external logs (OpenTimestamps, which anchors into
 * Bitcoin, and Rekor). One external commitment therefore vouches for
 * the whole history behind it.
 *
 * THREE RULES THIS FILE KEEPS, each earned elsewhere in this codebase:
 *
 * 1. NEVER ON THE MONEY PATH. Anchoring is cron work. No purchase
 *    waits on a calendar server, and no calendar outage can fail a
 *    sale. Decoration fails open; money fails closed.
 * 2. STORE THE DIGEST BEFORE TRYING TO ANCHOR IT. The chain is ours
 *    and must survive every external failure; submission is a
 *    separate, retryable step recorded on the entry. A log that loses
 *    its own history because somebody else's server was down is not
 *    a log.
 * 3. RECOMPUTABLE BY A STRANGER OR IT PROVES NOTHING. The snapshot is
 *    published in full and hashed in a fixed field order, so anyone
 *    can fetch it, re-hash it, and check it against the timestamp.
 *    A digest whose input nobody can reproduce is a number.
 */

/** Ceiling on an anchor-log scan. An unnamed cap is a silent one. */
export const ANCHOR_SCAN_CAP = 500;

export interface AnchorSnapshot {
  version: 1;
  /** 1-based, contiguous. The chain's position. */
  sequence: number;
  taken_at: string;
  /** The digest this entry extends; null only for the genesis entry. */
  previous_digest: string | null;
  current_public_key: string;
  retired_keys: Array<{ public_key: string; retired_on: string }>;
  /** Patron numbers issued so far: a monotonic count of artifacts. */
  artifacts_issued_total: number;
}

export type ExternalStatus = "pending" | "complete" | "failed";

export interface OtsAnchor {
  status: ExternalStatus;
  submitted_at?: string;
  /** The calendar's serialized proof, base64. Opaque to us on purpose. */
  proof_base64?: string;
  upgraded_at?: string;
  calendar?: string;
  error?: string;
}

export interface RekorAnchor {
  status: ExternalStatus;
  submitted_at?: string;
  uuid?: string;
  log_index?: number;
  error?: string;
}

export interface AnchorRecord {
  snapshot: AnchorSnapshot;
  /** sha256 of the canonical snapshot, hex. */
  digest: string;
  ots?: OtsAnchor;
  rekor?: RekorAnchor;
}

/**
 * FIXED FIELD ORDER, and nothing derived at hash time.
 *
 * Every value here comes from the snapshot as published, so a
 * stranger who fetches the snapshot can reproduce this string byte
 * for byte. Retired keys are sorted by retirement date so the array's
 * order cannot drift with however the registry happens to be written.
 */
export function canonicalizeSnapshot(snapshot: AnchorSnapshot): string {
  return JSON.stringify({
    version: snapshot.version,
    sequence: snapshot.sequence,
    taken_at: snapshot.taken_at,
    previous_digest: snapshot.previous_digest,
    current_public_key: snapshot.current_public_key,
    retired_keys: [...snapshot.retired_keys]
      .sort((a, b) =>
        a.retired_on === b.retired_on
          ? a.public_key.localeCompare(b.public_key)
          : a.retired_on.localeCompare(b.retired_on),
      )
      .map((key) => ({
        public_key: key.public_key,
        retired_on: key.retired_on,
      })),
    artifacts_issued_total: snapshot.artifacts_issued_total,
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function digestOf(snapshot: AnchorSnapshot): Promise<string> {
  return sha256Hex(canonicalizeSnapshot(snapshot));
}

/** Sequence keys sort lexicographically, so the newest is last. */
function anchorKey(sequence: number): string {
  return `${KV_KEYS.anchorLogPrefix}${String(sequence).padStart(9, "0")}`;
}

export async function listAnchors(
  env: Env,
  cap: number = ANCHOR_SCAN_CAP,
): Promise<AnchorRecord[]> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.anchorLogPrefix,
    cap,
  });
  const values = await bulkGetJson<AnchorRecord>(env.COUNTERS, listed.names);
  const records: AnchorRecord[] = [];
  for (const name of listed.names) {
    const record = values.get(name);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
}

export async function latestAnchor(env: Env): Promise<AnchorRecord | null> {
  const records = await listAnchors(env);
  return records.length > 0 ? (records[records.length - 1] ?? null) : null;
}

/**
 * The state worth committing to. Deliberately small and bounded: the
 * key registry plus a monotonic artifact count. It is not a manifest
 * of every artifact — a per-run KV scan of everything ever issued
 * would grow without limit and would be the expensive kind of
 * thoroughness that eventually stops running. The count is enough to
 * make silent deletion of history evident, which is the property
 * being bought.
 */
export async function buildSnapshot(
  env: Env,
  previous: AnchorRecord | null,
  now: Date = new Date(),
): Promise<AnchorSnapshot> {
  const currentPublicKey = await cachedPublicKeyHex(env.SIGNING_KEY);
  const retired = retiredKeysFor(currentPublicKey).map((key) => ({
    public_key: key.public_key,
    retired_on: key.retired_on,
  }));
  const issued = parseInt(
    (await env.COUNTERS.get(KV_KEYS.patronNumber)) ?? "0",
    10,
  );
  return {
    version: 1,
    sequence: (previous?.snapshot.sequence ?? 0) + 1,
    taken_at: now.toISOString(),
    previous_digest: previous?.digest ?? null,
    current_public_key: currentPublicKey,
    retired_keys: retired,
    artifacts_issued_total: Number.isFinite(issued) ? issued : 0,
  };
}

/**
 * Append one entry. Returns the stored record with no external
 * submission attempted — that is a separate step ON PURPOSE, so the
 * chain exists before anyone's network can fail.
 */
export async function appendAnchor(
  env: Env,
  now: Date = new Date(),
): Promise<AnchorRecord> {
  const previous = await latestAnchor(env);
  const snapshot = await buildSnapshot(env, previous, now);
  const record: AnchorRecord = {
    snapshot,
    digest: await digestOf(snapshot),
  };
  await env.COUNTERS.put(
    anchorKey(snapshot.sequence),
    JSON.stringify(record),
  );
  return record;
}

/** Update an existing entry in place (submission results, upgrades). */
export async function saveAnchor(
  env: Env,
  record: AnchorRecord,
): Promise<void> {
  await env.COUNTERS.put(
    anchorKey(record.snapshot.sequence),
    JSON.stringify(record),
  );
}

export interface ChainProblem {
  sequence: number;
  problem: string;
}

/**
 * Walk the chain and report every break, rather than the first.
 *
 * A verifier — including our own tests and anyone who fetches the
 * published log — should be able to check three things without
 * trusting us: sequences are contiguous, each digest is genuinely the
 * hash of its own published snapshot, and each entry names the
 * previous entry's digest. This function is that check, and it is
 * exported so the same code proves it in tests and serves it publicly.
 */
export async function verifyChain(
  records: AnchorRecord[],
): Promise<ChainProblem[]> {
  const problems: ChainProblem[] = [];
  let expectedSequence = 1;
  let expectedPrevious: string | null = null;
  for (const record of records) {
    const { snapshot } = record;
    if (snapshot.sequence !== expectedSequence) {
      problems.push({
        sequence: snapshot.sequence,
        problem: `sequence gap: expected ${expectedSequence}`,
      });
    }
    const recomputed = await digestOf(snapshot);
    if (recomputed !== record.digest) {
      problems.push({
        sequence: snapshot.sequence,
        problem: "digest does not match its own snapshot",
      });
    }
    if (snapshot.previous_digest !== expectedPrevious) {
      problems.push({
        sequence: snapshot.sequence,
        problem: `previous_digest does not chain (expected ${
          expectedPrevious ?? "null"
        })`,
      });
    }
    expectedSequence = snapshot.sequence + 1;
    expectedPrevious = record.digest;
  }
  return problems;
}

/** Every retired key the registry knows, for the published log's header. */
export function registryKeyCount(): number {
  return RETIRED_KEYS.length;
}
