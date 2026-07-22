import { KV_KEYS } from "@/lib/kv-keys";
import { PORCH_AMBIENCE } from "@/store/porch";
import type { Env } from "@/types";

/**
 * The porch: free, useless, open all night. The ambience is
 * deterministic per UTC hour so everyone sitting in the same hour
 * shares the same night. The cat keeps its own schedule — also
 * deterministic, never explained, out about two hours in five.
 */

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hourKey(date: Date): string {
  return date.toISOString().slice(0, 13);
}

/** The hour's line. Same for every sitter until the hour turns. */
export function porchAmbience(date: Date = new Date()): string {
  return (
    PORCH_AMBIENCE[fnv1a(`porch:${hourKey(date)}`) % PORCH_AMBIENCE.length] ??
    PORCH_AMBIENCE[0]!
  );
}

/** house cat */
export function catIsOut(date: Date = new Date()): boolean {
  return fnv1a(`cat:${hourKey(date)}`) % 5 < 2;
}

/** Take a seat; the counter resets nightly and forgets within days. */
export async function takeSeat(env: Env, date: Date = new Date()): Promise<number> {
  const key = KV_KEYS.porchSits(date.toISOString().slice(0, 10));
  const current = await env.COUNTERS.get(key);
  const seat = (current ? parseInt(current, 10) : 0) + 1;
  await env.COUNTERS.put(key, String(seat), { expirationTtl: 2 * 86400 });
  return seat;
}
