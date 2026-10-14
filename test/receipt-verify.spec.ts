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

/**
 * THE DSSE ENVELOPE (2026-10-01): the shape an agent runtime's receipts
 * arrive in — payloadType, base64 payload, signatures[{keyid, sig}],
 * Ed25519 over the pre-authentication encoding. The PAE here is built
 * BY THE TEST from the DSSE specification, not imported from the
 * service, so the two agreeing is evidence and not a tautology. Every
 * tamper the house pattern asks for: edit the payload, swap the key,
 * withhold the key, and put the right signature second in the list.
 */
describe("a DSSE envelope at the desk", () => {
  const ed = () => import("@noble/ed25519");
  const encoder = new TextEncoder();

  const b64 = (bytes: Uint8Array): string => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const b64url = (bytes: Uint8Array): string =>
    b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hex = (bytes: Uint8Array): string =>
    [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  /** DSSEv1 SP LEN(type) SP type SP LEN(payload) SP payload — from the spec, by hand. */
  function pae(type: string, payload: Uint8Array): Uint8Array {
    const head = encoder.encode(`DSSEv1 ${encoder.encode(type).length} ${type} ${payload.length} `);
    const out = new Uint8Array(head.length + payload.length);
    out.set(head);
    out.set(payload, head.length);
    return out;
  }

  const TYPE = "application/vnd.example.action+json";
  const STATEMENT = {
    statement_type: "example/action/v1",
    actor: "agent://shopper",
    action: "tool.call",
    args_digest: "sha256:bbb323b0",
    timestamp: "2026-09-06T19:33:00Z",
    parent: "art_57b39c31",
  };

  async function envelope(options: { payload?: object } = {}) {
    const noble = await ed();
    const secret = noble.utils.randomSecretKey();
    const publicKey = await noble.getPublicKeyAsync(secret);
    const payloadBytes = encoder.encode(JSON.stringify(options.payload ?? STATEMENT));
    const sig = await noble.signAsync(pae(TYPE, payloadBytes), secret);
    return {
      publicKey,
      envelope: {
        payloadType: TYPE,
        payload: b64(payloadBytes),
        signatures: [{ keyid: "key_ae3b656c4c51566c", sig: b64(sig) }],
      },
    };
  }

  it("verifies a genuine envelope with the key supplied in hex beside it", async () => {
    const { publicKey, envelope: env1 } = await envelope();
    const { json } = await post(JSON.stringify({ ...env1, public_key: hex(publicKey) }));
    expect(json.payload.verdict).toBe("valid");
    const names = json.payload.checks.map((c: any) => `${c.name}:${c.outcome}`);
    expect(names).toContain("envelope:pass");
    expect(names).toContain("primary-signature:pass");
    expect(json.payload.issuer).toContain("unknown issuer");
    // The DSSE-specific limits are stated, not implied.
    const notChecked = json.payload.not_checked.join(" ");
    expect(notChecked).toContain("Actor binding");
    expect(notChecked).toContain("Chain and checkpoint");
    expect(notChecked).toContain("Truth of the payload");
  });

  it("takes the ed25519:<base64url> spelling as the query parameter, envelope untouched", async () => {
    const { publicKey, envelope: env1 } = await envelope();
    const response = await SELF.fetch(
      `${BASE}/api/verify-receipt?public_key=${encodeURIComponent(`ed25519:${b64url(publicKey)}`)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(env1) },
    );
    const json: any = await response.json();
    expect(json.payload.verdict).toBe("valid");
    expect(json.payload.checks.find((c: any) => c.name === "primary-signature").detail).toContain(
      "keyid key_ae3b656c4c51566c",
    );
  });

  it("calls a withheld key insufficient_evidence and says how to supply it", async () => {
    const { envelope: env1 } = await envelope();
    const { json } = await post(JSON.stringify(env1));
    expect(json.payload.verdict).toBe("insufficient_evidence");
    const check = json.payload.checks.find((c: any) => c.name === "key-unavailable");
    expect(check.outcome).toBe("fail");
    expect(check.detail).toContain("?public_key=");
    expect(check.detail).toContain("not a failed signature");
  });

  it("calls an edited payload invalid — one byte of the statement changed after signing", async () => {
    const { publicKey, envelope: env1 } = await envelope();
    const edited = encoder.encode(JSON.stringify({ ...STATEMENT, action: "tool.call.result" }));
    const { json } = await post(
      JSON.stringify({ ...env1, payload: b64(edited), public_key: hex(publicKey) }),
    );
    expect(json.payload.verdict).toBe("invalid");
    expect(json.payload.checks.find((c: any) => c.name === "primary-signature").outcome).toBe("fail");
  });

  it("calls an edited payloadType invalid — the type is inside the PAE", async () => {
    const { publicKey, envelope: env1 } = await envelope();
    const { json } = await post(
      JSON.stringify({ ...env1, payloadType: "application/vnd.other+json", public_key: hex(publicKey) }),
    );
    expect(json.payload.verdict).toBe("invalid");
  });

  it("calls the wrong key invalid, not insufficient — a readable key that did not sign", async () => {
    const { envelope: env1 } = await envelope();
    const other = await envelope();
    const { json } = await post(JSON.stringify({ ...env1, public_key: hex(other.publicKey) }));
    expect(json.payload.verdict).toBe("invalid");
  });

  it("finds the verifying signature when it is second in the list, and names its index", async () => {
    const { publicKey, envelope: env1 } = await envelope();
    const stranger = await envelope();
    const { json } = await post(
      JSON.stringify({
        ...env1,
        signatures: [stranger.envelope.signatures[0], env1.signatures[0]],
        public_key: hex(publicKey),
      }),
    );
    expect(json.payload.verdict).toBe("valid");
    expect(json.payload.checks.find((c: any) => c.name === "primary-signature").detail).toContain(
      "signatures[1]",
    );
  });

  it("calls an unreadable supplied key insufficient_evidence, and an empty signature list unsupported", async () => {
    const { envelope: env1 } = await envelope();
    const badKey = await post(JSON.stringify({ ...env1, public_key: "-----BEGIN PUBLIC KEY-----" }));
    expect(badKey.json.payload.verdict).toBe("insufficient_evidence");
    const none = await post(JSON.stringify({ ...env1, signatures: [] }));
    expect(none.json.payload.verdict).toBe("unsupported");
  });

  it("honours an expiry inside the payload by the issuer's own terms", async () => {
    const { publicKey, envelope: env1 } = await envelope({
      payload: { ...STATEMENT, expires_at: "2020-01-01T00:00:00Z" },
    });
    const { json } = await post(JSON.stringify({ ...env1, public_key: hex(publicKey) }));
    expect(json.payload.verdict).toBe("expired");
  });

  it("does not read the sibling public_key as a hex-shape receipt", async () => {
    // A hex-shape document with the same two fields still takes the
    // original path; the DSSE branch is keyed on the envelope's own
    // three fields, never on the presence of a key.
    const payload = { amount_usdc: 1 };
    const { signature, publicKey } = await signMessage(JSON.stringify(payload), testEnv.SIGNING_KEY);
    const { json } = await post(JSON.stringify({ payload, signature, public_key: publicKey }));
    expect(json.payload.verdict).toBe("valid");
    expect(json.payload.checks.map((c: any) => c.name)).not.toContain("envelope");
  });
});
