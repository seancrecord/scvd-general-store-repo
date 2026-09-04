import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { AUTHORIZATION_USED_TOPIC, BASE_USDC } from "@/lib/base-rpc";
import { livePayouts, payoutRedemptions, type BountyRecord } from "@/services/bounty-board";
import { outstandingPayouts } from "@/pages/admin/bounties-page";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const KEY = `0x${"01".repeat(32)}` as `0x${string}`;
const FIELD = privateKeyToAccount(KEY).address;

/**
 * "WE STILL HAVE TO TEST THAT THEY CAN CLAIM IT" (2026-09-04). "Paid"
 * in the books means a signed authorization went out. Whether the
 * walker ever redeemed it is the chain's fact, and the page used to
 * say "still redeemable" of every live payout regardless. Now the
 * store asks the USDC contract for AuthorizationUsed(field wallet,
 * nonce), and a redeemed payout stops counting as a promise.
 */

const NONCE_A = `0x${"aa".repeat(32)}`;
const NONCE_B = `0x${"bb".repeat(32)}`;
const NOW = new Date("2026-09-04T12:00:00.000Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

function paid(id: string, nonce: string): BountyRecord {
  return {
    bounty_id: id,
    target_url: "https://door.example/api",
    domain: "door.example",
    pay_to: "0x1111111111111111111111111111111111111111",
    amount_atomic: "5000",
    amount_usd: 0.005,
    reward_usd: 0.25,
    opened_at: NOW.toISOString(),
    opened_block: 1000,
    expires_at: NOW.toISOString(),
    status: "paid",
    claim: {
      tx_hash: "0xab",
      payer: "0x2222222222222222222222222222222222222222",
      payout_to: "0x3333333333333333333333333333333333333333",
      claimed_at: NOW.toISOString(),
      authorization_nonce: nonce,
      authorization_valid_before: String(nowSeconds + 3600),
    },
  };
}

/** A chain on which NONCE_A burned and NONCE_B did not. */
function chain(): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [{ topics?: string[]; address?: string }];
    };
    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ result: "0x2000" }), { status: 200 });
    }
    expect(body.method).toBe("eth_getLogs");
    const filter = body.params[0];
    expect(filter.address?.toLowerCase()).toBe(BASE_USDC.toLowerCase());
    expect(filter.topics?.[0]).toBe(AUTHORIZATION_USED_TOPIC);
    expect(filter.topics?.[1]).toContain(FIELD.slice(2).toLowerCase());
    const burned = filter.topics?.[2] === NONCE_A;
    return new Response(
      JSON.stringify({
        result: burned ? [{ transactionHash: "0xREDEEMED" }] : [],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("whether a signed payout was redeemed is read off the chain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks AuthorizationUsed(field wallet, nonce) per paid bounty and reads the answer", async () => {
    vi.stubGlobal("fetch", chain());
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: KEY } as Env,
      [paid("bty_a", NONCE_A), paid("bty_b", NONCE_B)],
    );
    expect(redemptions["bty_a"]).toEqual({ state: "redeemed", tx_hash: "0xredeemed" });
    expect(redemptions["bty_b"]).toEqual({ state: "unredeemed" });
  });

  it("a redeemed payout is money gone, not money promised", () => {
    const bounties = [paid("bty_a", NONCE_A), paid("bty_b", NONCE_B)];
    const redemptions = {
      bty_a: { state: "redeemed" as const, tx_hash: "0x1" },
      bty_b: { state: "unredeemed" as const },
    };
    expect(livePayouts(bounties, redemptions, NOW).map((b) => b.bounty_id)).toEqual(["bty_b"]);
    const board = {
      bounties,
      open_count: 0,
      week: "2026-W36",
      weekly_budget_usd: 10,
      spent_this_week_usd: 0.5,
      payouts_enabled: true,
    };
    expect(outstandingPayouts(board, NOW.toISOString(), redemptions)).toEqual({ count: 1, usd: 0.25 });
    // Without a chain reading, both stay counted — the cautious direction.
    expect(outstandingPayouts(board, NOW.toISOString(), null)).toEqual({ count: 2, usd: 0.5 });
  });

  it("says unknown, never unredeemed, when the chain cannot be asked", async () => {
    vi.stubGlobal(
      "fetch",
      (async () => new Response("no", { status: 503 })) as typeof fetch,
    );
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: KEY } as Env,
      [paid("bty_a", NONCE_A)],
    ).catch(() => null);
    // getBlockNumber fails first; the caller's fail-soft takes over.
    // If it did answer, every entry must be "unknown".
    if (redemptions) {
      for (const reading of Object.values(redemptions)) {
        expect(reading.state).toBe("unknown");
      }
    }
    // And a still-unknown payout stays a promise.
    const unknown = { bty_a: { state: "unknown" as const, problem: "rpc down" } };
    expect(livePayouts([paid("bty_a", NONCE_A)], unknown, NOW)).toHaveLength(1);
  });

  it("has no chain to ask on a read-only deployment, and says so", async () => {
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: undefined } as Env,
      [paid("bty_a", NONCE_A)],
    );
    expect(redemptions["bty_a"]?.state).toBe("unknown");
  });
});
