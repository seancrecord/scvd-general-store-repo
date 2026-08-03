import { createAuthHeader } from "@coinbase/x402";
import { runChecks } from "@/services/preflight";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * THE WARD ROUND — the weekly in-Worker census of the x402 discovery
 * list, so the ecosystem picture the outreach and the writeups stand
 * on cannot go stale by nobody remembering to run a script.
 *
 * Named to stay OUT of two other instruments' way: /admin/census is
 * the VISITOR census (who walked into our store), and the Night Watch
 * is per-customer paid monitoring. This is the ward — the whole
 * neighbourhood, walked once a week, aggregate.
 *
 * WHAT IT DOES with each host is exactly what the hand-run census
 * script did, from the same one law (services/preflight.ts runChecks):
 * one GET per declared host per week — indexer-cadence, the same
 * consent shape as any crawler reading a public discovery document.
 *
 * WHAT IT PUBLISHES: nothing, on its own. Results land in KV; the
 * keeper reads them at /admin/ward with the week-over-week delta.
 * Anything public stays a hand's decision (rule 30). The delta is the
 * point: NEW hosts (nobody gets missed as they appear), NEWLY FAILING
 * (fresh outreach leads), NEWLY FIXED (outreach that worked, or the
 * market healing), and FLAPPERS (verdict changed week to week — the
 * Night Watch's natural prospects, found mechanically).
 *
 * PLUS ONE CHECK ABOUT US: our own presence in the discovery SEARCH
 * index — the authoritative surface per bazaar-check's recorded
 * lesson (a list-page miss says nothing; search decides). Absent =
 * an alert, because silently falling out of the index is a channel
 * dying with no symptom on any surface we watch.
 */

const CDP_HOST = "api.cdp.coinbase.com";
const DISCOVERY_PATH = "/platform/v2/x402/discovery/resources";
const SEARCH_PATH = "/platform/v2/x402/discovery/search";
/** Hosts per round, far above today's 35; the round says when it binds. */
const WARD_CAP = 200;
const PROBE_TIMEOUT_MS = 8000;

export interface WardHostResult {
  host: string;
  url: string;
  verdict: "ready" | "not_ready" | "unreachable";
  failed: string[];
  advisories: string[];
}

export interface WardRound {
  week: string;
  at: string;
  listed_resources: number;
  /** True when a full page arrived with no recognizable cursor. */
  coverage_suspect: boolean;
  capped: boolean;
  our_search_presence: boolean | null;
  hosts: WardHostResult[];
}

export interface WardDelta {
  new_hosts: string[];
  gone_hosts: string[];
  newly_failing: string[];
  newly_fixed: string[];
  /** Verdict changed in any direction — the intermittency signal. */
  flappers: string[];
}

async function cdpGet(env: Env, path: string, query = ""): Promise<unknown> {
  const token = await createAuthHeader(
    env.CDP_API_KEY_ID,
    env.CDP_API_KEY_SECRET,
    "GET",
    CDP_HOST,
    path,
  );
  const response = await fetch(`https://${CDP_HOST}${path}${query}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  return response.json();
}

interface DiscoveryRead {
  hosts: { host: string; url: string }[];
  listed: number;
  coverageSuspect: boolean;
}

async function readDiscoveryList(env: Env): Promise<DiscoveryRead> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  let coverageSuspect = false;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (cursor) params.set("pageToken", cursor);
    const body = (await cdpGet(env, DISCOVERY_PATH, `?${params}`)) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    const items = (body["items"] ?? body["resources"] ?? body["data"] ?? []) as Record<string, unknown>[];
    rows.push(...items);
    cursor =
      body["nextPageToken"] ?? body["next_page_token"] ?? body["cursor"] ??
      body["pagination"]?.nextPageToken ?? body["pagination"]?.cursor;
    if (!cursor) {
      // A full page and no recognized cursor is a page cap wearing
      // completeness — the hand-run census's own recorded lesson.
      coverageSuspect = items.length > 0 && items.length % 100 === 0;
      break;
    }
    if (items.length === 0) break;
  }
  const seen = new Set<string>();
  const hosts: { host: string; url: string }[] = [];
  for (const row of rows) {
    const url = (row["resourceUrl"] ?? row["resource_url"] ?? row["resource"] ?? row["url"]) as unknown;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    let host: string;
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      continue;
    }
    if (host === ownHost || seen.has(host)) continue;
    seen.add(host);
    hosts.push({ host, url });
  }
  return { hosts, listed: rows.length, coverageSuspect };
}

async function probeHost(url: string): Promise<Omit<WardHostResult, "host" | "url">> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    await response.body?.cancel().catch(() => undefined);
    const { checks, advisories } = runChecks(response, false);
    const failed = checks.filter((check) => !check.ok).map((check) => check.name);
    return {
      verdict: failed.length === 0 ? "ready" : "not_ready",
      failed,
      advisories: advisories.map((advisory) => advisory.name),
    };
  } catch {
    return { verdict: "unreachable", failed: [], advisories: [] };
  }
}

/** Search decides presence; a list miss says nothing (bazaar-check's law). */
async function ourSearchPresence(env: Env): Promise<boolean | null> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  try {
    const body = (await cdpGet(
      env,
      SEARCH_PATH,
      `?query=${encodeURIComponent(ownHost)}`,
    )) as Record<string, unknown>;
    const text = JSON.stringify(body).toLowerCase();
    return text.includes(ownHost);
  } catch {
    // An unreadable search is "could not check", never "absent".
    return null;
  }
}

export async function runWardRound(env: Env): Promise<WardRound> {
  const { hosts, listed, coverageSuspect } = await readDiscoveryList(env);
  const capped = hosts.length > WARD_CAP;
  const results: WardHostResult[] = [];
  for (const entry of hosts.slice(0, WARD_CAP)) {
    results.push({ ...entry, ...(await probeHost(entry.url)) });
  }
  const presence = await ourSearchPresence(env);
  const round: WardRound = {
    week: currentWeekKey(),
    at: new Date().toISOString(),
    listed_resources: listed,
    coverage_suspect: coverageSuspect,
    capped,
    our_search_presence: presence,
    hosts: results,
  };
  const previous = await latestWardRound(env);
  await env.COUNTERS.put(KV_KEYS.wardRound(round.week), JSON.stringify(round));
  await env.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round));
  if (previous && previous.week !== round.week) {
    await env.COUNTERS.put(
      KV_KEYS.wardRoundPrevious,
      JSON.stringify(previous),
    );
  }
  /**
   * The one alarm: WE fell out of the search index. Everything else
   * on the round is a reading for the keeper's eyes on his own time;
   * this one is a channel dying with no symptom anywhere else.
   */
  if (presence === false) {
    await sendAlert(env, {
      condition: "worker_health",
      detail:
        "The ward round could not find this store in the CDP discovery SEARCH index. Search is the authoritative surface — if this repeats next week, the Bazaar channel is quietly gone. Check /admin/ward and re-run bazaar:check by hand.",
    }).catch(() => undefined);
  }
  return round;
}

export async function latestWardRound(env: Env): Promise<WardRound | null> {
  return env.COUNTERS.get<WardRound>(KV_KEYS.wardRoundLatest, "json");
}

export async function previousWardRound(env: Env): Promise<WardRound | null> {
  return env.COUNTERS.get<WardRound>(KV_KEYS.wardRoundPrevious, "json");
}

export function wardDelta(
  current: WardRound,
  previous: WardRound | null,
): WardDelta {
  if (!previous) {
    return {
      new_hosts: current.hosts.map((entry) => entry.host),
      gone_hosts: [],
      newly_failing: [],
      newly_fixed: [],
      flappers: [],
    };
  }
  const before = new Map(previous.hosts.map((entry) => [entry.host, entry]));
  const after = new Map(current.hosts.map((entry) => [entry.host, entry]));
  const delta: WardDelta = {
    new_hosts: [...after.keys()].filter((host) => !before.has(host)),
    gone_hosts: [...before.keys()].filter((host) => !after.has(host)),
    newly_failing: [],
    newly_fixed: [],
    flappers: [],
  };
  for (const [host, now] of after) {
    const was = before.get(host);
    if (!was) continue;
    if (was.verdict !== now.verdict) {
      delta.flappers.push(host);
      if (now.verdict === "ready") {
        delta.newly_fixed.push(host);
      } else if (was.verdict === "ready") {
        delta.newly_failing.push(host);
      }
    }
  }
  return delta;
}
