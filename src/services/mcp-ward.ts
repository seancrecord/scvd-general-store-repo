import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { hostFromUrl } from "@/services/ward-sources";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE MCP WARD — the same instrument as the x402 ward, pointed at a
 * different population, and kept rigorously apart from it (the
 * keeper's ruling, 2026-09-04: "carve out an mcp ward and do another
 * list similarly").
 *
 * WHY IT IS A SECOND WARD AND NOT A FOURTH FEED. The obvious cheap
 * move was to add the MCP registry as another row in the existing
 * census's source list. That would have been wrong in a way that is
 * hard to undo: `population_known` is the denominator under
 * `coverage_pct`, and `coverage_pct` rides every corpus snapshot,
 * every weekly brief and every ledger this store has ever sealed.
 * Pouring twenty thousand MCP servers into it would not have widened
 * our coverage — it would have quietly redefined what every published
 * percentage since July was a percentage OF, retroactively, with no
 * correction possible because the old rows would keep their bytes and
 * their meaning would have moved underneath them.
 *
 * So: two wards, two registers, no shared totals, and no arithmetic
 * that crosses between them anywhere in this file.
 *
 * ENUMERATION ONLY, SAID PLAINLY. This ward counts and it does not
 * knock. An MCP server is probed by opening a session and speaking the
 * initialize handshake, which is a different battery, a different
 * consent posture and a different set of things that can go wrong; the
 * store has a published preflight battery for x402 doors and nothing
 * of the kind for MCP. Inventing a verdict here to match the other
 * ward's shape would be the worst kind of symmetry. What this ward
 * gets for free is the thing the population layer was built for:
 * mortality without a probe. A server that was listed and is now
 * listed nowhere is a delisting we can record having never spent a
 * request on it.
 *
 * THE WALK, because the registry does not fit in a tick. Walked to its
 * end on 2026-09-04: 90,845 rows across 909 pages — ninety times the
 * ~1,000 subrequest budget one Worker invocation gets, which the x402
 * round already spends most of. So this borrows the long walk's
 * architecture wholesale: the HOURLY cron reads a bounded number of
 * registry pages on a stored cursor, and a PASS completes whenever the
 * registry's own cursor runs out. At 20 pages a tick and 100 rows a
 * page, a full pass takes about two days and then idles until the
 * next one — a cadence of roughly three passes a week, which is
 * plenty for a question about who was listed.
 *
 * A NOTE ON THE FIRST CUT'S CEILING, because it is the kind of error
 * this store exists to catch. The first read was cut off at 20,000
 * rows with the cursor still running, and the pass ceiling was set at
 * 400 pages as "comfortably past" that. It was under half the
 * registry. Every pass would have truncated, the artifact would have
 * said so honestly on every one, and the ward would never have
 * recorded a single delisting — correct by its own law, and useless.
 * Found on the red-team read the same day by walking to the end.
 *
 * THE ONE LAW THIS INHERITS UNCHANGED. Mortality is computed ONLY on a
 * completed pass. A partial read cannot tell "delisted" from "on a
 * page we have not reached yet", so a pass that was cut short records
 * its hosts and refuses to record a single disappearance. A missed
 * delisting is recoverable next pass; a fabricated one is a lie about
 * somebody's project that we published.
 */

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0/servers";
const FETCH_TIMEOUT_MS = 8000;

/** Registry pages read per hourly firing. 20 × 100 rows, well inside budget. */
export const MCP_PAGES_PER_TICK = 20;

/**
 * A ceiling on one pass, so a registry that starts answering with a
 * cursor that never terminates cannot grow this state without bound.
 * 909 pages was the whole registry on 2026-09-04; 2,000 pages is
 * room for it to double and then some, and still a number rather
 * than "no limit". When a pass hits this, the artifact says truncated
 * and records no delisting — and the ceiling is what to raise.
 */
export const MCP_MAX_PAGES_PER_PASS = 2000;

/**
 * Hosts one pass will hold. Named, because an unnamed cap is a silent
 * one. Sized from the registry's real shape: ~86% of rows carry a
 * remote URL, so a full pass could contribute up to ~78,000 host
 * strings before dedupe. At ~30 bytes each that is a KV value of a
 * couple of megabytes rewritten once an hour while a pass runs —
 * well under the 25 MB value limit, and worth knowing about.
 */
export const MCP_HOST_CAP = 100000;

export interface McpWalkState {
  version: 1;
  /** The pass this state belongs to, by the week it started in. */
  week: string;
  started_at: string;
  /** The registry's own cursor. Null before the first page of a pass. */
  cursor: string | null;
  pages_read: number;
  servers_seen: number;
  /**
   * Rows that carried at least one usable remote URL, ACROSS THE
   * PASS. This was a per-tick count until the red-team read of
   * 2026-09-04: the pass artifact published only the final tick's
   * share, which on a twelve-tick pass was a twelfth of the truth
   * wearing the whole number's name. Absent on state written before
   * the fix; treated as zero-so-far.
   */
  servers_with_remote?: number;
  /** Unique hosts accumulated so far this pass. */
  hosts: string[];
  /** The registry's own status word, counted. Its news, not ours. */
  status_counts: Record<string, number>;
  /** Set when a pass ran out of ceiling before the registry ran out of rows. */
  truncated: boolean;
  finished_at?: string;
}

export interface McpRegisterRecord {
  first_seen: string;
  /** The last COMPLETED pass that actually listed this host. */
  last_seen: string;
  /** True while the host is absent but no complete pass has confirmed it. */
  unconfirmed?: boolean;
}

export interface McpRegister {
  version: 1;
  hosts: Record<string, McpRegisterRecord>;
  /** The last completed pass folded in. */
  last_pass: string | null;
}

export interface McpPass {
  artifact: "mcp_pass";
  week: string;
  started_at: string;
  finished_at: string;
  /**
   * Rows the registry served this pass, and the unique hosts inside
   * them. The two differ a lot — a server can be an npm package with
   * no remote at all — and publishing only one of them would invite
   * exactly the wrong reading.
   */
  servers_seen: number;
  servers_with_remote: number;
  hosts_known: number;
  status_counts: Record<string, number>;
  appeared: string[];
  disappeared: string[];
  returned: string[];
  /**
   * True when the pass hit its page ceiling. Every mortality field
   * above is empty when this is set, and that is not a coincidence.
   */
  truncated: boolean;
  what_this_cannot_see: string[];
  what_this_is_not: string;
}

export const MCP_WARD_IS_NOT =
  "Not a verdict on any MCP server and not a health check on one. This ward COUNTS: it reads a public registry and records which hosts are listed, when each first appeared, and when one stops being listed. Nothing here knocks on an MCP server, so nothing here says whether one works. A host absent from this list may be perfectly healthy and simply not registered.";

const CANNOT_SEE = [
  "Whether any listed server actually answers. This ward does not open a session and does not speak the initialize handshake; there is no MCP battery in this store to cite, and inventing one to match the x402 ward's shape would be worse than the gap.",
  "Servers that exist and are not in the registry we read. One registry is one frame, and it is the only free full enumeration of MCP servers we have a reader for.",
  "Anything about the x402 population. The two wards share no totals on purpose: folding them would silently redefine what every coverage percentage this store has published was a percentage of.",
];

async function fetchPage(cursor: string | null): Promise<{
  rows: unknown[];
  nextCursor: string | null;
} | null> {
  const url = `${REGISTRY_BASE}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      servers?: unknown;
      metadata?: { nextCursor?: unknown };
    };
    // A 200 whose shape moved is unreadable, not empty — the same
    // refusal every feed in this store makes.
    if (!Array.isArray(body.servers)) return null;
    const next = body.metadata?.nextCursor;
    return {
      rows: body.servers,
      nextCursor: typeof next === "string" && next !== "" ? next : null,
    };
  } catch {
    return null;
  }
}

/**
 * Hosts and the registry's status word out of one page's rows.
 *
 * A row with no remote is COUNTED and contributes no host: those are
 * the npm-and-stdio servers, which are real registrations that simply
 * have no network address to be listed at. Dropping them from the row
 * count would inflate the share of the registry that is remotely
 * reachable, which is the sort of quiet flattery this store exists to
 * refuse.
 */
export function readPageRows(rows: unknown[]): {
  hosts: string[];
  withRemote: number;
  statuses: Record<string, number>;
} {
  const hosts: string[] = [];
  const statuses: Record<string, number> = {};
  let withRemote = 0;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as {
      server?: { remotes?: unknown };
      _meta?: Record<string, unknown>;
    };
    const official = entry._meta?.["io.modelcontextprotocol.registry/official"];
    const status =
      typeof official === "object" && official !== null
        ? (official as { status?: unknown }).status
        : undefined;
    const word = typeof status === "string" ? status : "unstated";
    statuses[word] = (statuses[word] ?? 0) + 1;

    const remotes = entry.server?.remotes;
    if (!Array.isArray(remotes) || remotes.length === 0) continue;
    let counted = false;
    for (const remote of remotes) {
      const host = hostFromUrl((remote as { url?: unknown } | null)?.url);
      if (host === null) continue;
      hosts.push(host);
      counted = true;
    }
    if (counted) withRemote += 1;
  }
  return { hosts, withRemote, statuses };
}

export async function readMcpWalk(env: Env): Promise<McpWalkState | null> {
  return kvGetJson<McpWalkState>(env.COUNTERS, KV_KEYS.mcpWalkState, "json");
}

export async function readMcpRegister(env: Env): Promise<McpRegister> {
  const stored = await kvGetJson<McpRegister>(env.COUNTERS, KV_KEYS.mcpRegister, "json");
  return stored ?? { version: 1, hosts: {}, last_pass: null };
}

function freshState(now: Date): McpWalkState {
  return {
    version: 1,
    week: currentWeekKey(now),
    started_at: now.toISOString(),
    cursor: null,
    pages_read: 0,
    servers_seen: 0,
    hosts: [],
    status_counts: {},
    truncated: false,
  };
}

/**
 * FOLD A COMPLETED PASS INTO THE REGISTER, and only a completed one.
 *
 * `truncated` short-circuits every mortality field here rather than
 * being noted beside them. A disappearance derived from a partial
 * enumeration is not a weaker finding — it is a wrong one, and it goes
 * into a record we do not rewrite.
 */
export function foldPass(
  register: McpRegister,
  state: McpWalkState,
  finishedAt: string,
): { register: McpRegister; pass: McpPass } {
  const seen = new Set(state.hosts);
  const next: McpRegister = {
    version: 1,
    hosts: { ...register.hosts },
    last_pass: state.week,
  };
  const appeared: string[] = [];
  const returned: string[] = [];
  const disappeared: string[] = [];

  for (const host of seen) {
    const existing = next.hosts[host];
    if (!existing) {
      appeared.push(host);
      next.hosts[host] = { first_seen: finishedAt, last_seen: finishedAt };
      continue;
    }
    if (existing.unconfirmed) returned.push(host);
    next.hosts[host] = {
      first_seen: existing.first_seen,
      last_seen: finishedAt,
    };
  }

  if (!state.truncated) {
    for (const [host, record] of Object.entries(next.hosts)) {
      if (seen.has(host) || record.unconfirmed) continue;
      disappeared.push(host);
      next.hosts[host] = { ...record, unconfirmed: true };
    }
  }

  return {
    register: next,
    pass: {
      artifact: "mcp_pass",
      week: state.week,
      started_at: state.started_at,
      finished_at: finishedAt,
      servers_seen: state.servers_seen,
      servers_with_remote: state.servers_with_remote ?? 0,
      hosts_known: seen.size,
      status_counts: state.status_counts,
      appeared: appeared.sort().slice(0, 250),
      disappeared: disappeared.sort().slice(0, 250),
      returned: returned.sort().slice(0, 250),
      truncated: state.truncated,
      what_this_cannot_see: state.truncated
        ? [
            "This pass hit its page ceiling before the registry ran out of rows, so it is a PARTIAL enumeration. No disappearance is recorded from it at all: a partial read cannot tell a delisting from a page we never reached.",
            ...CANNOT_SEE,
          ]
        : CANNOT_SEE,
      what_this_is_not: MCP_WARD_IS_NOT,
    },
  };
}

/**
 * One hourly firing: read a bounded run of pages, save the cursor, and
 * fold the pass the moment the registry's own cursor runs out.
 *
 * A page that cannot be read ENDS THE TICK without ending the pass —
 * the cursor stays where it was and the next firing resumes from it.
 * That is the difference between a slow registry and a lost pass, and
 * conflating them would throw away eleven hours of good reading over
 * one timeout.
 */
export async function walkMcpRegistry(
  env: Env,
  now = new Date(),
): Promise<{ state: McpWalkState; pass: McpPass | null }> {
  let state = (await readMcpWalk(env)) ?? freshState(now);
  // A finished pass rolls over into a fresh one on the next firing.
  if (state.finished_at) state = freshState(now);

  const hosts = new Set(state.hosts);
  let complete = false;

  for (let page = 0; page < MCP_PAGES_PER_TICK; page += 1) {
    if (state.pages_read >= MCP_MAX_PAGES_PER_PASS) {
      state.truncated = true;
      complete = true;
      break;
    }
    const read = await fetchPage(state.cursor);
    // Unreadable page: keep the cursor, stop the tick, resume next hour.
    if (read === null) break;

    const { hosts: pageHosts, withRemote, statuses } = readPageRows(read.rows);
    for (const host of pageHosts) {
      if (hosts.size >= MCP_HOST_CAP) {
        state.truncated = true;
        break;
      }
      hosts.add(host);
    }
    // A pass that has hit its host ceiling is over: reading further
    // pages would spend budget on rows it can no longer record.
    if (state.truncated) {
      state.servers_seen += read.rows.length;
      state.pages_read += 1;
      state.cursor = read.nextCursor;
      complete = true;
      break;
    }
    state.servers_with_remote = (state.servers_with_remote ?? 0) + withRemote;
    for (const [word, count] of Object.entries(statuses)) {
      state.status_counts[word] = (state.status_counts[word] ?? 0) + count;
    }
    state.servers_seen += read.rows.length;
    state.pages_read += 1;
    state.cursor = read.nextCursor;

    if (read.nextCursor === null) {
      complete = true;
      break;
    }
  }

  state.hosts = [...hosts];

  if (!complete) {
    await kvPut(env.COUNTERS, KV_KEYS.mcpWalkState, JSON.stringify(state));
    return { state, pass: null };
  }

  const finishedAt = now.toISOString();
  state.finished_at = finishedAt;
  const register = await readMcpRegister(env);
  const folded = foldPass(register, state, finishedAt);
  await kvPut(env.COUNTERS, KV_KEYS.mcpRegister, JSON.stringify(folded.register));
  await kvPut(env.COUNTERS, KV_KEYS.mcpPass(state.week), JSON.stringify(folded.pass));
  await kvPut(env.COUNTERS, KV_KEYS.mcpWalkState, JSON.stringify(state));
  return { state, pass: folded.pass };
}

/** The newest completed pass, for the room and the JSON. */
export async function latestMcpPass(env: Env): Promise<McpPass | null> {
  const register = await readMcpRegister(env);
  if (!register.last_pass) return null;
  return kvGetJson<McpPass>(env.COUNTERS, KV_KEYS.mcpPass(register.last_pass), "json");
}
