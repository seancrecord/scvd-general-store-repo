import { describe, expect, it } from "vitest";

/**
 * RULE 50 AT THE DOOR AN AGENT PAYS AT.
 *
 * "No bookkeeping between the request and the answer that could have
 * happened beside it." The keeper made that a rule on 2026-08-25
 * after two outside monitors clocked the paid doors at 977ms and
 * 1424ms, with /api/buy/hello answering in 1.14s while
 * /openapi.json — eighty times the payload — answered in 0.19s. The
 * slowest thing the store served was the only thing anybody pays for.
 *
 * WHY THIS GUARD EXISTS. On 2026-08-29 the MCP door started counting
 * every tools/call, and it shipped AWAITED: one KV write sitting in
 * front of the answer on every call, the whole paid buy_* shelf
 * included. Nothing failed. Nothing could have — the census is
 * correct either way, it is only slow, and slowness has no assertion
 * unless somebody writes one. So a rule the house had already paid to
 * learn got broken by the next feature that needed a counter, and the
 * suite had no opinion.
 *
 * It reads SOURCE rather than timing a request, deliberately: a
 * latency threshold in a test suite is a flake generator, and the
 * defect here is structural — an await in front of the answer — so
 * the structure is what gets asserted.
 */
const SOURCES = import.meta.glob("/src/routes/mcp.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Comments describe the practice; only code can break it. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the MCP door keeps its counters beside the answer", () => {
  it("never awaits the per-tool count on the way to a reply", () => {
    const source = code(Object.values(SOURCES)[0]!);
    expect(
      source,
      "src/routes/mcp.ts was not read; the glob has gone stale",
    ).toContain("mcp:tool:");
    /*
     * Derived from the recording line itself rather than from a line
     * number: find every place the per-tool surface is written, and
     * insist none of them is preceded by an await. A future counter
     * on a different surface is caught by the same rule the day it is
     * written the wrong way.
     */
    const offenders = source
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(
        ({ line }) =>
          line.includes("mcp:tool:") ||
          (line.includes("recordPorchVisit") && line.startsWith("await")),
      )
      .filter(({ line }) => line.startsWith("await"));
    expect(
      offenders.map((entry) => `line ${entry.number}: ${entry.line}`),
      "bookkeeping is awaited in front of the answer on a paid door",
    ).toEqual([]);
  });

  it("hands every counter to the deferral, not just the newest one", () => {
    /*
     * The guard above found SIX awaited writes already at this door
     * when it was first run — five inside the free tools and one on
     * every single JSON-RPC method, the paid shelf included. They
     * predate the 08-29 census; the census is just what made somebody
     * look. All of them go out the same way now, because one
     * deferring and one not is exactly how the next one gets written
     * awaited.
     */
    const source = code(Object.values(SOURCES)[0]!);
    const deferred = source.match(/deferBookkeeping\(/g) ?? [];
    expect(
      deferred.length,
      "the door has fewer deferred counters than the two it was given",
    ).toBeGreaterThanOrEqual(8); // the definition, plus every call site
  });
});
