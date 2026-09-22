import { describe, expect, it } from "vitest";
import { SHELF_CLUSTERS, mcpToolCatalog } from "@/lib/mcp-tools";
import { getMenuItem } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE MANDATE, REACHABLE BY THE WORDS SOMEBODY WOULD LOOK FOR IT WITH.
 *
 * the_mandate — the record-what-you-are-authorized-to-do door, and the
 * product most shaped like the need the keeper thinks is inevitable —
 * sat seventeenth of twenty-one inside buy_observation. The ranking was
 * the least of three compounding problems.
 *
 * ROUTING was the expensive one. An MCP client picks a TOOL from its
 * purpose text, and only then an item from that tool's list. That
 * shelf's purpose named settlement attestations, conformance audits,
 * endpoint monitoring, payment client tests, launch checks and Bitcoin
 * timestamps — and named neither authorization, nor mandates, nor
 * delegation. So an agent looking to record what it was authorized to
 * spend had no reason to open the tool at all, and never reached
 * position seventeen to be disappointed by it.
 *
 * TAXONOMY was the other. Grouped by `reads`, that shelf is items that
 * go and look at something external; the_mandate is `made_here` and
 * records what the BUYER supplies. A different verb, filed under the
 * wrong one.
 *
 * REWRITTEN 2026-09-22, ACROSS THE MERGE, and the history is the point.
 * On 2026-09-21 this file asserted the INTERIM fix: the item moved to
 * second on the observation shelf and that shelf's purpose learned the
 * word "authorization". Its own tool was costed at +11,005 bytes
 * against 418 of headroom and refused by two budget guards, so the
 * cheap half shipped and this file recorded the other half as still
 * owed — in as many words, "its own tool is the right answer".
 *
 * PR #883 made it affordable and built it: buy_mandate, with the
 * catalog ceiling raised to admit it and the per-tool furniture
 * measured as the real saving. Two sessions found the same defect
 * independently and the second one finished it. So the assertions
 * below move to the end state rather than the compromise — and the
 * compromise's own guards are inverted, because an observation shelf
 * that still advertised authorization would now be advertising a door
 * it does not sell.
 */

const OBSERVATION = "buy_observation";
const MANDATE = "buy_mandate";

function shelf(name: string) {
  const found = SHELF_CLUSTERS.find((entry) => entry.name === name);
  expect(found, `${name} is gone`).toBeTruthy();
  return found!;
}

describe("an agent can find the mandate", () => {
  it("sells it from a shelf named for what it is", () => {
    expect(shelf(MANDATE).itemIds).toEqual(["the_mandate"]);
  });

  it("routes on the words an agent would search with", () => {
    /*
     * The fix, asserted where it now lives. If these words leave this
     * purpose the door goes back to being unreachable, whatever its
     * position in any list.
     */
    const purpose = shelf(MANDATE).purpose.toLowerCase();
    for (const word of ["authoriz", "before"]) {
      expect(purpose, `buy_mandate's purpose never says "${word}"`).toContain(word);
    }
  });

  it("no longer advertises authorization from the observation shelf", () => {
    /*
     * The inverted guard. While the item lived there, that purpose
     * naming "authorization" was the whole fix; now that it has its own
     * tool, the same sentence would route an agent to a shelf that
     * cannot sell it.
     */
    const observation = shelf(OBSERVATION);
    expect(observation.itemIds).not.toContain("the_mandate");
    expect(observation.purpose.toLowerCase()).not.toContain("authorization");
  });

  it("leaves nothing on the observation shelf that observes nothing", () => {
    /*
     * The taxonomy assertion, derived rather than listed, and the half
     * this file used to record as outstanding. bitcoin_anchor is the
     * one deliberate `made_here` exception and says so: the shelf's
     * purpose names a Bitcoin timestamp explicitly, so a planner can
     * still find it.
     */
    const madeHere = (shelf(OBSERVATION).itemIds ?? []).filter(
      (id) => getMenuItem(id)?.reads === "made_here",
    );
    expect(madeHere).toEqual(["bitcoin_anchor"]);
    expect(shelf(OBSERVATION).purpose.toLowerCase()).toContain("bitcoin timestamp");
  });

  it("still says what a mandate does not prove", () => {
    /*
     * Findability must not cost honesty. This record may be read in a
     * dispute, and it proves a claim was MADE on a date — never that
     * anyone said it, honoured the cap, or respected the expiry.
     */
    const item = getMenuItem("the_mandate");
    expect(item).toBeTruthy();
    expect(item!.description).toMatch(/never that the human actually said it/i);
    expect(item!.description).toMatch(/never that the cap or expiry were honored/i);
  });

  it("sells every item exactly once across the shelves", () => {
    /*
     * The failure a shelf split invites, and the one a naive merge of
     * this branch actually produced: the item on its new tool AND still
     * on the old one, from two sides that each looked correct alone.
     */
    const counts = new Map<string, number>();
    for (const entry of SHELF_CLUSTERS) {
      for (const id of entry.itemIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get("the_mandate"), "the_mandate is on two shelves").toBe(1);
  });

  it("is a tool a client can actually call", () => {
    const tool = mcpToolCatalog(BASE).find((entry) => entry.name === MANDATE);
    expect(tool, "buy_mandate is not in the tool catalog").toBeTruthy();
    expect(JSON.stringify(tool)).toContain("mandate");
  });
});
