#!/usr/bin/env node
/**
 * scvd-mcp-starter — an MCP server over stdio, zero dependencies.
 *
 * MCP over stdio is newline-delimited JSON-RPC 2.0. This server
 * answers `initialize`, `ping` and the notifications itself, and hands
 * `tools/list` and `tools/call` to scvd.store's read-only verifier
 * door (POST /mcp/verifier) over HTTPS: five tools, none of them paid,
 * every answer naming its checks and what it cannot tell you. It holds
 * no key, asks for nothing, and cannot spend money — the upstream door
 * has no paid tool to reach.
 *
 * Why a starter and not a dependency: the whole thing is one file, so
 * copy it and change UPSTREAM to your own MCP door when you have one.
 *
 *   SCVD_MCP_UPSTREAM  the door to forward to (default https://scvd.store/mcp/verifier)
 */
import { createInterface } from "node:readline";

export const UPSTREAM = (process.env.SCVD_MCP_UPSTREAM ?? "https://scvd.store/mcp/verifier").replace(/\/+$/, "");
export const SERVER_INFO = { name: "scvd-mcp-starter", title: "scvd x402 verifier (starter)", version: "0.1.0" };
const PROTOCOL = "2025-11-25";

export async function forward(request, { upstream = UPSTREAM, fetch: fetchImpl = fetch } = {}) {
  const response = await fetchImpl(upstream, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "scvd-mcp-starter/0.1.0" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  return response.json();
}

/** One JSON-RPC message in, one out (or null for a notification). */
export async function handle(message, options = {}) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "That wasn't JSON-RPC 2.0." } };
  }
  const { id, method } = message;
  if (method.startsWith("notifications/")) return null;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: `Five read-only x402 verifier tools, forwarded to ${options.upstream ?? UPSTREAM}. Nothing here can pay or act; every answer names its checks and what it cannot tell you. Never a ranking.` } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list" || method === "tools/call") {
    try {
      const answer = await forward({ jsonrpc: "2.0", id, method, params: message.params ?? {} }, options);
      return { ...answer, id };
    } catch (error) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: `the upstream door did not answer: ${String(error?.message ?? error)}` } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not served here: ${method}. This starter serves initialize, ping, tools/list and tools/call.` } };
}

export function serve({ input = process.stdin, output = process.stdout, ...options } = {}) {
  const lines = createInterface({ input, terminal: false });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } })}\n`);
      return;
    }
    const answer = await handle(message, options);
    if (answer) output.write(`${JSON.stringify(answer)}\n`);
  });
  return lines;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) serve();
