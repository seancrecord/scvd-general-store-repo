import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newEntryId } from "@/lib/ids";
import type { OtsAnchor } from "@/services/anchor-log";
import {
  submitDigestToOts,
  upgradeDigestOts,
} from "@/services/anchor-submit";
import type { SubmitOptions } from "@/services/anchor-submit";
import type { Env } from "@/types";

/**
 * PATRON ANCHORS — the store's own Bitcoin-anchoring machinery, sold
 * (marketplace item two; the keeper's order of operations).
 *
 * A buyer hands us a sha256 digest and a dollar; we submit the digest
 * to OpenTimestamps and serve the proof at a stable URL forever. The
 * observation is the product, and it is deliberately the SMALLEST
 * possible one: we never see the bytes behind the digest, we store
 * the buyer's label as an untrusted claim, and what the proof
 * establishes is exactly what OTS establishes — the digest existed by
 * a Bitcoin block height — nothing about what it is a digest OF,
 * which stays between the buyer and their own records.
 *
 * NO CHAIN OF OURS, on purpose. The corpus and the key log are OUR
 * histories, where the linkage proves WE didn't rewrite. A patron's
 * anchor is an independent fact about a stranger's digest; chaining
 * strangers together would couple their proofs to our bookkeeping
 * and add nothing a Bitcoin-confirmed OTS proof doesn't already
 * carry alone. Each record stands by itself: the certificate binds
 * the digest (the same `attests` field the attestations use), the
 * OTS proof binds the time.
 *
 * THE UPGRADE PASS IS DELIVERY, NOT MONITORING (rule 23a): an OTS
 * proof is born "pending" and becomes Bitcoin-confirmed an hour or
 * two later when the calendar's transaction confirms. Finishing that
 * upgrade is completing the thing the dollar bought — bounded work
 * that ends in a terminal state — and the sweep that does it is
 * capped per pass and touches only records that still want it.
 */

export interface PatronAnchorRecord {
  anchor_id: string;
  /** The buyer's digest, verbatim, lowercased hex. Opaque to us. */
  digest: string;
  /** The buyer's claim about what the digest covers. UNTRUSTED. */
  label?: string;
  cert_id: string;
  created_at: string;
  ots: OtsAnchor;
}

/** Ceiling on a patron-anchor scan. An unnamed cap is a silent one. */
const PATRON_ANCHOR_SCAN_CAP = 1000;
/** Sweep work per pass, same discipline as the key chain's cron. */
const MAX_SWEEP_WORK = 10;

export async function createPatronAnchor(
  env: Env,
  input: { digest: string; label?: string; certId: string },
  options: SubmitOptions = {},
): Promise<PatronAnchorRecord> {
  const record: PatronAnchorRecord = {
    anchor_id: `banchor_${newEntryId()}`,
    digest: input.digest.toLowerCase(),
    ...(input.label ? { label: input.label } : {}),
    cert_id: input.certId,
    created_at: (options.now ?? new Date()).toISOString(),
    // Submitted inline so the ordinary buyer leaves with a pending
    // proof in hand; a calendar outage records "failed" and the sweep
    // retries — the purchase is complete either way, and the record
    // says exactly which state it is in.
    ots: await submitDigestToOts(input.digest.toLowerCase(), options),
  };
  await env.PATRONS.put(
    KV_KEYS.patronAnchor(record.anchor_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getPatronAnchor(
  env: Env,
  anchorId: string,
): Promise<PatronAnchorRecord | null> {
  return env.PATRONS.get<PatronAnchorRecord>(
    KV_KEYS.patronAnchor(anchorId),
    "json",
  );
}

export interface PatronAnchorSweep {
  resubmitted: number;
  upgraded: number;
  still_pending: number;
}

/**
 * One pass: resubmit what failed, upgrade what's pending, touch
 * nothing terminal. Bounded per pass — a backlog is worked off across
 * hours rather than in one heroic run that times out and does nothing.
 */
export async function sweepPatronAnchors(
  env: Env,
  options: SubmitOptions = {},
): Promise<PatronAnchorSweep> {
  const listed = await listKeys(env.PATRONS, {
    prefix: KV_KEYS.patronAnchorPrefix,
    cap: PATRON_ANCHOR_SCAN_CAP,
  });
  const values = await bulkGetJson<PatronAnchorRecord>(
    env.PATRONS,
    listed.names,
  );
  const sweep: PatronAnchorSweep = {
    resubmitted: 0,
    upgraded: 0,
    still_pending: 0,
  };
  let work = 0;
  for (const record of values.values()) {
    if (!record || work >= MAX_SWEEP_WORK) {
      continue;
    }
    if (record.ots.status === "failed") {
      work += 1;
      const ots = await submitDigestToOts(record.digest, options);
      if (ots.status !== "failed") {
        sweep.resubmitted += 1;
        await env.PATRONS.put(
          KV_KEYS.patronAnchor(record.anchor_id),
          JSON.stringify({ ...record, ots }),
        );
      }
    } else if (record.ots.status === "pending") {
      work += 1;
      const upgraded = await upgradeDigestOts(
        record.digest,
        record.ots,
        options,
      );
      if (upgraded) {
        sweep.upgraded += 1;
        await env.PATRONS.put(
          KV_KEYS.patronAnchor(record.anchor_id),
          JSON.stringify({ ...record, ots: upgraded }),
        );
      } else {
        sweep.still_pending += 1;
      }
    }
  }
  return sweep;
}
