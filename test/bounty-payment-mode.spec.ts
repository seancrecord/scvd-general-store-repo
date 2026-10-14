import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_EVM, POLYGON_EVM } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import { bountyBoard, claimBounty, openBounty } from "@/services/bounty-board";
import { BOUNTY_WITHDRAWALS } from "@/store/bounty-withdrawals";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const DOOR = "https://payment-mode.example/rpc";
const PAY_TO = "0x1111111111111111111111111111111111111111";
const GATEWAY = "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE";
const NOW = new Date("2026-10-13T14:09:00.000Z");
const ordinary = {
  scheme: "exact", network: BASE_EVM.caip2, asset: BASE_EVM.usdc,
  amount: "1000", payTo: PAY_TO,
  extra: { name: "USD Coin", version: "2" },
};
const gateway = {
  ...ordinary, amount: "100",
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY },
};

async function clearBoard() {
  const keys = await testEnv.COUNTERS.list({ prefix: KV_KEYS.bountyPrefix });
  await Promise.all(keys.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
}
beforeEach(clearBoard);
afterEach(async () => { await clearBoard(); vi.unstubAllGlobals(); });

function world(accepts: unknown[], header = true): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (String(input) === DOOR) {
      const challenge = JSON.stringify({ x402Version: 2, accepts });
      return new Response(header ? "{}" : challenge, {
        status: 402,
        headers: header ? { "PAYMENT-REQUIRED": btoa(challenge) } : {},
      });
    }
    return Response.json({ result: "0x800000" });
  }) as typeof fetch;
}

async function post(accepts: unknown[], rail?: string, header = true) {
  const fetch = world(accepts, header);
  vi.stubGlobal("fetch", fetch);
  return openBounty(testEnv, { targetUrl: DOOR, rewardUsd: 0.1, rail }, { fetch, now: NOW });
}

describe("bounties select the payment mode the claim verifier can read", () => {
  it.each([true, false])("captures ordinary USDC instead of cheaper Gateway (header=%s)", async (header) => {
    const bounty = await post([gateway, ordinary], undefined, header);
    expect(bounty.amount_atomic).toBe(ordinary.amount);
    expect(bounty.amount_usd).toBe(0.001);
    expect(bounty.network).toBe(BASE_EVM.caip2);
  });

  it.each([undefined, "base"])("refuses Gateway-only offers without writing a listing (rail=%s)", async (rail) => {
    await expect(post([gateway], rail)).rejects.toThrow(/transfer|payment mode/i);
    expect((await bountyBoard(testEnv, NOW)).bounties).toEqual([]);
  });

  it.each([
    { name: "GatewayWalletBatched", version: "1" },
    { name: "AnotherBatchedWallet", version: "1", verifyingContract: GATEWAY },
    { name: "USD Coin", version: "2", verifyingContract: GATEWAY },
    { name: "USD Coin", version: "2", assetTransferMethod: "unknown-batched-method" },
    { name: "USD Coin", version: "2", assetTransferMethod: 42 },
    "not an object",
  ])("skips an incompatible declared payment mode: %j", async (extra) => {
    const bounty = await post([{ ...ordinary, amount: "100", extra }, ordinary]);
    expect(bounty.amount_atomic).toBe(ordinary.amount);
  });

  it("filters a cheaper wrong asset before choosing ordinary USDC", async () => {
    const bounty = await post([{ ...ordinary, asset: PAY_TO, amount: "1" }, ordinary]);
    expect(bounty.amount_atomic).toBe(ordinary.amount);
  });

  it("does not switch rails when the requested rail only offers Gateway", async () => {
    await expect(post([
      gateway,
      { ...ordinary, network: POLYGON_EVM.caip2, asset: POLYGON_EVM.usdc },
    ], "base")).rejects.toThrow(/transfer|payment mode/i);
  });

  it("preserves ordinary legacy quotes with no optional payment metadata", async () => {
    const { extra: _extra, ...legacy } = ordinary;
    expect((await post([legacy])).amount_atomic).toBe(ordinary.amount);
  });

  it("accepts an explicitly declared token contract and ordinary transfer method", async () => {
    const bounty = await post([{ ...ordinary, extra: {
      ...ordinary.extra, verifyingContract: BASE_EVM.usdc.toUpperCase().replace("0X", "0x"),
      assetTransferMethod: "eip3009",
    } }]);
    expect(bounty.amount_atomic).toBe(ordinary.amount);
  });

  it("withdraws the affected listing across public surfaces and claims without rewriting its terms", async () => {
    const bounty = await post([ordinary]);
    await testEnv.COUNTERS.delete(KV_KEYS.bounty(bounty.bounty_id));
    const bountyId = Object.keys(BOUNTY_WITHDRAWALS)[0]!;
    const original = { ...bounty, bounty_id: bountyId, amount_atomic: gateway.amount, amount_usd: 0.0001 };
    await testEnv.COUNTERS.put(KV_KEYS.bounty(bountyId), JSON.stringify(original));

    const board = await bountyBoard(testEnv, NOW);
    expect(board.open_count).toBe(0);
    expect(board.bounties[0]).toMatchObject({
      status: "withdrawn", amount_atomic: gateway.amount,
      withdrawal: BOUNTY_WITHDRAWALS[bountyId],
    });
    const publicBoard = await SELF.fetch("https://scvd.store/api/bounties");
    expect(await publicBoard.text()).toContain('"status":"withdrawn"');
    const room = await SELF.fetch("https://scvd.store/bounties", { headers: { Accept: "text/html" } });
    expect(await room.text()).toContain("Withdrawn listings");
    const raw = await testEnv.COUNTERS.get(KV_KEYS.bounty(bountyId), "json");
    expect(raw).toEqual(original);

    const signTypedData = vi.fn();
    await expect(claimBounty(testEnv, {
      bountyId, txHash: `0x${"ab".repeat(32)}`, payer: PAY_TO, payoutTo: PAY_TO,
    }, {
      now: NOW, signer: { address: PAY_TO, signTypedData },
    })).rejects.toThrow(/withdrawn.*not open/);
    expect(signTypedData).not.toHaveBeenCalled();

    // Reposting captures fresh terms under a new id; old terms stay readable.
    const replacement = await post([gateway, ordinary]);
    expect(replacement.bounty_id).not.toBe(bountyId);
    expect(replacement.amount_atomic).toBe(ordinary.amount);
  });

  it("preserves a paid historical claim even when its listing is withdrawn", async () => {
    const bounty = await post([ordinary]);
    await testEnv.COUNTERS.delete(KV_KEYS.bounty(bounty.bounty_id));
    const bountyId = Object.keys(BOUNTY_WITHDRAWALS)[0]!;
    await testEnv.COUNTERS.put(KV_KEYS.bounty(bountyId), JSON.stringify({
      ...bounty, bounty_id: bountyId, status: "paid",
    }));
    expect((await bountyBoard(testEnv, NOW)).bounties[0]?.status).toBe("paid");
  });
});
