/**
 * READER LIMITS, AS PART OF THE CONTRACT (house rule 59).
 *
 * A surface published for a reader includes that reader's fetch
 * cap in what "published" means. The numbers live here once —
 * the tests import them, and a new machine door an agent is told
 * to fetch is added to MACHINE_SURFACE_CEILINGS in the same
 * change that publishes it.
 *
 * OpenAPI has its own spec for path-count and $ref integrity
 * (test/openapi-fetchable.spec.ts). This module is the measured
 * ceiling, shared, so the 1 MB scanner cap is not typed in two
 * files and then quietly disagrees.
 */

/**
 * What the agent-side scanners will fetch, in bytes. Observed
 * 2026-08-31: Circle's Sell-to-Agents check (and peers) drop a
 * document over this rather than truncate it. The store then
 * reads as having no contract.
 */
export const SCANNER_FETCH_CAP_BYTES = 1_000_000;

/**
 * Where the alarm goes off. Well under the cap on purpose: a
 * guard that fires at 99% of a limit fires when it is already
 * too late to do anything cheap about it.
 */
export const SCANNER_BUDGET_BYTES = 700_000;

/**
 * The llmstxt.org recommendation. /llms.txt is the index;
 * /llms-full.txt is the complete guide and is allowed to be
 * longer — agents who want the whole thing ask for it by name.
 */
export const LLMS_INDEX_CHARACTER_BUDGET = 30_000;

export type MachineSurfaceKind = "json" | "text";

export interface MachineSurfaceCeiling {
  path: string;
  /** Alarm: well under the reader cap. */
  budget: number;
  /** The reader stops fetching at this size. */
  fetchCap: number;
  kind: MachineSurfaceKind;
}

/**
 * Machine surfaces an arriving agent is told to fetch, each
 * with the reader's limit as part of the contract.
 *
 * PROBLEMS #25 named the four after OpenAPI. OpenAPI sits on
 * the list so the ceiling is derived, not restated beside it.
 */
export const MACHINE_SURFACE_CEILINGS: readonly MachineSurfaceCeiling[] = [
  {
    path: "/openapi.json",
    budget: SCANNER_BUDGET_BYTES,
    fetchCap: SCANNER_FETCH_CAP_BYTES,
    kind: "json",
  },
  {
    path: "/menu.json",
    budget: SCANNER_BUDGET_BYTES,
    fetchCap: SCANNER_FETCH_CAP_BYTES,
    kind: "json",
  },
  {
    path: "/corpus.json",
    budget: SCANNER_BUDGET_BYTES,
    fetchCap: SCANNER_FETCH_CAP_BYTES,
    kind: "json",
  },
  {
    path: "/.well-known/x402.json",
    budget: SCANNER_BUDGET_BYTES,
    fetchCap: SCANNER_FETCH_CAP_BYTES,
    kind: "json",
  },
  {
    path: "/llms.txt",
    budget: LLMS_INDEX_CHARACTER_BUDGET,
    fetchCap: LLMS_INDEX_CHARACTER_BUDGET,
    kind: "text",
  },
];
