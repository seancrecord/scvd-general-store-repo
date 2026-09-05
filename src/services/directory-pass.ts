import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson } from "@/lib/kv-retry";
import type { Env } from "@/types";

/**
 * THE COMPLETED PASS, READ — and nothing else in this file, on purpose.
 *
 * test/collector-cannot-pay.spec.ts holds that no probe root can reach
 * a payment signer through the import graph: the thing that observes
 * must never be one import away from the thing that spends. The
 * directory walker pays x402scan a cent a page and so reaches the
 * signer, correctly. The Sunday round needs exactly one thing from it
 * — the last completed pass's hosts, a KV read — and the first cut had
 * the round import the walker to get it, which put the ward round
 * three imports from a signing call with nothing to say so. Caught by
 * the guard on the first CI run (2026-09-05).
 *
 * So the read lives here, behind a wall the walker imports and the
 * round imports, and the two never meet. This module must stay free of
 * launch-check, pay-fetch and anything that touches viem/accounts.
 */

export interface DirectoryPass {
  artifact: "directory_pass";
  source: string;
  week: string;
  started_at: string;
  finished_at: string;
  pages_read: number;
  hosts_known: number;
  hosts: string[];
  spent_usd: number;
  truncated: boolean;
  truncated_why?: string;
  what_this_cannot_see: string[];
}

/** A completed pass older than this is not this week's population. */
export const PASS_FRESH_HOURS = 24 * 8;

export async function latestDirectoryPass(env: Env, source: string): Promise<DirectoryPass | null> {
  return kvGetJson<DirectoryPass>(env.COUNTERS, KV_KEYS.directoryPass(source), "json");
}

/**
 * WHAT THE CENSUS GETS: the last completed pass's hosts, when it ran to
 * the directory's own end within the freshness window; null otherwise.
 * Null is the census's word for "could not read", and that is exactly
 * what a truncated or stale pass is to a weekly population.
 */
export async function passForCensus(env: Env, source: string, now = new Date()): Promise<string[] | null> {
  const pass = await latestDirectoryPass(env, source);
  if (!pass || pass.truncated) return null;
  const age = now.getTime() - Date.parse(pass.finished_at);
  if (!Number.isFinite(age) || age > PASS_FRESH_HOURS * 3_600_000) return null;
  return pass.hosts;
}
