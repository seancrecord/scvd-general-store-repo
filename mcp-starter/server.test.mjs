import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { SERVER_INFO, handle } from "./server.mjs";

const TOOLS = [{ name: "preflight_x402_endpoint" }, { name: "verify_x402_receipt" }, { name: "lookup_endpoint_readiness" }, { name: "get_defect_definition" }, { name: "verify_scvd_artifact" }];

async function withUpstream(fn) {
  const seen = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const message = JSON.parse(body);
      seen.push(message);
      const result = message.method === "tools/list" ? { tools: TOOLS } : { content: [{ type: "text", text: "ok" }], structuredContent: { echoed: message.params } };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    server.close();
  }
}

test("the handshake is answered here, the tools are the upstream door's, and a call is forwarded whole", async () => {
  await withUpstream(async (upstream, seen) => {
    const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, { upstream });
    assert.equal(init.result.serverInfo.name, SERVER_INFO.name);
    assert.match(init.result.instructions, /Never a ranking/);
    assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, { upstream }), null);
    const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { upstream });
    assert.deepEqual(list.result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
    const call = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_defect_definition", arguments: { id: "no-402" } } }, { upstream });
    assert.deepEqual(call.result.structuredContent.echoed, { name: "get_defect_definition", arguments: { id: "no-402" } });
    assert.deepEqual(seen.map((message) => message.method), ["tools/list", "tools/call"]);
    const unknown = await handle({ jsonrpc: "2.0", id: 4, method: "resources/list" }, { upstream });
    assert.equal(unknown.error.code, -32601);
  });
  const dead = await handle({ jsonrpc: "2.0", id: 5, method: "tools/list" }, { upstream: "http://127.0.0.1:9" });
  assert.equal(dead.error.code, -32000);
});

test("over stdio: newline-delimited JSON-RPC in, one line out per request", async () => {
  await withUpstream(async (upstream) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], { env: { ...process.env, SCVD_MCP_UPSTREAM: upstream } });
    const out = [];
    child.stdout.on("data", (chunk) => out.push(String(chunk)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    child.stdin.write("not json\n");
    await new Promise((resolve) => setTimeout(resolve, 800));
    child.kill();
    const lines = out.join("").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.find((line) => line.id === 1).result.serverInfo.name, SERVER_INFO.name);
    assert.equal(lines.find((line) => line.id === 2).result.tools.length, 5);
    assert.ok(lines.some((line) => line.error && line.error.code === -32700));
  });
});

test("the npm-style command link starts stdio, including spaces and # in its path", async () => {
  const { mkdtempSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "scvd mcp #command-"));
  try {
    const command = join(directory, "scvd-mcp-starter");
    symlinkSync(fileURLToPath(new URL("./server.mjs", import.meta.url)), command);
    const child = spawnSync(process.execPath, [command], {
      encoding: "utf8", timeout: 5000,
      input: `${JSON.stringify({ jsonrpc: "2.0", id: 91, method: "initialize", params: {} })}\n`,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.trim(), "installed command exited without an MCP response");
    const response = JSON.parse(child.stdout);
    assert.equal(response.id, 91);
    assert.equal(response.result.serverInfo.name, SERVER_INFO.name);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
