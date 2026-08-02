#!/usr/bin/env node
/**
 * CONFORMANCE VECTORS for the x402 Signed Offers & Receipts extension
 * (JWS format) — the contribution offered in SPEC_SUBMISSION.md.
 *
 * The spec's own extensions table shows offer-receipt as the only
 * extension without Go and Python SDKs. We are not the right
 * maintainers of either; what a small implementer CAN hand an SDK
 * author is known-good and known-bad artifacts to test against.
 * These are those: deterministic, self-contained, regenerable.
 *
 * SIGNED WITH A TEST KEY, NEVER THE STORE'S. The seed below is
 * thirty-two bytes of 0x42, published in this file on purpose: a
 * vector suite is only useful if an implementer can re-derive every
 * byte, and a published seed is unusable for anything else precisely
 * BECAUSE it is published. It has never signed a real artifact, it
 * does not appear in did.json, and a test asserts it differs from the
 * store's live key.
 *
 * Deterministic end to end — fixed seed, fixed timestamps, and
 * Ed25519 signing is itself deterministic — so re-running this script
 * must reproduce conformance/offer-receipt-vectors.json byte for
 * byte. A vectors file that cannot be regenerated is a vectors file
 * nobody can extend.
 *
 * Usage: node scripts/generate-conformance-vectors.mjs
 */
import { writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import * as ed25519 from "@noble/ed25519";

/** Test-only. Published deliberately; see header. */
const TEST_SEED_HEX = "42".repeat(32);
const WRONG_SEED_HEX = "43".repeat(32);
const KID = "did:web:scvd.store#conformance-test-key";

const hexToBytes = (hex) =>
  Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)));
const b64u = (bytes) =>
  Buffer.from(bytes).toString("base64url");
const b64uJson = (obj) => b64u(new TextEncoder().encode(JSON.stringify(obj)));

async function signJws(payload, seedHex) {
  const header = b64uJson({ alg: "EdDSA", kid: KID });
  const body = b64uJson(payload);
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(`${header}.${body}`),
    hexToBytes(seedHex),
  );
  return `${header}.${body}.${b64u(signature)}`;
}

/**
 * TIME IN A PUBLISHED VECTOR SET, and the bug this constant exists to
 * stop recurring.
 *
 * v1 shipped `offer_valid` with validUntil 1767226200 — 2026-01-01,
 * which was in the future when it was written and seven months in the
 * PAST by 2026-08-02. So a suite published as known-good contained an
 * expired offer labelled `expect: accept`. A client author who
 * correctly refuses to pay an expired offer would run our vectors,
 * fail, and conclude their implementation was broken. We were teaching
 * strangers to accept expired offers.
 *
 * That is the AGENTS.md rule — a verdict that moves with the wall
 * clock is not a test — leaking out of the repo and onto a surface
 * other people build against.
 *
 * The fix is structural, not a bumped number. A vector whose
 * correctness depends on WHEN it is run has to either be far enough
 * out that it cannot rot inside the life of the format, or be a
 * DELIBERATE time case that says so. Both now exist, and a test
 * asserts no vector silently belongs to the first group.
 */
const FAR_FUTURE = 4102444800; // 2100-01-01T00:00:00Z
const LONG_PAST = 1735689600; // 2025-01-01T00:00:00Z

/** Spec §4.2, every required field, version 1. */
const OFFER_PAYLOAD = {
  version: 1,
  resourceUrl: "https://example.com/api/buy/widget",
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x1111111111111111111111111111111111111111",
  amount: "10000",
  validUntil: FAR_FUTURE,
};

/** The same offer, deliberately past its window. A teaching case. */
const EXPIRED_OFFER_PAYLOAD = { ...OFFER_PAYLOAD, validUntil: LONG_PAST };

/** Spec §5.2, every required field plus the optional transaction. */
const RECEIPT_PAYLOAD = {
  version: 1,
  network: "eip155:8453",
  resourceUrl: "https://example.com/api/buy/widget",
  payer: "0x2222222222222222222222222222222222222222",
  issuedAt: 1767225600,
  transaction: `0x${"ab".repeat(32)}`,
};

const publicKey = Buffer.from(
  await ed25519.getPublicKeyAsync(hexToBytes(TEST_SEED_HEX)),
).toString("hex");

const validOffer = await signJws(OFFER_PAYLOAD, TEST_SEED_HEX);
const validReceipt = await signJws(RECEIPT_PAYLOAD, TEST_SEED_HEX);

/** Valid signature over a payload MISSING the required version field:
 * teaches an SDK that signature validity and schema validity are two
 * checks, and both must run. */
const { version: _dropped, ...offerNoVersion } = OFFER_PAYLOAD;
const schemaInvalidOffer = await signJws(offerNoVersion, TEST_SEED_HEX);

/** Signed by a different key than the one published beside these
 * vectors: signature math passes against the WRONG key's pubkey, so a
 * verifier that skips key lookup would wrongly accept it. */
const wrongKeyOffer = await signJws(OFFER_PAYLOAD, WRONG_SEED_HEX);

/** Payload segment altered after signing (amount 10000 -> 99999). */
const [h, , sig] = validOffer.split(".");
const tamperedOffer = `${h}.${b64uJson({ ...OFFER_PAYLOAD, amount: "99999" })}.${sig}`;

/** Well-formed and correctly signed; simply past its window. */
const expiredOffer = await signJws(EXPIRED_OFFER_PAYLOAD, TEST_SEED_HEX);

/**
 * alg: none — the oldest JWS attack there is. A verifier that reads
 * the header's alg and dispatches on it, rather than requiring the
 * algorithm it expects, accepts an unsigned document.
 */
const algNoneOffer = `${b64uJson({ alg: "none", kid: KID })}.${b64uJson(OFFER_PAYLOAD)}.`;

/**
 * ALGORITHM CONFUSION, and the single most valuable vector in the set.
 *
 * The header claims HS256. The signature is a real HMAC-SHA256 taken
 * over the signing input with the ED25519 PUBLIC KEY BYTES as the
 * secret — which is public, so anybody can forge this. A verifier
 * that trusts the header's alg and passes "the key it has" to a
 * generic verify() will compute the same HMAC and ACCEPT a document
 * signed by a stranger. The defence is to require EdDSA before
 * looking at anything else.
 */
const hmacSigned = (() => {
  const header = b64uJson({ alg: "HS256", kid: KID });
  const body = b64uJson(OFFER_PAYLOAD);
  const mac = createHmac("sha256", hexToBytes(publicKey))
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${b64u(mac)}`;
})();

/** A required field other than `version`, so the check is a loop and
 * not one special case. This is the exact defect CDP's validator
 * rejected three of our own listings for. */
const { payTo: _noPayTo, ...offerNoPayTo } = OFFER_PAYLOAD;
const offerMissingPayTo = await signJws(offerNoPayTo, TEST_SEED_HEX);

/** Receipt-side schema. Every invalid vector in v1 was an offer, so a
 * verifier with NO receipt validation at all passed the whole suite. */
const { payer: _noPayer, ...receiptNoPayer } = RECEIPT_PAYLOAD;
const receiptMissingPayer = await signJws(receiptNoPayer, TEST_SEED_HEX);

/** No kid in the header. A verifier must not quietly reach for
 * whichever key it happens to hold. */
const noKidOffer = await (async () => {
  const header = b64uJson({ alg: "EdDSA" });
  const body = b64uJson(OFFER_PAYLOAD);
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(`${header}.${body}`),
    hexToBytes(TEST_SEED_HEX),
  );
  return `${header}.${body}.${b64u(signature)}`;
})();

/** Two segments. Must fail at parse and must not crash anything. */
const twoSegmentOffer = validOffer.split(".").slice(0, 2).join(".");

/** Structurally fine, signature bytes cut in half. */
const truncatedSigOffer = (() => {
  const [head, body, signature] = validOffer.split(".");
  return `${head}.${body}.${signature.slice(0, Math.floor(signature.length / 2))}`;
})();

const vectors = {
  description:
    "Conformance vectors for the x402 Signed Offers & Receipts extension, JWS format (alg EdDSA over Ed25519). Generated by scripts/generate-conformance-vectors.mjs in the scvd-general-store repo; deterministic and regenerable byte-for-byte. The signing key is a TEST key (seed = 0x42 * 32, published on purpose) — it has never signed a real artifact and is not the scvd.store production key.",
  version: 2,
  changed_in_v2: [
    "offer_valid carried validUntil 2026-01-01, which had passed. A set published as known-good contained an EXPIRED offer marked expect:accept, so a client that correctly refuses expired offers failed our suite and would have concluded its own implementation was broken. The live vector now expires in 2100 and the expired case is its own deliberate vector.",
    "The kid is a LABEL, not a resolvable DID URL, and v1 never said so. did:web:scvd.store publishes the STORE's key and deliberately not this test key — a test key in a production key document is a hazard, not a convenience. So a verifier that resolves the kid finds nothing and fails the valid vectors, while offer_wrong_key's own note told you to resolve it. Use signing.public_key_hex. That is stated in how_to_use now.",
    "Added algorithm-confusion (HS256 over the public key), alg:none, a missing required field other than version, a RECEIPT schema failure (every v1 invalid case was an offer, so a verifier with no receipt validation passed the whole suite), a kid-less header, a two-segment JWS and a truncated signature.",
  ],
  how_to_use: {
    key: "Verify against signing.public_key_hex. Do NOT resolve the kid — see kid_is_a_label.",
    kid_is_a_label:
      "The kid reads did:web:scvd.store#conformance-test-key and does not resolve, on purpose. scvd.store's DID document publishes the store's live signing key and must never publish a test key beside it: a key document is a trust anchor, and a test key sitting in one is a foothold rather than a convenience. Treat the kid here as a stable string identifying which key signed the vector.",
    time:
      "Vectors are fixed and deterministic. The only time-dependent expectations are offer_valid (live until 2100) and offer_expired_but_wellformed (expired since 2025), and both say so in their own entry. Nothing else in this set changes verdict with the clock.",
    conformance:
      "A conformant verifier ACCEPTS every entry in `valid` and REJECTS every entry in `invalid`. reject_at names the layer we expect to catch it; rejecting EARLIER is also conformant. Accepting is never conformant.",
  },
  spec: "x402-foundation/x402 specs/extensions/extension-offer-and-receipt.md",
  signing: {
    algorithm: "EdDSA (Ed25519)",
    kid: KID,
    test_seed_hex: TEST_SEED_HEX,
    public_key_hex: publicKey,
    note: "Sign input is ASCII(base64url(header) + '.' + base64url(payload)) per RFC 7515 compact serialization.",
  },
  valid: [
    {
      name: "offer_valid",
      expect: "accept",
      payload: OFFER_PAYLOAD,
      jws: validOffer,
    },
    {
      name: "receipt_valid",
      expect: "accept",
      payload: RECEIPT_PAYLOAD,
      jws: validReceipt,
    },
    {
      name: "offer_expired_but_wellformed",
      expect: "accept",
      live: false,
      note: "CORRECTLY SIGNED, SCHEMA-COMPLETE, AND PAST ITS WINDOW. Conformance and liveness are two questions and this vector is the one that separates them: the document is genuine, so a verifier auditing history should ACCEPT it, while a client about to pay must see that it is expired. A verifier that folds expiry into validity fails this vector; so does one that never reports expiry at all. Report both.",
      payload: EXPIRED_OFFER_PAYLOAD,
      jws: expiredOffer,
    },
  ],
  invalid: [
    {
      name: "offer_missing_version",
      expect: "reject",
      reject_at: "schema",
      note: "The signature itself VERIFIES — the payload lacks the required version field. Signature validity and schema validity are separate checks and a conformant verifier runs both.",
      jws: schemaInvalidOffer,
    },
    {
      name: "offer_wrong_key",
      expect: "reject",
      reject_at: "signature",
      note: "Signed by a key other than the one published above. A verifier that does not resolve the kid to the expected key would wrongly accept this.",
      jws: wrongKeyOffer,
    },
    {
      name: "offer_tampered_payload",
      expect: "reject",
      reject_at: "signature",
      note: "amount altered after signing; the signature no longer covers the payload served.",
      jws: tamperedOffer,
    },
    {
      name: "offer_alg_none",
      expect: "reject",
      reject_at: "alg",
      note: "Header says alg:none and there is no signature at all. A verifier that dispatches on the header's algorithm instead of REQUIRING EdDSA accepts an unsigned document. Oldest attack on this format; still worth a vector.",
      jws: algNoneOffer,
    },
    {
      name: "offer_alg_confusion_hs256",
      expect: "reject",
      reject_at: "alg",
      note: "THE MOST IMPORTANT VECTOR HERE. Header claims HS256 and the signature is a genuine HMAC-SHA256 over the signing input using the ED25519 PUBLIC KEY as the secret. The public key is public, so anybody can produce this. A verifier that reads alg from the header and hands 'the key it has' to a generic verify() will recompute the same MAC and ACCEPT a forgery from a stranger. Require EdDSA before you look at anything else.",
      jws: hmacSigned,
    },
    {
      name: "offer_missing_payTo",
      expect: "reject",
      reject_at: "schema",
      note: "A required field other than version, so the schema check has to be a loop rather than one special case. This is the exact shape CDP's own validator rejected three live listings for: a declaration whose required field is absent from what it ships.",
      jws: offerMissingPayTo,
    },
    {
      name: "receipt_missing_payer",
      expect: "reject",
      reject_at: "schema",
      note: "Receipt-side schema. Every invalid vector before v2 was an OFFER, which meant a verifier with no receipt validation whatsoever passed the entire suite and looked conformant.",
      jws: receiptMissingPayer,
    },
    {
      name: "offer_no_kid",
      expect: "reject",
      reject_at: "kid",
      note: "Valid EdDSA signature, no kid in the header. A verifier must not silently reach for whichever key it happens to hold; without a kid there is nothing saying WHICH key was meant, and guessing is how the wrong issuer gets credited.",
      jws: noKidOffer,
    },
    {
      name: "offer_two_segments",
      expect: "reject",
      reject_at: "parse",
      note: "A JWS with the signature segment absent entirely. Must be refused, and must not throw: a malformed input from a stranger is an ordinary Tuesday for a verifier.",
      jws: twoSegmentOffer,
    },
    {
      name: "offer_truncated_signature",
      expect: "reject",
      reject_at: "signature",
      note: "Structure is fine and the signature is half the bytes it should be. Some verifiers refuse this at parse on a length check, which is also conformant — rejecting EARLIER than reject_at is always fine. Accepting is not.",
      jws: truncatedSigOffer,
    },
  ],
};

writeFileSync(
  "conformance/offer-receipt-vectors.json",
  `${JSON.stringify(vectors, null, 2)}\n`,
);
console.log(
  `Wrote conformance/offer-receipt-vectors.json (${vectors.valid.length} valid, ${vectors.invalid.length} invalid)`,
);
