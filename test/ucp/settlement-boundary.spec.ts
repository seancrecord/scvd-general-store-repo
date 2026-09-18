import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { purchaseIntentStore } from "@/services/purchase-intent";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { variantGid } from "@/lib/ucp/ids";
import type { SettlementSubmission } from "@/services/settlement-submission";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = "0x2222222222222222222222222222222222222222";

let seed = 0x1000;
const nextNonce = () => (++seed).toString(16).padStart(64, "0");

function credential(nonce: string, atomic: string) {
  return {
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: PAYER,
        to: "0x1111111111111111111111111111111111111111",
        value: atomic,
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${nonce}`,
      },
    },
  };
}

const accepts = () => vi.fn(async () => ({ isValid: true, payer: PAYER }));
const read = (id: string) => ucpCheckoutStore(testEnv, id).readUcpCheckout();

async function openCheckout() {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }],
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, any>;
}

/** Open a checkout and admit a payment for it. Returns both. */
async function admitted() {
  const checkout = await openCheckout();
  const nonce = nextNonce();
  const outcome = await admitUcpCompletion(testEnv, {
    checkoutId: checkout.id,
    credential: credential(nonce, "500000"),
    verify: accepts(),
  });
  expect(outcome.ok).toBe(true);
  const { id } = await settlementPurchaseIdentity(
    "eip155:8453",
    PAYER,
    `0x${nonce}`,
    "authorization",
  );
  return { checkout, nonce, identity: id };
}

/**
 * OWNERSHIP IS NOT THE PUBLIC PROMISE.
 *
 * This store never retains a payment credential, and it runs no
 * autonomous settlement worker. So a checkout that said
 * complete_in_progress the moment ownership was acquired would, on a
 * crash, leave a platform politely polling forever for an outcome
 * nobody can produce. The public state waits until something is
 * genuinely at the settlement boundary.
 */
describe("the public state says what a poller can actually rely on", () => {
  it("stays ready_for_complete after ownership alone", async () => {
    const { checkout } = await admitted();
    const stored = await read(checkout.id);
    // Owned, bound, and truthfully still waiting to be paid.
    expect(stored?.completion?.payment_identity).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.status).toBe("ready_for_complete");
  });

  it("says complete_in_progress once the payment is at the boundary", async () => {
    const { checkout } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("and the served checkout agrees with the stored one", async () => {
    const { checkout } = await admitted();
    const before = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}`)
    ).json()) as Record<string, any>;
    expect(before.status).toBe("ready_for_complete");
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    const after = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}`)
    ).json()) as Record<string, any>;
    expect(after.status).toBe("complete_in_progress");
    // complete_in_progress must not carry an order.
    expect(after.order).toBeUndefined();
  });
});

/**
 * ONE EXECUTION LEAVES THE BUILDING.
 */
describe("exactly one execution may submit a given payment", () => {
  it("gives the claim to one of two simultaneous walks", async () => {
    const { checkout } = await admitted();
    const results = await Promise.all([
      walkToSettlementBoundary(testEnv, { checkoutId: checkout.id }),
      walkToSettlementBoundary(testEnv, { checkoutId: checkout.id }),
    ]);
    const winners = results.filter((row) => row.ok);
    const losers = results.filter((row) => !row.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0]!.ok ? "" : losers[0]!.code).toBe("already_started");
  });

  it("refuses a second walk after the first, however many times it is asked", async () => {
    const { checkout } = await admitted();
    expect((await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id })).ok).toBe(true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.code).toBe("already_started");
    }
  });

  it("does not let an identical recovered completion create a second claim", async () => {
    const { checkout, nonce } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    // The lost-response retry: same credential, same everything.
    const retry = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "500000"),
      verify: accepts(),
    });
    expect(retry.ok).toBe(true);
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("already_started");
  });

  it("does not let a different credential replace the claimed payment", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    const other = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nextNonce(), "500000"),
      verify: accepts(),
    });
    expect(other.ok).toBe(false);
    // The claim still belongs to the first payment.
    const raw = await purchaseIntentStore(testEnv, identity).readSettlementSubmission();
    const submission = JSON.parse(raw!) as SettlementSubmission;
    expect(submission.purchase_id).toBe(identity);
    expect(submission.outcome).toBeUndefined();
  });

  it("cannot be claimed by an execution naming a different request", async () => {
    const { identity } = await admitted();
    const raw = await purchaseIntentStore(testEnv, identity).claimSettlementSubmission(
      JSON.stringify({
        purchase_id: identity,
        request_digest: "f".repeat(64),
        door: "http",
        claimed_at: new Date().toISOString(),
      }),
    );
    const claim = JSON.parse(raw) as { won: boolean; reason?: string };
    expect(claim.won).toBe(false);
    expect(claim.reason).toBe("wrong_request");
  });

  it("cannot be claimed against a payment nobody owns", async () => {
    const raw = await purchaseIntentStore(testEnv, "e".repeat(64)).claimSettlementSubmission(
      JSON.stringify({
        purchase_id: "e".repeat(64),
        request_digest: "a".repeat(64),
        door: "http",
        claimed_at: new Date().toISOString(),
      }),
    );
    const claim = JSON.parse(raw) as { won: boolean; reason?: string };
    expect(claim.won).toBe(false);
    expect(claim.reason).toBe("not_owned");
  });
});

/**
 * A CLAIM WHOSE EXECUTION VANISHED RESOLVES THE SAFE WAY.
 */
describe("nothing releases a claim on the strength of a clock", () => {
  it("never re-grants a claim, however long it has stood", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });

    // The execution that held it is gone. Time passes; the claim does
    // not expire, because an expiring claim is a double-submission
    // mechanism wearing a reliability costume.
    vi.setSystemTime(new Date(Date.now() + 30 * 24 * 3600 * 1000));
    try {
      const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.code).toBe("already_started");
    } finally {
      vi.useRealTimers();
    }
    const raw = await purchaseIntentStore(testEnv, identity).readSettlementSubmission();
    expect(JSON.parse(raw!).outcome).toBeUndefined();
  });

  it("keeps an unknown outcome claimed, so nobody submits to find out", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    await purchaseIntentStore(testEnv, identity).resolveSettlementSubmission(
      "unknown",
      "recon-1",
    );
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("already_resolved");
    const raw = await purchaseIntentStore(testEnv, identity).readSettlementSubmission();
    const submission = JSON.parse(raw!) as SettlementSubmission;
    expect(submission.outcome).toBe("unknown");
    expect(submission.reconciliation_reference).toBe("recon-1");
  });

  it("does not let a confirmed outcome regress on a delayed writer", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    const store = purchaseIntentStore(testEnv, identity);
    await store.resolveSettlementSubmission("confirmed");
    await store.resolveSettlementSubmission("declined");
    const submission = JSON.parse(
      (await store.readSettlementSubmission())!,
    ) as SettlementSubmission;
    expect(submission.outcome).toBe("confirmed");
  });
});

describe("the boundary refuses what has not earned the walk", () => {
  it("refuses a checkout with no admitted payment", async () => {
    const checkout = await openCheckout();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("not_admitted");
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
  });

  it("refuses a checkout nobody opened", async () => {
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: "chk_nothing" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("not_found");
  });
});
