import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { cachedPublicKeyHex } from "@/lib/signing";
import { RETIRED_KEYS, retiredKeysFor } from "@/store/key-registry";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

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
  await kvPut(env.COUNTERS, 
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
  await kvPut(env.COUNTERS, 
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


/**
 * THE PUBLISHED LOG AS DATA, extracted from the route on 2026-08-03
 * for the same reason as buildDidDocument: the conformance desk's
 * anchored-key-history check reads /.well-known/anchor-log.json off
 * the issuer's origin, and when the issuer is US that fetch dies as a
 * 522 — Cloudflare refuses a Worker's subrequest to its own hostname.
 * The desk reads this builder directly instead; route and desk serve
 * one document from one producer.
 */
export async function buildAnchorLogDocument(env: Env): Promise<object> {
  const base = env.STORE_BASE_URL;
  const records = await listAnchors(env);
  const problems = await verifyChain(records);
  const pending = records.filter((r) => r.ots?.status === "pending").length;
  const complete = records.filter((r) => r.ots?.status === "complete").length;

  return {
    what_this_is:
      "An append-only hash chain over this store's signing-key state. Each entry commits to the entry before it, and the digests are submitted to OpenTimestamps, which anchors them into Bitcoin. One confirmed anchor vouches for the whole history behind it.",
    what_it_does_not_prove:
      "It proves WHEN, never WHO SHOULD HAVE. Anyone holding this store's key — including a thief — could sign and timestamp just as validly. This bounds a compromise window after the fact; it does not prevent one. The defence against theft is the succession protocol at /attestation, and it is a separate thing.",
    how_to_check_without_trusting_us: [
      "1. Take any entry's `snapshot` and re-serialize it in the field order shown in `canonical_form_note`, then SHA-256 it. It must equal that entry's `digest`.",
      "2. Check `previous_digest` equals the digest of the entry before it. A break anywhere means history was altered.",
      "3. Base64-decode `ots.proof_base64` into a .ots file and run `ots verify` (the standard OpenTimestamps client) against the digest. An upgraded proof verifies against Bitcoin block headers with no calendar server, no OpenTimestamps infrastructure, and nothing from us. THIS IS THE STEP THAT SETTLES IT — the status word below is our bookkeeping, and step 3 is the fact.",
      "4. THE STEP THAT ACTUALLY CATCHES BACKDATING, and the reason the other three exist: compare the Bitcoin block time `ots verify` reports against the `taken_at` inside that entry's snapshot. They should be close — we submit within a day and confirmation takes an hour or two. A snapshot claiming an OLD taken_at whose proof lands in a MUCH later block is an entry written after the fact and stamped later, which is exactly the forgery this log is built to make visible. Steps 1-3 prove the chain is internally consistent; only this step ties it to time we do not control.",
      "5. A `pending` proof is a calendar's promise, not yet a Bitcoin commitment. Weigh it accordingly — it usually confirms within a couple of hours.",
      "6. What this cannot catch: if this store's KV were wiped and a fresh chain started at sequence 1, it would look genuine to a reader who had never seen the old one. Defence is the same as for any transparency log — if you rely on this, keep the digest you last saw. A chain that no longer contains it has been replaced, not extended.",
    ],
    canonical_form_note:
      "version, sequence, taken_at, previous_digest, current_public_key, retired_keys (sorted by retired_on then public_key, each {public_key, retired_on}), artifacts_issued_total. JSON with no whitespace, exactly these keys in exactly this order.",
    chain_length: records.length,
    /**
     * ONE WORD, PUBLISHED AT THE SOURCE, so no reader downstream can
     * collapse "submitted" and "confirmed" into one green checkmark.
     *
     * The state that earns this field is `pending_only`: a chain whose
     * proofs are ALL pending is exactly the state a chain rewritten
     * TODAY would be in — nothing has confirmed yet, so nothing exists
     * that could contradict a rewrite. Reporting that as "anchored"
     * would be publishing an attacker's best case as if it were ours.
     * Counted here rather than left for each consumer to derive,
     * because a distinction every reader must rediscover is one most
     * readers will lose.
     */
    anchor_confidence:
      problems.length > 0
        ? "chain_broken"
        : complete > 0
          ? "confirmed"
          : pending > 0
            ? "pending_only"
            : "unanchored",
    anchor_confidence_note:
      "confirmed = at least one entry's timestamp is Bitcoin-backed, which vouches for the whole chain behind it. pending_only = submitted and accepted by a calendar, nothing confirmed — weakest state that still looks like progress, and the same state a same-day rewrite would show. unanchored = nothing submitted yet. chain_broken = the log does not recompute, and the rest is moot.",
    ots_complete: complete,
    ots_pending: pending,
    /**
     * WHAT OUR OWN STATUS WORD MEANS, because we do not parse the
     * proofs we serve. "complete" means a calendar handed back an
     * upgraded timestamp when we asked; per the OpenTimestamps
     * protocol that happens once the commitment is in a confirmed
     * block, but WE did not check a Bitcoin header — we deliberately
     * do not ship a second OTS implementation to be wrong. Step 3
     * above is the check that settles it, and this line exists so
     * nobody reads our bookkeeping as our verification.
     */
    what_our_status_word_means:
      "`complete` means a calendar returned an upgraded proof when we asked, not that this store verified it against Bitcoin. We do not parse OTS proofs — writing a second implementation to be wrong would be worse than serving the bytes. Run `ots verify` yourself; that is the fact, this is our bookkeeping.",
    /**
     * Our own verification of our own chain, published for what it is
     * worth — which is: it catches accidents, not us. A reader who
     * wants the real answer runs step 1 above themselves. Published
     * anyway because an empty problems list that we would have had to
     * fake is more honest than not showing the check at all.
     */
    self_check: problems.length === 0 ? "no breaks found" : problems,
    scan_cap: ANCHOR_SCAN_CAP,
    truncated: records.length >= ANCHOR_SCAN_CAP,
    entries: records.map((record) => ({
      snapshot: record.snapshot,
      digest: record.digest,
      canonical_form: canonicalizeSnapshot(record.snapshot),
      ots: record.ots ?? { status: "not submitted yet" },
    })),
    key_history: `${base}/.well-known/scvd-signing-key`,
    succession_protocol: `${base}/attestation`,
  };
}
