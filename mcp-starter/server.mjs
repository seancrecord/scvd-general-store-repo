#!/usr/bin/env node
/**
 * scvd-mcp-starter — an MCP server over stdio, zero dependencies.
 *
 * MCP over stdio is newline-delimited JSON-RPC 2.0. This server
 * answers legacy `initialize`, modern `server/discover`, and `ping`, and hands
 * `tools/list` and `tools/call` to scvd.store's free verifier
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
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
/** Trailing slashes off an origin, without a regular expression over caller input. */
function trimSlashes(value) {
  let end = String(value).length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return String(value).slice(0, end);
}


export const UPSTREAM = trimSlashes(process.env.SCVD_MCP_UPSTREAM ?? "https://scvd.store/mcp/verifier");
export const SERVER_INFO = { name: "scvd-mcp-starter", title: "scvd x402 verifier (starter)", version: "0.2.0" };
// Kept standalone for copying; test/packages.spec.ts refuses hosted-version drift.
export const PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const [MODERN_PROTOCOL, DEFAULT_PROTOCOL] = PROTOCOL_VERSIONS;
const VERSION = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const INFO = "io.modelcontextprotocol/serverInfo";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (id) => typeof id === "string" || Number.isSafeInteger(id);
const rpcError = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } });

function headerValue(value) {
  // Encoding also escapes the sentinel itself so the receiver cannot misread it.
  return /[^\x20-\x7e]|^\s|\s$/.test(value) || (value.startsWith("=?base64?") && value.endsWith("?="))
    ? `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=` : value;
}

function modernize(answer, method) {
  if (!isRecord(answer.result)) return answer;
  return { ...answer, result: {
    ...answer.result,
    resultType: answer.result.resultType ?? "complete",
    ...(["server/discover", "tools/list"].includes(method) ? { ttlMs: 300_000, cacheScope: "public" } : {}),
    _meta: { ...answer.result._meta, [INFO]: SERVER_INFO },
  } };
}

export async function forward(request, { upstream = UPSTREAM, fetch: fetchImpl = fetch, signal, legacyVersion = DEFAULT_PROTOCOL } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json", "user-agent": `${SERVER_INFO.name}/${SERVER_INFO.version}`,
    "MCP-Protocol-Version": request.params?._meta?.[VERSION] ?? legacyVersion, "Mcp-Method": request.method };
  if (request.method === "tools/call" && typeof request.params?.name === "string") headers["Mcp-Name"] = headerValue(request.params.name);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 60_000);
  timeout.unref();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    // This adapter targets the verifier's JSON endpoint, not arbitrary SSE/session servers.
    const response = await fetchImpl(upstream, { method: "POST", headers, body: JSON.stringify(request), signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/** One JSON-RPC message in, one out (or null for a notification). */
export async function handle(message, options = {}) {
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" || (message.id !== undefined && !validId(message.id))) {
    return rpcError(validId(message?.id) ? message.id : null, -32600, "That wasn't JSON-RPC 2.0.");
  }
  const { id, method } = message;
  if (id === undefined) return null;
  if (message.params !== undefined && !isRecord(message.params)) return rpcError(id, -32602, "Params must be an object.");
  const params = message.params ?? {};
  if (params._meta !== undefined && !isRecord(params._meta)) return rpcError(id, -32602, "Metadata must be an object.");
  const meta = params._meta ?? {};
  const modern = method === "server/discover" || VERSION in meta || CAPS in meta;
  if (modern) {
    if (typeof meta[VERSION] !== "string") return rpcError(id, -32602, "Modern requests need a protocol version.");
    if (meta[VERSION] !== MODERN_PROTOCOL) return rpcError(id, -32022, "Unsupported protocol version.", { supported: [...PROTOCOL_VERSIONS], requested: meta[VERSION] });
    if (!isRecord(meta[CAPS])) return rpcError(id, -32602, "Modern requests need client capabilities.");
  }
  const reply = (result) => {
    const answer = { jsonrpc: "2.0", id, result };
    return modern ? modernize(answer, method) : answer;
  };
  const discovery = () => ({ capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
    instructions: `Five free x402 verifier tools, forwarded to ${options.upstream ?? UPSTREAM}. Nothing here can pay. Calls record traffic statistics upstream; readiness lookups for eligible unprobed hosts publish their names in the asked-for queue for a later sweep. Never a ranking.` });
  if (method === "initialize") {
    if (modern) return rpcError(id, -32601, "Use server/discover for modern requests.");
    const protocolVersion = PROTOCOL_VERSIONS.slice(1).includes(params.protocolVersion) ? params.protocolVersion : DEFAULT_PROTOCOL;
    return reply({ protocolVersion, ...discovery() });
  }
  if (method === "server/discover") return reply({ supportedVersions: [...PROTOCOL_VERSIONS], ...discovery() });
  if (method === "ping") return reply({});
  if (method === "tools/list" || method === "tools/call") {
    try {
      const answer = await forward({ jsonrpc: "2.0", id, method, params: message.params ?? {} }, options);
      return modern ? modernize({ ...answer, id }, method) : { ...answer, id };
    } catch (error) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: `the upstream door did not answer: ${String(error?.message ?? error)}` } };
    }
  }
  return rpcError(id, -32601, `Method not served here: ${method}. This starter serves initialize, server/discover, ping, tools/list and tools/call.`);
}

export function serve({ input = process.stdin, output = process.stdout, ...options } = {}) {
  const lines = createInterface({ input, terminal: false });
  const pending = new Map();
  let legacyVersion = DEFAULT_PROTOCOL;
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } })}\n`);
      return;
    }
    if (message?.jsonrpc === "2.0" && message.id === undefined && message.method === "notifications/cancelled") {
      pending.get(message.params?.requestId)?.abort();
      return;
    }
    if (validId(message?.id) && pending.has(message.id)) {
      output.write(`${JSON.stringify(rpcError(message.id, -32600, "Request ID is already in flight."))}\n`);
      return;
    }
    const controller = new AbortController();
    if (validId(message?.id)) pending.set(message.id, controller);
    try {
      const answer = await handle(message, { ...options, legacyVersion, signal: controller.signal });
      if (message?.method === "initialize" && answer?.result?.protocolVersion) legacyVersion = answer.result.protocolVersion;
      if (answer && !controller.signal.aborted) output.write(`${JSON.stringify(answer)}\n`);
    } finally {
      if (pending.get(message?.id) === controller) pending.delete(message.id);
    }
  });
  // EOF is shutdown; leave already-computed local replies a microtask to flush.
  lines.on("close", () => { queueMicrotask(() => { for (const controller of pending.values()) controller.abort(); }); });
  return lines;
}

// npm starts the bin through a symlink. Compare filesystem identities;
// interpolating a file URL also misreads a literal # in an install path.
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; } // Imported from an evaluator with no entry file.
}

if (isEntryPoint()) serve();
