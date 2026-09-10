import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(mode, json = true) {
  const result = spawnSync(process.execPath, ["--import", "./scripts/fixtures/bazaar-validator-fetch.mjs", "./scripts/bazaar-validate.mjs", ...(json ? ["--json"] : [])], { cwd: root, env: { ...process.env, SCVD_BAZAAR_TEST_MODE: mode, CDP_API_KEY_ID: "", CDP_API_KEY_SECRET: "" }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return json ? JSON.parse(result.stdout).results[0] : result.stdout;
}
test("uses the documented public request and records acceptance without inventing index presence", () => {
  const row = run("accepted"); assert.equal(row.state, "accepted"); assert.equal(row.index, null);
});
test("retains the validator's concrete rejection reason", () => {
  const row = run("rejected"); assert.equal(row.state, "rejected"); assert.match(row.detail, /pattern must be a valid regex/);
});
test("an unavailable probe is not a metadata rejection", () => { assert.equal(run("failure").state, "probe_failed"); });
test("a missing or contradictory verdict stays unreadable", () => {
  assert.equal(run("unknown").state, "unreadable"); assert.equal(run("contradictory").state, "unreadable");
});
test("an accepted unindexed endpoint does not imply it never sold", () => {
  const output = run("accepted", false); assert.doesNotMatch(output, /has not sold|SETTLEMENT gap|six-purchase/); assert.match(output, /existing.*receipts/i);
});
