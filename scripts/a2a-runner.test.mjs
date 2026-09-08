import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
process.argv.push("--library");
const source = readFileSync(new URL("../src/store/a2a-runner.md", import.meta.url), "utf8");
const { checkAgent } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const card = { protocolVersion: "0.3.0", name: "Test", description: "Public fixture", url: "https://fixture.example/a2a", version: "1", capabilities: {}, defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"], skills: [] };
test("the actual downloadable bytes validate a card offline", async () => {
  const reading = await checkAgent("https://fixture.example/card", false, async () => Response.json(card));
  assert.equal(reading.counts.fail, 0); assert.equal(reading.counts.not_observed, 0);
});
test("the downloadable runner refuses private URLs before fetch", async () => {
  let calls = 0;
  await assert.rejects(checkAgent("https://127.0.0.1/card", true, async () => { calls++; return Response.json(card); }));
  assert.equal(calls, 0);
});
test("the downloadable runner does not run a task on missing authorization", async () => {
  let posts = 0;
  await assert.rejects(checkAgent("https://fixture.example/card", true, async (url, init) => {
    if (init.method === "POST") posts++;
    return Response.json(url.endsWith("/card") ? card : {});
  }), /authorization_required/);
  assert.equal(posts, 0);
});
test("the command returns a nonzero exit on instrument refusal", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-", "https://127.0.0.1/card"], { input: source, encoding: "utf8" });
  assert.equal(result.status, 2); assert.match(result.stderr, /refused|public|private/i);
});
