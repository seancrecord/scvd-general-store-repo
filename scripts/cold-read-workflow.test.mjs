import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// Execute the workflow's actual acquisition step. Two runs can both look
// valid while the second has warmed the first run's cold isolates away.
const workflow = readFileSync(new URL("../.github/workflows/cold-read.yml", import.meta.url), "utf8");
const step = workflow.split("- name: Read the door cold, then warm, then the shelf at once")[1]
  ?.split("- name: Keep the reading")[0];
assert.ok(step, "the acquisition step must remain covered");
const command = step.split("run: |\n")[1].split("\n")
  .filter(line => line.startsWith("          ")).map(line => line.slice(10)).join("\n");

function run(failed = false) {
  const dir = mkdtempSync(join(tmpdir(), "scvd-cold-workflow-"));
  symlinkSync(fileURLToPath(new URL(".", import.meta.url)), join(dir, "scripts"), "dir");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { "cold:read": "node scripts/cold-read.mjs" } }));
  const preload = join(dir, "network-fixture.mjs");
  writeFileSync(preload, `
    import https from 'node:https';
    import { EventEmitter } from 'node:events';
    import { appendFileSync } from 'node:fs';
    const log = ${JSON.stringify(join(dir, "requests.jsonl"))};
    let count = 0;
    https.request = (url, options, callback) => {
      if (new URL(url).hostname !== 'cold-fixture.invalid') throw new Error('unexpected network target');
      appendFileSync(log, JSON.stringify({kind:'knock', url}) + '\\n');
      const request = new EventEmitter();
      request.end = () => queueMicrotask(() => {
        if (${failed}) { request.emit('error', new Error('fixture unreachable')); return; }
        const response = new EventEmitter();
        response.statusCode = 402;
        response.headers = {'server-timing': ++count === 1 ? 'isolate;desc=cold, age;dur=0, req;dur=3' : 'isolate;desc=warm, age;dur=1, req;dur=0'};
        response.resume = () => queueMicrotask(() => response.emit('end'));
        callback(response);
      });
      return request;
    };
    globalThis.fetch = async url => {
      if (url !== 'https://cold-fixture.invalid/.well-known/x402') throw new Error('unexpected discovery target');
      appendFileSync(log, JSON.stringify({kind:'discovery', url}) + '\\n');
      return Response.json({resources:[{resource:'https://cold-fixture.invalid/api/buy/hello'}]});
    };
  `);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", command], {
    cwd: dir, encoding: "utf8", timeout: 15_000,
    env: { PATH: process.env.PATH, NODE_OPTIONS: `--import=${preload}`,
      URL: "https://cold-fixture.invalid/api/buy/hello", SINCE: "2026-09-05T19:55:00Z" },
  });
  return { dir, result };
}

test("workflow text and parseable JSON preserve the same first cold knock", () => {
  const { dir, result } = run();
  try {
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(readFileSync(join(dir, "cold-reading.json"), "utf8"));
    const text = readFileSync(join(dir, "cold-reading.txt"), "utf8");
    const calls = readFileSync(join(dir, "requests.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls.filter(c => c.kind === "discovery").length, 1);
    const door = json.doors[0];
    assert.equal(door.first_isolate, "cold");
    assert.equal(door.knocks.length, 7);
    assert.equal(door.warm_knocks, 6);
    assert.equal(json.since, "2026-09-05T19:55:00Z");
    assert.equal(calls.filter(c => c.kind === "knock").length, door.knocks.length + json.burst.readings.length);
    assert.ok(text.includes(`cold read, ${json.read_at}`));
    assert.match(text, /first knock\s+\d+ ms\s+cold/);
    assert.ok(text.includes(`warm (6)`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an unreachable first door retains failure evidence and the workflow fails", () => {
  const { dir, result } = run(true);
  try {
    assert.equal(result.status, 2, result.stderr);
    const json = JSON.parse(readFileSync(join(dir, "cold-reading.json"), "utf8"));
    assert.equal(json.doors[0].unreachable, "fixture unreachable");
    assert.equal(json.doors[0].coverage.answered, 0);
    assert.equal(json.doors[0].cold_penalty_ms, null);
    assert.equal(json.burst, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
