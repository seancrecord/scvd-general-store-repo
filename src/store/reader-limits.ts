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
/*
 * RAISED 700_000 -> 750_000 on 2026-09-12, and the reason is on the
 * record rather than in a diff: the September 10 reduction left
 * 4,544 bytes of headroom, and every listed item costs the contract
 * about 8 KB (its buy door: the x402 terms per rail, the request
 * schema, the async-job stamp, the parameters — none of which this
 * store will thin per item, because scanners read them verbatim).
 * The card table's pack was the first listing after the reduction
 * and tripped the guard by construction, as the paper said the next
 * one would. 750,000 is three quarters of the hard cap and admits
 * about four more listings before this rings again; the next ring
 * is a ruling, not a number to move. ⚑ Keeper's pen on the number.
 */
/**
 * BACK TO 700,000 (2026-09-12, the keeper: "can we thin the contract
 * somehow?"). Thinned instead of raised: the 304 answer became one
 * shared component instead of eighty-one inline copies, the 402 offer
 * says its sentence in half the words on every paid door, and the
 * idempotency parameter's long form moved to /developers, where it
 * is read once rather than thirty-seven times; the async-job prose
 * and the purpose parameter say their sentence once, briefly.
 * Then the keeper's "just cut one": the bare x-request-schema copy
 * of every paid door's input schema came off, x-payment-info.input
 * keeping the one copy. Measured after (2026-09-12): 616,345 bytes
 * on today's rails, 644,818 with every checkout rail enabled (the
 * headroom test's case), from 697,332 and 703,235 before. Not a latency number — the document
 * builds in about 35 ms and travels gzipped at about 86 KB; this is
 * the uncompressed byte count a scanner with a fetch cap sees.
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
/** Local engineering targets for progressive discovery, not a claim about every host's context window. */
export const COMPACT_CATALOG_BUDGET_BYTES = 16_000;
export const SINGLE_ITEM_TOOL_BUDGET_BYTES = 10_000;

export const MACHINE_SURFACE_CEILINGS: readonly MachineSurfaceCeiling[] = [
  { path: "/corpus/index.json", budget: COMPACT_CATALOG_BUDGET_BYTES, fetchCap: SCANNER_FETCH_CAP_BYTES, kind: "json" },
  { path: "/a2a-desk.json", budget: 32000, fetchCap: SCANNER_FETCH_CAP_BYTES, kind: "json" },
  {
    path: "/menu.json?view=compact",
    budget: COMPACT_CATALOG_BUDGET_BYTES,
    fetchCap: SCANNER_FETCH_CAP_BYTES,
    kind: "json",
  },
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
