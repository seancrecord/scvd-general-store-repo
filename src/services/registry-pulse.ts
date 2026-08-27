import { KV_KEYS } from "@/lib/kv-keys";
import {
  marketAggregates,
  type LegacyMarketRails,
  type MarketAggregates,
  type MarketRails,
} from "@/services/market";
import { latestWardRound, type WardRound } from "@/services/ward-round";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * STATE OF THE REGISTRY — the market desk's aggregates, made public
 * as a standing running tally. The keeper's design brief, 2026-08-19,
 * verbatim intent: "keep a page with this and update it in a
 * summary/running tally every week publicly without naming names."
 *
 * WITHOUT NAMING NAMES is enforced in the builder, not the page: the
 * public entry carries counts, percentages and price quartiles only.
 * The concentration TOP LIST — the one aggregate that names operators
 * — is dropped here and never stored in this record, so no later page
 * edit can leak it. Aggregates about the neighbourhood, never rows
 * about a neighbour; the row-level record remains the signed corpus,
 * which carries its own consent posture.
 *
 * PUBLISHED BY THE HAND, NOT THE CLOCK (rule 30): the weekly round
 * derives these numbers automatically, but nothing lands on the
 * public tally until the keeper presses publish on /admin/market. He
 * reads the round first; the neighbourhood hears second.
 */

export interface RegistryWeekEntry {
  week: string;
  /** When the round observed; the publish stamp is the keeper's press. */
  observed_at: string;
  published_at: string;
  probed: number;
  ready: number;
  rot: { dead_doors: number; pct: number };
  signed_offers: { serving: number; of_ready: number; pct: number };
  /**
   * Either basis. Weeks measured before 2026-08-25 carry the old
   * Base-vs-Solana buckets and are NOT back-filled — nobody re-probed
   * those doors, so recomputing their split would be inventing an
   * observation. `isPerRail()` tells the two apart.
   */
  rails: MarketRails | LegacyMarketRails;
  price_usdc: MarketAggregates["price_usdc"];
  /** Counts only — the named top list stays in the office. */
  hosts: number;
  operators: number;
  top5_share_pct: number;
  schemes: Record<string, number>;
}

export interface RegistryPulse {
  version: 1;
  /** Ascending by week; bounded so the one key stays small forever. */
  weeks: RegistryWeekEntry[];
}

/** Two years of weekly rows ≈ a few tens of KB. Oldest fall off. */
const REGISTRY_WEEK_CAP = 104;

export async function readRegistryPulse(env: Env): Promise<RegistryPulse> {
  const stored = await kvGetJson<RegistryPulse>(env.COUNTERS, 
    KV_KEYS.registryPulse,
    "json",
  );
  return stored ?? { version: 1, weeks: [] };
}

/** Pure, so the anonymity rule is testable without KV or a clock. */
export function buildRegistryWeek(
  round: WardRound,
  publishedAt: string,
): RegistryWeekEntry {
  const market = round.market ?? marketAggregates(round.hosts, undefined);
  return {
    week: round.week,
    observed_at: round.at,
    published_at: publishedAt,
    probed: market.probed,
    ready: market.ready,
    rot: market.rot,
    signed_offers: market.signed_offers,
    rails: market.rails,
    price_usdc: market.price_usdc,
    hosts: market.concentration.hosts,
    operators: market.concentration.operators,
    top5_share_pct: market.concentration.top5_share_pct,
    schemes: market.schemes,
  };
}

export type PublishResult =
  | { ok: true; entry: RegistryWeekEntry; weeks: number; replaced: boolean }
  | { ok: false; refusal: string };

/**
 * The keeper's press. Idempotent per week — re-publishing the same
 * week replaces its row (the round may have been re-run by hand), and
 * the replacement is visible in published_at rather than silent.
 */
export async function publishRegistryWeek(env: Env): Promise<PublishResult> {
  const round = await latestWardRound(env);
  if (!round) {
    return { ok: false, refusal: "no ward round to publish from" };
  }
  const entry = buildRegistryWeek(round, new Date().toISOString());
  const pulse = await readRegistryPulse(env);
  const existing = pulse.weeks.findIndex((row) => row.week === entry.week);
  const replaced = existing >= 0;
  if (replaced) {
    pulse.weeks[existing] = entry;
  } else {
    pulse.weeks.push(entry);
    pulse.weeks.sort((a, b) => a.week.localeCompare(b.week));
    if (pulse.weeks.length > REGISTRY_WEEK_CAP) {
      pulse.weeks.splice(0, pulse.weeks.length - REGISTRY_WEEK_CAP);
    }
  }
  await kvPut(env.COUNTERS, KV_KEYS.registryPulse, JSON.stringify(pulse));
  return { ok: true, entry, weeks: pulse.weeks.length, replaced };
}
