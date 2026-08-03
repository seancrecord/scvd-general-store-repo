/** x402-sign — zero-dependency signer for x402 Signed Offers & Receipts. */

export const OFFER_REQUIRED_FIELDS: readonly string[];
export const RECEIPT_REQUIRED_FIELDS: readonly string[];

export function hexToBytes(hex: string): Uint8Array;
export function bytesToHex(bytes: Uint8Array): string;

export interface Keypair {
  /** 32-byte Ed25519 seed, hex. Back this up; it never leaves your process. */
  seedHex: string;
  publicKeyHex: string;
  publicKeyJwk: { kty: "OKP"; crv: "Ed25519"; x: string };
}

/** Fresh random keypair, or deterministic re-derivation from a seed. */
export function generateKeypair(options?: { seedHex?: string }): Promise<Keypair>;

/**
 * A minimal valid did:web document to serve at
 * https://<domain>/.well-known/did.json (content-type application/did+json).
 */
export function didDocument(options: {
  domain: string;
  publicKeyJwk: Keypair["publicKeyJwk"];
  keyNumber?: number;
}): object;

export interface SignOptions {
  /** 32-byte Ed25519 seed, hex. Or pass `sign` instead. */
  seedHex?: string;
  /** Your key's DID URL, e.g. did:web:your-domain#key-1. Required. */
  kid: string;
  /** Bring your own Ed25519: (signingInput) => 64-byte signature. */
  sign?: (signingInput: string) => Promise<Uint8Array> | Uint8Array;
}

export interface OfferPayload {
  version: 1;
  resourceUrl: string;
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  /** ATOMIC units as a string (USDC: 6 decimals; $0.005 is "5000"). */
  amount: string;
  /** Unix seconds. */
  validUntil: number;
}

export interface ReceiptPayload {
  version: 1;
  network: string;
  resourceUrl: string;
  payer: string;
  /** Unix seconds. */
  issuedAt: number;
  /** Extra fields (transaction, amount, settledAt…) welcome, not required. */
  [key: string]: unknown;
}

/** Sign one offer. Throws on any missing required field. */
export function signOffer(payload: OfferPayload, options: SignOptions): Promise<string>;

/** Sign one receipt. Throws on any missing required field. */
export function signReceipt(payload: ReceiptPayload, options: SignOptions): Promise<string>;

export interface AcceptsEntry {
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
  [key: string]: unknown;
}

/**
 * One signed offer per signable accepts entry, in the extension's
 * exact wire shape. Splice `extension` into your PAYMENT-REQUIRED
 * header JSON and 402 body. `skipped` lists accepts indices that
 * were missing required fields and therefore got no offer.
 */
export function offersForAccepts(
  accepts: AcceptsEntry[],
  options: SignOptions & {
    resourceUrl: string;
    /** Absolute expiry (unix seconds); or use validitySeconds. */
    validUntil?: number;
    /** Default 300 — offers should be short-lived. */
    validitySeconds?: number;
    /** Clock override for deterministic output. */
    now?: number;
  },
): Promise<{
  extension: { "offer-receipt": { info: { offers: object[] } } };
  skipped: number[];
}>;
