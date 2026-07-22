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

/** house cat. Roger Sterling. */
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

/**
 * The treat rail. Anyone can leave Roger Sterling a treat, free.
 * Nothing about the treat is stored — only that one was left. His
 * reaction runs on the same hour clock as the rest of the porch:
 * everyone leaving one in the same hour gets the same Roger.
 */
const TREAT_REACTIONS_OUT: readonly string[] = [
  "Roger Sterling inspected it from a distance of one full plank, then looked back at the road.",
  "Roger Sterling accepted it with the dignity of a toll collector.",
  "Roger Sterling sniffed it once and sat down beside it, which is as close as he comes to thanks.",
  "Roger Sterling watched you set it down. He'll get to it on his own schedule.",
  "Roger Sterling blinked slowly. Around here that's a receipt.",
] as const;

const TREAT_REACTION_ELSEWHERE =
  "Roger Sterling is elsewhere. The treat stays on the rail. These things are always gone by morning.";

export function treatReaction(date: Date = new Date()): string {
  if (!catIsOut(date)) {
    return TREAT_REACTION_ELSEWHERE;
  }
  return (
    TREAT_REACTIONS_OUT[
      fnv1a(`treat:${hourKey(date)}`) % TREAT_REACTIONS_OUT.length
    ] ?? TREAT_REACTIONS_OUT[0]!
  );
}

export interface LeftTreat {
  reaction: string;
  treatsToday: number;
}

export async function leaveTreat(
  env: Env,
  date: Date = new Date(),
): Promise<LeftTreat> {
  const key = KV_KEYS.porchTreats(date.toISOString().slice(0, 10));
  const current = await env.COUNTERS.get(key);
  const treatsToday = (current ? parseInt(current, 10) : 0) + 1;
  // Nine days so the Gazette's weekly count can still see the rail.
  await env.COUNTERS.put(key, String(treatsToday), {
    expirationTtl: 9 * 86400,
  });
  return { reaction: treatReaction(date), treatsToday };
}

/** Treats left over the trailing week, for the Gazette's aggregate line. */
export async function treatsThisWeek(
  env: Env,
  date: Date = new Date(),
): Promise<number> {
  let total = 0;
  for (let daysBack = 0; daysBack < 7; daysBack += 1) {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() - daysBack);
    const count = await env.COUNTERS.get(
      KV_KEYS.porchTreats(day.toISOString().slice(0, 10)),
    );
    total += count ? parseInt(count, 10) : 0;
  }
  return total;
}
