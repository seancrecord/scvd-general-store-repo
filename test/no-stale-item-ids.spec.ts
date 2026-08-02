import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { CAPABILITY_QUERY, SPEC_RETURNS } from "@/store/spec";
import { CHEAP_DOOR_ITEM_IDS } from "@/store/copy/practice-counter";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";

/**
 * NOTHING MAY POINT AT AN ITEM THAT IS NOT ON THE SHELF.
 *
 * WHY THIS EXISTS, and it is the third variation on one day's theme.
 *
 * Several lists in this codebase are keyed by menu item id, and every
 * one of them is already guarded — in ONE DIRECTION. capability-query
 * walks MENU_ITEMS and fails if an item lacks a query.
 * unshelvedItemIds() fails if an item belongs to no MCP shelf.
 * cheap-door-first checks the practice counter's ordering. All of them
 * ask "is anything MISSING."
 *
 * None of them asks the opposite question, and the opposite question
 * is the one with a silent failure behind it:
 *
 *   clusterTool():  .filter((item) => item !== undefined)
 *   cheapDoor():    .filter((item) => item !== undefined)
 *
 * Both resolve ids to items and DROP whatever does not resolve. So a
 * renamed item, a deleted one, or a plain typo does not fail — the MCP
 * shelf silently sells one fewer thing, the practice counter's cheap
 * door silently shows one fewer door, and every existing test still
 * passes because every remaining item is present and correct.
 *
 * That asymmetry is the identity.ts lesson wearing different clothes:
 * a guard that covers one direction READS as covering both, and the
 * uncovered direction is where the quiet failure lives. Three
 * instances turned up on 2026-08-02 — the naming law enumerating half
 * its surfaces, the MCP rationale sitting one file from where anybody
 * looked, and this.
 *
 * DERIVED, not enumerated (rule 1). The shelf is the source; every
 * list below is checked against it rather than against a copy of it.
 */
const SHELF = new Set(MENU_ITEMS.map((item) => item.id));

/**
 * Every list in the codebase that names item ids, with where a stale
 * entry would actually hurt. Adding a new id-keyed list here is the
 * one manual step, and it is named in AGENT_UX.md's method so the next
 * person adding one knows to.
 */
const ID_LISTS: { where: string; ids: string[]; harm: string }[] = [
  {
    where: "SHELF_CLUSTERS (src/lib/mcp-tools.ts)",
    ids: SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]),
    harm: "clusterTool() filters unresolved ids away, so the MCP shelf silently sells one fewer item and tools/list looks correct",
  },
  {
    where: "CHEAP_DOOR_ITEM_IDS (src/store/copy/practice-counter.ts)",
    ids: [...CHEAP_DOOR_ITEM_IDS],
    harm: "cheapDoor() filters unresolved ids away, so /try silently offers one fewer door to somebody testing a client",
  },
  {
    where: "CAPABILITY_QUERY (src/store/spec.ts)",
    ids: Object.keys(CAPABILITY_QUERY),
    harm: "a dead key is dead weight rather than a live defect, but it is the trace a rename leaves and the next reader cannot tell it from a live one",
  },
  {
    where: "SPEC_RETURNS (src/store/spec.ts)",
    ids: Object.keys(SPEC_RETURNS),
    harm: "same shape: a returns line describing an item nobody can buy",
  },
];

describe("no list points at an item that is not on the shelf", () => {
  it.each(ID_LISTS.map((entry) => [entry.where, entry] as const))(
    "%s names only real items",
    (_where, entry) => {
      const stale = [...new Set(entry.ids)].filter((id) => !SHELF.has(id));
      expect(
        stale,
        `${entry.where} references ${stale.join(", ")}, which is not on the menu. ${entry.harm}.`,
      ).toEqual([]);
    },
  );

  /**
   * THE PROOF THAT THE FILTERS ARE SILENT, rather than an assertion
   * that they are. If a bad id ever DID throw, this test would be
   * unnecessary — so the test that justifies it demonstrates the drop.
   */
  it("shows that an unresolvable id vanishes instead of failing", () => {
    const pretendCluster = ["hello", "an_item_that_does_not_exist"];
    const resolved = pretendCluster
      .map((id) => MENU_ITEMS.find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    expect(
      resolved.length,
      "a nonexistent id no longer disappears silently — if resolution now throws or reports, this guard can be simplified",
    ).toBe(1);
  });
});

describe("every item is reachable from the surfaces that should carry it", () => {
  /**
   * The other direction, already covered elsewhere but asserted here
   * too so both live in one place. A reader of this file should not
   * have to go find out whether the opposite question is asked
   * anywhere — that was the exact failure mode this file is named for.
   */
  it("sells every menu item on some MCP shelf", () => {
    const shelved = new Set(
      SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]),
    );
    const unreachable = MENU_ITEMS.filter(
      (item) => !shelved.has(item.id),
    ).map((item) => item.id);
    expect(
      unreachable,
      "an item exists on the menu and cannot be bought over MCP at all",
    ).toEqual([]);
  });

  it("gives every menu item a capability query", () => {
    const missing = MENU_ITEMS.filter(
      (item) => !CAPABILITY_QUERY[item.id],
    ).map((item) => item.id);
    expect(missing).toEqual([]);
  });
});
