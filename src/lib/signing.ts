import * as ed25519 from "@noble/ed25519";
import type { Certificate } from "@/types";

/**
 * ed25519 signing for certificates and badges.
 * SIGNING_KEY is a 32-byte seed as 64 hex characters (npm run keys:generate).
 * Signature + stable URL is the whole authenticity model, no chain writes.
 */

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("SIGNING_KEY must be 64 hex characters (32-byte seed)");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * EVERY Certificate FIELD, IN SIGNING ORDER.
 *
 * This list fell behind the type TWICE without anyone noticing, which is
 * why it is now a list walked by a loop instead of a hand-written object
 * literal. `tag` (graffiti_on_a_train) and `attests` (the settlement
 * observation's evidence hash) were both added to Certificate on
 * 2026-07-28, both served on the certificate, and NEITHER was signed.
 *
 * The `attests` case was the dangerous one: that field is the binding
 * between a certificate and the attestation it vouches for, and an
 * unsigned binding can be altered without breaking the signature — so
 * the one field whose whole job was to make /api/verify answer for a
 * second artifact was the one field the signature did not cover.
 *
 * Found 2026-07-30 by CV, from outside, by trying to verify a real
 * certificate with real ed25519 and failing against every plausible
 * canonicalization. Nothing inside this repo caught it: every test
 * verified through the same function that signed, so the omission was
 * invisible from in here and total from out there.
 *
 * ORDER IS FROZEN for the first eight entries. Old signatures cover
 * exactly those, in exactly that sequence; changing it silently voids
 * every certificate the store has ever issued.
 */
export const CERT_FIELDS = [
  "cert_id",
  "item",
  "patron_number",
  "date",
  "name",
  "tip_usdc",
  "note",
  "win",
  "tag",
  "attests",
  /**
   * The maker's mark, added 2026-07-30. It went in HERE FIRST, before
   * it was served anywhere, because a provenance claim is the one field
   * where displayed-but-unsigned is indistinguishable from a forgery:
   * anyone could change "house" to "keeper" and the signature would
   * still check out. The compile guard below is what made that ordering
   * automatic rather than remembered.
   */
  "made_by",
  /**
   * THE MONEY AND THE PAYER, added 2026-07-31 after an outside
   * operator's conformance list showed this store issuing receipts
   * with no amount on them. Appended, never inserted: the first eight
   * positions are frozen because old signatures cover exactly that
   * sequence, and the compile guard below is what makes adding a
   * Certificate field without adding it here a build failure rather
   * than a silent unsigned field — the defect CV found on tag and
   * attests, which is the whole reason this list is walked by a loop.
   */
  "paid_usdc",
  "asset",
  "network",
  "payer",
  "settlement_tx",
  /**
   * CROSS-PLATFORM RECEIPT RECOGNITION, added 2026-08-02. Appended,
   * never inserted, like everything since the first eight — old
   * signatures cover exactly the earlier sequence.
   *
   * The spec that arrived proposed this as additive and OUTSIDE the
   * signature. It cannot be: a cross-reference is a provenance claim
   * about another operator, so an unsigned one would let anyone staple
   * "zooid.fund co-signed this" onto a copy of our certificate with
   * our signature still verifying over it. The guard below turned that
   * design question into a build failure, which is what it is for.
   */
  "cross_ref",
  /**
   * THE RECEIPT CHAIN, added 2026-08-19. Appended, never inserted,
   * like everything since the first eight. Both stay OUT of
   * LEGACY_FIELDS_ADDED_SINCE for the cross_ref reason: neither
   * existed pre-2026-07-30, so no legacy certificate can honestly
   * carry one — keeping them inside the legacy form too means
   * stapling a purpose onto an old certificate breaks BOTH forms
   * instead of downgrading to a clean "legacy" pass. `purpose` is a
   * buyer claim and unsigned it would be forgeable onto our
   * signature; `from_the_store` is our own words, and unsigned words
   * on our receipt would be anyone's words.
   */
  "purpose",
  "from_the_store",
] as const;

/**
 * THE GUARD THAT MAKES THIS CLASS OF BUG A COMPILE ERROR. Add a field to
 * Certificate without adding it here and typecheck fails, naming the
 * field it is missing. This is the actual fix; the two added fields are
 * only the instance of it.
 */
type UnsignedCertField = Exclude<keyof Certificate, (typeof CERT_FIELDS)[number]>;
const _everyCertFieldIsSigned: UnsignedCertField extends never
  ? true
  : UnsignedCertField = true;
void _everyCertFieldIsSigned;

/**
 * The pre-2026-07-30 field set. Certificates minted before the fix are
 * signed over this, so verification has to accept it — and the verify
 * endpoint has to SAY it did, naming the served fields the signature
 * does not cover, rather than quietly reporting a clean "valid".
 */
const LEGACY_FIELDS_ADDED_SINCE = [
  "tag",
  "attests",
  "made_by",
  "paid_usdc",
  "asset",
  "network",
  "payer",
  "settlement_tx",
  /**
   * cross_ref is DELIBERATELY ABSENT from this list, and a test proves
   * why. This list means "fields that existed and were SERVED on
   * pre-2026-07-30 certificates without being signed" — so a legacy
   * signature legitimately does not cover them, and the verify route
   * names them rather than reporting a clean pass.
   *
   * cross_ref did not exist then, so no legacy certificate can
   * honestly carry one. Putting it here would have excluded it from
   * the legacy canonical form, and THAT opens a bypass: for any
   * certificate carrying none of the fields above, the current and
   * legacy forms are byte-identical, so a signature over one verifies
   * as the other — and an attacker could staple a cross-reference to
   * another operator onto a genuine certificate and have it verify as
   * `legacy`. Leaving cross_ref out of this list keeps it inside the
   * legacy form too, so stapling one on breaks BOTH forms.
   *
   * Caught 2026-08-02 by a test that added a reference to a signed
   * certificate and expected `invalid`; it got `legacy`.
   */
] as const;

const LEGACY_CERT_FIELDS = CERT_FIELDS.filter(
  (field) =>
    !(LEGACY_FIELDS_ADDED_SINCE as readonly string[]).includes(field),
);

function canonicalize(
  cert: Certificate,
  fields: readonly (keyof Certificate)[],
): string {
  const ordered: Record<string, unknown> = {};
  for (const field of fields) {
    const value = cert[field];
    if (value !== undefined) {
      ordered[field] = value;
    }
  }
  return JSON.stringify(ordered);
}

/** Deterministic JSON so a signature always covers the same bytes. */
export function canonicalizeCertificate(cert: Certificate): string {
  return canonicalize(cert, CERT_FIELDS);
}

/**
 * The SAME subset the signature covers, as an object rather than as
 * bytes — for the JCS dual-emit (lib/jcs.ts), which derives its own
 * byte order by sorting keys. Both signatures cover exactly this
 * subset; they differ only in the serialization discipline.
 */
export function certificateSignedSubset(
  cert: Certificate,
): Record<string, unknown> {
  const subset: Record<string, unknown> = {};
  for (const field of CERT_FIELDS) {
    const value = cert[field];
    if (value !== undefined) {
      subset[field] = value;
    }
  }
  return subset;
}

/** What a certificate minted before 2026-07-30 was signed over. */
export function canonicalizeCertificateLegacy(cert: Certificate): string {
  return canonicalize(cert, LEGACY_CERT_FIELDS);
}

/** Which served fields a legacy signature leaves uncovered. */
export function fieldsOutsideLegacySignature(cert: Certificate): string[] {
  return LEGACY_FIELDS_ADDED_SINCE.filter(
    (field) => cert[field] !== undefined,
  );
}

export type CertificateSignatureForm = "current" | "legacy" | "invalid";

/**
 * Which canonical form this signature actually covers. The verify route
 * publishes the answer instead of collapsing it to a boolean, because
 * "valid, and here is exactly what it is valid over" is the only claim
 * a stranger can check.
 */
export async function certificateSignatureForm(
  cert: Certificate,
  signatureHex: string,
  publicKeyHex: string,
): Promise<CertificateSignatureForm> {
  if (
    await verifyMessageSignature(
      canonicalizeCertificate(cert),
      signatureHex,
      publicKeyHex,
    )
  ) {
    return "current";
  }
  if (
    await verifyMessageSignature(
      canonicalizeCertificateLegacy(cert),
      signatureHex,
      publicKeyHex,
    )
  ) {
    return "legacy";
  }
  return "invalid";
}

export async function signCertificate(
  cert: Certificate,
  signingKeyHex: string,
): Promise<{ signature: string; publicKey: string }> {
  return signMessage(canonicalizeCertificate(cert), signingKeyHex);
}

/** Sign any canonical string (stamps use this; certificates go through it). */
export async function signMessage(
  message: string,
  signingKeyHex: string,
): Promise<{ signature: string; publicKey: string }> {
  const seed = hexToBytes(signingKeyHex);
  const bytes = new TextEncoder().encode(message);
  const signature = await ed25519.signAsync(bytes, seed);
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  return {
    signature: bytesToHex(signature),
    publicKey: bytesToHex(publicKey),
  };
}

export async function verifyMessageSignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(message);
    const signature = Uint8Array.from(
      (signatureHex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    const publicKey = Uint8Array.from(
      (publicKeyHex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    return await ed25519.verifyAsync(signature, bytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Genuine or not. Accepts the legacy form too — a certificate minted
 * before the canonicalization was fixed is still one of ours, and
 * telling its holder otherwise would be a lie in the other direction.
 * Callers that need to know WHICH form use certificateSignatureForm.
 */
export async function verifyCertificateSignature(
  cert: Certificate,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  return (
    (await certificateSignatureForm(cert, signatureHex, publicKeyHex)) !==
    "invalid"
  );
}

export async function getPublicKeyHex(signingKeyHex: string): Promise<string> {
  const publicKey = await ed25519.getPublicKeyAsync(hexToBytes(signingKeyHex));
  return bytesToHex(publicKey);
}

/** One key per store, one derivation per isolate; 402s carry it in-payload. */
let cachedPublicKey: string | undefined;
export async function cachedPublicKeyHex(
  signingKeyHex: string,
): Promise<string> {
  if (!cachedPublicKey) {
    cachedPublicKey = await getPublicKeyHex(signingKeyHex);
  }
  return cachedPublicKey;
}
