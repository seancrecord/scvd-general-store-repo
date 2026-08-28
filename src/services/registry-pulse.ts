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
  /** Carries the round's `basis` through (2026-08-28): absent on a
   * stored week = the header-only offer read, a floor not a total. */
  signed_offers: MarketAggregates["signed_offers"];
  /**
   * Either basis. Weeks measured before 2026-08-25 carry the old
   * Base-vs-Solana buckets and are NOT back-filled — nobody re-probed
   * those doors, so recomputing their split would be inventing an
   * observation. `isPerRail()` tells the two apart.
   */
  rails: MarketRails | LegacyMarketRails;
  price_usdc: MarketAggregates["price_usdc"];
  /**
   * WHAT THE ROUND COULD NOT SEE, CARRIED TO PUBLISH (the keeper's
   * ruling 2026-08-28, "yes safer better" — the instrument audit's
   * rule-52 row).
   *
   * The round has always recorded its own coverage honestly, and
   * this builder threw every field away, so /registry published a
   * capped walk under a sentence about knocking on every listed
   * door with nothing beside the number to say it was a floor.
   *
   * Absent on weeks published before this shipped. A reader must
   * treat missing as NOT RECORDED — never as coverage that was
   * fine, which is the flattering reading and the wrong one.
   */
  coverage?: {
    /** The round hit its host cap; the tail was never walked. */
    capped: boolean;
    /** A full page arrived with no recognizable cursor. */
    coverage_suspect: boolean;
    /** Set when this round probed under 60% of the last one's. */
    coverage_drop?: {
      previous_hosts: number;
      this_round: number;
      previous_at: string;
    };
    /** The population layer's denominator: every host the feeds
     * named, how many were walked, and the ratio. Absent on rounds
     * that predate that layer — again, not measured, not 100%. */
    population_known?: number;
    population_walked?: number;
    coverage_pct?: number | null;
  };
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
    coverage: {
      capped: round.capped === true,
      coverage_suspect: round.coverage_suspect === true,
      ...(round.coverage_drop ? { coverage_drop: round.coverage_drop } : {}),
      ...(round.population
        ? {
            population_known: round.population.population_known,
            population_walked: round.population.population_walked,
            coverage_pct: round.population.coverage_pct,
          }
        : {}),
    },
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
