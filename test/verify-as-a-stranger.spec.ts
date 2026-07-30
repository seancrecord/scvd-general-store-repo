import * as ed25519 from "@noble/ed25519";
import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import {
  canonicalizeCertificate,
  canonicalizeCertificateLegacy,
  certificateSignatureForm,
  signCertificate,
} from "@/lib/signing";
import type { Certificate, Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * VERIFYING THE WAY A STRANGER HAS TO, WHICH IS THE ONLY WAY THAT COUNTS.
 *
 * CV found this from outside on 2026-07-30, with real ed25519, after the
 * cold-read test on certificates: the key and signature were correctly
 * shaped and NOTHING verified — not the certificate object as served, not
 * compact JSON, not the attests hash alone, not the response minus the
 * signature. He checked the crypto himself before reporting it.
 *
 * TWO SEPARATE DEFECTS, and the audit found the second one:
 *
 *   1. /api/verify — the endpoint whose ENTIRE JOB is third-party
 *      checking — published no canonicalization, while the
 *      settlement_attestation purchase response did. The one artifact
 *      class meant purely for outside trust omitted the one field needed
 *      to exercise it.
 *   2. `tag` and `attests` were served on certificates and NOT SIGNED.
 *      Both added 2026-07-28; the canonicalizer was never updated. The
 *      `attests` case is the dangerous one: it binds a certificate to
 *      the attestation it vouches for, so an unsigned binding could be
 *      altered without breaking the signature.
 *
 * WHY NOTHING IN HERE CAUGHT IT: every existing test verified through
 * the same function that signed. Sign with f, verify with f, and f's
 * blind spots are invisible forever. These tests re-derive the bytes
 * from the SERVED response and check them with the raw library, which is
 * the only arrangement that can fail when the canonicalizer is wrong.
 */

const HEX = /^[0-9a-f]+$/;

function bytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Exactly what an outsider can do: no repo imports, only the response. */
async function verifyLikeAStranger(body: {
  signed_payload?: unknown;
  signature?: unknown;
  public_key?: unknown;
}): Promise<boolean> {
  const payload = String(body.signed_payload ?? "");
  const signature = String(body.signature ?? "");
  const publicKey = String(body.public_key ?? "");
  if (!payload || !HEX.test(signature) || !HEX.test(publicKey)) {
    return false;
  }
  return ed25519.verifyAsync(
    bytes(signature),
    new TextEncoder().encode(payload),
    bytes(publicKey),
  );
}

/** A real 402-then-pay round trip, the way every other spec buys. */
async function buy(path: string): Promise<Record<string, unknown>> {
  const url = `${BASE}${path}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status, `no 402 offered at ${path}`).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) {
    throw new Error(`No payment tier offered at ${path}`);
  }
  const response = await SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
  return (await response.json()) as Record<string, unknown>;
}

describe("a certificate verifies with nothing but the response", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("hands over the signed bytes, so no canonicalization is guessed", async () => {
    const purchase = await buy("/api/buy/hello");
    const certId = (purchase["certificate"] as Certificate).cert_id;
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${certId}`)
    ).json()) as Record<string, unknown>;

    expect(body["valid"]).toBe(true);
    expect(body["signed_payload"], "no signed_payload to check").toBeTruthy();
    expect(
      await verifyLikeAStranger(body),
      "the served bytes do not verify against the served key — a stranger cannot check this artifact",
    ).toBe(true);
  });

  it("covers every field it shows, including the two that were missed", async () => {
    // graffiti_on_a_train carries `tag`; before 2026-07-30 the signature
    // did not cover it, so this is the regression test for the defect
    // itself rather than for the documentation gap.
    const purchase = await buy("/api/buy/graffiti_on_a_train?tag=SIGNED%20NOW");
    const cert = purchase["certificate"] as Certificate;
    expect(cert.tag, "the tag never reached the certificate").toBeTruthy();

    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`)
    ).json()) as Record<string, unknown>;
    const payload = String(body["signed_payload"]);

    expect(await verifyLikeAStranger(body)).toBe(true);
    // The field is IN the bytes, not merely beside them.
    expect(payload).toContain("SIGNED NOW");
    // And a fresh certificate has no gap to declare.
    expect(Object.hasOwn(body, "signature_gap")).toBe(false);
  });

  it("covers the attests hash, the binding that must not be alterable", async () => {
    /**
     * The dangerous half of the defect, tested at the layer that was
     * broken rather than through a purchase — settlement_attestation
     * needs a live Base read to mint, and the point here is the
     * canonicalization, not the RPC.
     *
     * `attests` binds a certificate to the observation it vouches for.
     * Unsigned, it could be swapped for a different evidence hash and
     * the signature would still check out, which would make
     * /api/verify answer for an attestation nobody ever made.
     */
    const cert: Certificate = {
      cert_id: "cert_attestfixture",
      item: "settlement_attestation",
      patron_number: 4242,
      date: "2026-07-30T00:00:00.000Z",
      attests: "0xevidencehash",
    };
    const { signature, publicKey } = await signCertificate(
      cert,
      testEnv.SIGNING_KEY,
    );
    const payload = canonicalizeCertificate(cert);
    expect(payload).toContain("0xevidencehash");
    expect(
      await verifyLikeAStranger({
        signed_payload: payload,
        signature,
        public_key: publicKey,
      }),
    ).toBe(true);
    // And swapping the binding now breaks the signature, which is the
    // whole property that was missing.
    const tampered = canonicalizeCertificate({
      ...cert,
      attests: "0xsomeoneelses",
    });
    expect(
      await verifyLikeAStranger({
        signed_payload: tampered,
        signature,
        public_key: publicKey,
      }),
      "the attests field can still be altered without breaking the signature",
    ).toBe(false);
  });

  it("says how to check, on the endpoint that exists for checking", async () => {
    const purchase = await buy("/api/buy/hello");
    const certId = (purchase["certificate"] as Certificate).cert_id;
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${certId}`)
    ).json()) as Record<string, unknown>;
    const covers = String(body["signature_covers"]);
    expect(covers).toContain("ed25519_verify");
    expect(covers).toContain("signed_payload");
    // And it points at the key that isn't in this response, so a
    // stranger never has to take our word from our own answer.
    expect(covers).toContain("/.well-known/scvd-signing-key");
  });

  it("gives the buyer the same means at the moment of purchase", async () => {
    // The purchase response used to carry the certificate and the
    // signature and no public key at all.
    const purchase = await buy("/api/buy/hello");
    expect(await verifyLikeAStranger(purchase)).toBe(true);
  });
});

describe("certificates minted before the fix", () => {
  /**
   * The compatibility half. Certificates signed before 2026-07-30 cover
   * a field set without tag/attests. They are still ours, so they must
   * still verify — and the response must SAY which fields the signature
   * leaves out, because a holder who cannot see the gap would
   * reasonably assume there wasn't one.
   */
  const legacyCert: Certificate = {
    cert_id: "cert_legacyfixture",
    item: "graffiti_on_a_train",
    patron_number: 9001,
    date: "2026-07-29T12:00:00.000Z",
    tag: "PAINTED BEFORE THE FIX",
  };

  it("still verify, under the form they were actually signed with", async () => {
    // Sign the legacy way on purpose: the old canonical string.
    const { signature, publicKey } = await (async () => {
      const legacyString = canonicalizeCertificateLegacy(legacyCert);
      const stripped: Certificate = { ...legacyCert };
      delete stripped.tag;
      // Signing the stripped cert reproduces exactly the old bytes.
      expect(canonicalizeCertificate(stripped)).toBe(legacyString);
      return signCertificate(stripped, testEnv.SIGNING_KEY);
    })();

    expect(
      await certificateSignatureForm(legacyCert, signature, publicKey),
    ).toBe("legacy");
    // A current-form certificate is not mistaken for a legacy one.
    const fresh = await signCertificate(legacyCert, testEnv.SIGNING_KEY);
    expect(
      await certificateSignatureForm(
        legacyCert,
        fresh.signature,
        fresh.publicKey,
      ),
    ).toBe("current");
  });

  it("are still refused when the signature is simply wrong", async () => {
    const other = await signCertificate(
      { ...legacyCert, patron_number: 9002 },
      testEnv.SIGNING_KEY,
    );
    expect(
      await certificateSignatureForm(
        legacyCert,
        other.signature,
        other.publicKey,
      ),
    ).toBe("invalid");
  });
});
