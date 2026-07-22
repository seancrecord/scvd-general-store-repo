import { inferChannel, isHouseTraffic } from "@/lib/channel";
import type { ChannelSignals, HouseSignals } from "@/lib/channel";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import type { Channel, Env, PayerRecord } from "@/types";

/**
 * The instrumentation ledger (RUN1_SYNTHESIS §instrumentation, plus the
 * Phase 1 attribution pass). Aggregate counters live in COUNTERS under
 * metric:<YYYY-MM>:<kind>:<rest> — kinds carry an "h" suffix for house
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
  const current = await env.COUNTERS.get(key);
  await env.COUNTERS.put(key, String((current ? parseInt(current, 10) : 0) + 1));
}

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
 * never bucket as infrastructure — a crawler that pays is a customer.
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
  // Who's window-shopping, by channel — the diagnosis column for
  // "challenges without settles: shoppers or scanners?"
  await bump(env, KV_KEYS.metric(metricsMonth(), `src402${suffix}`, event.channel));
  await writeEvent(env, event);
}

/**
 * Front-porch logging: one event row per free-tier visit. Paths and
 * headers only — no bodies, no cookies, nothing client-side. Rows use
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
  };
  const listed = await env.COUNTERS.list({
    prefix: KV_KEYS.metricMonthPrefix(month),
  });
  for (const key of listed.keys) {
    const value = parseInt((await env.COUNTERS.get(key.name)) ?? "0", 10);
    const rest = key.name.slice(KV_KEYS.metricMonthPrefix(month).length);
    const [kind, ...parts] = rest.split(":");
    const tail = parts.join(":");
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
  /** organic 402s per organic porch visit — the conversion story. */
  porchToPurchase: number | null;
  /** True when the row scan hit its cap; counts are floors. */
  truncated: boolean;
}

const PORCH_SCAN_CAP = 1000;

/**
 * The front-porch section, computed from event rows at read time (no
 * porch counters exist to contend over). Uniqueness is deliberately
 * unavailable — no cookies, no IP retention — so porch-to-purchase is
 * organic 402s per organic visit, stated as a rate, not unique heads.
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
  const listed = await env.COUNTERS.list({ prefix: "evt:", limit: PORCH_SCAN_CAP });
  porch.truncated = !listed.list_complete;
  let organicChallenges = 0;
  for (const key of listed.keys) {
    const event = await env.COUNTERS.get<MetricEvent>(key.name, "json");
    if (!event || !event.at.startsWith(month)) {
      continue;
    }
    if (event.kind === "challenge" && !event.house && event.channel !== "infrastructure") {
      organicChallenges += 1;
    }
    if (event.kind !== "porch") {
      continue;
    }
    const bucket = event.house
      ? "house"
      : event.channel === "infrastructure"
        ? "infrastructure"
        : "organic";
    const surface = (porch.surfaces[event.item] ??= {});
    surface[bucket] = (surface[bucket] ?? 0) + 1;
    surface[`${bucket}:${event.channel}`] =
      (surface[`${bucket}:${event.channel}`] ?? 0) + 1;
    if (bucket === "organic") {
      porch.organicVisits += 1;
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
  const events: MetricEvent[] = [];
  const listed = await env.COUNTERS.list({ prefix: "evt:", limit: 500 });
  for (const key of listed.keys) {
    if (events.length >= limit) {
      break;
    }
    const event = await env.COUNTERS.get<MetricEvent>(key.name, "json");
    if (event?.kind === "challenge") {
      events.push(event);
    }
  }
  return events;
}

/** Recent paying wallets, for the cohort/wash-filter review. */
export async function listPayers(env: Env, limit = 50): Promise<PayerRecord[]> {
  const listed = await env.COUNTERS.list({ prefix: KV_KEYS.payerPrefix, limit });
  const payers: PayerRecord[] = [];
  for (const key of listed.keys) {
    const record = await env.COUNTERS.get<PayerRecord>(key.name, "json");
    if (record) {
      payers.push(record);
    }
  }
  payers.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  return payers;
}
