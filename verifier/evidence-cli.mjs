#!/usr/bin/env node
import { open, mkdir, access, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { webcrypto } from "node:crypto";
import { createEvidenceBundle, verifyEvidenceBundle, detachedTimestamp, EVIDENCE_BUNDLE_MAX_BYTES, EVIDENCE_BUNDLE_HARD_MAX_BYTES, evidenceByteLimit } from "./evidence-bundle.js";

// Node 18 exposes WebCrypto through node:crypto even when the global is disabled.
globalThis.crypto ??= webcrypto;

const HELP = `scvd-evidence — free export and offline verification
  export <verify-response-or-corpus-snapshot-url> --out <new-directory> [--evidence <local-file> ...]
  verify <bundle.json> --public-key <independently-trusted-public-key-hex>
  Both commands: [--max-bytes <integer>]

Default input/output limit: ${EVIDENCE_BUNDLE_MAX_BYTES} bytes; explicit maximum:
${EVIDENCE_BUNDLE_HARD_MAX_BYTES} bytes. Bundles include unsigned context and can
be several times larger than the source. Large corpus example: --max-bytes 33554432.
Start with /corpus/index.json, follow next, then export each snapshot URL.
This command checks one snapshot's signature, not continuity of the corpus.

Export reads only the URL you name and its origin's public key document.
No credentials, payments or private keys. Evidence files must match a hash
inside the signed payload. Existing directories are never overwritten.
Verify makes no network requests. The embedded key cannot establish identity.
Exit: 0 signature/bindings valid; 1 invalid or missing trusted key;
3 valid signature but missing linked evidence; 2 command/read failure.
Bitcoin timestamps remain unverified by this command. Where a proof exists,
export creates payload.json.ots: use an independent ots verifier with trusted
Bitcoin headers to verify it. Context and filenames are unsigned metadata.
`;

async function localBytes(path, maxBytes) {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error("file_not_regular_or_too_large");
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size || offset > maxBytes) throw new Error("file_changed_or_too_large");
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}
async function remoteJson(url, maxBytes = EVIDENCE_BUNDLE_MAX_BYTES) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "scvd-evidence-export" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("source_unavailable");
  const reader = response.body.getReader();
  let length = 0; const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new Error("source_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function main(args) {
  if (!args.length || args.includes("--help")) { console.log(HELP); return; }
  const [command, input, ...rest] = args;
  const flags = {}; const evidence = [];
  for (let i = 0; i < rest.length; i += 2) {
    const [key, value] = [rest[i], rest[i + 1]];
    if (!["--out", "--public-key", "--evidence", "--max-bytes"].includes(key) || !value || (key !== "--evidence" && flags[key])) throw new Error("invalid_arguments");
    if (key === "--evidence") evidence.push(value); else flags[key] = value;
  }
  if (flags["--max-bytes"] && !/^\d+$/.test(flags["--max-bytes"])) throw new Error("invalid_byte_limit");
  const maxBytes = evidenceByteLimit(flags["--max-bytes"] === undefined ? undefined : Number(flags["--max-bytes"]));
  if (!input) throw new Error("missing_input");
  if (command === "verify") {
    if (flags["--out"] || evidence.length) throw new Error("invalid_arguments");
    const result = await verifyEvidenceBundle(JSON.parse((await localBytes(input, maxBytes)).toString("utf8")), { publicKey: flags["--public-key"], maxBytes });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = !result.valid ? 1 : result.evidence_complete ? 0 : 3;
    return;
  }
  if (command !== "export" || !flags["--out"] || flags["--public-key"]) throw new Error("invalid_arguments");
  const source = new URL(input);
  const local = source.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(source.hostname);
  if ((!local && source.protocol !== "https:") || source.username || source.password || source.hash) throw new Error("invalid_source_url");
  try { await access(flags["--out"]); throw new Error("output_exists"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const response = await remoteJson(source, maxBytes);
  let issuerDocument = null;
  try { issuerDocument = await remoteJson(new URL("/.well-known/scvd-signing-key", source)); }
  catch { /* The absence is preserved; export never makes this snapshot a trust root. */ }
  const attachments = [];
  let attachmentBytes = 0;
  for (const path of evidence) {
    const bytes = await localBytes(path, maxBytes);
    attachmentBytes += bytes.length;
    if (attachmentBytes > maxBytes) throw new Error("attachments_too_large");
    attachments.push({ name: basename(path), bytes });
  }
  const bundle = await createEvidenceBundle(response, { sourceUrl: source.href, capturedAt: new Date().toISOString(), issuerDocument, attachments, maxBytes });
  await mkdir(flags["--out"]); // Exclusive directory creation also closes the preflight race.
  const out = flags["--out"];
  // Use the same encoding measured by the bundle's byte limit.
  await writeFile(join(out, "bundle.json"), JSON.stringify(bundle), { flag: "wx", mode: 0o600 });
  await writeFile(join(out, "payload.json"), bundle.artifact.signed_payload, { flag: "wx", mode: 0o600 });
  if (bundle.timestamp) await writeFile(join(out, "payload.json.ots"), detachedTimestamp(bundle.timestamp.digest, bundle.timestamp.proof_base64), { flag: "wx", mode: 0o600 });
  await writeFile(join(out, "README.txt"), HELP, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ exported: true, directory: out, signature_verified: false, timestamp_verified: false, issuer_snapshot_present: issuerDocument !== null }));
}
main(process.argv.slice(2)).catch(() => { console.error("Evidence command failed: check arguments, readable bounded input and a new output directory. Nothing was paid. Use --help."); process.exitCode = 2; });
