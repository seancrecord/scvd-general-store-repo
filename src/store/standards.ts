/**
 * THE STANDARDS POSTURE, stated once and surfaced everywhere machines
 * read.
 *
 * An outside evaluation put its finger on the thing this store had
 * built but never said out loud: adopting the official x402 Signed
 * Offers & Receipts extension, JWS/EdDSA, and did:web moved it from
 * "indie project with custom rules" to a spec-compliant implementation
 * that any standard verifier can check WITHOUT trusting the store's
 * own endpoints. That story lived in the code and nowhere a diligence
 * pass would find it — the exact defect trust.json exists to fix, one
 * layer up.
 *
 * FACTS, NOT ADJECTIVES. Every line here names something checkable:
 * a spec, a URL, a header, a published test suite. "Reference
 * implementation" is a judgment outsiders get to make; what we state
 * is what we implement and where to point a verifier.
 */

export const STANDARDS_POSTURE = {
  summary:
    "This store implements open standards end to end: x402 v2 payments, the official x402 Signed Offers & Receipts extension (JWS, EdDSA over Ed25519), and did:web identity resolution. Nothing about verifying this store requires this store's cooperation — resolve the DID, extract the key, verify the JWS with any standard library.",
  what_is_implemented: [
    "x402 v2 payment protocol: USDC on Base (eip155:8453), PAYMENT-REQUIRED / PAYMENT-RESPONSE headers, facilitator settlement before goods move.",
    "x402 Signed Offers & Receipts extension: every 402 challenge carries signed offers (one per accepts entry) committing to exact price, asset, payTo, and resource before money moves; every settled purchase returns a signed receipt in the PAYMENT-RESPONSE header.",
    "JWS compact serialization per RFC 7515, alg EdDSA, kid as a DID URL — no proprietary signature envelope anywhere in the offer/receipt path.",
    "did:web identity at /.well-known/did.json, with retired keys listed permanently and each rotation announced in an artifact signed by the OUTGOING key (live example: /api/verify/handover_1).",
    "MCP (Model Context Protocol) server with tool annotations, streamable HTTP transport, and in-band x402 settlement.",
  ],
  why_it_matters: {
    universal_verification:
      "Zero custom parsing: any open-source DID or x402 verifier can fetch the DID document, resolve the kid, and verify a receipt locally. The /api/verify endpoint is a convenience, not a requirement — there is no 'trust our verifier' step anywhere in the design.",
    pre_payment_commitment:
      "Signed offers make bait-and-switch cryptographically evident: the store commits to exact terms before the agent signs a payment, and a client that keeps the offer holds signed evidence of what was promised if delivery falls short.",
    portable_proof_of_purchase:
      "A signed receipt is presentable to any third party — an operator, an auditor, another agent — as proof that a specific payer bought a specific resource at a specific time, signed by this store's published identity key.",
    live_test_target:
      "Implementers of the offer-receipt extension can test against this store: deterministic conformance vectors (known-good and known-bad JWS artifacts, regenerable byte for byte from a published test seed) plus live doors that issue real signed offers on every 402.",
  },
  verify_without_trusting_us: [
    "1. Fetch https://scvd.store/.well-known/did.json and take the Ed25519 public key from verificationMethod (the kid names the KEY, permanently — retired keys stay listed with their service dates).",
    "2. Take the JWS from extensions['offer-receipt'] in a 402's PAYMENT-REQUIRED header (offers) or a settled response's PAYMENT-RESPONSE header (receipt).",
    "3. Verify with any RFC 7515 / Ed25519 library: signing input is ASCII(base64url(header) + '.' + base64url(payload)). No scvd.store code or endpoint involved.",
  ],
  verifier_guidance:
    "Issuance is strict, consumption should be tolerant: offers carry validUntil = issuance + 300 seconds from this store's clock, and a verifier comparing against its own clock should allow a few seconds of skew leeway before rejecting — NTP drift on your side is real and a 300-second window makes small leeway harmless. This store itself compares no timestamps on the verify path (checked 2026-08-01, recorded in PROBLEMS.md), so the leeway that matters is yours.",
  open_source_verifier: {
    what: "A zero-dependency verifier for x402 Signed Offers & Receipts, did:web identity and key history — MIT, works on ANY store's artifacts with nothing privileged about ours. It keeps the four checks separate (parse, resolve the kid to a key from somewhere other than the artifact, verify the signature, validate the schema) because signature validity and schema validity are not the same check, and a verifier that folds them together accepts a valid signature over a non-conformant payload.",
    honest_limit:
      "It verifies cryptography and shape. It cannot tell you whether a seller actually delivered what it promised — no offline check can, because that is a fact about the world rather than about bytes.",
    anchored_key_history:
      "It also takes an OPTIONAL step past offline math: checkAnchoredKeyHistory() reads any issuer's /.well-known/anchor-log.json, RECOMPUTES the whole hash chain from the published snapshots rather than trusting the digests printed on it, and reports when a key first appears and whether a Bitcoin-confirmed entry stands at or above it. Generic by design — an issuer without an anchor log returns available:false, which is information rather than a failure, and nothing about this store is privileged.",
    source:
      "https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier",
  },
  externally_anchored_key_history: {
    what: "An append-only hash chain over this store's signing-key state, published in full at /.well-known/anchor-log.json. Each entry commits to the digest of the entry before it, and digests are submitted to OpenTimestamps, which aggregates them into Bitcoin — so one confirmed anchor vouches for the entire history behind it.",
    why: "A self-hosted key registry is editable after the fact. The transition chain is cryptographic and the git history is third-party timestamped, but neither is immutability. This makes 'this key state existed before block N' a fact about the Bitcoin chain instead of a claim on our own website.",
    honest_limit:
      "It proves WHEN, never WHO SHOULD HAVE. Anyone holding this store's key — including a thief — could sign and timestamp exactly as validly. What it buys is a forensic timeline that bounds a compromise window after the fact, not a defence that prevents one. The defence against theft is the succession protocol at /attestation, and it is a separate thing.",
    pending_vs_complete:
      "A 'pending' proof is a calendar server's promise and not yet a Bitcoin commitment; it typically confirms within a couple of hours, and a cron upgrades it when it does. The distinction is published per entry rather than smoothed over, because a pending proof genuinely proves less than a complete one.",
    path: "/.well-known/anchor-log.json",
  },
  conformance_vectors: {
    what: "Deterministic test vectors for the offer-receipt extension: 2 valid artifacts and 3 invalid ones (schema-invalid with a VALID signature, wrong key, tampered payload) — the invalid cases teach a verifier that signature validity and schema validity are separate checks.",
    test_key_note:
      "Signed with a test key whose seed is published on purpose (32 bytes of 0x42) — unusable for anything else precisely because it is published, and asserted by test to differ from the live key.",
    path: "/.well-known/conformance/offer-receipt-vectors.json",
  },
  code_transparency: {
    repository: "https://github.com/seancrecord/scvd-general-store-repo",
    settlement_path: [
      "https://github.com/seancrecord/scvd-general-store-repo/blob/main/src/lib/payment-gate.ts",
      "https://github.com/seancrecord/scvd-general-store-repo/blob/main/src/lib/payments.ts",
      "https://github.com/seancrecord/scvd-general-store-repo/blob/main/src/lib/offer-receipt.ts",
    ],
    review_status:
      "No paid third-party audit, said plainly. External review happens in public instead: the payment and settlement code above is open, and the store engages the x402 specification community on the record — review it, and tell us what we got wrong at /api/letter. /corrections is where being wrong goes when it happens.",
  },
} as const;
