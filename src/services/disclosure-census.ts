import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { metricsMonth } from "@/lib/metrics";
import {
  DISCLOSURE_FIELDS,
  censusValue,
  disclosedAnything,
  type Disclosure,
  type DisclosureField,
  type ReturningVerdict,
} from "@/lib/disclosure";
import type { Env } from "@/types";

/**
 * THE DISCLOSURE CENSUS — who tells us what, and who tells us nothing.
 *
 * Two questions, one key per door per month:
 *
 *   1. THE IGNORES. Every call that was OFFERED the block is counted
 *      whether or not it filled a field, so the rate of disclosure
 *      has its denominator beside it. If the rate stays near zero
 *      after the ask ships, the ask is wrong, and rule 56 wants that
 *      said out loud rather than read as "agents don't disclose".
 *
 *   2. THE SHAPES. For the fields that describe SOFTWARE (model,
 *      client, operator_kind, came_from as a hostname) the values are
 *      kept as a capped map with an "other" bucket, the MCP client
 *      census's shape (services/mcp-clients). `operator` and
 *      `prior_cert_id` are counted as supplied and never kept as
 *      values: one is a stranger's identity, the other joins to a
 *      wallet, and a census that keeps either is a dossier.
 *
 * TWO DOORS, NEVER BLENDED. "paid" is every purchase that settled;
 * "free" is the three instruments a buyer calls before paying. They
 * share no denominator, so they share no key.
 *
 * A FLOOR, STATED. Read-modify-write on one key loses an increment
 * under contention, and this write is never in front of the answer.
 * At the store's volumes the shape survives; the page that renders
 * it says so.
 *
 * PRIVATE. No route serves this to a stranger. It is the keeper's
 * reading of the customer base, which the books said was unanswerable
 * ("how many regulars do we have"), and it stays behind /admin until
 * a keeper ruling says which counts, with which denominators, may go
 * on a public page.
 */

export type DisclosureDoor = "paid" | "free";

/** Value maps hold this many distinct keys per field; the rest count as "other". */
export const DISCLOSURE_VALUE_CAP = 40;

export interface DisclosureCensus {
  /** Calls that were offered the block, filled or not. The denominator. */
  offered: number;
  /** Calls that filled at least one field. */
  disclosed: number;
  /** Calls that filled nothing: the ignores, kept as their own number so nobody has to subtract. */
  ignored: number;
  supplied: Record<DisclosureField, number>;
  values: Partial<Record<DisclosureField, Record<string, number>>>;
  /** Paid door only: what the prior_cert_id claim came to. */
  returning: Partial<Record<ReturningVerdict, number>>;
}

function emptyCensus(): DisclosureCensus {
  const supplied = Object.fromEntries(DISCLOSURE_FIELDS.map((f) => [f, 0])) as Record<DisclosureField, number>;
  return { offered: 0, disclosed: 0, ignored: 0, supplied, values: {}, returning: {} };
}

function censusKey(door: DisclosureDoor, month: string): string {
  return KV_KEYS.metric(month, "disclosure", door);
}

export async function readDisclosureCensus(
  env: Env,
  door: DisclosureDoor,
  month = metricsMonth(),
): Promise<DisclosureCensus> {
  const raw = await kvGet(env.COUNTERS, censusKey(door, month));
  if (!raw) return emptyCensus();
  try {
    const parsed = JSON.parse(raw) as Partial<DisclosureCensus>;
    const base = emptyCensus();
    return {
      offered: parsed.offered ?? 0,
      disclosed: parsed.disclosed ?? 0,
      ignored: parsed.ignored ?? 0,
      supplied: { ...base.supplied, ...(parsed.supplied ?? {}) },
      values: parsed.values ?? {},
      returning: parsed.returning ?? {},
    };
  } catch {
    return emptyCensus();
  }
}

function bump(map: Record<string, number>, key: string): void {
  if (map[key] === undefined && Object.keys(map).length >= DISCLOSURE_VALUE_CAP) {
    map["other"] = (map["other"] ?? 0) + 1;
  } else {
    map[key] = (map[key] ?? 0) + 1;
  }
}

/**
 * One call, offered the block, with whatever it filled. `returning`
 * is the paid door's verdict on a prior_cert_id claim, if one was
 * made; the free door never has a payer to check against.
 */
export async function recordDisclosure(
  env: Env,
  door: DisclosureDoor,
  disclosure: Disclosure,
  returning?: ReturningVerdict,
): Promise<void> {
  const month = metricsMonth();
  const census = await readDisclosureCensus(env, door, month);
  census.offered += 1;
  if (disclosedAnything(disclosure)) census.disclosed += 1;
  else census.ignored += 1;
  for (const field of DISCLOSURE_FIELDS) {
    const value = disclosure[field];
    if (value === undefined) continue;
    census.supplied[field] += 1;
    const kept = censusValue(field, value);
    if (kept === undefined) continue;
    const map = census.values[field] ?? {};
    bump(map, kept);
    census.values[field] = map;
  }
  if (returning) {
    census.returning[returning] = (census.returning[returning] ?? 0) + 1;
  }
  await kvPut(env.COUNTERS, censusKey(door, month), JSON.stringify(census));
}
