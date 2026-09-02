import { ROUTES } from "@/lib/when-to-buy";
import { sampleForItem } from "@/services/sample-artifacts";

/**
 * THE SHOPPING FIELDS (roadmap S6, 2026-09-02): what a shopping agent
 * needs beside a price, derived from the three places the store
 * already holds it and typed nowhere new.
 *
 *   - `when`: the situations an item answers, read off the routing
 *     table that scvd://when and /when-to-buy render (ROUTES). A job
 *     is a sentence in a caller's head and lives in exactly one file;
 *     this reverses that file per item rather than writing a second.
 *     Where the route leads with a free instrument, the entry carries
 *     it, because the counter answers free first and a shopping field
 *     that dropped that line would be an advertisement.
 *   - `sample_url`: the specimen, from the same roster /samples and the
 *     item pages read (SAMPLES). Present only where a specimen exists.
 *   - `verify`: the one pattern every certificate this store mints
 *     resolves at, free, forever.
 *
 * NO NEW CATEGORY LIST (the S6 acceptance). Nothing here is a taxonomy
 * typed for the occasion; delete ROUTES or SAMPLES and these fields go
 * empty, which is the correct failure for a derived field.
 */

export interface WhenEntry {
  /** The job, in the caller's words, exactly as the routing table has it. */
  job: string;
  /** The free instrument the counter names first for this job, when there is one. */
  free_first?: string;
}

/** The situations an item answers, in the routing table's order. */
export function whenFor(itemId: string): WhenEntry[] {
  return ROUTES.filter((route) => route.items.includes(itemId)).map((route) => ({
    job: route.job,
    ...(route.free ? { free_first: route.free } : {}),
  }));
}

/** The specimen's URL for an item, from the roster, or null when none is built. */
export function sampleUrlFor(itemId: string, base: string): string | null {
  const listing = sampleForItem(itemId);
  return listing ? `${base}/samples/${listing.slug}.json` : null;
}

/** Where a certificate from any purchase verifies: the same door for every item. */
export function verifyPattern(base: string): string {
  return `${base}/api/verify/{cert_id}`;
}

/** The three, together, for a catalog row or an atlas door. */
export function shoppingFields(itemId: string, base: string): {
  when: WhenEntry[];
  sample_url?: string;
  verify: string;
} {
  const sample = sampleUrlFor(itemId, base);
  return {
    when: whenFor(itemId),
    ...(sample ? { sample_url: sample } : {}),
    verify: verifyPattern(base),
  };
}
