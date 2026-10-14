import { invertedTimestamp } from "@/lib/kv-keys";

export const EVENT_TTL_SECONDS = 90 * 86400;
/** Existing event keys use 13 digits; six leading digits span about 2.8 hours. */
export const EVENT_SLICE_MS = 10_000_000;
export const EVENT_PREFIX_DIGITS = 6;

/** Key-time slices, newest first. Event.at may precede the write's key time. */
export function eventPrefixes(start: number, end: number): string[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const first = Math.floor(Number(invertedTimestamp(end)) / EVENT_SLICE_MS);
  const last = Math.floor(Number(invertedTimestamp(start)) / EVENT_SLICE_MS);
  return Array.from({ length: last - first + 1 }, (_, i) =>
    `evt:${String(first + i).padStart(EVENT_PREFIX_DIGITS, "0")}`);
}
