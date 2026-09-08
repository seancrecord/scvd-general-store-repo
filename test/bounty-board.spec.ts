import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverTypedDataAddress } from "viem";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_REFUSALS,
  BOUNTY_REFUSAL_CATALOGUE,
  BOUNTY_WEEKLY_BUDGET_USD,
  BountyRefused,
  bountyBoard,
  claimBounty,
  openBounty,
  type ClaimInput,
} from "@/services/bounty-board";
import { escapeHtml } from "@/lib/sanitize";
import { crowdWalkRow } from "@/services/crowd-walks";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
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
    // The chain's part is kept for the corpus row, and the store took
    // its own knock at the door beside the walker's claim (2026-09-04).
    const claim = board.bounties[0]?.claim;
    expect(claim?.settled_block).toBe(500_010);
    expect(claim?.house_probe?.verdict).toBeDefined();
    expect(claim?.house_probe?.at).toBeTruthy();
    expect(claim?.observation).toContain("402 clean");
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

  /**
   * 2026-08-27 → 2026-09-01: five bounties past their expiry were
   * listed as open on the public board while the claim door refused
   * them as expired. The status a stranger reads has to come from the
   * same clock that would refuse their claim — written red first,
   * against a record aged past its expiry in KV exactly as the live
   * ones were.
   */
  it("an unclaimed bounty past its expiry reads as expired on every face", async () => {
    const bounty = await openTestBounty();
    const stored = await testEnv.COUNTERS.get<Record<string, unknown>>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.bounty(bounty.bounty_id),
      JSON.stringify({ ...stored, expires_at: "2026-08-27T20:58:35.233Z" }),
    );

    // The derived reading, at both moments.
    const before = await bountyBoard(testEnv, new Date("2026-08-26T00:00:00Z"));
    expect(before.bounties[0]?.status).toBe("open");
    expect(before.open_count).toBe(1);
    const after = await bountyBoard(testEnv, new Date("2026-09-01T00:00:00Z"));
    expect(after.bounties[0]?.status).toBe("expired");
    expect(after.open_count).toBe(0);

    // The JSON door and the room, read as a stranger would today.
    const json = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      bounties: Array<{ bounty_id: string; status: string }>;
      open_count: number;
    };
    const row = json.bounties.find((b) => b.bounty_id === bounty.bounty_id);
    expect(row?.status).toBe("expired");
    expect(json.open_count).toBe(0);
    const room = await (
      await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })
    ).text();
    expect(room).toContain("Nothing posted right now");
    expect(room).not.toContain(`<code>${bounty.bounty_id}</code>`);

    // And the claim door agrees with the board, as it always did.
    vi.stubGlobal("fetch", world());
    await expect(
      claimBounty(
        testEnv,
        { bountyId: bounty.bounty_id, txHash: TX, payer: SHOPPER, payoutTo: PAYOUT_TO },
        await claimOptions(),
      ),
    ).rejects.toThrow(/expired/);
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

/**
 * A STALE READ MUST NOT BURN A REAL WALK — found 2026-08-25 by a
 * review pass over the fix that shipped hours earlier.
 *
 * The claim readback sat ABOVE the try block, so it was the one
 * refusal path that never released the claim. And it is the path a
 * stale read takes: Workers KV reads are edge-cached and eventually
 * consistent, so a get after a put can return the old value with
 * nobody else involved.
 *
 * The consequence was permanent. A mystery shopper who really walked
 * the door and really settled on chain would be told "already
 * claimed", get no reward, and leave the tx key holding a claim for a
 * payout that never happened — refusing every future attempt, theirs
 * or anyone else's, forever. There is no expiry on that key and no
 * operator path to clear it.
 */
describe("an unconfirmed claim is released, not kept", () => {
  function staleOnce(realEnv: Env, key: string): Env {
    /*
     * `null` is a legitimate pre-write value here — the tx key is
     * ABSENT before the claim — so the armed flag has to be separate
     * from the held value. Conflating them made the first version of
     * this facade never fire, and the test passed for the wrong
     * reason before that was noticed.
     */
    let stale: string | null = null;
    let held = false;
    const counters = realEnv.COUNTERS;
    const facade = {
      ...counters,
      get: (async (name: string, type?: string) => {
        if (name === key && held) {
          held = false;
          return stale;
        }
        return (counters.get as (n: string, t?: string) => Promise<unknown>)(
          name,
          type,
        );
      }) as KVNamespace["get"],
      put: (async (name: string, value: string) => {
        if (name === key && !held) {
          stale = (await counters.get(name)) as string | null;
          held = true;
        }
        return counters.put(name, value);
      }) as KVNamespace["put"],
      delete: counters.delete.bind(counters),
      list: counters.list.bind(counters),
    } as unknown as KVNamespace;
    return { ...realEnv, COUNTERS: facade } as Env;
  }

  it("leaves the settlement claimable after an unconfirmed claim", async () => {
    const bounty = await openTestBounty();
    vi.stubGlobal("fetch", world());
    const txKey = KV_KEYS.bountyTx(TX.toLowerCase());

    let refusal: unknown = null;
    try {
      await claimBounty(
        staleOnce(testEnv, txKey),
        {
          bountyId: bounty.bounty_id,
          txHash: TX,
          payer: SHOPPER,
          payoutTo: PAYOUT_TO,
        },
        await claimOptions(),
      );
    } catch (error) {
      refusal = error;
    }
    expect(refusal, "a stale readback was allowed to sign").toBeTruthy();

    // THE HARM: the key must not be left holding a claim nobody was
    // paid for, or this settlement can never be claimed again.
    expect(
      await testEnv.COUNTERS.get(txKey),
      "a stale read burned a real settlement permanently",
    ).toBeNull();
    expect(String(refusal)).toMatch(/could not be confirmed/);
  });
});

/**
 * THE FOURTH RAIL ON THE BOARD (2026-09-05, SOLANA_PARITY.md #2): a
 * Solana-wallet shopper wrote in asking why a Solana door could not be
 * walked for a reward. The bounty captures the Solana rail, the claim
 * verifier reads pre/post token balances on Solana, and the reward
 * STILL pays in Base USDC to a 0x address — money-out on Solana is
 * gap #4 and stays shut. Two clocks on the record: the slot the
 * settlement must postdate, and the Base block the payout scans from.
 */
describe("the fourth rail on the board", () => {
  const SIG = "5".repeat(87);
  const SOL_SHOPPER = "BuYeRWaLLeT1111111111111111111111111111111a";
  const SOL_DOOR = "SeLLeRWaLLeT111111111111111111111111111111b";
  const OPEN_SLOT = 300_000_000;

  const tokenBalance = (owner: string, amount: string, accountIndex: number) => ({
    accountIndex,
    mint: SOLANA_USDC_MINT,
    owner,
    uiTokenAmount: { amount },
  });

  /** A settled SPL USDC transfer: shopper debited, door credited. */
  const settledTx = (opts: {
    slot?: number;
    amount?: string;
    err?: unknown;
    from?: string;
    to?: string;
  } = {}) => ({
    slot: opts.slot ?? OPEN_SLOT + 100,
    meta: {
      err: opts.err ?? null,
      preTokenBalances: [
        tokenBalance(opts.from ?? SOL_SHOPPER, opts.amount ?? "50000", 0),
        tokenBalance(opts.to ?? SOL_DOOR, "0", 1),
      ],
      postTokenBalances: [
        tokenBalance(opts.from ?? SOL_SHOPPER, "0", 0),
        tokenBalance(opts.to ?? SOL_DOOR, opts.amount ?? "50000", 1),
      ],
    },
    transaction: { message: { accountKeys: [] } },
  });

  /**
   * The Solana world: the door quotes Solana (and, optionally, Base
   * beside it), the Solana node answers getSlot and getTransaction,
   * and everything EVM (the Base head, the oracle) falls through to
   * the EVM world.
   */
  const solanaWorld = (opts: {
    tx?: unknown;
    headSlot?: number;
    slotAtOpen?: number;
    alsoBase?: boolean;
  } = {}): typeof fetch => {
    const evm = world();
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith("https://shop.example/")) {
        const solanaEntry = {
          scheme: "exact",
          network: SOLANA_CHAIN,
          amount: "50000",
          asset: SOLANA_USDC_MINT,
          payTo: SOL_DOOR,
        };
        const baseEntry = {
          scheme: "exact",
          network: "eip155:8453",
          amount: "50000",
          asset: BASE_USDC,
          payTo: DOOR_PAY_TO,
        };
        return new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": btoa(
              JSON.stringify({
                x402Version: 2,
                accepts: opts.alsoBase ? [solanaEntry, baseEntry] : [solanaEntry],
              }),
            ),
          },
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "getSlot") {
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: opts.headSlot ?? opts.slotAtOpen ?? OPEN_SLOT,
        });
      }
      if (body.method === "getTransaction") {
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: opts.tx === undefined ? settledTx() : opts.tx,
        });
      }
      return evm(input, init);
    }) as typeof fetch;
  };

  async function openSolanaBounty(alsoBase = false) {
    const opening = solanaWorld({ slotAtOpen: OPEN_SLOT, alsoBase });
    vi.stubGlobal("fetch", opening);
    return openBounty(
      testEnv,
      { targetUrl: DOOR, rewardUsd: 0.1 },
      { fetch: opening },
    );
  }

  const solanaClaim = async (bountyId: string, over: Partial<ClaimInput> = {}) =>
    claimBounty(
      testEnv,
      {
        bountyId,
        txHash: SIG,
        payer: SOL_SHOPPER,
        payoutTo: PAYOUT_TO,
        ...over,
      },
      { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: globalThis.fetch },
    );

  it("captures a Solana-only door with both clocks and pays its Solana-verified claim in Base USDC", async () => {
    const bounty = await openSolanaBounty();
    expect(bounty.network).toBe(SOLANA_CHAIN);
    expect(bounty.pay_to).toBe(SOL_DOOR);
    expect(bounty.opened_slot).toBe(OPEN_SLOT);
    // The Base head at the same instant: the payout rail's clock.
    expect(bounty.opened_block).toBe(500_000);

    // Well past finality, after the opening slot.
    vi.stubGlobal("fetch", solanaWorld({ headSlot: OPEN_SLOT + 1_000 }));
    const result = await claimBounty(
      testEnv,
      {
        bountyId: bounty.bounty_id,
        txHash: SIG,
        payer: SOL_SHOPPER,
        payoutTo: PAYOUT_TO,
        observation: "402 clean, paid on Solana, goods returned",
      },
      { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: globalThis.fetch },
    );
    expect(result.what_was_verified).toContain("succeeded on Solana");
    expect(result.what_was_verified).toContain("in a slot after");
    // One payout rail, stated: the reward is Base USDC regardless.
    expect(result.payout.asset).toBe(BASE_USDC);
    expect(result.payout.chain).toBe("eip155:8453");
    expect(result.payout.authorization.to).toBe(PAYOUT_TO);

    const board = await bountyBoard(testEnv);
    const claim = board.bounties[0]?.claim;
    expect(board.bounties[0]?.status).toBe("paid");
    // The slot is kept, never a block; the signature keeps its case.
    expect(claim?.settled_slot).toBe(OPEN_SLOT + 100);
    expect(claim?.settled_block).toBeUndefined();
    expect(claim?.tx_hash).toBe(SIG);
    expect(claim?.payer).toBe(SOL_SHOPPER);
    // The replay key is chain-prefixed and case-preserving.
    expect(await testEnv.COUNTERS.get(KV_KEYS.bountyTx(`sol:${SIG}`))).toBeTruthy();
    // The corpus row prints the slot as a slot.
    const row = await crowdWalkRow(board.bounties[0]!);
    expect(row?.settlement.slot).toBe(OPEN_SLOT + 100);
    expect(row?.settlement.block).toBeUndefined();
    expect(row?.network).toBe(SOLANA_CHAIN);
  });

  it("prefers an EVM rail when the door offers one beside Solana", async () => {
    const bounty = await openSolanaBounty(true);
    expect(bounty.network).toBe("eip155:8453");
    expect(bounty.pay_to).toBe(DOOR_PAY_TO);
    expect(bounty.opened_slot).toBeUndefined();
  });

  it("reads the claim's shapes against the bounty's rail, and the payout stays 0x", async () => {
    const bounty = await openSolanaBounty();
    vi.stubGlobal("fetch", solanaWorld({ headSlot: OPEN_SLOT + 1_000 }));
    await expect(
      solanaClaim(bounty.bounty_id, { txHash: TX }),
    ).rejects.toThrow(/base58 Solana transaction signature/);
    await expect(
      solanaClaim(bounty.bounty_id, { payer: SHOPPER }),
    ).rejects.toThrow(/base58 Solana wallet/);
    await expect(
      solanaClaim(bounty.bounty_id, { payoutTo: SOL_SHOPPER }),
    ).rejects.toThrow(/payout_to must be a 0x Base address/);
    // Nothing above touched the chain or the budget.
    const board = await bountyBoard(testEnv);
    expect(board.bounties[0]?.status).toBe("open");
    expect(board.spent_this_week_usd).toBe(0);
  });

  it("refuses a missing, failed, unfinal, prehistoric, or mismatched settlement — and releases each", async () => {
    const bounty = await openSolanaBounty();
    const refusals: Array<[Parameters<typeof solanaWorld>[0], RegExp]> = [
      [{ tx: null, headSlot: OPEN_SLOT + 1_000 }, /no transaction under that signature/],
      [{ tx: settledTx({ err: { InstructionError: [0, "Custom"] } }), headSlot: OPEN_SLOT + 1_000 }, /transaction failed/],
      [{ headSlot: OPEN_SLOT + 100 + 5 }, /slots deep/],
      [{ tx: settledTx({ slot: OPEN_SLOT - 1 }), headSlot: OPEN_SLOT + 1_000 }, /predates the bounty/],
      [{ tx: settledTx({ amount: "40000" }), headSlot: OPEN_SLOT + 1_000 }, /no transfer of 50000/],
      [{ tx: settledTx({ to: SOL_SHOPPER, from: SOL_DOOR }), headSlot: OPEN_SLOT + 1_000 }, /no transfer of 50000/],
    ];
    for (const [worldOpts, message] of refusals) {
      vi.stubGlobal("fetch", solanaWorld(worldOpts));
      await expect(solanaClaim(bounty.bounty_id)).rejects.toThrow(message);
      // Released: the settlement stays claimable and nothing is spent.
      expect(await testEnv.COUNTERS.get(KV_KEYS.bountyTx(`sol:${SIG}`))).toBeNull();
    }
    expect((await bountyBoard(testEnv)).spent_this_week_usd).toBe(0);
    // And the same signature pays once the chain agrees.
    vi.stubGlobal("fetch", solanaWorld({ headSlot: OPEN_SLOT + 1_000 }));
    const paid = await claimBounty(
      testEnv,
      { bountyId: bounty.bounty_id, txHash: SIG, payer: SOL_SHOPPER, payoutTo: PAYOUT_TO },
      { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: globalThis.fetch },
    );
    expect(paid.reward_usd).toBe(0.1);
  });
});

/**
 * THE BOARD PUBLISHES THE WAYS IT SAYS NO (2026-09-08).
 *
 * The room told a walker how to walk and how to claim, and said
 * nothing about the expensive half: what happens when a claim is
 * refused after their own money has already left their wallet. The
 * refusal catalogue is that half, published — and a published list of
 * refusals is only worth the paper if it still describes the door.
 *
 * So the catalogue is not prose about the code, it is pinned TO the
 * code: every row carries the door's own wording, and this test drives
 * each refusal for real and fails if any row matches nothing the store
 * says. Reword a refusal and leave the board behind, and the test goes
 * red instead of the public page going quietly false — the same rule
 * as the expiry correction, one clock behind every face.
 */
describe("the refusal catalogue is the door's own words", () => {
  const SOL_DOOR_URL = "https://sol.example/api/buy/thing";
  const SOL_SELLER = "SeLLeRWaLLeT111111111111111111111111111111b";
  const SOL_BUYER = "BuYeRWaLLeT1111111111111111111111111111111a";
  const SOL_SIG = "4".repeat(87);
  const SOL_SLOT = 310_000_000;

  /** A Solana door whose settlement is still inside the finality window. */
  function unfinalSolanaWorld(): typeof fetch {
    const evm = world();
    const balance = (owner: string, amount: string, accountIndex: number) => ({
      accountIndex,
      mint: SOLANA_USDC_MINT,
      owner,
      uiTokenAmount: { amount },
    });
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith("https://sol.example/")) {
        return new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": btoa(
              JSON.stringify({
                x402Version: 2,
                accepts: [
                  {
                    scheme: "exact",
                    network: SOLANA_CHAIN,
                    amount: "50000",
                    asset: SOLANA_USDC_MINT,
                    payTo: SOL_SELLER,
                  },
                ],
              }),
            ),
          },
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "getSlot") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: SOL_SLOT });
      }
      if (body.method === "getTransaction") {
        // Landed at the head: zero slots deep, inside the window.
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            slot: SOL_SLOT,
            meta: {
              err: null,
              preTokenBalances: [
                balance(SOL_BUYER, "50000", 0),
                balance(SOL_SELLER, "0", 1),
              ],
              postTokenBalances: [
                balance(SOL_BUYER, "0", 0),
                balance(SOL_SELLER, "50000", 1),
              ],
            },
            transaction: { message: { accountKeys: [] } },
          },
        });
      }
      return evm(input, init);
    }) as typeof fetch;
  }

  /**
   * A KV facade that hands back the pre-write value once for one key —
   * the eventually-consistent read that refuses a real walker and has
   * to release rather than burn their settlement.
   */
  function staleOnce(realEnv: Env, key: string): Env {
    let stale: string | null = null;
    let held = false;
    const counters = realEnv.COUNTERS;
    const facade = {
      ...counters,
      get: (async (name: string, type?: string) => {
        if (name === key && held) {
          held = false;
          return stale;
        }
        return (counters.get as (n: string, t?: string) => Promise<unknown>)(
          name,
          type,
        );
      }) as KVNamespace["get"],
      put: (async (name: string, value: string) => {
        if (name === key && !held) {
          stale = (await counters.get(name)) as string | null;
          held = true;
        }
        return counters.put(name, value);
      }) as KVNamespace["put"],
      delete: counters.delete.bind(counters),
      list: counters.list.bind(counters),
    } as unknown as KVNamespace;
    return { ...realEnv, COUNTERS: facade } as Env;
  }

  /** Every refusal the claim door can produce, collected by producing them. */
  async function refusalsFromTheDoor(): Promise<string[]> {
    const said: string[] = [];
    const drive = async (
      run: () => Promise<unknown>,
      what: string,
    ): Promise<void> => {
      try {
        await run();
        throw new Error(`the door did not refuse: ${what}`);
      } catch (error) {
        expect(error, what).toBeInstanceOf(BountyRefused);
        said.push(String((error as Error).message));
      }
    };

    const bounty = await openTestBounty();
    const claim = (over: Partial<ClaimInput> = {}) => ({
      bountyId: bounty.bounty_id,
      txHash: TX,
      payer: SHOPPER,
      payoutTo: PAYOUT_TO,
      ...over,
    });
    vi.stubGlobal("fetch", world());

    // The checks taken before the settlement is ever held.
    await drive(
      async () => claimBounty(testEnv, claim(), { fetch: world() }),
      "no field wallet",
    );
    await drive(
      async () =>
        claimBounty(testEnv, claim({ payoutTo: "not-an-address" }), await claimOptions()),
      "payout_to is not an address",
    );
    await drive(
      async () => claimBounty(testEnv, claim({ bountyId: "bty_nothere" }), await claimOptions()),
      "no bounty under that id",
    );
    await drive(
      async () => claimBounty(testEnv, claim({ txHash: "not-a-hash" }), await claimOptions()),
      "the tx id is not the rail's shape",
    );

    // The chain's part, each refusal against its own world.
    for (const [worldOpts, what] of [
      [{ noReceipt: true }, "the chain has no such settlement"],
      [{ receiptBlock: 400_000 }, "the settlement predates the bounty"],
      [{ transferAmount: "49999" }, "the transfer is not the one asked for"],
    ] as Array<[Parameters<typeof world>[0], string]>) {
      vi.stubGlobal("fetch", world(worldOpts));
      await drive(
        async () =>
          claimBounty(testEnv, claim(), {
            signer: await fieldSignerFromKey(TEST_FIELD_KEY),
            fetch: world(worldOpts),
          }),
        what,
      );
    }
    vi.stubGlobal("fetch", world());

    await drive(
      async () =>
        claimBounty(testEnv, claim(), {
          signer: await fieldSignerFromKey(TEST_FIELD_KEY),
          fetch: world(),
          screen: async () => ({ listed: true, source: "test screen" }),
        }),
      "the payout address is screened",
    );

    // The week's wall, put up and taken down again.
    await testEnv.COUNTERS.put(
      KV_KEYS.bountyBudget(currentWeekKey()),
      String(BOUNTY_WEEKLY_BUDGET_USD),
    );
    await drive(
      async () => claimBounty(testEnv, claim(), await claimOptions()),
      "the week's budget is spent",
    );
    await testEnv.COUNTERS.put(KV_KEYS.bountyBudget(currentWeekKey()), "0");

    // A hold this store cannot read back: released, never burned.
    const staleTx = `0x${"ab".repeat(32)}`;
    await drive(
      async () =>
        claimBounty(
          staleOnce(testEnv, KV_KEYS.bountyTx(staleTx)),
          claim({ txHash: staleTx }),
          await claimOptions(),
        ),
      "the store's own hold did not read back",
    );

    // A Solana settlement still inside the finality window.
    const solanaWorld = unfinalSolanaWorld();
    vi.stubGlobal("fetch", solanaWorld);
    const solanaBounty = await openBounty(
      testEnv,
      { targetUrl: SOL_DOOR_URL, rewardUsd: 0.1 },
      { fetch: solanaWorld },
    );
    await drive(
      async () =>
        claimBounty(
          testEnv,
          {
            bountyId: solanaBounty.bounty_id,
            txHash: SOL_SIG,
            payer: SOL_BUYER,
            payoutTo: PAYOUT_TO,
          },
          { signer: await fieldSignerFromKey(TEST_FIELD_KEY), fetch: solanaWorld },
        ),
      "the Solana settlement is inside the finality window",
    );

    // Then the states a listing passes through: paid, replayed, expired.
    vi.stubGlobal("fetch", world());
    await claimBounty(testEnv, claim(), await claimOptions());
    await drive(
      async () =>
        claimBounty(testEnv, claim({ txHash: `0x${"dd".repeat(32)}` }), await claimOptions()),
      "the bounty is already paid",
    );
    await clearBoardStatusOpen(bounty.bounty_id);
    await drive(
      async () => claimBounty(testEnv, claim(), await claimOptions()),
      "that settlement was already claimed",
    );
    const stored = await testEnv.COUNTERS.get<Record<string, unknown>>(
      KV_KEYS.bounty(bounty.bounty_id),
      "json",
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.bounty(bounty.bounty_id),
      JSON.stringify({ ...stored, status: "open", expires_at: "2026-08-27T00:00:00.000Z" }),
    );
    await drive(
      async () =>
        claimBounty(testEnv, claim({ txHash: `0x${"ef".repeat(32)}` }), await claimOptions()),
      "the bounty expired unclaimed",
    );
    return said;
  }

  it("every published row matches a refusal the door actually produced", async () => {
    const said = await refusalsFromTheDoor();
    for (const row of BOUNTY_REFUSAL_CATALOGUE) {
      expect(
        said.some((message) => row.matches.test(message)),
        `the board publishes a refusal the door no longer says: "${row.check}" (${row.matches})\nwhat the door said:\n${said.join("\n")}`,
      ).toBe(true);
    }
  });

  it("publishes the catalogue as prose, with no regexes on the wire", async () => {
    expect(BOUNTY_REFUSALS).toHaveLength(BOUNTY_REFUSAL_CATALOGUE.length);
    expect(JSON.stringify(BOUNTY_REFUSALS)).not.toContain("{}");
    for (const row of BOUNTY_REFUSALS) {
      expect(row.check.length, row.check).toBeGreaterThan(0);
      expect(row.refused_when.length, row.check).toBeGreaterThan(0);
      expect(row.then_what.length, row.check).toBeGreaterThan(0);
    }
  });
});

/**
 * WHAT A WALKER READS BEFORE THEY SPEND (2026-09-08). The checklist,
 * the worked walk and the refusal catalogue are one set of strings
 * served by three faces — the room, the JSON board, and the claim
 * door's own GET, which is the last thing an agent reads before it
 * POSTs. A face that serves fewer of them is describing a board this
 * store does not run, which is the exact defect the expiry correction
 * was written about.
 */
describe("the board's instructions, on every face", () => {
  it("the JSON board carries the checklist, the walk and the refusals", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      before_you_walk: string[];
      a_walk_end_to_end: { note: string; steps: Array<{ step: string; shell?: string; note: string }> };
      why_a_claim_is_refused: Array<{ check: string; refused_when: string; then_what: string }>;
    };
    expect(board.before_you_walk.length).toBeGreaterThan(3);
    expect(board.before_you_walk.join(" ")).toContain("payouts_enabled");
    expect(board.why_a_claim_is_refused).toHaveLength(BOUNTY_REFUSAL_CATALOGUE.length);
    expect(board.a_walk_end_to_end.steps).toHaveLength(4);
    // The redemption is the step nobody has done before, so it is the
    // one the worked walk must actually spell out.
    expect(JSON.stringify(board.a_walk_end_to_end)).toContain(
      "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
    );
    expect(JSON.stringify(board.a_walk_end_to_end)).toContain(BASE_USDC);
    expect(JSON.stringify(board.a_walk_end_to_end)).toContain("/api/bounty-claim");
  });

  it("the room prints the same words, escaped", async () => {
    const room = await (
      await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })
    ).text();
    expect(room).toContain("Before you spend your own money");
    expect(room).toContain("Why a claim is refused");
    expect(room).toContain("A walk, end to end");
    for (const row of BOUNTY_REFUSALS) {
      expect(room, row.check).toContain(escapeHtml(row.check));
      expect(room, row.check).toContain(escapeHtml(row.then_what));
    }
    expect(room).toContain(escapeHtml(`cast send ${BASE_USDC} \\`));
    // The shape of the two new blocks, not just their words: one
    // refusal row per published row plus the header, and a command
    // block for each step of the walk that has a command.
    const refusalTable = room.slice(
      room.indexOf("Why a claim is refused"),
      room.indexOf("The rules, in full"),
    );
    expect(refusalTable.split("<tr>").length - 1).toBe(BOUNTY_REFUSALS.length + 1);
    const walkSection = room.slice(
      room.indexOf("A walk, end to end"),
      room.indexOf("Why a claim is refused"),
    );
    expect(walkSection.split("<h3>").length - 1).toBe(4);
    expect(walkSection.split('<pre class="menu-desc">').length - 1).toBe(3);
  });

  it("the claim door tells an agent how it will refuse, before it POSTs", async () => {
    const door = (await (await SELF.fetch(`${BASE}/api/bounty-claim`)).json()) as {
      this_door_takes: string;
      before_you_walk: string[];
      why_a_claim_is_refused: Array<{ check: string }>;
      a_walk_end_to_end: { steps: unknown[] };
    };
    expect(door.this_door_takes).toBe("POST");
    expect(door.why_a_claim_is_refused).toHaveLength(BOUNTY_REFUSAL_CATALOGUE.length);
    expect(door.before_you_walk.length).toBeGreaterThan(3);
    expect(door.a_walk_end_to_end.steps).toHaveLength(4);
  });
});
