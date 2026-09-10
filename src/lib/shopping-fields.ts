import { ROUTES } from "@/lib/when-to-buy";
import { getMenuItem } from "@/store/menu";
import type { MenuItem } from "@/types";

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
 *   - `sample_url`: the menu's existing specimen or preview, the same
 *     link the payment challenge and item page read.
 *   - `verify`: the one pattern every certificate this store mints
 *     resolves at, free, forever.
 *
 * NO NEW CATEGORY LIST (the S6 acceptance). Nothing here is a taxonomy
 * typed for the occasion; delete ROUTES or a menu preview and these fields go
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

/** The menu's preview URL, or null when none is built. No sample builder import. */
export function sampleUrlFor(itemId: string, base: string): string | null {
  const path = getMenuItem(itemId)?.sample_url;
  return path ? `${base}${path}` : null;
}

/** Where a certificate from any purchase verifies: the same door for every item. */
export function verifyPattern(base: string): string {
  return `${base}/api/verify/{cert_id}`;
}

/** The three, together, for a catalog row or an atlas door. */
export function shoppingFields(itemId: string, base: string): {
  when: WhenEntry[];
  sample_url?: string;
  sample_kind?: MenuItem["sample_kind"];
  verify: string;
} {
  const sample = sampleUrlFor(itemId, base);
  return {
    when: whenFor(itemId),
    ...(sample ? { sample_url: sample, sample_kind: getMenuItem(itemId)?.sample_kind ?? "unsigned_specimen" } : {}),
    verify: verifyPattern(base),
  };
}
