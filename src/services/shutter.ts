import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, MenuItem } from "@/types";

/**
 * The shutter: the store never promises labor nobody is there to do.
 * Since the keeper's ruling 2026-07-25 it works as a PRESENCE WINDOW,
 * not a dead-man switch: the human-labor shelf is only open within
 * PRESENT_WINDOW_HOURS of the keeper being seen at the counter, and
 * it is CLOSED by default — no visit on record means no sale, so a
 * missed order can never sit on money. Two ways to close it early:
 *   1. The keeper throws the lever (vacation, day job, life).
 *   2. Time: the window simply runs out.
 * Opening the counter (or the lever) restarts the window. The machine
 * shelves and the stocked shelves never close.
 */

export const PRESENT_WINDOW_HOURS = 48;

export async function markKeeperSeen(env: Env): Promise<void> {
  await env.COUNTERS.put(KV_KEYS.keeperLastSeen, new Date().toISOString());
}

export async function setShutter(env: Env, closed: boolean): Promise<void> {
  if (closed) {
    await env.COUNTERS.put(KV_KEYS.shutterOverride, "closed");
  } else {
    await env.COUNTERS.delete(KV_KEYS.shutterOverride);
    // Opening is proof of presence; the window restarts.
    await markKeeperSeen(env);
  }
}

export interface ShutterState {
  closed: boolean;
  /** "lever" or "away" (window expired or never started); absent when open. */
  cause?: "lever" | "away";
  keeper_last_seen?: string;
}

export async function shutterState(env: Env): Promise<ShutterState> {
  const [override, lastSeen] = await Promise.all([
    env.COUNTERS.get(KV_KEYS.shutterOverride),
    env.COUNTERS.get(KV_KEYS.keeperLastSeen),
  ]);
  if (override === "closed") {
    return {
      closed: true,
      cause: "lever",
      ...(lastSeen ? { keeper_last_seen: lastSeen } : {}),
    };
  }
  // Closed by default: no visit on record means nobody is provably
  // at the counter, and this store does not take money on a maybe.
  if (!lastSeen) {
    return { closed: true, cause: "away" };
  }
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  if (ageMs > PRESENT_WINDOW_HOURS * 3600 * 1000) {
    return { closed: true, cause: "away", keeper_last_seen: lastSeen };
  }
  return { closed: false, keeper_last_seen: lastSeen };
}

/**
 * Whether this purchase needs the keeper present. Stocked shelves
 * never do: their units are keeper-made ahead of time, and a bare
 * shelf sells out honestly before any 402 (buy.ts stockCheck), so no
 * order can land on an absent keeper's counter.
 */
export async function requiresPresentKeeper(
  _env: Env,
  item: MenuItem,
): Promise<boolean> {
  return item.fulfillment === "human_queue" && !item.stocked;
}
