import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import type { Env } from "@/types";

/**
 * THE ASKED-FOR QUEUE (2026-09-10): every miss becomes next week's
 * coverage.
 *
 * The corpus answered "the chain has never carried this host" on the
 * host page, on the host JSON, on the look and on the A2A door — and
 * then forgot the question. An agent that asks once and is told
 * "never met" does not ask twice, so each miss was the last time that
 * buyer consulted the record. The 2026-W33 arithmetic said the rate
 * of the census is set by how many probe-able doors the round can
 * NAME; the hosts strangers ask about are the cheapest names there
 * are, and the ones a reader has already proved it wants.
 *
 * WHAT IS RECORDED. A host name, the first and last time it was
 * asked for, how many times, and which free surfaces asked. Nothing
 * about who asked: no wallet, no address, no user agent. Only names
 * the chain has NOT probed are recorded — a hit is a hit, and the
 * chain already holds it.
 *
 * WHAT IT FEEDS. The long walk's sweep (long-walk.ts, freezeRoster):
 * an asked-for host joins the week's sweep list, which reads the
 * host's own /.well-known/x402 and the directory's page for it and
 * puts any door it declares on the roster's tail. The queue never
 * invents a door — a host that publishes none stays "swept, no door
 * found" and says so. A host the feeds already name this week is not
 * queued for the sweep (the feed wins), and leaves the store.
 *
 * WHAT IS PUBLISHED. /corpus/asked.json: the queue with its
 * denominators — asked, swept, on the roster, walked — so a reader
 * who was told "never met" can see the ask was heard and where it
 * stands. A queue position is not a ranking: hosts are listed by
 * name, and the count of asks rides beside each as a fact about
 * demand for the record, never as a verdict on the door.
 *
 * ONE KEY, capped, the door bank's law: at hundreds of hosts a key
 * per host is waste, and the walk reads all of them every week. The
 * read-modify-write races with itself under concurrent misses, and
 * KV allows one write a second to a key, so a burst of misses loses
 * some; a lost increment counts asks LOWER, never higher, which is
 * the direction this store can live with. A stranger who hammers
 * the host page with invented names fills the queue with names the
 * sweep will read once each and find nothing at — bounded by the
 * two caps, and the cost is theirs to explain on /corpus/asked.json.
 */

export interface AskedForRecord {
  first_asked: string;
  last_asked: string;
  asks: number;
  /** The free surfaces that asked, by name; capped. */
  surfaces: string[];
  /** The week the sweep last read this host's own files for a door. */
  last_swept_week?: string;
}

export interface AskedForStore {
  version: 1;
  hosts: Record<string, AskedForRecord>;
}

/**
 * Which free surface asked: the host page or JSON, or the held half
 * that the look, the passport decision and the A2A door all fold.
 */
export type AskedSurface = "corpus_host" | "look";

/** Hosts the store holds before evicting the longest-unasked. */
export const ASKED_FOR_CAP = 500;
/** Asked-for hosts one week's sweep takes; the rest wait, most-asked first. */
export const ASKED_FOR_SWEEP_CAP = 100;
const SURFACE_CAP = 4;

/**
 * A host name and nothing else: labels of letters, digits and hyphens,
 * at least one dot, no port, no path, no IP literal. The route
 * pattern admits colons and underscores for the odd registry entry;
 * a name that reaches the sweep will be fetched, so this gate is
 * narrower than the page's.
 */
export function isSweepableHost(raw: string): boolean {
  const host = raw.trim().toLowerCase();
  if (host.length === 0 || host.length > 253) return false;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return false;
  if (/^[0-9.]+$/.test(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return true;
}

function emptyStore(): AskedForStore {
  return { version: 1, hosts: {} };
}

export async function readAskedFor(env: Env): Promise<AskedForStore> {
  const stored = await kvGetJson<AskedForStore>(env.COUNTERS, KV_KEYS.askedFor, "json");
  if (!stored || stored.version !== 1 || typeof stored.hosts !== "object" || stored.hosts === null) {
    return emptyStore();
  }
  return stored;
}

export async function writeAskedFor(env: Env, store: AskedForStore): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.askedFor, JSON.stringify(store));
}

/**
 * Pure: one ask folded into the store, eviction applied. Returns the
 * store unchanged (same reference) when the name is not one the
 * sweep could read, so the caller writes nothing.
 */
export function foldAsk(
  store: AskedForStore,
  rawHost: string,
  surface: AskedSurface,
  ownHost: string,
  now: Date,
): AskedForStore {
  const host = rawHost.trim().toLowerCase();
  if (!isSweepableHost(host) || host === ownHost) return store;
  const at = now.toISOString();
  const existing = store.hosts[host];
  const surfaces = existing?.surfaces ?? [];
  const record: AskedForRecord = existing
    ? {
        ...existing,
        last_asked: at,
        asks: existing.asks + 1,
        surfaces: surfaces.includes(surface) || surfaces.length >= SURFACE_CAP ? surfaces : [...surfaces, surface],
      }
    : { first_asked: at, last_asked: at, asks: 1, surfaces: [surface] };
  const hosts = { ...store.hosts, [host]: record };
  const names = Object.keys(hosts);
  if (names.length > ASKED_FOR_CAP) {
    // Evict the longest-unasked until the cap holds; the host just
    // asked for is the newest by construction and never goes.
    names.sort((a, b) => hosts[a]!.last_asked.localeCompare(hosts[b]!.last_asked));
    for (const name of names.slice(0, names.length - ASKED_FOR_CAP)) delete hosts[name];
  }
  return { version: 1, hosts };
}

/**
 * Record one miss. Never throws: a KV hiccup on a free read path
 * costs the ask, not the answer. Callers on a request path should
 * ride this on waitUntil so the reader's clock never pays for it.
 */
export async function recordAsk(
  env: Env,
  rawHost: string,
  surface: AskedSurface,
  now: Date = new Date(),
): Promise<void> {
  try {
    const ownHost = new URL(env.STORE_BASE_URL).host.toLowerCase();
    const before = await readAskedFor(env);
    const after = foldAsk(before, rawHost, surface, ownHost, now);
    if (after !== before) await writeAskedFor(env, after);
  } catch {
    // The ask is lost; the answer already went out.
  }
}

/**
 * Pure: which asked-for hosts this week's sweep should read, and the
 * store as it stands after the pick. Hosts the feeds already name
 * this week leave the store (the feed wins, and the walk will meet
 * them); hosts already swept this week are skipped; the rest are
 * taken most-asked first, ties by earliest ask, up to the cap, and
 * stamped with the week so the queue can say "swept".
 */
export function pickSweep(
  store: AskedForStore,
  week: string,
  alreadyNamed: ReadonlySet<string>,
  cap: number = ASKED_FOR_SWEEP_CAP,
): { hosts: string[]; store: AskedForStore; dropped: number; waiting: number } {
  const hosts: Record<string, AskedForRecord> = {};
  let dropped = 0;
  for (const [host, record] of Object.entries(store.hosts)) {
    if (alreadyNamed.has(host)) {
      dropped += 1;
      continue;
    }
    hosts[host] = record;
  }
  const candidates = Object.entries(hosts)
    .filter(([, record]) => record.last_swept_week !== week)
    .sort(([a, ra], [b, rb]) => rb.asks - ra.asks || ra.first_asked.localeCompare(rb.first_asked) || a.localeCompare(b));
  const picked = candidates.slice(0, cap).map(([host]) => host);
  for (const host of picked) hosts[host] = { ...hosts[host]!, last_swept_week: week };
  return {
    hosts: picked,
    store: { version: 1, hosts },
    dropped,
    waiting: Math.max(0, candidates.length - picked.length),
  };
}

export type AskedState = "queued" | "swept_no_door_found" | "on_roster" | "walked";

export interface AskedQueueEntry {
  host: string;
  first_asked: string;
  last_asked: string;
  asks: number;
  surfaces: string[];
  state: AskedState;
  last_swept_week?: string;
  history_url: string;
}

export interface AskedQueue {
  artifact: "asked_for_queue";
  asked_at: string;
  hosts_asked: number;
  by_state: Record<AskedState, number>;
  sweep_cap_per_week: number;
  store_cap: number;
  hosts: AskedQueueEntry[];
  how_it_works: string;
  what_this_is_not: string;
}

/**
 * Derived at read: the queue against what the walk and the chain
 * hold now. `walked` when the latest signed round or the current
 * walk's results carry the host; `on_roster` when this week's walk
 * will knock; `swept_no_door_found` when a sweep read the host's
 * files and put nothing on the roster; `queued` otherwise.
 */
export function deriveAskedQueue(
  store: AskedForStore,
  standing: { walked: ReadonlySet<string>; roster: ReadonlySet<string> },
  base: string,
  now: Date = new Date(),
): AskedQueue {
  const by_state: Record<AskedState, number> = { queued: 0, swept_no_door_found: 0, on_roster: 0, walked: 0 };
  const hosts = Object.entries(store.hosts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([host, record]): AskedQueueEntry => {
      const state: AskedState = standing.walked.has(host)
        ? "walked"
        : standing.roster.has(host)
          ? "on_roster"
          : record.last_swept_week
            ? "swept_no_door_found"
            : "queued";
      by_state[state] += 1;
      return {
        host,
        first_asked: record.first_asked,
        last_asked: record.last_asked,
        asks: record.asks,
        surfaces: record.surfaces,
        state,
        ...(record.last_swept_week ? { last_swept_week: record.last_swept_week } : {}),
        history_url: `${base}/corpus/host/${host}.json`,
      };
    });
  return {
    artifact: "asked_for_queue",
    asked_at: now.toISOString(),
    hosts_asked: hosts.length,
    by_state,
    sweep_cap_per_week: ASKED_FOR_SWEEP_CAP,
    store_cap: ASKED_FOR_CAP,
    hosts,
    how_it_works: `A host a free surface was asked about that the signed chain had never probed is recorded here by name, with a count of asks and nothing about who asked. Each week the long walk's sweep reads up to ${ASKED_FOR_SWEEP_CAP} of them, most-asked first — the host's own /.well-known/x402 and the directory's page for it — and any door they declare joins the walk. A host that declares no door stays swept_no_door_found; the sweep does not invent doors. A host the feeds name leaves this queue for the roster. The store holds ${ASKED_FOR_CAP} hosts; past that the longest-unasked is dropped.`,
    what_this_is_not: `${NEVER_A_RANKING_SENTENCE} The order here is alphabetical and the ask count is demand for the record, not a verdict on the door. "walked" means a signed or in-progress round carries the host, which may be any verdict; read the host's history for what was observed.`,
  };
}
