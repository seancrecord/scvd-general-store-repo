import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import {
  CREDIT_CAP_ATOMIC,
  CREDIT_RATE,
  accrueCredit,
  creditOutstandingAtomic,
  getCredit,
  redeemCredit,
  usd,
} from "@/services/store-credit";
import { fieldSignerFromKey } from "@/services/launch-check";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_USDC } from "@/lib/base-rpc";
import type { Env } from "@/types";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
/** hardhat account #1 again — a throwaway whose ADDRESS is the regular. */
const REGULAR_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const REGULAR = privateKeyToAccount(REGULAR_KEY);
/** CV's declared field wallet — a house wallet by the published list. */
const HOUSE_WALLET = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";

const clearScreen = async () => ({ listed: false as const, source: "test screen" });

beforeAll(() => {
  installFacilitatorMock();
});

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: "credit" });
  for (const key of listed.keys) {
    await testEnv.COUNTERS.delete(key.name);
  }
});

describe("accrual — the wallet is the loyalty card", () => {
  it("banks the rate in atomic units, dust included, and moves the aggregate", async () => {
    const first = await accrueCredit(testEnv, REGULAR.address, 0.004);
    // 5% of $0.004 is 200 atomic units — integer money, no float shave.
    expect(first?.earned_usd).toBe(0.0002);
    const second = await accrueCredit(testEnv, REGULAR.address, 5);
    expect(second?.earned_usd).toBe(0.25);
    expect(second?.balance_usd).toBeCloseTo(0.2502, 6);
    expect(usd(await creditOutstandingAtomic(testEnv))).toBeCloseTo(0.2502, 6);
    expect(second?.note).toContain("closed-loop rebate");
  });

  it("house wallets never accrue — the store does not tip itself", async () => {
    expect(await accrueCredit(testEnv, HOUSE_WALLET, 10)).toBeNull();
    expect(await accrueCredit(testEnv, "", 10)).toBeNull();
    expect(await accrueCredit(testEnv, REGULAR.address, 0)).toBeNull();
  });

  it("the per-wallet cap bounds the liability, partial fill stated", async () => {
    // One giant purchase would earn over the cap; only the cap fits.
    const result = await accrueCredit(testEnv, REGULAR.address, 10_000);
    expect(result?.balance_usd).toBe(usd(CREDIT_CAP_ATOMIC));
    expect(await accrueCredit(testEnv, REGULAR.address, 5)).toBeNull();
  });

  it("an idle balance expires in writing, aggregate included", async () => {
    await accrueCredit(
      testEnv,
      REGULAR.address,
      10,
      new Date(Date.now() - 91 * 24 * 3600 * 1000),
    );
    const record = await getCredit(testEnv, REGULAR.address);
    expect(record.balance_atomic).toBe("0");
    expect(usd(BigInt(record.expired_total_atomic))).toBe(10 * CREDIT_RATE);
    expect(await creditOutstandingAtomic(testEnv)).toBe(0n);
  });

  it("a real purchase carries the balance on its receipt", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(
          required.accepts[0] as never,
        ),
      },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    // The facilitator mock's payer is not a house wallet, so the
    // rebate rides the response — the loyalty psychology surface.
    expect(body.store_credit).toBeTruthy();
    expect(body.store_credit.earned_usd).toBeGreaterThan(0);
    expect(body.store_credit.balance_usd).toBeGreaterThanOrEqual(
      body.store_credit.earned_usd,
    );
    const lookup = (await (
      await SELF.fetch(`${BASE}/api/credit/${TEST_PAYER}`)
    ).json()) as Record<string, any>;
    expect(lookup.balance_usd).toBe(body.store_credit.balance_usd);
    expect(lookup.what_this_is).toContain("CLOSED-LOOP REBATE");
    expect(typeof lookup.outstanding_all_wallets_usd).toBe("number");
  });
});

describe("cash-out — proven wallet, payable only to itself", () => {
  it("floor first: a small balance is told to keep shopping", async () => {
    await accrueCredit(testEnv, REGULAR.address, 5); // $0.25
    await expect(
      redeemCredit(testEnv, REGULAR.address, {
        signer: await fieldSignerFromKey(REGULAR_KEY),
        screen: clearScreen,
      }),
    ).rejects.toThrow(/floor/);
  });

  it("the full flow: challenge, personal_sign, authorization to the earning wallet only", async () => {
    await accrueCredit(testEnv, REGULAR.address, 30); // $1.50
    const challengeResponse = (await (
      await SELF.fetch(`${BASE}/api/credit/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: REGULAR.address }),
      })
    ).json()) as { challenge: string };
    const signature = await REGULAR.signMessage({
      message: challengeResponse.challenge,
    });
    // The route needs the redeem seams; call the service the way the
    // route does after recovery, with a test signer for the payout.
    const kvNonce = await testEnv.COUNTERS.get(
      KV_KEYS.creditChallenge(REGULAR.address.toLowerCase()),
    );
    expect(kvNonce).toBeTruthy();
    expect(signature.startsWith("0x")).toBe(true);
    const result = await redeemCredit(testEnv, REGULAR.address, {
      signer: await fieldSignerFromKey(REGULAR_KEY),
      screen: clearScreen,
    });
    expect(result.redeemed_usd).toBe(1.5);
    expect(result.payout.authorization.to.toLowerCase()).toBe(
      REGULAR.address.toLowerCase(),
    );
    // The signature is real money: recover it under USDC's own domain.
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
    expect(recovered.toLowerCase()).toBe(REGULAR.address.toLowerCase());
    // Spent means spent: balance zero, totals moved, aggregate down.
    const after = await getCredit(testEnv, REGULAR.address);
    expect(after.balance_atomic).toBe("0");
    expect(usd(BigInt(after.redeemed_total_atomic))).toBe(1.5);
    expect(await creditOutstandingAtomic(testEnv)).toBe(0n);
  });

  it("the redeem route refuses a signature from the wrong wallet", async () => {
    await accrueCredit(testEnv, REGULAR.address, 30);
    const challengeResponse = (await (
      await SELF.fetch(`${BASE}/api/credit/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: REGULAR.address }),
      })
    ).json()) as { challenge: string };
    const stranger = privateKeyToAccount(
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    );
    const signature = await stranger.signMessage({
      message: challengeResponse.challenge,
    });
    const response = await SELF.fetch(`${BASE}/api/credit/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: REGULAR.address, signature }),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain(
      "different wallet",
    );
  });

  it("screening fails closed and the balance is untouched", async () => {
    await accrueCredit(testEnv, REGULAR.address, 30);
    await expect(
      redeemCredit(testEnv, REGULAR.address, {
        signer: await fieldSignerFromKey(REGULAR_KEY),
        screen: async () => ({ listed: null, source: "screen down" }),
      }),
    ).rejects.toThrow(/fails closed/);
    const record = await getCredit(testEnv, REGULAR.address);
    expect(usd(BigInt(record.balance_atomic))).toBe(1.5);
  });
});

/**
 * ONE BALANCE, ONE PAYOUT — found 2026-08-25 by a review pass, and
 * measured before it was fixed.
 *
 * `redeemCredit` used to read the balance, sign an EIP-3009
 * authorization for it, and only THEN write the record back to zero.
 * Three concurrent redemptions of one $2 balance each read $2 and each
 * came back with a signed authorization carrying a DISTINCT nonce — so
 * the USDC contract's own replay protection accepts all three and the
 * field wallet pays three times the debt. Measured: $6 authorized
 * against $2 owed.
 *
 * The single-use challenge in front of the route is not a mutex: it is
 * a KV get-then-delete, and a delete is not globally visible for up to
 * a minute, so two edges both see the nonce.
 *
 * The balance itself is the mutex now. This test is the proof: revert
 * the claim-before-signing block in store-credit.ts and it goes red
 * with three payouts instead of one.
 */
describe("a balance can only be spent once", () => {
  it("gives exactly one signed payout to concurrent redemptions", async () => {
    await accrueCredit(testEnv, REGULAR.address, 40); // $2.00
    const before = await getCredit(testEnv, REGULAR.address, new Date());
    expect(before.balance_atomic).toBe("2000000");

    const signer = await fieldSignerFromKey(REGULAR_KEY);
    const attempts = await Promise.allSettled(
      [0, 1, 2].map(() =>
        redeemCredit(testEnv, REGULAR.address, { signer, screen: clearScreen }),
      ),
    );

    const paid = attempts.filter((a) => a.status === "fulfilled");
    expect(
      paid.length,
      "more than one redemption produced a signed authorization",
    ).toBe(1);

    // The one that won paid the whole balance, and no more.
    const won = paid[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof redeemCredit>>
    >;
    expect(won.value.redeemed_usd).toBe(2);
    expect(won.value.payout.authorization.value).toBe("2000000");

    // The losers refused in words a caller can act on, and signed nothing.
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") continue;
      expect(String(attempt.reason)).toMatch(/claimed this balance first/);
    }

    const after = await getCredit(testEnv, REGULAR.address, new Date());
    expect(after.balance_atomic).toBe("0");
    expect(after.redeemed_total_atomic).toBe("2000000");
  });
});
