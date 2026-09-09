import { hexToBytes, verifyEd25519 } from "./x402-verify.js";

export const EVIDENCE_BUNDLE_FORMAT = "scvd-evidence-bundle/v1";
export const EVIDENCE_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;
export const EVIDENCE_BUNDLE_HARD_MAX_BYTES = 64 * 1024 * 1024;
export function evidenceByteLimit(value = EVIDENCE_BUNDLE_MAX_BYTES) {
  if (!Number.isSafeInteger(value) || value < 1 || value > EVIDENCE_BUNDLE_HARD_MAX_BYTES) throw new Error("invalid_byte_limit");
  return value;
}
export const EVIDENCE_BUNDLE_MAX_ATTACHMENTS = 32;
const HASH_FIELDS = ["attests", "saw", "body_sha256"];
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const record = x => x !== null && typeof x === "object" && !Array.isArray(x);
const encoder = new TextEncoder();

export async function evidenceDigest(bytes) {
  return hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}
export function evidenceBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function evidenceBytes(value, maxBytes = EVIDENCE_BUNDLE_MAX_BYTES) {
  evidenceByteLimit(maxBytes);
  if (typeof value !== "string" || value.length > maxBytes || /[^A-Za-z0-9+/=]/.test(value)) throw new Error("invalid_base64");
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (evidenceBase64(bytes) !== value) throw new Error("noncanonical_base64");
  return bytes;
}
function bound(value, maxBytes) {
  const text = JSON.stringify(value);
  if (!text || text.length > maxBytes || encoder.encode(text).length > maxBytes) throw new Error("bundle_too_large");
}
function claimsOf(artifact) {
  if (!record(artifact) || artifact.algorithm !== "ed25519" || typeof artifact.signed_payload !== "string" || typeof artifact.signature !== "string" || !/^[a-f0-9]{128}$/i.test(artifact.signature) || typeof artifact.public_key !== "string" || !/^[a-f0-9]{64}$/i.test(artifact.public_key)) throw new Error("invalid_artifact");
  const claims = JSON.parse(artifact.signed_payload);
  if (!record(claims)) throw new Error("signed_payload_not_object");
  return claims;
}
function bindingsOf(claims) {
  return Object.fromEntries(HASH_FIELDS.filter(k => typeof claims[k] === "string" && /^[a-f0-9]{64}$/i.test(claims[k])).map(k => [k, claims[k].toLowerCase()]));
}

/** Packaging makes no new attestation. Only artifact.signed_payload is authoritative. */
export async function createEvidenceBundle(response, options = {}) {
  const maxBytes = evidenceByteLimit(options.maxBytes);
  bound(response, maxBytes);
  const originalResponse = response;
  // Corpus v1 fixes field order; neither display metadata nor object key order
  // may select different bytes. The digest is checked before packaging.
  if (record(response.snapshot)) {
    const s = response.snapshot;
    if (s.version !== 1 || s.source !== "ward_round" || !Number.isSafeInteger(s.sequence) || s.sequence < 1 || typeof s.taken_at !== "string" || typeof s.week !== "string" || !(s.previous_digest === null || typeof s.previous_digest === "string") || !record(s.round)) throw new Error("unsupported_corpus_snapshot");
    const signed_payload = JSON.stringify({ version: s.version, sequence: s.sequence, taken_at: s.taken_at, previous_digest: s.previous_digest, source: s.source, week: s.week, round: s.round });
    const digest = await evidenceDigest(encoder.encode(signed_payload));
    if (response.digest !== digest) throw new Error("corpus_digest_mismatch");
    response = { ...response, algorithm: "ed25519", signed_payload, artifact_hash: digest,
      existence: response.ots?.proof_base64 ? { digest, proof_base64: response.ots.proof_base64 } : undefined };
  }
  const claims = claimsOf(response);
  const digest = await evidenceDigest(encoder.encode(response.signed_payload));
  if (response.artifact_hash !== undefined && response.artifact_hash !== digest) throw new Error("artifact_hash_mismatch");
  const bindings = bindingsOf(claims);
  const attachments = [];
  let attachmentBytes = 0;
  if ((options.attachments?.length ?? 0) > EVIDENCE_BUNDLE_MAX_ATTACHMENTS) throw new Error("too_many_attachments");
  for (const file of options.attachments ?? []) {
    if (!(file.bytes instanceof Uint8Array) || file.bytes.length > maxBytes) throw new Error("attachment_too_large");
    attachmentBytes += Math.ceil(file.bytes.length / 3) * 4;
    if (attachmentBytes > maxBytes) throw new Error("attachments_too_large");
    const sha256 = await evidenceDigest(file.bytes);
    const binding = Object.keys(bindings).find(k => bindings[k] === sha256);
    if (!binding) throw new Error("attachment_not_bound_by_signed_payload");
    if (attachments.some(a => a.binding === binding)) throw new Error("duplicate_attachment_binding");
    attachments.push({ name: String(file.name), binding, sha256, bytes_base64: evidenceBase64(file.bytes) });
  }
  let timestamp = null;
  if (response.existence?.proof_base64) {
    evidenceBytes(response.existence.proof_base64, maxBytes);
    if (response.existence.digest !== digest) throw new Error("timestamp_digest_mismatch");
    timestamp = { format: "opentimestamps-calendar-ops", digest, proof_base64: response.existence.proof_base64 };
  }
  const bundle = {
    format: EVIDENCE_BUNDLE_FORMAT,
    artifact: { algorithm: response.algorithm, signed_payload: response.signed_payload, signature: response.signature, public_key: response.public_key },
    attachments,
    timestamp,
    context: { source_url: options.sourceUrl ?? null, captured_at: options.capturedAt ?? null, issuer_document: options.issuerDocument ?? null, response: originalResponse, authenticated: false },
  };
  bound(bundle, maxBytes);
  return bundle;
}

/** No network, no issuer selection from the bundle, and no trust in cached verdicts. */
export async function verifyEvidenceBundle(bundle, options = {}) {
  const problems = [];
  const result = {
    valid: false, evidence_complete: false, missing_evidence: [], problems,
    context_authenticated: false,
    timestamp: { status: "absent", verified: false },
    scope: "Signature and attached hash bindings against the public key supplied by the caller; not an issuer identity or factual verdict.",
    does_not_establish: ["issuer identity without an independently trusted key", "issue time or key authorization at issue time", "Bitcoin anchoring without independent OTS verification", "truth, settlement, delivery, completeness of the observed world", "authenticity of context, filenames or captured key history"],
  };
  try {
    const maxBytes = evidenceByteLimit(options.maxBytes);
    bound(bundle, maxBytes);
    if (!record(bundle) || bundle.format !== EVIDENCE_BUNDLE_FORMAT) throw new Error("unsupported_bundle_format");
    const claims = claimsOf(bundle.artifact);
    const key = typeof options.publicKey === "string" && /^[a-f0-9]{64}$/i.test(options.publicKey) ? hexToBytes(options.publicKey) : null;
    if (!key) problems.push("trusted_key_required");
    else if (bundle.artifact.public_key.toLowerCase() !== options.publicKey.toLowerCase()) problems.push("embedded_key_differs_from_trusted_key");
    else if (!await verifyEd25519(bundle.artifact.signed_payload, hexToBytes(bundle.artifact.signature), key)) problems.push("invalid_signature");
    const bindings = bindingsOf(claims);
    if (!Array.isArray(bundle.attachments) || bundle.attachments.length > EVIDENCE_BUNDLE_MAX_ATTACHMENTS) throw new Error("invalid_attachments");
    const seen = new Set();
    for (const attachment of bundle.attachments) {
      if (!record(attachment) || typeof attachment.binding !== "string" || !Object.hasOwn(bindings, attachment.binding)) throw new Error("unbound_attachment");
      if (seen.has(attachment.binding)) throw new Error("duplicate_attachment_binding");
      const bytes = evidenceBytes(attachment.bytes_base64, maxBytes);
      const digest = await evidenceDigest(bytes);
      if (digest !== bindings[attachment.binding] || digest !== attachment.sha256) throw new Error("attachment_hash_mismatch");
      seen.add(attachment.binding);
    }
    result.missing_evidence = Object.keys(bindings).filter(k => !seen.has(k));
    result.evidence_complete = result.missing_evidence.length === 0;
    if (bundle.timestamp !== null) {
      result.timestamp.status = "unverified";
      if (!record(bundle.timestamp) || bundle.timestamp.format !== "opentimestamps-calendar-ops" || bundle.timestamp.digest !== await evidenceDigest(encoder.encode(bundle.artifact.signed_payload))) throw new Error("timestamp_digest_mismatch");
      evidenceBytes(bundle.timestamp.proof_base64, maxBytes);
    }
    result.valid = problems.length === 0;
    // Never display unverified JSON as the artifact's authenticated contents.
    if (result.valid) result.signed_claims = claims;
  } catch (error) { problems.push(error instanceof Error ? error.message : "invalid_bundle"); }
  return result;
}

/** Calendar responses omit the detached-file header required by the independent ots CLI. */
export function detachedTimestamp(digest, proofBase64) {
  if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error("invalid_timestamp_digest");
  const header = hexToBytes("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294" + "0108" + digest);
  const proof = evidenceBytes(proofBase64);
  if (!proof.length) throw new Error("empty_timestamp_proof");
  const out = new Uint8Array(header.length + proof.length);
  out.set(header); out.set(proof, header.length);
  return out;
}
