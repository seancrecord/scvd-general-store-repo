import { KV_KEYS } from "@/lib/kv-keys";
import { BLESSINGS } from "@/store/blessings";
import { FORTUNES } from "@/store/fortunes";
import type { Env } from "@/types";

/**
 * The Penny Shelf's delivery logic. Blessings draw at random with a KV
 * memory of the last slip so no two consecutive buyers get the same one;
 * the daily fortune is a deterministic day-pick so everyone shares the
 * same chalkboard until midnight UTC.
 */

export async function drawBlessing(env: Env): Promise<string> {
  const lastRaw = await env.COUNTERS.get(KV_KEYS.blessingLast);
  const last = lastRaw ? parseInt(lastRaw, 10) : -1;
  let index = Math.floor(Math.random() * BLESSINGS.length);
  if (index === last) {
    index = (index + 1) % BLESSINGS.length;
  }
  await env.COUNTERS.put(KV_KEYS.blessingLast, String(index));
  return BLESSINGS[index] as string;
}

export function dailyFortune(date: Date = new Date()): string {
  const dayStamp = date.toISOString().slice(0, 10);
  // FNV-1a over the date keeps the pick stable all day and unpredictable
  // enough across days.
  let hash = 0x811c9dc5;
  for (let i = 0; i < dayStamp.length; i += 1) {
    hash ^= dayStamp.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return FORTUNES[hash % FORTUNES.length] as string;
}
