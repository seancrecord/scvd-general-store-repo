import * as ed25519 from "@noble/ed25519";
import { cachedPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE x402 SIGNED OFFERS & RECEIPTS EXTENSION, JWS FORMAT.
 *
 * Spec: x402-foundation/x402, specs/extensions/extension-offer-and-
 * receipt.md — read in full before this was written, because CV's
 * summary of it, confident and mostly right, had three field-level
 * errors that a compliant verifier would have rejected outright:
 * `offerType` where the spec says `scheme`, a missing REQUIRED `asset`
 * field, and `txHash` where the spec says `transaction`. The store
 * spent this whole day finding hand-typed values that drifted from
 * their source; building a wire format from a paraphrase would have
 * been the same defect committed knowingly.
 *
 * WHAT THIS ADDS AND WHERE, per the spec's wire format:
 *   - 402 response body gains extensions["offer-receipt"].info.offers[]
 *     — one signed offer per accepts[] entry, tied back by acceptIndex.
 *     An offer is the store COMMITTING to its terms: a buyer holding
 *     one can later prove what we quoted, which no 402 alone does.
 *   - The settlement's PAYMENT-RESPONSE header gains
 *     extensions["offer-receipt"].info.receipt — signed proof of
 *     delivery: resourceUrl, payer, network, issuedAt, transaction.
 *
 * SIGNED WITH THE STORE'S ONE KEY. The spec's JWS format permits any
 * asymmetric key and identifies the signer by kid; ours is
 * did:web:scvd.store#key-1, resolved at /.well-known/did.json, which
 * serves THE SAME Ed25519 key that signs every certificate — derived
 * from the same secret, so an offer, a receipt and a certificate are
 * one identity, checkable three ways. The spec's own §4.5.1 requires
 * verifiers to distinguish signature validity from signer
 * authorization; our key_history is the authorization record, and the
 * DID document points at it.
 *
 * FAIL-OPEN, DELIBERATELY, AND THAT IS A REAL DESIGN DECISION. The
 * gate this rides on verifies, settles, and only then mints; it took
 * three rounds to get right and it is the one path between a buyer
 * and the till. If offer signing throws, the 402 goes out WITHOUT
 * offers; if receipt signing throws, the settlement header goes out
 * exactly as the facilitator built it. A missing optional extension
 * is a degraded nicety — a sale blocked by one would be the store
 * breaking its own till to decorate a receipt. Every entry point here
 * catches everything.
 */

/** Offer lifetime. The spec default; falls back nowhere because we set it. */
const OFFER_VALIDITY_SECONDS = 300;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(text: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(text));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** did:web is derived from the live origin, never typed beside it. */
function kidFor(env: Env): string {
  return `did:web:${new URL(env.STORE_BASE_URL).host}#key-1`;
}

/**
 * JWS Compact Serialization, EdDSA over Ed25519.
 *
 * header.payload.signature, each part base64url; the signature covers
 * the ASCII of "header.payload" exactly — RFC 7515's signing input,
 * with no third variant of our own. `alg: "EdDSA"` and a `kid` the
 * verifier resolves via did:web are the two protected-header fields
 * the spec marks required.
 */
async function signJws(
  env: Env,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = base64UrlFromString(
    JSON.stringify({ alg: "EdDSA", kid: kidFor(env) }),
  );
  const body = base64UrlFromString(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(signingInput),
    hexToBytes(env.SIGNING_KEY.trim().toLowerCase()),
  );
  return `${signingInput}.${base64UrlFromBytes(signature)}`;
}

/** The accepts-entry fields an offer commits to. Names are the spec's. */
interface AcceptsEntry {
  scheme?: unknown;
  network?: unknown;
  amount?: unknown;
  asset?: unknown;
  payTo?: unknown;
}

function isSignableAccept(entry: AcceptsEntry): boolean {
  return (
    typeof entry.scheme === "string" &&
    typeof entry.network === "string" &&
    typeof entry.amount === "string" &&
    typeof entry.asset === "string" &&
    typeof entry.payTo === "string"
  );
}

/**
 * Sign one offer per accepts entry, exactly the spec's §4.2 payload:
 * version, resourceUrl, scheme, network, asset, payTo, amount,
 * validUntil. `version: 1` is required and a compliant verifier
 * rejects its absence; `acceptIndex` ties the offer to the tier it
 * commits to, because a pay-what-it-deserves shelf offers three
 * amounts and an offer that names none of them commits to nothing.
 *
 * Returns null rather than throwing, whatever goes wrong inside.
 */
export async function signedOffersForChallenge(
  env: Env,
  resourceUrl: string,
  accepts: unknown,
  nowSeconds: number,
): Promise<Record<string, unknown> | null> {
  try {
    if (!Array.isArray(accepts) || accepts.length === 0) {
      return null;
    }
    const offers: Record<string, unknown>[] = [];
    for (let index = 0; index < accepts.length; index += 1) {
      const entry = accepts[index] as AcceptsEntry;
      if (!isSignableAccept(entry)) {
        // An accepts entry missing a required offer field gets no
        // offer rather than an offer with a hole in it — a partial
        // commitment signed by our key is worse than silence.
        continue;
      }
      const payload = {
        version: 1,
        resourceUrl,
        scheme: entry.scheme,
        network: entry.network,
        asset: entry.asset,
        payTo: entry.payTo,
        amount: entry.amount,
        validUntil: nowSeconds + OFFER_VALIDITY_SECONDS,
      };
      offers.push({
        format: "jws",
        acceptIndex: index,
        payload,
        signature: await signJws(env, payload),
      });
    }
    if (offers.length === 0) {
      return null;
    }
    return { "offer-receipt": { info: { offers } } };
  } catch {
    // Fail open: a 402 without offers is still a working 402.
    return null;
  }
}

/**
 * THE RECEIPT, INTO THE FACILITATOR'S OWN HEADER.
 *
 * The spec places the receipt inside the settlement response —
 * which in x402-over-HTTP is the base64 JSON riding the
 * PAYMENT-RESPONSE header the facilitator built. So this decodes that
 * header, adds extensions["offer-receipt"].info.receipt, and
 * re-encodes.
 *
 * EVERY FAILURE RETURNS THE ORIGINAL HEADERS UNTOUCHED. This is the
 * one place the extension touches something a client already parses:
 * mangling the settlement header to attach a receipt would break the
 * buyer's proof of payment in order to hand them a proof of delivery.
 * If the header is absent, unparseable, or signing fails, the
 * facilitator's bytes pass through exactly as they arrived.
 *
 * `transaction` is included when known: this store already binds
 * settlement_tx into the signed certificate and publishes it on the
 * verify surface, so the privacy decision the spec leaves open was
 * made here days ago, in the open.
 */
export async function withReceiptHeader(
  env: Env,
  headers: Record<string, string>,
  input: {
    resourceUrl: string;
    payer?: string;
    network: string;
    transaction?: string;
    nowSeconds: number;
  },
): Promise<Record<string, string>> {
  try {
    const headerName = Object.keys(headers).find(
      (name) => name.toLowerCase() === "payment-response",
    );
    if (!headerName || !input.payer) {
      // No settlement header to extend, or no payer to attest — a
      // receipt naming nobody proves nothing, so none is issued.
      return headers;
    }
    const decoded = JSON.parse(atob(headers[headerName] as string)) as Record<
      string,
      unknown
    >;
    const payload: Record<string, unknown> = {
      version: 1,
      network: input.network,
      resourceUrl: input.resourceUrl,
      payer: input.payer,
      issuedAt: input.nowSeconds,
      ...(input.transaction ? { transaction: input.transaction } : {}),
    };
    const receipt = {
      format: "jws",
      payload,
      signature: await signJws(env, payload),
    };
    const existing = isPlainObject(decoded["extensions"])
      ? (decoded["extensions"] as Record<string, unknown>)
      : {};
    const merged = {
      ...decoded,
      extensions: { ...existing, "offer-receipt": { info: { receipt } } },
    };
    return { ...headers, [headerName]: btoa(JSON.stringify(merged)) };
  } catch {
    return headers;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * For tests and any future verifier page: check one of our own JWS
 * artifacts against the store's live key, with an independent
 * reconstruction of the signing input.
 */
export async function verifyOwnJws(
  env: Env,
  jws: string,
): Promise<{ valid: boolean; payload?: Record<string, unknown> }> {
  const [header, body, signature] = jws.split(".");
  if (!header || !body || !signature) {
    return { valid: false };
  }
  const publicKey = await cachedPublicKeyHex(env.SIGNING_KEY);
  const padded = (part: string): string =>
    part.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (part.length % 4)) % 4);
  const signatureBytes = Uint8Array.from(atob(padded(signature)), (ch) =>
    ch.charCodeAt(0),
  );
  const valid = await ed25519.verifyAsync(
    signatureBytes,
    new TextEncoder().encode(`${header}.${body}`),
    hexToBytes(publicKey),
  );
  if (!valid) {
    return { valid: false };
  }
  return {
    valid,
    payload: JSON.parse(atob(padded(body))) as Record<string, unknown>,
  };
}
