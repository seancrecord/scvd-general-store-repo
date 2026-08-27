import { inferChannel } from "@/lib/channel";
import { bulkGetJson } from "@/lib/kv-bulk";
import type { MetricEvent, MetricEventKind } from "@/lib/metrics";
import type { Channel, Env } from "@/types";
import { kvList } from "@/lib/kv-retry";

/**
 * THE RECOUNT: the books, audited against themselves.
 *
 * Every counter in the store is a read-modify-write against KV, which
 * loses increments under concurrent traffic and can read stale. The
 * raw event rows have no such problem: one row per event, unique key,
 * no contention. So the rows are the appeal court, and this is the
 * appeal.
 *
 * Two questions it answers, both of which the aggregates cannot:
 *
 *   1. HOW DIRTY IS THE ORGANIC COLUMN? Each row carries the
 *      user-agent and referrer it arrived with, so the CURRENT
 *      crawler table can be applied to OLD rows. Channel inference is
 *      baked in at write time and never revisited; here it is
 *      revisited. A row stored as organic that today's table calls
 *      infrastructure is a row the headline number got wrong.
 *   2. DOES THE ROW COUNT MATCH THE COUNTER? Rows above counter means
 *      lost increments (the expected direction). Counter above rows
 *      means something wrote a counter without a row, which would be
 *      a bug worth finding.
 *
 * Bounded by design: KV listing and bulk reads cost subrequests, so
 * the scan stops at a cap and reports how far back it actually got.
 * A recount that covers four days honestly beats a month that times
 * out.
 */

const SCAN_CAP = 3000;
const LIST_PAGE = 1000;

export interface RecountBucket {
  organic: number;
  house: number;
  infrastructure: number;
}

export interface RecountResult {
  /** Rows actually read. The window below is what they cover. */
  rows_scanned: number;
  /** True when the scan hit its cap before running out of rows. */
  capped: boolean;
  oldest_row?: string;
  newest_row?: string;
  by_kind: Record<string, number>;
  /** Challenge rows as the books counted them, from the stored channel. */
  as_recorded: RecountBucket;
  /** Challenge rows as today's classifier reads them. */
  as_reclassified: RecountBucket;
  /**
   * Rows stored as organic that today's table calls infrastructure:
   * the correction, and the number that says how much of the headline
   * was machinery.
   */
  reclassified_organic_to_infrastructure: number;
  /** The user-agents behind that correction, commonest first. */
  movers: { user_agent: string; rows: number }[];
  /** Settle rows, which are the ground truth money moved. */
  settles: RecountBucket;
}

function bucketOf(event: MetricEvent, channel: Channel): keyof RecountBucket {
  if (event.house) {
    return "house";
  }
  if (channel === "infrastructure") {
    return "infrastructure";
  }
  return "organic";
}

function emptyBucket(): RecountBucket {
  return { organic: 0, house: 0, infrastructure: 0 };
}

/**
 * Walks the raw rows newest-first and recomputes. Settles never
 * bucket as infrastructure (a crawler that pays is a customer), the
 * same rule the counters use, so the two are comparable.
 */
export async function recountFromRows(
  env: Env,
  scanCap = SCAN_CAP,
): Promise<RecountResult> {
  const result: RecountResult = {
    rows_scanned: 0,
    capped: false,
    by_kind: {},
    as_recorded: emptyBucket(),
    as_reclassified: emptyBucket(),
    reclassified_organic_to_infrastructure: 0,
    movers: [],
    settles: emptyBucket(),
  };
  const moverCounts = new Map<string, number>();

  let cursor: string | undefined;
  while (result.rows_scanned < scanCap) {
    const listed = await kvList(env.COUNTERS, {
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (result.rows_scanned >= scanCap) {
        result.capped = true;
        break;
      }
      const event = values.get(name);
      if (!event) {
        continue;
      }
      result.rows_scanned += 1;
      const kind: MetricEventKind = event.kind;
      result.by_kind[kind] = (result.by_kind[kind] ?? 0) + 1;
      // Keys sort newest-first, so the last row seen is the oldest.
      result.newest_row ??= event.at;
      result.oldest_row = event.at;

      if (kind === "settle") {
        const stored = event.house ? "house" : "organic";
        result.settles[stored] += 1;
        continue;
      }
      if (kind !== "challenge") {
        continue;
      }
      const recorded = bucketOf(event, event.channel);
      const today = inferChannel({
        userAgent: event.user_agent,
        referrer: event.referrer,
        declaredSource: event.declared_source,
      });
      const reclassified = bucketOf(event, today);
      result.as_recorded[recorded] += 1;
      result.as_reclassified[reclassified] += 1;
      if (recorded === "organic" && reclassified === "infrastructure") {
        result.reclassified_organic_to_infrastructure += 1;
        const ua = event.user_agent ?? "(no user-agent)";
        moverCounts.set(ua, (moverCounts.get(ua) ?? 0) + 1);
      }
    }
    if (listed.list_complete || result.rows_scanned >= scanCap) {
      result.capped = result.capped || !listed.list_complete;
      break;
    }
    cursor = listed.cursor;
  }

  result.movers = [...moverCounts.entries()]
    .map(([user_agent, rows]) => ({ user_agent, rows }))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 10);

  return result;
}
