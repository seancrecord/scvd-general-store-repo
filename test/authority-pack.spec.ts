import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyMessageSignature } from "@/lib/signing";

const BASE = "https://scvd.store";

/**
 * P6 — THE AUTHORITY PACK. The spec's published test vector is a
 * CLAIM about bytes, so the suite recomputes it with the store's own
 * primitives on every build: a vector that drifted from the code
 * would be the exact false authority the pack exists to prevent.
 */
describe("the published test vector recomputes", () => {
  it("both signatures verify, and the two disciplines differ on purpose", async () => {
    const spec = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      test_vectors: {
        vector: {
          public_key: string;
          served_payload_exact_bytes: string;
          primary_signature_over_served_bytes: string;
          jcs_canonicalization_of_same_payload: string;
          signature_jcs_over_jcs_bytes: string;
        };
        key_warning: string;
        incident_policy: string;
        revocation_story: string;
      };
    };
    const vector = spec.test_vectors.vector;

    expect(
      await verifyMessageSignature(
        vector.served_payload_exact_bytes,
        vector.primary_signature_over_served_bytes,
        vector.public_key,
      ),
    ).toBe(true);
    expect(
      await verifyMessageSignature(
        vector.jcs_canonicalization_of_same_payload,
        vector.signature_jcs_over_jcs_bytes,
        vector.public_key,
      ),
    ).toBe(true);
    // The lesson holds: our own jcsCanonicalize of the served payload
    // reproduces the published JCS bytes exactly.
    expect(
      jcsCanonicalize(JSON.parse(vector.served_payload_exact_bytes)),
    ).toBe(vector.jcs_canonicalization_of_same_payload);
    // And the disciplines genuinely differ — same object, different
    // bytes, different signatures.
    expect(vector.served_payload_exact_bytes).not.toBe(
      vector.jcs_canonicalization_of_same_payload,
    );
    expect(vector.primary_signature_over_served_bytes).not.toBe(
      vector.signature_jcs_over_jcs_bytes,
    );
    // Cross-verification must FAIL: a verifier that conflates the two
    // disciplines is caught by this vector.
    expect(
      await verifyMessageSignature(
        vector.jcs_canonicalization_of_same_payload,
        vector.primary_signature_over_served_bytes,
        vector.public_key,
      ),
    ).toBe(false);
  });

  it("the pack states the incident and revocation posture as facts, gaps included", async () => {
    const spec = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      test_vectors: {
        key_warning: string;
        incident_policy: string;
        revocation_story: string;
        reference_verifier_js: string;
      };
    };
    expect(spec.test_vectors.key_warning).toContain("NOTHING real");
    // The single-point-of-failure is named, not papered over.
    expect(spec.test_vectors.incident_policy).toContain("does NOT exist yet");
    expect(spec.test_vectors.incident_policy).toContain("F3");
    // No pretend revocation registry.
    expect(spec.test_vectors.revocation_story).toContain(
      "no revocation registry",
    );
    expect(spec.test_vectors.revocation_story).toContain("withdrawn IN PUBLIC");
    expect(spec.test_vectors.reference_verifier_js).toContain("Ed25519");
  });
});
