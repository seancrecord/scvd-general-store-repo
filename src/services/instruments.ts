import type { Observatory, SurfaceCount } from "@/services/observatory";

/**
 * THE FREE INSTRUMENTS, USED (2026-09-04). The one real signal in the
 * September porch was not on any paid door: preflight_endpoint called
 * 45 times, check_before_you_pay 24, look_at_door 22 — tools called
 * with arguments, which crawlers do not do — against 22 paid attempts.
 * Agents use this store to check a door before paying it. That is the
 * demand, and the observatory already counts it; it just counts it in
 * a list of 130 surfaces. This is the same numbers, sorted into free
 * and paid, so the ratio is a line and not a search.
 *
 * Pure: it reads the observatory the route already computed. Counts
 * are the porch's floors, with the porch's caveats.
 */
export const FREE_INSTRUMENT_PREFIXES: readonly string[] = [
  "preflight",
  "look",
  "before-you-pay",
  "conformance",
  "verify-receipt",
  "artifact:read",
  "bot-auth",
  "corpus",
  "mcp:tool:preflight_endpoint",
  "mcp:tool:check_before_you_pay",
  "mcp:tool:look_at_door",
  "mcp:tool:check_conformance",
  "mcp:tool:verify_artifact",
  "mcp:tool:read_store_guide",
];

export const PAID_TOOL_PREFIXES: readonly string[] = ["mcp:tool:buy_"];

export interface InstrumentMonth {
  month: string;
  free: SurfaceCount[];
  free_total: number;
  free_by_channel: Record<string, number>;
  paid_tools: SurfaceCount[];
  paid_tool_calls: number;
  truncated: boolean;
}

export interface InstrumentUsage {
  computed_at: string;
  months: InstrumentMonth[];
  roster: readonly string[];
}

function isFree(surface: string): boolean {
  return FREE_INSTRUMENT_PREFIXES.some((p) => surface === p || surface.startsWith(`${p}:`) || surface.startsWith(p));
}
function isPaidTool(surface: string): boolean {
  return PAID_TOOL_PREFIXES.some((p) => surface.startsWith(p));
}

export function freeInstrumentUsage(observatory: Observatory): InstrumentUsage {
  const months: InstrumentMonth[] = observatory.months.map((m) => {
    const free = m.surfaces.filter((s) => isFree(s.surface)).sort((a, b) => b.organic - a.organic);
    const paid = m.surfaces.filter((s) => isPaidTool(s.surface)).sort((a, b) => b.organic - a.organic);
    const byChannel: Record<string, number> = {};
    for (const s of free) {
      for (const [k, v] of Object.entries(s.by_channel)) byChannel[k] = (byChannel[k] ?? 0) + v;
    }
    return {
      month: m.month,
      free,
      free_total: free.reduce((sum, s) => sum + s.organic, 0),
      free_by_channel: byChannel,
      paid_tools: paid,
      paid_tool_calls: paid.reduce((sum, s) => sum + s.organic, 0),
      truncated: m.truncated,
    };
  });
  return { computed_at: observatory.computed_at, months, roster: FREE_INSTRUMENT_PREFIXES };
}
