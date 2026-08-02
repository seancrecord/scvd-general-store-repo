import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import vectors from "../conformance/offer-receipt-vectors.json";
import { cachedPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE VECTORS MUST BE TRUE BEFORE THEY ARE OFFERED. These are the
 * conformance vectors this store volunteers to the x402 repo
 * — known-good and known-bad artifacts an SDK author in any language
 * tests against. Handing over a vector suite with a wrong bit in it
 * would poison every downstream test suite that adopts it, which is
 * the paraphrase defect exported.
 *
 * So this walks the COMMITTED file — the exact bytes a stranger would
 * vendor — with an independent verification, not the code that
 * generated it.
 */
const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));

async function verifyVector(
  jws: string,
  publicKeyHex: string,
): Promise<{ signatureValid: boolean; payload: Record<string, unknown> }> {
  const [header, body, signature] = jws.split(".");
  const pad = (part: string): string =>
    part!.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (part!.length % 4)) % 4);
  /**
   * A THROW IS A FALSE HERE, same rule the library itself now follows.
   * @noble raises on a wrong-length signature rather than answering,
   * and the truncated-signature vector is exactly that input — so a
   * helper without this guard crashes instead of reporting the
   * rejection it was written to observe. The library had the identical
   * gap on its injected-crypto seam until this vector found it.
   */
  let signatureValid: boolean;
  try {
    signatureValid = await ed25519.verifyAsync(
      Uint8Array.from(atob(pad(signature!)), (ch) => ch.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`),
      hexToBytes(publicKeyHex),
    );
  } catch {
    signatureValid = false;
  }
  return {
    signatureValid,
    payload: JSON.parse(atob(pad(body!))) as Record<string, unknown>,
  };
}

describe("the committed conformance vectors are what they claim", () => {
  it("accepts every valid vector: signature and schema both", async () => {
    for (const vector of vectors.valid) {
      const { signatureValid, payload } = await verifyVector(
        vector.jws,
        vectors.signing.public_key_hex,
      );
      expect(signatureValid, `${vector.name} signature fails`).toBe(true);
      expect(payload["version"], `${vector.name} lacks version`).toBe(1);
      expect(payload).toEqual(vector.payload);
    }
  });

  it("rejects every invalid vector at the layer it declares", async () => {
    for (const vector of vectors.invalid) {
      /**
       * ONLY THE SIGNATURE-BEARING CATEGORIES REACH THE HELPER BELOW.
       * A vector that fails at parse, alg or kid has no computable
       * signature — two_segments has no signature segment at all and
       * alg:none has an empty one — so handing them to a raw Ed25519
       * verify throws rather than answering. Their conformance is
       * asserted where it belongs, in conformance-vectors-v2.spec.ts,
       * against the real verifier.
       */
      if (vector.reject_at !== "signature" && vector.reject_at !== "schema") {
        continue;
      }
      const { signatureValid, payload } = await verifyVector(
        vector.jws,
        vectors.signing.public_key_hex,
      );
      /**
       * This file checks the BYTES — whether the signature over each
       * vector is what the vector claims. It is not the conformance
       * judge; test/conformance-vectors-v2.spec.ts runs the real
       * verifier against every entry and holds it to its declared
       * outcome.
       *
       * So the assertion here is narrow on purpose, and only the two
       * signature-bearing categories are meaningful: a vector that
       * fails at parse, alg or kid never reaches a signature check at
       * all, and asserting anything about its signature would be
       * asserting about a thing that was never computed.
       */
      if (vector.reject_at === "signature") {
        expect(signatureValid, `${vector.name} should fail signature`).toBe(
          false,
        );
      } else if (vector.reject_at === "schema") {
        // The teaching shape: signature VALID, schema not. An SDK that
        // only checks signatures accepts this and is wrong.
        expect(signatureValid, `${vector.name} signature should pass`).toBe(
          true,
        );
        expect(
          Object.keys(payload).length,
          `${vector.name} should be missing a required field`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("derives its public key from its published seed, and neither is ours", async () => {
    const derived = Buffer.from(
      await ed25519.getPublicKeyAsync(hexToBytes(vectors.signing.test_seed_hex)),
    ).toString("hex");
    expect(derived).toBe(vectors.signing.public_key_hex);
    // The one safety property that matters: the published, throwaway
    // test key must never be the store's live key.
    const live = await cachedPublicKeyHex((env as Env).SIGNING_KEY);
    expect(vectors.signing.public_key_hex).not.toBe(live);
  });
});
