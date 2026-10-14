import { createHash, createPublicKey, verify } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Offline verification of the signed bytes and the report displayed beside
 * them. The trusted key comes from the reviewer, never from the export alone.
 * This deliberately does not share SCVD's serializer or signing library.
 */
export function verifyPilotExport(artifact, trustedKey) {
  if (!/^[a-f0-9]{64}$/i.test(trustedKey ?? "") || artifact.public_key !== trustedKey) throw new Error("Untrusted report key");
  if (artifact.report?.type !== "scvd.endpoint-evidence-report.v1" || typeof artifact.signed_payload !== "string" ||
      !/^[a-f0-9]{128}$/i.test(artifact.signature ?? "")) throw new Error("Invalid export");
  const bytes = Buffer.from(artifact.signed_payload, "utf8");
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(trustedKey, "hex")]), format: "der", type: "spki" });
  if (!verify(null, bytes, publicKey, Buffer.from(artifact.signature, "hex"))) throw new Error("Signature mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("Digest mismatch");
  if (!isDeepStrictEqual(JSON.parse(artifact.signed_payload), artifact.report)) throw new Error("Displayed report differs from signed payload");
  return { verified: true, watch_id: artifact.report.watch_id,
    scope: "The trusted key signed these bytes and they describe the attached report. This does not prove complete observations, legal compliance, external timestamping or the truth of the issuer's account." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error("Usage: node scripts/verify-evidence-pilot.mjs report.json TRUSTED_SCVd_PUBLIC_KEY_HEX");
    console.log(JSON.stringify(verifyPilotExport(JSON.parse(readFileSync(process.argv[2], "utf8")), process.argv[3]), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1;
  }
}
