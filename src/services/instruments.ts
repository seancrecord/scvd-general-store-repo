import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGetJson, kvList, kvPut } from "@/lib/kv-retry";
import type { MetricEvent } from "@/lib/metrics";
import type { Observatory, SurfaceCount } from "@/services/observatory";
import type { Env } from "@/types";

/**
 * THE FREE INSTRUMENTS, USED (2026-09-04). The one real signal in the
 * September porch was not on any paid door: preflight_endpoint called
 * 45 times, check_before_you_pay 24, look_at_door 22 — tools called
 * with arguments, which crawlers do not do — against 22 paid attempts.
 * Agents use this store to check a door before paying it. That is the
 * demand, and the observatory already counts it; it just counts it in
 * a list of 130 surfaces. This is the same numbers, sorted into free
 * and paid, so the ratio is a line and not a search.
 *
 * MADE ACTIONABLE (2026-09-05), after the first reading of the page.
 * Four things the raw sort could not say, each now a column or a line:
 *
 *  1. WHICH USES CARRY AN ARGUMENT. A corpus page can be crawled; a
 *     preflight cannot be called without a URL. Every roster entry is
 *     typed "argument" or "read", and the month's headline is the
 *     argument-carrying count beside the paid calls and the settled
 *     sales — the check-to-buy ratio a crawler cannot inflate.
 *  2. SINCE WHEN EACH LINE WAS LOGGED. The interactive doors got their
 *     porch line on 2026-09-04 and the evidence surfaces on 2026-08-21,
 *     so July's zero and August's missing preflights are gaps in the
 *     counter, not in demand. Each row carries its logged-since date,
 *     the days it was counted this month, and a per-day figure so a
 *     five-day month reads beside a thirty-day one.
 *  3. WHAT "UNKNOWN" IS. The channel inferrer's last bucket is two
 *     opposite stories: a client with no user-agent at all (a scraper)
 *     or a referrer it does not recognise (somebody linking to us).
 *     The counters cannot tell them apart; the event rows can. A
 *     bounded scan of the newest rows splits the month's unknowns and
 *     names the referring hosts, keeper's eyes only.
 *  4. WHAT MOVED SINCE THE KEEPER LAST LOOKED. Each render stores the
 *     month's counts under one key and the next render prints the
 *     delta beside each row, dated. The observatory is a level; this
 *     is the slope.
 *
 * Pure where it can be: freeInstrumentUsage reads the observatory the
 * route already computed plus whatever the route hands it. Counts are
 * the porch's floors, with the porch's caveats.
 */

export type InstrumentKind = "argument" | "read";

export interface InstrumentEntry {
  prefix: string;
  /**
   * "argument": the call cannot be made without input a crawler would
   * not invent (a URL, a receipt, a host to check). "read": a GET of a
   * page or list that any walker fetches by following links.
   */
  kind: InstrumentKind;
  /** The date the porch first counted this surface, off the dated comments in porch-surface.ts and the Worker entry. */
  logged_since: string;
}

/** The porch began counting surfaces on this day; anything without its own dated line is a floor at this date. */
export const PORCH_COUNTING_SINCE = "2026-08-21";
/** The interactive doors and free resources were given porch lines on this day. */
export const DOORS_LOGGED_SINCE = "2026-09-04";

export const FREE_INSTRUMENTS: readonly InstrumentEntry[] = [
  { prefix: "preflight", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "look", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "before-you-pay", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "conformance", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "verify-receipt", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "artifact:read", kind: "read", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "bot-auth", kind: "read", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "corpus", kind: "read", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:preflight_endpoint", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:check_before_you_pay", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:look_at_door", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:check_conformance", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:verify_artifact", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:read_store_guide", kind: "read", logged_since: PORCH_COUNTING_SINCE },
];

/**
 * Sub-surfaces whose kind or date differs from their prefix. The
 * conformance desk's HUMAN page is a read even though the API takes a
 * body; the preflight's check list is a GET; the bot-auth CHECK takes
 * a signed request where the bot-auth page is prose; the MCP variants
 * of the HTTP doors were logged with the MCP handler, not the doors.
 */
const SURFACE_OVERRIDES: Readonly<Record<string, Partial<InstrumentEntry>>> = {
  "conformance:desk": { kind: "read", logged_since: DOORS_LOGGED_SINCE },
  "conformance-watch:history": { kind: "read" },
  "conformance:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "preflight:checks": { kind: "read" },
  "preflight:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "look:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "before-you-pay:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "bot-auth:check": { kind: "argument" },
};

export const FREE_INSTRUMENT_PREFIXES: readonly string[] = FREE_INSTRUMENTS.map((entry) => entry.prefix);

export const PAID_TOOL_PREFIXES: readonly string[] = ["mcp:tool:buy_"];

export interface InstrumentRow extends SurfaceCount {
  kind: InstrumentKind;
  logged_since: string;
  /** Days of this month the surface was being counted, up to the reading; 0 when the line did not exist yet. */
  days_counted: number;
  /** organic / days_counted, one decimal; null when days_counted is 0. */
  per_day: number | null;
  /** Organic change since the stored reading; null when there was no reading for this month. */
  delta: number | null;
}

/** The month's unknown-channel visits to free surfaces, split by what made them unknown. */
export interface UnknownSplit {
  /** Rows scanned to build this; the newest first, so the split is a floor and says how deep it went. */
  rows_scanned: number;
  /** True when the scan reached the oldest row of the month; false when it hit its cap first. */
  complete: boolean;
  /** Unknown because the client sent no user-agent at all: a scraper's signature. */
  no_user_agent: number;
  /** Unknown because a referrer was present and unrecognised: somebody linking to us. */
  referred: number;
  /** The referring hosts, most seen first, bounded. */
  referrer_hosts: { host: string; visits: number }[];
  /** The no-user-agent visits by surface, most seen first. */
  no_user_agent_by_surface: { surface: string; visits: number }[];
}

export interface InstrumentMonth {
  month: string;
  free: InstrumentRow[];
  free_total: number;
  /** Uses that carried an argument: the part crawlers cannot fake. */
  argument_uses: number;
  /** Page and list reads: the part they can. */
  read_uses: number;
  free_by_channel: Record<string, number>;
  paid_tools: InstrumentRow[];
  paid_tool_calls: number;
  /** Organic settled sales the same month off /pulse, when the route had it. A buy_* tool is called at least twice per sale, so this is the honest right-hand side. */
  settled: number | null;
  unknown: UnknownSplit | null;
  /** The reading the deltas are against, when there was one for this month. */
  since: string | null;
  truncated: boolean;
}

export interface InstrumentReading {
  at: string;
  month: string;
  free: Record<string, number>;
  paid: Record<string, number>;
}

export interface InstrumentUsage {
  computed_at: string;
  months: InstrumentMonth[];
  roster: readonly InstrumentEntry[];
  porch_counting_since: string;
  doors_logged_since: string;
  /** What this render stored for the next one to diff against. */
  reading: InstrumentReading;
}

export interface InstrumentInputs {
  now?: Date;
  /** organic_settled by ISO month, off /pulse. */
  settled?: Record<string, number>;
  /** The previous render's stored counts. */
  last?: InstrumentReading | null;
  /** The current month's unknown split, off the event rows. */
  unknown?: UnknownSplit | null;
}

function rosterEntry(surface: string): InstrumentEntry | undefined {
  const base = FREE_INSTRUMENTS.find((p) => surface === p.prefix || surface.startsWith(`${p.prefix}:`) || surface.startsWith(p.prefix));
  if (!base) return undefined;
  const override = SURFACE_OVERRIDES[surface];
  return override ? { ...base, ...override, prefix: base.prefix } : base;
}

export function isFreeInstrument(surface: string): boolean {
  return rosterEntry(surface) !== undefined;
}
function isPaidTool(surface: string): boolean {
  return PAID_TOOL_PREFIXES.some((p) => surface.startsWith(p));
}

/** The kind of a surface on the roster; used by the unknown split to weight what it found. */
export function instrumentKind(surface: string): InstrumentKind | undefined {
  return rosterEntry(surface)?.kind;
}

const DAY_MS = 86400 * 1000;

/**
 * Days of `month` on which a surface logged since `since` was being
 * counted, up to `now`. Whole UTC days, inclusive of both ends, never
 * negative: a line that did not exist yet counted for zero days, and a
 * month wholly in the future counts for zero too.
 */
export function daysCounted(month: string, since: string, now: Date): number {
  const monthStart = Date.parse(`${month}-01T00:00:00.000Z`);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = nextMonth.getTime() - 1;
  const from = Math.max(monthStart, Date.parse(`${since}T00:00:00.000Z`));
  const to = Math.min(monthEnd, now.getTime());
  if (to < from) return 0;
  return Math.floor((to - from) / DAY_MS) + 1;
}

function toRow(s: SurfaceCount, entry: InstrumentEntry, month: string, now: Date, last: Record<string, number> | null): InstrumentRow {
  const days = daysCounted(month, entry.logged_since, now);
  return {
    ...s,
    kind: entry.kind,
    logged_since: entry.logged_since,
    days_counted: days,
    per_day: days > 0 ? Number((s.organic / days).toFixed(1)) : null,
    delta: last ? s.organic - (last[s.surface] ?? 0) : null,
  };
}

const PAID_ENTRY: InstrumentEntry = { prefix: "mcp:tool:buy_", kind: "argument", logged_since: PORCH_COUNTING_SINCE };

export function freeInstrumentUsage(observatory: Observatory, inputs: InstrumentInputs = {}): InstrumentUsage {
  const now = inputs.now ?? new Date(observatory.computed_at);
  const currentMonth = now.toISOString().slice(0, 7);
  const months: InstrumentMonth[] = observatory.months.map((m) => {
    const last = inputs.last && inputs.last.month === m.month ? inputs.last : null;
    const free = m.surfaces
      .flatMap((s) => {
        const entry = rosterEntry(s.surface);
        return entry ? [toRow(s, entry, m.month, now, last?.free ?? null)] : [];
      })
      .sort((a, b) => b.organic - a.organic);
    const paid = m.surfaces
      .filter((s) => isPaidTool(s.surface))
      .map((s) => toRow(s, PAID_ENTRY, m.month, now, last?.paid ?? null))
      .sort((a, b) => b.organic - a.organic);
    const byChannel: Record<string, number> = {};
    for (const s of free) {
      for (const [k, v] of Object.entries(s.by_channel)) byChannel[k] = (byChannel[k] ?? 0) + v;
    }
    return {
      month: m.month,
      free,
      free_total: free.reduce((sum, s) => sum + s.organic, 0),
      argument_uses: free.filter((s) => s.kind === "argument").reduce((sum, s) => sum + s.organic, 0),
      read_uses: free.filter((s) => s.kind === "read").reduce((sum, s) => sum + s.organic, 0),
      free_by_channel: byChannel,
      paid_tools: paid,
      paid_tool_calls: paid.reduce((sum, s) => sum + s.organic, 0),
      settled: inputs.settled?.[m.month] ?? null,
      unknown: m.month === currentMonth ? (inputs.unknown ?? null) : null,
      since: last?.at ?? null,
      truncated: m.truncated,
    };
  });
  const current = months.find((m) => m.month === currentMonth);
  const reading: InstrumentReading = {
    at: now.toISOString(),
    month: currentMonth,
    free: Object.fromEntries((current?.free ?? []).map((s) => [s.surface, s.organic])),
    paid: Object.fromEntries((current?.paid_tools ?? []).map((s) => [s.surface, s.organic])),
  };
  return {
    computed_at: observatory.computed_at,
    months,
    roster: FREE_INSTRUMENTS,
    porch_counting_since: PORCH_COUNTING_SINCE,
    doors_logged_since: DOORS_LOGGED_SINCE,
    reading,
  };
}

/* ---------------------------------------------------------------- */
/* The unknown split: pure over event rows, then the bounded scan.   */
/* ---------------------------------------------------------------- */

function referrerHost(referrer: string): string {
  try {
    return new URL(referrer).host.toLowerCase() || referrer.slice(0, 60);
  } catch {
    return referrer.slice(0, 60);
  }
}

function topOf(counts: Map<string, number>, limit: number): { key: string; visits: number }[] {
  return [...counts.entries()]
    .sort(([ka, a], [kb, b]) => b - a || ka.localeCompare(kb))
    .slice(0, limit)
    .map(([key, visits]) => ({ key, visits }));
}

export const UNKNOWN_HOSTS_SHOWN = 8;

/**
 * Split one month's unknown-channel porch visits to free surfaces.
 * House rows are out (they are out of every organic count); rows of
 * other months, kinds and surfaces are ignored, not counted against
 * the scan. Pure so the test can hand it rows.
 */
export function splitUnknown(events: readonly MetricEvent[], month: string, scanned: number, complete: boolean): UnknownSplit {
  let noUserAgent = 0;
  let referred = 0;
  const hosts = new Map<string, number>();
  const bySurface = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "porch" || event.house || event.channel !== "unknown") continue;
    if (!event.at.startsWith(month) || !isFreeInstrument(event.item)) continue;
    if (event.referrer) {
      referred += 1;
      const host = referrerHost(event.referrer);
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
    } else {
      noUserAgent += 1;
      bySurface.set(event.item, (bySurface.get(event.item) ?? 0) + 1);
    }
  }
  return {
    rows_scanned: scanned,
    complete,
    no_user_agent: noUserAgent,
    referred,
    referrer_hosts: topOf(hosts, UNKNOWN_HOSTS_SHOWN).map(({ key, visits }) => ({ host: key, visits })),
    no_user_agent_by_surface: topOf(bySurface, UNKNOWN_HOSTS_SHOWN).map(({ key, visits }) => ({ surface: key, visits })),
  };
}

/** Newest rows first (the key is an inverted timestamp), so the scan can stop at the first row older than the month. */
export const UNKNOWN_SCAN_CAP = 3000;

export async function readUnknownSplit(env: Env, month: string): Promise<UnknownSplit> {
  const events: MetricEvent[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  let complete = false;
  while (scanned < UNKNOWN_SCAN_CAP) {
    const listed = await kvList(env.COUNTERS, { prefix: "evt:", limit: 1000, ...(cursor ? { cursor } : {}) });
    const names = listed.keys.map((key) => key.name);
    scanned += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    let passedMonth = false;
    for (const name of names) {
      const event = values.get(name);
      if (!event) continue;
      if (event.at < `${month}`) {
        passedMonth = true;
        break;
      }
      events.push(event);
    }
    if (passedMonth || listed.list_complete) {
      complete = true;
      break;
    }
    cursor = listed.cursor;
  }
  return splitUnknown(events, month, scanned, complete);
}

/* ---------------------------------------------------------------- */
/* The keeper's last reading: one key, rewritten on every render.     */
/* ---------------------------------------------------------------- */

export async function readInstrumentReading(env: Env): Promise<InstrumentReading | null> {
  const stored = await kvGetJson<InstrumentReading>(env.COUNTERS, KV_KEYS.instrumentsReading).catch(() => null);
  return stored && typeof stored.at === "string" && typeof stored.month === "string" ? stored : null;
}

export async function writeInstrumentReading(env: Env, reading: InstrumentReading): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.instrumentsReading, JSON.stringify(reading));
}
