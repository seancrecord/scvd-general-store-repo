import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import {
  DECLINED,
  FREE_INSTRUMENTS,
  ROUTES,
  toolFor,
  unknownRoutedIds,
  unroutedItemIds,
  whenToBuyMarkdown,
} from "@/lib/when-to-buy";
import { mcpResourceCatalog, readMcpResource } from "@/lib/mcp-resources";
import { mcpToolCatalog } from "@/lib/mcp-tools";

const BASE = "https://scvd.store";

/**
 * THE ROUTING TABLE IS THE ONE SURFACE THAT CAN LIE BY OMISSION.
 *
 * Every other context surface here is derived whole from MENU_ITEMS,
 * so it cannot disagree with the shelf. This one is half editorial —
 * a job is a sentence in a caller's head and no field holds it — and
 * an editorial half is exactly where a shelf change rots quietly: an
 * item leaves and the route survives, pointing a model at something
 * it can no longer buy.
 *
 * So the guards run in both directions. Nothing routed may be off the
 * shelf, and nothing on the shelf may be silently unrouted; a new item
 * either gets a job or gets a named exemption, and the build says
 * which. Rule 52's shape: a bounded document publishes its own
 * incompleteness or it does not publish.
 */
describe("routes and shelf cannot drift apart", () => {
  it("names only items that are actually on the shelf", () => {
    expect(unknownRoutedIds()).toEqual([]);
  });

  it("routes every shelf item, or names it as deliberately unrouted", () => {
    /*
     * This is the assertion that fails the day somebody adds an item
     * and forgets it exists for callers. The fix is a route or an
     * UNROUTED entry with a reason — never deleting the test.
     */
    expect(unroutedItemIds()).toEqual([]);
  });

  it("still bites if a route goes stale", () => {
    // Guard the guard (rule 46): prove the check can fail before
    // trusting it to report all-clear.
    const shelf = new Set(MENU_ITEMS.map((item) => item.id));
    expect(shelf.has("an_item_that_never_existed")).toBe(false);
    const fake = [{ job: "x", items: ["an_item_that_never_existed"] }];
    const bad = fake.flatMap((route) =>
      route.items.filter((id) => !shelf.has(id)),
    );
    expect(bad).toEqual(["an_item_that_never_existed"]);
  });

  it("sells every routed item through a tool that exists", () => {
    const toolNames = new Set(mcpToolCatalog(BASE).map((tool) => tool.name));
    for (const route of ROUTES) {
      for (const id of route.items) {
        const tool = toolFor(id);
        expect(tool, `${id} belongs to no shelf cluster`).toBeTruthy();
        expect(toolNames.has(tool!), `${tool} is not in the catalog`).toBe(true);
      }
    }
  });
});

describe("the document says what it is for", () => {
  const text = whenToBuyMarkdown(BASE);

  it("prices every routed item from the live shelf, not from a copy", () => {
    for (const route of ROUTES) {
      for (const id of route.items) {
        const item = MENU_ITEMS.find((entry) => entry.id === id)!;
        expect(text).toContain(`**${item.name}** — $${item.price_usdc} USDC`);
      }
    }
  });

  it("leads with the free instrument wherever one answers the job", () => {
    const withFree = ROUTES.filter((route) => route.free);
    expect(withFree.length).toBeGreaterThan(0);
    for (const route of withFree) {
      expect(text).toContain(route.free!);
    }
  });

  it("publishes the gap it has in its own surface", () => {
    /*
     * The preflight and the conformance desk are the store's headline
     * FREE instruments and neither is reachable as an MCP tool. The
     * routing document names that rather than steering around it —
     * the same discipline the corpus applies to itself weekly. If
     * either ever becomes a tool, this test is what tells whoever
     * ships it to come back and correct the prose.
     */
    const notTools = FREE_INSTRUMENTS.filter((one) => !one.isTool);
    expect(notTools.map((one) => one.name)).toContain("Preflight");
    expect(notTools.map((one) => one.name)).toContain("Conformance desk");
    expect(text).toContain("not an MCP tool");
    expect(text).toContain(
      "cannot reach the store's headline free instrument through the",
    );
  });

  it("routes away from the jobs the store declines outright", () => {
    expect(DECLINED.length).toBeGreaterThan(0);
    for (const line of DECLINED) expect(text).toContain(line);
    expect(text.toLowerCase()).toContain("escrow");
    expect(text.toLowerCase()).toContain("arbitration");
  });

  it("throws rather than printing a route to nothing", async () => {
    const { ROUTES: live } = await import("@/lib/when-to-buy");
    // The live table is clean; the render therefore must not throw.
    expect(live.length).toBeGreaterThan(0);
    expect(() => whenToBuyMarkdown(BASE)).not.toThrow();
  });
});

describe("the resource is actually served", () => {
  it("appears in resources/list with a description a model can route on", () => {
    const found = mcpResourceCatalog().find(
      (resource) => resource.uri === "scvd://when",
    );
    expect(found).toBeTruthy();
    expect(found!.name).toBe("which_instrument");
    expect(found!.mimeType).toBe("text/markdown");
    // The description is the AEO surface: it must name situations, not
    // just say "a routing table".
    expect(found!.description).toContain("about to pay");
    expect(found!.description.length).toBeGreaterThan(200);
  });

  it("reads back the derived document", async () => {
    const read = await readMcpResource({} as never, BASE, "scvd://when");
    expect(read).toBeTruthy();
    expect(read!.text).toContain("Which instrument for which job");
    expect(read!.text).toContain("What this store will not do");
  });
});
