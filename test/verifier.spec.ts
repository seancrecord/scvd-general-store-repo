import * as ed25519 from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import vectors from "../conformance/offer-receipt-vectors.json";
import {
  formatResult,
  hexToBytes,
  isOfferLive,
  parseJws,
  validateOfferPayload,
  validateReceiptPayload,
  verifyArtifact,
} from "../verifier/x402-verify.js";

/**
 * THE FREE VERIFIER, tested against the store's own published
 * conformance vectors — the same file any outside implementer can
 * fetch. If the verifier and the vectors ever disagree, one of the two
 * is wrong and this suite says so before a stranger has to find out.
 *
 * The vectors were built to teach one lesson in particular: signature
 * validity and schema validity are SEPARATE checks. offer_missing_version
 * carries a signature that verifies perfectly over a payload that is
 * not a conformant offer. A verifier that folds those together passes
 * it, and this file proves ours does not.
 *
 * Crypto is injected here rather than left to WebCrypto, because the
 * seam is the point: a runtime without Ed25519 in WebCrypto must still
 * be able to use this library, and the only way to know that seam
 * works is to use it.
 */
const inject = {
  verify: async (
    signingInput: string,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ) =>
    ed25519.verifyAsync(
      signature,
      new TextEncoder().encode(signingInput),
      publicKey,
    ),
};

const testKey = hexToBytes(vectors.signing.public_key_hex)!;

describe("the verifier against the published vectors", () => {
  it("accepts every artifact the vectors call valid", async () => {
    for (const vector of vectors.valid) {
      const result = await verifyArtifact(vector.jws, {
        publicKey: testKey,
        // The vectors are frozen in time; expiry is advisory anyway,
        // but say so explicitly rather than let a stale date confuse
        // the reading.
        nowSeconds: 1767226000,
        ...inject,
      });
      expect(result.ok, `${vector.name}\n${formatResult(result)}`).toBe(true);
    }
  });

  it("rejects every artifact the vectors call invalid, for the stated reason", async () => {
    for (const vector of vectors.invalid) {
      const result = await verifyArtifact(vector.jws, {
        publicKey: testKey,
        nowSeconds: 1767226000,
        ...inject,
      });
      expect(result.ok, `${vector.name} should have been rejected`).toBe(false);
      const failed = result.checks
        .filter((check) => !check.ok && !check.advisory)
        .map((check) => check.name);
      /**
       * reject_at names where a verifier SHOULD conceptually catch it.
       * Rejecting EARLIER is also conformant and the vectors file says
       * so in how_to_use.conformance — alg:none, for instance, has an
       * empty signature segment and dies at parse before any algorithm
       * is consulted. What is never conformant is accepting, which the
       * assertion above already covers.
       */
      const ORDER = ["parse", "alg", "kid", "schema", "signature", "expiry"];
      const declared = ORDER.indexOf(vector.reject_at);
      const earliest = Math.min(
        ...failed.map((name) => {
          const index = ORDER.indexOf(name);
          return index === -1 ? ORDER.length : index;
        }),
      );
      expect(
        earliest,
        `${vector.name} was refused at ${failed.join("/")}, later than the declared ${vector.reject_at}\n${formatResult(result)}`,
      ).toBeLessThanOrEqual(declared === -1 ? ORDER.length : declared);
    }
  });

  it("proves the teaching case: a valid signature over an invalid payload", async () => {
    const teaching = vectors.invalid.find(
      (vector) => vector.name === "offer_missing_version",
    )!;
    const result = await verifyArtifact(teaching.jws, {
      publicKey: testKey,
      nowSeconds: 1767226000,
      ...inject,
    });
    const byName = new Map(result.checks.map((check) => [check.name, check]));
    // The signature is GOOD. The artifact is still not conformant.
    expect(byName.get("signature")?.ok).toBe(true);
    expect(byName.get("schema")?.ok).toBe(false);
    expect(byName.get("schema")?.detail).toContain("version");
    expect(result.ok).toBe(false);
  });
});

describe("the parts, checkable on their own", () => {
  it("refuses a JWS that is not three base64url segments", () => {
    expect(parseJws("nope").ok).toBe(false);
    expect(parseJws("a.b").ok).toBe(false);
    expect(parseJws(12345 as unknown as string).ok).toBe(false);
  });

  it("names every missing required field rather than the first", () => {
    const problems = validateOfferPayload({ version: 1 });
    expect(problems.length).toBeGreaterThan(3);
    expect(problems.join(" ")).toContain("resourceUrl");
    expect(problems.join(" ")).toContain("payTo");
  });

  it("knows a receipt from an offer by its own required fields", () => {
    expect(validateReceiptPayload(vectors.valid[1]!.payload)).toEqual([]);
    // An offer payload is not a valid receipt: different required set.
    expect(validateReceiptPayload(vectors.valid[0]!.payload).length)
      .toBeGreaterThan(0);
  });

  it("treats expiry as advisory, with caller-set leeway", () => {
    const offer = vectors.valid[0]!.payload as { validUntil: number };
    expect(isOfferLive(offer, { nowSeconds: offer.validUntil - 1 }).live).toBe(
      true,
    );
    // Three seconds past, but inside the default leeway: still live.
    expect(isOfferLive(offer, { nowSeconds: offer.validUntil + 3 }).live).toBe(
      true,
    );
    expect(
      isOfferLive(offer, { nowSeconds: offer.validUntil + 3, leewaySeconds: 0 })
        .live,
    ).toBe(false);
  });

  it("fails closed when it has no key to check against", async () => {
    const result = await verifyArtifact(vectors.valid[0]!.jws, {
      // No publicKey, and the vectors' kid is a did:web we do not
      // resolve here — no network in this test.
      fetch: async () => {
        throw new Error("no network in tests");
      },
      ...inject,
    });
    expect(result.ok).toBe(false);
    const signature = result.checks.find((check) => check.name === "signature");
    expect(signature?.ok).toBe(false);
  });

  it("says the honest thing about what it cannot check", async () => {
    // The module's own contract: it verifies bytes, never delivery.
    const source = await import("../verifier/x402-verify.js");
    expect(typeof source.verifyArtifact).toBe("function");
    // A rejected artifact reads as a report, not a bare false.
    const result = await verifyArtifact("not-a-jws", { ...inject });
    expect(formatResult(result)).toContain("REJECTED");
    expect(formatResult(result)).toContain("parse");
  });
});
