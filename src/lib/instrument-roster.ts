/**
 * THE FREE-INSTRUMENT ROSTER, as data (moved here 2026-09-11 from
 * services/instruments.ts, where it was born on 2026-09-04). It is
 * the one list that says which porch surfaces are the store's free
 * instruments, which take an argument and which are reads, and from
 * what date each was counted. The instruments desk, the growth
 * ledger, the look and the how-it-works page all read it from here;
 * nothing retypes it.
 *
 * WHY lib AND NOT services: the porch counter in lib/metrics.ts now
 * keeps a per-instrument client census at write time and has to ask
 * "is this surface an instrument" on every visit. lib does not import
 * services — the rule that keeps the module graph from deadlocking
 * (see monthsSinceOpening's note in lib/metrics.ts) — so the roster
 * came down a level and the service re-exports it.
 */

export type InstrumentKind = "argument" | "read";

export interface InstrumentEntry {
  prefix: string;
  /**
   * "argument": the call takes input (a URL, a receipt, a host to check).
   * Automated callers can supply it too. "read": a GET of a
   * page or list that any walker fetches by following links.
   */
  kind: InstrumentKind;
  /** The date the porch first counted this surface, off the dated comments in porch-surface.ts and the Worker entry. */
  logged_since: string;
}

/** The porch began counting surfaces on this day; anything without its own dated line is a floor at this date. */
export const PORCH_COUNTING_SINCE = "2026-08-21";
/** The interactive doors and free resources were given porch lines on this day. */
export const DOORS_LOGGED_SINCE = "2026-09-04";
/** The verifier door at /mcp/verifier, open since 2026-09-03, was given porch lines on this day. */
export const VERIFIER_LOGGED_SINCE = "2026-09-05";
/** The documentation door at /mcp.md and /mcp/docs, counted from the day it opened. */
export const DOCS_LOGGED_SINCE = "2026-09-05";

export const FREE_INSTRUMENTS: readonly InstrumentEntry[] = [
  { prefix: "preflight", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "look", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "before-you-pay", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "conformance", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "verify-receipt", kind: "argument", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "artifact:read", kind: "read", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "bot-auth", kind: "read", logged_since: DOORS_LOGGED_SINCE },
  { prefix: "corpus", kind: "read", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:preflight_endpoint", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:check_before_you_pay", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:look_at_door", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:check_conformance", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:verify_artifact", kind: "argument", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp:tool:read_store_guide", kind: "read", logged_since: PORCH_COUNTING_SINCE },
  { prefix: "mcp-verifier:tool:", kind: "argument", logged_since: VERIFIER_LOGGED_SINCE },
  /* The documentation door's one tool hands back reference material by name: a read, like the store guide. */
  { prefix: "mcp-docs:tool:", kind: "read", logged_since: DOCS_LOGGED_SINCE },
];

/**
 * Sub-surfaces whose kind or date differs from their prefix. The
 * conformance desk's HUMAN page is a read even though the API takes a
 * body; the preflight's check list is a GET; the bot-auth CHECK takes
 * a signed request where the bot-auth page is prose; the MCP variants
 * of the HTTP doors were logged with the MCP handler, not the doors.
 */
const SURFACE_OVERRIDES: Readonly<Record<string, Partial<InstrumentEntry>>> = {
  "conformance:desk": { kind: "read", logged_since: DOORS_LOGGED_SINCE },
  "conformance-watch:history": { kind: "read" },
  "conformance:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "preflight:checks": { kind: "read" },
  "preflight:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "look:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "before-you-pay:mcp": { logged_since: PORCH_COUNTING_SINCE },
  "bot-auth:check": { kind: "argument" },
  /* The defect vocabulary is a read with or without an id; every other verifier tool needs a URL, a receipt or a host. */
  "mcp-verifier:tool:get_defect_definition": { kind: "read" },
};

export const FREE_INSTRUMENT_PREFIXES: readonly string[] = FREE_INSTRUMENTS.map((entry) => entry.prefix);

export const PAID_TOOL_PREFIXES: readonly string[] = ["mcp:tool:buy_"];

/** The roster entry a surface falls under, overrides applied. */
export function instrumentEntry(surface: string): InstrumentEntry | undefined {
  const base = FREE_INSTRUMENTS.find((p) => surface === p.prefix || surface.startsWith(`${p.prefix}:`) || surface.startsWith(p.prefix));
  if (!base) return undefined;
  const override = SURFACE_OVERRIDES[surface];
  return override ? { ...base, ...override, prefix: base.prefix } : base;
}

export function isFreeInstrument(surface: string): boolean {
  return instrumentEntry(surface) !== undefined;
}
export function isPaidTool(surface: string): boolean {
  return PAID_TOOL_PREFIXES.some((p) => surface.startsWith(p));
}

/** The kind of a surface on the roster; used by the unknown split to weight what it found. */
export function instrumentKind(surface: string): InstrumentKind | undefined {
  return instrumentEntry(surface)?.kind;
}


/**
 * The surfaces the client census counts callers on: every free
 * instrument and every paid tool. Handshakes and catalogue reads are
 * neither and stay out — they are the hot keys, and "who opened a
 * session" is the MCP client census's question already.
 */
export function isCensusedInstrument(surface: string): boolean {
  return isFreeInstrument(surface) || isPaidTool(surface);
}
