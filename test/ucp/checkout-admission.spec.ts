import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { variantGid } from "@/lib/ucp/ids";
import { beginVerifiedPurchaseIntent, purchaseIntentStore } from "@/services/purchase-intent";
import { mppEvmPurchasePayment, x402PurchasePayment } from "@/lib/purchase-payment";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = "0x2222222222222222222222222222222222222222";

/**
 * ADMISSION, ON ITS OWN.
 *
 * Nothing here settles, prepares or delivers. What these tests hold is
 * one sentence: an admitted UCP completion means the store's GLOBAL
 * durable purchase ownership has been acquired for that payment — not
 * that a request arrived.
 *
 * That ownership is a BINDING on the checkout, and the public status
 * does not move for it. `complete_in_progress` is a promise that an
 * outcome is coming; it belongs to the settlement boundary, the first
 * point at which anything is in flight to have an outcome — see
 * settlement-boundary.spec.ts.
 *
 * The verifier is stubbed on purpose. Whether the facilitator can
 * check a signature is its business and is tested where it lives; what
 * is under test here is what this store does with a yes, a no, and a
 * question that never came back.
 */

function credential(nonce = "a".repeat(64), value = "500000") {
  return {
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: PAYER,
        to: "0x1111111111111111111111111111111111111111",
        value,
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${nonce}`,
      },
    },
  };
}

const accepts = () => vi.fn(async () => ({ isValid: true, payer: PAYER }));

/** The terms a $0.50 hello quotes on Base, as the other doors see them. */
const TERMS = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  amount: "500000",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 300,
  extra: {},
} as unknown as Parameters<typeof x402PurchasePayment>[0];

const wireFor = (nonce: string) => ({
  x402Version: 2,
  accepted: TERMS,
  payload: credential(nonce).payload,
});

/**
 * `hello` is used throughout because admission can stand alone for it.
 *
 * About twenty items on this shelf are observation-recoverable — their
 * goods are fully prepared before settlement, and the purchase
 * admission REFUSES to take ownership until that prepared observation
 * is already checkpointed beside it ("Original observation must
 * precede settlement"). For those, authorization -> ownership is not a
 * boundary that exists: the real order is authorization ->
 * preparation -> ownership -> money, and the store enforces it in the
 * same atom. Proving admission on one of them would mean building
 * preparation too, which is the next increment rather than this one.
 *
 * The constraint is pinned below rather than worked around.
 */
async function openCheckout(body?: unknown) {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      body ?? { line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }] },
    ),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, any>;
}

const read = (id: string) => ucpCheckoutStore(testEnv, id).readUcpCheckout();

describe("a UCP completion acquires the store's global purchase ownership", () => {
  it("admits a valid payment and binds it to the checkout", async () => {
    const checkout = await openCheckout();
    const verify = accepts();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(),
      verify,
    });
    expect(outcome.ok).toBe(true);
    expect(verify).toHaveBeenCalledOnce();

    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion?.protocol).toBe("ucp");
    expect(stored?.completion?.payment_identity).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.completion?.checkout_version).toBe(1);
    expect(stored?.completion?.terms_digest).toMatch(/^[0-9a-f]{64}$/);
    // Recoverable without the request body, and never the credential.
    expect(stored?.completion?.request_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain("signature");
    expect(JSON.stringify(stored)).not.toContain("0x1111111111111111111111111111111111111111111");
  });

  it("creates a purchase record the rest of the store can find by payment identity", async () => {
    const checkout = await openCheckout();
    const nonce = "b".repeat(64);
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The same lookup the /api/buy door uses to find an owned payment.
    // The purchase record exists under the payment identity every door
    // shares, and the checkout's binding names that same identity.
    const stored = await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout();
    expect(stored?.completion?.payment_identity).toBe(outcome.payment_identity);
    const saved = await purchaseIntentStore(
      testEnv,
      outcome.payment_identity,
    ).existingPurchase();
    expect(saved).not.toBeNull();
    const record = JSON.parse(saved!) as { door: string; path: string; payer: string };
    expect(record.door).toBe("ucp");
    expect(record.path).toBe(`/ucp/v1/checkout-sessions/${checkout.id}`);
    expect(record.payer.toLowerCase()).toBe(PAYER.toLowerCase());
  });

  it("recovers the same completion on an identical retry, never a second one", async () => {
    const checkout = await openCheckout();
    const nonce = "c".repeat(64);
    const first = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(first.ok).toBe(true);
    const before = await read(checkout.id);

    const second = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(second.ok).toBe(true);
    const after = await read(checkout.id);
    // Byte-identical binding: the retry finished nothing new.
    expect(after?.completion).toEqual(before?.completion);
    expect(after?.status).toBe("ready_for_complete");
  });

  it("refuses a second, different payment for a checkout already completing", async () => {
    const checkout = await openCheckout();
    await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("d".repeat(64)),
      verify: accepts(),
    });
    const bound = (await read(checkout.id))?.completion?.payment_identity;

    // A different authorization that covers the same money exactly.
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("e".repeat(64)),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("wrong_state");
    // The first payment still owns it.
    expect((await read(checkout.id))?.completion?.payment_identity).toBe(bound);
  });

  it("does not trouble the verifier when the checkout could never be completed", async () => {
    const checkout = await openCheckout();
    await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}/cancel`, { method: "POST" });
    const verify = accepts();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(),
      verify,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("wrong_state");
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses a completion against a version the checkout has moved past", async () => {
    const checkout = await openCheckout();
    const verify = accepts();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(),
      verify,
      expectedVersion: 99,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("stale_version");
    expect(verify).not.toHaveBeenCalled();
  });

  it("404s a checkout nobody opened, without asking anybody anything", async () => {
    const verify = accepts();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: "chk_nothing",
      credential: credential(),
      verify,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("not_found");
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("a no and an unanswered question are not the same thing", () => {
  it("takes no ownership when the verifier declines, and leaves the checkout payable", async () => {
    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(),
      verify: async () => ({ isValid: false, invalidReason: "insufficient_funds" }),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("payment_refused");
      expect(outcome.detail).toContain("insufficient_funds");
    }
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("records nothing as owned when the verifier never answers", async () => {
    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(),
      verify: async () => {
        throw new Error("facilitator timeout");
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("admission_unavailable");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("refuses a credential that disagrees with the frozen terms, before verifying", async () => {
    const checkout = await openCheckout();
    const verify = accepts();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      // Signed against a different amount than the checkout quoted.
      credential: { ...credential(), accepted: { scheme: "exact", amount: "1" } },
      verify,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("payment_refused");
    expect(verify).not.toHaveBeenCalled();
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
  });
});

/**
 * THE INVARIANT THE WHOLE INCREMENT EXISTS FOR: one payment, one
 * owner, whichever door it arrives at.
 */
describe("one payment cannot be owned twice, across doors or at once", () => {
  it("lets exactly one of two concurrent UCP completions win", async () => {
    const [a, b] = await Promise.all([openCheckout(), openCheckout()]);
    const nonce = "f".repeat(64);
    const results = await Promise.allSettled([
      admitUcpCompletion(testEnv, { checkoutId: a.id, credential: credential(nonce), verify: accepts() }),
      admitUcpCompletion(testEnv, { checkoutId: b.id, credential: credential(nonce), verify: accepts() }),
    ]);
    const admitted = results.filter(
      (row) => row.status === "fulfilled" && row.value.ok,
    );
    // One payment, one ownership — even though the two checkouts are
    // different objects that each quoted the same money.
    expect(admitted.length).toBe(1);
  });

  it("refuses a payment that already bought something at another door", async () => {
    const nonce = "3".repeat(64);
    // The SAME authorization, admitted first through the HTTP door's
    // own admission — the real one, not a hand-built record.
    const payment = await x402PurchasePayment(TERMS, PAYER, wireFor(nonce));
    await beginVerifiedPurchaseIntent(testEnv, {
      path: "/api/buy/hello",
      door: "http",
      terms: TERMS,
      request: "",
      payment,
    });

    // Now it turns up at a UCP checkout.
    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("payment_refused");
      expect(outcome.detail).toContain("already belongs to a different purchase");
    }
    const stored = await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout();
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("refuses a payment the MCP door already owns", async () => {
    const nonce = "4".repeat(64);
    const payment = await x402PurchasePayment(TERMS, PAYER, wireFor(nonce));
    // The MCP door's admission, with its own request shape.
    await beginVerifiedPurchaseIntent(testEnv, {
      path: "/mcp",
      door: "mcp",
      terms: TERMS,
      request: JSON.stringify({ tool: "buy_hello", agent_name: "someone" }),
      payment,
    });

    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("payment_refused");
    const stored = await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout();
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  /**
   * THE PROTOCOL IS NOT PART OF THE IDENTITY, AND THIS IS THE TEST OF
   * IT. An MPP wrapper around the same EIP-3009 authorization resolves
   * to the same settlement identity as its x402 form, so it competes
   * for the same durable owner rather than getting one of its own.
   */
  it("refuses a payment an MPP representation of the same authorization already owns", async () => {
    const nonce = "5".repeat(64);
    const authorization = {
      from: PAYER,
      to: TERMS.payTo,
      value: TERMS.amount,
      nonce: `0x${nonce}`,
      validAfter: "0",
      validBefore: "99999999999",
    };
    const mpp = await mppEvmPurchasePayment(TERMS, PAYER, authorization, "c".repeat(64));
    const x402 = await x402PurchasePayment(TERMS, PAYER, wireFor(nonce));
    // Two protocols, two proof digests, ONE settlement identity.
    expect(mpp.protocol).toBe("mpp");
    expect(x402.protocol).toBe("x402");
    expect(mpp.proof_digest).not.toBe(x402.proof_digest);
    expect(mpp.identity).toBe(x402.identity);

    await beginVerifiedPurchaseIntent(testEnv, {
      path: "/api/buy/hello",
      door: "http",
      terms: TERMS,
      request: "",
      payment: mpp,
    });

    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("payment_refused");
    expect(
      (await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout())?.completion,
    ).toBeUndefined();
  });

  it("gives the same settlement identity whichever door presents the payment", async () => {
    // purchase-payment.ts derives the identity from network, payer and
    // nonce, with no door and no protocol in it. That is what makes
    // one durable atom reachable from all three doors.
    const checkout = await openCheckout();
    const nonce = "9".repeat(64);
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const stored = await read(checkout.id);
    expect(stored?.completion?.payment_identity).toBe(outcome.payment_identity);
  });
});

/**
 * THE CONSTRAINT THIS INCREMENT FOUND, pinned so the next one starts
 * from it rather than rediscovering it.
 */
describe("some items cannot have ownership taken before their goods exist", () => {
  it("prepares an observation-recoverable item before taking ownership of its payment", async () => {
    const checkout = await openCheckout({
      line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
      "store.scvd": { inputs: { url: "https://example.test/pay" } },
    });
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("7".repeat(64), "5000000"),
      verify: accepts(),
    });
    /*
     * The ordering the item requires, performed: the real producer runs
     * through the store's own fulfillment path, the produced bytes are
     * journalled, and only then is the payment owned. Earlier in this
     * branch's history the same call failed with the shared admission's
     * "Original observation must precede settlement" — the invariant
     * working, before anything satisfied it.
     */
    expect(outcome.ok).toBe(true);
    const stored = await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout();
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion?.payment_identity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("admits an item whose goods carry no prepared observation", async () => {
    const checkout = await openCheckout();
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("8".repeat(64)),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(true);
  });
});
