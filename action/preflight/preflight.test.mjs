import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * THE ACTION, TESTED AGAINST A STORE THAT IS NOT THE STORE — the same
 * discipline as the CLI's tests. A local server plays scvd.store and
 * serves the refusals on purpose, because a deploy gate's interesting
 * behaviour is all in what it does when the answer is no: the exit
 * code the job branches on, the verdict it refuses to over-read, the
 * summary that names the failed check instead of a bare red.
 */

const SCRIPT = fileURLToPath(new URL("./preflight.mjs", import.meta.url));

function report(verdict, checks = [], advisories = []) {
  return {
    verdict,
    checks: checks.length > 0 ? checks : [{ name: "status-402", ok: verdict !== "not_ready", detail: verdict === "not_ready" ? "answered 200" : "answered 402" }],
    advisories,
    single_probe_note: "One request, one moment.",
  };
}

/** Run the action's script against a one-request server and collect everything. */
async function run(env, handler) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const answer = handler({ url: request.url, body: body ? JSON.parse(body) : undefined, headers: request.headers });
      response.writeHead(answer.status ?? 200, { "Content-Type": "application/json", ...(answer.headers ?? {}) });
      response.end(JSON.stringify(answer.json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "scvd-action-"));
  const files = {
    output: join(dir, "output.txt"),
    summary: join(dir, "summary.md"),
    report: join(dir, "report.json"),
  };
  try {
    const result = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [SCRIPT],
        {
          env: {
            PATH: process.env.PATH,
            SCVD_PREFLIGHT_BASE: base,
            SCVD_PREFLIGHT_REPORT: files.report,
            GITHUB_OUTPUT: files.output,
            GITHUB_STEP_SUMMARY: files.summary,
            ...env,
          },
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }),
      );
    });
    return {
      ...result,
      output: existsSync(files.output) ? readFileSync(files.output, "utf8") : "",
      summary: existsSync(files.summary) ? readFileSync(files.summary, "utf8") : "",
      report: existsSync(files.report) ? JSON.parse(readFileSync(files.report, "utf8")) : null,
    };
  } finally {
    server.close();
  }
}

test("a ready door exits 0, names its checks, writes the report and the outputs", async () => {
  const seen = [];
  const result = await run({ SCVD_PREFLIGHT_URLS: "https://shop.example/api/buy/thing" }, (request) => {
    seen.push(request);
    return { json: report("ready") };
  });
  assert.equal(result.code, 0);
  assert.equal(seen.length, 1, "one probe per door");
  assert.equal(seen[0].url, "/api/preflight/v2");
  assert.equal(seen[0].body.url, "https://shop.example/api/buy/thing");
  assert.match(seen[0].headers["user-agent"], /scvd-preflight-action/);
  assert.match(result.stdout, /verdict: ready/);
  assert.match(result.stdout, /ok {2}.*status-402/);
  assert.equal(result.report.doors[0].outcome, "ready");
  assert.equal(result.report.doors[0].report.verdict, "ready");
  assert.match(result.output, /worst<<[^\n]*\nready\n/);
  assert.match(result.output, /"https:\/\/shop.example\/api\/buy\/thing":"ready"/);
  assert.match(result.summary, /\| https:\/\/shop.example\/api\/buy\/thing \| \*\*ready\*\* \|/);
  assert.match(result.summary, /not an uptime claim/);
});

test("a not_ready door exits 1 and the summary names the failed check", async () => {
  const result = await run({ SCVD_PREFLIGHT_URLS: "https://shop.example/api/buy/thing" }, () => ({
    json: report("not_ready", [
      { name: "status-402", ok: false, detail: "answered 200" },
      { name: "accepts", ok: true, detail: "one accept" },
    ]),
  }));
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL {2}status-402/);
  assert.match(result.summary, /`status-402`/);
  assert.match(result.output, /worst<<[^\n]*\nnot_ready\n/);
});

test("unreachable exits 0 by default, and says why in the summary", async () => {
  const result = await run({ SCVD_PREFLIGHT_URLS: "https://gone.example/api/x" }, () => ({
    json: report("unreachable", [{ name: "reachable", ok: false, detail: "does not prove the endpoint is down" }]),
  }));
  assert.equal(result.code, 0);
  assert.match(result.summary, /`unreachable` does not fail this job/);
  assert.match(result.summary, /not a finding about the endpoint/);
});

test("unreachable exits 1 only when the workflow chose it in writing", async () => {
  const result = await run(
    { SCVD_PREFLIGHT_URLS: "https://gone.example/api/x", SCVD_PREFLIGHT_FAIL_ON: "not_ready,unreachable" },
    () => ({ json: report("unreachable") }),
  );
  assert.equal(result.code, 1);
  assert.match(result.summary, /This workflow chose to fail on `unreachable`/);
});

test("several doors: one probe each, the worst verdict wins, every one in the report", async () => {
  const answers = { "https://a.example/x": "ready", "https://b.example/x": "not_ready", "https://c.example/x": "unreachable" };
  const seen = [];
  const result = await run({ SCVD_PREFLIGHT_URLS: Object.keys(answers).join("\n") }, (request) => {
    seen.push(request.body.url);
    return { json: report(answers[request.body.url]) };
  });
  assert.equal(result.code, 1);
  assert.deepEqual(seen, Object.keys(answers));
  assert.equal(result.report.doors.length, 3);
  assert.match(result.output, /worst<<[^\n]*\nnot_ready\n/);
});

test("a URL the store refuses before probing exits 2: nothing was probed, so nothing passed", async () => {
  const result = await run({ SCVD_PREFLIGHT_URLS: "http://plain.example/x" }, () => ({
    status: 400,
    json: { error: "https only. A payment endpoint on plain http is already failing a check no probe needs to run." },
  }));
  assert.equal(result.code, 2);
  assert.match(result.stdout, /https only/);
  assert.match(result.summary, /\*\*refused\*\*/);
});

test("the store's probe budget (429) exits 3 and names the wait", async () => {
  const result = await run({ SCVD_PREFLIGHT_URLS: "https://shop.example/x" }, () => ({
    status: 429,
    headers: { "retry-after": "17" },
    json: { error: "budget" },
  }));
  assert.equal(result.code, 3);
  assert.match(result.stdout, /retry after 17s/);
});

test("no doors named exits 2 with the shape of the input", async () => {
  const result = await run({ SCVD_PREFLIGHT_URLS: "" }, () => ({ json: {} }));
  assert.equal(result.code, 2);
  assert.match(result.stdout, /one per line/);
});

test("the action manifest runs this file and nothing else, with no dependency step", () => {
  const manifest = readFileSync(fileURLToPath(new URL("./action.yml", import.meta.url)), "utf8");
  assert.match(manifest, /using: "composite"/);
  assert.match(manifest, /node "\$GITHUB_ACTION_PATH\/preflight.mjs"/);
  assert.doesNotMatch(manifest, /npm (ci|install)/);
  assert.doesNotMatch(manifest, /setup-node/);
  // The default fails only on not_ready — the CLI's law, kept.
  assert.match(manifest, /default: "not_ready"/);
});
