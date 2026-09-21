import { describe, expect, it } from "vitest";
import { SHELF_CLUSTERS, mcpToolCatalog } from "@/lib/mcp-tools";
import { getMenuItem } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE MANDATE, REACHABLE BY THE WORDS SOMEBODY WOULD LOOK FOR IT WITH
 * (2026-09-21).
 *
 * the_mandate — the store's record-what-you-are-authorized-to-do door,
 * and the product most shaped like the need the keeper thinks is
 * inevitable — sat seventeenth of twenty-one inside buy_observation.
 * The ranking was the least of three compounding problems.
 *
 * ROUTING was the expensive one. An MCP client picks a TOOL from its
 * purpose text, and only then an item from that tool's list. This
 * shelf's purpose named settlement attestations, conformance audits,
 * endpoint monitoring, payment client tests, launch checks and Bitcoin
 * timestamps — and named neither authorization, nor mandates, nor
 * delegation. bitcoin_anchor, the other item here that observes
 * nothing, IS named. So an agent looking to record what it was
 * authorized to spend had no reason to open this tool at all, and
 * never reached position seventeen to be disappointed by it. Order was
 * downstream of a routing failure, which is why the purpose text is
 * what this file guards hardest.
 *
 * TAXONOMY is the half still outstanding, deliberately and on the
 * record. Grouped by `reads`, this shelf is seventeen items that go
 * and look at something external and four that do not; the_mandate is
 * `made_here`. Its own tool is the right answer and was costed:
 * +11,005 bytes against 418 of headroom, refused by two independent
 * budget guards, because a cluster's bytes are mostly per-tool
 * furniture rather than its items. The follow-up is trimming that
 * furniture, not adding an eighth tool on top of it.
 */

const OBSERVATION = "buy_observation";

function shelf(name: string) {
  const found = SHELF_CLUSTERS.find((entry) => entry.name === name);
  expect(found, `${name} is gone`).toBeTruthy();
  return found!;
}

describe("an agent can find the mandate", () => {
  it("names authorization in the text a client routes on", () => {
    /*
     * The fix itself. If these words leave the purpose, the door goes
     * back to being unreachable no matter where it sits in the list —
     * so this is the assertion that matters most in this file.
     */
    const purpose = shelf(OBSERVATION).purpose.toLowerCase();
    for (const word of ["authorization", "ceiling", "expiry", "before it spends"]) {
      expect(purpose, `buy_observation's purpose never says "${word}"`).toContain(word);
    }
  });

  it("puts it near the front of the shelf rather than last", () => {
    const ids = shelf(OBSERVATION).itemIds ?? [];
    const position = ids.indexOf("the_mandate");
    expect(position, "the_mandate left the shelf entirely").toBeGreaterThanOrEqual(0);
    expect(
      position,
      `the_mandate is back down at ${position + 1} of ${ids.length}`,
    ).toBeLessThan(3);
  });

  it("still says what a mandate does not prove", () => {
    /*
     * Findability must not cost honesty. This record may be read in a
     * dispute, and the listing is careful that it proves a claim was
     * MADE on a date — never that anyone said it, honoured the cap, or
     * respected the expiry.
     */
    const item = getMenuItem("the_mandate");
    expect(item).toBeTruthy();
    expect(item!.description).toMatch(/never that the human actually said it/i);
    expect(item!.description).toMatch(/never that the cap or expiry were honored/i);
  });

  it("keeps the shelf inside the budget that refused it a tool of its own", () => {
    /*
     * The routing fix was chosen over the taxonomy fix precisely
     * because it is nearly free. If this edit ever stops being nearly
     * free, the trade that justified it is gone.
     */
    const bytes = JSON.stringify(mcpToolCatalog(BASE)).length;
    expect(bytes, `tools/list is ${bytes} bytes`).toBeLessThan(152_000);
  });

  it("records that the taxonomy half is still owed", () => {
    /*
     * The outstanding work, asserted so it cannot be quietly forgotten
     * by a reader who sees the routing fix and assumes it was the
     * whole job: the one item on this observation shelf that observes
     * nothing is still on it, and so is bitcoin_anchor.
     */
    const madeHere = (shelf(OBSERVATION).itemIds ?? []).filter(
      (id) => getMenuItem(id)?.reads === "made_here",
    );
    expect(madeHere.sort()).toEqual(["bitcoin_anchor", "the_mandate"]);
  });
});
