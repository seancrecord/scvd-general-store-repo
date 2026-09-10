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
import { kvGetJson, kvPut } from "@/lib/kv-retry";
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
 * THE CHAIN AS KV HOLDS IT (2026-09-10, the slow-doors read).
 *
 * What every reader of the corpus pays first: one list over the
 * prefix and one bulk read of the pointers, a few hundred bytes a
 * week. The fingerprint is a sha256 over exactly those bytes, in key
 * order, so it changes when — and only when — the chain KV describes
 * changes: a week appended, an OTS stamp upgraded on a pointer, a
 * legacy full record rewritten. It is the identity every cache below
 * keys on, which is why none of them can serve a chain the store no
 * longer holds.
 */
interface CorpusPointers {
  names: string[];
  values: Map<string, CorpusRecord | CorpusPointer | null>;
  truncated: boolean;
  fingerprint: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listPointers(env: Env): Promise<CorpusPointers> {
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
  const fingerprint = await sha256Hex(
    listed.names.map((name) => `${name}=${JSON.stringify(values.get(name) ?? null)}`).join("\n"),
  );
  return { names: listed.names, values, truncated: listed.truncated, fingerprint };
}

/**
 * ONE RESOLVED CHAIN PER ISOLATE (2026-09-10).
 *
 * Every surface derived from the corpus — the door index, the feeds,
 * the fresh set, the monthly state, /corpus.json itself — called
 * listCorpus on every request, and listCorpus fetched EVERY snapshot
 * body from R2 and parsed it, every time. Week 6's round carries
 * 2,767 hosts with their evidence inline: 11.5 MB of JSON, read and
 * parsed to answer a 3.6 KB Atom feed. Server-Timing on the live
 * doors read 700–1,300 ms of wall time in the Worker for outputs
 * that had not changed since Sunday.
 *
 * So the resolved records are held once per isolate, keyed on the
 * fingerprint above. A reader still lists KV each time — that is the
 * check that the chain is what it was — and skips R2 only when KV
 * says nothing moved. The memo hands out a copy of the array, never
 * the array, so a caller that sorts or splices cannot reorder the
 * chain for the next one; the records themselves are shared and read
 * as the immutable things they are.
 */
let resolvedChain: { fingerprint: string; records: CorpusRecord[] } | null = null;

async function resolveAll(env: Env, pointers: CorpusPointers): Promise<CorpusRecord[]> {
  if (resolvedChain?.fingerprint === pointers.fingerprint) {
    return [...resolvedChain.records];
  }
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
    pointers.names.map((name) => resolveRecord(env, pointers.values.get(name) ?? null)),
  );
  const records = resolved.filter((record): record is CorpusRecord =>
    Boolean(record),
  );
  records.sort((a, b) => a.snapshot.sequence - b.snapshot.sequence);
  resolvedChain = { fingerprint: pointers.fingerprint, records };
  return [...records];
}

export async function listCorpus(env: Env): Promise<CorpusRecord[]> {
  return resolveAll(env, await listPointers(env));
}

/**
 * The fingerprint of a chain already in hand, from the records'
 * own sequence, digest and stamp — the same facts the pointers carry —
 * so a memo over a derivation of the records (the chain check in
 * corpus.ts) can key on the records without keeping the array's
 * identity, which the copy above deliberately does not preserve.
 */
export function chainFingerprintOf(records: readonly CorpusRecord[]): string {
  return records
    .map((record) => `${record.snapshot.sequence}:${record.digest}:${record.ots?.status ?? "-"}`)
    .join("|");
}

function sequenceOf(stored: CorpusRecord | CorpusPointer | null): number {
  if (!stored) return -1;
  return isPointer(stored) ? stored.sequence : stored.snapshot.sequence;
}

/**
 * THE NEWEST ENTRY, AND ONLY THAT ONE (2026-09-10). The fresh set and
 * the snapshot pass want the latest record; both used to resolve the
 * whole chain from R2 to read its last element. Now the pointers are
 * listed, the highest sequence picked, and that one object fetched —
 * unless the list was cut at the cap, in which case the last name
 * listed is not the newest and the full walk is the honest answer.
 */
export async function latestCorpusEntry(env: Env): Promise<CorpusRecord | null> {
  const pointers = await listPointers(env);
  if (pointers.truncated) {
    const records = await resolveAll(env, pointers);
    return records[records.length - 1] ?? null;
  }
  if (resolvedChain?.fingerprint === pointers.fingerprint) {
    return resolvedChain.records[resolvedChain.records.length - 1] ?? null;
  }
  let newest: CorpusRecord | CorpusPointer | null = null;
  for (const name of pointers.names) {
    const stored = pointers.values.get(name) ?? null;
    if (sequenceOf(stored) > sequenceOf(newest)) newest = stored;
  }
  return resolveRecord(env, newest);
}

/**
 * A DERIVATION, KEPT UNTIL THE CHAIN OR THE CODE MOVES (2026-09-10).
 *
 * The door index, the feeds and the monthly state are pure functions
 * of the records: same chain, same code, same answer. Rebuilding them
 * from 11.5 MB of R2 on every cold isolate was the cost the live
 * numbers showed. This keeps the built value in KV under a key made
 * of three things — the surface's name, the DEPLOYED VERSION, and the
 * chain fingerprint — so a reader anywhere pays the pointer list plus
 * one KV get, and never sees a value built from a chain or a
 * derivation that no longer exists.
 *
 * NOT A SECOND COPY OF THE RECORD. The corpus stays the only thing
 * anyone signs or verifies; this is a memo of arithmetic over it,
 * addressed by the record's own digest chain, and it expires. Without
 * the version binding (a test, a Worker that does not declare it) the
 * KV layer is skipped entirely rather than risk serving one deploy's
 * derivation under the next: the isolate memo above still applies.
 * A put that fails costs nothing but the next reader's rebuild.
 */
const DERIVED_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function derivedFromCorpus<T>(
  env: Env,
  surface: string,
  build: (records: CorpusRecord[]) => T | Promise<T>,
): Promise<T> {
  const pointers = await listPointers(env);
  const version = env.CF_VERSION_METADATA?.id;
  const key = version
    ? KV_KEYS.corpusDerived(surface, version, pointers.fingerprint)
    : null;
  if (key) {
    const held = await kvGetJson<T>(env.COUNTERS, key, "json").catch(() => null);
    if (held !== null && held !== undefined) return held;
  }
  const value = await build(await resolveAll(env, pointers));
  if (key) {
    await kvPut(env.COUNTERS, key, JSON.stringify(value), {
      expirationTtl: DERIVED_TTL_SECONDS,
    }).catch(() => undefined);
  }
  return value;
}

/** Test seam: forget the isolate's resolved chain. */
export function forgetResolvedChain(): void {
  resolvedChain = null;
}
