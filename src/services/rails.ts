import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * WHICH CHAIN THE MONEY CAME IN ON — the one fact the front of the
 * store was missing, and the keeper's ask: this shop takes USDC on two
 * rails and said so nowhere a human would look, in a line ("USDC on
 * Base or Solana") that only ever appeared inside the agent door.
 *
 * WHERE THE NUMBERS COME FROM. Certificates. Every paid purchase mints
 * one carrying the network it settled on, which makes them the only
 * all-time record of the split — the settle counters have never known
 * a rail, so a counter added at the till today would report zeroes for
 * every sale this store has already made, and a zero that means "not
 * measured" is the exact shape of lie this store keeps hunting.
 *
 * WHY IT IS A SNAPSHOT. That walk reads every certificate in the
 * drawer. The storefront is the page a crawler hits for free and a
 * buyer hits before deciding anything; it gets one KV read, and the
 * cron does the walking. A snapshot that fails to refresh goes STALE
 * rather than wrong, carries the timestamp that proves it, and the
 * front of the store simply drops the split when there is none —
 * the organic count stands on its own, as it did before.
 *
 * WHY IT NEVER OVERRULES THE ORGANIC FIGURE. Two substrates: the
 * organic count comes from the settle counters, the split from the
 * certificates, and this store has already published one subtraction
 * that didn't come out. So the split is rendered against the counter
 * total and the remainder is NAMED — penny pages settle real money and
 * mint no certificate, and a facilitator can return a network we don't
 * recognise. Base + Solana + unattributed always equals the organic
 * figure printed beside it, because the last term is computed to make
 * it so, and it is labelled rather than hidden.
 */

export interface RailSplit {
  /** Organic sales whose certificate says an eip155 (Base) network. */
  base: number;
  /** Organic sales whose certificate says a solana network. */
  solana: number;
  /** Organic, certificate-backed, network unrecognised. */
  unknown: number;
  /** True when the cert scan hit its cap: the split is a floor, not a total. */
  truncated: boolean;
  computed_at: string;
}

/** Walks the certificates. Cron work, never a page render. */
export async function computeRailSplit(env: Env): Promise<RailSplit> {
  const { takeSummary } = await import("@/services/books-summary");
  const summary = await takeSummary(env);
  return {
    base: summary.rails.base.sales,
    solana: summary.rails.solana.sales,
    unknown: summary.rails.unknown.sales,
    truncated: summary.truncated,
    computed_at: new Date().toISOString(),
  };
}

export async function refreshRailSplit(env: Env): Promise<RailSplit> {
  const split = await computeRailSplit(env);
  await env.COUNTERS.put(KV_KEYS.railSplit, JSON.stringify(split));
  return split;
}

/** The snapshot, or null. Null renders as no split at all, never as zeroes. */
export async function readRailSplit(env: Env): Promise<RailSplit | null> {
  const stored = await env.COUNTERS.get<RailSplit>(KV_KEYS.railSplit, "json");
  if (
    !stored ||
    typeof stored.base !== "number" ||
    typeof stored.solana !== "number"
  ) {
    return null;
  }
  return stored;
}
