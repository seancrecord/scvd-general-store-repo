import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { payOnce } from "@/lib/pay-fetch";
import {
  PASS_FRESH_HOURS,
  latestDirectoryPass,
  passForCensus,
  type DirectoryPass,
} from "@/services/directory-pass";

/*
 * THE READ SIDE LIVES IN directory-pass.ts, and the ward round imports
 * THAT, never this file: this module reaches the payment signer (it
 * pays x402scan a cent a page) and test/collector-cannot-pay.spec.ts
 * holds that no probe root may reach one. Re-exported here for the
 * walker's own callers and tests; the round must not take them from
 * here.
 */
export { PASS_FRESH_HOURS, latestDirectoryPass, passForCensus, type DirectoryPass };
import { hostFromUrl } from "@/services/ward-sources";
import { rpcEndpoints } from "@/lib/base-rpc";
import {
  chainalysisScreen,
  fieldSignerFromKey,
  oracleScreen,
  raiseScreenUnavailable,
} from "@/services/launch-check";
import { FIELD_SPEND_CAP_USD } from "@/services/launch-check-terms";
import type { Env } from "@/types";

/**
 * THE DIRECTORY WALKS (2026-09-04) — the two x402 directories the
 * Sunday round cannot read in one breath, walked in hourly batches on a
 * stored cursor, on the long walk's and the MCP ward's pattern.
 *
 * WHY A WALK AND NOT A FETCH IN THE ROUND. The keeper priced and
 * shape-captured both by hand the same day. 402index's free list
 * answers `total: 104106` — larger than the MCP registry, a thousand
 * pages at a hundred a page, against a Sunday round that already
 * spends most of one invocation's budget. x402scan's list is a cent a
 * page, which is not a budget question at the page and is one at the
 * pass. Neither belongs inside the round; both belong on the hourly
 * press with a cursor, and THE ROUND READS THE LAST COMPLETED PASS.
 *
 * THE POPULATION LAW, UNCHANGED. A pass that did not finish — ceiling
 * hit, spend cap hit, a page that would not read — is truncated, and a
 * truncated pass is UNREAD to the census: its hosts are kept on the
 * pass artifact for the record, and the round writes `hosts: null` for
 * the source, exactly as it would for a dark directory. A partial
 * enumeration cannot tell "delisted" from "on a page we never
 * reached", and a fabricated delisting is in the chain forever.
 *
 * THE WALLET LAW, FOR THE PAID ONE. Per call, the house cap for a paid
 * knock (FIELD_SPEND_CAP_USD, five cents; x402scan asks one). Per
 * pass, X402SCAN_PASS_CAP_USD — a dollar, which is the line the law
 * draws before asking — and a pass that reaches it is truncated, not
 * continued. Raising the ceiling is the keeper's ruling; the artifact
 * will say the ceiling bound. Every payment goes through the same
 * refusals as the launch check's: never our own wallet, never an
 * unscreened address (rule 3 fails closed), never over cap, never a
 * redirect followed with an authorization in hand, never a retry.
 *
 * ONE PASS A WEEK (2026-09-05). The first cut capped the pass and not
 * the cadence: a finished pass rolled into a fresh one on the next
 * hourly firing, so the dollar-a-pass line was being crossed every
 * five hours. Base showed it — 311 one-cent transfers to x402scan's
 * payTo in the sixteen hours after the merge, about $4.60 a day, on
 * course for six times the wallet law's month. The keeper's word was
 * that it should cost about a dollar, and it should: the census is
 * weekly, so a directory read more than once a week buys nothing the
 * round can use. A pass now BEGINS at most once per ISO week, for the
 * free reader and the paid one alike; a finished pass rests until the
 * week turns, and the rest is on the state for the admin page to show.
 * So the paid walk's ceiling is X402SCAN_PASS_CAP_USD a week, by
 * construction rather than by hoping the directory is short. The admin
 * crank can start a fresh pass inside the week when the keeper asks,
 * and that is his hand, at most another pass cap.
 */

export interface DirectoryPage {
  hosts: string[];
  /** The cursor for the next page, or null at the directory's end. */
  next: string | null;
  paidUsd: number;
}

export interface DirectoryReader {
  /** The census id. Joins the roster and the register on this string. */
  source: string;
  pagesPerTick: number;
  maxPagesPerPass: number;
  /** A ceiling on what one pass may authorise. Zero for a free reader. */
  passCapUsd: number;
  /**
   * Read one page. `null` is UNREADABLE — a refused payment, a moved
   * shape, a dead host — and ends the tick with the cursor where it was.
   */
  readPage(env: Env, cursor: string | null): Promise<DirectoryPage | null>;
}

export interface DirectoryWalkState {
  version: 1;
  source: string;
  week: string;
  started_at: string;
  cursor: string | null;
  pages_read: number;
  hosts: string[];
  spent_usd: number;
  truncated: boolean;
  /** Why the pass stopped short, when it did. */
  truncated_why?: string;
  /** The last unreadable page's reason, when a tick ended on one. */
  last_problem?: string;
  finished_at?: string;
}

/**
 * A finished pass rests until the ISO week after the one it BEGAN in.
 * Keyed on the start, not the finish: a slow pass that runs into the
 * next week does not push the following one a week further out, and a
 * fast one cannot start twice in a week. Ceiling per source per week:
 * one pass.
 */
export function passRests(state: DirectoryWalkState | null, now: Date): boolean {
  return state !== null && state.finished_at !== undefined && state.week === currentWeekKey(now);
}

export interface WalkTick {
  state: DirectoryWalkState;
  /** The pass that finished on this tick, or null. */
  pass: DirectoryPass | null;
  /** True when this week's pass was already done and nothing was read. */
  resting: boolean;
}



/** Capped for the artifact; the truth is `hosts_known`. */
const PASS_HOST_LIST_CAP = 20000;

async function readState(env: Env, source: string): Promise<DirectoryWalkState | null> {
  return kvGetJson<DirectoryWalkState>(env.COUNTERS, KV_KEYS.directoryWalk(source), "json");
}


function fresh(source: string, now: Date): DirectoryWalkState {
  return {
    version: 1,
    source,
    week: currentWeekKey(now),
    started_at: now.toISOString(),
    cursor: null,
    pages_read: 0,
    hosts: [],
    spent_usd: 0,
    truncated: false,
  };
}

/**
 * One hourly firing for one reader. A page that cannot be read ends the
 * tick and keeps the cursor: a slow directory must not cost a pass that
 * is most of the way done. A pass ends when the reader says there is no
 * next page, or when a ceiling binds — and then it is truncated. A
 * finished pass rests until the week turns unless `force` says the
 * keeper wants another now; force never abandons a pass still walking.
 */
export async function walkDirectory(
  env: Env,
  reader: DirectoryReader,
  now = new Date(),
  options: { force?: boolean } = {},
): Promise<WalkTick> {
  const stored = await readState(env, reader.source);
  if (!options.force && passRests(stored, now)) {
    return { state: stored as DirectoryWalkState, pass: null, resting: true };
  }
  let state = stored ?? fresh(reader.source, now);
  if (state.finished_at) state = fresh(reader.source, now);
  const hosts = new Set(state.hosts);
  let complete = false;
  delete state.last_problem;

  for (let page = 0; page < reader.pagesPerTick; page += 1) {
    if (state.pages_read >= reader.maxPagesPerPass) {
      state.truncated = true;
      state.truncated_why = `the pass ceiling of ${reader.maxPagesPerPass} pages bound before the directory ran out`;
      complete = true;
      break;
    }
    if (reader.passCapUsd > 0 && state.spent_usd + FIELD_SPEND_CAP_USD > reader.passCapUsd + 1e-9) {
      state.truncated = true;
      state.truncated_why = `the pass spend ceiling of $${reader.passCapUsd.toFixed(2)} would be crossed by the next page; $${state.spent_usd.toFixed(2)} authorised so far`;
      complete = true;
      break;
    }
    const read = await reader.readPage(env, state.cursor);
    if (read === null) {
      state.last_problem = `page after cursor ${state.cursor ?? "(start)"} could not be read; the cursor holds`;
      break;
    }
    for (const host of read.hosts) hosts.add(host);
    state.spent_usd = Math.round((state.spent_usd + read.paidUsd) * 1e6) / 1e6;
    state.pages_read += 1;
    state.cursor = read.next;
    if (read.next === null) {
      complete = true;
      break;
    }
  }
  state.hosts = [...hosts];

  if (!complete) {
    await kvPut(env.COUNTERS, KV_KEYS.directoryWalk(reader.source), JSON.stringify(state));
    return { state, pass: null, resting: false };
  }

  const finished_at = now.toISOString();
  state.finished_at = finished_at;
  const pass: DirectoryPass = {
    artifact: "directory_pass",
    source: reader.source,
    week: state.week,
    started_at: state.started_at,
    finished_at,
    pages_read: state.pages_read,
    hosts_known: hosts.size,
    hosts: [...hosts].sort().slice(0, PASS_HOST_LIST_CAP),
    spent_usd: state.spent_usd,
    truncated: state.truncated,
    ...(state.truncated_why ? { truncated_why: state.truncated_why } : {}),
    what_this_cannot_see: [
      ...(state.truncated
        ? ["This pass stopped before the directory's own end, so it is a PARTIAL enumeration. The census reads it as unread: a partial read cannot tell a delisting from a page never reached."]
        : []),
      "Whether any listed host answers. A directory names doors; only a probe says anything else, and the round's probes are its own.",
    ],
  };
  await kvPut(env.COUNTERS, KV_KEYS.directoryPass(reader.source), JSON.stringify(pass));
  await kvPut(env.COUNTERS, KV_KEYS.directoryWalk(reader.source), JSON.stringify(state));
  return { state, pass, resting: false };
}


/* ── 402index.io — free ───────────────────────────────────────────────── */

const INDEX402_BASE = "https://402index.io/api/v1";
const INDEX402_LIMIT = 100;

/**
 * One page of 402index's free list, from the keeper's capture of
 * 2026-09-04: `{services: [{url, protocol, ...}], total, limit,
 * offset}`. It lists L402 and MPP doors beside x402; this ward counts
 * x402 doors, so the rest are read and not taken. The page size is
 * asked for, then TRUSTED AS ECHOED: a directory that caps `limit`
 * below what was asked would otherwise be walked with the wrong
 * stride and skip rows.
 */
export function parse402indexPage(body: unknown, ownHost: string): { hosts: string[]; next: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const page = body as { services?: unknown; total?: unknown; limit?: unknown; offset?: unknown };
  if (!Array.isArray(page.services)) return null;
  const total = typeof page.total === "number" ? page.total : null;
  const limit = typeof page.limit === "number" && page.limit > 0 ? page.limit : null;
  const offset = typeof page.offset === "number" ? page.offset : null;
  if (total === null || limit === null || offset === null) return null;
  const hosts: string[] = [];
  for (const row of page.services) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as { url?: unknown; protocol?: unknown };
    if (entry.protocol !== "x402") continue;
    const host = hostFromUrl(entry.url);
    if (host && host !== ownHost) hosts.push(host);
  }
  const nextOffset = offset + limit;
  return { hosts, next: page.services.length === 0 || nextOffset >= total ? null : String(nextOffset) };
}

export const INDEX402_READER: DirectoryReader = {
  source: "402index.io",
  pagesPerTick: 50,
  maxPagesPerPass: 3000,
  passCapUsd: 0,
  async readPage(env, cursor) {
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    if (!Number.isFinite(offset) || offset < 0) return null;
    try {
      const response = await fetch(`${INDEX402_BASE}/services?limit=${INDEX402_LIMIT}&offset=${offset}`, {
        headers: { Accept: "application/json", "User-Agent": "scvd-directory-walk/1.0 (+https://scvd.store/sources)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return null;
      const parsed = parse402indexPage(await response.json(), new URL(env.STORE_BASE_URL).host.toLowerCase());
      return parsed ? { ...parsed, paidUsd: 0 } : null;
    } catch {
      return null;
    }
  },
};

/* ── x402scan.com — a cent a page ─────────────────────────────────────── */

const X402SCAN_BASE = "https://www.x402scan.com/api/x402";
const X402SCAN_PAGE_SIZE = 100;
/** A dollar a pass: the wallet law's line before asking. His to raise. */
export const X402SCAN_PASS_CAP_USD = 1.0;

/**
 * One page of x402scan's resource list, from the keeper's paid capture
 * of 2026-09-04: `{data: [{resource, x402Version, lastUpdated,
 * deprecatedAt, ...}], pagination: {page, page_size, has_next_page}}`,
 * pages zero-based. A row with `deprecatedAt` set is a door the
 * indexer itself has retired; it is read and not taken, because a
 * denominator that counts doors their own index calls dead is padded.
 */
export function parseX402scanPage(body: unknown, ownHost: string): { hosts: string[]; next: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const page = body as { data?: unknown; pagination?: unknown };
  if (!Array.isArray(page.data)) return null;
  const pagination = typeof page.pagination === "object" && page.pagination !== null ? (page.pagination as { page?: unknown; has_next_page?: unknown }) : null;
  if (!pagination || typeof pagination.page !== "number") return null;
  const hosts: string[] = [];
  for (const row of page.data) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as { resource?: unknown; deprecatedAt?: unknown };
    if (entry.deprecatedAt) continue;
    const host = hostFromUrl(entry.resource);
    if (host && host !== ownHost) hosts.push(host);
  }
  return { hosts, next: pagination.has_next_page === true ? String(pagination.page + 1) : null };
}

export const X402SCAN_READER: DirectoryReader = {
  source: "x402scan.com",
  pagesPerTick: 20,
  maxPagesPerPass: 2000,
  passCapUsd: X402SCAN_PASS_CAP_USD,
  async readPage(env, cursor) {
    // No paying wallet is not a fault; it is a source this deployment
    // cannot read, and the register will say never_answered until it can.
    if (!env.FIELD_WALLET_KEY) return null;
    const page = cursor ? Number.parseInt(cursor, 10) : 0;
    if (!Number.isFinite(page) || page < 0) return null;
    let signer;
    try {
      signer = await fieldSignerFromKey(env.FIELD_WALLET_KEY);
    } catch {
      return null;
    }
    const screen = env.SANCTIONS_API_KEY ? chainalysisScreen(env.SANCTIONS_API_KEY) : oracleScreen(rpcEndpoints(env));
    const url = `${X402SCAN_BASE}/resources?page=${page}&page_size=${X402SCAN_PAGE_SIZE}`;
    let result;
    try {
      result = await payOnce(url, { signer, screen, perCallCapUsd: FIELD_SPEND_CAP_USD });
    } catch {
      return null;
    }
    if (result.refusal === "unscreened" && result.detail?.includes("did not answer")) {
      await raiseScreenUnavailable(env, "the x402scan directory walk", result.detail).catch(() => undefined);
    }
    if (result.body === null) return null;
    try {
      const parsed = parseX402scanPage(JSON.parse(result.body), new URL(env.STORE_BASE_URL).host.toLowerCase());
      return parsed ? { ...parsed, paidUsd: result.paid_usd } : null;
    } catch {
      return null;
    }
  },
};

export const DIRECTORY_READERS: readonly DirectoryReader[] = [INDEX402_READER, X402SCAN_READER];

export interface DirectoryTickReport {
  week: string;
  pages_read: number;
  spent_usd: number;
  finished: boolean;
  truncated: boolean;
  /** This week's pass was already done; nothing was read or paid. */
  resting: boolean;
}

/** The hourly press: every reader, one tick each, failures kept apart. */
export async function walkAllDirectories(
  env: Env,
  options: { force?: boolean } = {},
): Promise<Record<string, DirectoryTickReport>> {
  const report: Record<string, DirectoryTickReport> = {};
  for (const reader of DIRECTORY_READERS) {
    const { state, pass, resting } = await walkDirectory(env, reader, new Date(), options);
    report[reader.source] = {
      week: state.week,
      pages_read: state.pages_read,
      spent_usd: state.spent_usd,
      finished: pass !== null || state.finished_at !== undefined,
      truncated: state.truncated,
      resting,
    };
  }
  return report;
}
