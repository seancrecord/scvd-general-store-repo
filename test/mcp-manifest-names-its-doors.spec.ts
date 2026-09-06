import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { VERIFIER_SERVER_NAME, VERIFIER_TOOLS } from "@/routes/mcp-verifier";
import { DOCS_SERVER_NAME, docsToolCatalog } from "@/routes/mcp-docs";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { app } from "@/index";

/**
 * THREE DOORS, ONE CARD (2026-09-06).
 *
 * This origin runs three MCP servers and the manifest a client reads
 * to find one described only the store. The verifier and the
 * documentation door were on every prose surface and on none of the
 * machine ones a host actually uses to discover a server. What this
 * file holds: the card names every MCP door the router serves, each
 * with a live endpoint and a tool count derived from that door's own
 * catalogue, and the single-field reader is unaffected.
 */

const BASE = "https://scvd.store";

async function manifest(path = "/.well-known/mcp"): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return (await response.json()) as Record<string, any>;
}

/** Every POST route the router serves that is an MCP door. */
function mcpDoorPaths(): string[] {
  const paths = new Set<string>();
  for (const route of app.routes) {
    if (route.method.toUpperCase() !== "POST") continue;
    if (route.path === "/mcp" || route.path.startsWith("/mcp/")) {
      if (route.path.includes(":") || route.path.includes("*")) continue;
      if (route.path.endsWith("/")) continue;
      paths.add(route.path);
    }
  }
  return [...paths].sort();
}

describe("the manifest names every door on this origin", () => {
  it("lists a server per MCP door the router actually serves", async () => {
    const card = await manifest();
    const listed = (card["servers"] as Array<Record<string, unknown>>).map((s) =>
      new URL(String(s["endpoint"])).pathname,
    );
    // /mcp.md is the documentation door's second address, described in
    // its own entry rather than listed as a fourth server.
    const expected = mcpDoorPaths().filter((p) => p !== "/mcp.md");
    expect(listed.sort()).toEqual(expected);
    expect(listed.length).toBeGreaterThan(2);
  });

  it("counts each door's tools from that door's own catalogue", async () => {
    const card = await manifest();
    const byPath = new Map(
      (card["servers"] as Array<Record<string, unknown>>).map((s) => [
        new URL(String(s["endpoint"])).pathname,
        s,
      ]),
    );
    expect(byPath.get("/mcp")!["tools"]).toBe(mcpToolCatalog(BASE).length);
    expect(byPath.get("/mcp/verifier")!["tools"]).toBe(VERIFIER_TOOLS.length);
    expect(byPath.get("/mcp/docs")!["tools"]).toBe(docsToolCatalog().length);
    expect(byPath.get("/mcp/verifier")!["name"]).toBe(VERIFIER_SERVER_NAME);
    expect(byPath.get("/mcp/docs")!["name"]).toBe(DOCS_SERVER_NAME);
    // Only one of the three sells anything, and the card says which.
    expect((card["servers"] as Array<Record<string, unknown>>).filter((s) => s["sells"])).toHaveLength(1);
  });

  it("every listed endpoint answers a handshake", async () => {
    const card = await manifest();
    for (const server of card["servers"] as Array<Record<string, unknown>>) {
      const path = new URL(String(server["endpoint"])).pathname;
      const response = await SELF.fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as Record<string, any>;
      expect(body.result?.tools?.length, `${path} listed no tools`).toBe(server["tools"]);
    }
  });

  it("leaves the single-field reader exactly as it was", async () => {
    const card = await manifest();
    // A client that reads `endpoint` (or `url`) and stops still finds
    // the full store, which is what it found before this card grew.
    expect(card["endpoint"]).toBe(`${BASE}/mcp`);
    expect(card["url"]).toBe(`${BASE}/mcp`);
    expect(card["which_door"]).toBe(`${BASE}/mcp.md`);
    // Served identically at the .json spelling.
    expect(await manifest("/.well-known/mcp.json")).toEqual(card);
  });
});
