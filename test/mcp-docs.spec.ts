import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DOCS_PATHS, DOCS_SERVER_NAME, DOCS_TOOL_NAME, docsToolCatalog } from "@/routes/mcp-docs";
import { mcpResourceCatalog } from "@/lib/mcp-resources";
import { FREE_DOORS } from "@/store/atlas";

/**
 * THE DOCUMENTATION DOOR (2026-09-05). What this file holds:
 *
 *   - POST /mcp.md and POST /mcp/docs answer JSON-RPC 2.0: initialize
 *     names the docs server, resources/list is exactly the shelf the
 *     main door lists (no ui:// cards), resources/read serves the
 *     same bytes /mcp does;
 *   - tools/list is exactly one read-only tool, and a call for any
 *     other name — a buy, an instrument — is refused as unknown;
 *   - GET /mcp.md is still the page, and the door is on the atlas.
 */

const BASE = "https://scvd.store";

async function rpc(
  path: string,
  method: string,
  params: Record<string, unknown> = {},
  id = 1,
): Promise<{ status: number; body: Record<string, any> }> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe("the documentation door answers a handshake at both addresses", () => {
  it("initialize names the docs server and declares resources and tools", async () => {
    for (const path of DOCS_PATHS) {
      const { status, body } = await rpc(path, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "probe", version: "1" },
      });
      expect(status, path).toBe(200);
      expect(body.result.serverInfo.name).toBe(DOCS_SERVER_NAME);
      expect(body.result.protocolVersion).toBe("2025-06-18");
      expect(body.result.capabilities.resources).toBeTruthy();
      expect(body.result.capabilities.tools).toBeTruthy();
      expect(String(body.result.instructions)).toContain(DOCS_TOOL_NAME);
      expect(String(body.result.instructions)).toContain("/mcp/verifier");
    }
  });

  it("GET /mcp.md is still the page, and GET /mcp/docs describes the door", async () => {
    const page = await SELF.fetch(`${BASE}/mcp.md`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("markdown");
    const text = await page.text();
    expect(text).toContain("The MCP doors");
    expect(text).toContain("/mcp/docs");
    expect(text).toContain(DOCS_TOOL_NAME);
    const doc = await SELF.fetch(`${BASE}/mcp/docs`);
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as Record<string, any>;
    expect(body.server).toBe(DOCS_SERVER_NAME);
    expect(body.also_answers_at).toBe(`${BASE}/mcp.md`);
  });

  it("refuses a body that is not JSON-RPC with -32700, never a 405", async () => {
    const response = await SELF.fetch(`${BASE}/mcp.md`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.error.code).toBe(-32700);
  });
});

describe("the shelf is the main door's shelf", () => {
  it("resources/list is exactly the scvd:// catalog, no ui:// cards", async () => {
    const { body } = await rpc("/mcp/docs", "resources/list");
    const uris = body.result.resources.map((r: { uri: string }) => r.uri);
    expect(uris).toEqual(mcpResourceCatalog().map((r) => r.uri));
    expect(uris.length).toBeGreaterThan(0);
    expect(uris.some((uri: string) => uri.startsWith("ui://"))).toBe(false);
  });

  it("resources/read serves the same bytes /mcp serves", async () => {
    const uri = mcpResourceCatalog()[0]!.uri;
    const here = await rpc("/mcp/docs", "resources/read", { uri });
    const main = await rpc("/mcp", "resources/read", { uri });
    expect(here.body.result.contents[0].text.length).toBeGreaterThan(100);
    expect(here.body.result.contents[0]).toEqual(main.body.result.contents[0]);
  });

  it("names a shelf it does not carry, with the shelf", async () => {
    const { body } = await rpc("/mcp/docs", "resources/read", { uri: "scvd://nothing" });
    expect(body.error.code).toBe(-32002);
    expect(body.error.message).toContain(mcpResourceCatalog()[0]!.uri);
  });
});

describe("one tool, read-only, and nothing that acts", () => {
  it("tools/list is exactly read_docs, with the shelf as its enum", async () => {
    const { body } = await rpc("/mcp/docs", "tools/list");
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([DOCS_TOOL_NAME]);
    const tool = body.result.tools[0];
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.inputSchema.properties.name.enum).toEqual(mcpResourceCatalog().map((r) => r.name));
    expect(docsToolCatalog()).toHaveLength(1);
  });

  it("read_docs returns a document by name, and the shelf with no name", async () => {
    const first = mcpResourceCatalog()[0]!;
    const named = await rpc("/mcp/docs", "tools/call", {
      name: DOCS_TOOL_NAME,
      arguments: { name: first.name },
    });
    expect(named.body.result.structuredContent.uri).toBe(first.uri);
    expect(named.body.result.structuredContent.text.length).toBeGreaterThan(100);
    const listed = await rpc("/mcp/docs", "tools/call", { name: DOCS_TOOL_NAME, arguments: {} });
    expect(listed.body.result.structuredContent.shelf.map((r: { name: string }) => r.name)).toEqual(
      mcpResourceCatalog().map((r) => r.name),
    );
  });

  it("refuses every other name — a buy, an instrument — as unknown here", async () => {
    for (const name of ["buy_simple", "preflight_endpoint", "ring_bell"]) {
      const { body } = await rpc("/mcp/docs", "tools/call", { name, arguments: {} });
      expect(body.error, name).toBeTruthy();
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain("/mcp/verifier");
    }
  });

  it("is on the atlas and in the API catalog", async () => {
    expect(FREE_DOORS.map((door) => door.path)).toContain("/mcp/docs");
    const catalog = await SELF.fetch(`${BASE}/.well-known/api-catalog`);
    expect(await catalog.text()).toContain("/mcp/docs");
  });
});
