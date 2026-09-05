import { describe, expect, it } from "vitest";
import { isWalkedAsk, WALK_MIN_ITEMS, WALK_RULE, WALK_WINDOW_MS, walkersAmong, widestWalk } from "@/lib/walkers";
import { CENSUS_WALK_RULE } from "@/lib/census";
import type { MetricEvent } from "@/lib/metrics";

/**
 * ONE RULE, THREE SURFACES (2026-09-04). The census could name the
 * walkers since July and the books never used it. The rule now lives
 * in one module; these pin what it says and that the census still
 * says the same thing.
 */
const T0 = Date.parse("2026-09-04T12:00:00.000Z");
function ask(ua: string | undefined, item: string, offsetMs: number, house = false): MetricEvent {
  return {
    kind: "challenge", item, channel: "direct", house,
    at: new Date(T0 + offsetMs).toISOString(),
    ...(ua === undefined ? {} : { user_agent: ua }),
  };
}

describe("the walk rule", () => {
  it("is the census's rule, unchanged", () => {
    expect(CENSUS_WALK_RULE).toEqual({ window_ms: WALK_WINDOW_MS, min_items: WALK_MIN_ITEMS });
    expect(WALK_RULE.says).toContain(`${WALK_MIN_ITEMS} or more distinct`);
  });

  it("calls four doors inside a minute a walk, and three not", () => {
    const four = ["a", "b", "c", "d"].map((i, n) => ask("node", i, n * 10_000));
    const three = ["a", "b", "c"].map((i, n) => ask("node", i, n * 10_000));
    expect(walkersAmong(four).has("node")).toBe(true);
    expect(walkersAmong(three).has("node")).toBe(false);
  });

  it("does not stitch a walk across more than a minute", () => {
    const slow = ["a", "b", "c", "d"].map((i, n) => ask("node", i, n * 25_000)); // 75s span
    expect(widestWalk(slow.map((e) => ({ at: Date.parse(e.at), item: e.item })))).toBe(3);
    expect(walkersAmong(slow).has("node")).toBe(false);
  });

  it("counts distinct doors, not repeated knocks on one", () => {
    const same = [0, 1, 2, 3, 4].map((n) => ask("node", "hello", n * 5_000));
    expect(walkersAmong(same).size).toBe(0);
  });

  it("keys a missing user-agent as one client, and never counts house", () => {
    const blank = ["a", "b", "c", "d"].map((i, n) => ask(undefined, i, n * 1_000));
    expect(walkersAmong(blank).has("(no user-agent)")).toBe(true);
    const keeper = ["a", "b", "c", "d"].map((i, n) => ask("node", i, n * 1_000, true));
    expect(walkersAmong(keeper).size).toBe(0);
  });

  it("only ever marks a CHALLENGE row, never a payment", () => {
    const walkers = new Set(["node"]);
    expect(isWalkedAsk(ask("node", "hello", 0), walkers)).toBe(true);
    expect(isWalkedAsk({ ...ask("node", "hello", 0), kind: "settle" }, walkers)).toBe(false);
    expect(isWalkedAsk({ ...ask("node", "hello", 0), kind: "decline" }, walkers)).toBe(false);
  });
});
