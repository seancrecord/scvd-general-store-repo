/**
 * Types for x402-verify. The implementation is plain zero-dependency
 * JavaScript on purpose — copy it anywhere, no build step — and this
 * file exists so TypeScript consumers get the same contract without
 * the library taking on a compiler.
 */

/** A verdict within the reported scope, never permission to pay. */
export type VerificationStatus = "valid" | "invalid" | "unsupported" | "inconclusive";
export type VerificationReasonCode =
  | "malformed_input" | "unsupported_format" | "malformed_header"
  | "unsupported_algorithm" | "unsupported_schema_version" | "schema_invalid"
  | "malformed_kid" | "unsupported_did_method" | "key_unavailable"
  | "key_document_invalid" | "unsupported_key_type" | "invalid_public_key"
  | "signature_invalid" | "signature_malformed" | "unsupported_runtime"
  | "verification_error" | "signature_not_checked" | "offer_expired"
  | "expiry_not_checked";

export interface VerifyCheck {
  name:
    | "parse"
    | "alg"
    | "kid"
    | "schema"
    | "key-resolution"
    | "signature"
    | "expiry";
  ok: boolean;
  status: VerificationStatus | "unobserved";
  reasonCode?: VerificationReasonCode;
  detail: string;
  /** Advisory checks are reported but never fold into `ok`. */
  advisory?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  status: VerificationStatus;
  /** Non-advisory failure/uncertainty reasons; empty when valid. */
  reasonCodes: VerificationReasonCode[];
  scope: string;
  checks: VerifyCheck[];
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  kind?: "offer" | "receipt";
}

/** The narrow WebCrypto operations this verifier calls, shared by Node and browsers. */
export interface VerificationCrypto {
  importKey(format: "raw", keyData: Uint8Array, algorithm: { name: "Ed25519" }, extractable: boolean, keyUsages: ["verify"]): Promise<CryptoKey>;
  verify(algorithm: { name: "Ed25519" }, key: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean>;
}

export interface VerifyOptions {
  /** Skip DID resolution and check against this key. Hex or bytes. */
  publicKey?: string | Uint8Array;
  /** Force the payload shape instead of inferring it from the fields. */
  kind?: "offer" | "receipt";
  /** Your own Ed25519 check, for runtimes without it in WebCrypto. */
  verify?: (
    signingInput: string,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ) => boolean | Promise<boolean>;
  /** Inject a fetch for DID resolution: a cache, a fixture, nothing. */
  fetch?: typeof fetch;
  /** Only the methods used here; Node and browser key-generation overloads differ. */
  subtle?: VerificationCrypto;
  /** Seconds of clock-skew tolerance on offer expiry. Default 5. */
  leewaySeconds?: number;
  nowSeconds?: number;
  /** Set false to skip the advisory expiry note entirely. */
  checkExpiry?: boolean;
  /** Your own SHA-256 hex, for anchor-chain checks off WebCrypto. */
  digest?: (text: string) => string | Promise<string>;
}

export interface AnchorChainResult {
  ok: boolean;
  /** Every break found, not just the first. */
  problems: string[];
  /** Not-broken-but-worth-saying, e.g. a chain that starts past 1. */
  notes: string[];
  checked: number;
}

/**
 * How much the anchoring is worth, in one word. `pending_only` is the
 * load-bearing one: it is the state a same-day rewrite would show.
 */
export type AnchorConfidence =
  | "confirmed"
  | "pending_only"
  | "unanchored"
  | "chain_broken";

export type AnchoredKeyHistory =
  | { available: false; reason: string }
  | {
      available: true;
      url: string;
      found: false;
      reason: string;
      anchor_confidence?: AnchorConfidence;
      chain_ok?: boolean;
      chain_problems?: string[];
    }
  | {
      available: true;
      url: string;
      found: true;
      anchor_confidence: AnchorConfidence;
      chain_ok: boolean;
      chain_problems: string[];
      first_seen_at: string | null;
      first_seen_sequence: number | null;
      /** The ISSUER'S CLAIM, checked for chain position, not against Bitcoin. */
      bitcoin_confirmed: boolean;
      ots_proof_base64: string | null;
      ots_status_is_unverified_claim: true;
      /** Names the comparison that catches backdating: block time vs first_seen_at. */
      settle_it_yourself: string;
      reason: string;
    };

export interface ParsedJws {
  ok: boolean;
  problem?: string;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  signature?: Uint8Array;
  signingInput?: string;
}

export interface ResolvedDid {
  ok: boolean;
  status?: VerificationStatus;
  reasonCode?: VerificationReasonCode;
  problem?: string;
  url?: string;
  document?: Record<string, unknown>;
  /** Keyed by the FULL kid, so a caller matches exactly. */
  keys?: Map<string, Uint8Array>;
}

export declare const OFFER_REQUIRED_FIELDS: string[];
export declare const RECEIPT_REQUIRED_FIELDS: string[];

export declare function decodeBase64Url(value: string): Uint8Array | null;
export declare function hexToBytes(hex: string): Uint8Array | null;
export declare function parseJws(jws: string): ParsedJws;
/** Legacy boolean helper; throws when no WebCrypto or custom verifier exists. */
export declare function verifyEd25519(
  signingInput: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
  options?: VerifyOptions,
): Promise<boolean>;
export declare function resolveDidWeb(
  did: string,
  options?: VerifyOptions,
): Promise<ResolvedDid>;
export declare function validateOfferPayload(payload: unknown): string[];
export declare function validateReceiptPayload(payload: unknown): string[];
export declare function isOfferLive(
  payload: unknown,
  options?: VerifyOptions,
): { live: boolean; reason: string };
export declare function verifyArtifact(
  jws: unknown,
  options?: VerifyOptions,
): Promise<VerifyResult>;
export declare function formatResult(result: VerifyResult): string;
/** The bounded evidence the one-call front door returns (1.1.0). */
export interface BoundedVerification {
  kind: "offer" | "receipt";
  valid: boolean;
  status: VerificationStatus;
  reasonCodes: VerificationReasonCode[];
  /** What "valid" means here, in one sentence, naming the key it was checked against. */
  scope: string;
  /** What this result does NOT establish, always stated. */
  doesNotEstablish: string[];
  checks: VerifyCheck[];
  issuer: { kid: string | null; keyUrl: string | null };
  /** The free hosted desk that reproduces this check. */
  verificationUrl: string;
  payload?: Record<string, unknown>;
}

export interface VerifyReceiptInput {
  /** The compact JWS from the receipt. */
  receipt: unknown;
  /** Where the issuer publishes its key: a DID document URL or a bare JWK / { publicKeyHex } document. Never taken from the artifact. */
  issuerKeyUrl?: string;
  /** A key you already hold, hex or bytes; skips resolution. */
  publicKey?: string | Uint8Array;
}

export interface VerifyOfferInput {
  offer: unknown;
  issuerKeyUrl?: string;
  publicKey?: string | Uint8Array;
}

export declare const DOES_NOT_ESTABLISH: { receipt: readonly string[]; offer: readonly string[] };
export declare const VERIFICATION_URL: string;

/** What the package dispatches on, as data; never a statement about the runtime or any payment rail. */
export interface PackageCapabilities {
  scope: string;
  artifact_formats: readonly string[];
  artifact_kinds: readonly ("offer" | "receipt")[];
  algorithms: readonly string[];
  key_types: readonly string[];
  key_sources: readonly string[];
  did_methods: readonly string[];
  payload_schema_versions: readonly number[];
  checks: readonly VerifyCheck["name"][];
  advisory_checks: readonly VerifyCheck["name"][];
  unsupported_reason_codes: readonly VerificationReasonCode[];
  not_established: { receipt: readonly string[]; offer: readonly string[] };
}
export declare const CAPABILITIES: Readonly<PackageCapabilities>;

/** What this runtime can do for the verifier, with Ed25519 proven on a known vector. */
export interface RuntimeCapabilities {
  ed25519: "verified" | "failed" | "unavailable";
  ed25519_source: "webcrypto" | "injected" | "unavailable";
  did_resolution: "global-fetch" | "injected" | "unavailable";
  sha256: "webcrypto" | "injected" | "unavailable";
}
export declare function runtimeCapabilities(
  options?: Pick<VerifyOptions, "subtle" | "verify" | "fetch" | "digest">,
): Promise<Readonly<RuntimeCapabilities>>;
export declare function verifyReceipt(input: VerifyReceiptInput, options?: VerifyOptions): Promise<BoundedVerification>;
export declare function verifyOffer(input: VerifyOfferInput, options?: VerifyOptions): Promise<BoundedVerification>;

export declare function canonicalizeAnchorSnapshot(snapshot: unknown): string;
export declare function verifyAnchorChain(
  log: unknown,
  options?: VerifyOptions,
): Promise<AnchorChainResult>;
export declare function checkAnchoredKeyHistory(
  did: string,
  publicKeyHex: string,
  options?: VerifyOptions,
): Promise<AnchoredKeyHistory>;

/**
 * The key_history shape issuers publish beside their signing key.
 * Generic: scvd.store serves it at /.well-known/scvd-signing-key,
 * and nothing about that issuer is privileged here.
 */
export interface PublishedKeyHistory {
  current: { public_key: string; in_service_from: string };
  retired: ReadonlyArray<{
    public_key: string;
    in_service_from: string;
    retired_on: string;
  }>;
}

export type KeyServiceWindowStatus =
  | "in_service"
  | "before_service"
  | "after_retirement"
  | "unknown_key"
  | "undated";

export interface KeyServiceWindowResult {
  status: KeyServiceWindowStatus;
  /** Null when the key is unknown; the published window otherwise. */
  window: { in_service_from: string; retired_on: string | null } | null;
  detail: string;
}

/**
 * Layer 3: was the key AUTHORIZED at the artifact's claimed date?
 * Catches what signature validity and key attribution both miss —
 * a stolen retired key signing artifacts dated after its retirement.
 * Inclusive at both ends of the window (calendar dates; a handover's
 * swap day legitimately carries both keys' signatures).
 */
export declare function checkKeyServiceWindow(
  keyHistory: PublishedKeyHistory | null | undefined,
  publicKeyHex: string,
  artifactIso: string | null | undefined,
): KeyServiceWindowResult;
