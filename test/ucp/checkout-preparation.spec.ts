import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import {
  preparesBeforeAdmission,
  purchasePreparation,
} from "@/services/purchase-preparation";
import { variantGid } from "@/lib/ucp/ids";
import { getMenuItem, MENU_ITEMS } from "@/store/menu";
import { supportsObservationRecovery } from "@/lib/artifact-checkpoint";
import type { PreparedObservation } from "@/services/purchase-observation";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = "0x2222222222222222222222222222222222222222";

function credential(nonce: string, value: string) {
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

/** A signed observation, as far as this increment is concerned. */
const goods = (attests: string): PreparedObservation => ({ attests });

async function openCheckout(body: unknown) {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, any>;
}

const AUDIT = {
  line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
  "store.scvd": { inputs: { url: "https://example.test/pay" } },
};
const HELLO = { line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }] };

const read = (id: string) => ucpCheckoutStore(testEnv, id).readUcpCheckout();

/**
 * TWO ORDERINGS, CHOSEN BY THE PRODUCT, NOT BY THE PROTOCOL.
 *
 *   after_admission   verify -> own -> prepare
 *   before_admission  verify -> prepare -> checkpoint -> own
 *
 * The second exists because the shared purchase admission refuses
 * ownership for goods that are fully prepared before settlement unless
 * the prepared observation is already retained. That is a house
 * invariant; UCP asks which ordering applies and is told.
 */
describe("the product decides the ordering, and the adapter never keeps the list", () => {
  it("answers from the store's own definition rather than a copy of it", () => {
    for (const item of MENU_ITEMS) {
      expect(preparesBeforeAdmission(item), item.id).toBe(
        supportsObservationRecovery(item),
      );
    }
    // And the shelf really does contain both kinds.
    const before = MENU_ITEMS.filter(preparesBeforeAdmission);
    expect(before.length).toBeGreaterThan(10);
    expect(before.length).toBeLessThan(MENU_ITEMS.length);
  });

  it("hands back a journal only for goods that need one first", () => {
    const digest = "a".repeat(64);
    expect(
      purchasePreparation(testEnv, getMenuItem("hello"), "b".repeat(64), "/p", digest).mode,
    ).toBe("after_admission");
    const audit = purchasePreparation(
      testEnv,
      getMenuItem("service_audit"),
      "b".repeat(64),
      "/p",
      digest,
    );
    expect(audit.mode).toBe("before_admission");
    expect(audit.checkpoint).toBeDefined();
  });
});

describe("goods that must exist before anyone owns the payment for them", () => {
  it("prepares, retains, and only then takes ownership", async () => {
    const checkout = await openCheckout(AUDIT);
    const prepare = vi.fn(async () => goods("one audit"));
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a1".repeat(32), "5000000"),
      verify: accepts(),
      prepare,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.prepared).toBe("made");
    expect(prepare).toHaveBeenCalledOnce();
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("never repeats the work on an identical retry", async () => {
    const checkout = await openCheckout(AUDIT);
    const nonce = "a2".repeat(32);
    const prepare = vi.fn(async () => goods("one audit"));
    await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "5000000"),
      verify: accepts(),
      prepare,
    });
    const second = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "5000000"),
      verify: accepts(),
      prepare,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.prepared).toBe("reused");
    // A prepared observation is an artifact, not a cache: regenerating
    // it would throw away bytes the buyer is already owed, and may cost
    // a second real payment at somebody else's door.
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("takes no ownership when the goods cannot be made", async () => {
    const checkout = await openCheckout(AUDIT);
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a3".repeat(32), "5000000"),
      verify: accepts(),
      prepare: async () => {
        throw new Error("the endpoint never answered");
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("preparation_failed");
      expect(outcome.detail).toContain("never answered");
    }
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("takes no ownership when the goods were made but could not be retained", async () => {
    const checkout = await openCheckout(AUDIT);
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a4".repeat(32), "5000000"),
      verify: accepts(),
      prepare: async (checkpoint) => {
        // The journal refuses the write, the way a storage outage does.
        checkpoint.save = async () => {
          throw new Error("journal unavailable");
        };
        return goods("one audit");
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("preparation_unavailable");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("runs the store's real producer when nothing is injected", async () => {
    /*
     * No preparer supplied, so the seam falls through to
     * prepareThroughFulfillment — the store's own fulfillment path with
     * a settle that refuses. The audit's target does not answer in a
     * test isolate, and that is not a failure: a network failure
     * becomes a signed did-not-answer, because a dated
     * did-not-answer is itself the observation.
     */
    const checkout = await openCheckout(AUDIT);
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a5".repeat(32), "5000000"),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.prepared).toBe("made");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("journals the real signed artifact, not a placeholder", async () => {
    const checkout = await openCheckout(AUDIT);
    const nonce = "a9".repeat(32);
    await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "5000000"),
      verify: accepts(),
    });
    const { settlementPurchaseIdentity } = await import("@/lib/purchase-payment");
    const { id } = await settlementPurchaseIdentity(
      "eip155:8453",
      PAYER,
      `0x${nonce}`,
      "authorization",
    );
    const { purchaseRequestDigest } = await import("@/services/purchase-intent");
    const { completionRequest } = await import("@/lib/ucp/checkout/completion");
    const stored = await read(checkout.id);
    const digest = await purchaseRequestDigest(
      testEnv,
      "ucp",
      `/ucp/v1/checkout-sessions/${checkout.id}`,
      completionRequest({ ...stored!, version: stored!.completion!.checkout_version }),
    );
    const ordering = purchasePreparation(
      testEnv,
      getMenuItem("service_audit"),
      id,
      `/ucp/v1/checkout-sessions/${checkout.id}`,
      digest,
    );
    const retained = await ordering.checkpoint!.read();
    // The store's own signed audit, with the evidence hash the
    // certificate would bind — not a stub this test invented.
    expect(retained?.serviceAudit).toBeDefined();
    expect(retained?.serviceAudit?.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(retained?.attests).toBe(retained?.serviceAudit?.evidence_hash);
  });

  it("finds the checkpoint again after a death between preparing and admitting", async () => {
    const checkout = await openCheckout(AUDIT);
    const nonce = "a6".repeat(32);
    const prepare = vi.fn(async () => goods("one audit"));

    // First pass: goods made and retained, then the process dies
    // before the shared admission could be reached.
    const ordering = purchasePreparation(
      testEnv,
      getMenuItem("service_audit"),
      (await (async () => {
        const { settlementPurchaseIdentity } = await import("@/lib/purchase-payment");
        return (await settlementPurchaseIdentity("eip155:8453", PAYER, `0x${nonce}`, "authorization")).id;
      })()),
      `/ucp/v1/checkout-sessions/${checkout.id}`,
      await (async () => {
        const { purchaseRequestDigest } = await import("@/services/purchase-intent");
        const { completionRequest } = await import("@/lib/ucp/checkout/completion");
        const stored = await read(checkout.id);
        return purchaseRequestDigest(
          testEnv,
          "ucp",
          `/ucp/v1/checkout-sessions/${checkout.id}`,
          completionRequest({ ...stored! }),
        );
      })(),
    );
    expect(ordering.mode).toBe("before_admission");
    await ordering.checkpoint!.save(goods("one audit"));

    // The retry: the observation is already there, so it is reused and
    // the admission proceeds on the goods that already exist.
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "5000000"),
      verify: accepts(),
      prepare,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.prepared).toBe("reused");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not let a different credential take over prepared goods", async () => {
    const checkout = await openCheckout(AUDIT);
    const prepare = vi.fn(async () => goods("one audit"));
    await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a7".repeat(32), "5000000"),
      verify: accepts(),
      prepare,
    });
    const bound = (await read(checkout.id))?.completion?.payment_identity;

    const second = vi.fn(async () => goods("another audit"));
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("a8".repeat(32), "5000000"),
      verify: accepts(),
      prepare: second,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("wrong_state");
    // The existing binding governs, and nothing was made for the second.
    expect((await read(checkout.id))?.completion?.payment_identity).toBe(bound);
  });
});

describe("goods that follow ownership rather than precede it", () => {
  it("takes ownership without preparing anything first", async () => {
    const checkout = await openCheckout(HELLO);
    const prepare = vi.fn(async () => goods("never called"));
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("b1".repeat(32), "500000"),
      verify: accepts(),
      prepare,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.prepared).toBe("not_required");
    expect(prepare).not.toHaveBeenCalled();
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });
});

/**
 * The definition that must not weaken: complete_in_progress means this
 * completion owns the store's global durable purchase right. It does
 * not mean "we started doing work".
 */
describe("preparation never moves the checkout on its own", () => {
  it("leaves the checkout payable for as long as ownership is unowned", async () => {
    const checkout = await openCheckout(AUDIT);
    let observed: string | undefined;
    await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential("c1".repeat(32), "5000000"),
      verify: accepts(),
      prepare: async () => {
        // Mid-preparation: ownership does not exist yet, so the
        // checkout must still say it is waiting to be paid.
        observed = (await read(checkout.id))?.status;
        return goods("one audit");
      },
    });
    expect(observed).toBe("ready_for_complete");
  });
});
