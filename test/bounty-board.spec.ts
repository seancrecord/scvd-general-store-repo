import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverTypedDataAddress } from "viem";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_WEEKLY_BUDGET_USD,
  BountyRefused,
  bountyBoard,
  claimBounty,
  openBounty,
} from "@/services/bounty-board";
import { fieldSignerFromKey } from "@/services/launch-check";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { BASE_USDC, POLYGON_USDC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const DOOR = "https://shop.example/api/buy/thing";
const DOOR_PAY_TO = "0x1111111111111111111111111111111111111111";
const SHOPPER = "0x2222222222222222222222222222222222222222";
const PAYOUT_TO = "0x3333333333333333333333333333333333333333";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TX = `0x${"cd".repeat(32)}`;

/** The door's 402, the fake node, and the clear screen in one fetch. */
function world(opts: {
  head?: number;
  receiptBlock?: number;
  receiptStatus?: string;
  transferAmount?: string;
  transferTo?: string;
  transferFrom?: string;
  noReceipt?: boolean;
  /** The door quotes this rail (and its USDC) instead of Base. */
  doorNetwork?: string;
  doorAsset?: string;
  /** The token contract the receipt's transfer log sits on. */
  logAsset?: string;
} = {}): typeof fetch {
  const pad = (addr: string) =>
    `0x${addr.toLowerCase().slice(2).padStart(64, "0")}`;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.startsWith("https://shop.example/")) {
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: opts.doorNetwork ?? "eip155:8453",
                  amount: "50000", // $0.05
                  asset: opts.doorAsset ?? BASE_USDC,
                  payTo: DOOR_PAY_TO,
                },
              ],
            }),
          ),
        },
      });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "eth_blockNumber") {
      return new Response(
        JSON.stringify({ result: `0x${(opts.head ?? 500_000).toString(16)}` }),
        { status: 200 },
      );
    }
    if (body.method === "eth_getTransactionReceipt") {
      if (opts.noReceipt) {
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          result: {
            status: opts.receiptStatus ?? "0x1",
            blockNumber: `0x${(opts.receiptBlock ?? 500_010).toString(16)}`,
            logs: [
              {
                address: opts.logAsset ?? BASE_USDC,
                topics: [
                  TRANSFER_TOPIC,
                  pad(opts.transferFrom ?? SHOPPER),
                  pad(opts.transferTo ?? DOOR_PAY_TO),
                ],
                data: `0x${BigInt(opts.transferAmount ?? "50000").toString(16)}`,
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    // The sanctions oracle answers clear.
    if (String(init?.body ?? "").includes("0xdf592f7d")) {
      return new Response(JSON.stringify({ result: `0x${"0".repeat(64)}` }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ result: `0x${"0".repeat(64)}` }), {
      status: 200,
    });
  }) as typeof fetch;
}

async function clearBoard(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: "bounty" });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
}

afterEach(async () => {
  await clearBoard();
  vi.unstubAllGlobals();
  installFacilitatorMock();
});

async function openTestBounty(rewardUsd = 0.1) {
  // openBounty reads the chain head through global fetch (base-rpc has
  // no injection seam); stub the world around it.
  vi.stubGlobal("fetch", world());
  const bounty = await openBounty(testEnv, { targetUrl: DOOR, rewardUsd }, {
    fetch: world(),
  });
  return bounty;
}

const claimOptions = async () => ({
  signer: await fieldSignerFromKey(TEST_FIELD_KEY),
  fetch: world(),
});

describe("posting bounties — the keeper's hand, terms captured by us", () => {
  it("captures the door's payTo and price at posting", async () => {
    const bounty = await openTestBounty();
    expect(bounty.pay_to).toBe(DOOR_PAY_TO);
    expect(bounty.amount_atomic).toBe("50000");
    expect(bounty.amount_usd).toBe(0.05);
    expect(bounty.status).toBe("open");
    expect(bounty.opened_block).toBe(500_000);
  });

  it("refuses a door with no payment gate, a losing reward, and an over-cap reward", async () => {
    vi.stubGlobal("fetch", world());
    await expect(
      openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.04 }, { fetch: world() }),
    ).rejects.toThrow(/must exceed the door's price/);
    await expect(
      openBounty(
        testEnv,
        { targetUrl: DOOR, rewardUsd: BOUNTY_MAX_REWARD_USD + 1 },
        { fetch: world() },
      ),
    ).rejects.toThrow(/between \$0 and/);
    const openDoor = (async () =>
      new Response("free goods", { status: 200 })) as typeof fetch;
    await expect(
      openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1 }, { fetch: openDoor }),
    ).rejects.toThrow(/not 402/);
  });

  it("one bounty per domain per week", async () => {
    await openTestBounty();
    await expect(openTestBounty()).rejects.toThrow(/one per domain per week/);
  });
});

describe("claiming — the chain's part verified, the payout signed", () => {
  it("pays a verified settlement with an authorization that RECOVERS to the field wallet", async () => {
    const bounty = await openTestBounty();
    vi.stubGlobal("fetch", world());
    const result = await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TX,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
        observation: "402 clean, paid, goods returned with a receipt header",
      },
      await claimOptions(),
    );
    expect(result.reward_usd).toBe(0.1);
    expect(result.payout.authorization.to).toBe(PAYOUT_TO);
    expect(result.payout.authorization.value).toBe("100000");
    // The signature is real money: prove it recovers to the field
    // wallet over USDC's exact EIP-712 domain — the same check the
    // token contract performs at redemption.
    const signer = await fieldSignerFromKey(TEST_FIELD_KEY);
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: BASE_USDC as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: result.payout.authorization.from as `0x${string}`,
        to: result.payout.authorization.to as `0x${string}`,
        value: BigInt(result.payout.authorization.value),
        validAfter: BigInt(result.payout.authorization.validAfter),
        validBefore: BigInt(result.payout.authorization.validBefore),
        nonce: result.payout.authorization.nonce as `0x${string}`,
      },
      signature: result.payout.signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
    // The register rides the response.
    expect(result.what_was_verified).toContain("chain");
    expect(result.what_was_not).toContain("YOUR claim");
    // The bounty is spent and the budget counted.
    const board = await bountyBoard(testEnv);
    expect(board.bounties[0]?.status).toBe("paid");
    expect(board.spent_this_week_usd).toBe(0.1);
  });

  it("one payout per transaction, ever — the replay costs nothing", async () => {
    const bounty = await openTestBounty();
    vi.stubGlobal("fetch", world());
    await claimBounty(
      testEnv,
      { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
      await claimOptions(),
    );
    await clearBoardStatusOpen(bounty.bounty_id);
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
        await claimOptions(),
      ),
    ).rejects.toThrow(/already been claimed/);
  });

  it("refuses the wrong amount, the wrong recipient, a failed tx, and prehistory", async () => {
    const bounty = await openTestBounty();
    const cases: Array<[Parameters<typeof world>[0], RegExp]> = [
      [{ transferAmount: "49999" }, /not in this transaction/],
      [{ transferTo: PAYOUT_TO }, /not in this transaction/],
      [{ receiptStatus: "0x0" }, /no successful transaction/],
      [{ noReceipt: true }, /no successful transaction/],
      [{ receiptBlock: 400_000 }, /predates the bounty/],
    ];
    for (const [worldOpts, message] of cases) {
      // The receipt read rides base-rpc's global fetch; each case is
      // its own chain.
      vi.stubGlobal("fetch", world(worldOpts));
      await expect(
        claimBounty(
          testEnv,
          { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
          { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: world(worldOpts) },
        ),
      ).rejects.toThrow(message);
    }
  });

  it("screens the payout address, fail closed", async () => {
    const bounty = await openTestBounty();
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
        {
          signer: await fieldSignerFromKey(TEST_FIELD_KEY),
          fetch: world(),
          screen: async () => ({ listed: true, source: "test screen" }),
        },
      ),
    ).rejects.toThrow(/sanctions screen/);
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: `0x${"ee".repeat(32)}`, payer: SHOPPER, payoutTo: PAYOUT_TO },
        {
          signer: await fieldSignerFromKey(TEST_FIELD_KEY),
          fetch: world(),
          screen: async () => ({ listed: null, source: "test screen (down)" }),
        },
      ),
    ).rejects.toThrow(/fails closed/);
  });

  it("the weekly budget is a wall, said plainly", async () => {
    const bounty = await openTestBounty();
    await testEnv.COUNTERS.put(
      KV_KEYS.bountyBudget(currentWeekKey()),
      String(BOUNTY_WEEKLY_BUDGET_USD),
    );
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
        await claimOptions(),
      ),
    ).rejects.toThrow(/budget/);
  });

  it("with no field wallet, the board is read-only and says so", async () => {
    const bounty = await openTestBounty();
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
        { fetch: world() },
      ),
    ).rejects.toThrow(/read-only/);
  });
});

describe("the public board", () => {
  it("serves the rules, the budget, and the claims shape", async () => {
    const response = await SELF.fetch(`${BASE}/api/bounties`);
    expect(response.status).toBe(200);
    const board = (await response.json()) as Record<string, any>;
    expect(board.what_this_is).toContain("mystery shopping");
    expect(JSON.stringify(board.the_rules)).toContain("One payout per settlement");
    expect(board.weekly_budget_usd).toBe(BOUNTY_WEEKLY_BUDGET_USD);
    expect(typeof board.payouts_enabled).toBe("boolean");
  });

  it("a malformed claim is refused with the shape named", async () => {
    const response = await SELF.fetch(`${BASE}/api/bounty-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bounty_id: "bty_none", tx_hash: "junk" }),
    });
    expect(response.status).toBe(400);
  });
});

/** Reopen a paid bounty so the tx-replay guard is tested in isolation. */
async function clearBoardStatusOpen(bountyId: string): Promise<void> {
  const record = await testEnv.COUNTERS.get<Record<string, unknown>>(
    KV_KEYS.bounty(bountyId),
    "json",
  );
  if (record) {
    await testEnv.COUNTERS.put(
      KV_KEYS.bounty(bountyId),
      JSON.stringify({ ...record, status: "open" }),
    );
  }
}


/**
 * THE THIRD RAIL ON THE BOARD (parity ruling, 2026-08-21): a
 * Polygon-only door is still a door somebody should be paid to walk.
 * The bounty captures the rail beside the terms, the claim verifier
 * reads the bounty's own chain, and the reward still pays in Base
 * USDC — same shopper address on both EVM rails.
 */
describe("the third rail on the board", () => {
  const polygonWorld = (extra: Parameters<typeof world>[0] = {}) =>
    world({
      doorNetwork: "eip155:137",
      doorAsset: POLYGON_USDC,
      logAsset: POLYGON_USDC,
      ...extra,
    });

  it("captures a Polygon-only door and pays its Polygon-verified claim", async () => {
    vi.stubGlobal("fetch", polygonWorld());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: polygonWorld() },
    );
    expect(bounty.network).toBe("eip155:137");
    expect(bounty.pay_to).toBe(DOOR_PAY_TO);
    const result = await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: TX,
        payer: SHOPPER,
        payoutTo: PAYOUT_TO,
      },
      { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: polygonWorld() },
    );
    expect(result.what_was_verified).toContain("succeeded on Polygon");
    // The reward is Base USDC regardless: one payout rail, stated.
    expect(result.payout.asset).toBe(BASE_USDC);
    expect(result.payout.chain).toBe("eip155:8453");
  });

  it("refuses a claim whose transfer sits on the wrong rail's USDC", async () => {
    vi.stubGlobal("fetch", polygonWorld());
    const bounty = await openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: polygonWorld() },
    );
    // The receipt exists on the read, but its transfer log is Base
    // USDC — on the Polygon read that token is a stranger's contract,
    // and the settlement the bounty asked for is not in it. The chain
    // read rides global fetch (base-rpc has no injection seam).
    vi.stubGlobal("fetch", polygonWorld({ logAsset: BASE_USDC }));
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: TX,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        {
          signer: await fieldSignerFromKey(TEST_FIELD_KEY),
          fetch: polygonWorld({ logAsset: BASE_USDC }),
        },
      ),
    ).rejects.toThrow(/no USDC transfer/);
  });
});

/**
 * ONE SETTLEMENT, ONE PAYOUT — found 2026-08-25 by a review pass, and
 * measured before it was fixed.
 *
 * "One payout per transaction, EVER" was a `get` at the top of
 * claimBounty and a `put` a hundred lines below it, with a chain read
 * and an EIP-3009 signature in between. Four concurrent POSTs of the
 * same claim body all saw an empty key and all came back with a signed
 * authorization — four DISTINCT nonces, so the USDC contract accepts
 * every one of them. Measured: four payouts for one $0.10 bounty, on
 * an unauthenticated route.
 *
 * The weekly budget was the same shape and so bounded nothing: `spent`
 * was read at the top and written at the bottom, so four payouts moved
 * the counter by ONE reward — and /bounties publishes that counter, so
 * the public figure understated what the wallet had signed away.
 *
 * Revert either half and this goes red.
 */
describe("a settlement can only be claimed once", () => {
  it("signs one payout for concurrent claims of the same transaction", async () => {
    const bounty = await openTestBounty();
    vi.stubGlobal("fetch", world());
    const options = await claimOptions();
    const attempts = await Promise.allSettled(
      [0, 1, 2, 3].map(() =>
        claimBounty(
          testEnv,
          {
            bountyId: bounty.bounty_id,
            txHash: TX,
            payer: SHOPPER,
            payoutTo: PAYOUT_TO,
          },
          options,
        ),
      ),
    );

    const paid = attempts.filter((a) => a.status === "fulfilled");
    expect(
      paid.length,
      "more than one claim produced a signed authorization",
    ).toBe(1);
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") continue;
      expect(String(attempt.reason)).toMatch(/already been claimed/);
    }

    // And the week's books moved by exactly one reward, which is the
    // half that made the cap meaningless.
    const spent = await testEnv.COUNTERS.get(
      KV_KEYS.bountyBudget(currentWeekKey(new Date())),
    );
    expect(Number(spent)).toBe(0.1);
  });

  it("gives the claim back when the chain refuses, so a real walk is not burned", async () => {
    // A transaction that never paid out has to stay claimable: one bad
    // chain read must not consume a walker's real purchase forever.
    const bounty = await openTestBounty();
    const blind = world({ noReceipt: true });
    vi.stubGlobal("fetch", blind);
    await expect(
      claimBounty(
        testEnv,
        {
          bountyId: bounty.bounty_id,
          txHash: `0x${"ab".repeat(32)}`,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: blind },
      ),
    ).rejects.toThrow(BountyRefused);

    const held = await testEnv.COUNTERS.get(
      KV_KEYS.bountyTx(`0x${"ab".repeat(32)}`),
    );
    expect(held, "a refused claim kept the transaction locked").toBeNull();
  });
});
