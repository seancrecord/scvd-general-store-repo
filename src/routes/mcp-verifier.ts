import { Hono, type Context } from "hono";
import { findMcpTool, type McpTool } from "@/lib/mcp-tools";
import { runEvidenceTask } from "@/services/a2a-evidence";
import { DEFAULT_PROTOCOL, MCP_SERVER_VERSION, PROTOCOL_VERSIONS, callFreeTool, toolText } from "@/routes/mcp";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { POSITION_LINE, POSITION_NOT } from "@/store/copy/position";
import { DEFECT_CLASSES, DEFECT_VOCABULARY_VERSION, defectClass } from "@/store/defect-vocabulary";
import type { HonoEnv } from "@/types";

/**
 * THE VERIFIER — a second MCP door with five read-only tools and no
 * shelf (2026-09-03, roadmap A3, the keeper's memo's third move).
 *
 * The full door at /mcp lists the shelf beside the free instruments,
 * which is right for an agent that may buy and wrong for a client
 * that must never see a paid tool: a directory reviewer reading
 * "sells digital services", or a model choosing among eighteen names
 * that overlap. This door lists five tools under task-shaped names —
 * what a caller is trying to do, not what the house calls the room —
 * and nothing else. Three of them are the existing free tools
 * renamed; two are the evidence agent's readiness read and the
 * defect vocabulary, which had no MCP door of their own.
 *
 * No handler is duplicated: a call is translated to the base tool's
 * name and run by the same function /mcp runs, so the two doors
 * cannot disagree about what a probe saw.
 */
export const mcpVerifierRoutes = new Hono<HonoEnv>();

export const VERIFIER_SERVER_NAME = "scvd-x402-verifier";
export const VERIFIER_TITLE = "SCVD x402 Verifier";

/** Task-shaped name → the base tool on /mcp it runs, or null when the tool is this door's own. */
export const VERIFIER_TOOLS: ReadonlyArray<{ name: string; base: string | null; title: string; description: string }> = [
  {
    name: "preflight_x402_endpoint",
    base: "preflight_endpoint",
    title: "Preflight an x402 endpoint",
    description:
      "Preflight an x402 endpoint before paying it: one unpaid probe answering whether the URL serves a well-formed x402 v2 challenge a stock client could sign — 402 status, parseable PAYMENT-REQUIRED, signable accepts, testnet catch — with every check named and what a single probe cannot tell you. A shape check at one moment, never an uptime or delivery claim.",
  },
  {
    name: "verify_x402_receipt",
    base: "check_conformance",
    title: "Verify an x402 receipt or signed offer",
    description:
      "Verify an x402 signed receipt or offer from any issuer: structure, signature against the issuer's key (pass public_key_hex for a fully offline check; otherwise the did:web key is resolved), liveness. A verdict with every check named. Establishes the bytes and the key, never settlement or delivery.",
  },
  {
    name: "lookup_endpoint_readiness",
    base: null,
    title: "Look up an endpoint's readiness history",
    description:
      "Read what the signed weekly x402 readiness corpus holds about one host: rounds probed of rounds since first sighting, the last signed verdict, the tier with its fraction, the gaps counted against the observer. From the chain, not a live probe; a host never met comes back as never met.",
  },
  {
    name: "get_defect_definition",
    base: null,
    title: "Get an x402 defect definition",
    description:
      "The definition of one named x402 defect class from the store's registered vocabulary: what a clear door asserts, what a buyer loses when it is present, whether it is detectable without paying, which check reports it, and what observation would disprove it. Pass no id to list every class.",
  },
  {
    name: "verify_scvd_artifact",
    base: "verify_artifact",
    title: "Verify an artifact this store signed",
    description:
      "Verify a certificate, stamp or anchor id this store issued: the exact signed bytes and the ed25519 key, so the check can be repeated offline. Free forever, whether or not anyone bought the thing.",
  },
];

const INSTRUCTIONS = `${POSITION_LINE} This door serves ${VERIFIER_TOOLS.length} read-only tools and sells nothing: preflight an x402 endpoint, verify an x402 receipt or signed offer, look up an endpoint's signed readiness history, read a defect definition, verify an artifact this store signed. Every answer names its checks and what it cannot tell you. ${NEVER_A_RANKING_SENTENCE} ${POSITION_NOT} The paid instruments live on the store's other doors and are not reachable here.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function serverInfo(base: string): Record<string, unknown> {
  return { name: VERIFIER_SERVER_NAME, title: VERIFIER_TITLE, version: MCP_SERVER_VERSION, websiteUrl: `${base}/mcp/verifier` };
}

/** The five tools as a client lists them: the base tool's schemas and annotations under the task-shaped name. */
export function verifierToolCatalog(base: string): Record<string, unknown>[] {
  return VERIFIER_TOOLS.map((entry) => {
    const baseTool: McpTool | undefined = entry.base ? findMcpTool(entry.base, base) : undefined;
    const annotations = { title: entry.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: entry.name !== "get_defect_definition" };
    if (baseTool) {
      const { itemId: _itemId, itemIds: _itemIds, name: _name, description: _description, annotations: _annotations, ...rest } = baseTool as McpTool & { itemIds?: string[] };
      return { ...rest, name: entry.name, title: entry.title, description: entry.description, annotations };
    }
    if (entry.name === "lookup_endpoint_readiness") {
      return {
        name: entry.name,
        title: entry.title,
        description: entry.description,
        inputSchema: { type: "object", properties: { host: { type: "string", description: "A hostname, or a URL whose host is read.", maxLength: 2048 } }, required: ["host"], additionalProperties: false },
        annotations,
      };
    }
    return {
      name: entry.name,
      title: entry.title,
      description: entry.description,
      inputSchema: { type: "object", properties: { id: { type: "string", description: `A defect class id from the vocabulary (v${DEFECT_VOCABULARY_VERSION}), e.g. status-402. Omit to list every class.`, maxLength: 80 } }, additionalProperties: false },
      annotations,
    };
  });
}

async function callVerifierTool(c: Context<HonoEnv>, name: string, args: Record<string, unknown>): Promise<Record<string, unknown> | string> {
  const entry = VERIFIER_TOOLS.find((tool) => tool.name === name);
  if (!entry) return `No tool by that name on this door: ${name}. This door serves ${VERIFIER_TOOLS.map((tool) => tool.name).join(", ")}.`;
  if (entry.base) return callFreeTool(c, entry.base, args);
  if (entry.name === "lookup_endpoint_readiness") {
    const outcome = await runEvidenceTask(c.env, "get_endpoint_readiness", args);
    return outcome.artifact as unknown as Record<string, unknown>;
  }
  const id = typeof args["id"] === "string" ? args["id"].trim() : "";
  if (!id) {
    return {
      vocabulary_version: DEFECT_VOCABULARY_VERSION,
      classes: DEFECT_CLASSES.map((cls) => ({ id: cls.id, title: cls.title, detectable: cls.detectable })),
      definition_url: `${c.env.STORE_BASE_URL}/defects`,
    };
  }
  const cls = defectClass(id);
  if (!cls) return `No defect class named ${id} in vocabulary v${DEFECT_VOCABULARY_VERSION}. Call with no id to list every class.`;
  return { vocabulary_version: DEFECT_VOCABULARY_VERSION, ...cls, definition_url: `${c.env.STORE_BASE_URL}/defects#${cls.id}` };
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
        capabilities: { tools: { listChanged: false } },
        serverInfo: serverInfo(base),
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: verifierToolCatalog(base) });
    case "tools/call": {
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = isRecord(params["arguments"]) ? params["arguments"] : {};
      const result = await callVerifierTool(c, name, args);
      if (typeof result === "string") return rpcError(id, -32602, result);
      return rpcResult(id, toolText(result));
    }
    default:
      if (method.startsWith("notifications/")) return new Response(null, { status: 202 });
      return rpcError(id, -32601, `Method not on this door: ${method}. It serves initialize, ping, tools/list and tools/call.`);
  }
}

mcpVerifierRoutes.post("/mcp/verifier", handle);

mcpVerifierRoutes.get("/mcp/verifier", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    title: VERIFIER_TITLE,
    server: VERIFIER_SERVER_NAME,
    summary: `A second MCP door serving ${VERIFIER_TOOLS.length} read-only tools and nothing paid, under task-shaped names, on the same handlers as /mcp. For a client that should never see a shelf.`,
    tools: VERIFIER_TOOLS.map((tool) => ({ name: tool.name, title: tool.title })),
    handshake: `curl -sS -X POST ${base}/mcp/verifier -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    the_full_door: `${base}/mcp`,
    never_a_ranking: NEVER_A_RANKING_SENTENCE,
  });
});
