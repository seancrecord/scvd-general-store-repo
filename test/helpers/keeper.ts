import type { Env } from "@/types";

/**
 * The presence window (services/shutter.ts) closes the human-labor
 * shelf unless the keeper was seen at the counter within 48h — and
 * a fresh test KV has no visit on record, so the shelf starts CLOSED.
 * Specs that buy human-labor items call this first, standing in for
 * the keeper opening the counter.
 */
export async function markKeeperPresent(env: Env): Promise<void> {
  await env.COUNTERS.put("keeper_last_seen", new Date().toISOString());
}
