import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkA2a } from "./a2a-live.mjs";

const captured = JSON.parse(readFileSync(new URL("../research/a2a-2026-09-06/live-probes.json", import.meta.url)));
const card = captured.rows.find((r) => r.path === "/.well-known/agent-card.json").body;
const brokenTask = captured.rows.find((r) => "officialTaskSchema" in r).body.result;

test("the live gate can pass a valid response and retrieval/cancellation lifecycle", async () => {
  const task = { ...brokenTask, contextId: "fixture-context" };
  const report = await checkA2a("https://scvd.store", async (_url, options) => {
    if (options.method === "GET") return Response.json(card);
    const call = JSON.parse(options.body);
    const respond = (body) => Response.json({ jsonrpc: "2.0", id: call.id, ...body });
    if (call.method === "message/send") return call.params.message.parts.includes(null) ? respond({ error: { code: -32602 } }) : respond({ result: task });
    if (call.params.id !== task.id) return respond({ error: { code: -32001 } });
    return call.method === "tasks/get" ? respond({ result: task }) : respond({ error: { code: -32002 } });
  });
  assert.equal(report.pass, true, JSON.stringify(report.checks));
});

test("the live gate rejects the real captured defects even though the external CLI passed", async () => {
  const report = await checkA2a("https://scvd.store", async (url, options) => {
    if (options.method === "GET") return Response.json(card);
    const call = JSON.parse(options.body);
    if (call.method !== "message/send") return Response.json({ jsonrpc: "2.0", id: call.id, error: { code: -32001 } });
    if (call.params.message.parts[0] === null) return Response.json({ error: "generic failure" }, { status: 500 });
    return Response.json({ jsonrpc: "2.0", id: call.id, result: brokenTask });
  });
  assert.equal(report.pass, false);
  for (const id of ["successful-task-schema", "tasks/get", "tasks/cancel", "null-part", "invalid-trailing-part"]) {
    assert.equal(report.checks.find((c) => c.id === id)?.status, "fail", id);
  }
});

test("unreachable or oversized responses fail the instrument instead of passing an empty check set", async () => {
  for (const fetcher of [async () => { throw new Error("unreachable"); }, async () => new Response("x".repeat(2 * 1024 * 1024 + 1))]) {
    const report = await checkA2a("https://scvd.store", fetcher);
    assert.equal(report.pass, false);
    assert.equal(report.checks.at(-1).id, "probe-completed");
  }
});

test("a card cannot redirect the live gate to somebody else's task endpoint", async () => {
  let posts = 0;
  const report = await checkA2a("https://scvd.store", async (_url, options) => {
    if (options.method === "POST") posts++;
    return Response.json({ ...card, url: "https://other.example/a2a" });
  });
  assert.equal(report.pass, false);
  assert.equal(posts, 0);
});
