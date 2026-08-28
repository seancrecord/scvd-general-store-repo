import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE DESK'S EGRESS CONTRACT, HELD BY COUNTING (the instrument
 * audit, 2026-08-28).
 *
 * The desk's docs make three promises about outbound requests:
 * resolve_key:false means NO did:web resolution; the budget bounds
 * every resolution; a supplied key means the check is offline. The
 * verifier library, left to itself, breaks all three — with no
 * `fetch` option it falls back to bare globalThis.fetch whenever no
 * key was established and the kid is did:web, which is exactly the
 * declined path, the budget-exhausted path, and the failed path. So
 * these tests do the one thing a promise about NOT fetching can be
 * held by: stub the global, count the calls, and assert the count
 * per key_resolution state.
 *
 * The second contract held here is the verdict's voice: a signature
 * left unchecked for OUR reasons (declined, budget, a failed read of
 * the issuer's DID host) is could_not_check, never does_not_conform
 * — our blindness must not be booked as the subject's defect. The
 * one resolution failure that IS about the document — the kid absent
 * from a document we fetched and parsed fine — stays
 * does_not_conform, and a schema failure decided offline stays
 * does_not_conform whatever the key state.
 */
async function post(
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await SELF.fetch(`${BASE}/api/conformance/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encode = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A foreign offer whose kid names a host that is not ours. */
async function strangerOffer(
  overrides: Record<string, unknown> = {},
): Promise<{ jws: string; rawPublic: Uint8Array }> {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );
  const header = { alg: "EdDSA", kid: "did:web:stranger.example#key-1" };
  const payload = {
    version: 1,
    resourceUrl: "https://stranger.example/api/buy/thing",
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "1000",
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return { jws: `${signingInput}.${b64url(signature)}`, rawPublic };
}

/** Stub the global fetch, recording every URL asked for. */
function countingFetch(
  respond: (url: string) => Response | Promise<Response>,
): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    return respond(url);
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the desk's egress matches its promises, counted", () => {
  it("resolve_key:false makes ZERO outbound requests and refuses rather than judging", async () => {
    const calls = countingFetch(() => {
      throw new Error("no request may exist on this path");
    });
    const { jws } = await strangerOffer();
    const { status, json } = await post({ artifact: jws, resolve_key: false });
    expect(status).toBe(200);
    expect(calls).toHaveLength(0);
    expect(json.key_resolution).toBe("not_attempted");
    // Our refusal to look is not their nonconformance.
    expect(json.verdict).toBe("could_not_check");
    const keyCheck = json.checks.find(
      (check: any) => check.name === "key-resolution",
    );
    expect(keyCheck.detail).toContain("resolve_key: false");
  });

  it("a DID host unreachable from our vantage is OUR gap: one guarded attempt, could_not_check", async () => {
    const calls = countingFetch(() => {
      throw new Error("connection refused");
    });
    const { jws } = await strangerOffer();
    const { json } = await post({ artifact: jws });
    // Exactly the desk's one guarded attempt — the verifier's raw
    // fallback used to make this two.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("stranger.example");
    expect(json.verdict).toBe("could_not_check");
    const keyCheck = json.checks.find(
      (check: any) => check.name === "key-resolution",
    );
    expect(keyCheck.detail).toContain("attempted and failed");
    expect(keyCheck.detail).toContain("not about the artifact");
  });

  it("a kid absent from a document we DID read is the document's fact: does_not_conform", async () => {
    const calls = countingFetch(
      () =>
        new Response(
          JSON.stringify({
            verificationMethod: [
              {
                id: "did:web:stranger.example#some-other-key",
                publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: b64url(new Uint8Array(32)) },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const { jws } = await strangerOffer();
    const { json } = await post({ artifact: jws });
    expect(calls).toHaveLength(1);
    expect(json.verdict).toBe("does_not_conform");
    const keyCheck = json.checks.find(
      (check: any) => check.name === "key-resolution",
    );
    expect(keyCheck.detail).toContain("not attributable");
  });

  it("a schema failure decided offline does not hide behind our refusal to resolve", async () => {
    const calls = countingFetch(() => {
      throw new Error("no request may exist on this path");
    });
    const { jws } = await strangerOffer({ amount: undefined });
    const { json } = await post({ artifact: jws, resolve_key: false });
    expect(calls).toHaveLength(0);
    // The signature is unchecked for our reasons, but the missing
    // field was decided from the bytes alone: that is a verdict.
    expect(json.verdict).toBe("does_not_conform");
  });

  it("a kid that resolves cleanly still resolves: one fetch, conforms, signature checked", async () => {
    const { jws, rawPublic } = await strangerOffer();
    const calls = countingFetch(
      () =>
        new Response(
          JSON.stringify({
            verificationMethod: [
              {
                id: "did:web:stranger.example#key-1",
                publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: b64url(rawPublic) },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const { json } = await post({ artifact: jws });
    expect(calls).toHaveLength(1);
    expect(json.key_resolution).toBe("did:web");
    expect(
      json.verdict,
      `resolution succeeded but the verdict was not conforms: ${JSON.stringify(json.checks)}`,
    ).toBe("conforms");
  });
});
