export interface EvidenceBundle {
  format: "scvd-evidence-bundle/v1";
  artifact: { algorithm: "ed25519"; signed_payload: string; signature: string; public_key: string };
  attachments: { name: string; binding: string; sha256: string; bytes_base64: string }[];
  timestamp: { format: "opentimestamps-calendar-ops"; digest: string; proof_base64: string } | null;
  context: unknown;
}
export interface EvidenceBundleResult {
  /** Signature and included bindings only, never a timestamp or factual verdict. */
  valid: boolean;
  evidence_complete: boolean;
  missing_evidence: string[];
  problems: string[];
  context_authenticated: false;
  timestamp: { status: "absent" | "unverified"; verified: false };
  scope: string;
  does_not_establish: string[];
  signed_claims?: Record<string, unknown>;
}
export declare const EVIDENCE_BUNDLE_FORMAT: "scvd-evidence-bundle/v1";
export declare const EVIDENCE_BUNDLE_MAX_BYTES: number;
export declare const EVIDENCE_BUNDLE_MAX_ATTACHMENTS: number;
export declare function createEvidenceBundle(response: unknown, options?: { sourceUrl?: string; capturedAt?: string; issuerDocument?: unknown; attachments?: { name: string; bytes: Uint8Array }[] }): Promise<EvidenceBundle>;
export declare function verifyEvidenceBundle(bundle: unknown, options?: { publicKey?: string }): Promise<EvidenceBundleResult>;
export declare function evidenceDigest(bytes: Uint8Array): Promise<string>;
export declare function evidenceBase64(bytes: Uint8Array): string;
export declare function evidenceBytes(value: string): Uint8Array;
export declare function detachedTimestamp(digest: string, proofBase64: string): Uint8Array;
