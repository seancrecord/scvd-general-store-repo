import { kvGet, kvPut } from "@/lib/kv-retry";
import { computeNetStatement, type NetStatement } from "@/services/net-statement";
import { computePulse, type Pulse } from "@/services/pulse";
import { computeStatsDiagnosed, type BooksDiagnostics, type StoreStats } from "@/services/stats";
import type { Env } from "@/types";

// Outside metric:<month>: so a report cannot accidentally count itself.
export const PUBLIC_STATISTICS_CRON = "15 * * * *";
export const PUBLIC_STATISTICS_KEY = "public_statistics:v1";
export const PUBLIC_STATISTICS_INTERVAL_SECONDS = 60 * 60;

export interface PublicStatistics {
  version: 1;
  computed_at: string;
  books: BooksDiagnostics;
  pulse: Pulse;
  net_by_chain: NetStatement | null;
}

/** Only the scheduled writer computes. A cold or missing read never rebuilds. */
export async function refreshPublicStatistics(env: Env): Promise<PublicStatistics> {
  const started = new Date();
  const [books, pulse, net] = await Promise.all([
    computeStatsDiagnosed(env),
    computePulse(env, { now: started }),
    // This optional instrument was already fail-soft on /stats. Its absence
    // stays visible; it must not be replaced with an invented zero statement.
    computeNetStatement(env).catch(() => null),
  ]);
  const summary: PublicStatistics = {
    version: 1,
    computed_at: started.toISOString(),
    books,
    pulse,
    net_by_chain: net,
  };
  // No expiry: failed refreshes leave the last dated reading available. A
  // single write publishes the pair only after both core calculations finish.
  await kvPut(env.COUNTERS, PUBLIC_STATISTICS_KEY, JSON.stringify(summary));
  return summary;
}

export async function readPublicStatistics(env: Env): Promise<PublicStatistics | null> {
  const raw = await kvGet(env.COUNTERS, PUBLIC_STATISTICS_KEY);
  if (!raw) return null;
  try {
    const saved: PublicStatistics = JSON.parse(raw);
    if (saved?.version !== 1 || !Number.isFinite(Date.parse(saved.computed_at)) ||
      !saved.books?.stats || !saved.books.till_by_item ||
      !Number.isFinite(Date.parse(saved.books.stats.computed_at)) ||
      !saved.pulse?.all_time || !Array.isArray(saved.pulse.months) ||
      !Number.isFinite(Date.parse(saved.pulse.computed_at))) return null;
    return saved;
  } catch {
    return null;
  }
}

/** Presentation-only consumers may omit the figures until the first refresh. */
export async function readPublicStats(env: Env): Promise<StoreStats | null> {
  return (await readPublicStatistics(env))?.books.stats ?? null;
}

export function publicStatisticsStatus(summary: PublicStatistics, now = new Date()) {
  return {
    computed_at: summary.computed_at,
    refresh: "hourly",
    stale: now.getTime() - Date.parse(summary.computed_at) > PUBLIC_STATISTICS_INTERVAL_SECONDS * 1000,
  };
}

export function publicStatisticsUnavailable(): Response {
  return Response.json({
    code: "statistics_unavailable",
    message: "The public statistics summary is not available yet. It refreshes hourly; please try again later.",
  }, { status: 503, headers: { "Retry-After": String(PUBLIC_STATISTICS_INTERVAL_SECONDS), "Cache-Control": "no-store" } });
}
