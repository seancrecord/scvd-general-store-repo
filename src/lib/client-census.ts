import { bulkGetText } from "@/lib/kv-bulk";
import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { NO_UA } from "@/lib/walkers";
import type { Env } from "@/types";

/**
 * WHO CALLS EACH INSTRUMENT, BY MONTH (2026-09-11).
 *
 * The growth ledger showed the conformance desk at 791 organic calls
 * in the last eleven days of August and 247 in the first eleven of
 * September, and nothing on any page could say whether August was
 * seventy callers or one script at seventy a day. The porch counts
 * calls; the walker rule that catches a catalog-walker reads price
 * asks only; the event rows carry the user-agent but expire at
 * ninety days and are read newest-first under a cap that a busy
 * month exhausts in a day. So one prober read as growth, and its
 * departure read as decline.
 *
 * THIS IS THE MCP CLIENT CENSUS'S SHAPE, one key per instrument per
 * month, a capped map of user-agent → calls inside it. A user-agent
 * is a stranger's string, so it never becomes a KEY of its own; past
 * the cap the count lands on `other` rather than on the floor. A
 * user-agent is software, not a person — the same category the
 * event rows already keep for ninety days — and nothing here touches
 * the no-cookies, no-IPs stance.
 *
 * A FLOOR, twice over: read-modify-write on one key loses an
 * increment under contention, and the porch's own write budget
 * drops visits before this is ever called. At instrument volumes
 * (hundreds a day, not thousands a second) the shape survives.
 */

export const INSTRUMENT_CLIENT_CAP = 40;
/** Bounded like the event row's user-agent; a longer string is the same client. */
const CLIENT_KEY_MAX = 120;

const KIND = "uaclient";

export function instrumentClientsKey(month: string, surface: string): string {
  return KV_KEYS.metric(month, KIND, surface);
}

/** The census key for a client: the user-agent verbatim and bounded, NO_UA when there was none. */
export function clientKey(userAgent: string | undefined): string {
  const ua = (userAgent ?? "").trim();
  return ua.length > 0 ? ua.slice(0, CLIENT_KEY_MAX) : NO_UA;
}

function parse(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function recordInstrumentClient(
  env: Env,
  surface: string,
  userAgent: string | undefined,
  month: string,
): Promise<void> {
  const key = instrumentClientsKey(month, surface);
  const census = parse(await kvGet(env.COUNTERS, key));
  const client = clientKey(userAgent);
  if (census[client] === undefined && Object.keys(census).length >= INSTRUMENT_CLIENT_CAP) {
    census["other"] = (census["other"] ?? 0) + 1;
  } else {
    census[client] = (census[client] ?? 0) + 1;
  }
  await kvPut(env.COUNTERS, key, JSON.stringify(census));
}

export interface InstrumentClients {
  surface: string;
  /** Names in the map, `other` included when present: a floor on software, never on people. */
  distinct: number;
  calls: number;
  /** Most calls first, bounded by the caller. */
  top: { client: string; calls: number }[];
}

/**
 * Every instrument's census for the month, keyed by surface. Empty
 * before the census existed. `truncated` on the map says the key scan
 * hit its cap, which the roster's size makes unreachable today; it is
 * carried rather than assumed.
 */
export interface InstrumentClientsMap extends Map<string, InstrumentClients> {
  truncated?: boolean;
}

export async function readInstrumentClients(
  env: Env,
  month: string,
  top = 5,
): Promise<InstrumentClientsMap> {
  const prefix = `${KV_KEYS.metricMonthPrefix(month)}${KIND}:`;
  // BOUNDED-READ-SAFE: one key per censused surface per month, and a
  // surface is a name off the porch roster (lib/instrument-roster.ts:
  // a few dozen free instruments and paid tools), never a stranger's
  // string — no request can mint a key here. The cap is several times
  // the roster; the truncated flag is carried anyway, so a census that
  // ever hit it reads as a floor rather than a total.
  const listed = await listKeys(env.COUNTERS, { prefix, cap: 200 });
  const values = await bulkGetText(env.COUNTERS, listed.names);
  const out: InstrumentClientsMap = new Map<string, InstrumentClients>();
  if (listed.truncated) out.truncated = true;
  for (const name of listed.names) {
    const surface = name.slice(prefix.length);
    const census = parse(values.get(name) ?? null);
    const rows = Object.entries(census)
      .map(([client, calls]) => ({ client, calls }))
      .sort((a, b) => b.calls - a.calls || a.client.localeCompare(b.client));
    out.set(surface, {
      surface,
      distinct: rows.length,
      calls: rows.reduce((sum, row) => sum + row.calls, 0),
      top: rows.slice(0, top),
    });
  }
  return out;
}
