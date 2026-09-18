// Copy beside a standalone npm install of the packed verifier; compile with
// tsc --strict --module NodeNext --moduleResolution NodeNext --target ES2022.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  verifyReceipt, verifyArtifact, formatResult,
  type VerificationStatus, type VerificationReasonCode,
} from "x402-verify";

const entry = import.meta.resolve("x402-verify");
interface ReceiptFixture { receipt: string; publicKeyHex: string }
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, entry), "utf8")) as ReceiptFixture;
const receipt = fixture("receipt-valid");
const wrong = fixture("receipt-wrong-key");
const [head, body, signature] = receipt.receipt.split(".");
const header = JSON.parse(Buffer.from(head, "base64url").toString()) as Record<string, unknown>;
const unsupported = [Buffer.from(JSON.stringify({ ...header, alg: "ES256" })).toString("base64url"), body, signature].join(".");

// Exhaustiveness here is checked against the shipped declarations, outside
// the repository's module aliases and Worker ambient types.
function classify(status: VerificationStatus): string {
  switch (status) {
    case "valid": return "checked";
    case "invalid": return "failed";
    case "unsupported": return "outside support";
    case "inconclusive": return "incomplete";
    default: { const never: never = status; return never; }
  }
}
const results = [
  await verifyReceipt({ receipt: receipt.receipt, publicKey: receipt.publicKeyHex }),
  await verifyReceipt({ receipt: wrong.receipt, publicKey: wrong.publicKeyHex }),
  await verifyReceipt({ receipt: unsupported, publicKey: receipt.publicKeyHex }),
  await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, {
    fetch: async () => { throw new Error("controlled missing evidence"); },
  }),
];
assert.deepEqual(results.map((result) => result.valid), [true, false, false, false]);
assert.deepEqual(results.map((result) => result.status), ["valid", "invalid", "unsupported", "inconclusive"]);
for (const result of results) {
  const reasons: VerificationReasonCode[] = result.reasonCodes;
  for (const check of result.checks) {
    if (check.status === "unobserved") assert.equal(check.ok, false);
  }
  console.log(JSON.stringify({ status: result.status, valid: result.valid, reasons, decision: classify(result.status) }));
}
const raw = await verifyArtifact(receipt.receipt, { publicKey: receipt.publicKeyHex });
assert.equal(raw.ok, true);
assert.match(formatResult(raw), /VERIFIED/);
