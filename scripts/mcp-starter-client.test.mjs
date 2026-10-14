import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// The independent SDK is a root development dependency, never a starter dependency.
// Its Client still initializes. Explicit modern probes use its real stdio framing;
// they are not evidence of a modern native host or production qualification.
const VERSION = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const tool = { name: "verify_scvd_artifact", description: "Fixture verifier", inputSchema: { type: "object", properties: { artifact: { type: "string" } }, required: ["artifact"] } };

async function withTransport(fn) {
  const seen = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    seen.push(message);
    const modern = message.params?._meta?.[VERSION];
    const mismatch = modern && (request.headers["mcp-protocol-version"] !== modern || request.headers["mcp-method"] !== message.method || (message.method === "tools/call" && request.headers["mcp-name"] !== message.params.name));
    const result = message.method === "tools/list" ? { tools: [tool] } : { content: [{ type: "text", text: message.params.arguments.artifact }] };
    response.writeHead(mismatch ? 400 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...(mismatch ? { error: { code: -32020, message: "Header mismatch" } } : { result }) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../mcp-starter/server.mjs", import.meta.url))], env: { SCVD_MCP_UPSTREAM: `http://127.0.0.1:${server.address().port}` }, stderr: "pipe" });
  try { await fn(transport, seen); }
  finally { await transport.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("official MCP Client discovers and calls the starter through a real subprocess", { timeout: 10_000 }, async () => {
  await withTransport(async (transport, seen) => {
    const client = new Client({ name: "starter-compatibility", version: "1" });
    await client.connect(transport);
    try {
      assert.equal(client.getServerVersion().name, "scvd-mcp-starter");
      assert.deepEqual((await client.listTools()).tools, [tool]);
      assert.deepEqual((await client.callTool({ name: tool.name, arguments: { artifact: "original bytes" } })).content, [{ type: "text", text: "original bytes" }]);
      assert.deepEqual(seen.map((message) => message.method), ["tools/list", "tools/call"]);
    } finally { await client.close(); }
  });
});

test("official stdio transport carries discovery-first modern calls and version refusal", { timeout: 10_000 }, async () => {
  await withTransport(async (transport, seen) => {
    const pending = new Map();
    transport.onmessage = (message) => pending.get(message.id)?.(message);
    let id = 0;
    const request = async (method, params = {}, version = "2026-07-28") => {
      const requestId = ++id;
      const response = new Promise((resolve) => pending.set(requestId, resolve));
      await transport.send({ jsonrpc: "2.0", id: requestId, method, params: { ...params, _meta: { [VERSION]: version, [CAPS]: {} } } });
      const answer = await response;
      pending.delete(requestId);
      return answer;
    };
    await transport.start();
    const discovered = await request("server/discover");
    assert.ok(discovered.result, JSON.stringify(discovered));
    assert.equal(discovered.result.resultType, "complete");
    assert.ok(discovered.result.supportedVersions.includes("2026-07-28"));
    const listed = await request("tools/list");
    assert.deepEqual(listed.result?.tools, [tool], JSON.stringify(listed));
    const called = await request("tools/call", { name: tool.name, arguments: { artifact: "modern bytes" } });
    assert.deepEqual(called.result?.content, [{ type: "text", text: "modern bytes" }], JSON.stringify(called));
    assert.equal(called.result._meta["io.modelcontextprotocol/serverInfo"].name, "scvd-mcp-starter");
    assert.equal((await request("tools/list", {}, "2099-01-01")).error.code, -32022);
    assert.deepEqual(seen.map((message) => message.method), ["tools/list", "tools/call"]);
  });
});
