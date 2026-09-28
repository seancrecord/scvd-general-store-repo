import assert from "node:assert/strict";
import test from "node:test";
import * as client from "./x402-preflight.js";
import { readFileSync, readdirSync } from "node:fs";

const reports = readdirSync(new URL("./fixtures/inspection/", import.meta.url)).map((file) => ({
  name: file.replace(/\.json$/, ""), report: JSON.parse(readFileSync(new URL(`./fixtures/inspection/${file}`, import.meta.url), "utf8")),
}));

test("inspection is an additive library workflow", () => {
  for (const name of ["inspectOne", "inspectionOf", "inspectionExitCodeFor", "renderInspectionLines"]) {
    assert.equal(typeof client[name], "function", name);
  }
});

for (const { name, report } of reports) {
  test(`library retains the hosted ${name} observation without making its own probe`, async () => {
    let calls = 0;
    const result = await client.inspectOne(report.inspection.subject_url, { fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://scvd.store/api/preflight/v2");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { url: report.inspection.subject_url });
      assert.equal(new Headers(init.headers).has("payment-signature"), false);
      return Response.json(report);
    } });
    assert.equal(calls, 1);
    assert.deepEqual(result.body, report);
    assert.deepEqual(result.inspection, report.inspection);
    assert.equal(result.inspectionExitCode, report.inspection.reachability.state === "responded" ? 0 : 3);
    assert.match(client.renderInspectionLines(result).join("\n"), /not_checked/);
    if (name === "mpp-only") {
      assert.equal(result.inspectionExitCode, 0);
      assert.equal(client.exitCodeFor([result]), 1, "the existing x402 deploy gate is unchanged");
    }
  });
}

test("older, malformed and future reports cannot manufacture an inspection", () => {
  const report = reports.find((r) => r.name === "mpp-only").report;
  const changes = [
    (r) => delete r.inspection,
    (r) => r.inspection.version = "future",
    (r) => r.inspection.protocols.observed = ["mpp", "mpp"],
    (r) => r.inspection.reachability.http_status = null,
    (r) => r.inspection.signatures.state = "valid",
    (r) => r.inspection.terms.mpp.omitted++,
    (r) => r.inspection.structure.mpp.checked = -1,
    (r) => r.inspection.gaps = null,
  ];
  for (const mutate of changes) {
    const changed = structuredClone(report); mutate(changed);
    assert.equal(client.inspectionOf(changed), null);
    assert.equal(client.inspectionExitCodeFor({ status: 200, body: changed }), 3);
    assert.match(client.renderInspectionLines({ status: 200, body: changed }).join(" "), /unavailable/);
  }
  for (const [status, exit] of [[400, 2], [403, 2], [429, 3], [500, 3], [null, 3]]) {
    assert.equal(client.inspectionExitCodeFor({ status, body: null }), exit);
  }
});

test("the standalone CLI vendors the exact shared reader and safely quotes term text", () => {
  assert.equal(readFileSync(new URL("./inspection.js", import.meta.url), "utf8"), readFileSync(new URL("../cli/inspection.js", import.meta.url), "utf8"));
  const report = structuredClone(reports.find((r) => r.name === "mpp-only").report);
  report.inspection.terms.mpp.entries[0].realm = "untrusted\u001b[2J\ntext";
  report.inspection.unperformed.push("untrusted\u001b[2J");
  const text = client.renderInspectionLines({ status: 200, body: report }).join("\n");
  assert.ok(!text.includes("\u001b"));
  assert.match(text, /\\u001b/);
});

test("additive structural fields cannot crash or inject text into the v1 renderer", () => {
  const report = structuredClone(reports.find((r) => r.name === "mpp-only").report);
  const original = client.renderInspectionLines({ status: 200, body: report });
  report.inspection.structure.future = null;
  report.inspection.structure["untrusted\u001b[2J"] = { battery: "new", checked: 0, failed: [] };
  assert.notEqual(client.inspectionOf(report), null);
  assert.deepEqual(client.renderInspectionLines({ status: 200, body: report }), original);
});

test("x402 term values match the public string-or-null declaration", () => {
  const report = structuredClone(reports.find((r) => r.name === "x402-only").report);
  report.inspection.terms.x402.entries[0].amount = 1000;
  assert.equal(client.inspectionOf(report), null);
  assert.equal(client.inspectionExitCodeFor({ status: 200, body: report }), 3);
  const mpp = reports.find((r) => r.name === "mpp-only").report;
  assert.equal(typeof mpp.inspection.terms.mpp.entries[0].chain_id, "number");
  assert.notEqual(client.inspectionOf(mpp), null);
});
