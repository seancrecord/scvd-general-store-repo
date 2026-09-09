import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  ALGORAND_CHAIN,
  ALGORAND_USDC_ASSET_DEFAULT,
  isAlgorandNetwork,
  isAlgorandTxId,
} from "@/lib/algorand-rpc";
import { BASE_USDC } from "@/lib/base-rpc";
import { claimBounty, openBounty } from "@/services/bounty-board";
import { fieldSignerFromKey } from "@/services/launch-check";
import type { BountyRecord } from "@/services/bounty-board";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const DOOR = "https://algo.example/api/thing";
const ALGO_DOOR_PAY_TO = "DOORDOORDOORDOORDOORDOORDOORDOORDOORDOORDOORDOORDOORDOORDO";
const ALGO_PAYER = "PAYERPAYERPAYERPAYERPAYERPAYERPAYERPAYERPAYERPAYERPAYERPAY";
const PAYOUT_TO = "0x3333333333333333333333333333333333333333";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TXID = "A".repeat(52);
const OPEN_ROUND = 40_000_000;

/**
 * THE FIFTH RAIL (2026-09-09). The W37 census found 78 ready doors
 * quoting Algorand and this store could verify a settlement on none of
 * them. Two things make this rail different from Solana's, and both
 * are tested here rather than trusted:
 *
 *   THE SPELLING. The ecosystem writes the chain three ways across 87
 *   doors — the CAIP-2 truncation, the padded base64 genesis hash, and
 *   the plain word "mainnet". A reader that accepted one would refuse
 *   honest doors over a formatting opinion.
 *
 *   THE CLOCK. An Algorand round is final when confirmed, so there is
 *   no finality window to sit through — only a height a settlement
 *   must postdate. The Solana path's window is not missing here; it
 *   does not apply.
 */

/** A door quoting Algorand only, an indexer, and algod's round. */
function algoWorld(
  opts: {
    network?: string;
    asset?: number;
    amount?: string;
    sender?: string;
    receiver?: string;
    round?: number;
    missing?: boolean;
    txType?: string;
  } = {},
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://algo.example/")) {
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: opts.network ?? ALGORAND_CHAIN,
                  amount: "50000",
                  asset: String(ALGORAND_USDC_ASSET_DEFAULT),
                  payTo: ALGO_DOOR_PAY_TO,
                },
              ],
            }),
          ),
        },
      });
    }
    if (url.includes("/v2/status")) {
      return Response.json({ "last-round": opts.round ?? OPEN_ROUND });
    }
    if (url.includes("/v2/transactions/")) {
      if (opts.missing) return new Response("not found", { status: 404 });
      return Response.json({
        transaction: {
          "confirmed-round": (opts.round ?? OPEN_ROUND) + 10,
          sender: opts.sender ?? ALGO_PAYER,
          "tx-type": opts.txType ?? "axfer",
          "asset-transfer-transaction": {
            "asset-id": opts.asset ?? ALGORAND_USDC_ASSET_DEFAULT,
            amount: Number(opts.amount ?? "50000"),
            receiver: opts.receiver ?? ALGO_DOOR_PAY_TO,
          },
        },
      });
    }
    // Everything EVM: the head, the sanctions oracle, the payout chain.
    return Response.json({ result: `0x${"0".repeat(64)}` });
  }) as typeof fetch;
}

const claimOptions = async (world: typeof fetch) => ({
  signer: await fieldSignerFromKey(TEST_FIELD_KEY),
  fetch: world,
  screen: async () => ({ listed: false as const, source: "test screen" }),
});

afterEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: "bounty" });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  vi.unstubAllGlobals();
});

describe("the fifth rail reads three spellings of one chain", () => {
  it("accepts every spelling the census actually sees", () => {
    expect(isAlgorandNetwork(ALGORAND_CHAIN)).toBe(true);
    expect(
      isAlgorandNetwork("algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8="),
    ).toBe(true);
    expect(isAlgorandNetwork("algorand:mainnet")).toBe(true);
    expect(isAlgorandNetwork("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(false);
    expect(isAlgorandNetwork(undefined)).toBe(false);
  });

  it("tells the three identifier families apart on shape alone", () => {
    expect(isAlgorandTxId(TXID)).toBe(true);
    expect(isAlgorandTxId(`0x${"ab".repeat(32)}`)).toBe(false);
    expect(isAlgorandTxId("5".repeat(87))).toBe(false);
  });

  it("captures a door that quotes the padded spelling", async () => {
    const world = algoWorld({
      network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    });
    vi.stubGlobal("fetch", world);
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: world },
    );
    // Stored under one spelling whatever the door wrote.
    expect(bounty.network).toBe(ALGORAND_CHAIN);
    expect(bounty.opened_round).toBe(OPEN_ROUND);
    expect(bounty.pay_to).toBe(ALGO_DOOR_PAY_TO);
  });
});

describe("an Algorand settlement, verified", () => {
  async function open(world: typeof fetch) {
    vi.stubGlobal("fetch", world);
    return openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1 }, { fetch: world });
  }

  it("pays a real transfer and keeps the round, never a block", async () => {
    const world = algoWorld();
    const bounty = await open(world);
    const result = await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TXID,
        payer: ALGO_PAYER,
        payoutTo: PAYOUT_TO,
      },
      await claimOptions(world),
    );
    expect(result.reward_usd).toBe(0.1);
    expect(result.what_was_verified).toContain("Algorand");
    expect(result.what_was_verified).toContain("round after the bounty existed");
    // The reward is Base USDC on this rail like every other.
    expect(result.payout.chain).toBe("eip155:8453");
    const stored = await testEnv.COUNTERS.get<BountyRecord>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    expect(stored?.claim?.settled_round).toBe(OPEN_ROUND + 10);
    expect(stored?.claim?.settled_block).toBeUndefined();
    // Base32 is case-sensitive: the id and payer are kept as written.
    expect(stored?.claim?.tx_hash).toBe(TXID);
    expect(stored?.claim?.payer).toBe(ALGO_PAYER);
  });

  it("refuses the wrong asset, the wrong amount, the wrong parties, and history", async () => {
    for (const [opts, message] of [
      [{ asset: 12345 }, /moved asset 12345, not the USDC asset/],
      [{ amount: "49999" }, /carries no transfer of 50000 atomic units/],
      [{ sender: "X".repeat(58) }, /carries no transfer of/],
      [{ receiver: "Y".repeat(58) }, /carries no transfer of/],
      [{ missing: true }, /shows no asset transfer under that id/],
      [{ txType: "pay" }, /shows no asset transfer under that id/],
    ] as Array<[Parameters<typeof algoWorld>[0], RegExp]>) {
      const world = algoWorld(opts);
      const bounty = await open(algoWorld());
      vi.stubGlobal("fetch", world);
      await expect(
        claimBounty(
          testEnv,
          {
            bountyId: bounty.bounty_id,
            txHash: TXID,
            payer: ALGO_PAYER,
            payoutTo: PAYOUT_TO,
          },
          await claimOptions(world),
        ),
        String(message),
      ).rejects.toThrow(message);
      const listed = await testEnv.COUNTERS.list({ prefix: "bounty" });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    }
  });

  it("refuses a settlement older than the listing", async () => {
    const world = algoWorld();
    const bounty = await open(world);
    // The record's clock moved forward under it: the same shape as a
    // walker claiming a payment they made last week.
    const stored = await testEnv.COUNTERS.get<Record<string, unknown>>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.bounty(bounty.bounty_id),
      JSON.stringify({ ...stored, opened_round: OPEN_ROUND + 100 }),
    );
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: TXID,
          payer: ALGO_PAYER,
          payoutTo: PAYOUT_TO,
        },
        await claimOptions(world),
      ),
    ).rejects.toThrow(/predates the bounty/);
  });

  it("reads the claim's shapes against this rail, not Base's", async () => {
    const world = algoWorld();
    const bounty = await open(world);
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: `0x${"cd".repeat(32)}`,
          payer: ALGO_PAYER,
          payoutTo: PAYOUT_TO,
        },
        await claimOptions(world),
      ),
    ).rejects.toThrow(/base32 Algorand transaction id/);
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: TXID,
          payer: "0x2222222222222222222222222222222222222222",
          payoutTo: PAYOUT_TO,
        },
        await claimOptions(world),
      ),
    ).rejects.toThrow(/58-character Algorand address/);
  });

  it("refuses a rail named that the door does not offer", async () => {
    const world = algoWorld();
    vi.stubGlobal("fetch", world);
    await expect(
      openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: 0.1, rail: "base" },
        { fetch: world },
      ),
    ).rejects.toThrow(/quotes no base entry/);
  });

  it("captures Algorand when it is asked for by name", async () => {
    /** A door offering Base and Algorand, the shape the census is full of. */
    const bothWorld = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes(".example/")) {
        return new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": btoa(
              JSON.stringify({
                x402Version: 2,
                accepts: [
                  {
                    scheme: "exact",
                    network: "eip155:8453",
                    amount: "50000",
                    asset: BASE_USDC,
                    payTo: "0x1111111111111111111111111111111111111111",
                  },
                  {
                    scheme: "exact",
                    network: ALGORAND_CHAIN,
                    amount: "50000",
                    asset: String(ALGORAND_USDC_ASSET_DEFAULT),
                    payTo: ALGO_DOOR_PAY_TO,
                  },
                ],
              }),
            ),
          },
        });
      }
      return algoWorld()(input, init);
    }) as typeof fetch;
    vi.stubGlobal("fetch", bothWorld);
    const byDefault = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: bothWorld },
    );
    expect(byDefault.network).toBe("eip155:8453");
    const asked = await openBounty(
      testEnv,
      { targetUrl: "https://algo2.example/api", rewardUsd: 0.1, rail: "algorand" },
      { fetch: bothWorld },
    );
    expect(asked.network).toBe(ALGORAND_CHAIN);
    expect(asked.opened_round).toBe(OPEN_ROUND);
  });
});
