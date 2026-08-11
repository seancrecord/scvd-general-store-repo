import { createAuthHeader } from "@coinbase/x402";
import { runChecks } from "@/services/preflight";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { takeCensus, type PopulationCensus, type SourceResult } from "@/services/population";
import { readFuchssProviders, UNREAD_DIRECTORIES } from "@/services/ward-sources";
import { webBotAuthHeaders, type WbaEnv } from "@/lib/web-bot-auth";
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

/**
 * A VOLUME CLAIM, labeled as one. The agent402.tools leaderboard
 * ranks sellers by chain-scanned Base USDC volume — the good kind of
 * source mechanically, BUT Artemis classified ~78% of the ecosystem's
 * peak transactions and ~98% of volume as non-organic (recorded
 * 2026-08-04), so in this ecosystem a volume ranking largely ranks
 * wash. The ward uses the feed for POPULATION (who exists, who to
 * probe) and records volume as testimony with its source and window
 * attached — never as importance. Our conformance probe is the till.
 */
export interface WardVolumeClaim {
  calls: number;
  usd: number;
  unique_buyers: number;
  window: string;
  source: "agent402.tools";
}

export interface WardHostResult {
  host: string;
  url: string;
  /**
   * "not_probed" (2026-08-04, the first two-feed round's lesson): a
   * leaderboard row's origin is a HOMEPAGE, not a paid resource URL —
   * probing it for a 402 manufactured ~160 false not_readys in one
   * round. Leaderboard-only hosts are population, listed with their
   * claims, excluded from the ready arithmetic and the delta until
   * discovery hands us a real door to knock on.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "not_probed";
  failed: string[];
  advisories: string[];
  /** Which feed(s) named this host. Absent on pre-feed rounds = discovery. */
  source?: "discovery" | "leaderboard" | "both";
  volume_claim?: WardVolumeClaim;
}

export interface WardRound {
  week: string;
  at: string;
  listed_resources: number;
  /** True when a full page arrived with no recognizable cursor. */
  coverage_suspect: boolean;
  /**
   * Set when this round probed under 60% of the last one's hosts:
   * the loud version of coverage_suspect, with the numbers.
   */
  coverage_drop?: {
    previous_hosts: number;
    this_round: number;
    previous_at: string;
  };
  capped: boolean;
  our_search_presence: boolean | null;
  /**
   * Leaderboard feed health, could-not-check kept distinct from
   * absent: sellers null = the FEED was unreachable this round (say
   * nothing about anybody); sellers set with our rank null = the feed
   * answered and we are not on it (expected at our volume; recorded,
   * never alarmed).
   */
  leaderboard_sellers?: number | null;
  leaderboard_window?: string | null;
  our_leaderboard_rank?: number | null;
  /**
   * THE DENOMINATOR. Enumeration is nearly free and probing is not, so
   * the round counts every host its feeds NAME and probes as many as
   * the cap allows. Absent on rounds recorded before the population
   * layer existed — a reader must treat missing as "not measured",
   * never as 100% coverage.
   */
  population?: PopulationCensus;
  /**
   * The directories the round knows exist and could not read, each
   * with the reason (2026-08-10, the widening ruling). The roster is
   * only uniform if its gaps are published on the same artifact as
   * its findings. Absent on pre-widening rounds.
   */
  directories_unread?: { source: string; why: string }[];
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
    // Every cursor spelling seen or plausible in the wild. The
    // 2026-08-05 round read exactly one page (100 resources, 38
    // hosts) after weeks of several hundred — the feed's pagination
    // shape moved and the old three spellings stopped matching.
    cursor =
      body["nextPageToken"] ?? body["next_page_token"] ?? body["cursor"] ??
      body["nextCursor"] ?? body["next_cursor"] ?? body["nextPage"] ??
      body["pagination"]?.nextPageToken ?? body["pagination"]?.cursor ??
      body["pagination"]?.nextCursor ?? body["pagination"]?.next_cursor ??
      body["meta"]?.nextCursor ?? body["meta"]?.next_cursor ??
      body["paging"]?.cursor ?? body["paging"]?.next;
    // A links.next full URL counts too: take its pageToken/cursor.
    if (!cursor) {
      const nextUrl = body["links"]?.next ?? body["next"];
      if (typeof nextUrl === "string" && nextUrl.includes("=")) {
        try {
          const parsed = new URL(nextUrl, "https://api.cdp.coinbase.com");
          cursor =
            parsed.searchParams.get("pageToken") ??
            parsed.searchParams.get("cursor") ??
            undefined;
        } catch {
          /* not a URL; fall through to the cap check */
        }
      }
    }
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

async function probeHost(
  env: WbaEnv,
  url: string,
): Promise<Omit<WardHostResult, "host" | "url">> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // The census knocks on strangers' doors weekly; since
      // 2026-08-11 the knock is signed (Web Bot Auth) where the
      // egress key allows, so a host reading its logs can verify who
      // asked rather than trust a spoofable user-agent string.
      headers: await webBotAuthHeaders(env, url, {
        Accept: "application/json",
      }),
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

const LEADERBOARD_URL = "https://agent402.tools/api/leaderboard";

export interface LeaderboardRead {
  sellers: number;
  window: string;
  ourRank: number | null;
  /** host -> claim + example origin URL, for probing and labeling. */
  byHost: Map<string, { url: string; claim: WardVolumeClaim }>;
}

/**
 * Shape verified against a live response 2026-08-04 (spec
 * "x402-leaderboard/1"): rows carry name, origins[], rank,
 * callsSettled, totalUsd, uniqueBuyers; top-level windowServed admits
 * when the cache served a wider window than asked. Pure so tests can
 * feed it captured bodies.
 */
export function mapLeaderboard(
  body: unknown,
  ownHost: string,
): LeaderboardRead | null {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["spec"] !== "string" ||
    !String((body as Record<string, unknown>)["spec"]).startsWith(
      "x402-leaderboard/",
    )
  ) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record["leaderboard"])
    ? (record["leaderboard"] as Record<string, unknown>[])
    : [];
  const window = String(record["windowServed"] ?? record["windowLabel"] ?? "?");
  const byHost = new Map<string, { url: string; claim: WardVolumeClaim }>();
  let ourRank: number | null = null;
  for (const row of rows) {
    const origins = Array.isArray(row["origins"]) ? row["origins"] : [];
    const claim: WardVolumeClaim = {
      calls: Number(row["callsSettled"] ?? 0),
      usd: Number(row["totalUsd"] ?? 0),
      unique_buyers: Number(row["uniqueBuyers"] ?? 0),
      window,
      source: "agent402.tools",
    };
    /**
     * ONE ORIGIN PER SELLER (the first round's other lesson): rows
     * list every origin a seller ever settled from — Vercel preview
     * deploys, a ninety-subdomain farm — all sharing one claim.
     * Walking them all repeated the same claim ninety times and told
     * us nothing the first origin didn't. Our own host anywhere in
     * the row still claims the rank.
     */
    let taken = false;
    for (const origin of origins) {
      if (typeof origin !== "string" || !origin.startsWith("https://")) {
        continue;
      }
      let host: string;
      try {
        host = new URL(origin).host.toLowerCase();
      } catch {
        continue;
      }
      if (host === ownHost) {
        ourRank = typeof row["rank"] === "number" ? row["rank"] : ourRank;
        continue;
      }
      if (!taken && !byHost.has(host)) {
        byHost.set(host, { url: origin, claim });
        taken = true;
      }
    }
  }
  return {
    sellers: Number(record["totalSellers"] ?? rows.length),
    window,
    ourRank,
    byHost,
  };
}

/** Best-effort read; an unreachable feed is null, never an empty world. */
async function readAgent402Leaderboard(
  ownHost: string,
): Promise<LeaderboardRead | null> {
  try {
    const response = await fetch(LEADERBOARD_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return mapLeaderboard(await response.json(), ownHost);
  } catch {
    return null;
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
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const { hosts, listed, coverageSuspect } = await readDiscoveryList(env);
  /**
   * THE SECOND FEED (2026-08-04): the agent402 leaderboard, used for
   * POPULATION — a host it names that discovery does not is still a
   * live door worth a probe. Its volume figures ride each host as a
   * labeled claim, never as a ranking we repeat (see WardVolumeClaim
   * on why: ~98% of ecosystem volume measured non-organic).
   */
  const leaderboard = await readAgent402Leaderboard(ownHost);
  const discoveryHosts = new Set(hosts.map((entry) => entry.host));
  const probeList: { host: string; url: string; source: "discovery" | "leaderboard" | "both" }[] =
    hosts.map((entry) => ({
      ...entry,
      source: leaderboard?.byHost.has(entry.host) ? "both" : "discovery",
    }));
  if (leaderboard) {
    for (const [host, entry] of leaderboard.byHost) {
      if (!discoveryHosts.has(host)) {
        probeList.push({ host, url: entry.url, source: "leaderboard" });
      }
    }
  }
  const capped = probeList.length > WARD_CAP;
  const results: WardHostResult[] = [];
  for (const entry of probeList.slice(0, WARD_CAP)) {
    const claim = leaderboard?.byHost.get(entry.host)?.claim;
    // A leaderboard origin is a homepage, not a door — listed with
    // its claim, never knocked on for a 402 it was never built to give.
    const probe =
      entry.source === "leaderboard"
        ? { verdict: "not_probed" as const, failed: [], advisories: [] }
        : await probeHost(env, entry.url);
    results.push({
      host: entry.host,
      url: entry.url,
      source: entry.source,
      ...(claim ? { volume_claim: claim } : {}),
      ...probe,
    });
  }
  const presence = await ourSearchPresence(env);
  const walked = results.filter((entry) => entry.verdict !== "not_probed").length;
  /**
   * THE CENSUS RIDES THE FEEDS THIS ROUND ALREADY READ — no extra
   * fetches, so counting the population costs nothing on top of
   * walking it.
   *
   * A discovery read that looked page-capped is handed over as
   * UNREADABLE rather than as a short answer. A truncated listing
   * cannot tell "gone" from "on page two", and writing that guess into
   * an append-only record is the exact failure the population layer
   * exists to refuse.
   *
   * The leaderboard contributes ONE host per seller, not per origin —
   * mapLeaderboard's deliberate choice, kept here. So this counts
   * sellers on that feed and hosts on discovery, which is the honest
   * reading of what each feed actually enumerates.
   */
  /**
   * THE WIDENING (2026-08-10, the keeper's ruling: every public
   * directory, uniform, no favourites). The fuchss provider directory
   * is the largest free full enumeration in the ecosystem (~10k
   * hosts), and it joins as POPULATION ONLY: it names hosts, not
   * resource URLs, and the leaderboard already taught this round what
   * probing a homepage for a 402 manufactures. Its hosts widen the
   * denominator; the probe list is untouched. The directories that
   * cannot be read ride the round beside it, with reasons — see
   * UNREAD_DIRECTORIES for why each one is named instead of read.
   */
  const fuchssHosts = await readFuchssProviders(ownHost);
  const sources: SourceResult[] = [
    {
      source: "discovery",
      hosts: coverageSuspect ? null : hosts.map((entry) => entry.host),
    },
    {
      source: "leaderboard",
      hosts: leaderboard ? [...leaderboard.byHost.keys()] : null,
    },
    { source: "fuchss", hosts: fuchssHosts },
  ];
  // The probe results are the expensive part of this round; a census
  // that cannot write must not take them down with it.
  const population = await takeCensus(env, sources, walked).catch(() => null);
  const round: WardRound = {
    week: currentWeekKey(),
    at: new Date().toISOString(),
    listed_resources: listed,
    coverage_suspect: coverageSuspect,
    capped,
    our_search_presence: presence,
    leaderboard_sellers: leaderboard ? leaderboard.sellers : null,
    leaderboard_window: leaderboard ? leaderboard.window : null,
    our_leaderboard_rank: leaderboard ? leaderboard.ourRank : null,
    ...(population ? { population } : {}),
    directories_unread: [...UNREAD_DIRECTORIES],
    hosts: results,
  };
  const previous = await latestWardRound(env);
  /**
   * COVERAGE DROP, said out loud (2026-08-05: the keeper caught a
   * round of ~100 hosts shrinking to 38 by memory — a page's job,
   * not his). If this round probed less than 60% of what the last
   * one did, the round records the drop so the page can lead with
   * it: week-over-week comparisons are unsafe until coverage is
   * back, and the likely cause is the list feed changing shape.
   */
  const previousProbed = previous
    ? previous.hosts.filter((h) => h.verdict !== "not_probed").length
    : 0;
  if (previousProbed >= 10 && walked < previousProbed * 0.6) {
    round.coverage_drop = {
      previous_hosts: previousProbed,
      this_round: walked,
      previous_at: previous?.at ?? "",
    };
  }
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
    // A host that was or is merely listed-not-probed has no verdict
    // to change; feeding those pairs into the delta would report the
    // instrument's coverage changing as the ecosystem changing.
    if (was.verdict === "not_probed" || now.verdict === "not_probed") {
      continue;
    }
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
