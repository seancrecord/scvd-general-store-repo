import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { getSpentNonce } from "@/lib/replay-guard";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import {
  installMultiPurchaseFacilitatorMock,
} from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let facilitator: ReturnType<typeof installMultiPurchaseFacilitatorMock>;
beforeAll(() => {
  facilitator = installMultiPurchaseFacilitatorMock();
});

/**
 * THE NONCE NAMES WHAT SPENT IT — ON EVERY LANE (task #85; the class
 * SolomonisBlack named during the GVP collaboration, registered in
 * the vocabulary as nonce-unbound-from-settlement).
 *
 * A till that marks a nonce spent without recording WHICH settlement
 * spent it can say "spent" but never prove what spent it. The buyer
 * who paid and lost the response becomes indistinguishable from the
 * buyer who never paid: honest recovery and fraud look identical,
 * and the paid-retry lane — deliver again for the SAME settlement,
 * charge nothing — has nothing to stand on.
 *
 * The HTTP door has bound the transaction to the spent-nonce row
 * since the paid-retry lane shipped. The MCP door — CV's live
 * reproduction, 2026-08-26 — did not: recordSpentNonce was called
 * without the transaction argument. Same fix that looks shared and
 * isn't, third time this month. This spec pins BOTH lanes so the
 * asymmetry class itself dies, not just today's instance.
 */

function nonceHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("the spent-nonce row names the settlement, both doors", () => {
  it("HTTP lane: the row carries the transaction (the standing behaviour, pinned)", async () => {
    const challenge = decodePaymentRequired(
      await SELF.fetch(`${BASE}/api/buy/hello`),
    );
    const nonce = nonceHex();
    const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!, nonce),
      },
    });
    expect(response.status).toBe(200);

    const record = await getSpentNonce(testEnv, nonce);
    expect(record).not.toBeNull();
    expect(facilitator.settledTransactions.at(-1)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(record!.transaction).toBe(facilitator.settledTransactions.at(-1));
  });

  it("MCP lane: the same row carries the same transaction (CV's gap, closed)", async () => {
    const challenge = decodePaymentRequired(
      await SELF.fetch(`${BASE}/api/buy/hello`),
    );
    const nonce = nonceHex();
    const payment = JSON.parse(
      atob(buildPaymentSignature(challenge.accepts[0]!, nonce)),
    ) as Record<string, unknown>;

    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "buy_signed_record",
          arguments: { item_id: "hello" },
          _meta: { "x402/payment": payment },
        },
      }),
    });
    const body = (await response.json()) as {
      result?: { isError?: boolean };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.result?.isError ?? false).toBe(false);

    /*
     * THE RED LINE. Before the fix this record existed — the nonce
     * was marked spent, replay refused — but carried no transaction.
     * "Spent by something" is exactly the answer the class forbids.
     */
    const record = await getSpentNonce(testEnv, nonce);
    expect(record).not.toBeNull();
    expect(facilitator.settledTransactions.at(-1)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(record!.transaction).toBe(facilitator.settledTransactions.at(-1));
  });

  it("UCP lane: a third door that settles binds its nonce the same way (no fourth instance)", async () => {
    /*
     * The lane that would otherwise be the next fix-that-looks-shared-
     * and-isn't. A UCP Complete settles through the same resource
     * server as the other two doors, so the row it leaves must name
     * its settlement exactly as theirs do — written by the resolver
     * right after the purchase is marked settled, which is where the
     * other doors write it too.
     */
    const { admitUcpCompletion } = await import("@/services/ucp-admission");
    const { walkToSettlementBoundary } = await import("@/services/ucp-settlement-boundary");
    const { realSettlementProducer } = await import("@/services/ucp-settlement-producer");
    const { variantGid } = await import("@/lib/ucp/ids");
    const { TEST_PAYER } = await import("./helpers/facilitator-mock");

    const created = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }] }),
    });
    expect(created.status).toBe(201);
    const checkout = (await created.json()) as { id: string };
    const nonce = nonceHex();
    const credential = {
      x402Version: 2,
      payload: {
        signature: `0x${"1".repeat(130)}`,
        authorization: {
          from: TEST_PAYER,
          to: "0x1111111111111111111111111111111111111111",
          value: "500000",
          validAfter: "0",
          validBefore: "99999999999",
          nonce,
        },
      },
    };
    const admitted = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential,
      verify: async () => ({ isValid: true, payer: TEST_PAYER }),
    });
    expect(admitted.ok, admitted.ok ? "" : admitted.detail).toBe(true);
    const settled = await walkToSettlementBoundary(testEnv, {
      checkoutId: checkout.id,
      produce: realSettlementProducer(testEnv, { credential }),
    });
    expect(settled.ok, settled.ok ? "" : settled.detail).toBe(true);
    if (settled.ok) expect(settled.resolution?.money).toBe("settled");

    const record = await getSpentNonce(testEnv, nonce);
    expect(record).not.toBeNull();
    expect(facilitator.settledTransactions.at(-1)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(record!.transaction).toBe(facilitator.settledTransactions.at(-1));
    expect(record!.path).toBe(`/ucp/v1/checkout-sessions/${checkout.id}`);
  });
});
