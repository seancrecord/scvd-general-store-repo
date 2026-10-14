import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { handle, serve, SERVER_INFO } from "./server.mjs";

const VERSION = "io.modelcontextprotocol/protocolVersion";
const CAPS = "io.modelcontextprotocol/clientCapabilities";
const INFO = "io.modelcontextprotocol/serverInfo";
const modern = (method, params = {}, id = 1) => ({
  jsonrpc: "2.0", id, method,
  params: { ...params, _meta: { [VERSION]: "2026-07-28", [CAPS]: {}, ...params._meta } },
});
const noForward = { fetch: () => { throw new Error("this request must stay local"); } };

test("modern discovery needs no initialization and names the local server", async () => {
  const answer = await handle(modern("server/discover"), noForward);
  assert.ok(answer.result, JSON.stringify(answer));
  assert.deepEqual(answer.result.supportedVersions, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  assert.deepEqual(answer.result.serverInfo, SERVER_INFO);
  assert.deepEqual(answer.result.capabilities, { tools: { listChanged: false } });
  assert.equal(answer.result.resultType, "complete");
  assert.equal(answer.result.cacheScope, "public");
  assert.ok(answer.result.ttlMs > 0);
  assert.deepEqual(answer.result._meta[INFO], SERVER_INFO);
  const ping = await handle(modern("ping"), noForward);
  assert.equal(ping.result.resultType, "complete");
  assert.deepEqual((await handle({ jsonrpc: "2.0", id: 2, method: "ping" })).result, {});
});

test("unsupported versions and malformed modern metadata are refused before forwarding", async () => {
  for (const method of ["server/discover", "ping", "tools/list", "tools/call"]) {
    const answer = await handle(modern(method, { _meta: { [VERSION]: "2099-01-01" } }), noForward);
    assert.equal(answer.error?.code, -32022, JSON.stringify(answer));
    assert.equal(answer.error.data.requested, "2099-01-01");
    assert.ok(answer.error.data.supported.includes("2026-07-28"));
  }
  for (const meta of [{ [VERSION]: "2026-07-28" }, { [VERSION]: 7, [CAPS]: {} }, { [CAPS]: {} }, { [VERSION]: "2026-07-28", [CAPS]: [] }]) {
    const answer = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } }, noForward);
    assert.equal(answer.error?.code, -32602, JSON.stringify(answer));
  }
  assert.equal((await handle({ jsonrpc: "2.0", id: 1, method: "server/discover" }, noForward)).error?.code, -32602);
});

test("legacy clients get their requested supported revision, with the existing fallback", async () => {
  for (const version of ["2025-11-25", "2025-06-18", "2025-03-26", "unknown"]) {
    const answer = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version } });
    assert.equal(answer.result.protocolVersion, version === "unknown" ? "2025-11-25" : version);
    assert.equal(answer.result.resultType, undefined);
  }
});

test("modern forwarding mirrors HTTP routing metadata, preserving arguments and upstream evidence", async () => {
  for (const name of ["verify_scvd_artifact", "café", " white space ", "=?base64?literal?=", "line\nbreak"]) {
    const message = modern("tools/call", { name, arguments: { artifact: { signed: "unchanged" } }, _meta: { "example.org/trace": "kept" } });
    const answer = await handle(message, { fetch: async (_url, init) => {
      const headers = new Headers(init.headers);
      assert.equal(headers.get("MCP-Protocol-Version"), "2026-07-28");
      assert.equal(headers.get("Mcp-Method"), "tools/call");
      const encoded = name === "verify_scvd_artifact" ? name : `=?base64?${Buffer.from(name).toString("base64")}?=`;
      assert.equal(headers.get("Mcp-Name"), encoded);
      assert.deepEqual(JSON.parse(init.body), message);
      return Response.json({ jsonrpc: "2.0", id: message.id, result: { content: [], structuredContent: { signed: "unchanged" }, _meta: { "example.org/evidence": "kept", [INFO]: { name: "upstream" } } } });
    } });
    assert.ok(answer.result, JSON.stringify(answer));
    assert.deepEqual(answer.result.structuredContent, { signed: "unchanged" });
    assert.equal(answer.result._meta["example.org/evidence"], "kept");
    assert.deepEqual(answer.result._meta[INFO], SERVER_INFO);
    assert.equal(answer.result.resultType, "complete");
  }
});

test("upstream errors remain errors and modern list hints do not make legacy lists modern", async () => {
  const error = { code: -32602, message: "bad arguments", data: { field: "artifact" } };
  assert.deepEqual((await handle(modern("tools/call", { name: "verify_scvd_artifact" }), { fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, error }) })).error, error);
  const options = { fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [] } }) };
  const list = await handle(modern("tools/list"), options);
  assert.equal(list.result.cacheScope, "public");
  assert.ok(list.result.ttlMs > 0);
  assert.deepEqual((await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, options)).result, { tools: [] });
});

test("all notifications stay silent; malformed request IDs never start upstream work", async () => {
  assert.equal(await handle({ jsonrpc: "2.0", method: "custom/notice" }, noForward), null);
  for (const id of [null, {}, 1.5]) {
    assert.equal((await handle({ jsonrpc: "2.0", id, method: "tools/list" }, noForward)).error?.code, -32600);
  }
});

test("malformed params and modern initialization are refused locally", async () => {
  for (const params of [[], null, { _meta: [] }]) {
    assert.equal((await handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params }, noForward)).error?.code, -32602);
  }
  assert.equal((await handle(modern("initialize"), noForward)).error?.code, -32601);
});

test("stdio cancellation aborts upstream work and suppresses a late response", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = [];
  output.on("data", (chunk) => replies.push(JSON.parse(String(chunk))));
  let finish;
  let signal;
  const lines = serve({ input, output, fetch: (_url, init) => {
    signal = init.signal;
    return new Promise((resolve) => { finish = resolve; });
  } });
  try {
    input.write(`${JSON.stringify(modern("tools/list", {}, 19))}\n`);
    await setImmediate();
    assert.ok(finish, "request reached upstream");
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 19 } })}\n`);
    const aborted = signal.aborted;
    finish(Response.json({ jsonrpc: "2.0", id: 19, result: { tools: [] } }));
    await setImmediate();
    assert.equal(aborted, true);
    assert.deepEqual(replies, []);
  } finally { lines.close(); input.destroy(); output.destroy(); }
});

test("closing stdin aborts unfinished upstream work without a late reply", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = [];
  output.on("data", (chunk) => replies.push(String(chunk)));
  let finish;
  let signal;
  const lines = serve({ input, output, fetch: (_url, init) => {
    signal = init.signal;
    return new Promise((resolve) => { finish = resolve; });
  } });
  try {
    input.write(`${JSON.stringify(modern("tools/list"))}\n`);
    await setImmediate();
    input.end();
    await setImmediate();
    const aborted = signal.aborted;
    finish(Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
    await setImmediate();
    assert.equal(aborted, true);
    assert.deepEqual(replies, []);
  } finally { lines.close(); input.destroy(); output.destroy(); }
});

test("stdio keeps the negotiated legacy version separate from modern requests", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const versions = [];
  const lines = serve({ input, output, fetch: async (_url, init) => {
    versions.push(new Headers(init.headers).get("MCP-Protocol-Version"));
    return Response.json({ jsonrpc: "2.0", id: JSON.parse(init.body).id, result: { tools: [] } });
  } });
  const send = async (message) => { input.write(`${JSON.stringify(message)}\n`); await setImmediate(); };
  try {
    await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await send(modern("tools/list", {}, 3));
    await send({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    assert.deepEqual(versions, ["2025-06-18", "2026-07-28", "2025-06-18"]);
  } finally { lines.close(); input.destroy(); output.destroy(); }
});

test("duplicate in-flight IDs do not replace the request cancellation target", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const replies = [];
  output.on("data", (chunk) => replies.push(JSON.parse(String(chunk))));
  const calls = [];
  const lines = serve({ input, output, fetch: (_url, init) => new Promise((finish) => calls.push({ finish, signal: init.signal })) });
  try {
    input.write(`${JSON.stringify(modern("tools/list"))}\n`);
    input.write(`${JSON.stringify(modern("tools/list"))}\n`);
    await setImmediate();
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } })}\n`);
    for (const call of calls) call.finish(Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
    await setImmediate();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].error?.code, -32600);
  } finally { lines.close(); input.destroy(); output.destroy(); }
});
