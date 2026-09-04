import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { instrumentTools, openapiToolsDocument } from "@/routes/openapi-tools";
import { TOOL_ENDPOINTS, webmcpTools } from "@/routes/webmcp";

const BASE = "https://scvd.store";

/**
 * THE FUNCTION-CALLING TOOLS DOCUMENT (2026-09-03, roadmap C4). What
 * this file holds:
 *
 *   - every tool is a catalog tool, with the catalog's own schema and
 *     description, read-only, never a buy, never a paid door;
 *   - each has one worked call that satisfies its own required fields,
 *     a door under /api, and an operation id the contract carries;
 *   - the guide is text, not a function, and is the one free door out;
 *   - the document is in the API catalog, on the atlas, on the
 *     developers page and in the guide, and serves as JSON.
 */

describe("the tools are derived, and each carries its door and a worked call", () => {
  it("is the browser surface's free read-only set, minus the guide", () => {
    const names = instrumentTools().map((tool) => tool.name).sort();
    const expected = webmcpTools()
      .map((tool) => tool.name)
      .filter((name) => TOOL_ENDPOINTS[name]?.path.startsWith("/api/"))
      .sort();
    expect(names).toEqual(expected);
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).not.toContain("read_store_guide");
    expect(names.some((name) => name.startsWith("buy_"))).toBe(false);
  });

  it("every function is the catalog's own tool, read-only, with a worked call that satisfies its schema and an operation id in the contract", async () => {
    const doc = openapiToolsDocument(BASE);
    const catalog = mcpToolCatalog(BASE);
    const openapi = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as { paths: Record<string, Record<string, { operationId?: string }>> };
    const operationIds = new Set(Object.values(openapi.paths).flatMap((ops) => Object.values(ops).map((op) => op.operationId)));
    for (const entry of doc["tools"] as Array<Record<string, any>>) {
      expect(entry.type).toBe("function");
      const tool = catalog.find((candidate) => candidate.name === entry.function.name)!;
      expect(tool, entry.function.name).toBeTruthy();
      expect(tool.itemId).toBeUndefined();
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(entry.function.description).toBe(tool.description);
      const { examples: _examples, ...schema } = tool.inputSchema as Record<string, unknown>;
      expect(entry.function.parameters).toEqual(schema);
      expect(entry.function.parameters).not.toHaveProperty("examples");
      const extras = entry["x-scvd"];
      expect(extras.read_only).toBe(true);
      expect(extras.http.url.startsWith(`${BASE}/api/`)).toBe(true);
      expect(operationIds.has(extras.operation_id), `${entry.function.name}: ${extras.operation_id} not in the contract`).toBe(true);
      const required = (schema["required"] ?? []) as string[];
      for (const field of required) expect(extras.worked_call.arguments, `${entry.function.name} worked call lacks ${field}`).toHaveProperty(field);
      expect(extras.worked_call.curl).toContain(BASE);
      if (extras.http.method === "GET") expect(extras.worked_call.curl).not.toContain("{id}");
    }
    expect(JSON.stringify(doc)).not.toMatch(/\/api\/buy\//);
  });
});

describe("the document hangs where a developer looks", () => {
  it("serves as JSON, and is named by the catalog, the atlas, the developers page and the guide", async () => {
    const response = await SELF.fetch(`${BASE}/openapi-tools.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, any>;
    expect(body.tools.length).toBe(instrumentTools().length);
    expect(body.openapi).toBe(`${BASE}/openapi.json`);
    const catalog = (await (await SELF.fetch(`${BASE}/.well-known/api-catalog`)).json()) as { linkset: Array<Record<string, any>> };
    const root = catalog.linkset.find((entry) => entry.anchor === `${BASE}/`)!;
    expect(root["service-desc"].map((link: { href: string }) => link.href)).toContain(`${BASE}/openapi-tools.json`);
    const atlas = (await (await SELF.fetch(`${BASE}/atlas.json`)).json()) as Record<string, any>;
    expect(atlas.also.openapi_tools).toBe(`${BASE}/openapi-tools.json`);
    const developers = await (await SELF.fetch(`${BASE}/developers`, { headers: { Accept: "text/html" } })).text();
    expect(developers).toContain("/openapi-tools.json");
    const guide = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(guide).toContain("/openapi-tools.json");
  });
});
