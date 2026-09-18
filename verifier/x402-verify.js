/**
 * x402-verify — a zero-dependency verifier for x402 Signed Offers &
 * Receipts, did:web identity, and key history.
 *
 * WHAT THIS IS FOR. The x402 Signed Offers & Receipts extension lets a
 * seller commit to its terms before money moves and sign its claim of
 * delivery after. This package checks the compact JWS EdDSA/Ed25519
 * profile; other extension formats remain unsupported. Checking one means doing
 * FOUR separate things, and the whole point of this file is that they
 * are separate:
 *
 *   1. Parse the JWS without trusting any of it.
 *   2. Resolve the kid to a key you got from somewhere other than the
 *      artifact — otherwise you are asking the artifact to vouch for
 *      itself.
 *   3. Check the signature against that key.
 *   4. Check the payload against this package's local revision-1 schema.
 *
 * STEPS 3 AND 4 ARE NOT THE SAME CHECK AND A VERIFIER THAT RUNS ONLY
 * ONE IS BROKEN. A payload can carry a perfectly valid signature over
 * a schema-invalid body: the signer really did sign it, and it is
 * still not a conformant offer. Our published conformance vectors
 * include exactly that case as a teaching artifact because it is the
 * mistake real implementations make.
 *
 * WHAT IT IS NOT. This verifies CRYPTOGRAPHY AND SHAPE. It cannot tell
 * you whether the seller actually delivered what it promised — no
 * offline check can, because that is a fact about the world rather
 * than about bytes. Anyone claiming otherwise is selling you a feeling.
 *
 * NOT SPECIFIC TO ANY STORE, including the one that wrote it. It takes
 * a DID or a raw key and checks what you hand it. It was written by
 * scvd.store, which runs the same extension and publishes the vectors
 * this file is tested against; there is no call home in here and
 * nothing about scvd.store is privileged.
 *
 * RUNTIME. Zero dependencies. Ed25519 verification uses WebCrypto;
 * the README records exercised runtimes rather than assumed parity. If
 * your runtime lacks Ed25519 in WebCrypto, pass your own `verify`
 * function — the crypto is a seam on purpose, not a lock-in.
 *
 * Licence: MIT, same as the repository it ships in.
 */

/** Local revision-1 profile; validUntil remains required for compatibility. */
export const OFFER_REQUIRED_FIELDS = [
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "validUntil",
];

/** Spec §5.2 — every field a receipt must carry. `transaction` is optional. */
export const RECEIPT_REQUIRED_FIELDS = [
  "version",
  "network",
  "resourceUrl",
  "payer",
  "issuedAt",
];

/** base64url -> bytes, with no dependency and no silent success. */
export function decodeBase64Url(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonSegment(segment) {
  const bytes = decodeBase64Url(segment);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function hexToBytes(hex) {
  const clean = typeof hex === "string" ? hex.replace(/^0x/, "") : "";
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Split a compact JWS into its parts WITHOUT trusting any of them.
 * The signing input is the exact ASCII of the first two segments and
 * the dot between them, per RFC 7515 — recomputing it from the parsed
 * objects instead is the classic way to get a verifier that says no
 * to valid artifacts.
 */
export function parseJws(jws) {
  if (typeof jws !== "string") {
    return { ok: false, problem: "not a string" };
  }
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return { ok: false, problem: `expected 3 segments, got ${parts.length}` };
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJsonSegment(headerSegment);
  const payload = decodeJsonSegment(payloadSegment);
  const signature = decodeBase64Url(signatureSegment);
  if (!isRecord(header)) return { ok: false, problem: "header is not a base64url JSON object" };
  if (!isRecord(payload)) return { ok: false, problem: "payload is not a base64url JSON object" };
  if (!signature) return { ok: false, problem: "signature is not base64url" };
  return {
    ok: true,
    header,
    payload,
    signature,
    signingInput: `${headerSegment}.${payloadSegment}`,
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finding(name, status, detail, reasonCode, advisory = false) {
  return { name, ok: status === "valid", status, detail,
    ...(reasonCode ? { reasonCode } : {}), ...(advisory ? { advisory: true } : {}) };
}

function reportFrom(checks, fields = {}) {
  const required = checks.filter((check) => !check.advisory);
  // A demonstrated failure survives an unrelated unsupported or incomplete check.
  const status = ["invalid", "unsupported", "inconclusive", "unobserved"]
    .find((state) => required.some((check) => check.status === state)) ?? "valid";
  return { ok: status === "valid", status: status === "unobserved" ? "inconclusive" : status,
    scope: "Signature and local revision-1 schema checks only; service authorization, key history, settlement and delivery are not checked.",
    reasonCodes: [...new Set(required.filter((check) => !check.ok).map((check) => check.reasonCode).filter(Boolean))],
    checks, ...fields };
}

/** Keep the legacy helper contract; artifact APIs retain structured findings. */
export async function verifyEd25519(signingInput, signature, publicKey, options = {}) {
  // Existing raw-byte consumers distinguish a missing runtime by this exception.
  // Artifact APIs call signatureFinding directly and report unsupported instead.
  if (typeof options.verify !== "function" && !(options.subtle ?? globalThis.crypto?.subtle)) {
    throw new Error("No WebCrypto available. Pass options.verify to supply your own Ed25519 check.");
  }
  return (await signatureFinding(signingInput, signature, publicKey, options)).ok;
}

async function signatureFinding(signingInput, signature, publicKey, options) {
  const fail = (status, code, detail) => finding("signature", status, detail, code);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    return fail("invalid", "signature_malformed", "Ed25519 signature must be 64 bytes");
  }
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  if (typeof options.verify !== "function" && (!subtle || typeof subtle.importKey !== "function" || typeof subtle.verify !== "function")) {
    return fail("unsupported", "unsupported_runtime", "Ed25519 verification is unavailable; supply options.verify");
  }
  try {
    let valid;
    if (typeof options.verify === "function") {
      valid = await options.verify(signingInput, signature, publicKey);
    } else {
      const key = await subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
      valid = await subtle.verify({ name: "Ed25519" }, key, signature, new TextEncoder().encode(signingInput));
    }
    if (typeof valid !== "boolean") return fail("inconclusive", "verification_error", "verifier did not return a boolean");
    return valid
      ? finding("signature", "valid", "signature verifies over ASCII(header.payload)")
      : fail("invalid", "signature_invalid", "signature does NOT verify against the resolved key");
  } catch (error) {
    // A provider's exception is not a cryptographic verdict, and may contain secrets.
    return error?.name === "NotSupportedError"
      ? fail("unsupported", "unsupported_runtime", "runtime does not support Ed25519 verification")
      : fail("inconclusive", "verification_error", "verification could not complete");
  }
}

function keyProblem(status, reasonCode, problem, url) {
  return { ok: false, status, reasonCode, problem, ...(url ? { url } : {}) };
}

function readPublicKey(value, documentKey = false) {
  const bytes = typeof value === "string" ? hexToBytes(value) : value;
  return bytes instanceof Uint8Array && bytes.length === 32
    ? { ok: true, key: bytes }
    : keyProblem("inconclusive", documentKey ? "key_document_invalid" : "invalid_public_key", "Ed25519 public key must be 32 bytes");
}

function readJwk(jwk) {
  if (jwk?.kty !== "OKP" || jwk?.crv !== "Ed25519") {
    return keyProblem("unsupported", "unsupported_key_type", "key representation is outside this verifier's Ed25519 support");
  }
  return readPublicKey(decodeBase64Url(jwk.x), true);
}

async function readKeyDocument(url, options) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return keyProblem("inconclusive", "key_unavailable", "no fetch available; pass options.fetch", url);
  let document;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return keyProblem("inconclusive", "key_unavailable", `key document HTTP ${response.status}`, url);
    try { document = await response.json(); }
    catch { return keyProblem("inconclusive", "key_document_invalid", "key document is not readable JSON", url); }
  } catch {
    return keyProblem("inconclusive", "key_unavailable", "key document unreachable", url);
  }
  if (!isRecord(document) || (document.verificationMethod !== undefined && !Array.isArray(document.verificationMethod))) {
    return keyProblem("inconclusive", "key_document_invalid", "key document has an invalid verificationMethod shape", url);
  }
  const keys = new Map();
  const keyProblems = new Map();
  for (const method of document.verificationMethod ?? []) {
    if (typeof method?.id !== "string") continue;
    if (keys.has(method.id) || keyProblems.has(method.id)) {
      keys.delete(method.id);
      keyProblems.set(method.id, keyProblem("inconclusive", "key_document_invalid", "key document repeats the selected kid", url));
      continue;
    }
    const result = readJwk(method.publicKeyJwk);
    if (result.ok) keys.set(method.id, result.key);
    else keyProblems.set(method.id, result);
  }
  let bare = null;
  let bareProblem;
  if (document.kty !== undefined || document.publicKeyHex !== undefined) {
    const result = document.kty !== undefined ? readJwk(document) : readPublicKey(document.publicKeyHex, true);
    if (result.ok) bare = result.key;
    else bareProblem = result;
  }
  return { ok: true, document, keys, keyProblems, bare, bareProblem, url };
}

/** did:web resolution retains unsupported keys separately from absent keys. */
export async function resolveDidWeb(did, options = {}) {
  if (typeof did !== "string" || !did.startsWith("did:web:")) {
    return keyProblem("unsupported", "unsupported_did_method", "not a did:web identifier");
  }
  let url;
  try {
    const segments = did.slice("did:web:".length).split("#")[0].split(":").map(decodeURIComponent);
    const host = segments[0].replace(/%3A/gi, ":");
    const path = segments.slice(1);
    if (!host) throw new Error("empty DID host");
    url = path.length > 0 ? `https://${host}/${path.join("/")}/did.json` : `https://${host}/.well-known/did.json`;
    new URL(url);
  } catch {
    return keyProblem("invalid", "malformed_kid", "did:web identifier cannot be resolved as a URL");
  }
  return readKeyDocument(url, options);
}

async function resolveArtifactKey(kid, options, issuerKeyUrl) {
  if (options.publicKey !== undefined && options.publicKey !== null) {
    const result = readPublicKey(options.publicKey);
    return result.ok ? { ...result, detail: "public key supplied by the caller" } : result;
  }
  const resolved = issuerKeyUrl
    ? await readKeyDocument(issuerKeyUrl, options)
    : await resolveDidWeb(kid, options);
  if (!resolved.ok) return resolved;
  const key = resolved.keys.get(kid) ?? (issuerKeyUrl ? resolved.bare : null);
  if (resolved.keyProblems.has(kid)) return { ...resolved.keyProblems.get(kid), url: resolved.url };
  if (key) return { ok: true, key, url: resolved.url, detail: `kid found in ${resolved.url}` };
  if (issuerKeyUrl && resolved.bareProblem) return { ...resolved.bareProblem, url: resolved.url };
  // A current directory omitting a key cannot disprove historical authorization.
  return keyProblem("inconclusive", "key_unavailable", `kid not found in ${resolved.url}`, resolved.url);
}

function schemaProblems(payload, requiredFields, kind) {
  const problems = [];
  if (typeof payload !== "object" || payload === null) {
    return ["payload is not an object"];
  }
  for (const field of requiredFields) {
    if (!(field in payload)) {
      problems.push(`missing required field: ${field}`);
    }
  }
  if ("version" in payload && payload.version !== 1) {
    problems.push("version must be 1 for this revision");
  }
  if (kind === "offer" && "validUntil" in payload) {
    if (typeof payload.validUntil !== "number") {
      problems.push("validUntil must be a number (seconds since the epoch)");
    }
  }
  if (kind === "receipt" && "issuedAt" in payload) {
    if (typeof payload.issuedAt !== "number") {
      problems.push("issuedAt must be a number (seconds since the epoch)");
    }
  }
  return problems;
}

export function validateOfferPayload(payload) {
  return schemaProblems(payload, OFFER_REQUIRED_FIELDS, "offer");
}

export function validateReceiptPayload(payload) {
  return schemaProblems(payload, RECEIPT_REQUIRED_FIELDS, "receipt");
}

/**
 * Is an offer still live at `now`?
 *
 * LEEWAY IS THE CALLER'S, AND IT DEFAULTS TO GENEROUS-BUT-STATED.
 * Issuance should be strict and consumption tolerant: the issuer's
 * clock and yours will differ by seconds, and a 300-second window
 * makes a few seconds of skew harmless. This is separate from schema
 * validity on purpose — an expired offer was a perfectly good offer.
 */
export function isOfferLive(payload, options = {}) {
  const leewaySeconds = options.leewaySeconds ?? 5;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload?.validUntil !== "number") {
    return { live: false, reason: "no numeric validUntil" };
  }
  const live = now <= payload.validUntil + leewaySeconds;
  return {
    live,
    reason: live
      ? `valid until ${payload.validUntil} (+${leewaySeconds}s leeway)`
      : `expired at ${payload.validUntil}, now ${now}`,
  };
}

/**
 * The whole check, as separate reported findings rather than one
 * boolean. A caller that only wants a yes/no reads `ok`; a caller
 * debugging their own implementation reads `checks` and learns which
 * of the four things failed, which is the difference between a
 * verifier and a wall.
 */
export async function verifyArtifact(jws, options = {}) {
  return (await verifyArtifactReport(jws, options)).report;
}

async function verifyArtifactReport(jws, options, issuerKeyUrl) {
  const checks = [];
  if (isRecord(jws) && typeof jws.format === "string" && jws.format.length > 0) {
    checks.push(finding("parse", "unsupported", "this entry point accepts compact JWS strings only", "unsupported_format"));
    return { report: reportFrom(checks) };
  }
  const parsed = parseJws(jws);
  if (!parsed.ok) {
    checks.push(finding("parse", "invalid", parsed.problem, "malformed_input"));
    return { report: reportFrom(checks) };
  }
  checks.push(finding("parse", "valid", "three base64url segments, header and payload are JSON"));
  const { alg, kid } = parsed.header;
  const algOk = alg === "EdDSA";
  checks.push(algOk ? finding("alg", "valid", "EdDSA")
    : typeof alg === "string" && alg.length > 0
      ? finding("alg", "unsupported", `expected EdDSA, got ${String(alg)}`, "unsupported_algorithm")
      : finding("alg", "invalid", "no algorithm in header", "malformed_header"));
  checks.push(typeof kid === "string" && kid.length > 0
    ? finding("kid", "valid", kid)
    : finding("kid", "invalid", "no kid in header", "malformed_kid"));
  const kind = options.kind ?? ("payer" in parsed.payload ? "receipt" : "offer");
  const futureSchema = Number.isInteger(parsed.payload.version) && parsed.payload.version > 1;
  const problems = kind === "receipt" ? validateReceiptPayload(parsed.payload) : validateOfferPayload(parsed.payload);
  checks.push(futureSchema
    ? finding("schema", "unsupported", "payload schema version is not supported", "unsupported_schema_version")
    : problems.length === 0 ? finding("schema", "valid", `conforms to the local revision-1 ${kind} schema checks`)
      : finding("schema", "invalid", problems.join("; "), "schema_invalid"));

  let resolution;
  if (algOk) {
    resolution = await resolveArtifactKey(kid, options, issuerKeyUrl);
    checks.push(resolution.ok ? finding("key-resolution", "valid", resolution.detail)
      : finding("key-resolution", resolution.status, resolution.problem, resolution.reasonCode));
  }
  if (algOk && parsed.signature.length !== 64) {
    checks.push(finding("signature", "invalid", "Ed25519 signature must be 64 bytes", "signature_malformed"));
  } else if (algOk && resolution?.ok) {
    checks.push(await signatureFinding(parsed.signingInput, parsed.signature, resolution.key, options));
  } else {
    checks.push(finding("signature", "unobserved", algOk ? "not checked: no key to check against" : "not checked: unsupported algorithm", "signature_not_checked"));
  }
  if (kind === "offer" && options.checkExpiry !== false) {
    if (futureSchema || typeof parsed.payload.validUntil !== "number") {
      checks.push(finding("expiry", "unobserved", "expiry not checked: unsupported schema or no numeric validUntil", "expiry_not_checked", true));
    } else {
      const live = isOfferLive(parsed.payload, options);
      checks.push(finding("expiry", live.live ? "valid" : "invalid", live.reason, live.live ? undefined : "offer_expired", true));
    }
  }
  return { report: reportFrom(checks, { header: parsed.header, payload: parsed.payload, kind }), resolution };
}

/**
 * OPTIONAL: check a key against an issuer's externally anchored key
 * history.
 *
 * Offline verification answers "did this key sign this?". It cannot
 * answer "was this key the issuer's key at the time, and can the
 * issuer prove they did not rewrite that later?" — because a
 * self-hosted key registry can be edited after the fact.
 *
 * Some issuers publish an append-only hash chain of their key state at
 * /.well-known/anchor-log.json and submit its digests to
 * OpenTimestamps, which anchors them into Bitcoin. Where that exists,
 * this reads it and tells you when the key first appears and whether
 * that entry's timestamp is Bitcoin-confirmed or still pending.
 *
 * GENERIC BY DESIGN. Any issuer can publish this shape; nothing here
 * is specific to whoever wrote this library. An issuer without one
 * simply returns `available: false`, which is information rather than
 * a failure — most do not have one, and that is the honest state of
 * the ecosystem today.
 *
 * WHAT IT STILL DOES NOT PROVE: an anchor proves WHEN a key state was
 * committed, never WHO SHOULD HAVE held it. A thief with the key could
 * anchor too. This bounds a compromise window; it does not prevent one.
 */
/**
 * THE ONE-CALL FRONT DOOR (1.1.0, 2026-09-03). verifyArtifact returns
 * the report; this returns the bounded evidence an agent can act on:
 * valid or not, the scope of what "valid" means, what it does NOT
 * establish, and where to reproduce it. The key comes from
 * `issuerKeyUrl` or `publicKey` — never from the artifact — because a
 * signature checked against a key the artifact supplied is the
 * artifact vouching for itself.
 *
 * `issuerKeyUrl` may serve a DID document (verificationMethod with
 * Ed25519 publicKeyJwk entries, the kid matched by id) or a bare key
 * (`{ "kty": "OKP", "crv": "Ed25519", "x": "…" }` or
 * `{ "publicKeyHex": "…" }`). Absent both, the kid's did:web is
 * resolved over the network, as verifyArtifact does.
 */
export const DOES_NOT_ESTABLISH = Object.freeze({
  receipt: Object.freeze([
    "merchant identity beyond the key the receipt was checked against",
    "payment settlement on any chain",
    "delivery of the purchased service",
    "authorization of the signing key for resourceUrl, now or at issuance",
  ]),
  offer: Object.freeze([
    "merchant identity beyond the key the offer was checked against",
    "that the door still serves these terms now",
    "that paying these terms delivers anything",
    "authorization of the signing key for resourceUrl, now or at issuance",
  ]),
});

export const VERIFICATION_URL = "https://scvd.store/api/conformance/v1";

async function verifyBounded(kind, jws, input, options) {
  const publicKey = input?.publicKey ?? options.publicKey;
  const keyUrl = input?.issuerKeyUrl ?? null;
  const { report, resolution } = await verifyArtifactReport(jws, { ...options, kind, publicKey }, keyUrl);
  const checkedAgainst = publicKey != null ? "the key supplied by the caller"
    : keyUrl ? `the issuer key at ${keyUrl}` : `the key resolved from the artifact's did:web kid (${resolution?.url})`;
  const failed = report.checks.filter((check) => !check.advisory && !check.ok).map((check) => `${check.name}: ${check.detail}`);
  return {
    kind, valid: report.ok, status: report.status, reasonCodes: report.reasonCodes,
    scope: report.ok
      ? `Signature valid over the ${kind}'s bytes against ${checkedAgainst}; the ${kind}'s fields pass this package's local offer-receipt schema checks (rev 1).${kind === "offer" ? " Expiry is reported, not folded in." : ""}`
      : `Not verified: ${jws === undefined ? `input.${kind} must be the compact JWS string. ` : ""}${failed.join("; ")}.`,
    doesNotEstablish: [...DOES_NOT_ESTABLISH[kind]],
    verificationUrl: VERIFICATION_URL,
    checks: report.checks,
    issuer: { kid: typeof report.header?.kid === "string" ? report.header.kid : null, keyUrl: keyUrl ?? resolution?.url ?? null },
    ...(report.payload ? { payload: report.payload } : {}),
  };
}

/** Verify one signed receipt and get bounded evidence back. */
export async function verifyReceipt(input, options = {}) {
  return verifyBounded("receipt", input?.receipt, input, options);
}

/** Verify one signed offer and get bounded evidence back. */
export async function verifyOffer(input, options = {}) {
  return verifyBounded("offer", input?.offer, input, options);
}

export async function checkAnchoredKeyHistory(did, publicKeyHex, options = {}) {
  if (typeof did !== "string" || !did.startsWith("did:web:")) {
    return { available: false, reason: "not a did:web identifier" };
  }
  const wanted = String(publicKeyHex ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (wanted.length === 0) {
    // Without this guard an empty key would match an entry that simply
    // omitted the field, and the function would answer "found" to a
    // question nobody asked.
    return { available: false, reason: "no public key given to look for" };
  }
  const url = anchorLogUrlFor(did);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return { available: false, reason: "no fetch available" };
  }
  let log;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        available: false,
        reason: `no anchor log at ${url} (HTTP ${response.status})`,
      };
    }
    log = await response.json();
  } catch (error) {
    return {
      available: false,
      reason: `anchor log unreachable: ${String(error)}`,
    };
  }

  const entries = Array.isArray(log?.entries) ? log.entries : [];
  if (entries.length === 0) {
    return { available: true, url, found: false, reason: "anchor log is empty" };
  }

  // Recompute the chain BEFORE reading anything off it. An unverified
  // chain is just a web page making claims about itself.
  const chain = await verifyAnchorChain(log, options);

  const matches = entries
    .filter((entry) => snapshotNamesKey(entry?.snapshot, wanted))
    .sort((a, b) => sequenceOf(a) - sequenceOf(b));
  if (matches.length === 0) {
    return {
      available: true,
      url,
      found: false,
      anchor_confidence: anchorConfidence(entries, chain, false),
      chain_ok: chain.ok,
      chain_problems: chain.problems,
      reason:
        "this key does not appear anywhere in the issuer's anchored key history",
    };
  }

  const first = matches[0];
  const firstSequence = sequenceOf(first);
  /**
   * A LATER CONFIRMED ENTRY VOUCHES FOR AN EARLIER ONE — but only if
   * the chain between them actually links, which is why this reads
   * `chain.ok` rather than taking the log's word. Each entry commits
   * to the digest before it, so one Bitcoin-confirmed digest at
   * sequence N puts every entry at or below N on the wrong side of
   * rewriting. With a broken chain that inference is void, and we
   * fall back to demanding the matching entry be confirmed itself.
   */
  const voucher = entries
    .filter((entry) => entry?.ots?.status === "complete")
    .filter((entry) =>
      chain.ok
        ? sequenceOf(entry) >= firstSequence
        : sequenceOf(entry) === firstSequence,
    )
    .sort((a, b) => sequenceOf(a) - sequenceOf(b))[0];

  return {
    available: true,
    url,
    found: true,
    anchor_confidence: anchorConfidence(entries, chain, Boolean(voucher)),
    chain_ok: chain.ok,
    chain_problems: chain.problems,
    first_seen_at: first?.snapshot?.taken_at ?? null,
    first_seen_sequence: Number.isFinite(firstSequence) ? firstSequence : null,
    bitcoin_confirmed: Boolean(voucher),
    /**
     * Handed back so the caller can settle the question themselves.
     * We do not run `ots verify` — that needs a Bitcoin header source
     * and this file has no dependencies — so `bitcoin_confirmed` is
     * the ISSUER'S CLAIM about their own proof, checked for chain
     * position but not against Bitcoin. The proof is right here;
     * verifying it is one command and nobody should take our word.
     */
    ots_proof_base64: voucher?.ots?.proof_base64 ?? null,
    ots_status_is_unverified_claim: true,
    /**
     * THE COMPARISON THAT ACTUALLY CATCHES BACKDATING, named because
     * running `ots verify` alone does not do it. That command proves
     * the digest existed by some block; it says nothing about the date
     * the SNAPSHOT claims. An entry claiming an old taken_at whose
     * proof lands in a much later block was written after the fact.
     * The chain checks above prove internal consistency; only this one
     * ties the log to time the issuer does not control.
     */
    settle_it_yourself:
      "Run `ots verify` on ots_proof_base64, then compare the Bitcoin block time it reports against first_seen_at. Close together means the entry was committed when it says. A much later block means the snapshot was backdated, which no amount of internal chain consistency would reveal.",
    reason: !chain.ok
      ? `the published chain does not recompute (${chain.problems.length} problem(s)); treat every claim on it as unbacked`
      : voucher
        ? "key appears in the chain at or below a Bitcoin-confirmed entry; run `ots verify` on ots_proof_base64 to confirm the timestamp independently"
        : "key appears in an intact chain, but NO entry at or after it is Bitcoin-confirmed yet. Weigh this carefully rather than reading it as anchored: a pending-only chain is the exact state a chain rewritten TODAY would be in, because nothing has confirmed that could contradict it. A calendar's promise, not a commitment.",
  };
}

/**
 * ONE WORD FOR HOW MUCH THE ANCHORING IS WORTH, so a caller cannot
 * collapse "submitted" and "confirmed" into one green checkmark.
 *
 * This exists because of a specific gap: a chain whose proofs are ALL
 * pending is exactly the state a SAME-DAY FORGERY would be in. Nothing
 * has confirmed yet, so nothing contradicts a rewrite — the calendars
 * hold a promise about a chain that may itself be minutes old. A
 * verifier that reports "anchored" for that state is reporting the
 * attacker's best case as if it were the defender's.
 *
 * The four states are deliberately not a score. They are different
 * KINDS of answer, and the caller has to decide what each is worth:
 *
 *   unanchored    — entries exist, nothing was ever submitted.
 *   pending_only  — submitted, nothing confirmed. A calendar's promise.
 *                   Weakest state that still looks like progress.
 *   confirmed     — at least one Bitcoin-confirmed entry vouches.
 *   chain_broken  — the log does not recompute; the rest is moot.
 */
function anchorConfidence(entries, chain, hasVoucher) {
  if (!chain.ok) return "chain_broken";
  if (hasVoucher) return "confirmed";
  const anySubmitted = entries.some(
    (entry) =>
      entry?.ots?.status === "pending" || entry?.ots?.status === "complete",
  );
  return anySubmitted ? "pending_only" : "unanchored";
}

/** did:web -> the host-rooted anchor-log URL, ports decoded per did:web. */
function anchorLogUrlFor(did) {
  const host = did.slice("did:web:".length).split("#")[0].split(":")[0];
  return `https://${host.replace(/%3A/gi, ":")}/.well-known/anchor-log.json`;
}

function sequenceOf(entry) {
  const value = entry?.snapshot?.sequence;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function snapshotNamesKey(snapshot, wanted) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const current = String(snapshot.current_public_key ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (current.length > 0 && current === wanted) return true;
  const retired = Array.isArray(snapshot.retired_keys)
    ? snapshot.retired_keys
    : [];
  return retired.some((key) => {
    const hex = String(key?.public_key ?? "")
      .replace(/^0x/, "")
      .toLowerCase();
    return hex.length > 0 && hex === wanted;
  });
}

/**
 * The canonical byte string an anchor snapshot hashes to.
 *
 * DERIVED, NEVER READ OFF THE PAGE. A log that publishes both a
 * snapshot and the string it claims to have hashed can publish two
 * different things — show you an innocent snapshot and hash a
 * different one. So this rebuilds the string from the snapshot's own
 * fields in the documented order and ignores any `canonical_form` the
 * issuer supplied. Unknown fields are dropped rather than appended,
 * because a hash that grows with whatever the issuer adds is not a
 * fixed form.
 */
export function canonicalizeAnchorSnapshot(snapshot) {
  const retired = Array.isArray(snapshot?.retired_keys)
    ? snapshot.retired_keys
    : [];
  return JSON.stringify({
    version: snapshot?.version,
    sequence: snapshot?.sequence,
    taken_at: snapshot?.taken_at,
    previous_digest: snapshot?.previous_digest ?? null,
    current_public_key: snapshot?.current_public_key,
    retired_keys: [...retired]
      .map((key) => ({
        public_key: String(key?.public_key ?? ""),
        retired_on: String(key?.retired_on ?? ""),
      }))
      .sort((a, b) =>
        a.retired_on === b.retired_on
          ? a.public_key.localeCompare(b.public_key)
          : a.retired_on.localeCompare(b.retired_on),
      ),
    artifacts_issued_total: snapshot?.artifacts_issued_total,
  });
}

/** SHA-256 hex. WebCrypto by default; injectable like `verify` is. */
async function sha256Hex(text, options = {}) {
  if (typeof options.digest === "function") {
    return options.digest(text);
  }
  const bytes = new TextEncoder().encode(text);
  const hashed = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recompute an anchor log end to end: every digest, every link.
 *
 * This is the whole reason the anchor log is worth more than a
 * sentence on a website. Three things are checked, and each catches a
 * different lie:
 *
 *   - REHASH. sha256 of the canonical snapshot must equal the
 *     published digest. Catches an edited snapshot.
 *   - LINK. `previous_digest` must equal the previous entry's actual
 *     recomputed digest. Catches an edited-and-rehashed snapshot,
 *     because the next entry still commits to the old digest.
 *   - SEQUENCE. Consecutive published entries must step by one.
 *     Catches a deleted entry, which the link check alone would miss
 *     if the deletion took a matched pair with it.
 *
 * A log that does not start at sequence 1 is NOT reported as broken —
 * it may simply be paged or capped — but it is reported, because
 * "the history before this point was not published here" is
 * something a reader should be told rather than left to assume.
 */
export async function verifyAnchorChain(log, options = {}) {
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  const problems = [];
  const notes = [];
  if (entries.length === 0) {
    return { ok: true, problems, notes, checked: 0 };
  }

  let previousDigest = null;
  let previousSequence = null;
  for (const entry of entries) {
    const snapshot = entry?.snapshot;
    const sequence = sequenceOf(entry);
    const label = Number.isFinite(sequence) ? `sequence ${sequence}` : "an entry";
    if (!snapshot || typeof snapshot !== "object") {
      problems.push(`${label}: no snapshot published, so nothing can be checked`);
      previousDigest = null;
      previousSequence = sequence;
      continue;
    }
    if (!Number.isFinite(sequence)) {
      problems.push("an entry has no numeric sequence");
    }

    const canonical = canonicalizeAnchorSnapshot(snapshot);
    let recomputed;
    try {
      recomputed = await sha256Hex(canonical, options);
    } catch (error) {
      problems.push(`${label}: could not hash (${String(error)})`);
      previousDigest = null;
      previousSequence = sequence;
      continue;
    }
    if (recomputed !== String(entry?.digest ?? "").toLowerCase()) {
      problems.push(
        `${label}: published digest does not match the published snapshot`,
      );
    }
    if (
      typeof entry?.canonical_form === "string" &&
      entry.canonical_form !== canonical
    ) {
      problems.push(
        `${label}: the issuer's canonical_form is not the snapshot they published`,
      );
    }

    if (previousSequence === null) {
      if (sequence !== 1) {
        notes.push(
          `chain starts at sequence ${sequence}; entries before it were not published here`,
        );
      }
      if (sequence === 1 && snapshot.previous_digest !== null) {
        problems.push("sequence 1: genesis entry claims a previous digest");
      }
    } else {
      if (Number.isFinite(sequence) && sequence !== previousSequence + 1) {
        problems.push(
          `gap between sequence ${previousSequence} and ${sequence}: an entry is missing`,
        );
      }
      if (
        previousDigest !== null &&
        String(snapshot.previous_digest ?? "").toLowerCase() !== previousDigest
      ) {
        problems.push(
          `${label}: previous_digest does not match the entry before it`,
        );
      }
    }

    previousDigest = recomputed;
    previousSequence = sequence;
  }

  return { ok: problems.length === 0, problems, notes, checked: entries.length };
}

/**
 * THE SERVICE-WINDOW CHECK — layer 3 of verification, the one both
 * this package and most verifiers skip.
 *
 * Layer 1 asks "does the signature verify?". Layer 2 asks "is the key
 * genuinely the issuer's?" — that is key resolution above. This asks
 * the question neither of those covers: WAS THE KEY AUTHORIZED AT THE
 * TIME THE ARTIFACT CLAIMS? A stolen retired key can sign an artifact
 * dated after its own retirement; layers 1 and 2 both pass — the
 * signature is real and the key genuinely was the issuer's — and the
 * artifact is still a forgery, because at its claimed date that key
 * had no authority to sign anything. The issuer's published service
 * dates are the only thing that catches it, and until 2026-08-24
 * nothing here compared them.
 *
 * INPUT is the key_history shape issuers publish beside their key
 * (scvd.store serves it at /.well-known/scvd-signing-key; the shape
 * is generic): `current.public_key` + `current.in_service_from`, and
 * `retired[]` entries each carrying `public_key`, `in_service_from`,
 * `retired_on`. Nothing else is read.
 *
 * DAYS, NOT INSTANTS, AND INCLUSIVE AT BOTH ENDS. Service dates are
 * published as calendar dates, and a handover is two moves that
 * cannot be simultaneous — the announcement deploys while the old key
 * still signs, the secret swaps after. An artifact dated ON the
 * retirement day is therefore the expected shape of the last honest
 * artifacts a key ever signs, and flagging it would call the swap
 * window itself a forgery. The comparison is lexicographic on the
 * ISO date part, which for YYYY-MM-DD is chronological.
 *
 * WHAT IT STILL DOES NOT PROVE: the window comes from the issuer's
 * own published registry, which the issuer can edit. Where the issuer
 * anchors key history (checkAnchoredKeyHistory above), the anchor
 * bounds how far back that registry could have been rewritten; this
 * check and that one are two halves of the same question.
 */
export function checkKeyServiceWindow(keyHistory, publicKeyHex, artifactIso) {
  const wanted = String(publicKeyHex ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (wanted.length === 0) {
    return {
      status: "unknown_key",
      window: null,
      detail: "no public key given to look up",
    };
  }

  const currentKey = String(keyHistory?.current?.public_key ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  let window = null;
  if (currentKey.length > 0 && currentKey === wanted) {
    window = {
      in_service_from: String(keyHistory.current.in_service_from ?? ""),
      retired_on: null,
    };
  } else {
    const retired = (
      Array.isArray(keyHistory?.retired) ? keyHistory.retired : []
    ).find(
      (entry) =>
        String(entry?.public_key ?? "")
          .replace(/^0x/, "")
          .toLowerCase() === wanted,
    );
    if (retired) {
      window = {
        in_service_from: String(retired.in_service_from ?? ""),
        retired_on: String(retired.retired_on ?? ""),
      };
    }
  }
  if (!window) {
    return {
      status: "unknown_key",
      window: null,
      detail:
        "this key appears nowhere in the issuer's published key history — " +
        "the artifact may be internally consistent, but it is not attributable, " +
        "and no service window exists to check it against",
    };
  }

  // The date PART, because windows are calendar dates. An artifact
  // date that does not start with a parseable YYYY-MM-DD is reported
  // rather than guessed at — an unfalsifiable date is a finding, not
  // a pass.
  const day = String(artifactIso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return {
      status: "undated",
      window,
      detail:
        "the artifact carries no parseable ISO date, so the service window cannot be checked against it",
    };
  }

  if (window.in_service_from && day < window.in_service_from) {
    return {
      status: "before_service",
      window,
      detail:
        `the artifact is dated ${day}, before this key entered service on ` +
        `${window.in_service_from}. A key cannot sign before it exists: either the ` +
        "artifact's date is false or the signature was applied later and backdated. " +
        "Treat the date as unproven whatever the signature says.",
    };
  }
  if (window.retired_on && day > window.retired_on) {
    return {
      status: "after_retirement",
      window,
      detail:
        `the artifact is dated ${day}, after this key retired on ${window.retired_on}. ` +
        "A retired key has no authority at that date — the signature may be " +
        "cryptographically genuine and the key genuinely the issuer's, and the " +
        "artifact is STILL not evidence of anything at its claimed time. This is " +
        "the exact shape a stolen retired key produces.",
    };
  }
  return {
    status: "in_service",
    window,
    detail: window.retired_on
      ? `dated ${day}, inside this key's published service window (${window.in_service_from} to ${window.retired_on}, inclusive — an artifact dated on the retirement day itself is the expected shape of a handover's last honest signatures)`
      : `dated ${day}, and the key has been in service since ${window.in_service_from} with no retirement published`,
  };
}

/** A one-line human summary; handy in CI logs. */
export function formatResult(result) {
  const lines = result.checks.map(
    (check) =>
      `${check.ok ? "PASS" : check.advisory ? "NOTE" : check.status && check.status !== "invalid" ? check.status.toUpperCase() : "FAIL"}  ${check.name}: ${check.detail}`,
  );
  return `${result.ok ? "VERIFIED" : result.status === "unsupported" || result.status === "inconclusive" ? result.status.toUpperCase() : "REJECTED"}\n${lines.join("\n")}`;
}
