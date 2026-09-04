import type { CatalogTerms } from "@/services/catalog-agreement";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { mergeDoors, readDoorBank, writeDoorBank } from "@/services/door-bank";
import { readFuchssProviders } from "@/services/ward-sources";
import {
  readWellKnownDoors,
  readWellKnownStore,
  recordWellKnownRead,
  rosterDoorsFrom,
  writeWellKnownStore,
} from "@/services/well-known-doors";
import {
  pooled,
  probeHost,
  readAgent402Leaderboard,
  readDiscoveryList,
  type WardHostResult,
  type WardVolumeClaim,
} from "@/services/ward-round";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

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
 * batch is 100 and the week has ~168 hourly firings, ~16,800
 * host-slots a week.
 *
 * WHAT THAT CAPACITY WAS ACTUALLY WALKING (corrected 2026-09-04): the
 * roster is built from the discovery feed, ~1,088 doors, while the
 * register knows ~6,400 hosts by NAME from a directory that lists
 * hostnames. A hostname is not a door and the walk does not knock on
 * homepages, so 5,000-odd hosts read "listed, not walked" every week
 * and the round published 17% coverage. The old paragraph here said
 * the walk finished the universe by midweek; it finished the feed.
 *
 * THE SWEEP closes that gap without a new source and without knocking
 * on a homepage: once the roster is walked, the idle firings read
 * each name-only host's own /.well-known/x402 (and agent-card pointer,
 * one hop) — services/well-known-doors.ts — and every door a host
 * declares for ITSELF joins the roster, source "well-known", to be
 * walked in the firings that follow. One file read and one door knock
 * per host per week. Doors found ride the round like any other row and
 * sit out the listed/gone delta the way revisits do, since a host's
 * own declaration is not a directory listing or dropping it.
 */

/** Hosts probed per hourly firing. 100 ≈ well under every budget. */
export const WALK_BATCH = 100;
const WALK_CONCURRENCY = 20;

interface WalkRosterEntry {
  host: string;
  url: string;
  source: "discovery" | "both" | "well-known";
  /**
   * The catalog's copy of the door's terms, frozen with the roster
   * (S8 Tier C). The index is read once at walk start and the probes
   * fire in later cron firings, so the terms must ride the roster or
   * they are gone by the time the door is knocked on. Absent on
   * rosters frozen before the column; null for a row listed bare.
   */
  catalog?: CatalogTerms | null;
}

export interface LongWalkState {
  version: 1;
  week: string;
  started_at: string;
  listed_resources: number;
  coverage_suspect: boolean;
  pagination_shape?: string[];
  /** The feed's row-key names, for the market desk's self-diagnosis. */
  discovery_fields_seen?: string[];
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
  /** The well-known sweep over name-only hosts; absent on states frozen before it. */
  sweep?: SweepState;
}

export interface SweepState {
  /** Name-only hosts to read this week, frozen at walk start. */
  hosts: string[];
  cursor: number;
  /** True when the name directory itself could not be read: nothing to sweep, and said so. */
  source_unreadable: boolean;
  read: number;
  found: number;
  none: number;
  unreadable: number;
  /** Roster rows the sweep added (one door per declaring host). */
  doors_added: number;
  /** True once the weekly roster cap on swept doors bound. */
  capped: boolean;
  finished_at?: string;
}

/** Hosts read per sweep firing; each read is at most three GETs. */
export const SWEEP_BATCH = 100;
const SWEEP_CONCURRENCY = 10;
/** Swept doors the roster will take in one week; past it the sweep still reads and records, and says it capped. */
export const SWEEP_ROSTER_CAP = 3000;

export async function readLongWalk(env: Env): Promise<LongWalkState | null> {
  return kvGetJson<LongWalkState>(env.COUNTERS, KV_KEYS.longWalkState, "json");
}

async function writeLongWalk(env: Env, state: LongWalkState): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.longWalkState, JSON.stringify(state));
}

export type WalkPass =
  | { phase: "started"; roster: number; sweep: number }
  | { phase: "walked"; walked: number; cursor: number; roster: number }
  | { phase: "swept"; read: number; cursor: number; hosts: number; doors_added: number }
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

  if (existing.cursor < existing.roster.length) {
    return walkBatch(env, existing);
  }
  // The roster is walked. Spend this firing on the sweep if it has
  // hosts left; a door it finds lands on the roster's tail, and the
  // next firing walks it — walk before sweep, always.
  const sweep = existing.sweep;
  if (sweep && sweep.cursor < sweep.hosts.length) {
    return sweepBatch(env, existing, sweep);
  }
  if (!existing.finished_at) {
    existing.finished_at = new Date().toISOString();
    if (sweep && !sweep.finished_at) sweep.finished_at = existing.finished_at;
    await writeLongWalk(env, existing);
    return { phase: "finished", roster: existing.roster.length };
  }
  return { phase: "idle", reason: `week ${week} fully walked` };
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

  /*
   * WHAT HOSTS DECLARED LAST WEEK rides this week's roster from the
   * start, so a door found by a late sweep is not lost to the next
   * week's fresh state. The feed wins a host the feed also names.
   */
  const rosterHosts = new Set(roster.map((entry) => entry.host));
  const wellKnown = await readWellKnownStore(env);
  for (const declared of rosterDoorsFrom(wellKnown)) {
    if (rosterHosts.has(declared.host) || declared.host === ownHost) continue;
    roster.push({ host: declared.host, url: declared.url, source: "well-known", catalog: null });
    rosterHosts.add(declared.host);
  }

  /*
   * THE SWEEP'S LIST: every host the name directory lists that no feed
   * gave a door for, minus any already read this week by hand. A
   * directory that could not be read leaves nothing to sweep, and the
   * state says so instead of reading as "nobody declared anything".
   */
  const named = await readFuchssProviders(ownHost);
  const sweepHosts = (named ?? [])
    .filter((host) => !rosterHosts.has(host) && !leaderboard?.byHost.has(host))
    .filter((host) => wellKnown.hosts[host]?.read_week !== week)
    .sort();
  const sweep: SweepState = {
    hosts: sweepHosts,
    cursor: 0,
    source_unreadable: named === null,
    read: 0,
    found: 0,
    none: 0,
    unreadable: 0,
    doors_added: 0,
    capped: false,
  };

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
    ...(discovery.fieldsSeen
      ? { discovery_fields_seen: discovery.fieldsSeen }
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
    sweep,
  };
  await writeLongWalk(env, state);
  return { phase: "started", roster: roster.length, sweep: sweep.hosts.length };
}

/**
 * One sweep firing: read a batch of name-only hosts' own files. A
 * host that declares a door for itself joins the roster's tail
 * (source "well-known", one door per declaring host) and is walked by
 * a later firing; the record keeps every door the file named. Nothing
 * here knocks on a door — that is the walk's job, on the walk's
 * budget, and the sweep only ever reads what a host published to be
 * read.
 */
async function sweepBatch(env: Env, state: LongWalkState, sweep: SweepState): Promise<WalkPass> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const slice = sweep.hosts.slice(sweep.cursor, sweep.cursor + SWEEP_BATCH);
  const reads = await pooled(slice, SWEEP_CONCURRENCY, async (host) => ({
    host,
    read: await readWellKnownDoors(host, ownHost),
  }));

  let store = await readWellKnownStore(env);
  const at = new Date().toISOString();
  const rosterHosts = new Set(state.roster.map((entry) => entry.host));
  let added = 0;
  for (const { host, read } of reads) {
    sweep.read += 1;
    if (read.kind === "unreadable") {
      sweep.unreadable += 1;
      continue;
    }
    if (read.kind === "none") {
      sweep.none += 1;
      continue;
    }
    sweep.found += 1;
    store = recordWellKnownRead(store, host, read, state.week, at).store;
    const door = read.doors[0];
    if (!door || rosterHosts.has(read.declaring_host) || read.declaring_host === ownHost) continue;
    if (state.roster.filter((entry) => entry.source === "well-known").length >= SWEEP_ROSTER_CAP) {
      sweep.capped = true;
      continue;
    }
    state.roster.push({ host: read.declaring_host, url: door, source: "well-known", catalog: null });
    rosterHosts.add(read.declaring_host);
    added += 1;
  }
  sweep.doors_added += added;
  sweep.cursor += slice.length;
  if (sweep.cursor >= sweep.hosts.length) sweep.finished_at = at;
  await writeWellKnownStore(env, store);
  await writeLongWalk(env, state);
  return { phase: "swept", read: slice.length, cursor: sweep.cursor, hosts: sweep.hosts.length, doors_added: added };
}

/**
 * A door declared BY HAND this week (POST /api/declare-door) joins the
 * roster now, so "read now" means walked this week rather than seeded
 * into next week's. The roster's freeze is about terms, not
 * membership; a well-known row carries no catalog terms to freeze.
 */
export async function appendDeclaredDoor(
  env: Env,
  host: string,
  url: string,
): Promise<"appended" | "already-on-roster" | "no-walk-this-week"> {
  const state = await readLongWalk(env);
  if (!state || state.week !== currentWeekKey()) return "no-walk-this-week";
  if (state.roster.some((entry) => entry.host === host)) return "already-on-roster";
  state.roster.push({ host, url, source: "well-known", catalog: null });
  await writeLongWalk(env, state);
  return "appended";
}

async function walkBatch(env: Env, state: LongWalkState): Promise<WalkPass> {
  const slice = state.roster.slice(state.cursor, state.cursor + WALK_BATCH);
  const probed = await pooled(slice, WALK_CONCURRENCY, async (entry) => {
    const probe = await probeHost(
      env,
      entry.url,
      // A roster frozen before the column carries no terms; the
      // reading is then absent rather than invented.
      entry.catalog === undefined ? undefined : { listed: true, terms: entry.catalog },
    );
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
  const sweepDone = !state.sweep || state.sweep.cursor >= state.sweep.hosts.length;
  if (state.cursor >= state.roster.length && sweepDone) {
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
