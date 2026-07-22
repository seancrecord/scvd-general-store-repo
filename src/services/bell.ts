import { KV_KEYS } from "@/lib/kv-keys";
import { bellLine, VOICE } from "@/store";
import type { Env } from "@/types";

/**
 * The bell, rung from any door — HTTP or MCP, same bell. One ring per
 * visitor per day, keyed loosely on whoever they said they were.
 */

const DAY_SECONDS = 86400;

export interface BellResult {
  message: string;
  count: number;
}

export async function ringBell(env: Env, who: string): Promise<BellResult> {
  const today = new Date().toISOString().slice(0, 10);
  const ringKey = KV_KEYS.bellRing(who.toLowerCase(), today);
  const currentCount = parseInt(
    (await env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );
  if (await env.COUNTERS.get(ringKey)) {
    return { message: VOICE.bellRungAlready, count: currentCount };
  }
  const count = currentCount + 1;
  await env.COUNTERS.put(KV_KEYS.bellCount, String(count));
  await env.COUNTERS.put(ringKey, "1", { expirationTtl: DAY_SECONDS });
  return { message: bellLine(count), count };
}
