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

/** Deterministic JSON so a signature always covers the same bytes. */
export function canonicalizeCertificate(cert: Certificate): string {
  const ordered: Record<string, string | number> = {
    cert_id: cert.cert_id,
    item: cert.item,
    patron_number: cert.patron_number,
    date: cert.date,
  };
  if (cert.name !== undefined) {
    ordered["name"] = cert.name;
  }
  if (cert.tip_usdc !== undefined) {
    ordered["tip_usdc"] = cert.tip_usdc;
  }
  if (cert.note !== undefined) {
    ordered["note"] = cert.note;
  }
  if (cert.win !== undefined) {
    ordered["win"] = cert.win;
  }
  return JSON.stringify(ordered);
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

export async function verifyCertificateSignature(
  cert: Certificate,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeCertificate(cert),
    signatureHex,
    publicKeyHex,
  );
}

export async function getPublicKeyHex(signingKeyHex: string): Promise<string> {
  const publicKey = await ed25519.getPublicKeyAsync(hexToBytes(signingKeyHex));
  return bytesToHex(publicKey);
}
