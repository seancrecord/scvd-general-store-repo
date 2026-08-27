import { cadenceFor } from "@/lib/cadence";
import type { Cadence } from "@/lib/cadence";
import { KV_KEYS } from "@/lib/kv-keys";
import { bellLine, VOICE } from "@/store";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";

/**
 * The bell, rung from any door. HTTP or MCP, same bell. One ring per
 * visitor per day, keyed loosely on whoever they said they were.
 */

const DAY_SECONDS = 86400;

export interface BellResult {
  message: string;
  count: number;
  /** When the ring resets, so a scheduled visitor can plan around us. */
  cadence?: Cadence;
}

export async function ringBell(env: Env, who: string): Promise<BellResult> {
  const today = new Date().toISOString().slice(0, 10);
  const ringKey = KV_KEYS.bellRing(who.toLowerCase(), today);
  const currentCount = parseInt(
    (await kvGet(env.COUNTERS, KV_KEYS.bellCount)) ?? "0",
    10,
  );
  const cadence = cadenceFor("bell");
  if (await kvGet(env.COUNTERS, ringKey)) {
    // The one response where the clock actually answers a question the
    // caller just asked: it rang, we said no, and now it knows when.
    return {
      message: VOICE.bellRungAlready,
      count: currentCount,
      ...(cadence ? { cadence } : {}),
    };
  }
  const count = currentCount + 1;
  await kvPut(env.COUNTERS, KV_KEYS.bellCount, String(count));
  await kvPut(env.COUNTERS, ringKey, "1", { expirationTtl: DAY_SECONDS });
  return { message: bellLine(count), count, ...(cadence ? { cadence } : {}) };
}
