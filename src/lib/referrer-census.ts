import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * WHO LINKS HERE, BY MONTH (2026-09-11, the growth ledger).
 *
 * Referrers were kept on every event row and read back on
 * /admin/referrals by scanning those rows — which expire at 90 days.
 * So the store could say who linked to it last week and nothing about
 * whether a directory that sent forty readers in July still sends any
 * in September. Word of mouth had no history.
 *
 * ONE KEY PER MONTH, A CAPPED MAP INSIDE IT — the MCP client census's
 * shape, for the MCP client census's reason. A Referer is a stranger's
 * string; a per-host KEY would let anyone mint counter keys with a
 * header. A map inside one key cannot grow past its cap, and past the
 * cap the count lands on `other` rather than on the floor. A count
 * that stops counting is worse than one that says how much it could
 * not name.
 *
 * HOSTS, NEVER PATHS. The path a reader came from can carry a query
 * string, a session, a search — none of it ours to keep. The host says
 * which door sent them, which is the whole question.
 *
 * Read-modify-write on one key, so two referred visits landing in the
 * same instant can lose one: a floor, said wherever it is printed.
 */

export const REFERRER_HOST_CAP = 40;

export function referrerCensusKey(month: string): string {
  return KV_KEYS.metric(month, "refhost", "census");
}

/** Bare host, lowercased and bounded; undefined when the referrer is not a URL. */
export function referrerHost(referrer: string): string | undefined {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.length > 0 && host.length <= 120 ? host : undefined;
  } catch {
    return undefined;
  }
}

/** The store's own host, so a reader following our links is not a referral. */
export function selfHost(env: Env): string {
  try {
    return new URL(env.STORE_BASE_URL).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function readReferrerCensus(
  env: Env,
  month: string,
): Promise<Record<string, number>> {
  const raw = await kvGet(env.COUNTERS, referrerCensusKey(month));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Count one referred visit. Returns false when nothing was counted:
 * no referrer, not a URL, or our own host — a reader following the
 * store's own links is a reader, not word of mouth.
 */
export async function recordReferrerHost(
  env: Env,
  referrer: string | undefined,
  month: string,
): Promise<boolean> {
  if (!referrer) return false;
  const host = referrerHost(referrer);
  if (!host) return false;
  const own = selfHost(env);
  if (own && (host === own || host.endsWith(`.${own}`))) return false;
  const census = await readReferrerCensus(env, month);
  if (census[host] === undefined && Object.keys(census).length >= REFERRER_HOST_CAP) {
    census["other"] = (census["other"] ?? 0) + 1;
  } else {
    census[host] = (census[host] ?? 0) + 1;
  }
  await kvPut(env.COUNTERS, referrerCensusKey(month), JSON.stringify(census));
  return true;
}
