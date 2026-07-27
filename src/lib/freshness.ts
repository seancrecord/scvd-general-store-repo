import { ALMANAC_ENTRIES } from "@/store/almanac";
import directoryData from "@/store/directory.json";
import { TRUST_LIST_ENTRIES } from "@/store/trust-list";

/**
 * WHEN WAS THIS LAST TRUE — the one thing every machine surface was
 * missing.
 *
 * AEO/GEO audit, 2026-07-27: llms.txt, menu.json, the well-known
 * document, the sitemap and the JSON-LD were all undated. Not one of
 * them told a reader when the words were last checked. That is the
 * wrong omission for this store specifically, because the entire
 * pitch is "somebody actually went and looked, on a date" — an
 * undated claim of freshness is the same shape as the auto-refund
 * line: something we meant, published in a form nobody could check.
 *
 * It is DERIVED, never hand-maintained. A date you have to remember to
 * update is a date that will eventually lie, and a stale date is worse
 * than no date at all: it is a false claim rather than a missing one.
 * So this reads the dates the store already keeps, in files a change
 * has to touch anyway, and takes the newest.
 *
 * WHAT IT IS NOT: a claim that anything changed today. It is the most
 * recent date on which any dated part of the catalog changed. If that
 * is three weeks ago, this says three weeks ago, out loud, on every
 * surface. A store that only publishes its freshness when the number
 * flatters it is not publishing freshness.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function latestOf(dates: readonly string[]): string {
  let latest = "";
  for (const date of dates) {
    const day = date.slice(0, 10);
    if (DATE_ONLY.test(day) && day > latest) {
      latest = day;
    }
  }
  return latest;
}

/**
 * The newest date the catalog itself carries. Directory listings,
 * trust-list checks, and almanac entries are the three dated bodies a
 * substantive change has to pass through.
 */
export function catalogLastUpdated(): string {
  return latestOf([
    directoryData.updated,
    ...directoryData.listings.map((listing) => listing.added),
    ...TRUST_LIST_ENTRIES.map((entry) => entry.last_checked),
    ...ALMANAC_ENTRIES.map((entry) => entry.date),
  ]);
}

/** Whole days between the last catalog change and now. */
export function daysSinceUpdate(now: Date = new Date()): number {
  const updated = Date.parse(`${catalogLastUpdated()}T00:00:00.000Z`);
  if (!Number.isFinite(updated)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - updated) / 86400000));
}

/**
 * The block every machine surface carries. `as_of` is the honest
 * answer to "how old is this"; `checked_at` is this response, and the
 * two are deliberately different fields, because serving a page today
 * is not the same as having checked its contents today. Collapsing
 * them would be exactly the small lie this file exists to prevent.
 */
export interface FreshnessBlock {
  as_of: string;
  checked_at: string;
  note: string;
}

export function freshness(now: Date = new Date()): FreshnessBlock {
  return {
    as_of: catalogLastUpdated(),
    checked_at: now.toISOString(),
    note: "as_of is the newest date anything in the catalog was written or re-checked by hand. checked_at is when this response was served. They are different on purpose: serving a page is not the same as having verified what is on it.",
  };
}

/**
 * How stale is too stale. Not an expiry and nothing breaks at the
 * line — it is the point at which the rounds tell the keeper the
 * machine-facing surfaces have gone quiet, because a directory of
 * neighbors nobody has revisited in a month is a directory that has
 * started describing the past.
 */
export const STALE_AFTER_DAYS = 30;
