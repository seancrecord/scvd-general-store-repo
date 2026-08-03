/**
 * x402-sign — a zero-dependency signer for x402 Signed Offers &
 * Receipts (JWS compact, alg EdDSA over Ed25519).
 *
 * THE OTHER HALF OF x402-verify, and the half the ecosystem turned
 * out to be missing. A census of every host on the x402 discovery
 * list (2026-08-03, one GET each, reproducible via the free public
 * preflight at scvd.store) found 34 of 35 serving NO signed offers at
 * all — and the one attempting them shipping offers that fail JWS
 * parsing. The extension exists, the verifier exists, the vectors
 * exist; what nobody shipped was the tool that lets a seller MINT a
 * conformant offer in an afternoon. This is that tool.
 *
 * WHAT A SIGNED OFFER BUYS YOUR BUYERS: a pre-payment commitment to
 * your terms that survives a dispute — signed price, asset, payTo and
 * expiry a buyer can hold you to, checkable against your published
 * key by anyone, forever, without asking you. A 402 without one asks
 * the buyer to pay against terms nobody committed to.
 *
 * REFUSES PARTIAL COMMITMENTS, same law as the reference deployment's
 * own till: an offer missing a required field is not signed with a
 * hole in it — it throws. A partial commitment under your signature
 * is worse than no offer at all.
 *
 * DETERMINISTIC AND PROVABLY SPEC-CONFORMANT: Ed25519 signing is
 * deterministic, so this library's output for the published test
 * vectors' payload and key reproduces the known-good vector JWS byte
 * for byte — that exact assertion runs in the reference deployment's
 * CI. Verify anything this signs with the sibling package
 * `x402-verify`, the free desk at scvd.store/api/conformance/v1, or
 * any conformant verifier; they are different codebases on purpose.
 *
 * RUNTIME: zero dependencies. Signing uses WebCrypto Ed25519 (Node
 * 18.4+, Deno, Bun, Cloudflare Workers, recent browsers); pass your
 * own `sign` function if your runtime lacks it — the crypto is a
 * seam, not a lock-in. Your seed never leaves your process; there is
 * no call home in this file.
 */

/** The spec's §4.2 required offer fields. Order is the wire order. */
export const OFFER_REQUIRED_FIELDS = [
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "validUntil",
];

/**
 * The spec's required receipt fields — deliberately SMALLER than the
 * offer's, and taken from the spec rather than from what "feels
 * complete": this file's first draft invented a fuller list from
 * memory and the parity test against x402-verify caught it before
 * publish. A receipt records that a settlement happened (who paid,
 * when issued, against what resource); the terms live in the offer it
 * answers. Extra fields (transaction hash, amount, settledAt) are
 * welcome and common — just not required by the schema.
 */
export const RECEIPT_REQUIRED_FIELDS = [
  "version",
  "network",
  "resourceUrl",
  "payer",
  "issuedAt",
];

const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = (globalThis.btoa ?? ((s) => Buffer.from(s, "binary").toString("base64")))(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64uJson(value) {
  return base64Url(encoder.encode(JSON.stringify(value)));
}

export function hexToBytes(hex) {
  const clean = String(hex ?? "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("not a hex string");
  }
  return Uint8Array.from(clean.match(/../g) ?? [], (b) => parseInt(b, 16));
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** RFC 8410 PKCS#8 wrapping of a raw Ed25519 seed, for WebCrypto. */
const PKCS8_PREFIX = hexToBytes("302e020100300506032b657004220420");

async function webCryptoSign(signingInput, seed) {
  const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_PREFIX);
  pkcs8.set(seed, PKCS8_PREFIX.length);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("Ed25519", key, encoder.encode(signingInput));
  return new Uint8Array(signature);
}

/**
 * Generate (or re-derive) an Ed25519 signing keypair. Given no seed,
 * a fresh random one; given a seed, deterministic re-derivation — so
 * a keeper can re-derive the public half from a backed-up seed
 * without any state.
 */
export async function generateKeypair(options = {}) {
  const seed = options.seedHex
    ? hexToBytes(options.seedHex)
    : crypto.getRandomValues(new Uint8Array(32));
  if (seed.length !== 32) {
    throw new Error("an Ed25519 seed is exactly 32 bytes");
  }
  // Derive the public key via WebCrypto: import as pkcs8, export jwk.
  const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_PREFIX);
  pkcs8.set(seed, PKCS8_PREFIX.length);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const padded = jwk.x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (jwk.x.length % 4)) % 4);
  const publicKeyBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return {
    seedHex: bytesToHex(seed),
    publicKeyHex: bytesToHex(publicKeyBytes),
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: jwk.x },
  };
}

/**
 * A minimal, valid did:web document for the domain, ready to serve at
 * https://<domain>/.well-known/did.json — which is what makes your
 * kid RESOLVABLE, and a kid nobody can resolve is a name, not an
 * identity. Serve it with content-type application/did+json.
 */
export function didDocument({ domain, publicKeyJwk, keyNumber = 1 }) {
  if (!domain || !publicKeyJwk) {
    throw new Error("didDocument needs { domain, publicKeyJwk }");
  }
  // did:web requires a port's colon percent-encoded (the bare colon
  // is the method's path separator). The well-known URL keeps the raw
  // host; only the DID string encodes.
  const did = `did:web:${String(domain).replace(/:/g, "%3A")}`;
  const kid = `${did}#key-${keyNumber}`;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ],
    id: did,
    verificationMethod: [
      { id: kid, type: "JsonWebKey2020", controller: did, publicKeyJwk },
    ],
    assertionMethod: [kid],
  };
}

function assertComplete(payload, requiredFields, kind) {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`${kind} payload must be an object`);
  }
  const holes = requiredFields.filter((field) => payload[field] === undefined);
  if (holes.length > 0) {
    throw new Error(
      `refusing to sign a ${kind} with holes in it: missing ${holes.join(", ")}. A partial commitment under your signature is worse than no ${kind} at all.`,
    );
  }
  if (payload.version !== 1) {
    throw new Error(`${kind} version must be the number 1`);
  }
  if (payload.amount !== undefined && typeof payload.amount !== "string") {
    throw new Error(
      `${kind} amount must be a STRING of atomic units (USDC has 6 decimals: $0.005 is "5000") — a number invites the million-fold dollar-typing mistake`,
    );
  }
  /**
   * MIRROR THE VERIFIER'S TYPE RULES, found by red-teaming before
   * first publish: the sibling verifier requires validUntil/issuedAt
   * to be NUMBERS, and this signer originally checked presence only —
   * so validUntil:"2100-01-01" would sign cleanly and then fail its
   * own sibling's schema check. A signer that can mint artifacts its
   * verifier rejects is the one bug this package must never have.
   * (Being STRICTER than the verifier is fine and deliberate —
   * issuance strict, consumption tolerant.)
   */
  if (kind === "offer" && typeof payload.validUntil !== "number") {
    throw new Error("offer validUntil must be a NUMBER (unix seconds), not a date string");
  }
  if (kind === "receipt" && typeof payload.issuedAt !== "number") {
    throw new Error("receipt issuedAt must be a NUMBER (unix seconds), not a date string");
  }
}

async function signJws(payload, { seedHex, kid, sign }) {
  if (!kid) {
    throw new Error(
      "a kid is required — usually did:web:<your-domain>#key-1, resolvable at your /.well-known/did.json (didDocument() builds one)",
    );
  }
  const header = b64uJson({ alg: "EdDSA", kid });
  const body = b64uJson(payload);
  const signingInput = `${header}.${body}`;
  const signer = sign ?? ((input) => webCryptoSign(input, hexToBytes(seedHex)));
  if (!sign && !seedHex) {
    throw new Error("pass seedHex (32-byte hex) or your own sign function");
  }
  const signature = await signer(signingInput);
  return `${signingInput}.${base64Url(signature)}`;
}

/** Sign one offer. Validates completeness first; throws on holes. */
export async function signOffer(payload, options) {
  assertComplete(payload, OFFER_REQUIRED_FIELDS, "offer");
  return signJws(payload, options);
}

/** Sign one receipt. Validates completeness first; throws on holes. */
export async function signReceipt(payload, options) {
  assertComplete(payload, RECEIPT_REQUIRED_FIELDS, "receipt");
  return signJws(payload, options);
}

/**
 * The whole extension block for a 402, from your accepts array: one
 * signed offer per signable accepts entry, tied back by acceptIndex,
 * in the exact shape the extension specifies —
 * extensions["offer-receipt"].info.offers. Splice the result into
 * both your PAYMENT-REQUIRED header JSON and your 402 body.
 *
 * An accepts entry missing a required offer field gets NO offer
 * rather than an offer with a hole in it; the skipped indices are
 * returned so silence is never mistaken for coverage.
 */
export async function offersForAccepts(accepts, options) {
  const { resourceUrl, validUntil, validitySeconds = 300, now } = options;
  if (!resourceUrl) {
    throw new Error("offersForAccepts needs options.resourceUrl — the exact URL the 402 answers on");
  }
  const expiry =
    validUntil ??
    Math.floor((now ?? Date.now()) / 1000) + validitySeconds;
  const offers = [];
  const skipped = [];
  for (let index = 0; index < accepts.length; index += 1) {
    const entry = accepts[index] ?? {};
    const complete = ["scheme", "network", "amount", "asset", "payTo"].every(
      (field) => typeof entry[field] === "string",
    );
    if (!complete) {
      skipped.push(index);
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
      validUntil: expiry,
    };
    offers.push({
      format: "jws",
      acceptIndex: index,
      payload,
      signature: await signOffer(payload, options),
    });
  }
  return {
    extension: { "offer-receipt": { info: { offers } } },
    skipped,
  };
}
