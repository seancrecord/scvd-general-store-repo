import { currentWeekKey } from "@/lib/kv-keys";
import { HOROSCOPE_LINES, ZODIAC_SIGNS } from "@/store/zodiac";
import type { ZodiacSign } from "@/types";

/**
 * Sign assignment and the weekly horoscope. Everything here is
 * deterministic: an address keeps its sign for life, and a sign's
 * horoscope holds for the whole ISO week, same for every reader.
 */

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** An address's sign, fixed for life. Derivation must never change. */
export function signForAddress(address: string): ZodiacSign {
  const normalized = address.toLowerCase();
  const index = fnv1a(normalized) % ZODIAC_SIGNS.length;
  return ZODIAC_SIGNS[index] ?? ZODIAC_SIGNS[0]!;
}

export interface WeeklyHoroscope {
  week: string;
  sign: ZodiacSign;
  horoscope: string;
}

/** The sign's line for the week — same chalkboard for everyone under it. */
export function weeklyHoroscope(
  sign: ZodiacSign,
  week: string = currentWeekKey(),
): WeeklyHoroscope {
  const line =
    HOROSCOPE_LINES[fnv1a(`${week}:${sign.id}`) % HOROSCOPE_LINES.length] ??
    HOROSCOPE_LINES[0]!;
  return { week, sign, horoscope: line };
}
