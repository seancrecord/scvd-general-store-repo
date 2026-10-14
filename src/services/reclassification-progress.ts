import { inferChannel, INFRASTRUCTURE_UA_HINTS } from "@/lib/channel";
import { MACHINERY_CRAWLERS, USER_INITIATED_FETCHERS } from "@/lib/crawlers";
import { bulkGetJson } from "@/lib/kv-bulk";
import { invertedTimestamp } from "@/lib/kv-keys";
import { EVENT_TTL_SECONDS } from "@/lib/event-range";
import { kvGetJson, kvList, kvPut } from "@/lib/kv-retry";
import type { MetricEvent } from "@/lib/metrics";
import { WALK_MIN_ITEMS, WALK_WINDOW_MS, walkerKey } from "@/lib/walkers";
import type { Env } from "@/types";
import type { MonthCorrection, CorrectionSet } from "@/services/reclassify";

export const RECLASSIFICATION_STATE_KEY = "reclassification:progress:v1";
const STATE_BYTE_LIMIT = 4_000_000;
const RETENTION_MS = EVENT_TTL_SECONDS * 1000;
const REBUILD_MS = 7 * 86_400_000;
export const RECLASSIFICATION_BUDGET = { pageSize: 1000, maxPages: 10, settleMs: 120_000 };

// Each touch covers the windows ending in [at, at + WALK_WINDOW_MS].
// Unioning these intervals PER ITEM preserves the exact sliding-window
// rule, including out-of-order writes and a walk split across cron runs.
type Interval = [number, number];
interface Client { rows: number; walked: boolean; items: [string, Interval[]][] }
interface Month {
  rows: number;
  recorded: number;
  movers: [string, number][];
  clients: [string, Client][];
  unreadable: boolean;
}
interface Progress {
  revision: string;
  rebuiltAt: number;
  through: string | null;
  scan: { cursor?: string; lower: string; upper: string | null } | null;
  months: Record<string, Month>;
  unreadable: boolean;
}
export interface CorrectionOptions {
  pageSize?: number;
  maxPages?: number;
  settleMs?: number;
  /** Explicitly identifies a classifier change in deterministic tests. */
  revision?: string;
}

async function classifierRevision(): Promise<string> {
  // Tables changing must invalidate old aggregates automatically. Logic
  // changes belong in the version too; the weekly rebuild is a backstop
  // for late-visible KV rows, not permission to keep obsolete rules.
  const bytes = new TextEncoder().encode(JSON.stringify([
    "interval-walk-v1", INFRASTRUCTURE_UA_HINTS, MACHINERY_CRAWLERS,
    USER_INITIATED_FETCHERS, WALK_MIN_ITEMS, WALK_WINDOW_MS, EVENT_TTL_SECONDS,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function insertTouch(intervals: Interval[], at: number): Interval[] {
  const merged: Interval[] = [];
  let start = at;
  let end = at + WALK_WINDOW_MS;
  let inserted = false;
  for (const interval of intervals) {
    if (interval[1] < start) merged.push(interval);
    else if (interval[0] > end) {
      if (!inserted) { merged.push([start, end]); inserted = true; }
      merged.push(interval);
    } else {
      start = Math.min(start, interval[0]);
      end = Math.max(end, interval[1]);
    }
  }
  if (!inserted) merged.push([start, end]);
  return merged;
}

function isWalker(client: Client): boolean {
  const edges = client.items.flatMap(([, intervals]) => intervals.flatMap(([start, end]) =>
    [[start, 1], [end, -1]] as [number, number][],
  )).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let width = 0;
  for (const [, delta] of edges) {
    width += delta;
    if (width >= WALK_MIN_ITEMS) return true;
  }
  return false;
}

function addEvent(state: Progress, event: MetricEvent) {
  if (event.kind !== "challenge" || event.house) return;
  if (typeof event.at !== "string" || !Number.isFinite(Date.parse(event.at))) {
    state.unreadable = true;
    return;
  }
  const month = event.at.slice(0, 7);
  const bucket = state.months[month] ??= { rows: 0, recorded: 0, movers: [], clients: [], unreadable: false };
  bucket.rows++;
  if (event.channel === "infrastructure") return;
  bucket.recorded++;
  const ua = walkerKey(event);
  if (inferChannel({ userAgent: event.user_agent, referrer: event.referrer, declaredSource: event.declared_source }) === "infrastructure") {
    const movers = new Map(bucket.movers);
    movers.set(ua, (movers.get(ua) ?? 0) + 1);
    bucket.movers = [...movers];
    return;
  }
  const clients = new Map(bucket.clients);
  const client = clients.get(ua) ?? { rows: 0, walked: false, items: [] };
  client.rows++;
  if (!client.walked) {
    const items = new Map(client.items);
    items.set(event.item, insertTouch(items.get(event.item) ?? [], Date.parse(event.at)));
    client.items = [...items];
    if (isWalker(client)) { client.walked = true; client.items = []; }
  }
  clients.set(ua, client);
  bucket.clients = [...clients];
}

/** Selection is capped; attempted reads also count fallback/retry work. */
export async function advanceCorrections(env: Env, now: Date, options: CorrectionOptions = {}): Promise<CorrectionSet> {
  const pageSize = options.pageSize ?? RECLASSIFICATION_BUDGET.pageSize;
  const maxPages = options.maxPages ?? RECLASSIFICATION_BUDGET.maxPages;
  const settleMs = options.settleMs ?? RECLASSIFICATION_BUDGET.settleMs;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 200 || !Number.isFinite(settleMs) || settleMs < 0) {
    throw new Error("Invalid reclassification budget");
  }
  const nowMs = now.getTime();
  const revision = options.revision ?? await classifierRevision();
  let state = await kvGetJson<Progress>(env.COUNTERS, RECLASSIFICATION_STATE_KEY);
  if (!state || state.revision !== revision || (!state.scan && nowMs - state.rebuiltAt >= REBUILD_MS)) {
    state = { revision, rebuiltAt: nowMs, through: null, scan: null, months: {}, unreadable: false };
  }
  // Inverted keys sort newest first. Watermarks use the start of a
  // millisecond's key range; consecutive intervals do not overlap.
  // Late-visible rows behind a watermark return in the weekly rebuild.
  if (!state.scan) state.scan = { lower: `evt:${invertedTimestamp(nowMs - settleMs)}:`, upper: state.through };
  const scan = state.scan;
  let keysRead = 0;
  let readAttempts = 0;
  let pages = 0;
  for (; pages < maxPages; ) {
    const listed = await kvList(env.COUNTERS, { prefix: "evt:", limit: pageSize, ...(scan.cursor ? { cursor: scan.cursor } : {}) });
    pages++;
    const names = listed.keys.map(k => k.name).filter(name => name > scan.lower && (!scan.upper || name < scan.upper));
    keysRead += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names, count => { readAttempts += count; });
    for (const name of names) {
      const event = values.get(name);
      if (!event) state.unreadable = true;
      else addEvent(state, event);
    }
    if (listed.list_complete || listed.keys.some(k => scan.upper !== null && k.name >= scan.upper)) {
      state.through = scan.lower;
      state.scan = null;
      break;
    }
    if (!listed.cursor || listed.cursor === scan.cursor) throw new Error("Reclassification cursor did not advance");
    scan.cursor = listed.cursor;
  }

  const months: Record<string, MonthCorrection> = {};
  const cutoff = nowMs - RETENTION_MS;
  for (const [month, bucket] of Object.entries(state.months)) {
    const start = Date.parse(`${month}-01T00:00:00Z`);
    if (start < cutoff) {
      // Never retain per-client history past the event retention window,
      // or apply a partial retained month to the lifetime counter.
      delete state.months[month];
      months[month] = { month, recorded_organic: 0, corrected_organic: 0, moved_to_infrastructure: 0, movers: [], rows_read: 0, computed_at: now.toISOString(), complete: false };
      continue;
    }
    const byName = bucket.movers.reduce((sum, [, count]) => sum + count, 0);
    const walkers = bucket.clients.filter(([, client]) => client.walked).map(([ua, client]): [string, number] => [ua, client.rows]);
    const byBehaviour = walkers.reduce((sum, [, count]) => sum + count, 0);
    const top = (rows: [string, number][]) => rows.map(([user_agent, rows]) => ({ user_agent, rows })).sort((a, b) => b.rows - a.rows).slice(0, 10);
    months[month] = {
      month, recorded_organic: bucket.recorded, corrected_organic: bucket.recorded - byName - byBehaviour,
      moved_to_infrastructure: byName, movers: top(bucket.movers), moved_by_behaviour: byBehaviour,
      behaviour_movers: top(walkers), rows_read: bucket.rows, computed_at: now.toISOString(),
      complete: state.scan === null && !state.unreadable && !bucket.unreadable,
    };
  }
  const encoded = JSON.stringify(state);
  if (new TextEncoder().encode(encoded).byteLength > STATE_BYTE_LIMIT) throw new Error("Reclassification state budget exceeded; no checkpoint advanced");
  // Checkpoint and aggregates share one atomic KV value. If publication
  // fails afterwards, the next run republishes without double counting.
  await kvPut(env.COUNTERS, RECLASSIFICATION_STATE_KEY, encoded, { expirationTtl: EVENT_TTL_SECONDS });
  return {
    computed_at: now.toISOString(), months,
    progress: { keys_selected: keysRead, event_key_read_attempts: readAttempts, pages_read: pages, key_selection_budget: pageSize * maxPages, complete: state.scan === null && !state.unreadable, through_key: state.through, classifier_revision: revision, rebuilt_at: new Date(state.rebuiltAt).toISOString() },
  };
}
