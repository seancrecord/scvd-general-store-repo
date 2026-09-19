import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { Env } from "@/types";

/**
 * THE ONE WATCH SWEEP, shared by every bounded watch the store sells.
 *
 * WHY IT IS ONE FUNCTION, and the reason is the audit rather than
 * taste: the conformance watch shipped with a sweep that was the
 * standing watch's sweep with three constants changed, and the
 * scalability audit flagged both — two per-record writes inside two
 * loops, in code whose control flow was identical line for line. The
 * first answer was to raise the audit's budget by one and write an
 * argument for it, which is the answer the budget exists to make
 * expensive. The keeper's ruling (2026-08-07) was the right one: the
 * finding was not "this loop is fine," it was "this loop exists
 * twice." One loop, one warning, and the duplication goes with it.
 *
 * WHAT STAYS PER-RECORD, deliberately: the write. Every sweep reads
 * the whole shelf in one bulk call and then writes ONLY the records
 * that earned an entry this tick — a doubled cron tick must not
 * double-bill anyone's day, and an ended watch must be left exactly
 * as it finished. KV has no bulk write, and a blind write-back of
 * every record would be both slower and a way to lose a concurrent
 * update. That is the per-record decision the audit's rule exempts,
 * and now the store makes it in exactly one place.
 */

type Namespace = Env["ORDERS"];

export interface WatchSweepOptions<
  T extends { ends_at: string },
  E extends { at: string },
> {
  kv: Namespace;
  prefix: string;
  /** Named cap on the scan — kv-list's law: an unnamed cap is silent. */
  scanCap: number;
  /** Floor between entries, so a doubled tick cannot double-bill. */
  minSpacingMs: number;
  /**
   * Records worked per sweep at most (2026-09-02, the operator's
   * statement): a shelf that outgrows one tick's share of the
   * invocation budget drops the rest to the next tick rather than
   * exhausting the budget the reconciliation walk shares. Unset means
   * every due record, which is what the watches have always done.
   */
  budget?: number;
  /** The record's live entry array; the sweep appends to it. */
  entriesOf: (record: T) => E[];
  /** One observation for this record, already signed by its caller. */
  observe: (record: T) => Promise<E>;
  /** A durable publisher merges concurrent progress for recoverable watches. */
  publish?: (record: T) => Promise<void>;
  now?: number;
}

/**
 * WHAT ONE PASS SAW, NOT ONLY WHAT IT DID (2026-09-19, rule 52). The
 * sweep returned one number, `worked`, and the cron threw it away —
 * so a pass that observed nothing because nothing was due, one whose
 * shelf listing hit its cap, one whose every record was unreadable
 * and one that ran out of budget all read the same from outside, and
 * only a throw ever alerted. Three paid term services ride this sweep;
 * a skipped day on any of them becomes a days_unchecked row in a
 * customer's history, our gap on their record. The count stays as
 * `worked`; the rest is what the ward heartbeat already says about the
 * free round and the paid watches never had.
 */
export interface WatchSweepReport {
  /** Records observed and written this pass. */
  worked: number;
  /** Keys the shelf walk returned. */
  listed: number;
  /** The walk hit scanCap: `listed` is a page, not the shelf (our gap). */
  truncated: boolean;
  /** Keys whose record could not be read as one: skipped, not worked (our gap). */
  unreadable: number;
  /** Records past ends_at: finished watches, left as they finished. */
  ended: number;
  /** Records observed too recently under minSpacingMs: the normal case between ticks. */
  spaced: number;
  /** The budget was spent with due records still unread; they wait for the next tick. */
  budget_stopped: boolean;
}

/**
 * One pass over the shelf: bulk-read the lot, skip what has ended,
 * skip what was observed too recently, observe the rest, and write
 * back only those. Returns what it worked and what it could not see.
 */
export async function sweepWatches<
  T extends { ends_at: string },
  E extends { at: string },
>(options: WatchSweepOptions<T, E>): Promise<WatchSweepReport> {
  const listed = await listKeys(options.kv, {
    prefix: options.prefix,
    cap: options.scanCap,
  });
  const rows = await bulkGetJson<T>(options.kv, listed.names);
  const now = options.now ?? Date.now();
  const report: WatchSweepReport = {
    worked: 0, listed: listed.names.length, truncated: listed.truncated,
    unreadable: 0, ended: 0, spaced: 0, budget_stopped: false,
  };
  for (const name of listed.names) {
    if (options.budget !== undefined && report.worked >= options.budget) {
      report.budget_stopped = true;
      break;
    }
    const record = rows.get(name) ?? null;
    if (!record) {
      // Not ended, not spaced: a key the shelf lists and the read could
      // not turn into a record. Counted on its own line so it can never
      // hide behind "nothing was due".
      report.unreadable += 1;
      continue;
    }
    if (now > Date.parse(record.ends_at)) {
      report.ended += 1;
      continue;
    }
    const entries = options.entriesOf(record);
    const last = entries[entries.length - 1];
    if (last && now - Date.parse(last.at) < options.minSpacingMs) {
      report.spaced += 1;
      continue;
    }
    entries.push(await options.observe(record));
    if (options.publish) await options.publish(record);
    else await options.kv.put(name, JSON.stringify(record));
    report.worked += 1;
  }
  return report;
}

/**
 * The gaps a pass must not keep to itself, as the alert the cron
 * sends — or null when the pass saw the whole shelf. A truncated walk
 * and an unreadable record are the store's gaps and page; a spent
 * budget and a spacing skip are the design working and do not. The
 * key dedupes by kind and gap, the way the ward heartbeat's does, so
 * a standing fault is one notice rather than one an hour.
 */
export function watchSweepGaps(
  kind: string,
  report: WatchSweepReport,
): { key: string; detail: string } | null {
  const gaps: string[] = [];
  if (report.truncated) gaps.push(`the shelf walk hit its cap at ${report.listed} keys, so records past it were never read`);
  if (report.unreadable > 0) gaps.push(`${report.unreadable} of ${report.listed} listed records could not be read and were skipped`);
  if (gaps.length === 0) return null;
  return {
    key: `watch-sweep-${kind}-${report.truncated ? "truncated" : ""}${report.unreadable > 0 ? "unreadable" : ""}`,
    detail: `The ${kind} sweep could not see its whole shelf: ${gaps.join("; ")}. ${report.worked} worked, ${report.ended} ended, ${report.spaced} not yet due. A watch this pass never read gets no entry today, and that becomes a days_unchecked row on a customer's history.`,
  };
}
