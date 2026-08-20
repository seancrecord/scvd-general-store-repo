import { describe, expect, it } from "vitest";
import { runChecks } from "@/services/preflight";

/**
 * TWO CHECKS THE FIELD RUN PAID FOR, both visible in a single unpaid
 * probe.
 *
 * WHAT IS IN payTo. 21 endpoints in the August 2026 walk published a
 * name rather than an address, and a payment signs over bytes. The
 * FIRST version of this check matched ".eth" and told every holder
 * their buyers needed a mainnet resolver — which is wrong for a
 * Basename, whose registry is on Base, the rail this store is first
 * on. Confidently wrong remediation is worse than silence, so the
 * reading now comes from a named taxonomy (lib/pay-to.ts) that
 * compares the registry's chain against the offer's own, and these
 * tests hold each branch apart. They also cover the case no resolver
 * saves: a payTo of the wrong SHAPE for its own network, which the
 * first version waved straight through.
 *
 * THE INPUT CONTRACT. 176 endpoints took a payment attempt and only
 * then refused, for parameters the challenge never declared. That
 * fails AFTER the buyer signs, and the buyer's ledger records it as
 * the SELLER failing — the exact misreading that withdrew this
 * store's own report about that very run.
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

describe("what is in payTo, across every naming scenario", () => {
  const on = (payTo: string, network = "eip155:8453") =>
    runChecks(challenge([{ ...BASE_ACCEPT, network, payTo }]), false).advisories;
  const detailOf = (payTo: string, network = "eip155:8453") =>
    on(payTo, network).find((a) => a.name.startsWith("payto-"))?.detail ?? "";

  it("tells an ENS holder their buyers need a mainnet resolver", () => {
    const detail = detailOf("payments.example.eth");
    expect(detail).toContain("ENS");
    expect(detail).toContain("Ethereum mainnet");
    expect(detail).toContain("DIFFERENT chain");
  });

  it("does NOT tell a Basename holder the same thing — it resolves on Base", () => {
    /**
     * The bug this whole taxonomy exists for. ".base.eth" ends in
     * ".eth" and the first pass called it ENS, prescribing a mainnet
     * resolver on the rail this store is first on.
     */
    const detail = detailOf("shop.base.eth");
    expect(detail).toContain("Basename");
    expect(detail).toContain("same chain");
    expect(detail).not.toContain("DIFFERENT chain");
    expect(detail).not.toContain("Ethereum mainnet");
  });

  it("knows .sol on a Solana offer is same-chain, and on Base is not", () => {
    const onSolana = detailOf("shop.sol", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(onSolana).toContain("Solana Name Service");
    expect(onSolana).toContain("same chain");
    const onBase = detailOf("shop.sol");
    expect(onBase).toContain("DIFFERENT chain");
  });

  it("names the other registries rather than shrugging at a dot", () => {
    expect(detailOf("shop.crypto")).toContain("Unstoppable Domains");
    expect(detailOf("shop.cb.id")).toContain("Coinbase ID");
    expect(detailOf("shop.lens")).toContain("Lens");
  });

  it("catches the wallet pasted into the wrong rail's entry", () => {
    // A 0x address on a Solana offer, and base58 on a Base offer:
    // nobody can pay either, resolver or no resolver.
    const evmOnSolana = on(
      "0xDD350976B8cfFc65938C0464d39A2C78BE079bd0",
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
    expect(evmOnSolana.map((a) => a.name)).toContain("payto-wrong-rail");
    const solOnBase = on("DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE");
    expect(solOnBase.map((a) => a.name)).toContain("payto-wrong-rail");
    expect(detailOf("DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE")).toContain(
      "EIP-3009",
    );
  });

  it("calls a truncated hex paste what it is", () => {
    const detail = detailOf("0xDD350976B8cfFc65938C0464d39A2C78BE07");
    expect(detail).toContain("bytes rather than the 20");
  });

  it("says nothing at all about a correct address on either rail", () => {
    expect(on("0xDD350976B8cfFc65938C0464d39A2C78BE079bd0").map((a) => a.name)).not.toContain(
      "payto-is-a-name",
    );
    expect(
      on(
        "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE",
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      ).filter((a) => a.name.startsWith("payto-")),
    ).toHaveLength(0);
  });

  it("notices an empty payTo, which has nothing to resolve", () => {
    expect(detailOf("")).toContain("no payTo at all");
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
