import { saveAnchor, type AnchorRecord } from "@/services/anchor-log";
import type { Env } from "@/types";

/**
 * SUBMITTING AN ANCHOR TO OPENTIMESTAMPS — the outside half, kept in
 * its own file because it is the half that can fail and must never
 * take anything with it.
 *
 * OpenTimestamps aggregates a submitted hash into a Merkle tree and
 * commits the root into a Bitcoin transaction. What comes back
 * immediately is a PENDING proof: the calendar's promise to include
 * it. Roughly an hour or two later, once the transaction confirms,
 * the proof can be UPGRADED to one that stands on its own — verifiable
 * against Bitcoin headers alone, with no calendar, no OpenTimestamps
 * infrastructure, and no us. That upgraded proof is the whole point:
 * it is a commitment we could not have made after the fact and cannot
 * withdraw.
 *
 * THE PROOF BYTES ARE OPAQUE TO US ON PURPOSE. We store what the
 * calendar returns and publish it; we do not parse it. Writing our own
 * OTS parser would add a second implementation to be wrong, and the
 * verification anyone actually trusts is done with the standard `ots`
 * tool against Bitcoin, not with our reading of our own evidence.
 *
 * EVERY FUNCTION HERE FAILS SOFT. A calendar being down records an
 * error on the entry and returns; it never throws into the cron and
 * never touches the chain. The chain is ours and already stored by the
 * time any of this runs.
 */

/** Public OTS calendars, tried in order. Redundancy is the point. */
export const OTS_CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://alice.btc.calendar.opentimestamps.org",
] as const;

export interface SubmitOptions {
  fetch?: typeof fetch;
  calendars?: readonly string[];
  now?: Date;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Submit one digest to the calendars, first success wins.
 *
 * Returns the record with its `ots` field filled in either way — a
 * failure is a recorded state, not a thrown one, because the next run
 * needs to know this entry still wants a stamp.
 */
export async function submitToOts(
  env: Env,
  record: AnchorRecord,
  options: SubmitOptions = {},
): Promise<AnchorRecord> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const calendars = options.calendars ?? OTS_CALENDARS;
  const now = options.now ?? new Date();
  const digestBytes = hexToBytes(record.digest);
  if (!digestBytes || digestBytes.length !== 32) {
    const failed: AnchorRecord = {
      ...record,
      ots: {
        status: "failed",
        submitted_at: now.toISOString(),
        error: `digest is not 32 bytes of hex (${record.digest.length} chars)`,
      },
    };
    await saveAnchor(env, failed);
    return failed;
  }

  const errors: string[] = [];
  for (const calendar of calendars) {
    try {
      const response = await fetchImpl(`${calendar}/digest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/vnd.opentimestamps.v1",
        },
        body: digestBytes,
      });
      if (!response.ok) {
        errors.push(`${calendar}: HTTP ${response.status}`);
        continue;
      }
      const proof = new Uint8Array(await response.arrayBuffer());
      if (proof.length === 0) {
        errors.push(`${calendar}: empty proof`);
        continue;
      }
      const stamped: AnchorRecord = {
        ...record,
        ots: {
          // PENDING, not complete: the calendar has accepted it, and
          // Bitcoin has not confirmed it yet. Saying "complete" here
          // would be the overclaim this whole log exists to avoid.
          status: "pending",
          submitted_at: now.toISOString(),
          proof_base64: toBase64(proof),
          calendar,
        },
      };
      await saveAnchor(env, stamped);
      return stamped;
    } catch (error) {
      errors.push(`${calendar}: ${String(error)}`);
    }
  }

  const failed: AnchorRecord = {
    ...record,
    ots: {
      status: "failed",
      submitted_at: now.toISOString(),
      error: errors.join("; ") || "no calendars configured",
    },
  };
  await saveAnchor(env, failed);
  return failed;
}

/**
 * Try to upgrade a pending proof to a Bitcoin-confirmed one.
 *
 * A 404 is the NORMAL answer for the first hour or two and is not an
 * error — it means "not confirmed yet, ask again later". Treating it
 * as a failure would turn the ordinary case into noise and teach the
 * keeper to ignore this log, which is how a canary dies.
 */
export async function upgradeOtsProof(
  env: Env,
  record: AnchorRecord,
  options: SubmitOptions = {},
): Promise<AnchorRecord> {
  if (record.ots?.status !== "pending") return record;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? new Date();
  const calendar = record.ots.calendar ?? OTS_CALENDARS[0];
  try {
    const response = await fetchImpl(
      `${calendar}/timestamp/${record.digest}`,
      { headers: { Accept: "application/vnd.opentimestamps.v1" } },
    );
    if (response.status === 404) {
      // Still waiting on a Bitcoin block. Unchanged, not failed.
      return record;
    }
    if (!response.ok) {
      return record;
    }
    const proof = new Uint8Array(await response.arrayBuffer());
    if (proof.length === 0) return record;
    const upgraded: AnchorRecord = {
      ...record,
      ots: {
        ...record.ots,
        status: "complete",
        proof_base64: toBase64(proof),
        upgraded_at: now.toISOString(),
      },
    };
    await saveAnchor(env, upgraded);
    return upgraded;
  } catch {
    // Network trouble is a nothing-happened, not a state change.
    return record;
  }
}

/**
 * One cron pass: stamp anything unstamped, then try to upgrade
 * anything pending. Bounded on purpose — a run that tried to catch up
 * on a hundred entries would be the slow kind of thorough that
 * eventually times out and stops running at all.
 */
export const MAX_SUBMISSIONS_PER_RUN = 5;
export const MAX_UPGRADES_PER_RUN = 10;

export interface AnchorRunSummary {
  submitted: number;
  upgraded: number;
  failed: number;
  pending_after: number;
}

export async function runAnchorSubmissions(
  env: Env,
  records: AnchorRecord[],
  options: SubmitOptions = {},
): Promise<AnchorRunSummary> {
  const summary: AnchorRunSummary = {
    submitted: 0,
    upgraded: 0,
    failed: 0,
    pending_after: 0,
  };

  // Newest first: a fresh digest commits to everything behind it, so
  // if only one stamp gets through today it should be the one that
  // covers the most history.
  const unstamped = records
    .filter((record) => !record.ots || record.ots.status === "failed")
    .reverse()
    .slice(0, MAX_SUBMISSIONS_PER_RUN);
  for (const record of unstamped) {
    const result = await submitToOts(env, record, options);
    if (result.ots?.status === "pending") summary.submitted += 1;
    else summary.failed += 1;
  }

  const pending = records
    .filter((record) => record.ots?.status === "pending")
    .slice(0, MAX_UPGRADES_PER_RUN);
  for (const record of pending) {
    const result = await upgradeOtsProof(env, record, options);
    if (result.ots?.status === "complete") summary.upgraded += 1;
    else summary.pending_after += 1;
  }

  return summary;
}

/** A new anchor at most once a day; upgrades attempted every run. */
export const ANCHOR_INTERVAL_HOURS = 24;

/**
 * The whole cron pass, rate-limited by the log's own contents rather
 * than by a second cron trigger.
 *
 * WHY THE HOURLY CRON AND NOT A DAILY ONE: upgrading is the time-
 * sensitive half (a proof becomes Bitcoin-backed an hour or two after
 * submission, and until it does the anchor proves less than it will),
 * while appending only needs to happen daily. Reading the interval off
 * the last entry means the schedule is a fact in the log rather than a
 * number in a config file that could drift from what the log shows.
 */
export async function runAnchorCron(
  env: Env,
  records: AnchorRecord[],
  appendFn: () => Promise<AnchorRecord>,
  options: SubmitOptions = {},
): Promise<AnchorRunSummary & { appended: boolean }> {
  const now = options.now ?? new Date();
  const newest = records[records.length - 1];
  /**
   * FAIL TOWARD APPENDING, NOT AWAY FROM IT.
   *
   * An unparseable taken_at makes this comparison NaN, and NaN >= x is
   * false — which would read as "not due yet" and stop the chain
   * FOREVER, silently, from one bad timestamp. A log that quietly
   * stopped growing while still serving looks exactly like a log that
   * is up to date, which is the worst failure this file could have.
   * So an unreadable date is treated as due: the cost of being wrong
   * that way is one extra entry.
   */
  const lastTaken = newest ? new Date(newest.snapshot.taken_at).getTime() : NaN;
  const dueForNew =
    !newest ||
    !Number.isFinite(lastTaken) ||
    now.getTime() - lastTaken >= ANCHOR_INTERVAL_HOURS * 3600 * 1000;

  let working = records;
  let appended = false;
  if (dueForNew) {
    const fresh = await appendFn();
    working = [...records, fresh];
    appended = true;
  }

  const summary = await runAnchorSubmissions(env, working, options);
  return { ...summary, appended };
}
