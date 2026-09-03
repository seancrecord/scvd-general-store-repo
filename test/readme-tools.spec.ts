import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * THE README'S TOOLS TABLE IS THE CATALOGUE, NO MORE AND NO LESS
 * (2026-09-03). MCPpedia and its kind extract a server's tool
 * definitions from the GitHub README rather than from the running
 * server, and scored this store "0 tools, grade F" with fourteen
 * tools live. So the README carries a table, and this holds the
 * table's names to the catalogue's: a tool added to the server and
 * not the table, or a name that drifts, fails here.
 */
describe("the README tools table", () => {
  it("names exactly the tools the server lists", async () => {
    const readme = (await import("../README.md?raw")).default;
    const section = readme.split("### Tools")[1]?.split("**Evidence cards")[0] ?? "";
    const named = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]!);
    const live = mcpToolCatalog("https://scvd.store").map((t) => t.name);
    expect(named.length, "the table is empty or unparsed").toBeGreaterThan(0);
    expect([...named].sort()).toEqual([...live].sort());
    // Every row says something; a bare name is what the scanner already had.
    for (const row of section.matchAll(/^\| `[a-z_]+` \| (.+) \|$/gm)) {
      expect(row[1]!.length).toBeGreaterThan(20);
    }
  });
});
