import { bulkGetText } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import {
  metricsMonth,
  monthsSinceOpening,
  readBountyLedger,
  readMonthLedger,
  readPorchLedger,
  type MonthLedger,
  type PorchLedger,
} from "@/lib/metrics";
import { porchSurfaceKind, type PorchSurfaceKind } from "@/lib/porch-surface";
import { readReferrerCensus } from "@/lib/referrer-census";
import { readBellRings } from "@/services/bell";
import { derivedFromCorpus } from "@/services/corpus-list";
import {
  DOORS_LOGGED_SINCE,
  PORCH_COUNTING_SINCE,
  daysCounted,
  instrumentEntry,
  type InstrumentKind,
} from "@/services/instruments";
import { readMcpClients } from "@/services/mcp-clients";
import { deriveMonthlyStates, type MonthReading, type MonthState } from "@/services/monthly-state";
import { OBSERVATORY_LEDGER_KEY_CAP, OBSERVATORY_PORCH_WRITES_PER_MINUTE } from "@/services/observatory";
import { computePulse, type PulseWindow } from "@/services/pulse";
import { readRailCountersByMonth, type RailMonth } from "@/services/rails";
import type { Env } from "@/types";

/**
 * THE GROWTH LEDGER (2026-09-11; docs/GROWTH_LEDGER_2026-09.md).
 *
 * The office had every count and no history: /admin shows this month
 * and all-time, /pulse and /observatory show six months of two
 * things each, /admin/instruments diffs one month against the
 * keeper's last look. Nothing put the porch, the free tools, the MCP
 * clients, the asks, the settles and the market itself side by side,
 * month against month, and nothing said what was NEW this month.
 *
 * This is one derivation over the counters that already exist,
 * every month since opening, five blocks per month. Nothing here is
 * typed: the free roster comes from services/instruments, the
 * surface kinds from lib/porch-surface, the market from the signed
 * corpus. Every figure is a count with its denominator beside it,
 * and every scan says when it hit its cap.
 *
 * WHAT IT CANNOT DO. There is no identity to join on — no cookies, no
 * IPs — so "free check, then purchase" is three counts in a row, not
 * a journey. The handoff on /admin/instruments does the nearest thing
 * by user-agent inside a window and says why it is a floor.
 */

export interface GrowthStore {
  organic_visits: number;
  visits_by_kind: Record<PorchSurfaceKind, number>;
  organic_402s: number;
  organic_settles: number;
  revenue_usdc: number;
  /** Organic settles by rail off the rail counters; null when the month had none. */
  settles_by_rail: Record<string, number> | null;
  organic_declines: number;
  /** Free re-checks of issued artifacts at /api/verify: the after-the-sale half. */
  organic_rechecks: number;
  /** Settles per hundred organic 402s, one decimal; null when nothing was asked. */
  settles_per_hundred_402s: number | null;
  /** Rings that counted (services/bell.ts); the lifetime count is on the marquee. */
  bell_rings: number;
  guestbook_writes: number;
  bounty_claims_paid: number;
}

export interface GrowthAgents {
  /** initialize on every MCP door: sessions opened. */
  mcp_handshakes: number;
  /** tools/list on every MCP door: catalogues read. */
  tools_listed: number;
  /** Tool calls on every MCP door, free and paid, organic. */
  tool_calls: number;
  /** Names in the month's client census, "other" and "unnamed" included: a floor on software, never on people. */
  distinct_mcp_clients: number;
  mcp_clients: { name: string; handshakes: number }[];
  visits_by_channel: Record<string, number>;
  asks_by_channel: Record<string, number>;
  /** Organic re-checks by how old the artifact was: over a week is travel, not the buyer looking at what it bought. */
  rechecks_by_age: Record<string, number>;
  /** Referring hosts off the monthly census, most seen first, bounded; "other" is everything past the cap. */
  referrer_hosts: { host: string; visits: number }[];
  referred_visits: number;
  /** Asks the reclassification walk moved to known machinery, off /pulse; null when the walk had no reading. */
  known_machinery: number | null;
}

export interface GrowthInstrumentRow {
  surface: string;
  kind: InstrumentKind;
  logged_since: string;
  organic: number;
  per_day: number | null;
  /** The month before's organic count; null when this is the first month read. */
  previous: number | null;
  delta: number | null;
}

export interface GrowthFunnel {
  /** Free calls that carried an argument: a URL, a receipt, a host. Reads are not intent. */
  free_argument_uses: number;
  organic_402s: number;
  organic_settles: number;
  /** Ratios of the two counts above to the first, per hundred, one decimal. NOT a joined journey: three counts in a row. */
  asks_per_hundred_checks: number | null;
  settles_per_hundred_checks: number | null;
}

export interface GrowthFreeInstruments {
  total: number;
  argument_uses: number;
  read_uses: number;
  by_instrument: GrowthInstrumentRow[];
  by_channel: Record<string, number>;
  funnel: GrowthFunnel;
}

export interface SurfaceDelta {
  surface: string;
  kind: PorchSurfaceKind;
  organic: number;
  previous: number;
  delta: number;
}

export interface GrowthDemand {
  /** Surfaces with organic use this month and none in any month before it. Empty in the first month read, by construction. */
  new_surfaces: { surface: string; kind: PorchSurfaceKind; organic: number }[];
  /** The largest rises against the month before, bounded. */
  risers: SurfaceDelta[];
  /** The largest falls against the month before, bounded. */
  fallers: SurfaceDelta[];
  /** Paid items by organic asks, settles beside, bounded. */
  items_asked_for: { item: string; organic_402s: number; organic_settles: number }[];
}

export interface GrowthX402 {
  /** Signed rounds the chain holds for this month. */
  rounds: number;
  closing: MonthReading & { week: string };
  /** Failed checks by registered name, in door-weeks, most frequent first, bounded. */
  defects: { id: string; title: string; door_weeks: number }[];
  /** The month before's closing reading, when the chain had one. */
  against_the_last?: { month: string; closing: MonthReading & { week: string } };
}

/** What the log held for this month at close, beside the live reading. */
export interface GrowthLogged {
  at: string;
  organic_visits: number;
  organic_402s: number;
  organic_settles: number;
  free_uses: number;
}

export interface GrowthMonth {
  month: string;
  /** Whole UTC days of the month elapsed at the reading, for per-day figures. */
  days_elapsed: number;
  store: GrowthStore;
  agents: GrowthAgents;
  free_instruments: GrowthFreeInstruments;
  demand: GrowthDemand;
  /** Null when the signed chain holds no week taken in this month: not measured, never zero. */
  x402_economy: GrowthX402 | null;
  floors: {
    ledger_truncated: boolean;
    porch_truncated: boolean;
  };
  logged: GrowthLogged | null;
}

export interface GrowthLedger {
  computed_at: string;
  /** Newest first. */
  months: GrowthMonth[];
  porch_counting_since: string;
  doors_logged_since: string;
  floors: {
    porch_writes_per_minute: number;
    ledger_key_cap: number;
    note: string;
  };
  what_this_is: string;
  what_this_is_not: string;
}

export const GROWTH_WHAT_THIS_IS =
  "Every month since opening, side by side: what was read, which free instruments were used and by which door, who knocked at the MCP door, what was asked for and what settled, and what the signed corpus saw of the x402 market that month. One derivation over the counters the rest of the office reads; nothing typed.";

export const GROWTH_WHAT_THIS_IS_NOT =
  "Not visitors: no cookies, no IPs, so one agent reading ten times is ten. Not a joined funnel: a free check and a later purchase cannot be tied to one caller here, so the funnel is three counts in a row with their ratios. Not npm, GitHub or the browser — the keeper reads those elsewhere. Every count is a floor; the caps are printed beside it.";

export const GROWTH_FLOORS_NOTE =
  "The porch writes at most a fixed number of visits a minute per isolate and drops the rest; each month's key scan stops at a fixed cap and the row says when it did. The free instruments were logged from different dates — a month before a line existed is unmeasured on that line, not zero.";

const TOP = 10;
const DEFECTS_TOP = 5;

const MCP_DOORS = ["mcp", "mcp-verifier", "mcp-docs"] as const;

function perHundred(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function daysElapsed(month: string, now: Date): number {
  return daysCounted(month, `${month}-01`, now);
}

function organicOf(porch: PorchLedger, surface: string): number {
  return porch.surfaces[surface]?.["organic"] ?? 0;
}

function sumOrganic(porch: PorchLedger, test: (surface: string) => boolean): number {
  let total = 0;
  for (const [surface, buckets] of Object.entries(porch.surfaces)) {
    if (test(surface)) total += buckets["organic"] ?? 0;
  }
  return total;
}

function emptyKinds(): Record<PorchSurfaceKind, number> {
  return { storefront: 0, instrument: 0, door: 0, evidence: 0, room: 0 };
}

/** The organic count per surface, the shape the demand block compares month to month. */
export function organicBySurface(porch: PorchLedger): Map<string, number> {
  const out = new Map<string, number>();
  for (const [surface, buckets] of Object.entries(porch.surfaces)) {
    const organic = buckets["organic"] ?? 0;
    if (organic > 0) out.set(surface, organic);
  }
  return out;
}

export interface MonthInputs {
  month: string;
  now: Date;
  porch: PorchLedger;
  ledger: MonthLedger;
  clients: Record<string, number>;
  bounty: { paid: number };
  verifyAge: Record<string, number>;
  referrers: Record<string, number>;
  bellRings: number;
  rail: RailMonth | null;
  pulse: PulseWindow | null;
  state: MonthState | null;
  logged: GrowthMonth | null;
  /** Every surface with organic use in any EARLIER month. */
  seenBefore: ReadonlySet<string>;
  /** The month before's organic count per surface; null when this is the first month read. */
  previous: Map<string, number> | null;
}

/**
 * One month, derived from what its counters say. Pure: the reads
 * happen in computeGrowth so this can be tested on typed inputs.
 */
export function deriveGrowthMonth(inputs: MonthInputs): GrowthMonth {
  const { month, now, porch, ledger, previous } = inputs;

  // ── store ──────────────────────────────────────────────────────
  const visitsByKind = emptyKinds();
  for (const [surface, buckets] of Object.entries(porch.surfaces)) {
    visitsByKind[porchSurfaceKind(surface)] += buckets["organic"] ?? 0;
  }
  let organic402s = 0;
  let organicSettles = 0;
  let organicDeclines = 0;
  let organicRechecks = 0;
  const itemsAskedFor: GrowthDemand["items_asked_for"] = [];
  for (const [item, row] of Object.entries(ledger.items)) {
    organic402s += row.challenges;
    organicSettles += row.settled;
    organicDeclines += row.declines;
    organicRechecks += row.verifies;
    if (row.challenges > 0 || row.settled > 0) {
      itemsAskedFor.push({ item, organic_402s: row.challenges, organic_settles: row.settled });
    }
  }
  itemsAskedFor.sort((a, b) => b.organic_402s - a.organic_402s || b.organic_settles - a.organic_settles || a.item.localeCompare(b.item));

  let settlesByRail: Record<string, number> | null = null;
  if (inputs.rail) {
    const named = Object.entries(inputs.rail).filter(
      (entry): entry is [string, number] => entry[0] !== "month" && typeof entry[1] === "number" && entry[1] > 0,
    );
    settlesByRail = named.length > 0 ? Object.fromEntries(named) : null;
  }

  const store: GrowthStore = {
    organic_visits: porch.organicVisits,
    visits_by_kind: visitsByKind,
    organic_402s: organic402s,
    organic_settles: organicSettles,
    revenue_usdc: Math.round(ledger.revenueUsdc * 1_000_000) / 1_000_000,
    settles_by_rail: settlesByRail,
    organic_declines: organicDeclines,
    organic_rechecks: organicRechecks,
    settles_per_hundred_402s: perHundred(organicSettles, organic402s),
    bell_rings: inputs.bellRings,
    guestbook_writes: organicOf(porch, "guestbook:write"),
    bounty_claims_paid: inputs.bounty.paid,
  };

  // ── agents ─────────────────────────────────────────────────────
  const visitsByChannel: Record<string, number> = {};
  for (const buckets of Object.values(porch.surfaces)) {
    for (const [bucket, count] of Object.entries(buckets)) {
      if (bucket.startsWith("organic:")) {
        const channel = bucket.slice("organic:".length);
        visitsByChannel[channel] = (visitsByChannel[channel] ?? 0) + count;
      }
    }
  }
  const clients = Object.entries(inputs.clients)
    .map(([name, handshakes]) => ({ name, handshakes }))
    .sort((a, b) => b.handshakes - a.handshakes || a.name.localeCompare(b.name));
  const referrers = Object.entries(inputs.referrers)
    .map(([host, visits]) => ({ host, visits }))
    .sort((a, b) => b.visits - a.visits || a.host.localeCompare(b.host));

  const agents: GrowthAgents = {
    mcp_handshakes: MCP_DOORS.reduce((sum, door) => sum + organicOf(porch, `${door}:initialize`), 0),
    tools_listed: MCP_DOORS.reduce((sum, door) => sum + organicOf(porch, `${door}:tools/list`), 0),
    tool_calls: sumOrganic(porch, (surface) => MCP_DOORS.some((door) => surface.startsWith(`${door}:tool:`))),
    distinct_mcp_clients: clients.length,
    mcp_clients: clients.slice(0, TOP),
    visits_by_channel: sortedRecord(visitsByChannel),
    asks_by_channel: sortedRecord(ledger.channels402),
    rechecks_by_age: sortedRecord(inputs.verifyAge),
    referrer_hosts: referrers.slice(0, TOP),
    referred_visits: referrers.reduce((sum, row) => sum + row.visits, 0),
    known_machinery: inputs.pulse?.known_machinery ?? null,
  };

  // ── free instruments, and the funnel ───────────────────────────
  const byInstrument: GrowthInstrumentRow[] = [];
  const freeByChannel: Record<string, number> = {};
  let argumentUses = 0;
  let readUses = 0;
  for (const [surface, buckets] of Object.entries(porch.surfaces)) {
    const entry = instrumentEntry(surface);
    if (!entry) continue;
    const organic = buckets["organic"] ?? 0;
    if (entry.kind === "argument") argumentUses += organic;
    else readUses += organic;
    for (const [bucket, count] of Object.entries(buckets)) {
      if (bucket.startsWith("organic:")) {
        const channel = bucket.slice("organic:".length);
        freeByChannel[channel] = (freeByChannel[channel] ?? 0) + count;
      }
    }
    const days = daysCounted(month, entry.logged_since, now);
    const before = previous ? (previous.get(surface) ?? 0) : null;
    byInstrument.push({
      surface,
      kind: entry.kind,
      logged_since: entry.logged_since,
      organic,
      per_day: days > 0 ? Number((organic / days).toFixed(1)) : null,
      previous: before,
      delta: before === null ? null : organic - before,
    });
  }
  byInstrument.sort((a, b) => b.organic - a.organic || a.surface.localeCompare(b.surface));

  const freeInstruments: GrowthFreeInstruments = {
    total: argumentUses + readUses,
    argument_uses: argumentUses,
    read_uses: readUses,
    by_instrument: byInstrument,
    by_channel: sortedRecord(freeByChannel),
    funnel: {
      free_argument_uses: argumentUses,
      organic_402s: organic402s,
      organic_settles: organicSettles,
      asks_per_hundred_checks: perHundred(organic402s, argumentUses),
      settles_per_hundred_checks: perHundred(organicSettles, argumentUses),
    },
  };

  // ── demand ─────────────────────────────────────────────────────
  const thisMonth = organicBySurface(porch);
  const newSurfaces: GrowthDemand["new_surfaces"] = [];
  const deltas: SurfaceDelta[] = [];
  if (previous) {
    const union = new Set([...thisMonth.keys(), ...previous.keys()]);
    for (const surface of union) {
      const organic = thisMonth.get(surface) ?? 0;
      const before = previous.get(surface) ?? 0;
      if (organic !== before) {
        deltas.push({ surface, kind: porchSurfaceKind(surface), organic, previous: before, delta: organic - before });
      }
    }
  }
  for (const [surface, organic] of thisMonth) {
    if (!inputs.seenBefore.has(surface) && previous !== null) {
      newSurfaces.push({ surface, kind: porchSurfaceKind(surface), organic });
    }
  }
  newSurfaces.sort((a, b) => b.organic - a.organic || a.surface.localeCompare(b.surface));
  const risers = deltas.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta || a.surface.localeCompare(b.surface)).slice(0, TOP);
  const fallers = deltas.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta || a.surface.localeCompare(b.surface)).slice(0, TOP);

  const demand: GrowthDemand = {
    new_surfaces: newSurfaces,
    risers,
    fallers,
    items_asked_for: itemsAskedFor.slice(0, TOP),
  };

  // ── the x402 economy, off the signed chain ─────────────────────
  const state = inputs.state;
  const x402: GrowthX402 | null = state
    ? {
        rounds: state.weeks.length,
        closing: state.closing,
        defects: state.defects.slice(0, DEFECTS_TOP),
        ...(state.against_the_last ? { against_the_last: state.against_the_last } : {}),
      }
    : null;

  const logged = inputs.logged;
  return {
    month,
    days_elapsed: daysElapsed(month, now),
    store,
    agents,
    free_instruments: freeInstruments,
    demand,
    x402_economy: x402,
    floors: {
      ledger_truncated: ledger.truncated === true,
      porch_truncated: porch.truncated,
    },
    logged: logged
      ? {
          at: logged.logged?.at ?? "",
          organic_visits: logged.store.organic_visits,
          organic_402s: logged.store.organic_402s,
          organic_settles: logged.store.organic_settles,
          free_uses: logged.free_instruments.total,
        }
      : null,
  };
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

/** The verifyage buckets, which nothing read until the growth ledger did. */
export async function readVerifyAge(env: Env, month: string): Promise<Record<string, number>> {
  const prefix = `${KV_KEYS.metricMonthPrefix(month)}verifyage:`;
  const listed = await listKeys(env.COUNTERS, { prefix, cap: 20 });
  const values = await bulkGetText(env.COUNTERS, listed.names);
  const out: Record<string, number> = {};
  for (const name of listed.names) {
    const bucket = name.slice(prefix.length);
    const count = parseInt(values.get(name) ?? "0", 10);
    if (Number.isFinite(count) && count > 0) out[bucket] = (out[bucket] ?? 0) + count;
  }
  return out;
}

/** The frozen month, or null when the press has not written it yet. */
export async function readGrowthLog(env: Env, month: string): Promise<GrowthMonth | null> {
  const held = await kvGetJson<GrowthMonth>(env.COUNTERS, KV_KEYS.growthLog(month), "json").catch(() => null);
  return held ?? null;
}

async function monthlyStates(env: Env): Promise<Map<string, MonthState>> {
  const states = await derivedFromCorpus(env, "monthly-states", (records) =>
    deriveMonthlyStates(records, env.STORE_BASE_URL),
  ).catch(() => [] as MonthState[]);
  return new Map(states.map((state) => [state.month, state]));
}

export interface GrowthOptions {
  now?: Date;
  /** Read only these months (oldest first is not required; the reader orders them). Default: every month since opening. */
  months?: string[];
}

/**
 * Every month since opening in one wave, oldest first for the demand
 * block's memory, returned newest first for the page.
 */
export async function computeGrowth(env: Env, options: GrowthOptions = {}): Promise<GrowthLedger> {
  const now = options.now ?? new Date();
  const all = monthsSinceOpening(now);
  const current = metricsMonth(now);
  if (!all.includes(current)) all.push(current);
  const wanted = options.months ? all.filter((month) => options.months!.includes(month)) : all;

  const [rails, pulse, states, reads] = await Promise.all([
    readRailCountersByMonth(env).catch(() => [] as RailMonth[]),
    computePulse(env).catch(() => null),
    monthlyStates(env),
    Promise.all(
      all.map(async (month) => {
        const [porch, ledger, clients, bounty, verifyAge, referrers, bellRings, logged] = await Promise.all([
          readPorchLedger(env, month),
          readMonthLedger(env, month),
          readMcpClients(env, month),
          readBountyLedger(env, month),
          readVerifyAge(env, month),
          readReferrerCensus(env, month),
          readBellRings(env, month),
          readGrowthLog(env, month),
        ]);
        return { month, porch, ledger, clients, bounty, verifyAge, referrers, bellRings, logged };
      }),
    ),
  ]);
  const railByMonth = new Map(rails.map((row) => [row.month, row]));
  const pulseByMonth = new Map((pulse?.months ?? []).filter((w) => w.month).map((w) => [w.month!, w]));

  const months: GrowthMonth[] = [];
  const seenBefore = new Set<string>();
  let previous: Map<string, number> | null = null;
  for (const read of reads) {
    const thisMonth = organicBySurface(read.porch);
    if (wanted.includes(read.month)) {
      months.push(
        deriveGrowthMonth({
          ...read,
          now,
          rail: railByMonth.get(read.month) ?? null,
          pulse: pulseByMonth.get(read.month) ?? null,
          state: states.get(read.month) ?? null,
          seenBefore,
          previous,
        }),
      );
    }
    for (const surface of thisMonth.keys()) seenBefore.add(surface);
    previous = thisMonth;
  }
  months.reverse();

  return {
    computed_at: now.toISOString(),
    months,
    porch_counting_since: PORCH_COUNTING_SINCE,
    doors_logged_since: DOORS_LOGGED_SINCE,
    floors: {
      porch_writes_per_minute: OBSERVATORY_PORCH_WRITES_PER_MINUTE,
      ledger_key_cap: OBSERVATORY_LEDGER_KEY_CAP,
      note: GROWTH_FLOORS_NOTE,
    },
    what_this_is: GROWTH_WHAT_THIS_IS,
    what_this_is_not: GROWTH_WHAT_THIS_IS_NOT,
  };
}

/** The month before the one `now` is in, as YYYY-MM. */
export function monthBefore(now: Date): string {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  return cursor.toISOString().slice(0, 7);
}

/**
 * THE PRESS: freeze the month that just closed, once. Rides the hourly
 * cron; the first firing after a month ends writes it and every later
 * firing finds it written. Returns the month it wrote, or null when
 * there was nothing to do — before the store opened, or already
 * logged. Never overwrites: the reclassification walk will move the
 * live figures afterwards and the page prints both, which is the
 * point of having a log at all.
 */
export async function logClosedMonth(env: Env, now: Date = new Date()): Promise<string | null> {
  const month = monthBefore(now);
  if (!monthsSinceOpening(now).includes(month)) return null;
  const held = await readGrowthLog(env, month);
  if (held) return null;
  const ledger = await computeGrowth(env, { now, months: [month] });
  const row = ledger.months.find((entry) => entry.month === month);
  if (!row) return null;
  const frozen: GrowthMonth = {
    ...row,
    logged: {
      at: now.toISOString(),
      organic_visits: row.store.organic_visits,
      organic_402s: row.store.organic_402s,
      organic_settles: row.store.organic_settles,
      free_uses: row.free_instruments.total,
    },
  };
  await kvPut(env.COUNTERS, KV_KEYS.growthLog(month), JSON.stringify(frozen));
  return month;
}
