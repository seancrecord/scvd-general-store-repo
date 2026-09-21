import { encodeBase58 } from "@/lib/base58";

/**
 * did:key FOR AN ED25519 PUBLIC KEY (2026-09-21, ruling R1).
 *
 * A did:web identity is bound to the domain that serves its document:
 * move the store and every certificate that names did:web:scvd.store
 * resolves only while the old domain keeps serving. A did:key is the
 * key itself, spelled as an identifier — multicodec ed25519-pub
 * (0xed, varint-encoded as 0xed 0x01) in front of the 32 raw bytes,
 * base58btc with the multibase prefix `z` — and resolves anywhere,
 * forever, with no server. The DID document lists it under
 * alsoKnownAs beside the did:web, so a certificate's signed issuer
 * survives a domain move: the same key, two names, one of them
 * needing nobody's permission to resolve.
 */
const ED25519_PUB_MULTICODEC = [0xed, 0x01];

export function didKeyFromEd25519Hex(publicKeyHex: string): string {
  const clean = publicKeyHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error("did:key needs a 32-byte ed25519 public key as 64 hex characters");
  const bytes = new Uint8Array(ED25519_PUB_MULTICODEC.length + 32);
  bytes.set(ED25519_PUB_MULTICODEC, 0);
  for (let i = 0; i < 32; i += 1) bytes[ED25519_PUB_MULTICODEC.length + i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return `did:key:z${encodeBase58(bytes)}`;
}

/** The issuer identity a certificate signs: the domain-bound name, with the key-bound name published beside it in the DID document. */
export function issuerDid(base: string): string {
  return `did:web:${new URL(base).host}`;
}
