import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, PayerRecord } from "@/types";

/**
 * Day-one instrumentation, per RUN1_SYNTHESIS §instrumentation: the
 * ledger must answer what research cannot. Counters live in COUNTERS
 * under metric:<YYYY-MM>:<kind>:<rest>; paying wallets get a first-seen
 * record under payer:<address>. Counters are read-modify-write — a lost
 * increment under heavy contention is acceptable chaos for a store this
 * size. Reviewed monthly from /admin; the ledger outranks research.
 */

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

/** A 402 challenge went out. The gap between these and settlements is the price signal. */
export async function recordChallengeIssued(
  env: Env,
  path: string,
): Promise<void> {
  await bump(env, KV_KEYS.metric(metricsMonth(), "402", itemKeyFromPath(path)));
}

/** Which PWID tier the buyer chose; elasticity signal. */
function tierLabel(paidUsdc: number, minimumUsdc: number): string {
  if (minimumUsdc <= 0) {
    return "1x";
  }
  const ratio = Math.round(paidUsdc / minimumUsdc);
  return ratio >= 5 ? "5x" : ratio >= 2 ? "2x" : "1x";
}

/** Rough discovery-channel classification for the settle counter. */
function channelLabel(
  declaredSource: string | undefined,
  referrer: string | undefined,
): string {
  if (declaredSource) {
    return `declared:${declaredSource.slice(0, 24)}`;
  }
  if (referrer) {
    try {
      return `ref:${new URL(referrer).hostname.slice(0, 40)}`;
    } catch {
      return "ref:unparsable";
    }
  }
  return "direct";
}

export interface SettlementSignals {
  paidUsdc: number;
  minimumUsdc: number;
  payer?: string;
  declaredSource?: string;
  referrer?: string;
}

/** Money settled: count it, tier it, attribute it, remember the wallet. */
export async function recordSettlement(
  env: Env,
  path: string,
  signals: SettlementSignals,
): Promise<void> {
  const month = metricsMonth();
  const item = itemKeyFromPath(path);
  await bump(env, KV_KEYS.metric(month, "paid", item));
  await bump(
    env,
    KV_KEYS.metric(month, "tier", `${item}:${tierLabel(signals.paidUsdc, signals.minimumUsdc)}`),
  );
  await bump(
    env,
    KV_KEYS.metric(month, "src", channelLabel(signals.declaredSource, signals.referrer)),
  );
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

export interface MonthLedger {
  month: string;
  /** item -> { challenges, settled, tiers } */
  items: Record<
    string,
    { challenges: number; settled: number; tiers: Record<string, number> }
  >;
  /** discovery channel -> settled count */
  sources: Record<string, number>;
}

/** Everything the month's counters know, assembled for the back room. */
export async function readMonthLedger(
  env: Env,
  month: string = metricsMonth(),
): Promise<MonthLedger> {
  const ledger: MonthLedger = { month, items: {}, sources: {} };
  const listed = await env.COUNTERS.list({
    prefix: KV_KEYS.metricMonthPrefix(month),
  });
  for (const key of listed.keys) {
    const value = parseInt((await env.COUNTERS.get(key.name)) ?? "0", 10);
    const rest = key.name.slice(KV_KEYS.metricMonthPrefix(month).length);
    const [kind, ...parts] = rest.split(":");
    const tail = parts.join(":");
    if (kind === "src") {
      ledger.sources[tail] = value;
      continue;
    }
    if (kind === "tier") {
      const splitAt = tail.lastIndexOf(":");
      const item = tail.slice(0, splitAt);
      const tier = tail.slice(splitAt + 1);
      const row = (ledger.items[item] ??= { challenges: 0, settled: 0, tiers: {} });
      row.tiers[tier] = value;
      continue;
    }
    const row = (ledger.items[tail] ??= { challenges: 0, settled: 0, tiers: {} });
    if (kind === "402") {
      row.challenges = value;
    } else if (kind === "paid") {
      row.settled = value;
    }
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
