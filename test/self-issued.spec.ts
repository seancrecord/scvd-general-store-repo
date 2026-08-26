import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

/**
 * ROADMAP 2.4 — WHO SIGNED THIS, AND WERE THEY THE SHOP? (ledger F2/I6)
 *
 * The signature check proves the kid's key signed the bytes. Nothing
 * bound that DID to the resourceUrl it names, so an offer signed by
 * a stranger for someone else's shop read exactly like one the shop
 * signed itself — same "conforms", same silence.
 *
 * THE HONEST CHECK IS THE POSITIVE ONE, and the reasoning matters
 * because the obvious version is wrong. "did:web host ≠ resourceUrl
 * host" is NOT proof of fraud: delegation is a real arrangement — a
 * facilitator or processor signing on a merchant's behalf — and the
 * offer-receipt spec defines no delegation record for us to read. A
 * desk that called that "unauthorized" would be answering a question
 * it cannot see (rule 52), about a party it cannot ask.
 *
 * So the check states what IS verifiable: when the signer's DID host
 * equals the resource's host, the offer is SELF-ISSUED and the
 * signature binds the party that serves the resource. When it does
 * not, that is recorded as third-party issuance with the consequence
 * explicitly NOT drawn. Advisory in v1 either way — the desk's
 * published contract is structure, signature and time, and a check
 * that moved verdicts would rewrite what every past "conforms" meant.
 */

async function offerFrom(kid: string, resourceUrl: string) {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKeyHex = [
    ...new Uint8Array(
      (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const encode = (value: unknown): string =>
    b64url(new TextEncoder().encode(JSON.stringify(value)));
  const header = { alg: "EdDSA", kid };
  const payload = {
    version: 1,
    resourceUrl,
    scheme: "exact",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "1000",
    validUntil: Math.floor(Date.now() / 1000) + 3600,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  const response = await SELF.fetch("https://scvd.store/api/conformance/v1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      artifact: `${signingInput}.${b64url(signature)}`,
      public_key_hex: publicKeyHex,
    }),
  });
  return (await response.json()) as {
    verdict: string;
    checks: { name: string; ok: boolean; advisory?: boolean; detail: string }[];
  };
}

describe("the desk says whether the shop signed its own offer", () => {
  it("same host: self-issued, and says what that proves", async () => {
    const json = await offerFrom(
      "did:web:shop.example#key-1",
      "https://shop.example/api/buy/thing",
    );
    expect(json.verdict).toBe("conforms");
    const check = json.checks.find((c) => c.name === "offer-self-issued");
    expect(check?.ok).toBe(true);
    expect(check?.advisory).toBe(true);
    expect(check!.detail).toContain("shop.example");
  }, 30_000);

  it("different host: recorded as third-party, with the consequence NOT drawn", async () => {
    const json = await offerFrom(
      "did:web:stranger.example#key-1",
      "https://shop.example/api/buy/thing",
    );
    // Still conforms: the desk's verdict is structure, signature, time.
    expect(json.verdict).toBe("conforms");
    const check = json.checks.find((c) => c.name === "offer-self-issued");
    expect(check?.ok).toBe(false);
    expect(check?.advisory).toBe(true);
    expect(check!.detail).toContain("stranger.example");
    expect(check!.detail).toContain("shop.example");
    // The refusal to guess is the point, and it is stated in the text.
    expect(check!.detail.toLowerCase()).toContain("delegation");
    expect(check!.detail).toMatch(/not (say|prove|establish)/i);
  }, 30_000);

  it("a subdomain is not the same host, and is not silently treated as one", async () => {
    const json = await offerFrom(
      "did:web:offers.shop.example#key-1",
      "https://shop.example/api/buy/thing",
    );
    const check = json.checks.find((c) => c.name === "offer-self-issued");
    expect(check?.ok).toBe(false);
    expect(check!.detail).toContain("offers.shop.example");
  }, 30_000);

  it("no kid, no claim: the check is absent rather than guessed", async () => {
    const json = await offerFrom("", "https://shop.example/api/buy/thing");
    const check = json.checks.find((c) => c.name === "offer-self-issued");
    expect(check).toBeUndefined();
  }, 30_000);
});

describe("the launch check records offer issuance either way (I6)", () => {
  const doorWith = (extensions?: Record<string, unknown>) =>
    (async () =>
      new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "5000",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  payTo: "0x2222222222222222222222222222222222222222",
                  maxTimeoutSeconds: 300,
                },
              ],
              ...(extensions ? { extensions } : {}),
            }),
          ),
        },
      })) as unknown as typeof fetch;

  const offerJws = (kid: string) => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${b64({ alg: "EdDSA", kid })}.${b64({ version: 1 })}.c2ln`;
  };

  async function walk(extensions: Record<string, unknown> | undefined) {
    const { performLaunchCheck } = await import("@/services/launch-check");
    const { env } = await import("cloudflare:test");
    return performLaunchCheck(
      { ...(env as unknown as Record<string, unknown>), FIELD_WALLET_KEY: "" } as never,
      "https://door.example/api/buy/thing",
      { fetch: doorWith(extensions) },
    );
  }

  it("a door carrying no signed offers says so, rather than staying silent", async () => {
    const result = await walk(undefined);
    const stage = result.stages.find((s) => s.stage === "offers");
    expect(stage, "absence must be recorded, not omitted").toBeDefined();
    expect(stage!.detail.toLowerCase()).toContain("no signed offers");
  }, 30_000);

  it("a self-issued offer is recorded as such", async () => {
    const result = await walk({
      "offer-receipt": {
        info: { offers: [{ signature: offerJws("did:web:door.example#key-1") }] },
      },
    });
    const stage = result.stages.find((s) => s.stage === "offers");
    expect(stage?.ok).toBe(true);
    expect(stage!.detail).toContain("door.example");
    expect(stage!.detail.toLowerCase()).toContain("self-issued");
  }, 30_000);

  it("a third-party offer is recorded without the consequence drawn", async () => {
    const result = await walk({
      "offer-receipt": {
        info: { offers: [{ signature: offerJws("did:web:stranger.example#key-1") }] },
      },
    });
    const stage = result.stages.find((s) => s.stage === "offers");
    expect(stage?.ok).toBe(false);
    expect(stage!.detail).toContain("stranger.example");
    expect(stage!.detail.toLowerCase()).toContain("delegation");
  }, 30_000);
});
