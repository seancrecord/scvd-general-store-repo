import { jcsCanonicalize, signJcs } from "@/lib/jcs";
import {
  cachedPublicKeyHex,
  signMessage,
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

export async function readReceipt(
  env: Env,
  rawBody: string,
  /** The reading clock, injected — same law as the desk (3.3/F4). */
  now: Date = new Date(),
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

  let expired = false;
  for (const field of EXPIRY_FIELDS) {
    const value = record[field] ?? (record["payload"] as Record<string, unknown> | undefined)?.[field];
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
  {
    const staleRaw =
      record["stale_after"] ??
      (record["payload"] as Record<string, unknown> | undefined)?.["stale_after"];
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
  }

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
