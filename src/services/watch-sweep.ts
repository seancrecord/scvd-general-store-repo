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
  /** The record's live entry array; the sweep appends to it. */
  entriesOf: (record: T) => E[];
  /** One observation for this record, already signed by its caller. */
  observe: (record: T) => Promise<E>;
  now?: number;
}

/**
 * One pass over the shelf: bulk-read the lot, skip what has ended,
 * skip what was observed too recently, observe the rest, and write
 * back only those. Returns how many records were actually worked.
 */
export async function sweepWatches<
  T extends { ends_at: string },
  E extends { at: string },
>(options: WatchSweepOptions<T, E>): Promise<number> {
  const listed = await listKeys(options.kv, {
    prefix: options.prefix,
    cap: options.scanCap,
  });
  const rows = await bulkGetJson<T>(options.kv, listed.names);
  const now = options.now ?? Date.now();
  let worked = 0;
  for (const name of listed.names) {
    const record = rows.get(name) ?? null;
    if (!record || now > Date.parse(record.ends_at)) {
      continue;
    }
    const entries = options.entriesOf(record);
    const last = entries[entries.length - 1];
    if (last && now - Date.parse(last.at) < options.minSpacingMs) {
      continue;
    }
    entries.push(await options.observe(record));
    await options.kv.put(name, JSON.stringify(record));
    worked += 1;
  }
  return worked;
}
