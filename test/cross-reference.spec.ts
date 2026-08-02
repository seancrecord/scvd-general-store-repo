import { describe, expect, it } from "vitest";
import {
  counterpartKeyUrl,
  crossRefShapeProblem,
  keyAcceptableAt,
  verifyCrossReference,
  verifyCrossReferences,
} from "@/services/cross-reference";
import {
  canonicalizeCertificate,
  certificateSignatureForm,
  signCertificate,
} from "@/lib/signing";
import { CROSS_REF_ACCEPTED_FOR, type Certificate, type CrossReference } from "@/types";

/**
 * CROSS-PLATFORM RECEIPT RECOGNITION (CORRESPONDENCE T4/T15).
 *
 * Two properties carry this feature and both are tested by attacking
 * them rather than by demonstrating them:
 *
 *   1. THE CLAIM IS NARROW AND STAYS NARROW. `issuer_verified_settlement`
 *      is the only value v0 accepts, and anything else is REFUSED
 *      rather than quietly treated as a weaker claim.
 *   2. IT FAILS CLOSED. Every step that cannot complete reads as
 *      unverified. An unreachable counterpart is an unproven claim,
 *      never an assumed one — this is a statement about somebody
 *      else's operator, riding inside our signature.
 */

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const TEST_SEED = "42".repeat(32);

function ref(overrides: Partial<CrossReference> = {}): CrossReference {
  return {
    counterpart_issuer: "zooid.fund",
    counterpart_key_fingerprint: KEY_A,
    counterpart_artifact_id: "donation_row_991",
    accepted_for: CROSS_REF_ACCEPTED_FOR,
    verified_at_mint: true,
    ...overrides,
  };
}

function keyDocFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

describe("the claim stays narrow", () => {
  it("refuses any accepted_for outside the single v0 value", () => {
    // The guardrail CV and causeclaw flagged independently. An
    // unrecognised claim must be REFUSED, never downgraded to
    // something we happen to tolerate.
    for (const bad of [
      "quality_verified",
      "delivery_confirmed",
      "endorsement",
      "",
    ]) {
      const problem = crossRefShapeProblem(ref({ accepted_for: bad as never }));
      expect(problem, `accepted_for="${bad}" was not refused`).toContain(
        "accepted_for must be",
      );
    }
  });

  it("accepts the one legal value", () => {
    expect(crossRefShapeProblem(ref())).toBeNull();
  });

  it("rejects a reference missing any required field", () => {
    for (const field of [
      "counterpart_issuer",
      "counterpart_key_fingerprint",
      "counterpart_artifact_id",
    ]) {
      const broken = { ...ref() } as Record<string, unknown>;
      delete broken[field];
      expect(crossRefShapeProblem(broken)).toContain(field);
    }
  });

  it("will not take a verified_at_mint that is not a boolean", () => {
    // A truthy string here would read as "we checked" without us
    // having checked anything.
    expect(
      crossRefShapeProblem(ref({ verified_at_mint: "yes" as never })),
    ).toContain("verified_at_mint");
  });
});

describe("the issuer never becomes a URL unchecked", () => {
  it("derives the key document location from a plain hostname", () => {
    expect(counterpartKeyUrl("zooid.fund")).toBe(
      "https://zooid.fund/.well-known/scvd-signing-key",
    );
  });

  it("refuses anything that is not a bare hostname", () => {
    /**
     * The issuer arrives inside a signed artifact, but it was
     * originally supplied by a buyer — so it is untrusted input that
     * happens to be countersigned. A scheme, a path, or credentials
     * in there would make our own verifier fetch wherever an attacker
     * pointed it.
     */
    for (const bad of [
      "https://zooid.fund",
      "zooid.fund/../../etc",
      "user:pass@zooid.fund",
      "localhost",
      "127.0.0.1",
      "",
      "zooid fund",
    ]) {
      expect(counterpartKeyUrl(bad), `"${bad}" was turned into a URL`).toBeNull();
    }
  });
});

describe("key acceptability at a date", () => {
  const doc = {
    current: { public_key: KEY_A },
    retired: [{ public_key: KEY_B, retired_on: "2026-06-01" }],
  };

  it("accepts the counterpart's current key", () => {
    const verdict = keyAcceptableAt(doc, KEY_A, new Date("2026-08-02"));
    expect(verdict.ok).toBe(true);
  });

  it("accepts a retired key for an artifact that predates its retirement", () => {
    // Refusing these would mean a counterpart's rotation retroactively
    // broke every cross-reference they had ever been part of, which
    // would teach operators that rotating is dangerous.
    const verdict = keyAcceptableAt(doc, KEY_B, new Date("2026-05-01"));
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("in service");
  });

  it("refuses a retired key for an artifact dated after retirement", () => {
    const verdict = keyAcceptableAt(doc, KEY_B, new Date("2026-07-01"));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("already retired");
  });

  it("refuses a key that appears nowhere in their history", () => {
    const verdict = keyAcceptableAt(doc, "c".repeat(64), new Date());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("appears nowhere");
  });

  it("refuses rather than guesses when a retirement date is unreadable", () => {
    const broken = {
      current: { public_key: KEY_A },
      retired: [{ public_key: KEY_B, retired_on: "sometime last year" }],
    };
    const verdict = keyAcceptableAt(broken, KEY_B, new Date("2026-05-01"));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("unreadable");
  });
});

describe("it fails closed", () => {
  it("verifies a good reference against a reachable counterpart", async () => {
    const check = await verifyCrossReference(ref(), {
      fetch: keyDocFetch({ key_history: { current: { public_key: KEY_A } } }),
    });
    expect(check.verified).toBe(true);
    // Even the success message refuses to imply more than it proved.
    expect(check.reason).toContain("nothing about quality");
  });

  it("reads an unreachable counterpart as UNVERIFIED, not as fine", async () => {
    const check = await verifyCrossReference(ref(), {
      fetch: keyDocFetch(null, 503),
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("503");
    expect(check.reason).toContain("never an assumed one");
  });

  it("reads a network failure as unverified", async () => {
    const check = await verifyCrossReference(ref(), {
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("unreachable");
  });

  it("does not trust the artifact's own verified_at_mint claim", async () => {
    /**
     * The field says what WE did at mint. It is signed, so it cannot
     * be forged — but it is still a past-tense claim, and a checker
     * today must resolve the key itself rather than reading a boolean
     * and stopping.
     */
    const check = await verifyCrossReference(ref({ verified_at_mint: true }), {
      fetch: keyDocFetch({ key_history: { current: { public_key: KEY_B } } }),
    });
    expect(check.verified_at_mint).toBe(true);
    expect(check.verified).toBe(false);
  });

  it("checks every reference on a certificate, keeping order", async () => {
    const checks = await verifyCrossReferences(
      [ref({ counterpart_artifact_id: "one" }), ref({ counterpart_artifact_id: "two" })],
      { fetch: keyDocFetch({ key_history: { current: { public_key: KEY_A } } }) },
    );
    expect(checks.map((c) => c.counterpart_artifact_id)).toEqual(["one", "two"]);
  });

  it("returns nothing for a certificate with no references", async () => {
    expect(await verifyCrossReferences(undefined)).toEqual([]);
  });
});

describe("the signature covers it", () => {
  /**
   * The correction to the spec as relayed, which proposed cross_ref as
   * additive and OUTSIDE the signing pipeline. It cannot be: a
   * cross-reference is a provenance claim about a third party, so an
   * unsigned one could be stapled onto a copy of our certificate with
   * our signature still verifying.
   */
  const cert: Certificate = {
    cert_id: "cert_xref",
    item: "graffiti_on_a_train",
    patron_number: 42,
    date: "2026-08-02",
    cross_ref: [ref()],
  };

  it("puts cross_ref inside the canonical signed form", () => {
    expect(canonicalizeCertificate(cert)).toContain("cross_ref");
    expect(canonicalizeCertificate(cert)).toContain("zooid.fund");
  });

  it("breaks the signature if a reference is added after minting", async () => {
    const bare: Certificate = { ...cert };
    delete bare.cross_ref;
    const { signature, publicKey } = await signCertificate(bare, TEST_SEED);

    // Honest article verifies.
    expect(await certificateSignatureForm(bare, signature, publicKey)).toBe(
      "current",
    );

    // Now staple a cross-reference onto it, the forgery this ordering
    // exists to prevent.
    const forged: Certificate = { ...bare, cross_ref: [ref()] };
    expect(await certificateSignatureForm(forged, signature, publicKey)).toBe(
      "invalid",
    );
  });

  it("breaks the signature if a reference is altered after minting", async () => {
    const { signature, publicKey } = await signCertificate(cert, TEST_SEED);
    expect(await certificateSignatureForm(cert, signature, publicKey)).toBe(
      "current",
    );
    const tampered: Certificate = {
      ...cert,
      cross_ref: [ref({ counterpart_artifact_id: "some_other_row" })],
    };
    expect(await certificateSignatureForm(tampered, signature, publicKey)).toBe(
      "invalid",
    );
  });
});
