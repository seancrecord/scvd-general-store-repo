import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, MenuItem } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * The shutter: the store never promises labor nobody is there to do.
 *
 * THE LEVER ALONE CLOSES IT (keeper's ruling 2026-11-22: "turn off
 * the shutter closers automation"). From 2026-07-25 it was a PRESENCE
 * WINDOW that closed the human-labor shelf 48h after the keeper was
 * last seen at /admin/counter. That window closed The Aura Walk and
 * The Collab on 2026-11-20 while the keeper was working in other back
 * rooms (only /admin/counter counted as a visit), each door answered
 * 503, and x402-list graded the store degraded for two failing
 * endpoints. The keeper closes the shelf by hand before going away;
 * nothing closes it on a timer.
 *
 * Visits are still recorded (markKeeperSeen) and PRESENT_WINDOW_HOURS
 * still prices the public liveness beacon's presence fact; neither
 * gates a sale any more. The machine shelves and the stocked shelves
 * never close.
 */

export const PRESENT_WINDOW_HOURS = 48;

export async function markKeeperSeen(env: Env): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.keeperLastSeen, new Date().toISOString());
}

export async function setShutter(env: Env, closed: boolean): Promise<void> {
  if (closed) {
    await kvPut(env.COUNTERS, KV_KEYS.shutterOverride, "closed");
  } else {
    await env.COUNTERS.delete(KV_KEYS.shutterOverride);
    // Opening by hand is a visit too; it is recorded, not required.
    await markKeeperSeen(env);
  }
}

export interface ShutterState {
  closed: boolean;
  /** Only the keeper's lever closes the shelf; absent when open. */
  cause?: "lever";
  keeper_last_seen?: string;
}

export async function shutterState(env: Env): Promise<ShutterState> {
  const [override, lastSeen] = await Promise.all([
    kvGet(env.COUNTERS, KV_KEYS.shutterOverride),
    kvGet(env.COUNTERS, KV_KEYS.keeperLastSeen),
  ]);
  if (override === "closed") {
    return {
      closed: true,
      cause: "lever",
      ...(lastSeen ? { keeper_last_seen: lastSeen } : {}),
    };
  }
  return { closed: false, ...(lastSeen ? { keeper_last_seen: lastSeen } : {}) };
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
