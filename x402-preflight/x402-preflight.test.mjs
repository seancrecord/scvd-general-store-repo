import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EXIT, exitCodeFor, failedChecks, preflightOne, remediation, renderLines, worstOutcome } from "./x402-preflight.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")).report;

async function withStore(handler, fn) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const answer = handler({ url: request.url, body: body ? JSON.parse(body) : undefined, headers: request.headers });
      response.writeHead(answer.status ?? 200, { "content-type": "application/json", ...(answer.headers ?? {}) });
      response.end(JSON.stringify(answer.json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("the recorded reports are read as the store served them: verdict, failed checks, remediation", () => {
  const ready = fixture("ready-would-sign");
  assert.equal(ready.verdict, "ready");
  assert.deepEqual(failedChecks(ready), []);
  const empty = fixture("accepts-empty");
  assert.equal(empty.verdict, "not_ready");
  assert.ok(failedChecks(empty).includes("accepts"));
  assert.ok(remediation(empty).some((row) => row.defect_class === "unsignable-offer" && row.buyer && row.operator));
  assert.equal(fixture("unreachable").verdict, "unreachable");
});

test("one probe, one POST, the body kept whole; 429 and refusals are named, never thrown", async () => {
  await withStore(({ url, body, headers }) => {
    assert.equal(url, "/api/preflight/v2");
    assert.equal(headers["content-type"], "application/json");
    assert.deepEqual(body, { url: "https://door.example/paid" });
    return { json: fixture("accepts-empty") };
  }, async (base) => {
    const result = await preflightOne("https://door.example/paid", { base });
    assert.equal(result.outcome, "not_ready");
    assert.equal(result.body.verdict, "not_ready");
    assert.ok(renderLines(result).some((line) => /FIX {3}accepts → unsignable-offer/.test(line)));
  });
  await withStore(() => ({ status: 429, headers: { "retry-after": "12" }, json: { error: "budget spent" } }), async (base) => {
    const result = await preflightOne("https://door.example/paid", { base });
    assert.equal(result.outcome, "store_unreachable");
    assert.match(result.detail, /retry after 12s/);
  });
  await withStore(() => ({ status: 400, json: { error: "That is not a parseable URL.", code: "url_unparseable", next_action: "Fix the string." } }), async (base) => {
    const result = await preflightOne("not a url", { base });
    assert.equal(result.outcome, "refused");
    assert.equal(result.next_action, "Fix the string.");
  });
  const dead = await preflightOne("https://door.example/paid", { base: "http://127.0.0.1:9", timeoutMs: 2000 });
  assert.equal(dead.outcome, "store_unreachable");
});

test("the exit law and the worst outcome", () => {
  const r = (outcome) => ({ url: "u", outcome, detail: null, status: 200, body: null });
  assert.equal(exitCodeFor([r("ready")]), EXIT.ok);
  assert.equal(exitCodeFor([r("ready"), r("not_ready")]), EXIT.verdictNegative);
  assert.equal(exitCodeFor([r("unreachable")]), EXIT.ok);
  assert.equal(exitCodeFor([r("unreachable")], ["not_ready", "unreachable"]), EXIT.verdictNegative);
  assert.equal(exitCodeFor([r("refused"), r("not_ready")]), EXIT.usage);
  assert.equal(exitCodeFor([r("store_unreachable")]), EXIT.unreachable);
  assert.equal(worstOutcome([r("ready"), r("unreachable"), r("refused")]), "unreachable");
  assert.equal(worstOutcome([r("store_unreachable"), r("not_ready")]), "not_ready");
});

test("the command exits per the law and prints the store's lines", async () => {
  await withStore(() => ({ json: fixture("accepts-empty") }), async (base) => {
    const bin = fileURLToPath(new URL("./bin.mjs", import.meta.url));
    const { code, stdout } = await new Promise((resolve) => {
      execFile(process.execPath, [bin, "https://door.example/paid", "--base", base], (error, out) => resolve({ code: error ? error.code : 0, stdout: out }));
    });
    assert.equal(code, 1);
    assert.match(stdout, /FAIL {2}accepts/);
    assert.match(stdout, /buyer: {4}/);
  });
});
