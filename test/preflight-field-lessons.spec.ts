import { DEFAULT_MAX_AMOUNT_PER_PAYMENT } from "@x402/core/client";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";
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

describe("something to key a retry on", () => {
  /**
   * CV's reading, 2026-08-28: the double-charge lesson landed at the
   * SDK layer, and what is left is the hand-rolled authorization
   * path, whose retry signs a FRESH nonce. The x402 nonce stops a
   * replay of one authorization and says nothing about two honest
   * authorizations for one intended purchase. The seller-side
   * correlate is observable and this battery had never asked.
   */
  const withInputs = (queryParams: Record<string, unknown>) =>
    advisoryNames(
      challenge([BASE_ACCEPT], {
        bazaar: { info: { input: { type: "http", method: "GET", queryParams } } },
      }),
    );

  for (const field of [
    "idempotency_key",
    "idempotencyKey",
    "order_id",
    "requestId",
    "client_ref",
    "purchase-id",
  ]) {
    it(`credits a declared ${field}`, () => {
      const names = withInputs({ url: "https://x.example/a", [field]: "abc" });
      expect(names).toContain("retry-key-declared");
      expect(names).not.toContain("retry-key-not-in-challenge");
    });
  }

  it("names the absence where inputs are declared without one", () => {
    const { advisories } = runChecks(
      challenge([BASE_ACCEPT], {
        bazaar: {
          info: {
            input: {
              type: "http",
              method: "GET",
              queryParams: { url: "https://x.example/a" },
            },
          },
        },
      }),
      false,
    );
    const found = advisories.find(
      (advisory) => advisory.name === "retry-key-not-in-challenge",
    );
    expect(found).toBeTruthy();
    // Says what one absence cannot separate, and how to falsify it —
    // the discipline signed-offers-not-in-challenge took on 08-28.
    expect(found!.detail).toContain("does not distinguish");
    expect(found!.detail).toContain("TO FALSIFY");
    // Never asserts a fact about the till behind the door.
    expect(found!.detail).toContain("THAT IS WHAT WAS OBSERVED");
  });

  it("does not count one silence twice", () => {
    // A door declaring no input contract at all draws the louder
    // advisory and nothing from this reading.
    const names = advisoryNames(challenge([BASE_ACCEPT]));
    expect(names).toContain("no-input-contract");
    expect(names).not.toContain("retry-key-not-in-challenge");
    expect(names).not.toContain("retry-key-declared");
  });

  it("moves no verdict either way", () => {
    // Same door, same bazaar block, one field apart: the reading is
    // advisory in both batteries and must not touch a check.
    const checksFor = (queryParams: Record<string, unknown>) =>
      runChecks(
        challenge([BASE_ACCEPT], {
          bazaar: { info: { input: { type: "http", method: "GET", queryParams } } },
        }),
        false,
      ).checks.map((check) => [check.name, check.ok]);
    expect(checksFor({ url: "https://x.example/a", order_id: "abc" })).toEqual(
      checksFor({ url: "https://x.example/a" }),
    );
  });
});

describe("the paid walk names a payTo defect as the finding", () => {
  it("stops at terms with the real reason, never at the sanctions screen", async () => {
    /**
     * The sweep's find, 2026-08-20: a target publishing a name passed
     * the presence check, then failed inside the screen as "address
     * shape unscreenable" — so a customer who PAID for this walk was
     * told about our screening plumbing, in a sentence that ends
     * "nothing here says anything about the address itself", at the
     * one moment their address is the whole finding.
     */
    const { performLaunchCheck } = await import("@/services/launch-check");
    const target = "https://names-its-wallet.example/api/buy/thing";
    const runWalk = () =>
      performLaunchCheck(
        { ...(env as unknown as Env), FIELD_WALLET_KEY: "" } as Env,
        target,
        {
          fetch: (async () =>
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
                        payTo: "shop.base.eth",
                        maxTimeoutSeconds: 300,
                      },
                    ],
                  }),
                ),
              },
            })) as unknown as typeof fetch,
        },
      );
    let walk = await runWalk();
    if (walk.stages.some((s) => s.stage === "approach" && !s.ok)) {
      // performLaunchCheck deliberately swallows transport errors into
      // a signed approach-failure stage — correct in production, and
      // it means one workerd socket blip starves this assertion (seen
      // once in a full-suite run, right under a "Network connection
      // lost" disconnect). One retry keeps the assertion strong
      // without teaching the test to accept the wrong stage.
      walk = await runWalk();
    }
    const terms = walk.stages.find((s) => s.stage === "terms" && !s.ok);
    expect(
      terms,
      `the walk did not fail at terms on an unpayable payTo; stages: ${JSON.stringify(walk.stages)}`,
    ).toBeTruthy();
    expect(terms!.detail).toContain("Basename");
    expect(terms!.detail).toContain("nothing was charged");
    // And it never got as far as blaming the screen.
    expect(walk.stages.find((s) => s.stage === "screen")).toBeUndefined();
  });
});

describe("no bounty is opened on a door nobody can be paid to visit", () => {
  it("refuses at open, so the shopper is never the one who finds out", async () => {
    /**
     * The sweep's second find, and the costlier one. A bounty captures
     * the door's payTo and the claim verifier later compares an
     * on-chain transfer against it. A name never matches an address,
     * so a shopper could pay out of their own pocket and still be
     * unable to collect — which from outside looks like the store
     * welching on a posted reward.
     */
    const { openBounty, BountyRefused } = await import("@/services/bounty-board");
    const challengeWith = (payTo: string) =>
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
                    payTo,
                    maxTimeoutSeconds: 300,
                  },
                ],
              }),
            ),
          },
        })) as unknown as typeof fetch;

    await expect(
      openBounty(
        env as unknown as Env,
        {
          targetUrl: "https://names-its-wallet.example/api/buy/thing",
          rewardUsd: 1,
        },
        { fetch: challengeWith("shop.base.eth") },
      ),
    ).rejects.toThrow(BountyRefused);
  });
});

describe("the default client cap, read before anyone burns a signed call (#59)", () => {
  /**
   * The stock @x402/core client ships with a spend ceiling —
   * DEFAULT_MAX_AMOUNT_PER_PAYMENT — and refuses any offer above it
   * BEFORE signing. The seller's side of that refusal is silence: no
   * payment attempt, no error in their logs, just zero demand at a
   * door that 402s perfectly. A catalogue priced entirely above the
   * cap has locked out every unconfigured buyer and nothing anywhere
   * says so. This advisory does. The number is imported from the
   * client package, never retyped, so the advisory can only ever
   * disagree with the client by being out of date in lockstep.
   */
  it("a door whose cheapest USDC ask is above the cap gets the advisory, derived from the client's own constant", () => {
    const advisory = runChecks(
      challenge([{ ...BASE_ACCEPT, amount: "1500000" }]),
      false,
    ).advisories.find((entry) => entry.name === "above-default-client-cap");
    expect(advisory, "a $1.50-only door passed silently").toBeDefined();
    expect(advisory!.detail).toContain("DEFAULT_MAX_AMOUNT_PER_PAYMENT");
    expect(advisory!.detail).toContain(DEFAULT_MAX_AMOUNT_PER_PAYMENT);
    expect(advisory!.detail).toContain("$1.5");
  });

  it("one sub-cap tier anywhere clears it — the stock client has a way in", () => {
    expect(
      advisoryNames(
        challenge([{ ...BASE_ACCEPT, amount: "1500000" }, { ...BASE_ACCEPT }]),
      ),
    ).not.toContain("above-default-client-cap");
  });

  it("exactly the cap is reachable, not above it", () => {
    expect(
      advisoryNames(challenge([{ ...BASE_ACCEPT, amount: "1000000" }])),
    ).not.toContain("above-default-client-cap");
  });

  it("a non-USDC ask is never read as dollars (rule 52: cannot see, do not answer)", () => {
    expect(
      advisoryNames(
        challenge([
          {
            ...BASE_ACCEPT,
            asset: "0x0000000000000000000000000000000000000001",
            amount: "1500000",
          },
        ]),
      ),
    ).not.toContain("above-default-client-cap");
  });

  it("a decimal amount is illegible here — amount-not-atomic already names that defect", () => {
    const names = advisoryNames(challenge([{ ...BASE_ACCEPT, amount: "1.50" }]));
    expect(names).toContain("amount-not-atomic");
    expect(names).not.toContain("above-default-client-cap");
  });
});
