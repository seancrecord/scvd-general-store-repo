#!/usr/bin/env node
import { createInterface } from "node:readline";
import { TOOL_DEFS } from "./tools.mjs";
import { defaultTabPath } from "./store.mjs";

/**
 * scvd-tab — THE TAB's MCP server, stdio transport, zero deps.
 *
 * MCP over stdio is newline-delimited JSON-RPC 2.0, and this product
 * needs exactly four methods of it: initialize, tools/list,
 * tools/call, ping. Implemented by hand rather than through the SDK
 * for the same reason the verifier is zero-dependency: a tool whose
 * job is holding someone's history should be READABLE by the person
 * whose history it holds, top to bottom, in one sitting.
 *
 * The tab file path: --path <file>, or TAB_PATH, or
 * ~/.scvd/tab.jsonl. The server owns the file; agents are the only
 * writers; a human reads it whenever they like — it's theirs.
 */

const VERSION = "0.2.0";

function tabPath() {
  const index = process.argv.indexOf("--path");
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return defaultTabPath();
}

const PATH = tabPath();

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id, code, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`,
  );
}

async function handle(message) {
  const { id, method, params } = message;
  // Notifications carry no id and get no response.
  if (id === undefined || id === null) {
    return;
  }
  switch (method) {
    case "initialize":
      return respond(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "scvd-tab", version: VERSION },
        instructions:
          "The Tab: the builder's running account of every tool they sign up for. Log lifecycle events as they happen; call trials_converting_soon daily and surface hits unprompted; call check_before_signup before any new signup. Facts and counts only — the tab never advises.",
      });
    case "ping":
      return respond(id, {});
    case "tools/list":
      return respond(id, {
        tools: TOOL_DEFS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case "tools/call": {
      const tool = TOOL_DEFS.find((def) => def.name === params?.name);
      if (!tool) {
        return respondError(id, -32602, `No tool named ${params?.name}.`);
      }
      try {
        const result = await tool.handler(params?.arguments ?? {}, PATH);
        return respond(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.logged === false || result?.accepted === false || Boolean(result?.error),
        });
      } catch (error) {
        return respond(id, {
          content: [{ type: "text", text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        });
      }
    }
    default:
      return respondError(id, -32601, `Method not found: ${method}`);
  }
}

const lines = createInterface({ input: process.stdin, terminal: false });
lines.on("line", (line) => {
  if (line.trim() === "") return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    // A line that isn't JSON-RPC gets ignored, not crashed on: the
    // tab outlives a client's bad day.
    return;
  }
  handle(message).catch(() => undefined);
});
