import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import {
  canonicalizeCertificate,
  canonicalizeCertificateLegacy,
  certificateSignatureForm,
} from "@/lib/signing";
import {
  lookupBlockTime,
  type BlockTimeOptions,
} from "@/lib/bitcoin-block-time";
import { sha256Hex } from "@/services/anchor-log";
import {
  submitDigestToOts,
  upgradeDigestOts,
  type SubmitOptions,
} from "@/services/anchor-submit";
import { getCertificate, getPatron } from "@/services/certificates";
import { findBitcoinAttestations } from "@/services/ots-proof";
import { EXISTENCE_BOUND_MEANS } from "@/store/attestation-spec";
import type { CertificateAnchor, CertificateRecord, Env } from "@/types";

/**
 * CERTIFICATE ANCHORS — an existed-by on every receipt (2026-09-05).
 *
 * THE GAP, as an outside reader put it on the x402 settlement-receipt
 * thread: the key log's anchors bound when a handover was ANNOUNCED,
 * not when any artifact was signed. The service-window check on
 * /api/verify compares a key's published dates against the date the
 * artifact carries — and the artifact's date is the one field a
 * holder of a stolen retired key gets to choose. A receipt minted
 * today, dated last month, citing a real settlement from last month
 * and signed with last month's key passed that check as
 * `in_service`, and nothing on the artifact could say otherwise. The
 * settlement transaction supplies a not-before; nothing supplied a
 * not-after.
 *
 * THE FIX is the store's own anchoring machinery pointed at the
 * shelf: sha256 of each certificate's signed bytes — the exact
 * signed_payload /api/verify serves, so the digest is recomputable by
 * any holder — submitted to OpenTimestamps and upgraded to a Bitcoin
 * attestation, with the block height read off the completed proof.
 * A certificate whose bound falls inside its key's service window was
 * provably signed while the key was current. One whose bound falls
 * after retirement is not thereby a forgery — every receipt minted
 * before this file existed was anchored on backfill and lands there —
 * so the verdict says "unproven", never "forged", and never "proven"
 * on the strength of a date.
 *
 * NEVER ON THE MONEY PATH. The mint writes nothing new; the hourly
 * sweep walks patron numbers — sequential, bounded by the counter,
 * never a capped prefix scan that quietly stops seeing old receipts —
 * with two cursors: `head` follows the counter forward so a new
 * receipt is anchored within the hour, `backfill` walks from where
 * the sweep first started down to patron #1. New receipts first,
 * because the bound is worth most when it is close to the mint.
 *
 * NO CHAIN, on purpose, same reasoning as the patron anchors: each
 * receipt's proof stands alone. Chaining receipts would be the
 * ordering guarantee the /attestation page still says the store does
 * not have, and this is not that — it bounds one artifact's
 * existence, and says nothing about what was withheld between two.
 */

export const CERT_ANCHOR_SUBMISSIONS_PER_PASS = 25;
export const CERT_ANCHOR_BACKFILL_PER_PASS = 25;
export const CERT_ANCHOR_UPGRADES_PER_PASS = 40;
/** Ceiling on the open-work listing. An unnamed cap is a silent one. */
const PENDING_SCAN_CAP = 1000;

export interface CertificateAnchorOptions extends SubmitOptions {
  blockTime?: BlockTimeOptions;
}

interface AnchorCursor {
  /** Highest patron number whose certificate has been submitted, going forward. */
  head: number;
  /** Lowest patron number reached walking backward; 0 once the walk is done. */
  backfill: number;
}

/**
 * The digest the anchor commits to: sha256 over the SAME string
 * /api/verify serves as signed_payload, in the same form (legacy for
 * a pre-2026-07-30 record), so artifact_hash and existence.digest are
 * one value computed two ways rather than one value typed twice.
 */
export async function certificateAnchorDigest(
  record: CertificateRecord,
): Promise<{ digest: string; form: "current" | "legacy" }> {
  const form = await certificateSignatureForm(
    record.certificate,
    record.signature,
    record.public_key,
  );
  const payload =
    form === "legacy"
      ? canonicalizeCertificateLegacy(record.certificate)
      : canonicalizeCertificate(record.certificate);
  return { digest: await sha256Hex(payload), form: form === "legacy" ? "legacy" : "current" };
}

async function saveAnchor(
  env: Env,
  certId: string,
  record: CertificateRecord,
  anchor: CertificateAnchor,
): Promise<CertificateRecord> {
  const next: CertificateRecord = { ...record, anchor };
  await kvPut(env.PATRONS, KV_KEYS.cert(certId), JSON.stringify(next));
  if (anchor.ots.status === "complete") {
    await env.PATRONS.delete(KV_KEYS.certAnchorPending(certId));
  } else {
    await kvPut(env.PATRONS, KV_KEYS.certAnchorPending(certId), "1");
  }
  return next;
}

/**
 * Submit one certificate's digest. Idempotent: a record that already
 * carries an anchor is returned untouched, so a re-walked patron
 * number costs a read and nothing else.
 */
export async function anchorCertificate(
  env: Env,
  certId: string,
  options: CertificateAnchorOptions = {},
): Promise<CertificateRecord | null> {
  const record = await getCertificate(env, certId);
  if (!record) return null;
  if (record.anchor) return record;
  const { digest, form } = await certificateAnchorDigest(record);
  const ots = await submitDigestToOts(digest, options);
  return saveAnchor(env, certId, record, { digest, form, ots });
}

/**
 * Finish a completed proof: read the block height off it, and look the
 * block's time up as a courtesy. The height is the fact the proof
 * states; the time is a read from an explorer, named as such, and its
 * absence is not a failure of the anchor.
 */
async function bitcoinBoundOf(
  anchor: CertificateAnchor,
  options: CertificateAnchorOptions,
): Promise<CertificateAnchor["bitcoin"] | undefined> {
  if (anchor.ots.status !== "complete" || !anchor.ots.proof_base64) {
    return undefined;
  }
  let proof: Uint8Array;
  try {
    const raw = atob(anchor.ots.proof_base64);
    proof = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) proof[i] = raw.charCodeAt(i);
  } catch {
    return undefined;
  }
  const attestations = await findBitcoinAttestations(proof, anchor.digest);
  if (!attestations || attestations.length === 0) return undefined;
  const height = Math.min(...attestations.map((entry) => entry.block_height));
  const time = await lookupBlockTime(height, {
    fetch: options.fetch,
    ...(options.blockTime ?? {}),
  });
  return {
    block_height: height,
    ...(time
      ? {
          block_hash: time.block_hash,
          block_time: time.block_time,
          block_time_source: time.source,
        }
      : {}),
  };
}

export interface CertificateAnchorSweep {
  submitted: number;
  backfilled: number;
  resubmitted: number;
  upgraded: number;
  still_pending: number;
  /** Patron numbers the head cursor has not reached yet. Lag, named. */
  behind_head: number;
  /** Patron numbers the backfill has not reached yet. */
  behind_backfill: number;
  /**
   * TRUE when the open-work listing hit its cap. Not a fault: every
   * record listed here is moving toward a terminal state and leaves
   * the list when it gets there, so a truncated pass is a pass that
   * saw the first thousand and the next pass sees the rest. Reported
   * so a backlog that outgrows the sweep is a number, not a silence.
   */
  pending_truncated: boolean;
}

async function readCursor(env: Env): Promise<AnchorCursor | null> {
  return kvGetJson<AnchorCursor>(env.COUNTERS, KV_KEYS.certAnchorCursor, "json");
}

async function patronCounter(env: Env): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.patronNumber);
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Submit the certificate at one patron number. A number with no
 * patron record, or whose certificate is gone, is skipped and counted
 * as walked: the cursor must never stall on a hole (the patron
 * allocator can, under contention, let two receipts share a number,
 * and the losing one is unreachable from here — named on the
 * /attestation page rather than hidden by a stuck walk).
 */
async function submitAtPatron(
  env: Env,
  patronNumber: number,
  options: CertificateAnchorOptions,
): Promise<boolean> {
  const patron = await getPatron(env, patronNumber);
  if (!patron) return false;
  const before = await getCertificate(env, patron.cert_id);
  if (!before || before.anchor) return false;
  const after = await anchorCertificate(env, patron.cert_id, options);
  return after?.anchor !== undefined;
}

/**
 * One pass, bounded in every direction: new receipts forward from the
 * head, old ones backward on the backfill, then the open work —
 * resubmit what a down calendar refused, upgrade what Bitcoin has
 * since confirmed. Delivery, not monitoring (rule 23a): every record
 * touched here is moving toward a terminal state, and a completed one
 * is never read again.
 */
export async function sweepCertificateAnchors(
  env: Env,
  options: CertificateAnchorOptions = {},
): Promise<CertificateAnchorSweep> {
  const sweep: CertificateAnchorSweep = {
    submitted: 0,
    backfilled: 0,
    resubmitted: 0,
    upgraded: 0,
    still_pending: 0,
    behind_head: 0,
    behind_backfill: 0,
    pending_truncated: false,
  };
  const counter = await patronCounter(env);
  // First run: the head starts at the counter and the backfill starts
  // just above it, so nothing minted before today is skipped and
  // nothing is walked twice.
  const cursor: AnchorCursor = (await readCursor(env)) ?? {
    head: counter,
    backfill: counter + 1,
  };
  // A cursor that has walked to 0 on first run would mean an empty
  // store; a stored cursor at 0 means the backfill is finished.

  // Forward: the receipts minted since the last pass.
  let submissions = 0;
  while (cursor.head < counter && submissions < CERT_ANCHOR_SUBMISSIONS_PER_PASS) {
    cursor.head += 1;
    submissions += 1;
    if (await submitAtPatron(env, cursor.head, options)) sweep.submitted += 1;
  }
  sweep.behind_head = counter - cursor.head;

  // Backward: everything minted before the sweep existed.
  let backfills = 0;
  while (cursor.backfill > 1 && backfills < CERT_ANCHOR_BACKFILL_PER_PASS) {
    cursor.backfill -= 1;
    backfills += 1;
    if (await submitAtPatron(env, cursor.backfill, options)) sweep.backfilled += 1;
  }
  if (cursor.backfill <= 1) cursor.backfill = 0;
  sweep.behind_backfill = Math.max(0, cursor.backfill - 1);
  await kvPut(env.COUNTERS, KV_KEYS.certAnchorCursor, JSON.stringify(cursor));

  // The open work: whatever is not yet Bitcoin-confirmed.
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.certAnchorPendingPrefix,
    cap: PENDING_SCAN_CAP,
  });
  sweep.pending_truncated = listed.truncated;
  const certIds = listed.names.map((name) =>
    name.slice(KV_KEYS.certAnchorPendingPrefix.length),
  );
  const records = await bulkGetJson<CertificateRecord>(
    env.PATRONS,
    certIds.map((certId) => KV_KEYS.cert(certId)),
  );
  let work = 0;
  for (const certId of certIds) {
    if (work >= CERT_ANCHOR_UPGRADES_PER_PASS) break;
    const record = records.get(KV_KEYS.cert(certId));
    if (!record?.anchor) {
      // A marker with no anchored record behind it is a stale marker.
      await env.PATRONS.delete(KV_KEYS.certAnchorPending(certId));
      continue;
    }
    const anchor = record.anchor;
    if (anchor.ots.status === "complete") {
      await env.PATRONS.delete(KV_KEYS.certAnchorPending(certId));
      continue;
    }
    work += 1;
    if (anchor.ots.status === "failed") {
      const ots = await submitDigestToOts(anchor.digest, options);
      if (ots.status !== "failed") {
        sweep.resubmitted += 1;
        await saveAnchor(env, certId, record, { ...anchor, ots });
      }
      continue;
    }
    const upgraded = await upgradeDigestOts(anchor.digest, anchor.ots, options);
    if (!upgraded) {
      sweep.still_pending += 1;
      continue;
    }
    const next: CertificateAnchor = { ...anchor, ots: upgraded };
    const bitcoin = await bitcoinBoundOf(next, options);
    if (bitcoin) next.bitcoin = bitcoin;
    sweep.upgraded += 1;
    await saveAnchor(env, certId, record, next);
  }
  return sweep;
}

/**
 * THE VERDICT, for /api/verify. Five states, never collapsed:
 *
 *   none          — no anchor yet (minted since the last pass, or a
 *                   receipt the walk could not reach).
 *   pending       — submitted, no Bitcoin block yet.
 *   failed        — the calendars refused; the sweep will retry.
 *   bounded       — a block bounds existence; relation to the signing
 *                   key's window is stated in `key_window`.
 *
 * `key_window` is the part that answers the thread's question: with
 * a retired key, a bound inside the window is the proof; a bound
 * after retirement is UNPROVEN, not forged — backfill puts every
 * older receipt there, and the artifact alone cannot tell the two
 * apart. With the current key there is no retirement to fall after,
 * and the bound simply says by when the receipt existed.
 */
export interface ExistenceVerdict {
  status: "none" | "pending" | "failed" | "bounded";
  digest?: string;
  digest_matches_artifact_hash?: boolean;
  form?: "current" | "legacy";
  submitted_at?: string;
  calendar?: string;
  upgraded_at?: string;
  proof_base64?: string;
  error?: string;
  existed_by?: {
    block_height: number;
    block_hash?: string;
    block_time?: string;
    block_time_source?: string;
  };
  key_window:
    | "signed_while_current"
    | "bound_after_retirement"
    | "current_key"
    | "key_unrecognised"
    | "unbounded"
    | "block_time_unknown";
  verdict: string;
  means: string;
}

export interface ExistenceInput {
  /** artifact_hash as derived on the same response, for the comparison. */
  artifactHash: string;
  /** The signing key as the registry attributes it. */
  key:
    | { status: "current" }
    | { status: "retired"; retiredOn: string }
    | { status: "unrecognised" };
}

export function existenceVerdict(
  record: CertificateRecord,
  input: ExistenceInput,
): ExistenceVerdict {
  const anchor = record.anchor;
  const means = EXISTENCE_BOUND_MEANS;
  if (!anchor) {
    return {
      status: "none",
      key_window: "unbounded",
      verdict:
        "No existed-by bound yet: this certificate has not been submitted to OpenTimestamps (the hourly sweep has not reached it). The artifact's own date is a claim, not a bound — treat issue time as unproven.",
      means,
    };
  }
  const base = {
    digest: anchor.digest,
    digest_matches_artifact_hash:
      anchor.digest.toLowerCase() === input.artifactHash.toLowerCase(),
    form: anchor.form,
    ...(anchor.ots.submitted_at ? { submitted_at: anchor.ots.submitted_at } : {}),
    ...(anchor.ots.calendar ? { calendar: anchor.ots.calendar } : {}),
    ...(anchor.ots.upgraded_at ? { upgraded_at: anchor.ots.upgraded_at } : {}),
    ...(anchor.ots.proof_base64 ? { proof_base64: anchor.ots.proof_base64 } : {}),
    ...(anchor.ots.error ? { error: anchor.ots.error } : {}),
    means,
  };
  if (anchor.ots.status === "failed") {
    return {
      status: "failed",
      ...base,
      key_window: "unbounded",
      verdict:
        "The OpenTimestamps calendars refused this digest; the sweep retries hourly. Until a proof exists, issue time is unproven.",
    };
  }
  if (anchor.ots.status === "pending" || !anchor.bitcoin) {
    return {
      status: "pending",
      ...base,
      key_window: "unbounded",
      verdict:
        "Submitted to OpenTimestamps and not yet in a Bitcoin block (a proof upgrades an hour or two after submission). Until then, issue time is unproven.",
    };
  }
  const existedBy = anchor.bitcoin;
  const boundDay = existedBy.block_time?.slice(0, 10);
  if (input.key.status === "unrecognised") {
    return {
      status: "bounded",
      ...base,
      existed_by: existedBy,
      key_window: "key_unrecognised",
      verdict: `The signed bytes existed by Bitcoin block ${existedBy.block_height}${boundDay ? ` (mined ${boundDay}, per ${existedBy.block_time_source})` : ""}, but the signing key appears nowhere in this store's published key history, so there is no service window to place that bound against. Existence is bounded; attribution is not.`,
    };
  }
  if (input.key.status === "current") {
    return {
      status: "bounded",
      ...base,
      existed_by: existedBy,
      key_window: "current_key",
      verdict: `The signed bytes existed by Bitcoin block ${existedBy.block_height}${boundDay ? ` (mined ${boundDay}, per ${existedBy.block_time_source})` : ""}, and the signing key is still in service, so there is no retirement for the bound to fall after.`,
    };
  }
  const retiredOn = input.key.retiredOn;
  if (!boundDay) {
    return {
      status: "bounded",
      ...base,
      existed_by: existedBy,
      key_window: "block_time_unknown",
      verdict: `The signed bytes existed by Bitcoin block ${existedBy.block_height}. No explorer answered for that block's time, so this response cannot place the bound against the key's retirement on ${retiredOn}; map the height to a time with your own node and compare.`,
    };
  }
  if (boundDay <= retiredOn) {
    return {
      status: "bounded",
      ...base,
      existed_by: existedBy,
      key_window: "signed_while_current",
      verdict: `Signed while the key was current: the signed bytes existed by Bitcoin block ${existedBy.block_height} (mined ${boundDay}, per ${existedBy.block_time_source}), on or before the key's retirement on ${retiredOn}. A holder of the retired key could not have produced this after the fact.`,
    };
  }
  return {
    status: "bounded",
    ...base,
    existed_by: existedBy,
    key_window: "bound_after_retirement",
    verdict: `Signed by a key that was once current; issue time UNPROVEN. The earliest block bounding these bytes is ${existedBy.block_height} (mined ${boundDay}, per ${existedBy.block_time_source}), after the key retired on ${retiredOn}. This is the shape of every receipt anchored on backfill AND the shape a stolen retired key produces, and the artifact alone cannot tell them apart. The date on the certificate does not resolve it: it is the signer's claim.`,
  };
}
