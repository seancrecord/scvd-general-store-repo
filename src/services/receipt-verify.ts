import { jcsCanonicalize, signJcs } from "@/lib/jcs";
import {
  cachedPublicKeyHex,
  signMessage,
  verifyBytesSignature,
  verifyMessageSignature,
} from "@/lib/signing";
import { attributeKey } from "@/store/key-registry";
import type { Env } from "@/types";

/**
 * THE RECEIPT-VERIFICATION DESK — anyone's receipt in, a signed
 * verdict out (outside-reads log item 11, P3 of the ROI order: "the
 * conformance desk pointed at receipts instead of offers").
 *
 * WHAT IT CHECKS: structure. Signature material found, key format
 * readable, the signature verified over every served form we can
 * derive, the JCS twin when one is claimed, expiry fields honored,
 * and — when the key is ours — attribution against the published key
 * history. WHAT IT NEVER CHECKS is stated on every verdict rather
 * than implied: on-chain settlement (that is the paid
 * settlement_attestation, a different instrument), delivery quality,
 * revocation, and — for keys that are not ours — who actually holds
 * the key. "Unknown" and "bad" drive different automated actions, so
 * the taxonomy keeps them apart the way the AP2/hopley trust-state
 * vocabulary does.
 *
 * STATELESS BY DESIGN: the receipt is read, verified, digested, and
 * FORGOTTEN — nothing is stored, and the verdict binds to the input
 * by sha256 digest so the caller can prove what was checked without
 * this store ever republishing their document.
 *
 * Assurance level: observation. The verdict is a dated fact about
 * one document at one moment.
 *
 * TWO ENVELOPES, ONE DESK (2026-10-01). The desk was born reading the
 * store's own shape — `signature` + `public_key` in hex beside the
 * content — and its door has said "any issuer's" since the day it
 * opened. The most visible receipt format an agent's runtime emits
 * today is a DSSE envelope (payloadType, base64 payload, signatures[]
 * with a keyid), Ed25519 over the pre-authentication encoding, and
 * the desk could not read one: `grep -rn dsse src/` found nothing on
 * the day this was written. A DSSE envelope carries a key id, never
 * the key, so the caller supplies it (hex, `ed25519:<base64url>`, or
 * bare base64) and without one the verdict is insufficient_evidence,
 * never invalid — the same discipline the free verifier package keeps
 * for a key it cannot fetch. The bytes are verified exactly as served:
 * the issuer's canonical form is theirs, and re-serialising the
 * payload would be a second form nobody signed. What this desk never
 * claims for a DSSE envelope is said on the verdict: the actor named
 * inside is the signer's own label, the parent link and any checkpoint
 * are not walked, and the payload being true is not what a signature
 * proves.
 */

export type ReceiptVerdict =
  | "valid"
  | "invalid"
  | "expired"
  | "insufficient_evidence"
  | "unsupported"
  | "indeterminate";

export interface ReceiptCheck {
  name: string;
  outcome: "pass" | "fail" | "skipped";
  detail: string;
}

export interface ReceiptReading {
  verdict: ReceiptVerdict;
  checks: ReceiptCheck[];
  /** Always stated, never implied. */
  not_checked: string[];
  /** "scvd.store (current key)" | "scvd.store (retired key)" |
   * "unknown issuer" | null when no key was readable. */
  issuer: string | null;
  /** sha256 of the exact submitted bytes, so the verdict binds to
   * the document without this store storing or republishing it. */
  receipt_sha256: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Fields that are signature material rather than signed content. */
const SIGNATURE_FIELDS = new Set([
  "signature",
  "signature_jcs",
  "signature_jcs_covers",
  "public_key",
  "verify_hint",
  "ots",
]);

function contentOf(receipt: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (!SIGNATURE_FIELDS.has(key)) content[key] = value;
  }
  return content;
}

const EXPIRY_FIELDS = ["expires", "valid_until", "expiry", "expires_at"];

export interface ReceiptHints {
  /**
   * The issuer's Ed25519 public key, for envelopes that carry a key id
   * and not the key (DSSE). Hex, `ed25519:<base64url>`, or bare
   * base64. Read from the body's sibling `public_key` when absent.
   */
  publicKey?: string;
}

export async function readReceipt(
  env: Env,
  rawBody: string,
  /** The reading clock, injected — same law as the desk (3.3/F4). */
  now: Date = new Date(),
  hints: ReceiptHints = {},
): Promise<ReceiptReading> {
  const receiptSha = await sha256Hex(rawBody);
  const checks: ReceiptCheck[] = [];
  const notChecked = [
    "On-chain settlement — a signature proves the document, never the money; the paid settlement_attestation reads the chain itself.",
    "Delivery and fulfillment — a receipt that verifies can still describe goods that never arrived.",
    "Revocation — no revocation registry is consulted.",
  ];
  const done = (
    verdict: ReceiptVerdict,
    issuer: string | null,
  ): ReceiptReading => ({
    verdict,
    checks,
    not_checked: notChecked,
    issuer,
    receipt_sha256: receiptSha,
  });

  let receipt: unknown;
  try {
    receipt = JSON.parse(rawBody);
  } catch {
    checks.push({
      name: "shape",
      outcome: "fail",
      detail: "The body is not JSON; nothing here is verifiable as a receipt.",
    });
    return done("unsupported", null);
  }
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    Array.isArray(receipt)
  ) {
    checks.push({
      name: "shape",
      outcome: "fail",
      detail: "A receipt is a JSON object; this is not one.",
    });
    return done("unsupported", null);
  }
  checks.push({ name: "shape", outcome: "pass", detail: "JSON object." });
  const record = receipt as Record<string, unknown>;

  if (looksLikeDsse(record)) {
    return readDsse(env, record, hints, now, checks, notChecked, done);
  }

  const signature = typeof record["signature"] === "string" ? record["signature"].toLowerCase() : null;
  const publicKey = typeof record["public_key"] === "string" ? record["public_key"].toLowerCase() : null;
  if (!signature || !publicKey) {
    checks.push({
      name: "signature-material",
      outcome: "fail",
      detail:
        "No `signature` + `public_key` pair found; there is nothing cryptographic to check. If the issuer signs some other way, this desk does not speak it yet.",
    });
    return done("unsupported", null);
  }
  checks.push({
    name: "signature-material",
    outcome: "pass",
    detail: "signature and public_key present.",
  });

  if (!HEX_64.test(publicKey) || !HEX_128.test(signature)) {
    checks.push({
      name: "key-format",
      outcome: "fail",
      detail:
        "Not ed25519-hex shapes (64-hex key, 128-hex signature). The material exists but this desk cannot read it — insufficient evidence, not proof of forgery.",
    });
    return done("insufficient_evidence", null);
  }
  checks.push({
    name: "key-format",
    outcome: "pass",
    detail: "ed25519 hex shapes.",
  });

  // The signature must verify over SOME served form. Three candidates,
  // most explicit first; the passing form is named in the check.
  const candidates: { form: string; message: string }[] = [];
  if (typeof record["signed_payload"] === "string") {
    candidates.push({
      form: "signed_payload verbatim",
      message: record["signed_payload"],
    });
  }
  if (record["payload"] && typeof record["payload"] === "object") {
    candidates.push({
      form: "JSON.stringify(payload) in served order",
      message: JSON.stringify(record["payload"]),
    });
  }
  candidates.push({
    form: "JSON.stringify of the document minus signature fields, served order",
    message: JSON.stringify(contentOf(record)),
  });

  let verifiedForm: string | null = null;
  for (const candidate of candidates) {
    if (await verifyMessageSignature(candidate.message, signature, publicKey)) {
      verifiedForm = candidate.form;
      break;
    }
  }

  const current = await cachedPublicKeyHex(env.SIGNING_KEY);
  const attribution = attributeKey(publicKey, current);
  const issuer =
    attribution.status === "unrecognised"
      ? "unknown issuer — the signature may verify, but WHO holds this key is not checked"
      : `scvd.store (${attribution.status} key)`;
  if (attribution.status === "unrecognised") {
    notChecked.push(
      "Issuer identity — the key is not in this store's history and no outside key directory is consulted; a verifying signature proves consistency, never authorship.",
    );
  }

  if (!verifiedForm) {
    checks.push({
      name: "primary-signature",
      outcome: "fail",
      detail: `The signature does not verify over any derivable form (${candidates.map((c) => c.form).join("; ")}). Either the document was altered after signing or it uses a canonicalization this desk did not try.`,
    });
    return done("invalid", issuer);
  }
  checks.push({
    name: "primary-signature",
    outcome: "pass",
    detail: `Verifies over: ${verifiedForm}.`,
  });

  if (typeof record["signature_jcs"] === "string") {
    const jcsSource =
      record["payload"] && typeof record["payload"] === "object"
        ? (record["payload"] as Record<string, unknown>)
        : contentOf(record);
    const jcsOk =
      HEX_128.test(String(record["signature_jcs"]).toLowerCase()) &&
      (await verifyMessageSignature(
        jcsCanonicalize(jcsSource),
        String(record["signature_jcs"]).toLowerCase(),
        publicKey,
      ));
    checks.push({
      name: "jcs-signature",
      outcome: jcsOk ? "pass" : "fail",
      detail: jcsOk
        ? "The claimed RFC 8785 twin verifies."
        : "The document CLAIMS an RFC 8785 twin signature and it does not verify — a claimed proof that fails is worse than no claim.",
    });
    if (!jcsOk) return done("invalid", issuer);
  } else {
    checks.push({
      name: "jcs-signature",
      outcome: "skipped",
      detail: "No signature_jcs claimed; nothing to check.",
    });
  }

  const expired = datedChecks(record, payloadObject(record), now, checks);

  return done(expired ? "expired" : "valid", issuer);
}

/** The JSON object a document carries under `payload`, when it is one. */
function payloadObject(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const payload = record["payload"];
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : undefined;
}

/**
 * Expiry and staleness, by the document's own fields, read with the
 * injected clock. Returns whether the issuer's terms say REFUSE.
 */
function datedChecks(
  record: Record<string, unknown>,
  payload: Record<string, unknown> | undefined,
  now: Date,
  checks: ReceiptCheck[],
): boolean {
  let expired = false;
  for (const field of EXPIRY_FIELDS) {
    const value = record[field] ?? payload?.[field];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      if (new Date(value).getTime() < now.getTime()) expired = true;
      checks.push({
        name: "expiry",
        outcome: expired ? "fail" : "pass",
        detail: `${field} = ${value}${expired ? " — in the past; the issuer's own terms say to refuse this document." : ", still current."}`,
      });
      break;
    }
  }
  if (!checks.some((check) => check.name === "expiry")) {
    checks.push({
      name: "expiry",
      outcome: "skipped",
      detail: "No expiry field found; the document does not age by its own terms.",
    });
  }

  /*
   * STALENESS BESIDE EXPIRY, deliberately two checks (3.3, D2).
   * Expiry is the issuer saying REFUSE this document; stale_after is
   * the issuer saying stop presenting it as current — the document
   * stays true about its moment. Conflating them would make honest
   * aging look like invalidity. Derived here at read with the
   * injected clock; nothing is stored.
   */
  const staleRaw = record["stale_after"] ?? payload?.["stale_after"];
  if (typeof staleRaw === "string" && !Number.isNaN(Date.parse(staleRaw))) {
    const isStale = new Date(staleRaw).getTime() < now.getTime();
    checks.push({
      name: "staleness",
      outcome: isStale ? "fail" : "pass",
      detail: isStale
        ? `stale_after ${staleRaw} is behind the reading clock (${now.toISOString()}): the issuer's own terms say to read this as history, not as a statement about now.`
        : `stale_after ${staleRaw}, still presentable as current by the issuer's own terms.`,
    });
  }
  return expired;
}

/*
 * ---------------------------------------------------------------
 * DSSE — the Dead Simple Signing Envelope, as the in-toto and
 * Sigstore world writes it and as an agent runtime's receipts arrive.
 * ---------------------------------------------------------------
 */

/** The envelope's three fields; a key id, never a key. */
function looksLikeDsse(record: Record<string, unknown>): boolean {
  return (
    typeof record["payloadType"] === "string" &&
    typeof record["payload"] === "string" &&
    Array.isArray(record["signatures"])
  );
}

/** Base64, standard or URL alphabet, padded or not → bytes; null when it is neither. */
function base64ToBytes(value: string): Uint8Array | null {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalised)) return null;
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One Ed25519 public key, three spellings: 64 hex characters (ours),
 * `ed25519:<base64url>` (the trust-bundle spelling an agent runtime
 * prints beside a key id), or bare base64 of the 32 bytes. Anything
 * else is a key this desk cannot read — insufficient evidence, never
 * a forgery.
 */
export function parseEd25519PublicKey(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (HEX_64.test(trimmed.toLowerCase())) {
    return Uint8Array.from(
      (trimmed.toLowerCase().match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
  }
  const unprefixed = trimmed.replace(/^ed25519:/i, "");
  const bytes = base64ToBytes(unprefixed);
  return bytes && bytes.length === 32 ? bytes : null;
}

/**
 * The pre-authentication encoding, byte for byte as the DSSE spec
 * writes it: "DSSEv1" SP LEN(type) SP type SP LEN(payload) SP payload,
 * with both lengths the decimal byte count. The payload rides as the
 * decoded bytes, never re-decoded as text.
 */
export function dssePreAuthenticationEncoding(
  payloadType: string,
  payload: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(payloadType);
  const head = encoder.encode(`DSSEv1 ${typeBytes.length} `);
  const middle = encoder.encode(` ${payload.length} `);
  const out = new Uint8Array(head.length + typeBytes.length + middle.length + payload.length);
  out.set(head, 0);
  out.set(typeBytes, head.length);
  out.set(middle, head.length + typeBytes.length);
  out.set(payload, head.length + typeBytes.length + middle.length);
  return out;
}

async function readDsse(
  env: Env,
  record: Record<string, unknown>,
  hints: ReceiptHints,
  now: Date,
  checks: ReceiptCheck[],
  notChecked: string[],
  done: (verdict: ReceiptVerdict, issuer: string | null) => ReceiptReading,
): Promise<ReceiptReading> {
  const payloadType = record["payloadType"] as string;
  const signatures = (record["signatures"] as unknown[]).filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
  checks.push({
    name: "envelope",
    outcome: "pass",
    detail: `DSSE envelope: payloadType ${payloadType}, ${signatures.length} signature${signatures.length === 1 ? "" : "s"}. Verified over the pre-authentication encoding of the bytes exactly as served; the issuer's canonical form is theirs.`,
  });
  // What a DSSE envelope's signature does not say, stated once here
  // so no reader has to infer it from the issuer's own docs.
  notChecked.push(
    "Actor binding — the key id and any actor named inside the payload are the signer's own labels; whether that key belongs to that actor is not checked here (the issuer's verifier may call this asserted rather than proven).",
    "Chain and checkpoint — a parent link or Merkle inclusion claimed inside the payload is not walked; this is one envelope, read alone.",
    "Truth of the payload — a signature proves these bytes came from this key unchanged, never that what they report happened.",
  );

  if (signatures.length === 0) {
    checks.push({
      name: "signature-material",
      outcome: "fail",
      detail: "signatures[] is empty; there is nothing cryptographic to check.",
    });
    return done("unsupported", null);
  }
  checks.push({
    name: "signature-material",
    outcome: "pass",
    detail: `signatures[] present${signatures.some((s) => typeof s["keyid"] === "string") ? `, key id${signatures.length === 1 ? "" : "s"} ${signatures.map((s) => (typeof s["keyid"] === "string" ? s["keyid"] : "(none)")).join(", ")}` : ""}. A DSSE envelope names its key and does not carry it.`,
  });

  const payloadBytes = base64ToBytes(record["payload"] as string);
  if (!payloadBytes) {
    checks.push({
      name: "key-format",
      outcome: "fail",
      detail: "payload is not base64; the envelope cannot be re-encoded for verification. Insufficient evidence, not proof of forgery.",
    });
    return done("insufficient_evidence", null);
  }

  const supplied =
    hints.publicKey ??
    (typeof record["public_key"] === "string" ? (record["public_key"] as string) : undefined);
  if (supplied === undefined) {
    checks.push({
      name: "key-unavailable",
      outcome: "fail",
      detail:
        "No public key supplied. A DSSE envelope carries a key id, not the key: send the issuer's Ed25519 key beside the envelope as `public_key` (64 hex characters, `ed25519:<base64url>`, or base64) or as the ?public_key= query parameter. Insufficient evidence, not a failed signature.",
    });
    return done("insufficient_evidence", null);
  }
  const keyBytes = parseEd25519PublicKey(supplied);
  if (!keyBytes) {
    checks.push({
      name: "key-format",
      outcome: "fail",
      detail:
        "The supplied public key is not an Ed25519 key this desk can read (64 hex, `ed25519:<base64url>`, or 32 bytes of base64). Insufficient evidence, not proof of forgery.",
    });
    return done("insufficient_evidence", null);
  }
  checks.push({ name: "key-format", outcome: "pass", detail: "Ed25519 public key, 32 bytes, supplied by the caller." });

  const publicKeyHex = bytesToHex(keyBytes);
  const current = await cachedPublicKeyHex(env.SIGNING_KEY);
  const attribution = attributeKey(publicKeyHex, current);
  const issuer =
    attribution.status === "unrecognised"
      ? "unknown issuer — the signature may verify, but WHO holds this key is not checked"
      : `scvd.store (${attribution.status} key)`;
  if (attribution.status === "unrecognised") {
    notChecked.push(
      "Issuer identity — the key was supplied by the caller, is not in this store's history, and no outside key directory is consulted; a verifying signature proves consistency with THAT key, never authorship.",
    );
  }

  const pae = dssePreAuthenticationEncoding(payloadType, payloadBytes);
  let verifiedIndex = -1;
  let readable = 0;
  for (const [index, entry] of signatures.entries()) {
    const sig = typeof entry["sig"] === "string" ? base64ToBytes(entry["sig"]) : null;
    if (!sig || sig.length !== 64) continue;
    readable += 1;
    if (await verifyBytesSignature(pae, sig, keyBytes)) {
      verifiedIndex = index;
      break;
    }
  }
  if (readable === 0) {
    checks.push({
      name: "primary-signature",
      outcome: "fail",
      detail: "No entry in signatures[] carries a 64-byte base64 `sig`; the material exists but this desk cannot read it. Insufficient evidence, not proof of forgery.",
    });
    return done("insufficient_evidence", issuer);
  }
  if (verifiedIndex < 0) {
    checks.push({
      name: "primary-signature",
      outcome: "fail",
      detail: `None of the ${readable} readable signature${readable === 1 ? "" : "s"} verifies over the pre-authentication encoding with the supplied key. Either the envelope was altered after signing, or this is not the key that signed it.`,
    });
    return done("invalid", issuer);
  }
  const keyid = signatures[verifiedIndex]?.["keyid"];
  checks.push({
    name: "primary-signature",
    outcome: "pass",
    detail: `signatures[${verifiedIndex}]${typeof keyid === "string" ? ` (keyid ${keyid})` : ""} verifies over the DSSE pre-authentication encoding with the supplied key.`,
  });

  // The payload is the issuer's document; when it is JSON, its own
  // dated fields are honoured the way every other receipt's are.
  let payloadJson: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payloadJson = parsed as Record<string, unknown>;
    }
  } catch {
    payloadJson = undefined;
  }
  const expired = datedChecks({}, payloadJson, now, checks);
  return done(expired ? "expired" : "valid", issuer);
}

export interface ReceiptVerification {
  payload: {
    artifact: "receipt_verification";
    verified_at: string;
    verdict: ReceiptVerdict;
    receipt_sha256: string;
    issuer: string | null;
    checks: ReceiptCheck[];
    not_checked: string[];
    assurance_level: "observation";
    stateless: string;
  };
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
  verify_hint: string;
}

/** The signed verdict artifact — dual-signed like every new class. */
export async function signReading(
  env: Env,
  reading: ReceiptReading,
  now: Date = new Date(),
): Promise<ReceiptVerification> {
  const payload: ReceiptVerification["payload"] = {
    artifact: "receipt_verification",
    verified_at: now.toISOString(),
    verdict: reading.verdict,
    receipt_sha256: reading.receipt_sha256,
    issuer: reading.issuer,
    checks: reading.checks,
    not_checked: reading.not_checked,
    assurance_level: "observation",
    stateless:
      "The submitted document was verified and forgotten — nothing was stored; this verdict binds to it only by the sha256 above.",
  };
  const signedPayload = JSON.stringify(payload);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  return {
    payload,
    signed_payload: signedPayload,
    signature,
    signature_jcs: await signJcs(
      payload as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    public_key: publicKey,
    verify_hint:
      "ed25519_verify(utf8(signed_payload), hex(signature), hex(public_key)); key history at /.well-known/scvd-signing-key.",
  };
}
