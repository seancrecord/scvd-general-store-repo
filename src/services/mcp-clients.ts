import { kvGet, kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * WHO IS ACTUALLY KNOCKING AT THE MCP DOOR.
 *
 * The keeper's porch table, 2026-08-29: 12,280 handshakes and 11,803
 * tool listings in a month, and no purchases. The obvious reading is
 * a funnel problem — agents arrive, look at the prices and leave. The
 * honest answer was that nobody could tell, because every MCP client
 * announces itself in the handshake (`clientInfo: {name, version}`)
 * and this store dropped that field on the floor, keeping only a
 * User-Agent that most MCP clients do not meaningfully set.
 *
 * So the store was INFERRING its own visitors while selling other
 * people the discipline of observing theirs. A registry crawler
 * indexing a tool list and a real agent bouncing off a price are
 * different problems with different fixes, and the evidence to tell
 * them apart was arriving at the door and being discarded.
 *
 * WHAT THIS IS NOT. A client name is the software, not the person —
 * the same category as the User-Agent already recorded. It cannot
 * recognise a visitor across sessions and is not meant to; the
 * store's no-cookies, no-IP-retention stance is untouched.
 */

/**
 * BOUNDED, because the name is a stranger's string. porch-surface.ts
 * makes the point in its own comment: a per-host key would let anyone
 * mint unlimited counter keys. Same risk here, so the census lives in
 * ONE key per month holding a capped map, and everything past the cap
 * is counted as "other" rather than dropped. A count that stops
 * counting is worse than one that says "and this many I could not
 * name".
 */
export const MCP_CLIENT_CAP = 40;

/** One key per month. The map inside it is what is capped. */
function censusKey(month = metricsMonth()): string {
  return KV_KEYS.metric(month, "mcpclient", "census");
}

/**
 * A stranger's string becomes a key here, so it is normalised hard:
 * lowercased (one client should not appear three times for three
 * spellings), stripped to a conservative charset, and truncated. An
 * empty or fully-stripped name records as "unnamed" — a handshake
 * with no clientInfo is a real observation about a real client, and
 * dropping it would quietly shrink the denominator.
 */
export function normaliseClientName(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
  return cleaned.length > 0 ? cleaned : "unnamed";
}

export async function readMcpClients(
  env: Env,
  month = metricsMonth(),
): Promise<Record<string, number>> {
  const raw = await kvGet(env.COUNTERS, censusKey(month));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Read-modify-write on one key. Two handshakes landing in the same
 * instant can lose an increment, so these counts are a FLOOR rather
 * than a total — stated here because this store does not publish a
 * number without saying what could make it wrong. At handshake
 * volumes (hundreds a day, not thousands a second) the loss is
 * negligible, and the shape of the answer — which clients, in what
 * proportion — survives it.
 */
export async function recordMcpClient(
  env: Env,
  name: string | undefined,
  _version?: string,
): Promise<void> {
  const key = normaliseClientName(name);
  const census = await readMcpClients(env);
  if (census[key] === undefined && Object.keys(census).length >= MCP_CLIENT_CAP) {
    census["other"] = (census["other"] ?? 0) + 1;
  } else {
    census[key] = (census[key] ?? 0) + 1;
  }
  await kvPut(env.COUNTERS, censusKey(), JSON.stringify(census));
}
