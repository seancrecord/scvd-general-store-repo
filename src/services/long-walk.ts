import type { CatalogTerms } from "@/services/catalog-agreement";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { mergeDoors, readDoorBank, writeDoorBank } from "@/services/door-bank";
import { readFuchssProviders } from "@/services/ward-sources";
import { readDirectoryDoors } from "@/services/directory-doors";
import {
  readWellKnownDoors,
  readWellKnownStore,
  recordWellKnownRead,
  rosterDoorsFrom,
  writeWellKnownStore,
} from "@/services/well-known-doors";
import {
  LONG_WALK_DISCOVERY_PAGE_CAP,
  pooled,
  probeHost,
  readAgent402Leaderboard,
  readDiscoveryList,
  type DiscoveryCursor,
  type DiscoveryReadNote,
  type WardHostResult,
  type WardVolumeClaim,
} from "@/services/ward-round";
import type { Env } from "@/types";
import { bulkGetJson } from "@/lib/kv-bulk";
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
  source: "discovery" | "both" | "well-known" | "directory";
  /**
   * The catalog's copy of the door's terms, frozen with the roster
   * (S8 Tier C). The index is read once at walk start and the probes
   * fire in later cron firings, so the terms must ride the roster or
   * they are gone by the time the door is knocked on. Absent on
   * rosters frozen before the column; null for a row listed bare.
   */
  catalog?: CatalogTerms | null;
}

/**
 * Feed pages one hourly firing reads: the long walk's cap, which is
 * the whole subrequest allowance of a firing that reads feeds and
 * nothing else. WHAT CHANGED ON 2026-09-04, when the keeper asked
 * "why not raise it higher? what happens when things grow?": the cap
 * is no longer the last word. A read that stops short of the feed's
 * declared total — the cap, the time budget, a failed page — hands
 * the next firing its address, and the next firing reads on from
 * there until the total is reached. No page cap binds at any size;
 * a listing of any size is read whole a few hours into the week.
 * Ten thousand is not a bigger number, it is this: the same lesson
 * the walk itself was built on, applied to the read that feeds it.
 */
export const FEED_PAGES_PER_PASS = LONG_WALK_DISCOVERY_PAGE_CAP;
/**
 * Firings the feed read may take before the roster freezes with what
 * was read. A feed that fails the same page every hour for a day is
 * not going to answer this week; the state says what it got and
 * why, coverage_suspect stays true, and the walk walks what it has.
 */
export const FEED_MAX_PASSES = 24;

/**
 * Doors the roster takes from the feed in one week. THE CEILING THIS
 * WAS (2026-09-04): the walk's state was one KV value carrying every
 * walked host's evidence, and would have failed near 3,900 hosts at
 * KV's 25 MB value limit, silently, on an hourly write; 2,000 kept a
 * heavy week inside it. THE MOVE (2026-09-05, "yes i agree with the
 * two moves"): the rows live one value per batch and the sealed
 * round's rows live in R2, so the state carries the roster, the
 * cursor and the counts and nothing that grows with evidence. The
 * ceiling now is the walk's own capacity — ~168 hourly firings of
 * WALK_BATCH, ~16,800 knocks a week, shared with the sweep's
 * SWEEP_ROSTER_CAP behind it. Ten thousand feed doors plus three
 * thousand swept fits inside it with the reading passes to spare.
 * The state still says when it bound (`roster_capped`), the census
 * still counts every host the feed named (`feed_hosts`), and hosts
 * beyond the cap read as listed_not_walked in their histories.
 * Declared and swept doors ride BEHIND this cap, never inside it.
 */
export const WALK_ROSTER_CAP = 10000;

export interface LongWalkState {
  version: 1;
  week: string;
  started_at: string;
  listed_resources: number;
  coverage_suspect: boolean;
  /** Why the feed read stopped where it did; rides into Sunday's round. Across firings, pages and ms are the sum. */
  discovery_read?: DiscoveryReadNote;
  /**
   * Set while the feed is still being read across firings; absent
   * once the roster is frozen. A state carrying this walks nothing
   * and assembles nothing — it is not yet a week's roster.
   */
  feed?: { resume: DiscoveryCursor; passes: number; declared_total: number | null };
  /**
   * Every host the feed named, names only — the census's discovery
   * answer. The roster below is the WALKABLE subset: capped, with
   * declared doors behind the cap. Absent on states frozen before
   * the cap existed, when the roster was the whole feed.
   */
  feed_hosts?: string[];
  /** True when WALK_ROSTER_CAP bound at freeze. */
  roster_capped?: boolean;
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
  /**
   * Rows recorded WITHOUT a knock (leaderboard homepages) — small, and
   * kept here. Probed rows live one value per batch under
   * KV_KEYS.longWalkResults since 2026-09-05; readWalkResults joins the
   * two. A state frozen before that still carries its probed rows here
   * and is read the same way.
   */
  results: WardHostResult[];
  batches: number;
  /** Batch values written under KV_KEYS.longWalkResults; absent before the move. */
  result_batches?: number;
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
  /**
   * LANE C (2026-09-05): for a host whose own file gave no door, the
   * directory's page for that host was read. Same three words, kept
   * apart from the file's — a door the directory names is not a door
   * the host declared. Absent on states frozen before lane C.
   */
  directory?: { read: number; found: number; none: number; unreadable: number; doors_added: number };
  finished_at?: string;
}

/** Hosts read per sweep firing; each read is at most three GETs. */
export const SWEEP_BATCH = 100;
const SWEEP_CONCURRENCY = 10;
/** Swept doors the roster will take in one week; past it the sweep still reads and records, and says it capped. */
export const SWEEP_ROSTER_CAP = 3000;

/** Batch values outlive the week they belong to by this much, then go. */
export const WALK_RESULTS_TTL_SECONDS = 21 * 24 * 3600;

/**
 * Every row the week's walk recorded: the state's own (unknocked)
 * rows, then each batch in order. A batch the store no longer holds
 * is COUNTED, never skipped in silence — Sunday's round says how many
 * batches it could not read, so a short week reads as short.
 */
export async function readWalkResults(
  env: Env,
  state: LongWalkState,
): Promise<{ rows: WardHostResult[]; batches_missing: number }> {
  const count = state.result_batches ?? 0;
  const keys = Array.from({ length: count }, (_, index) => KV_KEYS.longWalkResults(state.week, index));
  const values = keys.length
    ? await bulkGetJson<WardHostResult[]>(env.COUNTERS, keys)
    : new Map<string, WardHostResult[] | null>();
  const rows = [...state.results];
  let missing = 0;
  for (const key of keys) {
    const batch = values.get(key);
    if (!Array.isArray(batch)) {
      missing += 1;
      continue;
    }
    rows.push(...batch);
  }
  return { rows, batches_missing: missing };
}

export async function readLongWalk(env: Env): Promise<LongWalkState | null> {
  return kvGetJson<LongWalkState>(env.COUNTERS, KV_KEYS.longWalkState, "json");
}

async function writeLongWalk(env: Env, state: LongWalkState): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.longWalkState, JSON.stringify(state));
}

export type WalkPass =
  | { phase: "reading"; rows: number; declared: number | null; passes: number }
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
  // The feed is still being read: nothing to walk yet, and nothing
  // to assemble — read on from where the last firing stopped.
  if (existing.feed) {
    return continueFeed(env, existing);
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

/**
 * The first firing of a week: read the feed's first pages. When the
 * whole feed fits in one pass (every week so far), the roster freezes
 * in the same firing exactly as before; when it does not, the state
 * holds the cursor and the next firing reads on.
 */
async function startWalk(env: Env, week: string): Promise<WalkPass> {
  // This firing reads the feeds and freezes the roster and does
  // nothing else, so it runs under the long walk's larger page cap
  // (2026-09-04): the one-shot cap bound at 6,000 rows for two weeks.
  const discovery = await readDiscoveryList(env, { pageCap: FEED_PAGES_PER_PASS });
  const state: LongWalkState = {
    version: 1,
    week,
    started_at: new Date().toISOString(),
    listed_resources: discovery.listed,
    coverage_suspect: discovery.coverageSuspect,
    discovery_read: discovery.read,
    ...(discovery.paginationShape
      ? { pagination_shape: discovery.paginationShape }
      : {}),
    ...(discovery.fieldsSeen
      ? { discovery_fields_seen: discovery.fieldsSeen }
      : {}),
    leaderboard: null,
    claims: {},
    roster: discovery.hosts.map((entry) => ({ ...entry, source: "discovery" as const })),
    cursor: 0,
    results: [],
    batches: 0,
  };
  if (!discovery.complete && discovery.resume) {
    state.feed = {
      resume: discovery.resume,
      passes: 1,
      declared_total: discovery.read.declared_total ?? null,
    };
    await writeLongWalk(env, state);
    return { phase: "reading", rows: discovery.listed, declared: state.feed.declared_total, passes: 1 };
  }
  return freezeRoster(env, state);
}

/** A later firing while the feed is still being read. */
async function continueFeed(env: Env, state: LongWalkState): Promise<WalkPass> {
  const feed = state.feed;
  if (!feed) return freezeRoster(env, state);
  const discovery = await readDiscoveryList(env, {
    pageCap: FEED_PAGES_PER_PASS,
    resume: feed.resume,
    skipHosts: state.roster.map((entry) => entry.host),
  });
  state.roster.push(...discovery.hosts.map((entry) => ({ ...entry, source: "discovery" as const })));
  state.listed_resources = discovery.listed;
  state.coverage_suspect = discovery.coverageSuspect;
  // The note is the read as a whole: this pass's stop, every pass's
  // pages and wall time. A pass that ran out of pages wrote page_cap;
  // the pass that reaches the total takes it back.
  const before = state.discovery_read;
  state.discovery_read = {
    ...discovery.read,
    pages: (before?.pages ?? 0) + discovery.read.pages,
    ms: (before?.ms ?? 0) + discovery.read.ms,
  };
  if (discovery.paginationShape) state.pagination_shape = discovery.paginationShape;
  if (discovery.fieldsSeen) {
    state.discovery_fields_seen = [
      ...new Set([...(state.discovery_fields_seen ?? []), ...discovery.fieldsSeen]),
    ]
      .slice(0, 30)
      .sort();
  }
  feed.passes += 1;
  feed.declared_total = discovery.read.declared_total ?? feed.declared_total;
  if (!discovery.complete && discovery.resume && feed.passes < FEED_MAX_PASSES) {
    feed.resume = discovery.resume;
    await writeLongWalk(env, state);
    return { phase: "reading", rows: discovery.listed, declared: feed.declared_total, passes: feed.passes };
  }
  return freezeRoster(env, state);
}

/**
 * The feed is read: freeze the week's roster. Everything that used to
 * happen at walk start and is not the feed read happens here — the
 * leaderboard, the declared doors, the sweep's list, the door bank —
 * so a feed that took several firings to read changes WHEN the
 * roster freezes, never what it is made of.
 */
async function freezeRoster(env: Env, state: LongWalkState): Promise<WalkPass> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const week = state.week;
  const leaderboard = await readAgent402Leaderboard(ownHost);

  // The roster so far is the feed's hosts, one door each, and nothing
  // else: the census gets all of them by name; the walk gets the cap.
  const feedEntries = state.roster.filter((entry) => entry.source !== "well-known");
  const discoveryHosts = new Set(feedEntries.map((entry) => entry.host));
  state.feed_hosts = [...discoveryHosts];
  let roster: WalkRosterEntry[] = feedEntries.map((entry) => ({
    ...entry,
    source: leaderboard?.byHost.has(entry.host)
      ? ("both" as const)
      : ("discovery" as const),
  }));
  if (roster.length > WALK_ROSTER_CAP) {
    roster = roster.slice(0, WALK_ROSTER_CAP);
    state.roster_capped = true;
  }

  /*
   * WHAT HOSTS DECLARED LAST WEEK rides this week's roster from the
   * start, so a door found by a late sweep is not lost to the next
   * week's fresh state. The feed wins a host the feed also names.
   * Declared doors sit behind the feed's cap, never inside it.
   */
  const rosterHosts = new Set(roster.map((entry) => entry.host));
  const wellKnown = await readWellKnownStore(env);
  for (const declared of rosterDoorsFrom(wellKnown)) {
    if (rosterHosts.has(declared.host) || declared.host === ownHost) continue;
    roster.push({
      host: declared.host,
      url: declared.url,
      source: declared.via === "directory" ? "directory" : "well-known",
      catalog: null,
    });
    rosterHosts.add(declared.host);
  }

  /*
   * THE SWEEP'S LIST: every host the name directory lists that no feed
   * gave a door for, minus any already read this week by hand. A
   * directory that could not be read leaves nothing to sweep, and the
   * state says so instead of reading as "nobody declared anything".
   * A feed host beyond the roster cap is still a feed host: the
   * sweep does not read files for doors the feed already named.
   */
  const named = await readFuchssProviders(ownHost);
  const sweepHosts = (named ?? [])
    .filter((host) => !rosterHosts.has(host) && !discoveryHosts.has(host) && !leaderboard?.byHost.has(host))
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
    directory: { read: 0, found: 0, none: 0, unreadable: 0, doors_added: 0 },
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
    const merged = mergeDoors(await readDoorBank(env), feedEntries, week);
    await writeDoorBank(env, merged.bank);
  } catch {
    // The bank is memory, not the walk; a KV hiccup costs nothing here.
  }

  delete state.feed;
  state.leaderboard = leaderboard
    ? {
        sellers: leaderboard.sellers,
        window: leaderboard.window,
        our_rank: leaderboard.ourRank,
        hosts: [...leaderboard.byHost.keys()],
      }
    : null;
  state.claims = claims;
  state.roster = roster;
  state.cursor = 0;
  state.results = results;
  state.batches = 0;
  state.sweep = sweep;
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
 *
 * LANE C (2026-09-05): a host whose own file gave no door gets one
 * more read — the directory's page for that host, which lists its
 * endpoints. A path it lists, joined to the host it is listed under,
 * is a door from a feed; the row says so (source "directory") and is
 * never mistaken for the host's own word. Worst case four GETs per
 * host: the file, the agent card, its pointer, the page.
 */
async function sweepBatch(env: Env, state: LongWalkState, sweep: SweepState): Promise<WalkPass> {
  const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
  const slice = sweep.hosts.slice(sweep.cursor, sweep.cursor + SWEEP_BATCH);
  const reads = await pooled(slice, SWEEP_CONCURRENCY, async (host) => {
    const own = await readWellKnownDoors(host, ownHost);
    const ownDoor = own.kind === "doors" ? own.doors[0] : undefined;
    // The directory's page is read only where the host's own file
    // gave no door on the host itself — the host's word, when it
    // speaks, is the whole of it.
    const directory = ownDoor ? null : await readDirectoryDoors(host, ownHost);
    return { host, own, directory };
  });

  let store = await readWellKnownStore(env);
  const at = new Date().toISOString();
  const rosterHosts = new Set(state.roster.map((entry) => entry.host));
  const swept = () =>
    state.roster.filter((entry) => entry.source === "well-known" || entry.source === "directory").length;
  const dir = sweep.directory ?? (sweep.directory = { read: 0, found: 0, none: 0, unreadable: 0, doors_added: 0 });
  let added = 0;
  let addedByDirectory = 0;
  for (const { host, own, directory } of reads) {
    sweep.read += 1;
    if (own.kind === "unreadable") sweep.unreadable += 1;
    else if (own.kind === "none") sweep.none += 1;
    else {
      sweep.found += 1;
      store = recordWellKnownRead(store, host, own, state.week, at).store;
      const door = own.doors[0];
      if (door && !rosterHosts.has(own.declaring_host) && own.declaring_host !== ownHost) {
        if (swept() >= SWEEP_ROSTER_CAP) {
          sweep.capped = true;
        } else {
          state.roster.push({ host: own.declaring_host, url: door, source: "well-known", catalog: null });
          rosterHosts.add(own.declaring_host);
          added += 1;
        }
      }
    }
    if (!directory) continue;
    dir.read += 1;
    if (directory.kind === "unreadable") {
      dir.unreadable += 1;
      continue;
    }
    if (directory.kind === "none") {
      dir.none += 1;
      continue;
    }
    dir.found += 1;
    // The record is kept under the host with via "directory"; a host
    // whose own file spoke this week (foreign-only, say) keeps that
    // record — the directory's page does not overwrite the host's word.
    if (own.kind !== "doors") {
      store = recordWellKnownRead(store, host, directory, state.week, at).store;
    }
    const door = directory.doors[0];
    if (!door || rosterHosts.has(host) || host === ownHost) continue;
    if (swept() >= SWEEP_ROSTER_CAP) {
      sweep.capped = true;
      continue;
    }
    state.roster.push({ host, url: door, source: "directory", catalog: null });
    rosterHosts.add(host);
    addedByDirectory += 1;
  }
  sweep.doors_added += added;
  dir.doors_added += addedByDirectory;
  sweep.cursor += slice.length;
  if (sweep.cursor >= sweep.hosts.length) sweep.finished_at = at;
  await writeWellKnownStore(env, store);
  await writeLongWalk(env, state);
  return {
    phase: "swept",
    read: slice.length,
    cursor: sweep.cursor,
    hosts: sweep.hosts.length,
    doors_added: added + addedByDirectory,
  };
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
): Promise<"appended" | "already-on-roster" | "no-walk-this-week" | "roster-not-frozen-yet"> {
  const state = await readLongWalk(env);
  if (!state || state.week !== currentWeekKey()) return "no-walk-this-week";
  // The feed is still being read; the store already holds the
  // declaration and the freeze seeds it onto the roster within hours.
  if (state.feed) return "roster-not-frozen-yet";
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
  // The batch's evidence goes under its own key, never into the state:
  // the state is written every hour and must stay small at any scale.
  const batchIndex = state.result_batches ?? 0;
  await kvPut(env.COUNTERS, KV_KEYS.longWalkResults(state.week, batchIndex), JSON.stringify(probed), {
    expirationTtl: WALK_RESULTS_TTL_SECONDS,
  });
  state.result_batches = batchIndex + 1;
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
