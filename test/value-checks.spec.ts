import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_USDC,
  isCanonicalUsdc,
} from "@/lib/value-checks";
import type { Env } from "@/types";

/**
 * ROADMAP 2.2 — ONE SHARED VALUE-CHECKS MODULE (ledger B13/F1/I1).
 *
 * The battery, the desk, the verdict fold and the launch check each
 * carried their own fragments of "is this offer's VALUE sane": payTo
 * in lib/pay-to, testnets in preflight, USDC contracts scattered in
 * base-rpc/solana-rpc, and — the defect this spec pins — a launch
 * check that divides ANY asset's atomic amount by 1e6 and signs the
 * result into an artifact labeled "USDC". A hostile 402 naming an
 * arbitrary ERC-20 was priced, labeled and walked as if it were
 * USDC. Built once here, consumed everywhere; a signed artifact says
 * "USDC" only about the canonical contract for that network.
 */

describe("the canonical USDC registry", () => {
  it("knows the three rails the store settles on, by CAIP-2 name", () => {
    expect(Object.keys(CANONICAL_USDC).sort()).toEqual([
      "eip155:137",
      "eip155:8453",
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    ]);
  });

  it("EVM comparison is case-insensitive; Solana is exact", () => {
    expect(
      isCanonicalUsdc("eip155:8453", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    ).toBe(true);
    expect(
      isCanonicalUsdc("eip155:8453", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
    ).toBe(true);
    expect(
      isCanonicalUsdc("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    ).toBe(true);
    expect(isCanonicalUsdc("eip155:8453", "0x1111111111111111111111111111111111111111")).toBe(false);
    // An unknown network can never claim canonical USDC — rule 52:
    // a lookup that cannot see everything must not answer "yes" either.
    expect(isCanonicalUsdc("eip155:99999", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")).toBe(false);
  });
});

describe("the launch check refuses to call a stranger's token USDC", () => {
  const hostileDoor = (asset: string) =>
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
                  asset,
                  payTo: "0x2222222222222222222222222222222222222222",
                  maxTimeoutSeconds: 300,
                },
              ],
            }),
          ),
        },
      })) as unknown as typeof fetch;

  it("a hostile 402 naming an arbitrary ERC-20 is refused at terms, with the asset named", async () => {
    const { performLaunchCheck } = await import("@/services/launch-check");
    const walk = await performLaunchCheck(
      { ...(env as unknown as Env), FIELD_WALLET_KEY: "" } as Env,
      "https://hostile.example/api/buy/thing",
      { fetch: hostileDoor("0x1111111111111111111111111111111111111111") },
    );
    const terms = walk.stages.find((s) => s.stage === "terms");
    expect(terms?.ok).toBe(false);
    expect(terms?.detail).toContain("0x1111111111111111111111111111111111111111");
    expect(terms?.detail.toLowerCase()).toContain("not canonical usdc");
    expect(walk.verdict).toBe("unpaid_by_rule");
    // The artifact never labels the stranger's token USDC as a price.
    for (const stage of walk.stages) {
      expect(stage.detail).not.toMatch(/\$\d[\d.]* USDC/);
    }
  }, 30_000);

  it("the canonical contract still walks, labeled USDC honestly", async () => {
    const { performLaunchCheck } = await import("@/services/launch-check");
    const walk = await performLaunchCheck(
      { ...(env as unknown as Env), FIELD_WALLET_KEY: "" } as Env,
      "https://honest.example/api/buy/thing",
      { fetch: hostileDoor("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") },
    );
    const terms = walk.stages.find((s) => s.stage === "terms" && s.ok);
    expect(terms?.detail).toContain("USDC");
  }, 30_000);
});

describe("the desk notes a non-canonical asset without moving its verdict", () => {
  /*
   * The desk's published contract is structure, signature and time —
   * value judgments never fold into its verdict, and this spec pins
   * that both ways: the advisory appears, and "conforms" stands. The
   * fixture's asset is Ethereum-mainnet USDC on a Base-network offer —
   * a real confusion, and until 2.2 the desk passed it in silence.
   */
  async function foreignOffer(asset: string) {
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
    const header = { alg: "EdDSA", kid: "did:web:example.test#key-1" };
    const payload = {
      version: 1,
      resourceUrl: "https://example.test/api/buy/thing",
      scheme: "exact",
      network: "eip155:8453",
      asset,
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
    return { jws: `${signingInput}.${b64url(signature)}`, publicKeyHex };
  }

  async function deskCheck(asset: string) {
    const { SELF } = await import("cloudflare:test");
    const { jws, publicKeyHex } = await foreignOffer(asset);
    const response = await SELF.fetch("https://scvd.store/api/conformance/v1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artifact: jws, public_key_hex: publicKeyHex }),
    });
    return (await response.json()) as {
      verdict: string;
      checks: { name: string; ok: boolean; advisory?: boolean; detail: string }[];
    };
  }

  it("Ethereum USDC on a Base offer draws the advisory; conforms stands", async () => {
    const json = await deskCheck("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(json.verdict).toBe("conforms");
    const note = json.checks.find((c) => c.name === "asset-canonical-usdc");
    expect(note).toBeDefined();
    expect(note!.ok).toBe(false);
    expect(note!.advisory).toBe(true);
    expect(note!.detail).toContain("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(note!.detail.toLowerCase()).toContain("not the canonical");
  }, 30_000);

  it("the canonical contract draws the same check, passing", async () => {
    const json = await deskCheck("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(json.verdict).toBe("conforms");
    const note = json.checks.find((c) => c.name === "asset-canonical-usdc");
    expect(note?.ok).toBe(true);
    expect(note?.advisory).toBe(true);
  }, 30_000);
});
