import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_USDC,
  isCanonicalUsdc,
  l3bChecks,
} from "@/lib/value-checks";
import { readPayTo } from "@/lib/pay-to";
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
  it("knows every chain the store reads USDC on, by CAIP-2 name: the three it settles on and the four it only reads", () => {
    expect(Object.keys(CANONICAL_USDC).sort()).toEqual([
      "eip155:1",
      "eip155:10",
      "eip155:137",
      "eip155:42161",
      "eip155:43114",
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

/**
 * THE RAILS THIS DESK CALLED BROKEN (2026-09-04, /corrections).
 *
 * Two checks read every chain as Ethereum or Solana. An XRPL classic
 * address is base58 inside the Solana window, so a correct payTo came
 * back as "a base58 Solana address"; Stellar and Algorand are base32
 * and matched nothing; and XRPL issued currencies, denominated in
 * decimals by the ledger, were told they underpriced by a factor of a
 * million. 63 of 1,089 hosts in one weekly round carried a published
 * not_ready because of it.
 *
 * These are those doors, by the addresses they actually publish.
 */
describe("a rail this desk cannot read is never a defect in the door", () => {
  const CLOUDPAYX = "rsnHPZjBSastxz1BE38WqKBR3sgpATvreL";
  const AGENT402 = "GDNJXCKW7ZM7GEEVP674TWPU26YJNBQ2FI4ZIPRKTPTNUEJMDHFJWWRL";
  const ASLAN_ALGO = "62A253YPATFNJCPRKID3FKD77MYJFNTVRYRP4B4JWG36EGLPY7UXFWGI7I";
  const EVM = "0x1234567890abcdef1234567890ABCDEF12345678";
  const failed = (accepts: Record<string, unknown>[]) =>
    l3bChecks(accepts, readPayTo).filter((c) => !c.ok).map((c) => c.name);

  it("reads an XRPL classic address as payable, where it used to say Solana", () => {
    expect(readPayTo(CLOUDPAYX, "xrpl:0")).toMatchObject({ kind: "address", payable: true });
    expect(failed([{ network: "xrpl:0", amount: "7132", asset: "XRP", payTo: CLOUDPAYX }])).toEqual([]);
  });

  it("reads Stellar and Algorand addresses, where it used to recognise neither", () => {
    expect(readPayTo(AGENT402, "stellar:pubnet")).toMatchObject({ kind: "address", payable: true });
    expect(readPayTo(ASLAN_ALGO, "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k")).toMatchObject({
      kind: "address",
      payable: true,
    });
  });

  it("does not judge a chain it has never heard of, and says so rather than failing", () => {
    const verdict = readPayTo("whatever-this-is", "someledger:1");
    expect(verdict.kind).toBe("unknown-network");
    expect(verdict.payable).toBeNull();
    const checks = l3bChecks(
      [{ network: "someledger:1", amount: "12", asset: "X", payTo: "whatever-this-is" }],
      readPayTo,
    );
    const payto = checks.find((c) => c.name === "payto-payable")!;
    expect(payto.ok).toBe(true);
    expect(payto.detail).toContain("Not judged");
  });

  it("leaves an XRPL issued currency's decimal amount alone; drops are still judged", () => {
    // RLUSD and friends are decimal by the ledger's own rules.
    expect(
      failed([{ network: "xrpl:0", amount: "0.01", asset: "524C555344000000000000000000000000000000", payTo: CLOUDPAYX }]),
    ).toEqual([]);
    // XRP itself is drops, an integer, and a decimal there is still wrong.
    expect(failed([{ network: "xrpl:0", amount: "0.01", asset: "XRP", payTo: CLOUDPAYX }])).toContain("amount-atomic");
  });

  it("the whole mixed door the round misjudged now passes, entry for entry", () => {
    expect(
      failed([
        { network: "eip155:8453", amount: "10000", asset: "USDC", payTo: EVM },
        { network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k", amount: "10000", asset: "USDC", payTo: ASLAN_ALGO },
        { network: "xrpl:0", amount: "0.01", asset: "524C555344000000000000000000000000000000", payTo: CLOUDPAYX },
      ]),
    ).toEqual([]);
  });

  it("still fails a door that is genuinely broken on a rail it does read", () => {
    expect(failed([{ network: "eip155:8453", amount: "0.01", asset: "USDC", payTo: EVM }])).toContain("amount-atomic");
    expect(
      failed([{ network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount: "5000", asset: "USDC", payTo: EVM }]),
    ).toContain("payto-payable");
    expect(failed([{ network: "eip155:137", amount: "5000", asset: "USDC", payTo: "0xdeadbeef" }])).toContain("payto-payable");
  });

  it("does not call a non-EVM transfer method unbuildable", () => {
    const evm = failed([{ network: "eip155:8453", amount: "1", asset: "USDC", payTo: EVM, extra: { assetTransferMethod: "made-up" } }]);
    expect(evm).toContain("transfer-method-signable");
    const xrpl = failed([{ network: "xrpl:0", amount: "7132", asset: "XRP", payTo: CLOUDPAYX, extra: { assetTransferMethod: "xrpl-payment" } }]);
    expect(xrpl).toEqual([]);
  });
});
