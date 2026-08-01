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
}

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
