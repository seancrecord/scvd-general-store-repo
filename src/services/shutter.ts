import { KV_KEYS } from "@/lib/kv-keys";
import { listLuckyStock } from "@/services/luckies";
import type { Env, MenuItem } from "@/types";

/**
 * The shutter: the store never promises labor nobody is there to do.
 * Two ways it closes the human-labor shelf, both honest:
 *   1. The keeper throws the lever (vacation, day job, life).
 *   2. The dead-man rule: no counter visit in AWAY_AFTER_DAYS means
 *      the shelf shutters on its own — a buyer years from now gets a
 *      straight answer, not a broken 168h promise.
 * The machine shelves never close. Stocked luckies keep selling; a
 * bare shelf behind the shutter queues nothing.
 */

export const AWAY_AFTER_DAYS = 14;

export async function markKeeperSeen(env: Env): Promise<void> {
  await env.COUNTERS.put(KV_KEYS.keeperLastSeen, new Date().toISOString());
}

export async function setShutter(env: Env, closed: boolean): Promise<void> {
  if (closed) {
    await env.COUNTERS.put(KV_KEYS.shutterOverride, "closed");
  } else {
    await env.COUNTERS.delete(KV_KEYS.shutterOverride);
    // Reopening is proof of presence; the dead-man clock restarts.
    await markKeeperSeen(env);
  }
}

export interface ShutterState {
  closed: boolean;
  /** "lever" or "dead-man"; absent when open. */
  cause?: "lever" | "dead-man";
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
  // No visit recorded yet (fresh meter): open until the first visit
  // starts the clock. The keeper is provably around on deploy days.
  if (!lastSeen) {
    return { closed: false };
  }
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  if (ageMs > AWAY_AFTER_DAYS * 86400 * 1000) {
    return { closed: true, cause: "dead-man", keeper_last_seen: lastSeen };
  }
  return { closed: false, keeper_last_seen: lastSeen };
}

/**
 * Whether this purchase needs the keeper present. Stocked luckies
 * don't; they fulfill themselves off the shelf.
 */
export async function requiresPresentKeeper(
  env: Env,
  item: MenuItem,
): Promise<boolean> {
  if (item.fulfillment !== "human_queue") {
    return false;
  }
  if (item.id === "luckies") {
    const stock = await listLuckyStock(env).catch(() => []);
    return stock.length === 0;
  }
  return true;
}
