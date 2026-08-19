import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { mergeDoors, readDoorBank, writeDoorBank } from "@/services/door-bank";
import {
  pooled,
  probeHost,
  readAgent402Leaderboard,
  readDiscoveryList,
  type WardHostResult,
  type WardVolumeClaim,
} from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE LONG WALK — the architecture past WARD_CAP, greenlit by the
 * keeper 2026-08-19 in the same breath as the 750 ruling ("why not
 * 10k+?" — because 10k is not a bigger number, it is this file).
 *
 * The one-shot round is bounded by the Workers per-invocation budget:
 * ~1,000 subrequests, ~750 probes after the feed reads. The universe
 * the repaired feed declares is already 6,000+ resources and growing.
 * So the walk spreads across the week instead of the invocation: the
 * HOURLY cron probes one batch per firing on a stored cursor —
 * gentler on strangers' doors than any burst, and inside every budget
 * — and Sunday's round ASSEMBLES what the week already walked instead
 * of probing again. One GET per host per week, same consent posture
 * as ever; the walk changes when the knocks happen, never how many.
 *
 * STATE: one KV value (KV_KEYS.longWalkState) holding its own week.
 * A new week's first pass overwrites it. Capacity arithmetic: the
 * batch is 100 and the week has ~168 hourly firings, so ~16,800
 * host-slots per week against today's ~6,000 — the walk finishes by
 * midweek and idles, and the cap that binds next is the feed's own
 * size, which the roster records.
 */

/** Hosts probed per hourly firing. 100 ≈ well under every budget. */
export const WALK_BATCH = 100;
const WALK_CONCURRENCY = 20;

interface WalkRosterEntry {
  host: string;
  url: string;
  source: "discovery" | "both";
}

export interface LongWalkState {
  version: 1;
  week: string;
  started_at: string;
  listed_resources: number;
  coverage_suspect: boolean;
  pagination_shape?: string[];
  /** The leaderboard as read at walk start; claims dated by window. */
  leaderboard: {
    sellers: number;
    window: string;
    our_rank: number | null;
    hosts: string[];
  } | null;
  claims: Record<string, WardVolumeClaim>;
  /** Probeable doors only; leaderboard-only rows are pre-recorded. */
  roster: WalkRosterEntry[];
  cursor: number;
  results: WardHostResult[];
  batches: number;
  finished_at?: string;
}

export async function readLongWalk(env: Env): Promise<LongWalkState | null> {
  return env.COUNTERS.get<LongWalkState>(KV_KEYS.longWalkState, "json");
}

async function writeLongWalk(env: Env, state: LongWalkState): Promise<void> {
  await env.COUNTERS.put(KV_KEYS.longWalkState, JSON.stringify(state));
}

export type WalkPass =
  | { phase: "started"; roster: number }
  | { phase: "walked"; walked: number; cursor: number; roster: number }
  | { phase: "finished"; roster: number }
  | { phase: "idle"; reason: string };

/**
 * One hourly firing. Three shapes: START a new week's walk (read the
 * feeds once, freeze the roster, probe nothing — the feed reads spend
 * this firing's budget), WALK one batch, or IDLE because the roster
 * is done and Sunday has not come for it yet.
 */
export async function longWalkPass(env: Env): Promise<WalkPass> {
  const week = currentWeekKey();
  const existing = await readLongWalk(env);

  if (!existing || existing.week !== week) {
    return startWalk(env, week);
  }

  if (existing.cursor >= existing.roster.length) {
    if (!existing.finished_at) {
      existing.finished_at = new Date().toISOString();
      await writeLongWalk(env, existing);
      return { phase: "finished", roster: existing.roster.length };
    }
    return { phase: "idle", reason: `week ${week} fully walked` };
  }

  return walkBatch(env, existing);
}

async function startWalk(env: Env, week: string): Promise<WalkPass> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const discovery = await readDiscoveryList(env);
  const leaderboard = await readAgent402Leaderboard(ownHost);

  const discoveryHosts = new Set(discovery.hosts.map((entry) => entry.host));
  const roster: WalkRosterEntry[] = discovery.hosts.map((entry) => ({
    ...entry,
    source: leaderboard?.byHost.has(entry.host)
      ? ("both" as const)
      : ("discovery" as const),
  }));

  const claims: Record<string, WardVolumeClaim> = {};
  const results: WardHostResult[] = [];
  if (leaderboard) {
    for (const [host, entry] of leaderboard.byHost) {
      claims[host] = entry.claim;
      if (!discoveryHosts.has(host)) {
        // A leaderboard origin is a homepage, not a door — the
        // 2026-08-04 lesson holds on the long walk too. Recorded as
        // population at start, never queued for a knock.
        results.push({
          host,
          url: entry.url,
          source: "leaderboard",
          verdict: "not_probed",
          failed: [],
          advisories: [],
          volume_claim: entry.claim,
        });
      }
    }
  }

  // The bank remembers every declared door, same as the one-shot path.
  try {
    const merged = mergeDoors(await readDoorBank(env), discovery.hosts, week);
    await writeDoorBank(env, merged.bank);
  } catch {
    // The bank is memory, not the walk; a KV hiccup costs nothing here.
  }

  const state: LongWalkState = {
    version: 1,
    week,
    started_at: new Date().toISOString(),
    listed_resources: discovery.listed,
    coverage_suspect: discovery.coverageSuspect,
    ...(discovery.paginationShape
      ? { pagination_shape: discovery.paginationShape }
      : {}),
    leaderboard: leaderboard
      ? {
          sellers: leaderboard.sellers,
          window: leaderboard.window,
          our_rank: leaderboard.ourRank,
          hosts: [...leaderboard.byHost.keys()],
        }
      : null,
    claims,
    roster,
    cursor: 0,
    results,
    batches: 0,
  };
  await writeLongWalk(env, state);
  return { phase: "started", roster: roster.length };
}

async function walkBatch(env: Env, state: LongWalkState): Promise<WalkPass> {
  const slice = state.roster.slice(state.cursor, state.cursor + WALK_BATCH);
  const probed = await pooled(slice, WALK_CONCURRENCY, async (entry) => {
    const probe = await probeHost(env, entry.url);
    const claim = state.claims[entry.host];
    return {
      host: entry.host,
      url: entry.url,
      source: entry.source,
      ...(claim ? { volume_claim: claim } : {}),
      ...probe,
    } satisfies WardHostResult;
  });
  state.results.push(...probed);
  state.cursor += slice.length;
  state.batches += 1;
  if (state.cursor >= state.roster.length) {
    state.finished_at = new Date().toISOString();
  }
  await writeLongWalk(env, state);
  return {
    phase: "walked",
    walked: slice.length,
    cursor: state.cursor,
    roster: state.roster.length,
  };
}
