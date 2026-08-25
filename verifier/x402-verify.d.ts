/**
 * Types for x402-verify. The implementation is plain zero-dependency
 * JavaScript on purpose — copy it anywhere, no build step — and this
 * file exists so TypeScript consumers get the same contract without
 * the library taking on a compiler.
 */

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
  detail: string;
  /** Advisory checks are reported but never fold into `ok`. */
  advisory?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  kind?: "offer" | "receipt";
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
  subtle?: SubtleCrypto;
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
  jws: string,
  options?: VerifyOptions,
): Promise<VerifyResult>;
export declare function formatResult(result: VerifyResult): string;
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
