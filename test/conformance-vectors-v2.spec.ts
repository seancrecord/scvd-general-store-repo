import { describe, expect, it } from "vitest";
import vectors from "../conformance/offer-receipt-vectors.json";
import {
  verifyArtifact,
  isOfferLive,
  parseJws,
} from "../verifier/x402-verify.js";

/**
 * THE VECTORS, RUN THROUGH THE REAL VERIFIER RATHER THAN A HAND-ROLLED
 * CHECK BESIDE THEM.
 *
 * test/conformance-vectors.spec.ts already asserts the signatures with
 * its own WebCrypto calls, which proves the bytes are what they claim.
 * It cannot prove the SET IS CORRECT — that every entry marked accept
 * is one a conformant verifier accepts, and every reject is one it
 * refuses. That is a different question and it is the one that matters,
 * because a wrong vector does not fail quietly in our repo: it teaches
 * everybody who adopts the suite to implement the wrong behaviour.
 *
 * WHAT THE RED TEAM FOUND IN v1, both on a surface we already publish
 * and point people at from llms.txt and agents.md:
 *
 *   1. offer_valid carried validUntil 2026-01-01 and was published as
 *      known-good. By 2026-08-02 it had been expired for seven months.
 *      A client author who correctly refuses to pay an expired offer
 *      would fail our suite and conclude their own code was broken. We
 *      were teaching strangers to accept expired offers. This is the
 *      AGENTS.md clock rule leaking out of the repo onto somebody
 *      else's CI.
 *   2. The kid never resolved and the set never said so. did:web:
 *      scvd.store publishes the store's live key and deliberately not
 *      this test key, so a verifier that resolved the kid — which
 *      offer_wrong_key's own note told it to do — found nothing and
 *      failed the valid vectors. Self-contradictory instructions.
 *
 * Neither was caught by the existing test, because that test only ever
 * asked "does the signature check out."
 */
type Vector = {
  name: string;
  expect: string;
  reject_at?: string;
  live?: boolean;
  payload?: Record<string, unknown>;
  jws: string;
};

const PUBLIC_KEY = vectors.signing.public_key_hex;
const valid = vectors.valid as Vector[];
const invalid = vectors.invalid as Vector[];

describe("every valid vector is one a conformant verifier accepts", () => {
  it.each(valid.map((v) => [v.name, v] as const))(
    "%s is accepted by the library we ship",
    async (_name, vector) => {
      const result = (await verifyArtifact(vector.jws, {
        publicKey: PUBLIC_KEY,
      })) as { ok: boolean; checks: { name: string; ok: boolean; detail: string }[] };
      expect(
        result.ok,
        `${vector.name} is published as known-good and our own verifier refuses it: ${JSON.stringify(result.checks)}`,
      ).toBe(true);
    },
  );

  /**
   * THE TEACHING CASE, asserted in both directions. An expired offer
   * must stay ACCEPTED (it is a genuine document) and must be reported
   * NOT LIVE (you cannot pay it). A suite that got either half wrong
   * would push implementers toward one of the two mistakes.
   */
  it("separates conformance from liveness on the expired vector", async () => {
    const expired = valid.find((v) => v.name === "offer_expired_but_wellformed");
    expect(expired, "the teaching case is gone from the set").toBeDefined();
    expect(expired!.live).toBe(false);

    const result = (await verifyArtifact(expired!.jws, {
      publicKey: PUBLIC_KEY,
    })) as { ok: boolean };
    expect(result.ok, "an expired but genuine offer should still verify").toBe(
      true,
    );
    const liveness = isOfferLive(expired!.payload) as { live: boolean };
    expect(liveness.live, "the expired vector reports itself as live").toBe(
      false,
    );
  });

  it("keeps the live vector actually live", async () => {
    const live = valid.find((v) => v.name === "offer_valid");
    const liveness = isOfferLive(live!.payload) as { live: boolean };
    expect(
      liveness.live,
      "offer_valid has expired — this is exactly the v1 defect, returned",
    ).toBe(true);
  });
});

describe("every invalid vector is one a conformant verifier refuses", () => {
  it.each(invalid.map((v) => [v.name, v] as const))(
    "%s is refused",
    async (_name, vector) => {
      let ok: boolean;
      try {
        const result = (await verifyArtifact(vector.jws, {
          publicKey: PUBLIC_KEY,
        })) as { ok: boolean };
        ok = result.ok;
      } catch {
        // Refusing by throwing is refusing. What must never happen is
        // acceptance.
        ok = false;
      }
      expect(
        ok,
        `${vector.name} is published as known-bad and our own verifier ACCEPTS it — every consumer of this suite would inherit the same hole`,
      ).toBe(false);
    },
  );

  /**
   * ALGORITHM CONFUSION, singled out because it is the one an
   * implementer is most likely to get wrong and least likely to
   * notice. The signature is a genuine HMAC over the PUBLIC key, so a
   * verifier that dispatches on the header's alg computes a matching
   * MAC and accepts a forgery anybody could have made.
   */
  it("refuses the HS256 confusion vector at the algorithm, not the signature", async () => {
    const vector = invalid.find((v) => v.name === "offer_alg_confusion_hs256");
    expect(vector, "the algorithm-confusion vector is missing").toBeDefined();
    const parsed = parseJws(vector!.jws) as {
      ok: boolean;
      header?: { alg?: string };
    };
    expect(parsed.header?.alg).toBe("HS256");
    const result = (await verifyArtifact(vector!.jws, {
      publicKey: PUBLIC_KEY,
    })) as { ok: boolean; checks: { name: string; ok: boolean }[] };
    expect(result.ok).toBe(false);
    const algCheck = result.checks.find((check) => check.name === "alg");
    expect(
      algCheck?.ok,
      "the alg check passed on a non-EdDSA header, which is the whole attack",
    ).toBe(false);
  });

  it("refuses alg:none without reaching for a key", async () => {
    /**
     * Our library rejects this at PARSE — an alg:none JWS has an empty
     * signature segment — rather than at the alg check. That is
     * conformant under the set's own rule (rejecting earlier is always
     * fine) and it is why this asserts the STAGE LOOSELY: the vector's
     * reject_at names where a verifier should conceptually catch it,
     * not the only acceptable answer.
     *
     * The first cut of this test demanded the alg check specifically
     * and failed — my assertion was stricter than the spec I had just
     * written two files away.
     */
    const vector = invalid.find((v) => v.name === "offer_alg_none");
    const result = (await verifyArtifact(vector!.jws, {
      publicKey: PUBLIC_KEY,
    })) as { ok: boolean; checks: { name: string; ok: boolean }[] };
    expect(result.ok).toBe(false);
    const stopped = result.checks.find((check) => !check.ok);
    expect(
      ["parse", "alg"],
      `alg:none was refused at ${stopped?.name} — anything at or before the algorithm check is fine, but it must not get as far as trusting a signature`,
    ).toContain(stopped?.name);
  });

  it("does not throw on a malformed input, ever", async () => {
    // A stranger's malformed document is an ordinary Tuesday. Throwing
    // pushes the failure into the caller's error path where it reads as
    // an outage rather than a verdict.
    for (const name of ["offer_two_segments", "offer_truncated_signature"]) {
      const vector = invalid.find((v) => v.name === name);
      await expect(
        verifyArtifact(vector!.jws, { publicKey: PUBLIC_KEY }),
      ).resolves.toBeDefined();
    }
  });
});

/**
 * THE STRUCTURAL GUARD. Fixing the expired vector is worth little if
 * the next one rots the same way, so this refuses any accept-vector
 * whose window could close inside the working life of the format.
 */
describe("no vector's verdict can move with the wall clock", () => {
  it("gives every live offer a window that outlasts everyone reading this", () => {
    const HORIZON = 4_000_000_000; // 2096-ish
    for (const vector of valid) {
      const until = vector.payload?.["validUntil"];
      if (typeof until !== "number") continue;
      if (vector.live === false) continue; // deliberately expired
      expect(
        until,
        `${vector.name} is published as accept-and-live with validUntil ${until} (${new Date(until * 1000).toISOString()}). It will expire and start failing for everyone who adopted this suite, which is exactly what happened to v1.`,
      ).toBeGreaterThan(HORIZON);
    }
  });

  it("declares the time semantics in the file itself", () => {
    const how = (vectors as unknown as { how_to_use?: Record<string, string> })
      .how_to_use;
    expect(how?.["time"], "the set does not say which vectors depend on time").toBeTruthy();
    expect(how?.["kid_is_a_label"], "the set does not say the kid is unresolvable").toBeTruthy();
    expect(String(how?.["kid_is_a_label"])).toContain("does not resolve");
  });

  it("is versioned, so a consumer can pin what they tested against", () => {
    expect((vectors as unknown as { version?: number }).version).toBeGreaterThanOrEqual(2);
  });
});
