import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { PROTOCOL_VERSIONS } from "@/routes/mcp";

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

/**
 * THE README'S CONNECT SECTION IS THE DOOR, NO MORE AND NO LESS
 * (2026-09-03). The same scanners that read tools off the README read
 * the connect command and the protocol versions off it too, and a
 * directory listing sat with those fields blank because the README
 * never said them. Now it does, and the comment above PROTOCOL_VERSIONS
 * is the rule this test enforces: a document that advertises a revision
 * the server refuses is worse than one that lists none. The README's
 * version list is parsed and held to the exported constant; the
 * handoff line is held to the exact string the storefront serves.
 */
describe("the README connect section", () => {
  async function connectSection(): Promise<string> {
    const readme = (await import("../README.md?raw")).default;
    return readme.split("## Connecting over MCP")[1]?.split("### Tools")[0] ?? "";
  }

  it("lists exactly the protocol revisions the door negotiates", async () => {
    const section = await connectSection();
    const listed = [...new Set([...section.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]!))];
    expect(listed.length, "no protocol revisions found in the connect section").toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...PROTOCOL_VERSIONS].sort());
  });

  it("carries the same handoff line the storefront serves, and the manifest", async () => {
    const section = await connectSection();
    expect(section).toContain("claude mcp add --transport http scvd-store https://scvd.store/mcp");
    expect(section).toContain("https://scvd.store/.well-known/mcp");
    expect(section).toContain('"url": "https://scvd.store/mcp"');
  });
});
