import { Hono } from "hono";
import type { McpTool } from "@/lib/mcp-tools";
import { operationIdFor } from "@/routes/openapi";
import { TOOL_ENDPOINTS, webmcpTools } from "@/routes/webmcp";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { POSITION_LINE, POSITION_NOT } from "@/store/copy/position";
import type { HonoEnv } from "@/types";

/**
 * /openapi-tools.json — THE FREE INSTRUMENTS AS FUNCTION-CALLING TOOLS
 * (roadmap C4, 2026-09-03).
 *
 * A developer wrapping this API in their own agent does not want the
 * whole OpenAPI contract; they want the handful of deterministic,
 * read-only doors as tool definitions their model can call, each with
 * one worked call. This document is that, and it is DERIVED, never a
 * second typed list: the tools are the MCP catalog's free read-only
 * set (the same derivation the browser surface uses), the schemas are
 * the catalog's own inputSchema objects, the HTTP door per tool is the
 * WebMCP endpoint map, the operation id is the contract's own rule,
 * and the worked call is the example every tool already carries. A
 * tool renamed or retired on the MCP door changes here the same
 * deploy. The guide (GET /llms.txt) is text, not a function, and is
 * the one free door left out.
 *
 * The shape is the common function-calling one — `{ type:
 * "function", function: { name, description, parameters } }` — with
 * the store's extras under `x-scvd`, where a strict reader skips them
 * and a curious one finds the door, the worked call, and what the
 * tool reads.
 */
export const openapiToolsRoutes = new Hono<HonoEnv>();

/** The free instruments: read-only by derivation, and an HTTP door under /api. */
export function instrumentTools(): McpTool[] {
  return webmcpTools().filter((tool) => TOOL_ENDPOINTS[tool.name]?.path.startsWith("/api/"));
}

function curlFor(base: string, endpoint: { method: "GET" | "POST"; path: string }, example: Record<string, unknown>): string {
  if (endpoint.method === "GET") {
    const path = endpoint.path.replace(/\{([a-z_]+)\}/g, (_match, name: string) =>
      encodeURIComponent(String(example[name] ?? "")),
    );
    return `curl -sS ${base}${path}`;
  }
  return `curl -sS -X POST ${base}${endpoint.path} -H 'content-type: application/json' -d '${JSON.stringify(example)}'`;
}

export function openapiToolsDocument(base: string): Record<string, unknown> {
  const tools = instrumentTools().map((tool) => {
    const endpoint = TOOL_ENDPOINTS[tool.name]!;
    const { examples, ...parameters } = tool.inputSchema as Record<string, unknown> & { examples?: Record<string, unknown>[] };
    const example = (examples ?? [])[0] ?? {};
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
      "x-scvd": {
        title: tool.title ?? tool.annotations?.title ?? tool.name,
        http: { method: endpoint.method, url: `${base}${endpoint.path}` },
        operation_id: operationIdFor(endpoint.method, endpoint.path),
        worked_call: { arguments: example, curl: curlFor(base, endpoint, example) },
        reads: tool.reads ?? null,
        read_only: tool.annotations?.readOnlyHint === true,
        mcp_tool: `${base}/mcp`,
      },
    };
  });
  return {
    title: "The free instruments, as function-calling tools",
    what_this_is: `${POSITION_LINE} This document lists the store's free, read-only instruments in the common function-calling shape, one worked call each, for a developer wrapping them in their own agent. Derived from the same catalog the MCP door serves: the names, descriptions and parameter schemas are the catalog's own objects, the HTTP door per tool is the one the browser surface calls, and the operation id is the contract's rule.`,
    what_this_is_not: `${POSITION_NOT} Not the whole contract: every endpoint, paid doors included, is at ${base}/openapi.json. Nothing here can act or spend; a paid door is never a function in this list. ${NEVER_A_RANKING_SENTENCE}`,
    tools,
    openapi: `${base}/openapi.json`,
    mcp: `${base}/mcp`,
    verifier_mcp: `${base}/mcp/verifier`,
    catalog: `${base}/.well-known/api-catalog`,
  };
}

openapiToolsRoutes.get("/openapi-tools.json", (c) =>
  c.json(openapiToolsDocument(c.env.STORE_BASE_URL), 200, { "Cache-Control": "public, max-age=300" }),
);
