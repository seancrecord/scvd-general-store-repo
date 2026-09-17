import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import {
  convergeSettlementRecords,
  settleClaimedSubmission,
  type SettlementResult,
  type WonClaim,
} from "@/services/ucp-settlement-resolution";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { purchaseIntentStore, purchaseRequestDigest, type PurchaseIntent } from "@/services/purchase-intent";
import { listSettlementUnknowns } from "@/services/settlement-unknown";
import { deliverRecordedPurchase } from "@/services/purchase-reconciliation";
import { completionRequest } from "@/lib/ucp/checkout/completion";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { variantGid } from "@/lib/ucp/ids";
import type { SettlementSubmission } from "@/services/settlement-submission";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = "0x2222222222222222222222222222222222222222";
const NETWORK = "eip155:8453";
const TX = `0x${"a".repeat(64)}`;

let seed = 0x2000;
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
const purchases = (identity: string) => purchaseIntentStore(testEnv, identity);

async function purchaseOf(identity: string): Promise<PurchaseIntent> {
  return JSON.parse((await purchases(identity).existingPurchase())!) as PurchaseIntent;
}
async function submissionOf(identity: string): Promise<SettlementSubmission | undefined> {
  const raw = await purchases(identity).readSettlementSubmission();
  return raw ? (JSON.parse(raw) as SettlementSubmission) : undefined;
}

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

/** Open a checkout, admit a payment, return everything a test needs. */
async function admitted() {
  const checkout = await openCheckout();
  const nonce = nextNonce();
  const outcome = await admitUcpCompletion(testEnv, {
    checkoutId: checkout.id,
    credential: credential(nonce, "500000"),
    verify: accepts(),
  });
  expect(outcome.ok).toBe(true);
  const { id } = await settlementPurchaseIdentity(NETWORK, PAYER, `0x${nonce}`, "authorization");
  return { checkout, nonce, identity: id };
}

/** The claim the walk won, in the shape the resolver takes as proof. */
function wonClaim(submission: SettlementSubmission): WonClaim {
  return { won: true, submission };
}

/** Synthetic results, each a spy so a test can prove it was asked once or never. */
const declines = () => vi.fn(async (): Promise<SettlementResult> => ({ kind: "declined", reason: "insufficient_funds" }));
const unknowns = () => vi.fn(async (): Promise<SettlementResult> => ({ kind: "unknown", reason: "timeout" }));
const hangs = () => vi.fn(async (): Promise<SettlementResult> => { throw new Error("facilitator settle failed (timeout)"); });
const confirms = (transaction = TX, network = NETWORK) =>
  vi.fn(async (): Promise<SettlementResult> => ({ kind: "success", transaction, network }));

/**
 * THREE RECORDS, ONE ANSWER EACH.
 *
 *   purchase record  — whether money moved         (authoritative)
 *   submission row   — whether anyone may submit   (authoritative)
 *   checkout         — what a platform is shown    (a projection)
 *
 * Everything below is one of two questions: does each synthetic
 * outcome land on the right record in the right order, and does a
 * retry from every crash point converge the other two from the
 * authoritative ones without ever asking the producer again.
 */
describe("a declined settlement", () => {
  it("records definitive non-payment, then releases the checkout and its binding", async () => {
    const { checkout, identity } = await admitted();
    const produce = declines();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    expect(produce).toHaveBeenCalledOnce();
    if (!outcome.ok) return;
    expect(outcome.resolution?.money).toBe("not_settled");

    expect((await purchaseOf(identity)).state).toBe("not_settled");
    expect((await submissionOf(identity))?.outcome).toBe("declined");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("lets a second Complete bind a different payment afterwards", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: declines() });
    const again = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nextNonce(), "500000"),
      verify: accepts(),
    });
    expect(again.ok, again.ok ? "" : again.detail).toBe(true);
    const stored = await read(checkout.id);
    expect(stored?.completion?.payment_identity).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.completion?.payment_identity).not.toBe(identity);
    // The declined purchase is untouched by the new one.
    expect((await purchaseOf(identity)).state).toBe("not_settled");
  });
});

describe("an unknown settlement", () => {
  it("a producer that hung is an unknown outcome, never a decline", async () => {
    const { checkout, identity } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: hangs() });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolution?.money).toBe("unknown");

    const purchase = await purchaseOf(identity);
    const submission = await submissionOf(identity);
    expect(purchase.state).toBe("unknown");
    expect(typeof purchase.reconciliation_reference).toBe("string");
    expect(submission?.outcome).toBe("unknown");
    // One reference, carried by both records.
    expect(submission?.reconciliation_reference).toBe(purchase.reconciliation_reference);
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("complete_in_progress");
    expect(stored?.completion?.payment_identity).toBe(identity);
  });

  it("an explicit unknown result lands the same way", async () => {
    const { checkout, identity } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: unknowns() });
    expect(outcome.ok).toBe(true);
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await submissionOf(identity))?.outcome).toBe("unknown");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("a success carrying an unusable receipt is unknown, and is never confirmed", async () => {
    const { checkout, identity } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, {
      checkoutId: checkout.id,
      produce: confirms("0xdeadbeef"),
    });
    expect(outcome.ok).toBe(true);
    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("unknown");
    expect(purchase.payment).toBeUndefined();
    expect((await submissionOf(identity))?.outcome).toBe("unknown");
    // The unknown row names the class, so reconciliation knows what it is looking at.
    const { rows } = await listSettlementUnknowns(testEnv);
    const mine = rows.find((row) => row.row.purchase_id === identity);
    expect(mine?.row.reason).toMatch(/^invalid_settlement_receipt:/);
    expect(mine?.row.door).toBe("ucp");
  });

  it("a success naming a rail other than the quoted one is unknown too", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: confirms(TX, "eip155:137") });
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await submissionOf(identity))?.outcome).toBe("unknown");
  });

  it("a delayed decline does not overwrite it", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: unknowns() });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;

    // The delayed writer, arriving straight at the row.
    await purchases(identity).resolveSettlementSubmission("declined");
    expect((await submissionOf(identity))?.outcome).toBe("unknown");

    // The delayed writer, arriving through the resolver with a claim.
    const produce = declines();
    const again = await settleClaimedSubmission(testEnv, {
      checkoutId: checkout.id,
      claim: wonClaim(walked.submission),
      produce,
    });
    expect(produce).not.toHaveBeenCalled();
    expect(again.money).toBe("unknown");
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("a second Complete cannot replace the payment, and an identical one changes nothing", async () => {
    const { checkout, identity, nonce } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: unknowns() });
    const other = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nextNonce(), "500000"),
      verify: accepts(),
    });
    expect(other.ok).toBe(false);
    const same = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "500000"),
      verify: accepts(),
    });
    expect(same.ok).toBe(true);
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("complete_in_progress");
    expect(stored?.completion?.payment_identity).toBe(identity);
    const walkAgain = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: confirms() });
    expect(walkAgain.ok).toBe(false);
    if (!walkAgain.ok) expect(walkAgain.code).toBe("already_resolved");
  });
});

describe("a confirmed settlement", () => {
  it("records the exact payment on the purchase and leaves the checkout in progress", async () => {
    const { checkout, identity } = await admitted();
    // Mixed case on purpose: the receipt is kept verbatim, as the other doors keep it.
    const receipt = `0x${"aB".repeat(32)}`;
    const produce = confirms(receipt);
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    expect(produce).toHaveBeenCalledOnce();
    if (!outcome.ok) return;
    expect(outcome.resolution?.money).toBe("settled");

    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("settled");
    expect(purchase.payment?.transaction).toBe(receipt);
    expect(purchase.payment?.network).toBe(NETWORK);
    expect(purchase.payment?.payer?.toLowerCase()).toBe(PAYER.toLowerCase());
    expect(purchase.payment?.paidUsdc).toBe(0.5);
    expect(purchase.payment?.tipUsdc).toBe(0);
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");

    // Money proven; the checkout is NOT completed. That is the Order's
    // to write, in one transaction with the order itself.
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("complete_in_progress");
    expect(stored?.order).toBeUndefined();
    expect(stored?.completion?.payment_identity).toBe(identity);
  });

  it("is not delivered by the recovery desk, which serves the other two doors", async () => {
    /**
     * A settled purchase is what the purchase DO's alarm hands to
     * deliverRecordedPurchase. For HTTP and MCP that re-runs
     * fulfillment from the retained request; a UCP request is a JCS
     * document, and reading it as a query string would produce the
     * goods again against noise. The desk refuses the door by name.
     */
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: confirms() });
    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("settled");
    expect(purchase.door).toBe("ucp");
    expect(await deliverRecordedPurchase(testEnv, purchase)).toBeNull();
    expect((await purchaseOf(identity)).delivery).toBeUndefined();
  });

  it("cannot be regressed by a later writer on either record", async () => {
    const { checkout, identity } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: confirms() });
    await purchases(identity).resolveSettlementSubmission("declined");
    await purchases(identity).updatePurchase({ state: "not_settled" });
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
    expect((await purchaseOf(identity)).state).toBe("settled");
    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.money).toBe("settled");
    expect(converged.repaired).toEqual([]);
  });

  it("cannot be submitted again by an identical Complete", async () => {
    const { checkout, nonce } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: confirms() });
    const retry = await admitUcpCompletion(testEnv, {
      checkoutId: checkout.id,
      credential: credential(nonce, "500000"),
      verify: accepts(),
    });
    expect(retry.ok).toBe(true);
    const produce = confirms();
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("already_resolved");
    expect(produce).not.toHaveBeenCalled();
  });
});

/**
 * THE CRASH POINTS. Each one is reproduced by writing the records a
 * dying process would have left, then running the retry the next
 * request would run, and checking that it converges on the
 * authoritative record without producing.
 */
describe("a retry converges the records from the authoritative ones", () => {
  it("died after the outcome was written and before the checkout was told (declined)", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    // Truth written; projection not.
    await purchases(identity).updatePurchase({ state: "not_settled" });
    await purchases(identity).resolveSettlementSubmission("declined");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");

    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.money).toBe("not_settled");
    expect(converged.repaired).toContain("checkout:reopened");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("died after the purchase was written and before the row was (confirmed)", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    await purchases(identity).updatePurchase({
      state: "settled",
      payment: { paidUsdc: 0.5, tipUsdc: 0, payer: PAYER, transaction: TX, network: NETWORK, settleHeaders: {} },
    });
    expect((await submissionOf(identity))?.outcome).toBeUndefined();

    // The retry arrives with a producer that would say something else.
    const produce = declines();
    const converged = await settleClaimedSubmission(testEnv, {
      checkoutId: checkout.id,
      claim: wonClaim(walked.submission),
      produce,
    });
    expect(produce).not.toHaveBeenCalled();
    expect(converged.money).toBe("settled");
    expect(converged.repaired).toContain("submission:confirmed");
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
  });

  it("died after the purchase was written and before the row was (unknown)", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    await purchases(identity).updatePurchase({ reconciliation_reference: "recon-77" });

    const produce = confirms();
    const converged = await settleClaimedSubmission(testEnv, {
      checkoutId: checkout.id,
      claim: wonClaim(walked.submission),
      produce,
    });
    expect(produce).not.toHaveBeenCalled();
    expect(converged.money).toBe("unknown");
    expect(converged.repaired).toContain("submission:unknown");
    const submission = await submissionOf(identity);
    expect(submission?.outcome).toBe("unknown");
    expect(submission?.reconciliation_reference).toBe("recon-77");
  });

  it("never trusts a row that is ahead of the purchase for money", async () => {
    /**
     * The writer never produces this state — purchase first, always —
     * but a record is only as safe as what a reader does with a state
     * it should not see. A row saying confirmed beside a purchase that
     * says unknown is money UNKNOWN: the row answers "may anyone
     * submit" (no), and nothing else.
     */
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    await purchases(identity).resolveSettlementSubmission("confirmed");

    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.money).toBe("unknown");
    expect(converged.repaired).toEqual([]);
    expect(converged.checkout_status).toBe("complete_in_progress");
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await purchaseOf(identity)).payment).toBeUndefined();

    // And nothing resubmits to find out.
    const produce = confirms();
    await settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim: wonClaim(walked.submission), produce });
    expect(produce).not.toHaveBeenCalled();
    expect((await purchaseOf(identity)).state).toBe("unknown");
  });

  /**
   * The crash BETWEEN the claim and the public promise: the row is
   * claimed, the checkout still says ready_for_complete with its
   * binding. Whatever the purchase then says, the projection catches
   * up from it.
   */
  async function claimedWithoutPromise() {
    const { checkout, identity } = await admitted();
    const stored = await read(checkout.id);
    const path = `/ucp/v1/checkout-sessions/${checkout.id}`;
    const digest = await purchaseRequestDigest(testEnv, "ucp", path, completionRequest({ ...stored! }));
    const raw = await purchases(identity).claimSettlementSubmission(
      JSON.stringify({ purchase_id: identity, request_digest: digest, door: "ucp", claimed_at: new Date().toISOString() }),
    );
    expect((JSON.parse(raw) as { won: boolean }).won).toBe(true);
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
    expect((await read(checkout.id))?.completion).toBeDefined();
    return { checkout, identity };
  }

  it("died between the claim and the promise, and the money then settled", async () => {
    const { checkout, identity } = await claimedWithoutPromise();
    await purchases(identity).updatePurchase({
      state: "settled",
      payment: { paidUsdc: 0.5, tipUsdc: 0, payer: PAYER, transaction: TX, network: NETWORK, settleHeaders: {} },
    });
    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.repaired).toContain("submission:confirmed");
    expect(converged.repaired).toContain("checkout:complete_in_progress");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("died between the claim and the promise, and the money then did not move", async () => {
    const { checkout, identity } = await claimedWithoutPromise();
    await purchases(identity).updatePurchase({ state: "not_settled" });
    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.repaired).toContain("submission:declined");
    expect(converged.repaired).toContain("checkout:reopened");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();
  });

  it("is idempotent: a second pass has nothing left to repair", async () => {
    const { checkout } = await admitted();
    await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: declines() });
    const once = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    const twice = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(once.repaired).toEqual([]);
    expect(twice.repaired).toEqual([]);
    expect(twice.money).toBe("unrecorded");
  });

  it("has nothing to say about a checkout with no admitted payment", async () => {
    const checkout = await openCheckout();
    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.money).toBe("unrecorded");
    expect(converged.repaired).toEqual([]);
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
  });
});

/**
 * THE ROW AUTHORIZES, THE OBJECT DOES NOT. A `{ won: true }` in hand is
 * a convenience; what lets a producer be asked is the durable claim
 * re-read from the purchase Durable Object, naming this purchase and
 * this request and carrying no outcome yet.
 */
describe("only the durable claim authorizes production", () => {
  it("a fabricated won-claim with no durable row produces nothing", async () => {
    const { checkout, identity } = await admitted();
    const stored = await read(checkout.id);
    const produce = confirms();
    const fabricated = wonClaim({
      purchase_id: identity,
      request_digest: stored!.completion!.request_digest,
      door: "ucp",
      claimed_at: new Date().toISOString(),
    });
    await expect(
      settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim: fabricated, produce }),
    ).rejects.toThrow(/does not hold the settlement claim \(no_claim\)/);
    expect(produce).not.toHaveBeenCalled();
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect(await submissionOf(identity)).toBeUndefined();
  });

  it("a claim naming a different request produces nothing", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    const produce = confirms();
    const other = wonClaim({ ...walked.submission, request_digest: "f".repeat(64) });
    await expect(
      settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim: other, produce }),
    ).rejects.toThrow(/\(wrong_request\)/);
    expect(produce).not.toHaveBeenCalled();
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await submissionOf(identity))?.outcome).toBeUndefined();
  });

  for (const outcome of ["unknown", "declined", "confirmed"] as const) {
    it(`a durable claim already ${outcome} produces nothing`, async () => {
      const { checkout, identity } = await admitted();
      const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
      expect(walked.ok).toBe(true);
      if (!walked.ok) return;
      await purchases(identity).resolveSettlementSubmission(outcome, outcome === "unknown" ? "recon-9" : undefined);
      const produce = declines();
      const converged = await settleClaimedSubmission(testEnv, {
        checkoutId: checkout.id,
        claim: wonClaim(walked.submission),
        produce,
      });
      expect(produce).not.toHaveBeenCalled();
      expect(converged.submission?.outcome).toBe(outcome);
    });
  }

  it("a genuine unresolved durable claim produces exactly once", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    const produce = confirms();
    const first = await settleClaimedSubmission(testEnv, {
      checkoutId: checkout.id,
      claim: wonClaim(walked.submission),
      produce,
    });
    expect(produce).toHaveBeenCalledOnce();
    expect(first.money).toBe("settled");
    // The same winner, again: the row now answers, so no second ask.
    await settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim: wonClaim(walked.submission), produce });
    expect(produce).toHaveBeenCalledOnce();
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
  });
});

describe("the boundary without a producer is unchanged", () => {
  it("claims, promises, and records no outcome", async () => {
    const { checkout, identity } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolution).toBeUndefined();
    expect((await submissionOf(identity))?.outcome).toBeUndefined();
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });
});
