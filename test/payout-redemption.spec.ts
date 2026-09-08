import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_USDC } from "@/lib/base-rpc";
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
 * say "still redeemable" of every live payout regardless. A redeemed
 * payout stops counting as a promise.
 *
 * HOW THE QUESTION IS ASKED, REWRITTEN 2026-09-08. It used to scan
 * AuthorizationUsed logs from the bounty's opening block to the head.
 * That range grows all week, and on 09-08 four bounties opened on
 * 09-01 each asked for ~300,000 blocks in one call — refused by every
 * endpoint, nine attempts, "unknown" on the desk while two of the four
 * had really been redeemed and $0.50 had really left the wallet. The
 * question now goes to the token's own state: one eth_call, no range
 * to be capped. The test below fails if a block range ever comes
 * back — that is the defect, not an implementation detail.
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
      params: [{ to?: string; data?: string }, string];
    };
    /*
     * NO LOG SCAN, AND THE ASSERTION IS THE POINT. A reading that
     * needs a block range is a reading that goes blind the week the
     * range outgrows what an endpoint will serve.
     */
    expect(body.method, "the redemption reading asked for a log range again").toBe("eth_call");
    const call = body.params[0];
    expect(call.to?.toLowerCase()).toBe(BASE_USDC.toLowerCase());
    // authorizationState(address,bytes32): selector, authorizer, nonce.
    expect(call.data?.slice(0, 10)).toBe("0xe94a0102");
    expect(call.data?.slice(10, 74)).toBe(
      FIELD.slice(2).toLowerCase().padStart(64, "0"),
    );
    const nonce = `0x${call.data?.slice(74)}`;
    const burned = nonce === NONCE_A;
    return new Response(
      JSON.stringify({
        result: `0x${(burned ? 1 : 0).toString(16).padStart(64, "0")}`,
      }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("whether a signed payout was redeemed is read off the chain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the token for authorizationState(field wallet, nonce) and reads the answer", async () => {
    vi.stubGlobal("fetch", chain());
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: KEY } as Env,
      [paid("bty_a", NONCE_A), paid("bty_b", NONCE_B)],
    );
    expect(redemptions["bty_a"]).toEqual({ state: "redeemed" });
    expect(redemptions["bty_b"]).toEqual({ state: "unredeemed" });
  });

  /**
   * THE DEFECT ITSELF, DATED. A bounty opened a week before the read
   * used to make the reading ask for the whole week of blocks at once.
   * The reading must not care how old the bounty is.
   */
  it("reads a week-old bounty with the same single call as a fresh one", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      return chain()(input, init);
    }) as typeof fetch);
    const ancient = paid("bty_old", NONCE_A);
    ancient.opened_block = 1; // a week and 300,000 blocks ago
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: KEY } as Env,
      [ancient],
    );
    expect(redemptions["bty_old"]).toEqual({ state: "redeemed" });
    expect(calls, "one payout, one call — no head read, no range walk").toBe(1);
  });

  /**
   * A NODE THAT ANSWERS NONSENSE IS NOT A NODE THAT ANSWERS "NO". The
   * wallet cover counts unknown payouts as still owed; reading an
   * unparseable word as false would quietly drop a real liability.
   */
  it("an unreadable answer is unknown, not unredeemed", async () => {
    vi.stubGlobal("fetch", (async () =>
      new Response(JSON.stringify({ result: "" }), { status: 200 })) as typeof fetch);
    const redemptions = await payoutRedemptions(
      { ...testEnv, FIELD_WALLET_KEY: KEY } as Env,
      [paid("bty_a", NONCE_A)],
    );
    expect(redemptions["bty_a"]?.state).toBe("unknown");
  });

  it("a redeemed payout is money gone, not money promised", () => {
    const bounties = [paid("bty_a", NONCE_A), paid("bty_b", NONCE_B)];
    const redemptions = {
      bty_a: { state: "redeemed" as const },
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
    // Every entry must be "unknown" — never "unredeemed", which would
    // read as money the store no longer owes.
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
