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
const CATALOG_BYTE_CEILING = 140_000;
const LARGEST_TOOL_BYTE_CEILING = 40_000;
/** What it was before, kept so the test states what it prevents. */
const BYTES_BEFORE = 234_492;

function catalog(): Array<Record<string, unknown>> {
  return mcpToolCatalog(BASE) as unknown as Array<Record<string, unknown>>;
}

describe("the tool catalog every session downloads", () => {
  it("stays under its budget, and is well under what it replaced", () => {
    const bytes = JSON.stringify(catalog()).length;
    expect(bytes, `tools/list is ${bytes} bytes`).toBeLessThan(CATALOG_BYTE_CEILING);
    expect(bytes).toBeLessThan(BYTES_BEFORE / 1.5);
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
