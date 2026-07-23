import { currentWeekKey } from "@/lib/kv-keys";
import { ZODIAC_SIGNS } from "@/store/zodiac";
import {
  SEASON_ONE,
  SEASON_ONE_FIRST_ISO_WEEK,
  SEASON_ONE_YEAR,
  SEASON_WEEKS,
} from "@/store/zodiac-season-one";
import type { SeasonEntry, ZodiacSign } from "@/types";

/**
 * The Systems Almanac's machinery. Everything is deterministic: an
 * address keeps its sign for life (derivation FROZEN, same fnv1a,
 * same modulo, since the structure shipped), and a (sign, week) pair
 * resolves to one stored page, byte-identical on every read.
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

/** An address's sign, fixed for life. Do not change this derivation. */
export function signForAddress(address: string): ZodiacSign {
  const normalized = address.toLowerCase();
  const index = fnv1a(normalized) % ZODIAC_SIGNS.length;
  return ZODIAC_SIGNS[index] ?? ZODIAC_SIGNS[0]!;
}

export function signById(signId: string): ZodiacSign | undefined {
  return ZODIAC_SIGNS.find((sign) => sign.id === signId);
}

/**
 * Maps an ISO week key ("2026-W32") to a season week 1..13, clamped to
 * the season's edges outside it.
 */
export function seasonWeekFor(weekKey: string = currentWeekKey()): number {
  const [yearRaw, weekRaw] = weekKey.split("-W");
  const year = parseInt(yearRaw ?? "0", 10);
  const isoWeek = parseInt(weekRaw ?? "0", 10);
  if (year < SEASON_ONE_YEAR) {
    return 1;
  }
  if (year > SEASON_ONE_YEAR) {
    return SEASON_WEEKS;
  }
  const offset = isoWeek - SEASON_ONE_FIRST_ISO_WEEK + 1;
  return Math.min(Math.max(offset, 1), SEASON_WEEKS);
}

/** One sign's page for one season week. Pure lookup; byte-stable. */
export function seasonEntry(signId: string, week: number): SeasonEntry | undefined {
  return SEASON_ONE[signId]?.find((entry) => entry.week === week);
}

/**
 * Past season weeks (strictly before the current one), the archive.
 * Empty before the season starts; the current week is never archive.
 */
export function archiveWeeks(weekKey: string = currentWeekKey()): number[] {
  const current = seasonWeekFor(weekKey);
  const weeks: number[] = [];
  for (let week = 1; week < current; week += 1) {
    weeks.push(week);
  }
  return weeks;
}

/** The page as markdown, the archive's deliverable and the free week's body. */
export function renderEntryMarkdown(
  sign: ZodiacSign,
  entry: SeasonEntry,
): string {
  return `# The Systems Almanac, ${sign.name}, Season One, Week ${entry.week}

*${sign.essence} Penalty: ${sign.penalty}*

CONDITIONS: ${entry.conditions}

FORECAST: ${entry.forecast}

Auspicious: ${entry.auspicious}
Avoid: ${entry.avoid}
Compatible: ${entry.compatible}
`;
}
