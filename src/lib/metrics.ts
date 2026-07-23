import { inferChannel, isHouseTraffic } from "@/lib/channel";
import type { ChannelSignals, HouseSignals } from "@/lib/channel";
import { bulkGetJson, bulkGetText } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import type { Channel, Env, PayerRecord } from "@/types";

/**
 * The instrumentation ledger (RUN1_SYNTHESIS §instrumentation, plus the
 * Phase 1 attribution pass). Aggregate counters live in COUNTERS under
 * metric:<YYYY-MM>:<kind>:<rest>, kinds carry an "h" suffix for house
 * traffic so organic counts stay clean. Every 402, settle, and verify
 * also writes one event row (evt:*) with channel/ua/referrer/item,
 * kept 90 days: the falsification instrument. Counters are
 * read-modify-write; a lost increment under contention is acceptable
 * chaos at this counter's line speed.
 */

const EVENT_TTL_SECONDS = 90 * 86400;

export function metricsMonth(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Collapses a gated path to a stable per-item metric key. */
export function itemKeyFromPath(path: string): string {
  if (path.startsWith("/api/buy/")) {
    return path.slice("/api/buy/".length);
  }
  return path.replace(/^\//, "").replace(/\//g, ":");
}

async function bump(env: Env, key: string): Promise<void> {
  await bumpBy(env, key, 1);
}

async function bumpBy(env: Env, key: string, amount: number): Promise<void> {
  const current = await env.COUNTERS.get(key);
  await env.COUNTERS.put(
    key,
    String((current ? parseInt(current, 10) : 0) + amount),
  );
}

/** Day key inside the month, for the trend table. */
function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(8, 10);
}

/** USDC stored as integer millionths so counters stay integers. */
const USDC_MICRO = 1_000_000;

export type MetricEventKind = "challenge" | "settle" | "verify" | "porch";

export interface MetricEvent {
  kind: MetricEventKind;
  item: string;
  channel: Channel;
  house: boolean;
  at: string;
  user_agent?: string;
  referrer?: string;
  /** Declared ?source= value, recorded verbatim as a claim. */
  declared_source?: string;
}

export interface EventSignals extends ChannelSignals, HouseSignals {
  declaredSource?: string;
}

function buildEvent(
  env: Env,
  kind: MetricEventKind,
  item: string,
  signals: EventSignals,
): MetricEvent {
  const event: MetricEvent = {
    kind,
    item,
    channel: inferChannel(signals),
    house: isHouseTraffic(env, signals),
    at: new Date().toISOString(),
  };
  if (signals.userAgent) {
    event.user_agent = signals.userAgent.slice(0, 200);
  }
  if (signals.referrer) {
    event.referrer = signals.referrer.slice(0, 200);
  }
  if (signals.declaredSource) {
    event.declared_source = signals.declaredSource.slice(0, 40);
  }
  return event;
}

async function writeEvent(env: Env, event: MetricEvent): Promise<void> {
  const key = `evt:${invertedTimestamp(Date.now())}:${Math.random().toString(36).slice(2, 8)}`;
  await env.COUNTERS.put(key, JSON.stringify(event), {
    expirationTtl: EVENT_TTL_SECONDS,
  });
}

/**
 * Bucket suffix: "" organic, "h" house, "i" infrastructure. House wins
 * (the keeper testing from a crawler UA is still the keeper); settles
 * never bucket as infrastructure, a crawler that pays is a customer.
 */
function bucketSuffix(event: MetricEvent, allowInfra: boolean): string {
  if (event.house) {
    return "h";
  }
  if (allowInfra && event.channel === "infrastructure") {
    return "i";
  }
  return "";
}

/** A 402 went out. The organic issued/settled gap is the price signal. */
export async function recordChallengeIssued(
  env: Env,
  path: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "challenge", itemKeyFromPath(path), signals);
  const suffix = bucketSuffix(event, true);
  await bump(env, KV_KEYS.metric(metricsMonth(), `402${suffix}`, event.item));
  // Who's window-shopping, by channel, the diagnosis column for
  // "challenges without settles: shoppers or scanners?"
  await bump(env, KV_KEYS.metric(metricsMonth(), `src402${suffix}`, event.channel));
  if (suffix === "") {
    // Organic day counter for the trend table.
    await bump(env, KV_KEYS.metric(metricsMonth(), "d402", dayKey()));
  }
  if (event.declared_source && !event.house) {
    // ?src= venue markers: the free-papers measurement.
    await bump(
      env,
      KV_KEYS.metric(metricsMonth(), "venue", event.declared_source),
    );
  }
  await writeEvent(env, event);
}

/**
 * Front-porch logging: one event row per free-tier visit. Paths and
 * headers only, no bodies, no cookies, nothing client-side. Rows use
 * unique keys (no counter contention); a per-isolate token bucket
 * caps writes at crawler volume, so porch counts are floors under
 * storm conditions. Paid events are never sampled.
 */
const PORCH_WRITES_PER_MINUTE = 100;
let porchBudgetMinute = "";
let porchBudgetUsed = 0;

export async function recordPorchVisit(
  env: Env,
  surface: string,
  signals: EventSignals = {},
): Promise<void> {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== porchBudgetMinute) {
    porchBudgetMinute = minute;
    porchBudgetUsed = 0;
  }
  if (porchBudgetUsed >= PORCH_WRITES_PER_MINUTE) {
    return;
  }
  porchBudgetUsed += 1;
  const event = buildEvent(env, "porch", surface, signals);
  // Aggregate counter alongside the event row, so the porch table
  // reads from a handful of keys instead of scanning event rows.
  const suffix = bucketSuffix(event, true);
  await bump(
    env,
    KV_KEYS.metric(
      metricsMonth(),
      `porch${suffix}`,
      suffix === "" ? `${surface}:${event.channel}` : surface,
    ),
  );
  if (event.declared_source && !event.house) {
    await bump(
      env,
      KV_KEYS.metric(metricsMonth(), "venue", event.declared_source),
    );
  }
  await writeEvent(env, event);
}

/** Somebody re-checked one of our signatures. Re-verification is demand. */
export async function recordVerifyCall(
  env: Env,
  artifactItem: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "verify", artifactItem, signals);
  await bump(
    env,
    KV_KEYS.metric(metricsMonth(), `verify${bucketSuffix(event, true)}`, event.item),
  );
  await writeEvent(env, event);
}

/** Which PWID tier the buyer chose; elasticity signal. */
function tierLabel(paidUsdc: number, minimumUsdc: number): string {
  if (minimumUsdc <= 0) {
    return "1x";
  }
  const ratio = Math.round(paidUsdc / minimumUsdc);
  return ratio >= 5 ? "5x" : ratio >= 2 ? "2x" : "1x";
}

export interface SettlementSignals extends EventSignals {
  paidUsdc: number;
  minimumUsdc: number;
}

/** Money settled: count it, tier it, attribute it, remember the wallet. */
export async function recordSettlement(
  env: Env,
  path: string,
  signals: SettlementSignals,
): Promise<void> {
  const month = metricsMonth();
  const event = buildEvent(env, "settle", itemKeyFromPath(path), signals);
  // Settles never bucket as infrastructure: a crawler that pays is a customer.
  await bump(env, KV_KEYS.metric(month, `paid${bucketSuffix(event, false)}`, event.item));
  await bump(
    env,
    KV_KEYS.metric(
      month,
      `tier${bucketSuffix(event, false)}`,
      `${event.item}:${tierLabel(signals.paidUsdc, signals.minimumUsdc)}`,
    ),
  );
  await bump(env, KV_KEYS.metric(month, `src${bucketSuffix(event, false)}`, event.channel));
  // Revenue, organic and house apart, in integer millionths of USDC.
  await bumpBy(
    env,
    KV_KEYS.metric(month, `rev${bucketSuffix(event, false)}`, "total"),
    Math.round(signals.paidUsdc * USDC_MICRO),
  );
  if (bucketSuffix(event, false) === "") {
    await bump(env, KV_KEYS.metric(month, "dpaid", dayKey()));
  }
  if (event.declared_source && !event.house) {
    await bump(env, KV_KEYS.metric(month, "venue", event.declared_source));
  }
  await writeEvent(env, event);
  if (signals.payer) {
    await recordPayerSeen(env, signals.payer);
  }
}

async function recordPayerSeen(env: Env, address: string): Promise<void> {
  const key = KV_KEYS.payer(address);
  const now = new Date().toISOString();
  const existing = await env.COUNTERS.get<PayerRecord>(key, "json");
  const record: PayerRecord = existing
    ? { ...existing, last_seen: now, purchases: existing.purchases + 1 }
    : { address: address.toLowerCase(), first_seen: now, last_seen: now, purchases: 1 };
  await env.COUNTERS.put(key, JSON.stringify(record));
}

export interface LedgerRow {
  challenges: number;
  challengesHouse: number;
  challengesInfra: number;
  settled: number;
  settledHouse: number;
  verifies: number;
  verifiesHouse: number;
  verifiesInfra: number;
  tiers: Record<string, number>;
}

export interface MonthLedger {
  month: string;
  items: Record<string, LedgerRow>;
  /** channel -> organic settled count */
  channels: Record<string, number>;
  channelsHouse: Record<string, number>;
  /** channel -> 402s issued (organic / house / infrastructure). */
  channels402: Record<string, number>;
  channels402House: Record<string, number>;
  channels402Infra: Record<string, number>;
  /** day-of-month -> organic counts, the trend table. */
  days: Record<string, { challenges: number; settles: number }>;
  /** ?src= venue markers seen on organic traffic, verbatim claims. */
  venues: Record<string, number>;
  /** USDC, organic and house apart. */
  revenueUsdc: number;
  revenueHouseUsdc: number;
}

function emptyRow(): LedgerRow {
  return {
    challenges: 0,
    challengesHouse: 0,
    challengesInfra: 0,
    settled: 0,
    settledHouse: 0,
    verifies: 0,
    verifiesHouse: 0,
    verifiesInfra: 0,
    tiers: {},
  };
}

/**
 * The founding $0.50 hello settle (2026-07-22, tx 0x47c8fee…50bc9c)
 * predates this instrumentation. Entered by hand as house/founding so
 * the books open complete.
 */
const FOUNDING_BACKFILL = { month: "2026-07", item: "hello" } as const;

/** Everything the month's counters know, organic and house apart. */
export async function readMonthLedger(
  env: Env,
  month: string = metricsMonth(),
): Promise<MonthLedger> {
  const ledger: MonthLedger = {
    month,
    items: {},
    channels: {},
    channelsHouse: {},
    channels402: {},
    channels402House: {},
    channels402Infra: {},
    days: {},
    venues: {},
    revenueUsdc: 0,
    revenueHouseUsdc: 0,
  };
  const listed = await env.COUNTERS.list({
    prefix: KV_KEYS.metricMonthPrefix(month),
  });
  const values = await bulkGetText(
    env.COUNTERS,
    listed.keys.map((key) => key.name),
  );
  for (const key of listed.keys) {
    const value = parseInt(values.get(key.name) ?? "0", 10);
    const rest = key.name.slice(KV_KEYS.metricMonthPrefix(month).length);
    const [kind, ...parts] = rest.split(":");
    const tail = parts.join(":");
    if (kind?.startsWith("porch")) {
      continue; // The porch table reads these; the ledger doesn't.
    }
    if (kind === "d402" || kind === "dpaid") {
      const day = (ledger.days[tail] ??= { challenges: 0, settles: 0 });
      if (kind === "d402") day.challenges = value;
      else day.settles = value;
      continue;
    }
    if (kind === "venue") {
      ledger.venues[tail] = value;
      continue;
    }
    if (kind === "rev" || kind === "revh") {
      const usdc = value / 1_000_000;
      if (kind === "rev") ledger.revenueUsdc += usdc;
      else ledger.revenueHouseUsdc += usdc;
      continue;
    }
    if (kind === "src") {
      ledger.channels[tail] = value;
      continue;
    }
    if (kind === "srch") {
      ledger.channelsHouse[tail] = value;
      continue;
    }
    if (kind === "src402") {
      ledger.channels402[tail] = value;
      continue;
    }
    if (kind === "src402h") {
      ledger.channels402House[tail] = value;
      continue;
    }
    if (kind === "src402i") {
      ledger.channels402Infra[tail] = value;
      continue;
    }
    if (kind === "tier" || kind === "tierh") {
      const splitAt = tail.lastIndexOf(":");
      const row = (ledger.items[tail.slice(0, splitAt)] ??= emptyRow());
      const tier = tail.slice(splitAt + 1) + (kind === "tierh" ? " (house)" : "");
      row.tiers[tier] = value;
      continue;
    }
    const row = (ledger.items[tail] ??= emptyRow());
    if (kind === "402") row.challenges = value;
    else if (kind === "402h") row.challengesHouse = value;
    else if (kind === "402i") row.challengesInfra = value;
    else if (kind === "paid") row.settled = value;
    else if (kind === "paidh") row.settledHouse = value;
    else if (kind === "verify") row.verifies = value;
    else if (kind === "verifyh") row.verifiesHouse = value;
    else if (kind === "verifyi") row.verifiesInfra = value;
  }
  if (month === FOUNDING_BACKFILL.month) {
    const row = (ledger.items[FOUNDING_BACKFILL.item] ??= emptyRow());
    row.settledHouse += 1;
    ledger.channelsHouse["direct (founding, by hand)"] =
      (ledger.channelsHouse["direct (founding, by hand)"] ?? 0) + 1;
  }
  return ledger;
}

export interface PorchLedger {
  /** surface -> bucket ("organic" | "house" | "infrastructure") -> count */
  surfaces: Record<string, Record<string, number>>;
  /** organic porch visits total */
  organicVisits: number;
  /** organic 402s per organic porch visit, the conversion story. */
  porchToPurchase: number | null;
  /** True when the row scan hit its cap; counts are floors. */
  truncated: boolean;
}

/**
 * The front-porch section, read from the monthly porch aggregates
 * (written alongside each event row) in one list + one bulk read.
 * Uniqueness is deliberately unavailable, no cookies, no IP
 * retention, so porch-to-purchase is organic 402s per organic
 * visit, stated as a rate, not unique heads.
 */
export async function readPorchLedger(
  env: Env,
  month: string = metricsMonth(),
): Promise<PorchLedger> {
  const porch: PorchLedger = {
    surfaces: {},
    organicVisits: 0,
    porchToPurchase: null,
    truncated: false,
  };
  const prefix = KV_KEYS.metricMonthPrefix(month);
  const listed = await env.COUNTERS.list({ prefix });
  const names = listed.keys
    .map((key) => key.name)
    .filter((name) => {
      const kind = name.slice(prefix.length).split(":")[0] ?? "";
      return kind.startsWith("porch") || kind === "src402";
    });
  const values = await bulkGetText(env.COUNTERS, names);
  let organicChallenges = 0;
  for (const name of names) {
    const value = parseInt(values.get(name) ?? "0", 10);
    const rest = name.slice(prefix.length);
    const [kind, ...parts] = rest.split(":");
    if (kind === "src402") {
      organicChallenges += value;
      continue;
    }
    if (kind === "porch") {
      // Organic rows carry surface:channel.
      const channel = parts.pop() ?? "unknown";
      const surfaceName = parts.join(":") || "unknown";
      const surface = (porch.surfaces[surfaceName] ??= {});
      surface["organic"] = (surface["organic"] ?? 0) + value;
      surface[`organic:${channel}`] =
        (surface[`organic:${channel}`] ?? 0) + value;
      porch.organicVisits += value;
      continue;
    }
    if (kind === "porchh" || kind === "porchi") {
      const bucket = kind === "porchh" ? "house" : "infrastructure";
      const surface = (porch.surfaces[parts.join(":")] ??= {});
      surface[bucket] = (surface[bucket] ?? 0) + value;
    }
  }
  if (porch.organicVisits > 0) {
    porch.porchToPurchase =
      Math.round((organicChallenges / porch.organicVisits) * 1000) / 1000;
  }
  return porch;
}

/** The window-shoppers up close: the most recent 402 events, raw. */
export async function listRecentChallenges(
  env: Env,
  limit = 15,
): Promise<MetricEvent[]> {
  // Newest first by key design; one list + one bulk read, bounded.
  const listed = await env.COUNTERS.list({ prefix: "evt:", limit: 100 });
  const names = listed.keys.map((key) => key.name);
  const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
  const events: MetricEvent[] = [];
  for (const name of names) {
    if (events.length >= limit) {
      break;
    }
    const event = values.get(name);
    if (event?.kind === "challenge") {
      events.push(event);
    }
  }
  return events;
}

/**
 * Recent porch events for one surface, read from the raw 90-day rows
 * (the aggregates only count from their deploy; the rows remember).
 * Bounded scan: rare surfaces like the bell can sit deep in the log,
 * so this walks further than the challenge lister, still capped.
 */
export async function listRecentPorchEvents(
  env: Env,
  surface: string,
  limit = 25,
): Promise<MetricEvent[]> {
  const events: MetricEvent[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  const SCAN_CAP = 3000;
  while (events.length < limit && scanned < SCAN_CAP) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    scanned += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (events.length >= limit) {
        break;
      }
      const event = values.get(name);
      if (event?.kind === "porch" && event.item === surface) {
        events.push(event);
      }
    }
    if (listed.list_complete) {
      break;
    }
    cursor = listed.cursor;
  }
  return events;
}

/** Recent paying wallets, for the cohort/wash-filter review. */
export async function listPayers(env: Env, limit = 50): Promise<PayerRecord[]> {
  const listed = await env.COUNTERS.list({ prefix: KV_KEYS.payerPrefix, limit });
  const values = await bulkGetJson<PayerRecord>(
    env.COUNTERS,
    listed.keys.map((key) => key.name),
  );
  const payers: PayerRecord[] = [];
  for (const record of values.values()) {
    if (record) {
      payers.push(record);
    }
  }
  payers.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  return payers;
}
