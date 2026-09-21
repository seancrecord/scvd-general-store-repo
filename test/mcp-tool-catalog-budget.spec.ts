import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * WHAT EVERY MCP SESSION DOWNLOADS BEFORE IT DOES ANYTHING
 * (2026-09-06).
 *
 * Measured on the live door: tools/list was 234,492 bytes for fifteen
 * tools — ~57,000 tokens — of which `specs`, the full listing spec for
 * every item a cluster tool sells, was 114,825. buy_observation alone
 * was 109,302, more than half of it its own specs.
 *
 * The catalog's own note called the extras harmless because "an MCP
 * client ignores a key it does not know". That is true of PARSING and
 * false of COST: most hosts serialize the whole tool object into the
 * model's context, so every session pays those bytes in tokens whether
 * or not one key is read — and September ran ~2,057 sessions against
 * ~185 free tool calls and ~38 paid. Thousands of connects, dozens of
 * calls.
 *
 * The specs were already published per item at /menu/{item_id}, in
 * full, JSON or markdown. They are pointed at now rather than copied
 * into every session. This file is the budget that keeps them out:
 * the catalog cannot quietly double again without someone raising a
 * number and saying why.
 */

const BASE = "https://scvd.store";

/**
 * The ceilings. Measured after the specs came out: 116,247 total and
 * 31,250 for the largest tool. The headroom is deliberate and small —
 * enough for ordinary editing, not enough to re-embed a catalog.
 */
/**
 * Raised 140,000 → 152,000 on 2026-09-12 for the Paywall: two free
 * tools (read_binder, look_in_window), two items on the penny shelf
 * (pack, window_pick) and one published refusal (window_refused) on
 * the two tools that sell the pick. Measured 147,028 the day it moved,
 * with the tool descriptions cut first (test/tool-surface.spec.ts
 * holds them under 34k). A ratchet with its reason, like the OpenAPI
 * budget in store/reader-limits.ts; the second assertion below still
 * holds the catalog well under what the specs cost.
 */
/**
 * RAISED 152,000 → 165,000 on 2026-09-21, when the mandate got a tool
 * of its own (buy_mandate): the authorization primitive had been the
 * seventeenth id inside buy_observation, whose purpose never said
 * "authorization". What the measurement found while arguing the
 * bytes: every tool carries the same `errors` (4,975 bytes) and
 * `security` (1,057 bytes) blocks, so twenty-one tools spend about
 * 126 KB of a 162 KB catalog repeating one contract. A one-item shelf
 * now states its own compact output shape (ShelfCluster.outputSchema)
 * and that saved a few hundred bytes; the six kilobytes a new tool
 * really costs are the repeated blocks. The ceiling moves by eight
 * percent to admit this one tool and stays thirty percent under what
 * this catalog replaced; the next tool argues its bytes here, and the
 * honest saving — hoisting the identical blocks once per catalog —
 * is a change to the contract every client reads, not to this test.
 */
const CATALOG_BYTE_CEILING = 165_000;
const LARGEST_TOOL_BYTE_CEILING = 40_000;
/** What it was before, kept so the test states what it prevents. */
const BYTES_BEFORE = 234_492;

function catalog(): Array<Record<string, unknown>> {
  return mcpToolCatalog(BASE) as unknown as Array<Record<string, unknown>>;
}

describe("the tool catalog every session downloads", () => {
  it("keeps tool selection concise and leaves detailed output prose at the linked item", () => {
    const tools = catalog();
    const bytes = new TextEncoder().encode(JSON.stringify(tools)).length;
    console.log(JSON.stringify({ mcp_catalog_bytes: bytes, longest_description: Math.max(...tools.map(tool => String(tool.description).length)) }));
    expect(bytes).toBeLessThan(CATALOG_BYTE_CEILING);
    for (const tool of tools) {
      expect(String(tool.description).length, String(tool.name)).toBeLessThan(8_000);
    }
  });

  it("stays under its budget, and is well under what it replaced", () => {
    const bytes = JSON.stringify(catalog()).length;
    expect(bytes, `tools/list is ${bytes} bytes`).toBeLessThan(CATALOG_BYTE_CEILING);
    // 1.5 → 1.4 with the ceiling above (2026-09-21): still a third under what
    // it replaced once the repeated blocks are hoisted; until then, this is
    // the bound one more tool leaves, and the next tool argues its bytes.
    expect(bytes).toBeLessThan(BYTES_BEFORE / 1.4);
  });

  it("has no single tool big enough to crowd out a small context on its own", () => {
    for (const tool of catalog()) {
      const bytes = JSON.stringify(tool).length;
      expect(bytes, `${String(tool["name"])} is ${bytes} bytes`).toBeLessThan(
        LARGEST_TOOL_BYTE_CEILING,
      );
    }
  });

  it("embeds no per-item listing spec, on any tool", () => {
    for (const tool of catalog()) {
      expect(tool["specs"], `${String(tool["name"])} re-embedded its specs`).toBeUndefined();
    }
  });
});

describe("nothing was lost, only moved", () => {
  it("points at the specs instead, with the ids needed to resolve the template", () => {
    const clusters = catalog().filter((tool) => tool["specsUrlTemplate"] !== undefined);
    expect(clusters.length).toBeGreaterThan(0);
    for (const tool of clusters) {
      expect(tool["specsUrlTemplate"]).toBe(`${BASE}/menu/{item_id}`);
      const ids = tool["itemIds"] as string[];
      expect(Array.isArray(ids) && ids.length > 0, `${String(tool["name"])} points nowhere`).toBe(true);
      for (const id of ids) {
        expect(MENU_ITEMS.some((item) => item.id === id), `${id} is not on the shelf`).toBe(true);
      }
    }
  });

  it("resolves: the template with a real id serves that item's listing spec", async () => {
    const cluster = catalog().find((tool) => tool["specsUrlTemplate"] !== undefined)!;
    const id = (cluster["itemIds"] as string[])[0]!;
    const url = String(cluster["specsUrlTemplate"]).replace("{item_id}", id);
    const response = await SELF.fetch(url, {
      headers: { "User-Agent": "catalog-budget-spec/1.0", Accept: "application/json" },
    });
    expect(response.status, `${url} did not answer`).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["id"]).toBe(id);
    // The thing that used to ride in every session, served on demand.
    expect(body["spec"], `${url} carries no listing spec`).toBeDefined();
  });
});
