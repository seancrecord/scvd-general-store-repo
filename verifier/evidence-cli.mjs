#!/usr/bin/env node
import { open, mkdir, access, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { webcrypto } from "node:crypto";
import { createEvidenceBundle, verifyEvidenceBundle, detachedTimestamp, evidenceDigest, EVIDENCE_BUNDLE_MAX_BYTES, EVIDENCE_BUNDLE_HARD_MAX_BYTES, evidenceByteLimit } from "./evidence-bundle.js";
import { EVIDENCE_REPORT_FORMAT, CHALLENGE_HEADERS_MAX_BYTES, readPaymentChallenge, renderEvidenceReport, checkDraftIdentifiers, EVIDENCE_REPORT_MAX_BYTES } from "./evidence-report.js";
import { CAPABILITIES, runtimeCapabilities } from "./x402-verify.js";

// Node 18 exposes WebCrypto through node:crypto even when the global is disabled.
globalThis.crypto ??= webcrypto;
const SUBJECT_OBSERVATIONS_MAX_BYTES = 32768;
const SOURCE_LINKS_MAX_BYTES = 32768;

const HELP = `scvd-evidence — free export and offline verification
  sources <saved-corpus-index-or-host-history.json> [--subject <exact-endpoint-url>]
  export <verify-response-or-corpus-snapshot-url> --out <new-directory> [--evidence <local-file> ...]
  verify <bundle.json> --public-key <independently-trusted-public-key-hex>
  verify-source <saved-response.json> --public-key <independently-trusted-public-key-hex>
    [--evidence <local-file> ...] [--subject <exact-endpoint-url>]
    [--format json|markdown] [--report-out <new-report.md>]
    [--challenge-headers <saved-HTTP-headers.txt>] [--check-identifiers <saved-draft.md>]
  capabilities
  All commands but capabilities: [--max-bytes <integer>]

Default input/output limit: ${EVIDENCE_BUNDLE_MAX_BYTES} bytes; explicit maximum:
${EVIDENCE_BUNDLE_HARD_MAX_BYTES} bytes. Bundles include unsigned context and can
be several times larger than the source. Large corpus example: --max-bytes 33554432.
Start with /corpus/index.json, follow next, then export each snapshot URL.
This command checks one snapshot's signature, not continuity of the corpus.

sources reads a saved discovery response offline and writes no files. Index
entries name snapshots, not merchants; a missing merchant name is not evidence
of absence. Host history requires --subject and selects only exact URL hints.
Candidate links are untrusted and unverified: decide which original to retain,
then verify-source with a separately established key and the exact --subject.
No linked URL is fetched automatically. Invalid, duplicate and omitted links
and pagination gaps are counted; an empty list does not establish absence.

Export reads only the URL you name and its origin's public key document.
No credentials, payments or private keys. Evidence files must match a hash
inside the signed payload. Existing directories are never overwritten.
Verify and verify-source make no network requests. verify-source checks a saved
original response using the same bundle verifier in memory,
and prints findings plus the original file SHA-256 without repeating claims.
With --format markdown --report-out, save a new report without overwriting any
file and print a compact JSON receipt; otherwise verify-source writes no files.
With --check-identifiers, scan a saved UTF-8 draft offline against identifiers
from this verification. Long hex tokens (48+ digits) are compared, not prose or
identifier roles. No text is changed; a later final answer is outside this check.
Drafts are bounded to 128 KiB or the smaller --max-bytes. Exit 4 means the
optional check needs review or found no candidates; existing verification
failures keep their exit codes. --report-out cannot accompany this check.
With --subject, it also selects exact-URL observations from verified corpus-v1
claims only. Unsigned history and preflight are never included. Whole rows fit
within a ${SUBJECT_OBSERVATIONS_MAX_BYTES}-byte compact JSON allowance; omitted rows are counted explicitly.
Pointers address signed_claims, not the unsigned response wrapper. Snapshot
packaging time is separate from each row's observed_at; no freshness verdict.
Markdown prints a generated report with exact identifiers and one-source scope.
--challenge-headers requires --subject and reads the final saved HTTP 402 headers:
its x402 v2 PAYMENT-REQUIRED offers remain unsigned; digest matches are historical
address links only. No rail selection, address validation or payment authority.
Keep that original, its source URL, any linked evidence and the independently
established key. The embedded key cannot establish identity.
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
async function localAttachments(evidence, maxBytes) {
  const attachments = [];
  let attachmentBytes = 0;
  for (const path of evidence) {
    const bytes = await localBytes(path, maxBytes);
    attachmentBytes += bytes.length;
    if (attachmentBytes > maxBytes) throw new Error("attachments_too_large");
    attachments.push({ name: basename(path), bytes });
  }
  return attachments;
}
function sourceLinks(doc, subject, maxBytes, sourceHash) {
  const index = doc?.format === "scvd-corpus-index/v1" && Array.isArray(doc.entries);
  const history = typeof doc?.host === "string" && doc.host.length > 0 && doc.host.length <= 253 && doc.evidence_scope?.signed === false && Array.isArray(doc.timeline);
  if ((!index && !history) || (!index && !subject)) throw new Error("unsupported_discovery_input");
  const publicLink = value => {
    if (typeof value !== "string" || value.length > 8192 || !/^https:\/\//i.test(value) || value.includes("#") || /[\s\x00-\x1f\x7f\\]/u.test(value)) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.hash ? value : null;
    } catch { return null; }
  };
  const next = index ? publicLink(doc.next) : null;
  const more = index && typeof doc.has_more === "boolean" ? doc.has_more : null;
  const reading = {
    format: "scvd-evidence-sources/v1", input_kind: index ? "corpus_index" : "host_history",
    authenticated: false, source_sha256: sourceHash, subject: subject ?? null, subject_presence: "not_checked",
    candidates: [], candidate_links: 0, invalid_links: 0, duplicate_links: 0,
    unselected_rows: 0, omitted_candidates: 0,
    pagination: index ? { has_more: more, next_url: next,
      state: more === true && next ? "next_page_available" : more === false && doc.next === null ? "page_end_claimed" : "incomplete" } : null,
    scope: "Unsigned discovery hints from this saved response only, not verified observations or evidence of subject absence. Index entries name snapshots, not merchants. Exact host-history URL hints can be missing, stale or false. Pagination claims do not establish archive completeness. Inspect candidate URLs before fetching; retain each chosen original and separately establish its issuer key, then verify its exact subject and observation date. No links were fetched and no signature, truth, freshness, continuity, identity, settlement or delivery was checked.",
  };
  const links = [], seen = new Set();
  for (const row of index ? doc.entries : doc.timeline) {
    if (!row || typeof row !== "object" || Array.isArray(row)) { reading.invalid_links++; continue; }
    if (!index && row.url !== subject) { reading.unselected_rows++; continue; }
    const url = publicLink(index ? row.url : row.entry_url);
    if (!url) { reading.invalid_links++; continue; }
    if (seen.has(url)) { reading.duplicate_links++; continue; }
    seen.add(url);
    links.push({ url, sequence: Number.isSafeInteger(row.sequence) && row.sequence > 0 ? row.sequence : null,
      metadata_status: index && typeof row.status === "string" && row.status.length <= 128 ? row.status : null });
  }
  reading.candidate_links = links.length;
  reading.omitted_candidates = links.length;
  // Reserve the newline written by the caller. Count whole links;
  // do not cut a URL or let a large index become an unbounded tool display.
  let size = Buffer.byteLength(JSON.stringify(reading)) + 1;
  const limit = Math.min(maxBytes, SOURCE_LINKS_MAX_BYTES);
  if (size > limit) throw new Error("source_links_too_large");
  for (const row of links) {
    const bytes = Buffer.byteLength(JSON.stringify(row)) + (reading.candidates.length ? 1 : 0);
    if (size + bytes > limit) continue;
    reading.candidates.push(row); size += bytes; reading.omitted_candidates--;
  }
  return reading;
}
function subjectEvidence(result, url) {
  const reading = {
    url, status: "not_verified", matched_observations: null,
    snapshot_taken_at: null, observations: [], omitted_observations: null,
    observations_max_bytes: SUBJECT_OBSERVATIONS_MAX_BYTES,
    scope: "Exact URL matches in this verified corpus snapshot only. Each value is an issuer claim, not proof of truth, current readiness, settlement or delivery. Unsigned context and other snapshots are excluded. Keep the original response and independently established key; this excerpt cannot be verified alone.",
  };
  if (!result.valid) return reading;
  const claims = result.signed_claims;
  if (claims?.version !== 1 || claims.source !== "ward_round" || typeof claims.taken_at !== "string" || claims.taken_at.length > 128 || !Array.isArray(claims.round?.hosts)) {
    reading.status = "unsupported_artifact";
    return reading;
  }
  reading.snapshot_taken_at = claims.taken_at ?? null;
  reading.matched_observations = 0;
  reading.omitted_observations = 0;
  let bytes = 2; // Compact JSON array brackets. Never truncate a row's gaps.
  for (const [index, row] of claims.round.hosts.entries()) {
    if (row?.url !== url) continue;
    reading.matched_observations++;
    const observation = { signed_claims_pointer: `/round/hosts/${index}`, value: row };
    const size = Buffer.byteLength(JSON.stringify(observation)) + (reading.observations.length ? 1 : 0);
    if (bytes + size > SUBJECT_OBSERVATIONS_MAX_BYTES) { reading.omitted_observations++; continue; }
    bytes += size;
    reading.observations.push(observation);
  }
  reading.status = reading.matched_observations ? "present" : "absent_from_snapshot";
  return reading;
}
async function main(args) {
  if (!args.length || args.includes("--help")) { console.log(HELP); return; }
  const [command, input, ...rest] = args;
  if (command === "capabilities") {
    // The package's inventory beside this runtime's proven answer, as one JSON document.
    if (input !== undefined) throw new Error("invalid_arguments");
    console.log(JSON.stringify({ package: CAPABILITIES, runtime: await runtimeCapabilities() }, null, 2));
    return;
  }
  const flags = {}; const evidence = [];
  for (let i = 0; i < rest.length; i += 2) {
    const [key, value] = [rest[i], rest[i + 1]];
    if (!["--out", "--public-key", "--evidence", "--max-bytes", "--subject", "--format", "--challenge-headers", "--report-out", "--check-identifiers"].includes(key) || !value || (key !== "--evidence" && flags[key])) throw new Error("invalid_arguments");
    if (key === "--evidence") evidence.push(value); else flags[key] = value;
  }
  if (flags["--max-bytes"] && !/^\d+$/.test(flags["--max-bytes"])) throw new Error("invalid_byte_limit");
  const maxBytes = evidenceByteLimit(flags["--max-bytes"] === undefined ? undefined : Number(flags["--max-bytes"]));
  if (!input) throw new Error("missing_input");
  if (flags["--format"] && (command !== "verify-source" || !["json", "markdown"].includes(flags["--format"]))) throw new Error("invalid_format");
  if (flags["--check-identifiers"] && (command !== "verify-source" || flags["--report-out"])) throw new Error("invalid_identifier_check");
  if (flags["--report-out"] && (command !== "verify-source" || flags["--format"] !== "markdown")) throw new Error("report_requires_markdown");
  if (flags["--challenge-headers"] && (command !== "verify-source" || !flags["--subject"])) throw new Error("challenge_requires_subject");
  if (flags["--subject"]) {
    const subject = new URL(flags["--subject"]);
    if (!["verify-source", "sources"].includes(command) || flags["--subject"].length > 8192 || !["https:", "http:"].includes(subject.protocol) || subject.username || subject.password || subject.hash) throw new Error("invalid_subject");
    // Validate syntax without normalizing the exact requested evidence subject.
  }
  if (command === "sources") {
    if (flags["--out"] || flags["--public-key"] || evidence.length) throw new Error("invalid_arguments");
    const bytes = await localBytes(input, maxBytes);
    const reading = sourceLinks(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), flags["--subject"], maxBytes, await evidenceDigest(bytes));
    console.log(JSON.stringify(reading));
    return;
  }
  if (command === "verify-source") {
    if (flags["--out"]) throw new Error("invalid_arguments");
    const bytes = await localBytes(input, maxBytes);
    const attachments = await localAttachments(evidence, maxBytes);
    const bundle = await createEvidenceBundle(JSON.parse(bytes.toString("utf8")), { attachments, maxBytes });
    const result = await verifyEvidenceBundle(bundle, { publicKey: flags["--public-key"], maxBytes });
    // The saved original is the transport. Reprinting a whole corpus defeated
    // the buyer's output budget even after its local signature check succeeded.
    const { signed_claims, ...findings } = result;
    const subject = flags["--subject"] ? { subject_evidence: subjectEvidence(result, flags["--subject"]) } : {};
    // Compact subject output prevents indentation of a nested signed row from
    // expanding past the allowance that was measured in its compact encoding.
    const reading = { report_format: EVIDENCE_REPORT_FORMAT, ...findings, source_sha256: await evidenceDigest(bytes),
      signed_message_sha256: result.valid ? await evidenceDigest(new TextEncoder().encode(bundle.artifact.signed_payload)) : null,
      corpus_snapshots_verified: result.valid && signed_claims?.version === 1 && signed_claims?.source === "ward_round" && Array.isArray(signed_claims.round?.hosts) ? 1 : 0,
      ...subject,
      observation_dates: (subject.subject_evidence?.observations ?? []).map(observation => {
        const date = observation.value.observed_at;
        const known = typeof date === "string" && Number.isFinite(Date.parse(date));
        return { signed_claims_pointer: observation.signed_claims_pointer, observed_at: known ? date : null, status: known ? "recorded" : "unknown" };
      }) };
    if (flags["--challenge-headers"]) reading.payment_challenge = await readPaymentChallenge(await localBytes(flags["--challenge-headers"], Math.min(maxBytes, CHALLENGE_HEADERS_MAX_BYTES)), subject.subject_evidence);
    if (flags["--check-identifiers"]) {
      const references = { source_sha256: reading.source_sha256, signed_message_sha256: reading.signed_message_sha256,
        supplied_public_key: flags["--public-key"], verified_signature: result.valid ? bundle.artifact.signature : null };
      if (reading.payment_challenge) {
        references.challenge_source_sha256 = reading.payment_challenge.source_sha256;
        for (const row of reading.payment_challenge.offers) references[`unsigned_offer_${row.index}_address_digest`] = row.address_digest;
      }
      reading.identifier_check = await checkDraftIdentifiers(await localBytes(flags["--check-identifiers"], Math.min(maxBytes, EVIDENCE_REPORT_MAX_BYTES)), references, result.valid);
    }
    if (flags["--report-out"]) {
      await writeFile(flags["--report-out"], renderEvidenceReport(reading, maxBytes), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ report_file: flags["--report-out"], source_sha256: reading.source_sha256, valid: reading.valid, evidence_complete: reading.evidence_complete }));
    } else console.log(flags["--format"] === "markdown" ? renderEvidenceReport(reading, maxBytes) : JSON.stringify(reading, null, flags["--subject"] ? undefined : 2));
    process.exitCode = !result.valid ? 1 : !result.evidence_complete ? 3 : reading.identifier_check && reading.identifier_check.status !== "all_candidates_recognized" ? 4 : 0;
    return;
  }
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
  const attachments = await localAttachments(evidence, maxBytes);
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
