import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { searchCatalog } from "@/routes/catalog";
import { findMcpTool } from "@/lib/mcp-tools";
import { webmcpTools, TOOL_ENDPOINTS, webmcpScript } from "@/routes/webmcp";
import { MENU_ITEMS } from "@/store";

/**
 * THE FIRST TWO STEPS OF THE JOURNEY (2026-09-06).
 *
 * The shelf could be bought from and never shopped: buy_* wants an
 * item_id the caller had to already know, and the only way to learn
 * one was to read the whole guide. What this file holds: the search
 * filters by the rule it states, the two doors answer identically,
 * the answer carries its denominator and refuses to rank, and a bad
 * cap or an unknown id is a refusal rather than a wider answer.
 */

const BASE = "https://scvd.store";

async function http(query: string): Promise<{ status: number; body: any }> {
  const response = await SELF.fetch(`${BASE}/api/catalog/v1${query}`);
  return { status: response.status, body: await response.json() };
}

async function tool(args: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "find_in_catalog", arguments: args },
    }),
  });
  return (await response.json()) as Record<string, any>;
}

describe("the search itself", () => {
  it("filters by a price ceiling, and every row is at or below it", async () => {
    const { status, body } = await http("?max_price_usdc=0.01");
    expect(status).toBe(200);
    expect(body.matched).toBeGreaterThan(0);
    expect(body.matched).toBeLessThan(MENU_ITEMS.length);
    expect(body.of).toBe(MENU_ITEMS.length);
    for (const row of body.items) expect(row.price_usdc).toBeLessThanOrEqual(0.01);
    // The denominator travels with the count, and the order is stated.
    expect(body.items).toHaveLength(body.matched);
    expect(String(body.how_this_was_ordered)).toMatch(/ranked|recommended/);
  });

  it("matches text across the fields a shopper would type into", async () => {
    const { body } = await http("?q=watch");
    expect(body.matched).toBeGreaterThan(0);
    for (const row of body.items) {
      const item = MENU_ITEMS.find((entry) => entry.id === row.id)!;
      const haystack = [item.id, item.name, item.subtitle ?? "", item.description].join(" ").toLowerCase();
      expect(haystack).toContain("watch");
    }
  });

  it("returns one item in full when an id is named", async () => {
    const { body } = await http("?item_id=spot_check");
    expect(body.matched).toBe(1);
    const [row] = body.items;
    expect(row.id).toBe("spot_check");
    expect(typeof row.description).toBe("string");
    expect(row.at_a_glance).toBeTruthy();
    expect(row.buy_url).toBe(`${BASE}/api/buy/spot_check`);
  });

  it("refuses a cap it cannot parse, rather than answering wider", async () => {
    const { status, body } = await http("?max_price_usdc=abc");
    expect(status).toBe(400);
    expect(String(body.error)).toContain("max_price_usdc");
    expect(body.items).toBeUndefined();
  });

  it("names the ids it holds when given one it does not", async () => {
    const { status, body } = await http("?item_id=carry_on_suitcase");
    expect(status).toBe(404);
    expect(body.known_ids).toEqual(MENU_ITEMS.map((item) => item.id));
  });

  it("stays compact: a filtered answer is a fraction of the whole catalogue", async () => {
    const filtered = await SELF.fetch(`${BASE}/api/catalog/v1?max_price_usdc=0.01`);
    const whole = await SELF.fetch(`${BASE}/menu.json`);
    const filteredSize = (await filtered.text()).length;
    const wholeSize = (await whole.text()).length;
    expect(filteredSize).toBeLessThan(wholeSize / 5);
  });
});

describe("the tool, on both doors", () => {
  it("is free, read-only, and derives onto the browser surface", () => {
    const found = findMcpTool("find_in_catalog", BASE);
    expect(found).toBeTruthy();
    expect(found!.itemId).toBeUndefined();
    expect(found!.annotations?.readOnlyHint).toBe(true);
    expect(webmcpTools().map((t) => t.name)).toContain("find_in_catalog");
    expect(TOOL_ENDPOINTS["find_in_catalog"]).toEqual({ method: "GET", path: "/api/catalog/v1" });
  });

  it("answers over MCP exactly as the HTTP door does", async () => {
    const viaTool = await tool({ max_price_usdc: 0.01 });
    const viaHttp = await http("?max_price_usdc=0.01");
    expect(viaTool.result.structuredContent).toEqual(viaHttp.body);
  });

  it("hands a refusal back as words, not as a record", async () => {
    const bad = await tool({ max_price_usdc: "abc" });
    expect(bad.error).toBeTruthy();
    expect(String(bad.error.message)).toContain("max_price_usdc");
    const unknown = await tool({ item_id: "carry_on_suitcase" });
    expect(String(unknown.error.message)).toContain("carry_on_suitcase");
  });

  it("sends a GET tool's arguments as a query string in the browser", () => {
    /*
     * Before this, a GET tool's arguments reached the server only if
     * the path named them as a placeholder — so a search tool on a GET
     * door would have silently searched for nothing.
     */
    const script = webmcpScript();
    expect(script).toContain("query.push(encodeURIComponent(key)");
    expect(script).toContain("if (used[key]) return;");
  });
});
