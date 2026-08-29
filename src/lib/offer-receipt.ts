import * as ed25519 from "@noble/ed25519";
import { cachedPublicKeyHex } from "@/lib/signing";
import { retiredKeysFor } from "@/store/key-registry";
import { decodeBase64Json } from "@/lib/base64-json";
import { isRecord } from "@/types";
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
 * CORRECTED 2026-08-25, AND THE CORRECTION IS THE POINT. This file's
 * first line says the spec was read in full because a paraphrase had
 * produced three field-level errors. It was read in full, and it still
 * shipped a fourth: every offer and every receipt carried `payload`
 * beside `signature`, which the spec's envelope table makes EIP-712
 * only and forbids outright for JWS — "MUST be omitted (the JWS
 * compact string already contains the payload)". Nine forbidden copies
 * per challenge, one per settlement, from launch until today.
 *
 * It survived because the tests read `offer.payload.*` to make their
 * assertions, so passing REQUIRED the violation. A guard that depends
 * on the defect is not a guard. They now decode the JWS the way the
 * spec tells a verifier to, and a per-offer byte budget holds the
 * envelope down: the forbidden field cost 287 bytes an offer, which on
 * a three-rail three-tier shelf is the difference between a door a
 * stock Node client can open and one it refuses at 16KB of headers.
 *
 * Recorded here rather than quietly fixed, because the store sells
 * conformance audits and this is the exact class of finding it charges
 * to produce. It is on /corrections with a date.
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

/**
 * did:web derived from the live origin; the fragment derived from the
 * key registry. #key-1 was hardcoded here for about an hour before
 * the keeper asked how this behaves across rotation — and the answer
 * was: badly. A slot-named kid repoints on rotation, so a receipt
 * signed today would resolve to TOMORROW'S key and fail verification
 * outright. The fragment now names the key itself: current key =
 * (retired count + 1), permanently, matching did.json exactly because
 * both derive from the same registry.
 */
async function kidFor(env: Env): Promise<string> {
  const publicKey = await cachedPublicKeyHex(env.SIGNING_KEY);
  const keyNumber = retiredKeysFor(publicKey).length + 1;
  return `did:web:${new URL(env.STORE_BASE_URL).host}#key-${keyNumber}`;
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
/**
 * Exported 2026-08-27 for the fixtures desk (lib/conformance-fixtures)
 * — which must sign with THIS path and no other, because a fixture
 * signed by a parallel implementation would attest the wrong thing.
 * Production callers in this file are unchanged.
 */
export async function signJws(
  env: Env,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = base64UrlFromString(
    JSON.stringify({ alg: "EdDSA", kid: await kidFor(env) }),
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
 * rejects its absence. `acceptIndex` is an UNSIGNED convenience
 * pointer at the tier — helpful for a reader, worthless for integrity,
 * and the spec says so in those terms. The commitment a
 * pay-what-it-deserves shelf needs comes from the signed amount, not
 * from the index beside it.
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
    /*
     * ONE WAVE OF SIGNATURES, NOT NINE IN A ROW.
     *
     * A fixed-price item quotes 1 tier x 3 rails; pay-what-it-deserves
     * quotes 3 x 3, and every one of those was a serial ed25519 sign
     * on the 402 an agent is blocked on. They share no state.
     *
     * THE FILTER HAPPENS FIRST, deliberately — but NOT for the reason
     * this comment used to give. It claimed acceptIndex "commits each
     * offer to the tier it is an offer FOR". It cannot: the spec is
     * explicit that acceptIndex "is NOT part of the signed payload and
     * MUST NOT be relied upon for integrity or binding", and it is
     * right, because the field sits outside the JWS and nothing signs
     * it. The binding is the signed payload's own network, asset,
     * payTo and amount, which is what the spec tells verifiers to
     * match on rather than array position.
     *
     * The hygiene stands on its own: a misaligned index is a wrong
     * convenience pointer, and shipping one would invite exactly the
     * index-trusting verifier the spec warns against. Pair the index
     * to the entry before anything is signed, and claim nothing more
     * for it than that.
     */
    const signable = accepts
      .map((entry, index) => ({ entry: entry as AcceptsEntry, index }))
      // An accepts entry missing a required offer field gets no offer
      // rather than an offer with a hole in it — a partial commitment
      // signed by our key is worse than silence.
      .filter(({ entry }) => isSignableAccept(entry));
    const offers: Record<string, unknown>[] = await Promise.all(
      signable.map(async ({ entry, index }) => {
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
        return {
          format: "jws",
          acceptIndex: index,
          // NO `payload` HERE, and it is a MUST not a preference: the
          // spec's envelope table makes payload EIP-712-only, and says
          // for JWS it "MUST be omitted (the JWS compact string
          // already contains the payload)". We shipped it anyway from
          // 2026-07 until 2026-08-25 — nine forbidden copies per
          // challenge — and the duplication is exactly the ambiguity
          // the rule exists to prevent. See the header note.
          signature: await signJws(env, payload),
        };
      }),
    );
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
      // Same MUST as the offers above — the spec applies the rule to
      // receipts in the same sentence, "exactly as with offers". This
      // one carried no size cost and no test caught it, which is why
      // it survived a month longer than it should have.
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

/**
 * Signed offers, sourced from the PAYMENT-REQUIRED header — because on
 * THIS store the 402 body is the keeper's prose, not the standard
 * payment-required JSON. The accepts[] a client actually signs against
 * travel base64-encoded in the header, which is where the first cut of
 * this looked for them in the body and found nothing; the probe test
 * caught it before it shipped. Reading the header means the offers
 * commit to exactly the terms a client pays, never a copy.
 */
export async function offerExtensionsFor(
  env: Env,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const headerName = Object.keys(headers).find(
      (name) => name.toLowerCase() === "payment-required",
    );
    if (!headerName) {
      return null;
    }
    const decoded = decodeBase64Json(
      headers[headerName] as string,
    ) as Record<string, unknown>;
    const resource = decoded["resource"];
    const resourceUrl =
      typeof resource === "string"
        ? resource
        : isRecord(resource) && typeof resource["url"] === "string"
          ? resource["url"]
          : undefined;
    if (!resourceUrl) {
      return null;
    }
    return await signedOffersForChallenge(
      env,
      resourceUrl,
      decoded["accepts"],
      Math.floor(Date.now() / 1000),
    );
  } catch {
    // Fail open: a 402 without offers is a working 402.
    return null;
  }
}

/**
 * The same commitments, for a door that relays the challenge as an
 * OBJECT instead of a header — the MCP door, which calls the payment
 * stack directly and so never passed through the HTTP gate's splice.
 *
 * Until 2026-08-29 that meant MCP buyers got extensions {bazaar}
 * where HTTP buyers got {bazaar, offer-receipt}: the store's signed
 * commitment to its own quoted terms, the exact discipline this
 * business sells to other issuers, missing from the one channel it
 * most wants to sell through. mcp-payment.ts already carried the
 * warning in its own comments — "this door had its own copy of the
 * pipeline and therefore none of the diagnosis... a fix that looks
 * shared and isn't" — written about the preflight. The preflight got
 * shared. The offer did not, and nothing failed when it didn't.
 *
 * Fails open exactly like the header splice: a 402 without offers is
 * a working 402, and no decoration is worth blocking the till.
 */
export async function withSignedOffers(
  env: Env,
  headers: Record<string, string>,
  challenge: unknown,
): Promise<unknown> {
  if (!challenge || typeof challenge !== "object") {
    return challenge;
  }
  const offers = await offerExtensionsFor(env, headers);
  if (!offers) {
    return challenge;
  }
  const existing = (challenge as Record<string, unknown>)["extensions"];
  return {
    ...(challenge as Record<string, unknown>),
    extensions: {
      ...(existing && typeof existing === "object" ? existing : {}),
      ...offers,
    },
  };
}
