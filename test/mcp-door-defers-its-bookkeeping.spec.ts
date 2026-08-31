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
    ).toBeGreaterThanOrEqual(7); // every call site at this door
  });
});

/**
 * THE SAME RULE AT THE TILL AN AGENT ACTUALLY PAYS AT.
 *
 * The MCP door above was the loud case. The paid HTTP door is the one
 * rule 50 was MEASURED on — /api/buy/hello at 1.14s warm while
 * /openapi.json, eighty times the payload, answered in 0.19s.
 *
 * The referral tally is the clean test of the rule here because the
 * SAME function is called twice on the same door: once when a buyer
 * arrives at the 402, once when they settle. The arrival call already
 * rides a Promise.all wave beside the answer. The settle call was
 * awaited in front of it. One writer, one door, two treatments — and
 * the difference was nobody looking, not a decision.
 *
 * WHAT THIS GUARD DELIBERATELY DOES NOT ASSERT. Not every awaited
 * write here is a defect, and a guard that swept them all would be
 * arguing for a change this store has not agreed to make:
 *
 *   recordSpentNonce is the replay guard. Deferring it opens a window
 *   where the same authorization spends twice. Money fails closed.
 *
 *   recordSettlementUnknown records an ambiguous settle — the case
 *   where we cannot say whether money moved. Losing it loses the only
 *   note that the question was ever open.
 *
 *   recordSettlement is the money-in ledger, and lives on the
 *   keeper's side of this line rather than an agent's: dropping one
 *   undercounts real revenue, and lib/metrics.ts publishes a sentence
 *   about WHEN it runs relative to the artifact handler.
 *
 * So this pins the one write whose own sibling already proves the
 * safe treatment, and leaves the money records alone.
 */
const GATE = import.meta.glob("/src/lib/payment-gate.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("the paid HTTP till keeps its courtesies beside the answer", () => {
  it("treats the settle-side referral like the arrival-side one", () => {
    const source = code(Object.values(GATE)[0]!);
    expect(
      source,
      "src/lib/payment-gate.ts was not read; the glob has gone stale",
    ).toContain("recordReferralFor");
    const awaited = source
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(
        ({ line }) =>
          line.startsWith("await ") && line.includes("recordReferralFor("),
      );
    expect(
      awaited.map((entry) => `line ${entry.number}: ${entry.line}`),
      "a referral tally is awaited in front of a paying buyer's answer",
    ).toEqual([]);
  });
});

/**
 * THE LINE BETWEEN A COUNTER AND A MONEY RECORD, PINNED ON THE SIDE
 * THE HOUSE HAS ALREADY RULED.
 *
 * I proposed deferring the settle ledger, the rail meters and the
 * decline rows, and the keeper agreed on the condition that the risk
 * was low. It is not my call to make on that path and it turned out
 * not to be an open question: test/quote-before-tally.spec.ts carries
 * the keeper's ruling of 2026-08-27, which says the bare quote's
 * tally may ride waitUntil and that "a refused payment ATTEMPT keeps
 * its books (tally and decline row both) ahead of the response,
 * because those are money-adjacent" — and it names the exact failure
 * mode, "a refactor that quietly... defers the decline". It caught me
 * doing precisely that, which is what a guard is for.
 *
 * So this pins only what is settled: the writes that must not lose
 * their await. recordSpentNonce is the replay guard — defer it and
 * the same signed authorization can spend twice while the first is in
 * flight. recordSettlementUnknown is the only note that an ambiguous
 * settle was ever a question, so losing it loses the question rather
 * than an increment.
 */
describe("the money writes on the paid path keep their await", () => {
  it("never lets the replay guard or the ambiguous-settle note go async", () => {
    const source = code(Object.values(GATE)[0]!);
    for (const guard of ["recordSpentNonce", "recordSettlementUnknown"]) {
      const calls = source
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes(`${guard}(`));
      expect(
        calls.length,
        `${guard} is not called here any more; this guard has gone stale`,
      ).toBeGreaterThan(0);
      expect(
        calls.filter((line) => line.startsWith("await ")).length,
        `${guard} lost its await — money must fail closed, not fast`,
      ).toBe(calls.length);
    }
  });
});
