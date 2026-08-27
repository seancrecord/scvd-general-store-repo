import { KV_KEYS } from "@/lib/kv-keys";
import type { OtsAnchor } from "@/services/anchor-log";
import { sha256Hex } from "@/services/anchor-log";
import {
  submitDigestToOts,
  upgradeDigestOts,
  type SubmitOptions,
} from "@/services/anchor-submit";
import { getReport, reportIds } from "@/services/reports";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * REPORT ANCHORS — the ecosystem reports' Bitcoin timestamps, riding
 * the same OTS machinery as the key chain and the patron anchors.
 *
 * WHAT GETS ANCHORED: the sha256 of the report's markdown BODY — the
 * same body_sha256 the signed artifact already publishes. The body,
 * not the whole signed payload, on purpose: the payload carries this
 * anchor's own status line, so anchoring it would chase its own tail
 * (every status change would orphan the proof it describes). The body
 * is the claim; the body is what gets timestamped.
 *
 * WHAT IT BUYS: the signature proves the STORE said this; the anchor
 * proves the store said it BY a Bitcoin block — a commitment that
 * cannot be backdated after a correction would have become tempting.
 * A report that turns out wrong stays provably wrong-as-published,
 * which is the property a neutral observer's reports need most.
 *
 * NO CHAIN, one record per report, patron-anchor shape: reports are
 * few and independent, and coupling their proofs to each other or to
 * the key log would add bookkeeping, not evidence. Same three rules
 * as every anchor here: never on the money path (cron work), the
 * record survives every calendar failure, and the digest is
 * recomputable by any stranger holding the served body.
 *
 * ONE KV KEY FOR THE WHOLE SHELF (the population register's law): the
 * report list is compiled in and will number a handful ever, so the
 * sweep reads the map once, decides per report in memory, and writes
 * once — a key per report would be a write loop bought for nothing.
 */

export interface ReportAnchorRecord {
  report_id: string;
  /** sha256 of the report's markdown body, hex — the served body_sha256. */
  digest: string;
  created_at: string;
  ots: OtsAnchor;
}

type ReportAnchorMap = Record<string, ReportAnchorRecord>;

async function readAnchorMap(env: Env): Promise<ReportAnchorMap> {
  return (
    (await kvGetJson<ReportAnchorMap>(env.COUNTERS, KV_KEYS.reportAnchors, "json")) ??
    {}
  );
}

export async function getReportAnchor(
  env: Env,
  reportId: string,
): Promise<ReportAnchorRecord | null> {
  return (await readAnchorMap(env))[reportId] ?? null;
}

export interface ReportAnchorSweep {
  submitted: number;
  upgraded: number;
  still_pending: number;
}

/**
 * One pass over every published report: submit what has no proof yet
 * (or whose last submission failed), upgrade what is pending, touch
 * nothing complete. The report list is compiled in, so the sweep is
 * bounded by the shelf, not by a scan — and the map is read once and
 * written once, only if something changed.
 */
export async function sweepReportAnchors(
  env: Env,
  options: SubmitOptions = {},
): Promise<ReportAnchorSweep> {
  const sweep: ReportAnchorSweep = {
    submitted: 0,
    upgraded: 0,
    still_pending: 0,
  };
  const anchors = await readAnchorMap(env);
  let changed = false;
  for (const reportId of reportIds()) {
    const report = getReport(reportId);
    if (!report) continue;
    const existing = anchors[reportId];
    const digest = await sha256Hex(report.body);

    // A body edit after anchoring is a NEW claim: the old proof stays
    // true of the old bytes, and the edited body starts unanchored —
    // recorded by resubmitting under the current digest rather than
    // serving a proof of bytes no longer served.
    if (!existing || existing.digest !== digest || existing.ots.status === "failed") {
      const ots = await submitDigestToOts(digest, options);
      anchors[reportId] = {
        report_id: reportId,
        digest,
        created_at:
          existing?.digest === digest
            ? existing.created_at
            : (options.now ?? new Date()).toISOString(),
        ots,
      };
      changed = true;
      if (ots.status === "pending") sweep.submitted += 1;
      continue;
    }

    if (existing.ots.status === "pending") {
      const upgraded = await upgradeDigestOts(digest, existing.ots, options);
      if (upgraded) {
        sweep.upgraded += 1;
        anchors[reportId] = { ...existing, ots: upgraded };
        changed = true;
      } else {
        sweep.still_pending += 1;
      }
    }
  }
  if (changed) {
    await kvPut(env.COUNTERS, KV_KEYS.reportAnchors, JSON.stringify(anchors));
  }
  return sweep;
}

/**
 * The anchor as the served artifact states it — status plus proof plus
 * exactly what the proof does and does not establish, because a proof
 * served without its limits is a ritual (the verifier README's rule).
 */
export async function reportAnchorForArtifact(
  env: Env,
  reportId: string,
): Promise<Record<string, unknown>> {
  const record = await getReportAnchor(env, reportId);
  if (!record) {
    return {
      status: "not_yet_submitted",
      note: "The next hourly pass submits this report's body_sha256 to OpenTimestamps; the signature above already fixes the bytes it will anchor.",
    };
  }
  return {
    status: record.ots.status,
    digest_anchored: record.digest,
    digest_is: "sha256 of body_markdown — the body_sha256 field above, recomputable by anyone holding the body",
    ...(record.ots.proof_base64
      ? { proof_base64: record.ots.proof_base64 }
      : {}),
    ...(record.ots.submitted_at
      ? { submitted_at: record.ots.submitted_at }
      : {}),
    ...(record.ots.upgraded_at ? { upgraded_at: record.ots.upgraded_at } : {}),
    ...(record.ots.calendar ? { calendar: record.ots.calendar } : {}),
    ...(record.ots.error ? { error: record.ots.error } : {}),
    how_to_verify:
      "Base64-decode proof_base64 into a .ots file and run `ots verify` (the standard OpenTimestamps client) against the digest. `pending` is a calendar's promise, usually Bitcoin-confirmed within a couple of hours; `complete` means the calendar returned an upgraded proof when we asked — we do not parse OTS proofs, so run the check yourself: that is the fact, this is our bookkeeping.",
    what_it_proves:
      "That this exact body existed by the Bitcoin block the proof names — the report cannot be quietly rewritten after the fact. It does not make the report's claims true; the committed raw evidence is what settles those.",
  };
}
