import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGetJson, kvList, kvPut } from "@/lib/kv-retry";
import type { MetricEvent } from "@/lib/metrics";
import { walkerKey } from "@/lib/walkers";
import type { Observatory, SurfaceCount } from "@/services/observatory";
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

export type InstrumentKind = "argument" | "read";

export interface InstrumentEntry {
  prefix: string;
  /**
   * "argument": the call takes input (a URL, a receipt, a host to check).
   * Automated callers can supply it too. "read": a GET of a
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
/** The verifier door at /mcp/verifier, open since 2026-09-03, was given porch lines on this day. */
export const VERIFIER_LOGGED_SINCE = "2026-09-05";
/** The documentation door at /mcp.md and /mcp/docs, counted from the day it opened. */
export const DOCS_LOGGED_SINCE = "2026-09-05";

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
  { prefix: "mcp-verifier:tool:", kind: "argument", logged_since: VERIFIER_LOGGED_SINCE },
  /* The documentation door's one tool hands back reference material by name: a read, like the store guide. */
  { prefix: "mcp-docs:tool:", kind: "read", logged_since: DOCS_LOGGED_SINCE },
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
  /* The defect vocabulary is a read with or without an id; every other verifier tool needs a URL, a receipt or a host. */
  "mcp-verifier:tool:get_defect_definition": { kind: "read" },
};

export const FREE_INSTRUMENT_PREFIXES: readonly string[] = FREE_INSTRUMENTS.map((entry) => entry.prefix);

/** Every MCP door's opening handshake: the denominator for how many sessions become tool calls. */
const MCP_HANDSHAKE_SURFACES: ReadonlySet<string> = new Set([
  "mcp:initialize",
  "mcp-verifier:initialize",
  "mcp-docs:initialize",
]);

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
 * WHAT THIS FILTER STILL CANNOT SEE, and it is not small:
 * `inferChannel` short-circuits on `viaMcp` before it ever consults
 * the crawler table (channel.ts), so an infrastructure client that
 * arrives through the MCP door is stamped `mcp` and counted here as
 * organic. Filtering on channel cannot fix that — the classification
 * never ran. Until the short-circuit is reordered, `checkers` is an
 * OVER-count on the MCP side and the page says so rather than
 * implying a clean number.
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
    if (event.channel === "infrastructure") infraClients.add(walkerKey(event));
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
