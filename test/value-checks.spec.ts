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
