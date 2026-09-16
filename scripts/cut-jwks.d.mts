/**
 * Types for the JWKS cut, so the spec can re-derive from the same
 * function the script writes with. Same pattern as
 * src/lib/a2a-validation.d.ts: a hand-written declaration beside a
 * plain-JS module, rather than a second implementation in TypeScript
 * that could disagree with the one that actually writes the file.
 */
export interface DirectoryJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  use?: string;
  alg?: string;
  kid?: string;
}
export interface DirectoryJwks {
  keys: DirectoryJwk[];
}
export declare const PEM_PATH: string;
export declare const JWKS_PATH: string;
export declare function thumbprint(jwk: DirectoryJwk): string;
export declare function deriveJwks(pem: string): DirectoryJwks;
