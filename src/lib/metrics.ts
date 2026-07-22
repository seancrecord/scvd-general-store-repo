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

export type MetricEventKind = "challenge" | "settle" | "verify";

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

function kindKey(kind: string, house: boolean): string {
  return house ? `${kind}h` : kind;
}

/** A 402 went out. The organic issued/settled gap is the price signal. */
export async function recordChallengeIssued(
  env: Env,
  path: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "challenge", itemKeyFromPath(path), signals);
  await bump(env, KV_KEYS.metric(metricsMonth(), kindKey("402", event.house), event.item));
  await writeEvent(env, event);
}

/** Somebody re-checked one of our signatures. Re-verification is demand. */
export async function recordVerifyCall(
  env: Env,
  artifactItem: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "verify", artifactItem, signals);
  await bump(env, KV_KEYS.metric(metricsMonth(), kindKey("verify", event.house), event.item));
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
  await bump(env, KV_KEYS.metric(month, kindKey("paid", event.house), event.item));
  await bump(
    env,
    KV_KEYS.metric(
      month,
      kindKey("tier", event.house),
      `${event.item}:${tierLabel(signals.paidUsdc, signals.minimumUsdc)}`,
    ),
  );
  await bump(env, KV_KEYS.metric(month, kindKey("src", event.house), event.channel));
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
  settled: number;
  settledHouse: number;
  verifies: number;
  verifiesHouse: number;
  tiers: Record<string, number>;
}

export interface MonthLedger {
  month: string;
  items: Record<string, LedgerRow>;
  /** channel -> organic settled count */
  channels: Record<string, number>;
  channelsHouse: Record<string, number>;
}

function emptyRow(): LedgerRow {
  return {
    challenges: 0,
    challengesHouse: 0,
    settled: 0,
    settledHouse: 0,
    verifies: 0,
    verifiesHouse: 0,
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
  const ledger: MonthLedger = { month, items: {}, channels: {}, channelsHouse: {} };
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
    else if (kind === "paid") row.settled = value;
    else if (kind === "paidh") row.settledHouse = value;
    else if (kind === "verify") row.verifies = value;
    else if (kind === "verifyh") row.verifiesHouse = value;
  }
  if (month === FOUNDING_BACKFILL.month) {
    const row = (ledger.items[FOUNDING_BACKFILL.item] ??= emptyRow());
    row.settledHouse += 1;
    ledger.channelsHouse["direct (founding, by hand)"] =
      (ledger.channelsHouse["direct (founding, by hand)"] ?? 0) + 1;
  }
  return ledger;
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
