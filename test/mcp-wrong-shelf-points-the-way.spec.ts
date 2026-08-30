import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { mcpToolCatalog } from "@/lib/mcp-tools";

const BASE = "https://scvd.store";

/**
 * A BUYER WHO GUESSED THE WRONG SHELF IS STILL A BUYER.
 *
 * The keeper, 2026-08-29: we break the house rules by asking agents
 * to learn instead of making it as easy as possible for them to pay.
 * Here is that, exactly, in one refusal.
 *
 * spot_check is the floor of this menu — a tenth of a cent, the
 * number every surface in the store advertises as the cheapest thing
 * on the shelf. An agent that arrives wanting to spend the smallest
 * amount it can, sees a tool called buy_simple, and asks it for
 * spot_check was told:
 *
 *   "spot_check" is not on this shelf. It sells: small_blessing,
 *   hello. Nothing was charged.
 *
 * True, complete, and it leaves the buyer to go and read six tools'
 * enums to discover the cheapest item is filed under "observation",
 * sixteenth in a list next to a $25 audit. The store knows the answer
 * — the catalog is right there — and made the agent derive it. Rule
 * 53's shape: an architectural preference is a reason to build one
 * door first, never a reason a funded buyer cannot spend $0.001.
 *
 * The shelf LAYOUT is not the defect and this does not touch it —
 * SHELF_CLUSTERS groups by what an agent is trying to accomplish, for
 * reasons written down at length. Only the silence is the defect.
 */
describe("asking the wrong shelf for a real item", () => {
  /** Derived: whatever the menu's floor is this week, wherever it lives. */
  function floorItemOnAnotherShelf(): { itemId: string; wrongTool: string } {
    const shelves = mcpToolCatalog(BASE).filter((tool) => tool.itemIds);
    const floor = [...MENU_ITEMS].sort(
      (a, b) => a.price_usdc - b.price_usdc,
    )[0]!;
    const wrong = shelves.find((tool) => !tool.itemIds!.includes(floor.id));
    expect(
      wrong,
      `every shelf sells ${floor.id}; there is no wrong shelf to ask`,
    ).toBeTruthy();
    return { itemId: floor.id, wrongTool: wrong!.name };
  }

  async function refusal(tool: string, itemId: string): Promise<string> {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: { item_id: itemId } },
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    const error = payload["error"] as Record<string, unknown> | undefined;
    return typeof error?.["message"] === "string" ? error["message"] : "";
  }

  it("names the shelf that does sell it", async () => {
    const { itemId, wrongTool } = floorItemOnAnotherShelf();
    const right = mcpToolCatalog(BASE).find((tool) =>
      tool.itemIds?.includes(itemId),
    );
    expect(right, `nothing sells ${itemId}`).toBeTruthy();
    const message = await refusal(wrongTool, itemId);
    expect(
      message,
      `the refusal leaves the buyer to go and find ${itemId} itself: "${message}"`,
    ).toContain(right!.name);
  });

  it("still refuses a name that is on no shelf at all, without inventing one", async () => {
    // The other half, so the pointer cannot become a guess: an item
    // that does not exist gets no shelf named, because there is none.
    const message = await refusal("buy_simple", "not_a_real_item_xyz");
    expect(message).toContain("not_a_real_item_xyz");
    for (const tool of mcpToolCatalog(BASE).filter((entry) => entry.itemIds)) {
      if (tool.name === "buy_simple") continue;
      expect(
        message,
        `a nonexistent item was pointed at ${tool.name}`,
      ).not.toContain(tool.name);
    }
  });
});
