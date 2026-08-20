import { describe, expect, it } from "vitest";
import { runChecks } from "@/services/preflight";

/**
 * TWO CHECKS THE FIELD RUN PAID FOR.
 *
 * The August 2026 walk of 1,589 domains produced two failure shapes
 * the free battery could not have warned anybody about, and both are
 * visible in a single unpaid probe:
 *
 *   21 endpoints published an ENS name as payTo. A buyer without a
 *   mainnet resolver cannot pay them at all — the client throws inside
 *   its signing library and the seller never learns a buyer came.
 *
 *   176 endpoints took a payment attempt and only then refused, for
 *   parameters the challenge never declared. That one fails AFTER the
 *   buyer signs, and the buyer's ledger records it as the SELLER
 *   failing — the exact misreading that withdrew this store's own
 *   report about that very run.
 */

function challenge(
  accepts: Record<string, unknown>[],
  extensions: Record<string, unknown> = {},
): Response {
  return new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(
        JSON.stringify({ x402Version: 2, accepts, extensions }),
      ),
    },
  });
}

const BASE_ACCEPT = {
  scheme: "exact",
  network: "eip155:8453",
  amount: "5000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0xDD350976B8cfFc65938C0464d39A2C78BE079bd0",
  maxTimeoutSeconds: 300,
};

function advisoryNames(response: Response): string[] {
  return runChecks(response, false).advisories.map((entry) => entry.name);
}

describe("the ENS payTo warning", () => {
  it("names an ENS payTo as unpayable for a resolver-less buyer", () => {
    const { advisories } = runChecks(
      challenge([{ ...BASE_ACCEPT, payTo: "payments.example.eth" }]),
      false,
    );
    const found = advisories.find((a) => a.name === "payto-is-ens-name");
    expect(found, "an ENS payTo passed without comment").toBeTruthy();
    expect(found!.detail).toContain("cannot pay this endpoint");
    expect(found!.detail).toContain("payments.example.eth");
  });

  it("flags any payTo that is neither an address nor base58", () => {
    expect(
      advisoryNames(challenge([{ ...BASE_ACCEPT, payTo: "send-me-money" }])),
    ).toContain("payto-not-an-address");
  });

  it("says nothing about a proper address on either rail", () => {
    expect(advisoryNames(challenge([BASE_ACCEPT]))).not.toContain(
      "payto-is-ens-name",
    );
    const solana = advisoryNames(
      challenge([
        {
          ...BASE_ACCEPT,
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          payTo: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE",
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      ]),
    );
    expect(solana).not.toContain("payto-is-ens-name");
    expect(solana).not.toContain("payto-not-an-address");
  });
});

describe("the input contract", () => {
  it("warns when a challenge declares no inputs at all", () => {
    const { advisories } = runChecks(challenge([BASE_ACCEPT]), false);
    const found = advisories.find((a) => a.name === "no-input-contract");
    expect(found, "a challenge with no input contract passed silently").toBeTruthy();
    // The seller's stake, stated in the seller's terms: their buyers
    // are recording this as the endpoint failing.
    expect(found!.detail).toContain("before paying");
    expect(found!.detail).toContain("your endpoint failing");
  });

  it("credits a challenge that declares what a buyer must send", () => {
    const { advisories } = runChecks(
      challenge([BASE_ACCEPT], {
        bazaar: {
          info: {
            input: {
              type: "http",
              method: "GET",
              queryParams: { url: "https://your-shop.example/api/buy/thing" },
            },
          },
        },
      }),
      false,
    );
    const names = advisories.map((a) => a.name);
    expect(names).toContain("inputs-declared");
    expect(names).not.toContain("no-input-contract");
    expect(
      advisories.find((a) => a.name === "inputs-declared")!.detail,
    ).toContain("url");
  });

  it("stays quiet when an input block exists but names no fields", () => {
    // Declared and empty is a claim about the resource, not a gap.
    const names = advisoryNames(
      challenge([BASE_ACCEPT], {
        bazaar: { info: { input: { type: "http", method: "GET" } } },
      }),
    );
    expect(names).not.toContain("no-input-contract");
    expect(names).not.toContain("inputs-declared");
  });
});
