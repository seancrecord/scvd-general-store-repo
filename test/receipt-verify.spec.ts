import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

async function post(body: string): Promise<{ status: number; json: any }> {
  const response = await SELF.fetch(`${BASE}/api/verify-receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { status: response.status, json: await response.json() };
}

/**
 * THE RECEIPT DESK's laws: the verdict taxonomy keeps "unknown" and
 * "bad" apart, everything unchecked is stated, the verdict itself is
 * a dual-signed scvd artifact, and nothing submitted is stored.
 */
describe("the verdict taxonomy", () => {
  it("calls garbage unsupported, not invalid", async () => {
    const { status, json } = await post('"just a string"');
    expect(status).toBe(200);
    expect(json.payload.verdict).toBe("unsupported");
    // Not-JSON too.
    const notJson = await post("PAID IN FULL, TRUST ME");
    expect(notJson.json.payload.verdict).toBe("unsupported");
  });

  it("calls unreadable key material insufficient_evidence, not forgery", async () => {
    const { json } = await post(
      JSON.stringify({
        amount: "5.00",
        signature: "MEUCIQDx...base64-der-ecdsa",
        public_key: "-----BEGIN PUBLIC KEY-----",
      }),
    );
    expect(json.payload.verdict).toBe("insufficient_evidence");
    const detail = json.payload.checks.map((c: any) => c.detail).join(" ");
    expect(detail).toContain("not proof of forgery");
  });

  it("verifies a genuine scvd-shaped receipt as valid and attributes our key", async () => {
    const payload = { artifact: "demo", amount_usdc: 1, item: "hello" };
    const signedPayload = JSON.stringify(payload);
    const { signature, publicKey } = await signMessage(
      signedPayload,
      testEnv.SIGNING_KEY,
    );
    const { json } = await post(
      JSON.stringify({
        payload,
        signed_payload: signedPayload,
        signature,
        public_key: publicKey,
      }),
    );
    expect(json.payload.verdict).toBe("valid");
    expect(json.payload.issuer).toContain("scvd.store");
  });

  it("calls a tampered document invalid, and names every form it tried", async () => {
    const payload = { amount_usdc: 1 };
    const { signature, publicKey } = await signMessage(
      JSON.stringify(payload),
      testEnv.SIGNING_KEY,
    );
    const { json } = await post(
      JSON.stringify({
        payload: { amount_usdc: 999 }, // altered after signing
        signature,
        public_key: publicKey,
      }),
    );
    expect(json.payload.verdict).toBe("invalid");
    const failed = json.payload.checks.find(
      (c: any) => c.name === "primary-signature",
    );
    expect(failed.outcome).toBe("fail");
    // The detail names every form it tried, so a caller knows the
    // failure was tested, not assumed.
    expect(failed.detail).toContain("JSON.stringify(payload) in served order");
    expect(failed.detail).toContain("altered after signing");
  });

  it("honors the document's own expiry over a valid signature", async () => {
    const payload = { item: "watch", expires: "2026-01-01T00:00:00Z" };
    const signedPayload = JSON.stringify(payload);
    const { signature, publicKey } = await signMessage(
      signedPayload,
      testEnv.SIGNING_KEY,
    );
    const { json } = await post(
      JSON.stringify({ payload, signed_payload: signedPayload, signature, public_key: publicKey }),
    );
    expect(json.payload.verdict).toBe("expired");
  });

  it("keeps unknown issuers unknown: a foreign key that verifies is valid but unattributed", async () => {
    // A second keypair the store has never seen: sign with a fresh
    // random seed via the same signMessage machinery.
    const foreignSeed = "9".repeat(64);
    const payload = { note: "someone else's receipt" };
    const signedPayload = JSON.stringify(payload);
    const { signature, publicKey } = await signMessage(signedPayload, foreignSeed);
    const { json } = await post(
      JSON.stringify({ payload, signed_payload: signedPayload, signature, public_key: publicKey }),
    );
    expect(json.payload.verdict).toBe("valid");
    expect(json.payload.issuer).toContain("unknown issuer");
    expect(json.payload.not_checked.join(" ")).toContain("Issuer identity");
  });
});

describe("the verdict is itself an scvd artifact", () => {
  it("dual-signs every verdict and binds it to the input by digest", async () => {
    const body = JSON.stringify({ anything: true });
    const { json } = await post(body);
    expect(json.payload.artifact).toBe("receipt_verification");
    expect(json.payload.receipt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(json.payload.stateless).toContain("forgotten");
    expect(json.signed_payload).toBe(JSON.stringify(json.payload));
    expect(
      await verifyMessageSignature(
        json.signed_payload,
        json.signature,
        json.public_key,
      ),
    ).toBe(true);
    expect(
      await verifyMessageSignature(
        jcsCanonicalize(json.payload),
        json.signature_jcs,
        json.public_key,
      ),
    ).toBe(true);
  });

  it("always states what was not checked, settlement first", async () => {
    const { json } = await post(JSON.stringify({ anything: true }));
    expect(json.payload.not_checked.join(" ")).toContain("settlement_attestation");
    expect(json.payload.not_checked.join(" ")).toContain("Delivery");
  });

  it("refuses the oversized and the empty with instructions, not silence", async () => {
    const big = await post("x".repeat(40_000));
    expect(big.status).toBe(413);
    const empty = await post("");
    expect(empty.status).toBe(400);
  });
});
