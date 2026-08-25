import { describe, expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import PUBLISHED from "./fixtures/published-signatures.json";

/**
 * THE ONLY SIGNATURES IN THIS REPO THE SUITE DID NOT MAKE.
 *
 * Every other signing test signs a payload and then verifies it, both
 * with whatever version of the ed25519 library is installed. The two
 * halves never disagree because they are the same half. So a signing
 * upgrade can pass the entire suite while changing what this store
 * PRODUCES — and every certificate already in somebody else's hands
 * would quietly stop checking out.
 *
 * These fixtures were captured from the store's own public verify
 * endpoint on 2026-08-25: the payload, the signature and the public
 * key exactly as served, for certificates issued in July and August.
 * Nothing here was generated locally, and the private key is neither
 * present nor needed — verification takes the public one.
 *
 * WHY THIS LANDS BEFORE THE UPGRADE, NOT WITH IT. A guard added on
 * the upgrade branch that passes tells you nothing: you cannot tell a
 * safe upgrade from a fixture that never had teeth. Proven green
 * against the CURRENT library first, this becomes a real answer when
 * the library moves — green means every artifact ever issued still
 * verifies, red means the upgrade changes the store's bytes and the
 * migration is real work.
 *
 * ed25519 is deterministic by RFC 8032, so the risk was never
 * randomness. It is whether what reaches the signer changed shape —
 * exactly what a hex-handling change touches.
 */
describe("certificates this store already published still verify", () => {
  it("has fixtures to check, captured rather than generated", () => {
    // An empty list would satisfy every loop below by having nothing
    // to check, which is the shape this suite spent a day removing.
    expect(PUBLISHED.certificates.length).toBeGreaterThan(0);
    for (const cert of PUBLISHED.certificates) {
      expect(cert.algorithm).toBe("ed25519");
      expect(cert.signature).toMatch(/^[0-9a-f]+$/);
      expect(cert.public_key).toMatch(/^[0-9a-f]{64}$/);
      expect(cert.signed_payload.length).toBeGreaterThan(0);
      expect(cert.fetched_from).toContain("/api/verify/");
    }
  });

  for (const cert of PUBLISHED.certificates) {
    it(`still verifies ${cert.cert_id}, issued ${cert.issued.slice(0, 10)}`, async () => {
      const ok = await verifyMessageSignature(
        cert.signed_payload,
        cert.signature,
        cert.public_key,
      );
      expect(
        ok,
        `${cert.cert_id} was published and verified once; this library no longer verifies it. Every copy of this artifact in somebody else's hands is now unverifiable against us.`,
      ).toBe(true);
    });
  }

  it("rejects a payload that was altered after signing", async () => {
    /*
     * The other half of the property, and the reason the checks above
     * are not vacuous: a verifier that returns true for everything
     * would pass every assertion in this file. One flipped character
     * in the signed payload must fail.
     */
    const cert = PUBLISHED.certificates[0]!;
    const tampered = cert.signed_payload.replace(/"item":"([^"]*)"/, '"item":"$1x"');
    expect(tampered).not.toBe(cert.signed_payload);
    const ok = await verifyMessageSignature(
      tampered,
      cert.signature,
      cert.public_key,
    );
    expect(ok, "the verifier accepts an altered payload").toBe(false);
  });
});
