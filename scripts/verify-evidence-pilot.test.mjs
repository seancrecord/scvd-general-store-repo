import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyPilotExport } from "./verify-evidence-pilot.mjs";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
function fixture() {
  const report = { type: "scvd.endpoint-evidence-report.v1", watch_id: "test-only", observations: [{ at: "2026-10-07T00:00:00Z" }] };
  const signed_payload = JSON.stringify(report);
  return { report, signed_payload, public_key: key, signature: sign(null, Buffer.from(signed_payload), privateKey).toString("hex"), sha256: createHash("sha256").update(signed_payload).digest("hex") };
}
test("verifies a known key and refuses a supplied substitute", () => {
  assert.equal(verifyPilotExport(fixture(), key).verified, true);
  assert.throws(() => verifyPilotExport(fixture(), "00".repeat(32)), /Untrusted/);
});
test("rejects changed displayed content, deleted rows and rehashed signed content", () => {
  const edited = fixture(); edited.report.observations[0].at = "edited";
  assert.throws(() => verifyPilotExport(edited, key), /differs/);
  const deleted = fixture(); deleted.report.observations = [];
  assert.throws(() => verifyPilotExport(deleted, key), /differs/);
  const rehashed = fixture(); rehashed.signed_payload += " ";
  rehashed.sha256 = createHash("sha256").update(rehashed.signed_payload).digest("hex");
  assert.throws(() => verifyPilotExport(rehashed, key), /Signature/);
});
