import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGetJson, kvList, kvPut } from "@/lib/kv-retry";
import type { MetricEvent } from "@/lib/metrics";
import { walkerKey } from "@/lib/walkers";
import { clientKey, type InstrumentClients } from "@/lib/client-census";
import { invertedTimestamp } from "@/lib/kv-keys";
import { isCensusedInstrument } from "@/lib/instrument-roster";
import { isNoiseFloor } from "@/lib/declines";
import type { Observatory, SurfaceCount } from "@/services/observatory";
import {
  DOCS_LOGGED_SINCE,
  DOORS_LOGGED_SINCE,
  FREE_INSTRUMENTS,
  PORCH_COUNTING_SINCE,
  VERIFIER_LOGGED_SINCE,
  instrumentEntry,
  instrumentKind,
  isFreeInstrument,
  isPaidTool,
  type InstrumentEntry,
  type InstrumentKind,
} from "@/lib/instrument-roster";

/**
 * THE ROSTER LIVES IN lib/instrument-roster.ts (2026-09-11) so the
 * porch counter in lib/metrics.ts can ask "is this a free instrument"
 * at write time for the client census; lib does not import services.
 * Everything here that named the roster still does, by re-export.
 */
export {
  DOCS_LOGGED_SINCE,
  DOORS_LOGGED_SINCE,
  FREE_INSTRUMENTS,
  FREE_INSTRUMENT_PREFIXES,
  PAID_TOOL_PREFIXES,
  PORCH_COUNTING_SINCE,
  VERIFIER_LOGGED_SINCE,
  instrumentEntry,
  isFreeInstrument,
  instrumentKind,
  type InstrumentEntry,
  type InstrumentKind,
} from "@/lib/instrument-roster";
import type { Env } from "@/types";

/**
 * THE FREE INSTRUMENTS, USED (2026-09-04). The one real signal in the
 * September porch was not on any paid door: preflight_endpoint called
 * 45 times, check_before_you_pay 24, look_at_door 22 — tools called
 * with arguments — against 22 paid attempts. These dated counts record
 * invocations, not buyer intent; automated callers can supply arguments too.
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
 *     sales. Both classes can include automated traffic.
 *  2. SINCE WHEN EACH LINE WAS LOGGED. The interactive doors got their
 *     porch line on 2026-09-04 and the evidence surfaces on 2026-08-21,
 *     so July's zero and August's missing preflights are gaps in the
 *     counter, not in demand. Each row carries its logged-since date,
 *     the days it was counted this month, and a per-day figure so a
 *     five-day month reads beside a thirty-day one.
 *  3. WHAT "UNKNOWN" IS. The channel inferrer's last bucket is two
 *     opposite stories: a client with no user-agent at all (caller type unknown)
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

/** Every MCP door's opening handshake: the denominator for how many sessions become tool calls. */
const MCP_HANDSHAKE_SURFACES: ReadonlySet<string> = new Set([
  "mcp:initialize",
  "mcp-verifier:initialize",
  "mcp-docs:initialize",
]);

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
  /** Unknown because the client sent no user-agent at all; no caller type inferred. */
  no_user_agent: number;
  /** Unknown because the referrer was one of OUR pages: a reader following the store's own links, human or browser-resident agent. */
  self_referred: number;
  /** Unknown because a referrer was present, unrecognised, and not ours: somebody linking to us. */
  referred: number;
  /** The referring hosts, most seen first, bounded. */
  referrer_hosts: { host: string; visits: number }[];
  /** The no-user-agent visits by surface, most seen first. */
  no_user_agent_by_surface: { surface: string; visits: number }[];
}

/**
 * THE HANDOFF: did a free check lead to a price being asked, and to a
 * sale? Keyed by user-agent like the census keys walkers, so it is a
 * floor on clients (one SDK string is many agents) and can be fooled
 * by two agents on the same string within the window. Said on the
 * page. Distinct clients, never calls: a client that checked ten
 * doors and bought one is one checker and one buyer.
 */
export interface Handoff {
  window_minutes: number;
  /** Distinct clients that made at least one argument-carrying free call this month. */
  checkers: number;
  /** ...of those, the ones a 402 was issued to within the window after a check. */
  then_priced: number;
  /** ...of those, the ones whose payment settled within the window after a check. */
  then_settled: number;
  /** The paid items those clients were priced for after a check, most seen first, bounded. */
  items_after_check: { item: string; clients: number }[];
  /**
   * Infrastructure clients that checked and are NOT in the counts
   * above. Published rather than dropped: an excluded row the reader
   * cannot see is the same failure as an included one they cannot
   * spot, and this is the number that says how much of the handoff
   * was ever a handoff.
   */
  infrastructure_checkers: number;
  /** The checkers themselves, so the count can be traced instead of believed. Bounded. */
  checker_clients: string[];
  /** ...of those, the ones a price was issued to inside the window. Bounded. */
  priced_clients: string[];
}

export interface InstrumentMonth {
  month: string;
  free: InstrumentRow[];
  free_total: number;
  /** Calls to instruments that take arguments; not evidence of buyer intent. */
  argument_uses: number;
  /** Page and list reads; caller intent is not inferred. */
  read_uses: number;
  free_by_channel: Record<string, number>;
  paid_tools: InstrumentRow[];
  paid_tool_calls: number;
  /** Organic settled sales the same month off /pulse, when the route had it. A buy_* tool is called at least twice per sale, so this is the honest right-hand side. */
  settled: number | null;
  /** Free re-checks of already-issued artifacts at /api/verify, off /pulse: the after-the-sale half. */
  rechecks: number | null;
  /** Signed payments presented and refused, off /pulse. The reasons live on /admin/declines. */
  declines: number | null;
  /** The receipts and artifacts verified through the roster's own doors (verify-receipt, verify_artifact). */
  receipts_verified: number;
  /** MCP sessions that opened (initialize) on either door — the denominator for how many tool calls a handshake turns into. */
  mcp_handshakes: number;
  unknown: UnknownSplit | null;
  handoff: Handoff | null;
  /** The month's client census per instrument (lib/client-census.ts), busiest first; null for months the route did not read. */
  clients: InstrumentClients[] | null;
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
  verifier_logged_since: string;
  docs_logged_since: string;
  /** What this render stored for the next one to diff against. */
  reading: InstrumentReading;
  /** One UTC day's rows, by instrument, by client, when the keeper asked for a day. */
  day_sample: DaySample | null;
}

export interface InstrumentInputs {
  now?: Date;
  /** organic_settled by ISO month, off /pulse. */
  settled?: Record<string, number>;
  /** organic_rechecks by ISO month, off /pulse. */
  rechecks?: Record<string, number>;
  /** organic_declines by ISO month, off /pulse: signed payments turned away. */
  declines?: Record<string, number>;
  /** The previous render's stored counts. */
  last?: InstrumentReading | null;
  /** The current month's unknown split, off the event rows. */
  unknown?: UnknownSplit | null;
  /** The current month's handoff, off the same rows. */
  handoff?: Handoff | null;
  /** The current month's client census, off lib/client-census.ts. */
  clients?: Map<string, InstrumentClients> | null;
  /** A day's rows read on request, already grouped. */
  daySample?: DaySample | null;
}

/**
 * A DAY'S ROWS, BY INSTRUMENT, BY CLIENT (2026-09-11). The client
 * census answers "one prober or many" from the day it began; it
 * cannot answer it for August. The event rows can — they keep ninety
 * days — but the month scan reads newest-first under a cap that a
 * busy month exhausts inside a day, so August was unreachable from
 * any page. This reads ONE UTC day by its key prefixes instead: the
 * inverted timestamp's leading digits bucket the rows into ~2.8-hour
 * slices, so a day is at most ten listings and never a walk through
 * everything newer. Bounded by DAY_SAMPLE_CAP; the row says when it
 * hit it.
 */
export interface DaySample {
  day: string;
  rows_read: number;
  /** True when every slice of the day was listed to its end. */
  complete: boolean;
  /** Busiest instrument first; software, never people. */
  instruments: InstrumentClients[];
}

export const DAY_SAMPLE_CAP = 8000;
/** The inverted timestamp has 13 digits; a 6-digit prefix is a 10^7 ms slice, about 2.8 hours. */
const SLICE_MS = 10_000_000;
const SLICE_PREFIX_DIGITS = 6;

/** The `evt:` key prefixes whose slices intersect the UTC day, newest slice first. */
export function dayEventPrefixes(day: string): string[] {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return [];
  const end = start + 86_400_000 - 1;
  const first = Math.floor(Number(invertedTimestamp(end)) / SLICE_MS);
  const last = Math.floor(Number(invertedTimestamp(start)) / SLICE_MS);
  const prefixes: string[] = [];
  for (let slice = first; slice <= last; slice += 1) {
    prefixes.push(`evt:${String(slice).padStart(SLICE_PREFIX_DIGITS, "0")}`);
  }
  return prefixes;
}

export async function readDayEvents(env: Env, day: string, cap = DAY_SAMPLE_CAP): Promise<MonthEvents> {
  const events: MetricEvent[] = [];
  let scanned = 0;
  let complete = true;
  for (const prefix of dayEventPrefixes(day)) {
    let cursor: string | undefined;
    do {
      if (scanned >= cap) {
        complete = false;
        return { events, rows_scanned: scanned, complete };
      }
      const listed = await kvList(env.COUNTERS, { prefix, limit: Math.min(1000, cap - scanned), ...(cursor ? { cursor } : {}) });
      const names = listed.keys.map((key) => key.name);
      scanned += names.length;
      const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
      for (const name of names) {
        const event = values.get(name);
        if (event && event.at.startsWith(day)) events.push(event);
      }
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
  }
  return { events, rows_scanned: scanned, complete };
}

/** Organic porch rows on censused instruments, grouped by user-agent. Pure. */
export function clientsByInstrument(events: readonly MetricEvent[], top = 5): InstrumentClients[] {
  const bySurface = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (event.kind !== "porch" || event.house || event.channel === "infrastructure") continue;
    if (!isCensusedInstrument(event.item)) continue;
    const clients = bySurface.get(event.item) ?? new Map<string, number>();
    const key = clientKey(event.user_agent);
    clients.set(key, (clients.get(key) ?? 0) + 1);
    bySurface.set(event.item, clients);
  }
  return [...bySurface.entries()]
    .map(([surface, clients]) => {
      const rows = [...clients.entries()]
        .map(([client, calls]) => ({ client, calls }))
        .sort((a, b) => b.calls - a.calls || a.client.localeCompare(b.client));
      return { surface, distinct: rows.length, calls: rows.reduce((sum, row) => sum + row.calls, 0), top: rows.slice(0, top) };
    })
    .sort((a, b) => b.calls - a.calls || a.surface.localeCompare(b.surface));
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
        const entry = instrumentEntry(s.surface);
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
      rechecks: inputs.rechecks?.[m.month] ?? null,
      declines: inputs.declines?.[m.month] ?? null,
      receipts_verified: free
        .filter((s) => s.surface.startsWith("verify-receipt") || s.surface === "mcp:tool:verify_artifact")
        .reduce((sum, s) => sum + s.organic, 0),
      mcp_handshakes: m.surfaces
        .filter((s) => MCP_HANDSHAKE_SURFACES.has(s.surface))
        .reduce((sum, s) => sum + s.organic, 0),
      unknown: m.month === currentMonth ? (inputs.unknown ?? null) : null,
      handoff: m.month === currentMonth ? (inputs.handoff ?? null) : null,
      clients:
        m.month === currentMonth && inputs.clients
          ? [...inputs.clients.values()].sort((a, b) => b.calls - a.calls || a.surface.localeCompare(b.surface))
          : null,
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
    verifier_logged_since: VERIFIER_LOGGED_SINCE,
    docs_logged_since: DOCS_LOGGED_SINCE,
    reading,
    day_sample: inputs.daySample ?? null,
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
export function splitUnknown(
  events: readonly MetricEvent[],
  month: string,
  scanned: number,
  complete: boolean,
  selfHost = "",
): UnknownSplit {
  let noUserAgent = 0;
  let selfReferred = 0;
  let referred = 0;
  const hosts = new Map<string, number>();
  const bySurface = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "porch" || event.house || event.channel !== "unknown") continue;
    if (!event.at.startsWith(month) || !isFreeInstrument(event.item)) continue;
    if (event.referrer) {
      const host = referrerHost(event.referrer);
      if (selfHost && host === selfHost.toLowerCase()) {
        selfReferred += 1;
        continue;
      }
      referred += 1;
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
    self_referred: selfReferred,
    referred,
    referrer_hosts: topOf(hosts, UNKNOWN_HOSTS_SHOWN).map(({ key, visits }) => ({ host: key, visits })),
    no_user_agent_by_surface: topOf(bySurface, UNKNOWN_HOSTS_SHOWN).map(({ key, visits }) => ({ surface: key, visits })),
  };
}

/**
 * THE HANDOFF, computed over the same rows. A client's argument-carrying
 * free call at time T is "handed off" when the same walker key has a
 * challenge (a 402 issued) or a settle inside (T, T + window]. The
 * window is generous by design: an agent reads the check, decides, and
 * signs, and the doctrine's direction of error is to understate — a
 * narrow window would call a real handoff a coincidence, a wide one
 * calls a coincidence a handoff, and the page says which way it leans.
 *
 * INFRASTRUCTURE IS EXCLUDED HERE, corrected 2026-09-08. This filter
 * read `event.house` alone, while the surface table it sits under
 * excludes house AND infrastructure at the door (observatory.ts: "the
 * infrastructure buckets that are kept out of them"). One page, two
 * denominators, no label — so a peer observatory walking the catalog
 * was counted as a client that checked, priced, and declined to buy,
 * which is the exact shape of a conversion problem the store does not
 * have. A monitor reading a door is not a customer hesitating at it.
 *
 * READ THROUGH `isNoiseFloor`, NOT THE STORED CHANNEL, and the
 * difference is the whole month of rows already in KV. `inferChannel`
 * used to short-circuit on `viaMcp` before it consulted the crawler
 * table, so every self-identifying prober that walked in through /mcp
 * was stamped `mcp` and never `infrastructure`. That was fixed at the
 * classifier on 2026-09-08 — but a stamp is written once, at the door,
 * and every row booked before the fix still carries the old one. A
 * filter that trusted `channel` alone would therefore exclude the
 * monitors arriving from now on and keep counting the ones already on
 * the books, which is the worse half of the bug and the half nobody
 * would notice. The shared predicate re-reads the user-agent table, so
 * history is classified by the same rule as today.
 */
export const HANDOFF_WINDOW_MS = 30 * 60 * 1000;
export const HANDOFF_ITEMS_SHOWN = 8;
/**
 * How many client keys the handoff names. Bounded because these are
 * strangers' strings on a page, and because a list long enough to
 * scroll is a list nobody traces.
 */
export const HANDOFF_CLIENTS_SHOWN = 12;

export function handoffs(events: readonly MetricEvent[], month: string, windowMs = HANDOFF_WINDOW_MS): Handoff {
  const checks = new Map<string, number[]>();
  const priced = new Map<string, { at: number; item: string }[]>();
  const settled = new Map<string, number[]>();
  /**
   * INFRASTRUCTURE IS A PROPERTY OF THE CLIENT, NOT THE REQUEST, so
   * this is a first pass over the rows rather than a test inside the
   * second. The item lookup states the reason in its own footnote: a
   * 402 and its settle are two different HTTP requests and can carry
   * different headers, so one client's rows land in different channels
   * without either being wrong. Filtering per-event would therefore
   * keep a monitor's organic-looking check and drop its infrastructure
   * price — counting it as a client that checked and declined to buy,
   * which is the exact false conversion story this fix exists to end,
   * arrived at from the other side. Any row naming a client as the
   * noise floor names it for all of them.
   */
  const infraClients = new Set<string>();
  for (const event of events) {
    if (event.house || !event.at.startsWith(month)) continue;
    if (isNoiseFloor(event)) infraClients.add(walkerKey(event));
  }
  const infraCheckers = new Set<string>();
  for (const event of events) {
    if (event.house || !event.at.startsWith(month)) continue;
    const key = walkerKey(event);
    if (infraClients.has(key)) {
      // Counted, named, and kept out of every number below.
      if (event.kind === "porch" && instrumentKind(event.item) === "argument") {
        infraCheckers.add(key);
      }
      continue;
    }
    const at = Date.parse(event.at);
    if (event.kind === "porch" && instrumentKind(event.item) === "argument") {
      checks.set(key, [...(checks.get(key) ?? []), at]);
    } else if (event.kind === "challenge") {
      priced.set(key, [...(priced.get(key) ?? []), { at, item: event.item }]);
    } else if (event.kind === "settle") {
      settled.set(key, [...(settled.get(key) ?? []), at]);
    }
  }
  let thenSettled = 0;
  const items = new Map<string, number>();
  const pricedClients: string[] = [];
  const after = (from: number, t: number): boolean => t > from && t <= from + windowMs;
  for (const [key, times] of checks) {
    const pricedAfter = (priced.get(key) ?? []).filter((p) => times.some((t) => after(t, p.at)));
    if (pricedAfter.length > 0) {
      pricedClients.push(key);
      for (const item of new Set(pricedAfter.map((p) => p.item))) items.set(item, (items.get(item) ?? 0) + 1);
    }
    if ((settled.get(key) ?? []).some((s) => times.some((t) => after(t, s)))) thenSettled += 1;
  }
  return {
    window_minutes: Math.round(windowMs / 60000),
    checkers: checks.size,
    then_priced: pricedClients.length,
    then_settled: thenSettled,
    items_after_check: topOf(items, HANDOFF_ITEMS_SHOWN).map(({ key, visits }) => ({ item: key, clients: visits })),
    infrastructure_checkers: infraCheckers.size,
    checker_clients: [...checks.keys()].sort().slice(0, HANDOFF_CLIENTS_SHOWN),
    priced_clients: [...pricedClients].sort().slice(0, HANDOFF_CLIENTS_SHOWN),
  };
}

export interface MonthEvents {
  events: MetricEvent[];
  rows_scanned: number;
  /** True when the scan reached the oldest row of the month; false when it hit its cap first. */
  complete: boolean;
}

/** Newest rows first (the key is an inverted timestamp), so the scan can stop at the first row older than the month. */
export const EVENT_SCAN_CAP = 3000;

export async function readMonthEvents(env: Env, month: string): Promise<MonthEvents> {
  const events: MetricEvent[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  let complete = false;
  while (scanned < EVENT_SCAN_CAP) {
    const listed = await kvList(env.COUNTERS, { prefix: "evt:", limit: 1000, ...(cursor ? { cursor } : {}) });
    const names = listed.keys.map((key) => key.name);
    scanned += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    let passedMonth = false;
    for (const name of names) {
      const event = values.get(name);
      if (!event) continue;
      if (event.at < month) {
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
  return { events, rows_scanned: scanned, complete };
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
