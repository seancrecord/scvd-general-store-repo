import { describe, expect, it } from "vitest";
import {
  frontCounterItems,
  frontCounterVerdict,
  isFrontCounter,
  FRONT_COUNTER_PROMISE,
} from "@/lib/front-counter";
import { MENU_ITEMS } from "@/store";
/**
 * STATIC, NOT `await import()` INSIDE THE TEST BODY (2026-08-20). The
 * dynamic form made the FIRST test in this file pay for loading the
 * whole mcp-tools module graph against a 5-second timeout, and it
 * began timing out as that graph grew — the same fragility this suite
 * has hit before. The later tests always passed because the module
 * was cached by then, which is exactly what a load-cost flake looks
 * like from the outside.
 */
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { buyInputSchema } from "@/lib/bazaar-discovery";

/**
 * THE SHELF CLASSIFIES ITSELF, and the reason it must is evidence
 * rather than principle.
 *
 * A hand-picked list of "simple items" was drafted on 2026-08-03 by
 * somebody who had spent hours in this catalog, and it was wrong in
 * BOTH directions on its first outing: it named the_drawer, which is
 * human_queue and fails outright, and omitted recurring_patronage,
 * which passes every stated rule. Nothing would have caught either.
 *
 * That is the fourth instance of one shape in two days — two things
 * that must agree with nothing checking that they do. The schema
 * against its own example (three items unlistable in Bazaar), the
 * naming law against its surfaces, the id-keyed lists against the
 * shelf. A curated tier would have been the next one.
 */
describe("the front counter is derived, not remembered", () => {
  it("admits exactly the items that pass every rule", () => {
    const eligible = frontCounterItems().map((item) => item.id);
    // Named here so a change to the shelf shows up as a diff on this
    // line rather than silently moving the door. If an item is added
    // or repriced into eligibility that is FINE — this test tells you
    // it happened, it does not forbid it.
    // Cheapest first: $0.005, $0.01, $0.50, $2.
    expect(eligible).toEqual(["small_blessing", "daily_fortune", "hello", "dibs"]);
  });

  it("keeps recurring_patronage out for the reason that actually applies", () => {
    // Fixed price, instant, zero required fields — it passes the three
    // obvious rules and is still wrong for the counter, because its
    // optional pass_id means the artifact carries state a buyer has to
    // remember and reason about on every later purchase.
    const item = MENU_ITEMS.find((entry) => entry.id === "recurring_patronage")!;
    const verdict = frontCounterVerdict(item);
    expect(verdict.eligible).toBe(false);
    expect(verdict.fails.join(" ")).toContain("pass_id (optional)");
    expect(verdict.fails.join(" ")).toContain("carries state");
  });

  it("keeps the_drawer out for the reason that actually applies", () => {
    // The item the hand-drafted list wrongly admitted. It is $2 fixed
    // with no inputs, which is what made it look eligible.
    const item = MENU_ITEMS.find((entry) => entry.id === "the_drawer")!;
    const verdict = frontCounterVerdict(item);
    expect(verdict.eligible).toBe(false);
    expect(verdict.fails.join(" ")).toContain("human-fulfilled");
  });

  it("names every rule an item breaks, not just the first", () => {
    // A verdict that stopped at the first failure would make a
    // two-reason item look like a one-reason fix.
    const failing = MENU_ITEMS.map(frontCounterVerdict).filter(
      (verdict) => !verdict.eligible,
    );
    expect(failing.length).toBeGreaterThan(0);
    for (const verdict of failing) {
      expect(verdict.fails.every((reason) => reason.length > 20)).toBe(true);
    }
  });
});

describe("the four rules hold on every admitted item", () => {
  it.each(frontCounterItems().map((item) => [item.id, item] as const))(
    "%s takes one price, no inputs, arrives instantly, cannot sell out",
    (_id, item) => {
      expect(item.pricing).toBe("fixed");
      expect(item.fulfillment).toBe("instant");
      expect(item.weekly_inventory).toBeUndefined();
      const schema = buyInputSchema(item);
      const inputs = Object.keys(schema.properties ?? {}).filter(
        (name) => name !== "agent_name" && name !== "callback_url",
      );
      expect(inputs).toEqual([]);
      expect(schema.required ?? []).toEqual([]);
    },
  );

  it("reclassifies automatically when an item changes", () => {
    // The whole argument for deriving it. Prove the predicate reads the
    // item rather than a memorised answer.
    const hello = MENU_ITEMS.find((entry) => entry.id === "hello")!;
    expect(isFrontCounter(hello)).toBe(true);
    expect(isFrontCounter({ ...hello, fulfillment: "human_queue" })).toBe(false);
    expect(isFrontCounter({ ...hello, pricing: "pay_what_it_deserves" })).toBe(
      false,
    );
    expect(isFrontCounter({ ...hello, weekly_inventory: 1 })).toBe(false);
  });
});

describe("it keeps one trust line rather than none", () => {
  /**
   * If the simple tier strips every credibility signal to stay simple,
   * it optimises away the differentiator for the segment most likely to
   * show up. One compressed, non-negotiable line; everything deeper
   * one hop away rather than zero mentions.
   */
  it("promises free permanent verification without requiring it", () => {
    expect(FRONT_COUNTER_PROMISE).toContain("/api/verify/");
    expect(FRONT_COUNTER_PROMISE).toContain("free and forever");
    expect(FRONT_COUNTER_PROMISE).toContain("without asking us");
  });

  it("says what the caller does NOT have to do", () => {
    // The load-bearing half for a weak reader: not a feature list, an
    // absence list. Nothing to poll, nothing to remember, no second call.
    expect(FRONT_COUNTER_PROMISE).toContain("nothing to poll");
    expect(FRONT_COUNTER_PROMISE).toContain("nothing to remember");
    expect(FRONT_COUNTER_PROMISE).toContain("never required to buy");
  });
});

/**
 * THE SIXTH MCP TOOL, and the reason it is not a regression on the
 * 27-to-5 consolidation.
 *
 * That call was driven by Glama's rubric putting 25+ tools in its
 * lowest band, but the count was never the real argument — the
 * argument was that a tool must be a different JOB rather than a
 * subset of another shelf. The five shelves all ask the caller to pick
 * from an enum and then resolve an if/then branch to learn whether the
 * choice needs a field. This one asks for nothing, because its whole
 * job is not having to read the others.
 */
describe("the front counter has a door a weak model can find", () => {
  it("is the first paid tool in the catalog", async () => {
    const tools = mcpToolCatalog("https://scvd.store");
    const paid = tools.filter((tool) => tool.name.startsWith("buy_"));
    expect(
      paid[0]?.name,
      "a weak model scanning tools/list reaches for something early; the first paid tool should be the one that cannot go wrong",
    ).toBe("buy_simple");
  });

  it("asks for item_id and nothing else", async () => {
    const tool = mcpToolCatalog("https://scvd.store").find(
      (entry) => entry.name === "buy_simple",
    )!;
    const schema = tool.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
      allOf?: unknown[];
    };
    expect(schema.required).toEqual(["item_id"]);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "agent_name",
      "item_id",
    ]);
    // The whole point: no conditional branch to resolve. This is the
    // capability cliff the cold-agent pass identified, removed rather
    // than documented.
    expect(schema.allOf, "the simple tool grew a conditional branch").toBeUndefined();
  });

  it("offers exactly the derived shelf, never a second list", async () => {
    const tool = mcpToolCatalog("https://scvd.store").find(
      (entry) => entry.name === "buy_simple",
    )!;
    const schema = tool.inputSchema as {
      properties: { item_id: { enum: string[] } };
    };
    expect(schema.properties.item_id.enum).toEqual(
      frontCounterItems().map((item) => item.id),
    );
  });

  it("says the overlap with the theme shelves is a second door, in both directions", async () => {
    /**
     * An outside audit (Glama, 2026-08-11) read the deliberate overlay
     * as ambiguity: "buy_simple, buy_small_pleasure, and
     * buy_signed_record all offer the same items like hello and dibs,
     * making it unclear which tool to choose." The overlap IS the
     * design — a weak model finds the counter, a capable one finds the
     * shelf — but a reader who cannot see the design comment can only
     * see the redundancy. So both doors now carry the sentence, and
     * the shelf side is derived from the same eligibility predicate
     * the counter is built on.
     */
    const tools = mcpToolCatalog("https://scvd.store");
    const simple = tools.find((entry) => entry.name === "buy_simple")!;
    expect(simple.description).toContain("a second door to the same goods");
    expect(simple.description).toContain("If unsure which tool to use, use this one");
    for (const item of frontCounterItems()) {
      const shelf = tools.find(
        (entry) => entry.name !== "buy_simple" && entry.itemIds?.includes(item.id),
      )!;
      expect(
        shelf.description,
        `${shelf.name} sells ${item.id}, which also sits at the counter, and must say the choice is harmless`,
      ).toContain("also sell");
      expect(shelf.description).toContain("buy_simple");
      expect(shelf.description).toContain("either tool is correct");
    }
    // And a shelf with no counter items stays quiet about a door that
    // holds none of its goods.
    const humanShelf = tools.find((entry) => entry.name === "buy_human_task")!;
    expect(humanShelf.description).not.toContain("buy_simple");
  });

  it("carries the price in the description, like every other buy tool", async () => {
    const tool = mcpToolCatalog("https://scvd.store").find(
      (entry) => entry.name === "buy_simple",
    )!;
    expect(/\$\d/.test(tool.description)).toBe(true);
    // Opens with "Purpose:" like every other shelf — the convention
    // mcp-tool-hardening enforces — and then says the thing that makes
    // this door different.
    expect(tool.description.startsWith("Purpose:")).toBe(true);
    expect(tool.description).toContain("need no reading at all");
  });
});
