import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import vectors from "../conformance/offer-receipt-vectors.json";
import { cachedPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE VECTORS MUST BE TRUE BEFORE THEY ARE OFFERED. These are the
 * conformance vectors SPEC_SUBMISSION.md volunteers to the x402 repo
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
  const signatureValid = await ed25519.verifyAsync(
    Uint8Array.from(atob(pad(signature!)), (ch) => ch.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${body}`),
    hexToBytes(publicKeyHex),
  );
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
      const { signatureValid, payload } = await verifyVector(
        vector.jws,
        vectors.signing.public_key_hex,
      );
      if (vector.reject_at === "signature") {
        expect(signatureValid, `${vector.name} should fail signature`).toBe(
          false,
        );
      } else {
        // The teaching vector: signature VALID, schema not. An SDK
        // that only checks signatures accepts this and is wrong.
        expect(signatureValid, `${vector.name} signature should pass`).toBe(
          true,
        );
        expect(payload["version"]).toBeUndefined();
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
