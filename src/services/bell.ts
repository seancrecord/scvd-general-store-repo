import { cadenceFor } from "@/lib/cadence";
import type { Cadence } from "@/lib/cadence";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import { bellLine, VOICE } from "@/store";
import type { Env } from "@/types";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { bellPressing, type BellPressings } from "@/services/cards";

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
  /** One common a day off the bell, and two packs for a current Regular (the Paywall); absent on a repeat ring. */
  pressing?: BellPressings;
}

export interface RingOptions {
  /** The ringer's wallet, so the card lands in a binder. Optional. */
  wallet?: string;
  /** A current patron pass: two packs at full odds (the first pass's Regular rule). */
  passId?: string;
}

/** Rings that counted this month: `metric:<month>:bell:rings`. */
export function bellRingsKey(month: string = metricsMonth()): string {
  return KV_KEYS.metric(month, "bell", "rings");
}

async function bumpMonthlyRings(env: Env): Promise<void> {
  const key = bellRingsKey();
  const current = await kvGet(env.COUNTERS, key);
  await kvPut(env.COUNTERS, key, String((current ? parseInt(current, 10) : 0) + 1));
}

export async function readBellRings(env: Env, month: string = metricsMonth()): Promise<number> {
  const raw = await kvGet(env.COUNTERS, bellRingsKey(month));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export async function ringBell(env: Env, who: string, options: RingOptions = {}): Promise<BellResult> {
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
  /*
   * THE MONTH'S RINGS (2026-09-11, the growth ledger). The lifetime
   * count above is the marquee's number and cannot say whether this
   * month rang more than last; the porch's `bell` surface counts
   * attempts, refused repeats included. This is rings that counted,
   * by month, beside every other monthly counter. A lost increment
   * under contention is a floor at bell volumes, and the ring itself
   * never waits on it.
   */
  await bumpMonthlyRings(env).catch(() => undefined);
  /*
   * THE BELL PRESSES A CARD (handoff v2 §5): one common a day to
   * whoever rings, drawn by the same seed with the salt "bell". A
   * pressing that fails to sign or file never breaks the ring — the
   * bell rang first, and it says so without the card.
   */
  const pressing = (await bellPressing(env, who, options).catch(() => null)) ?? undefined;
  return { message: bellLine(count), count, ...(cadence ? { cadence } : {}), ...(pressing ? { pressing } : {}) };
}
