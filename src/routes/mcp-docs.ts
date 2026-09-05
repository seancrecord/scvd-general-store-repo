import { Hono, type Context } from "hono";
import { mcpResourceCatalog, readMcpResource } from "@/lib/mcp-resources";
import { DEFAULT_PROTOCOL, MCP_SERVER_VERSION, PROTOCOL_VERSIONS, toolText } from "@/routes/mcp";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { POSITION_LINE, POSITION_NOT } from "@/store/copy/position";
import type { HonoEnv } from "@/types";

/**
 * THE DOCUMENTATION DOOR — a third MCP server, serving the shelves
 * and nothing that acts (2026-09-05, at the keeper's ask).
 *
 * /mcp.md had been a markdown PAGE about which door to use, and the
 * store said so in its declined positions: one server, the docs on
 * it as resources. That was true and it read as a lie from outside —
 * a scanner that POSTs a JSON-RPC initialize to a documentation
 * address and gets a 405 reports a documentation server that is down,
 * and no sentence on the page it did not read can correct that. So
 * the address now answers both ways: GET is still the page, and POST
 * is a JSON-RPC 2.0 server whose whole catalog is the reference
 * material — the same resources /mcp lists, read by the same
 * function, so the two doors cannot disagree about what a shelf says.
 *
 * NOT A SECOND IMPLEMENTATION. Every body here comes from
 * lib/mcp-resources, the catalog /mcp serves; this file is a
 * dispatcher and a name. It holds one tool, read_docs, for the hosts
 * that surface tools and hide resources (most of them), and no other
 * tool by construction: nothing here can spend, write, or probe a
 * stranger's endpoint, and a test pins that the tool list is exactly
 * the one name. The store's actual instruments are on /mcp and
 * /mcp/verifier; this door tells a client where they are.
 */
export const mcpDocsRoutes = new Hono<HonoEnv>();

export const DOCS_SERVER_NAME = "scvd-store-docs";
export const DOCS_TITLE = "SCVD Store Docs";
export const DOCS_TOOL_NAME = "read_docs";

/** Where the door answers. The page address answers POST; the plain address answers both. */
export const DOCS_PATHS = ["/mcp.md", "/mcp/docs"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown): Response {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function serverInfo(base: string): Record<string, unknown> {
  return {
    name: DOCS_SERVER_NAME,
    title: DOCS_TITLE,
    version: MCP_SERVER_VERSION,
    websiteUrl: `${base}/mcp.md`,
  };
}

function instructions(base: string): string {
  const names = mcpResourceCatalog().map((resource) => resource.name);
  return `${POSITION_LINE} This is the documentation door: ${names.length} readable resources (${names.join(", ")}) and one tool, ${DOCS_TOOL_NAME}, which returns any of them by name for a host that hides resources. Nothing here acts, spends, or probes. The instruments are on ${base}/mcp (the store, paid shelves included) and ${base}/mcp/verifier (read-only tools only); ${base}/mcp.md says which to use. ${NEVER_A_RANKING_SENTENCE} ${POSITION_NOT}`;
}

/** The one tool, its enum derived from the shelf so it cannot name a resource that is not there. */
export function docsToolCatalog(): Record<string, unknown>[] {
  const shelf = mcpResourceCatalog();
  return [
    {
      name: DOCS_TOOL_NAME,
      title: "Read the store's documentation",
      description: `Read one of the store's reference documents by name — ${shelf.map((r) => `${r.name} (${r.title})`).join("; ")}. The same bytes resources/read serves on this door and on the main one; for a host that lists tools and hides resources. Call with no name to get the shelf listed. Free, read-only, nothing here acts or spends.`,
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: shelf.map((r) => r.name),
            description: "Which document. Omit to list the shelf.",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          uri: { type: "string", description: "The resource URI, for resources/read." },
          name: { type: "string" },
          title: { type: "string" },
          mimeType: { type: "string" },
          text: { type: "string", description: "The document itself." },
          shelf: {
            type: "array",
            description: "Present when called without a name: every document by uri, name and title.",
            items: { type: "object" },
          },
        },
      },
      annotations: {
        title: "Read the Docs",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

async function callDocsTool(
  c: Context<HonoEnv>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | string> {
  if (name !== DOCS_TOOL_NAME) {
    return `No tool by that name on this door: ${name}. This door serves ${DOCS_TOOL_NAME}; the instruments are on ${c.env.STORE_BASE_URL}/mcp and ${c.env.STORE_BASE_URL}/mcp/verifier.`;
  }
  const shelf = mcpResourceCatalog();
  const wanted = typeof args["name"] === "string" ? args["name"].trim() : "";
  if (!wanted) {
    return { shelf: shelf.map(({ uri, name: n, title, mimeType }) => ({ uri, name: n, title, mimeType })) };
  }
  const entry = shelf.find((resource) => resource.name === wanted);
  const found = entry ? await readMcpResource(c.env, c.env.STORE_BASE_URL, entry.uri) : null;
  if (!found) {
    return `No document named ${wanted}. The shelf: ${shelf.map((r) => r.name).join(", ")}.`;
  }
  return {
    uri: found.resource.uri,
    name: found.resource.name,
    title: found.resource.title,
    mimeType: found.resource.mimeType,
    text: found.text,
  };
}

async function handle(c: Context<HonoEnv>): Promise<Response> {
  const base = c.env.STORE_BASE_URL;
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || body["jsonrpc"] !== "2.0" || typeof body["method"] !== "string") {
    return rpcError(null, -32700, "That wasn't JSON-RPC. The door takes 2.0.");
  }
  const id = body["id"] ?? null;
  const method = body["method"];
  const params = isRecord(body["params"]) ? body["params"] : {};
  switch (method) {
    case "initialize": {
      const requested = String(params["protocolVersion"] ?? "");
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: serverInfo(base),
        instructions: instructions(base),
      });
    }
    case "server/discover":
      return rpcResult(id, {
        supportedVersions: [...PROTOCOL_VERSIONS],
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: serverInfo(base),
        instructions: instructions(base),
      });
    case "ping":
      return rpcResult(id, {});
    case "resources/list":
      // The scvd:// shelves only. The ui:// card templates belong to
      // the tools that render them, and none of those live here.
      return rpcResult(id, { resources: mcpResourceCatalog() });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "resources/read": {
      const uri = String(params["uri"] ?? "");
      const found = await readMcpResource(c.env, base, uri);
      if (!found) {
        return rpcError(id, -32002, `No resource at ${uri || "(no uri given)"}. The shelf: ${mcpResourceCatalog().map((r) => r.uri).join(", ")}`);
      }
      return rpcResult(id, {
        contents: [
          {
            uri: found.resource.uri,
            name: found.resource.name,
            title: found.resource.title,
            mimeType: found.resource.mimeType,
            text: found.text,
          },
        ],
      });
    }
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    case "tools/list":
      return rpcResult(id, { tools: docsToolCatalog() });
    case "tools/call": {
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = isRecord(params["arguments"]) ? params["arguments"] : {};
      const result = await callDocsTool(c, name, args);
      if (typeof result === "string") return rpcError(id, -32602, result);
      return rpcResult(id, toolText(result));
    }
    default:
      if (method.startsWith("notifications/")) return new Response(null, { status: 202 });
      return rpcError(
        id,
        -32601,
        `Method not on this door: ${method}. It serves initialize, ping, resources/list, resources/read, tools/list and tools/call.`,
      );
  }
}

for (const path of DOCS_PATHS) {
  mcpDocsRoutes.post(path, handle);
}

/** The plain address, read: what this door is and how to open it. GET /mcp.md is the page. */
mcpDocsRoutes.get("/mcp/docs", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    title: DOCS_TITLE,
    server: DOCS_SERVER_NAME,
    summary: `The documentation door: an MCP server whose whole catalog is the store's reference material — ${mcpResourceCatalog().length} readable resources and one tool (${DOCS_TOOL_NAME}) that returns any of them by name. Nothing here acts, spends, or probes.`,
    resources: mcpResourceCatalog().map((r) => ({ uri: r.uri, name: r.name, title: r.title })),
    tools: docsToolCatalog().map((tool) => ({ name: tool["name"], title: tool["title"] })),
    also_answers_at: `${base}/mcp.md`,
    handshake: `curl -sS -X POST ${base}/mcp/docs -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'`,
    the_store: `${base}/mcp`,
    the_verifier: `${base}/mcp/verifier`,
    which_door: `${base}/mcp.md`,
    never_a_ranking: NEVER_A_RANKING_SENTENCE,
  });
});
