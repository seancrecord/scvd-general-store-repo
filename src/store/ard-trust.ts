/** Signing profile read against ARD §4.5 on 2026-09-06; docs/SPEC_READS.md. */
export const ARD_TRUST_SIGNS =
  "Detached JWS (RFC 7515 Appendix F), EdDSA with the existing certificate key. Remove only trustManifest.signature, JCS-canonicalize the remaining trustManifest (RFC 8785), UTF-8 encode and base64url encode it. Restore that payload between the two dots and verify the protected header plus '.' plus encoded payload. The protected kid resolves through the existing did:web document. Also verify provenance.sourceDigest: remove host.trustManifest and every entries[].trustManifest from the full catalog, preserve every other field, JCS-canonicalize, SHA-256 the UTF-8 bytes, and compare 'sha256:' plus lowercase hex. Each entry carries the same trust envelope; an extracted entry must match the same identifier in the full catalog at provenance.sourceId, with every non-trust field equal, to check this binding. A valid signature, matching catalog digest AND independently verified anchor evidence establish that this manifest was signed by a key with an externally anchored succession history.";

export const ARD_TRUST_LIMITS =
  "The signed digest binds the catalog's entries, URLs, descriptions and updatedAt. It does not prove that any entry in ard.json is accurate today, authenticate the resource bytes fetched from those URLs, or establish freshness. The anchor log dates key state, not this manifest or the right to hold a key. A stolen signing key can still sign. A first-time reader without a previously trusted checkpoint cannot rule out a replacement history.";

export const ARD_ANCHOR_CHECK =
  "Verify the JWS AND match its public key to snapshot.current_public_key (or a retired_keys public_key for a historical signature) in an anchor-log entry with existed_by.status of bitcoin_confirmed or covered_by_later_anchor. Recompute the snapshot digest and previous_digest links, then independently verify its OpenTimestamps proof against Bitcoin block headers; for coverage, follow via_sequence and verify the later proof and every intervening link. The status word alone is this store's bookkeeping. Check continuity from a previously trusted checkpoint and each handover announcement signed by the outgoing key, with service dates, at /.well-known/scvd-signing-key. Compare the Bitcoin block time with the claimed history; a newly stamped replacement is not old history. Missing evidence, declared_only, pending proofs, broken links or an unknown key do not establish anchored identity.";

export function ardTrustDeclaration(base: string, sourceDigest?: string) {
  return {
    identity: `did:web:${new URL(base).host}`,
    identityType: "did",
    trustSchema: {
      identifier: `${base}/attestation#ard_trust_manifest`,
      version: "1",
      governanceUri: `${base}/attestation#ard_trust_manifest`,
      verificationMethods: ["did:web", "JWS-EdDSA-RFC8785", "OpenTimestamps-Bitcoin", "outgoing-key-succession"],
    },
    attestations: [{
      type: "scvd-signing-key-succession",
      uri: `${base}/.well-known/anchor-log.json`,
      mediaType: "application/json",
    }],
    ...(sourceDigest ? { provenance: [{
      relation: "publishedFrom",
      sourceId: `${base}/.well-known/ard.json`,
      sourceDigest,
    }] } : {}),
  };
}

export type ArdTrustManifest = ReturnType<typeof ardTrustDeclaration> & { signature: string };
