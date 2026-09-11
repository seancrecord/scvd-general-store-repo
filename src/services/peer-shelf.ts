import { bulkGetJson } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { KV_KEYS, currentWeekKey, previousWeekKey } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * THE PEER SHELF (2026-09-11; docs/GROWTH_LEDGER_2026-09.md, the
 * follow-through). The keeper asked whether the conformance desk was
 * losing callers to somebody else, and the honest answer was that no
 * instrument here could see anyone else's share. This is that
 * instrument, and it is deliberately small: x402-list.com publishes,
 * under CC BY 4.0, a measured thirty-day settlement floor for every
 * service it lists — volume, settlements, distinct buyers — read off
 * chain through the facilitators it watches. We read the category
 * this store is listed in, every row the same way, ours among them,
 * once a week, and keep the week.
 *
 * NEVER A RANKING. Rows are alphabetical. Our share is two numbers
 * and their ratio, with the denominator beside it. No percentile of
 * theirs is repeated here, because a percentile is a rank wearing a
 * number. The category is x402-list's word for where we sit, read
 * off our own row rather than typed, so a re-shelving on their side
 * moves this reading with it and says so.
 *
 * WHAT THIS CANNOT SEE, said once and carried on every reading:
 * settlements outside the facilitators x402-list measures (their own
 * caveat, quoted verbatim); services not listed there; anything about
 * the callers of anyone's FREE instruments — this reads paid
 * traction only. A service with no measured traction is
 * `unmeasured`, never zero.
 *
 * The category page is one fetch (a hundred rows a page, paged to a
 * small cap); our own row is one more. Two subrequests a week.
 */

export const X402_LIST_API = "https://x402-list.com/api/v1";
export const OUR_X402_LIST_SLUG = "sean-claude-van-damme-s-general-store";
/** Pages of a hundred the category read will walk before calling itself partial. */
export const PEER_PAGE_CAP = 5;
/**
 * Weeks the shelf listing walks. KV lists keys in ascending order and
 * `peer_shelf:<week>` sorts oldest first, so a cap that a decade of
 * weeks cannot reach is the only cap that never drops the NEWEST
 * week; the flag is read anyway and a capped listing says so.
 */
export const PEER_WEEKS_CAP = 520;
const FETCH_TIMEOUT_MS = 15_000;

export interface PeerTraction {
  volume_usd_30d: number;
  tx_count_30d: number;
  unique_buyers_30d: number;
  top_buyer_share_30d: number | null;
  trend_7d_vs_30d: number | null;
  volume_usd_all_time: number | null;
  first_settlement_at: string | null;
}

export interface PeerRow {
  slug: string;
  name: string;
  host: string | null;
  status: string | null;
  payment_ready: boolean | null;
  listed_at: string | null;
  /** x402-list's measured floor; null when their status is anything but measured. */
  traction: PeerTraction | null;
  /** Their word for why there is no traction figure, when there is none. */
  traction_status: string | null;
}

export interface PeerShelf {
  artifact: "peer_shelf";
  week: string;
  read_at: string;
  source: { url: string; license: string; attribution: string };
  /** The category our own row sits in, read from that row. */
  category: string;
  ours: PeerRow | null;
  /** Every service in the category, alphabetical by name, ours included. */
  rows: PeerRow[];
  totals: {
    services: number;
    measured: number;
    volume_usd_30d: number;
    tx_count_30d: number;
    /** Summed across services, so one buyer of three services is three here: not distinct. */
    buyers_30d_summed: number;
  };
  /** Ours against the category's measured total, per hundred; null when we or the category have no measurement. */
  ours_per_hundred: { volume: number | null; settlements: number | null } | null;
  /** Slugs in this week's category and not the week before's; the week before's and not this week's. Null when no earlier week was read. */
  arrived: string[] | null;
  departed: string[] | null;
  /** True when the category ran past PEER_PAGE_CAP pages: rows and totals are a floor. */
  truncated: boolean;
  caveat: string;
  what_this_is_not: string;
}

export const PEER_WHAT_THIS_IS_NOT =
  "Not a ranking: rows are alphabetical and no percentile is repeated. Not the market: one directory's measured floor for the category it shelves us in, read once a week. Not anyone's free-instrument use: paid settlements only, through the facilitators the directory measures. A service without a measured figure is unmeasured, never zero.";

const DEFAULT_CAVEAT =
  "x402-list.com: conservative undercount; only USDC settlements via facilitators they measure are counted. A measured floor, not an estimate.";

type Fetcher = (url: string) => Promise<unknown | null>;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hostOf(raw: unknown): string | null {
  const text = str(raw);
  if (!text) return null;
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** One directory row into ours, keeping only what the shelf prints. Pure. */
export function peerRowOf(raw: unknown): PeerRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const slug = str(row["slug"]);
  if (!slug) return null;
  const assessment = (typeof row["assessment"] === "object" && row["assessment"] !== null ? row["assessment"] : {}) as Record<string, unknown>;
  const traction = (typeof assessment["traction"] === "object" && assessment["traction"] !== null ? assessment["traction"] : {}) as Record<string, unknown>;
  const tractionStatus = str(traction["status"]);
  const measured =
    tractionStatus === "measured" && num(traction["volume_usd_30d"]) !== null && num(traction["tx_count_30d"]) !== null
      ? {
          volume_usd_30d: num(traction["volume_usd_30d"])!,
          tx_count_30d: num(traction["tx_count_30d"])!,
          unique_buyers_30d: num(traction["unique_buyers_30d"]) ?? 0,
          top_buyer_share_30d: num(traction["top_buyer_share_30d"]),
          trend_7d_vs_30d: num(traction["trend_7d_vs_30d"]),
          volume_usd_all_time: num(traction["volume_usd_all_time"]),
          first_settlement_at: str(traction["first_settlement_at"]),
        }
      : null;
  return {
    slug,
    name: str(row["name"]) ?? slug,
    host: hostOf(row["base_url"]),
    status: str(row["status"]),
    payment_ready: typeof row["payment_ready"] === "boolean" ? row["payment_ready"] : null,
    listed_at: str(row["created_at"]),
    traction: measured,
    traction_status: tractionStatus,
  };
}

export function categoryOf(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const data = typeof body["data"] === "object" && body["data"] !== null ? (body["data"] as Record<string, unknown>) : body;
  return str(data["category"]);
}

function perHundred(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/**
 * The shelf, derived from the rows the directory answered with. Pure,
 * so the spec can hand it rows; the read below is the only I/O.
 */
export function deriveShelf(
  week: string,
  readAt: string,
  category: string,
  rows: PeerRow[],
  previous: PeerShelf | null,
  truncated: boolean,
  caveat: string | null,
): PeerShelf {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  const ours = sorted.find((row) => row.slug === OUR_X402_LIST_SLUG) ?? null;
  const measured = sorted.filter((row) => row.traction !== null);
  const totals = {
    services: sorted.length,
    measured: measured.length,
    volume_usd_30d: Math.round(measured.reduce((sum, row) => sum + row.traction!.volume_usd_30d, 0) * 1000) / 1000,
    tx_count_30d: measured.reduce((sum, row) => sum + row.traction!.tx_count_30d, 0),
    buyers_30d_summed: measured.reduce((sum, row) => sum + row.traction!.unique_buyers_30d, 0),
  };
  const before = previous ? new Set(previous.rows.map((row) => row.slug)) : null;
  const now = new Set(sorted.map((row) => row.slug));
  return {
    artifact: "peer_shelf",
    week,
    read_at: readAt,
    source: {
      url: `${X402_LIST_API}/services`,
      license: "CC-BY-4.0",
      attribution: "Data: x402-list.com (CC BY 4.0)",
    },
    category,
    ours,
    rows: sorted,
    totals,
    ours_per_hundred: ours?.traction
      ? {
          volume: perHundred(ours.traction.volume_usd_30d, totals.volume_usd_30d),
          settlements: perHundred(ours.traction.tx_count_30d, totals.tx_count_30d),
        }
      : null,
    arrived: before ? sorted.map((row) => row.slug).filter((slug) => !before.has(slug)) : null,
    departed: before ? [...before].filter((slug) => !now.has(slug)).sort() : null,
    truncated,
    caveat: caveat ?? DEFAULT_CAVEAT,
    what_this_is_not: PEER_WHAT_THIS_IS_NOT,
  };
}

/**
 * Read the directory: our row for the category, then the category's
 * pages. Null when either read fails or the shape moved — a partial
 * reading is not a reading, and nothing is stored for the week.
 */
export async function readCategoryRows(
  fetchImpl: Fetcher = fetchJson,
): Promise<{ category: string; rows: PeerRow[]; truncated: boolean; caveat: string | null } | null> {
  const ours = await fetchImpl(`${X402_LIST_API}/services/${OUR_X402_LIST_SLUG}?ref=scvd`);
  const category = categoryOf(ours);
  if (!category) return null;
  const rows: PeerRow[] = [];
  let caveat: string | null = null;
  let page = 1;
  let totalPages = 1;
  let truncated = false;
  do {
    const body = await fetchImpl(`${X402_LIST_API}/services?per_page=100&page=${page}&category=${encodeURIComponent(category)}&ref=scvd`);
    if (typeof body !== "object" || body === null) return null;
    const payload = body as { data?: unknown; meta?: unknown };
    if (!Array.isArray(payload.data)) return null;
    if (page === 1) {
      const declared = typeof payload.meta === "object" && payload.meta !== null ? (payload.meta as { total_pages?: unknown }).total_pages : undefined;
      totalPages = typeof declared === "number" && Number.isFinite(declared) && declared >= 1 ? declared : 1;
      if (totalPages > PEER_PAGE_CAP) {
        truncated = true;
        totalPages = PEER_PAGE_CAP;
      }
    }
    for (const raw of payload.data) {
      const row = peerRowOf(raw);
      if (!row) continue;
      rows.push(row);
      if (!caveat) {
        const traction = ((raw as { assessment?: { traction?: { caveat?: unknown } } }).assessment?.traction ?? {}) as { caveat?: unknown };
        caveat = str(traction.caveat);
      }
    }
    page += 1;
  } while (page <= totalPages);
  return { category, rows, truncated, caveat };
}

export async function readPeerShelf(env: Env, week: string): Promise<PeerShelf | null> {
  return kvGetJson<PeerShelf>(env.COUNTERS, KV_KEYS.peerShelf(week), "json").catch(() => null);
}

export type PeerShelves = PeerShelf[] & { listing_truncated?: boolean };

/** Every week read, newest first. `listing_truncated` when the scan hit PEER_WEEKS_CAP: the newest weeks may be missing. */
export async function readPeerShelves(env: Env): Promise<PeerShelves> {
  const listed = await listKeys(env.COUNTERS, { prefix: KV_KEYS.peerShelfPrefix, cap: PEER_WEEKS_CAP });
  const values = await bulkGetJson<PeerShelf>(env.COUNTERS, listed.names);
  const shelves: PeerShelves = [];
  for (const name of listed.names) {
    const shelf = values.get(name);
    if (shelf) shelves.push(shelf);
  }
  shelves.sort((a, b) => b.week.localeCompare(a.week));
  if (listed.truncated) shelves.listing_truncated = true;
  return shelves;
}

/**
 * Take this week's reading and keep it. Returns the shelf written, or
 * null when the directory could not be read (nothing stored: the
 * next firing tries again).
 */
export async function takePeerShelf(env: Env, now: Date = new Date(), fetchImpl: Fetcher = fetchJson): Promise<PeerShelf | null> {
  const week = currentWeekKey(now);
  const read = await readCategoryRows(fetchImpl);
  if (!read) return null;
  const previous = await readPeerShelf(env, previousWeekKey(week));
  const shelf = deriveShelf(week, now.toISOString(), read.category, read.rows, previous, read.truncated, read.caveat);
  await kvPut(env.COUNTERS, KV_KEYS.peerShelf(week), JSON.stringify(shelf));
  return shelf;
}

/** The week's reading if it exists, else taken now. Idempotent per ISO week. */
export async function ensureWeekPeerShelf(env: Env, now: Date = new Date(), fetchImpl: Fetcher = fetchJson): Promise<PeerShelf | null> {
  const held = await readPeerShelf(env, currentWeekKey(now));
  if (held) return held;
  return takePeerShelf(env, now, fetchImpl);
}
