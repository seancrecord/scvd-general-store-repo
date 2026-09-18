import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import { realSettlementProducer } from "@/services/ucp-settlement-producer";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import {
  getPaymentStack,
  POLYGON_SETTLED_TOTAL_KEY,
  SOLANA_SETTLED_TOTAL_KEY,
  type PaymentStack,
} from "@/lib/payments";
import { POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payment-networks";
import { getSpentNonce } from "@/lib/replay-guard";
import { convergeSettlementRecords } from "@/services/ucp-settlement-resolution";
import { encodeBase58 } from "@/lib/base58";
import { newCheckoutId } from "@/lib/ids";
import { variantGid } from "@/lib/ucp/ids";
import { checkoutTerms, lineTerms, termsDigest, type PaymentTerms } from "@/lib/ucp/checkout/terms";
import { asFrozen, frozenRequirements } from "@/lib/ucp/checkout/requirements";
import { usdcPaymentHandlers } from "@/lib/ucp/payments/usdc-x402";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import {
  installMultiPurchaseFacilitatorMock,
  TEST_PAYER,
  TEST_TRANSACTION,
  type FacilitatorMockState,
} from "../helpers/facilitator-mock";
import type { SettlementSubmission } from "@/services/settlement-submission";
import type { Env } from "@/types";

/**
 * THE CHAIN, FOR THE RESCUE. rescueAmbiguousSettle asks Base whether
 * an authorization burned; here that question is answered by a
 * counter and a knob, so a test can prove the rescue was ASKED and
 * choose what it finds.
 */
let authorizationUses = 0;
let foundUse: { txHash: string } | null = null;
vi.mock("@/lib/base-rpc", async (original) => {
  const actual = await original<typeof import("@/lib/base-rpc")>();
  return {
    ...actual,
    findAuthorizationUse: async () => {
      authorizationUses += 1;
      return foundUse;
    },
  };
});

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = TEST_PAYER;
const NETWORK = "eip155:8453";

let seed = 0x3000;
const nextNonce = () => (++seed).toString(16).padStart(64, "0");

function credential(nonce: string, atomic = "500000") {
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

const accepts = (payer = PAYER) => vi.fn(async () => ({ isValid: true, payer }));
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
    body: JSON.stringify({ line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }] }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, any>;
}

async function admitted() {
  const checkout = await openCheckout();
  const nonce = nextNonce();
  const cred = credential(nonce);
  const outcome = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: cred, verify: accepts() });
  expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
  const { id } = await settlementPurchaseIdentity(NETWORK, PAYER, `0x${nonce}`, "authorization");
  return { checkout, nonce, cred, identity: id };
}

/** The real producer, closing over the credential the request carried. */
const producer = (cred: unknown) => realSettlementProducer(testEnv, { credential: cred });

let facilitator: FacilitatorMockState;
beforeAll(() => {
  // Distinct sales land distinct transactions: fulfillment now continues
  // past settle, and the artifact journal is keyed by the settlement.
  facilitator = installMultiPurchaseFacilitatorMock();
});
const lastSettled = () => facilitator.settledTransactions.at(-1)!;
afterEach(() => {
  facilitator.settleShouldFail = false;
  facilitator.settleTransient502s = 0;
  facilitator.settleDuplicateAnswers = 0;
  facilitator.settleCalls = 0;
  foundUse = null;
  authorizationUses = 0;
});

/**
 * THE REAL MACHINERY, BEHIND THE TESTED RESOLVER.
 *
 * Every test below drives the store's actual x402 resource server
 * against the facilitator mock the other doors are tested against:
 * processSettlementWithRetry runs for real, its retry runs for real,
 * checkedSettlement runs for real, and the rescue asks the (mocked)
 * chain for real. What is under test is that adding the outbound
 * machinery does not violate the model the previous chapter proved.
 */
describe("one durable claim is one settlement orchestration", () => {
  it("under concurrent identical Completes, the facilitator is asked once", async () => {
    const { checkout, cred, identity } = await admitted();
    const complete = async () => {
      const again = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: cred, verify: accepts() });
      expect(again.ok).toBe(true);
      return walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    };
    const results = await Promise.all([complete(), complete()]);
    expect(results.filter((row) => row.ok).length).toBe(1);
    expect(results.filter((row) => !row.ok && row.code === "already_started").length).toBe(1);
    expect(facilitator.settleCalls).toBe(1);

    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("settled");
    expect(purchase.payment?.transaction).toBe(lastSettled());
    expect(purchase.payment?.network).toBe(NETWORK);
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
    // Confirmed money completes the checkout with its order (the order chapter).
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.order?.id).toBe(`ord_${checkout.id.slice("chk_".length)}`);
  });

  it("a transient first failure and the built-in retry are still one orchestration", async () => {
    const { checkout, cred, identity } = await admitted();
    facilitator.settleTransient502s = 1;
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    // Two wire attempts inside ONE claim, ONE producer call, no rescue needed.
    expect(facilitator.settleCalls).toBe(2);
    expect(authorizationUses).toBe(0);
    expect((await purchaseOf(identity)).state).toBe("settled");
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
  });

  it("a confirmed settlement whose response was lost is recovered without asking again", async () => {
    const { checkout, cred, nonce, identity } = await admitted();
    const first = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(first.ok).toBe(true);
    expect(facilitator.settleCalls).toBe(1);

    // The platform never saw the answer and sends the identical Complete:
    // it gets the same order back, and the facilitator is not asked again.
    const retry = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nonce), verify: accepts() });
    expect(retry.ok).toBe(true);
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(again.ok, again.ok ? "" : again.detail).toBe(true);
    if (again.ok && first.ok) expect(again.order).toEqual(first.order);
    expect(facilitator.settleCalls).toBe(1);
    expect((await purchaseOf(identity)).payment?.transaction).toBe(lastSettled());
    expect((await read(checkout.id))?.status).toBe("completed");
  });
});

describe("ambiguity goes to the existing rescue, never to a second submission", () => {
  it("a double transport failure asks the chain; unanswered, it is unknown and the claim stays", async () => {
    const { checkout, cred, identity } = await admitted();
    facilitator.settleTransient502s = 2;
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolution?.money).toBe("unknown");
    expect(facilitator.settleCalls).toBe(2);
    expect(authorizationUses).toBe(1);

    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("unknown");
    expect(typeof purchase.reconciliation_reference).toBe("string");
    expect((await submissionOf(identity))?.outcome).toBe("unknown");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");

    // Permanently: nothing reopens this, and nothing submits to find out.
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("already_resolved");
    expect(facilitator.settleCalls).toBe(2);
    const other = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nextNonce()), verify: accepts() });
    expect(other.ok).toBe(false);
  });

  it("a double transport failure the chain CAN answer is a confirmed sale, with the chain's transaction", async () => {
    const { checkout, cred, identity } = await admitted();
    facilitator.settleTransient502s = 2;
    const landed = `0x${"c".repeat(64)}`;
    foundUse = { txHash: landed };
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok).toBe(true);
    expect(facilitator.settleCalls).toBe(2);
    expect(authorizationUses).toBe(1);
    const purchase = await purchaseOf(identity);
    expect(purchase.state).toBe("settled");
    expect(purchase.payment?.transaction).toBe(landed);
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
  });

  it("a failure that names a transaction is a question for the chain, not a decline", async () => {
    const { checkout, cred, identity } = await admitted();
    // The lost-response duplicate shape: 400, invalid_payload, and the ORIGINAL hash.
    facilitator.settleDuplicateAnswers = 1;
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok).toBe(true);
    expect(authorizationUses).toBe(1);
    // Chain unanswered: the named hash is a claim, not a fact — unknown, never declined.
    expect((await purchaseOf(identity)).state).toBe("unknown");
    expect((await submissionOf(identity))?.outcome).toBe("unknown");
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });
});

describe("a crash-repair pass does not invent a spent-nonce key", () => {
  it("repairs the row and leaves the guard unwritten when the wire spelling is gone", async () => {
    /**
     * The guard keys on the nonce verbatim; the purchase record keeps a
     * lowercased copy. A repair that wrote the row from that copy would
     * look restored and be wrong for any wallet that did not emit
     * lowercase hex. So it writes nothing: the chain's nonce-once and
     * the purchase atom are the truth, as they were.
     */
    const { checkout, nonce, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    await purchases(identity).updatePurchase({
      state: "settled",
      payment: { paidUsdc: 0.5, tipUsdc: 0, payer: PAYER, transaction: TEST_TRANSACTION, network: NETWORK, settleHeaders: {} },
    });
    const converged = await convergeSettlementRecords(testEnv, { checkoutId: checkout.id });
    expect(converged.money).toBe("settled");
    expect(converged.repaired).toContain("submission:confirmed");
    expect(converged.repaired).not.toContain("nonce:bound");
    expect(await getSpentNonce(testEnv, `0x${nonce}`)).toBeNull();
    expect(await getSpentNonce(testEnv, `0x${nonce}`.toLowerCase())).toBeNull();
  });
});

describe("a credential that does not bind is declined without a submission", () => {
  it("is classified not_submitted, and nothing reaches the resource server", async () => {
    /**
     * Unreachable from a Complete request — admission just bound this
     * same credential — so exercised on the producer directly: a
     * credential whose own `accepted` block disagrees with the admitted
     * terms is refused before anything leaves, and NOTHING LEAVING is
     * definitive non-payment, not an open question.
     */
    const { identity, cred } = await admitted();
    const tampered = { ...cred, accepted: { scheme: "exact", amount: "1" } };
    const settle = vi.fn();
    const stack = { httpServer: { processSettlement: settle }, initialized: Promise.resolve() } as unknown as PaymentStack;
    const submission = { purchase_id: identity, request_digest: "a".repeat(64), door: "ucp", claimed_at: new Date().toISOString() };
    const result = await realSettlementProducer(testEnv, { credential: tampered, stack })(submission);
    expect(result.kind).toBe("declined");
    if (result.kind === "declined") expect(result.reason).toMatch(/^not_submitted:/);
    expect(settle).not.toHaveBeenCalled();
    expect(facilitator.settleCalls).toBe(0);
  });
});

describe("a definitive decline", () => {
  it("reopens the checkout only after durable not_settled, and a new credential may bind", async () => {
    const { checkout, cred, identity } = await admitted();
    facilitator.settleShouldFail = true;
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolution?.money).toBe("not_settled");
    // Answered no, named nothing, not transport-dead: no retry, no rescue.
    expect(facilitator.settleCalls).toBe(1);
    expect(authorizationUses).toBe(0);

    expect((await purchaseOf(identity)).state).toBe("not_settled");
    expect((await submissionOf(identity))?.outcome).toBe("declined");
    const stored = await read(checkout.id);
    expect(stored?.status).toBe("ready_for_complete");
    expect(stored?.completion).toBeUndefined();

    facilitator.settleShouldFail = false;
    const fresh = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nextNonce()), verify: accepts() });
    expect(fresh.ok, fresh.ok ? "" : fresh.detail).toBe(true);
    expect((await read(checkout.id))?.completion?.payment_identity).not.toBe(identity);
  });
});

/**
 * ALL FIVE RAILS AT THE NORMALISATION BOUNDARY.
 *
 * Each rail's checkout is quoted through the same code the route uses
 * (usdcPaymentHandlers, frozenRequirements), against an env that opens
 * the rail; its payment is admitted through the real admission; and
 * settlement runs through the real processSettlementWithRetry, adapter
 * and resolver — with only the resource server's answer scripted, so
 * a rail's receipt rules and its rescue scope are what decide.
 */
const RECEIVER = "0x3333333333333333333333333333333333333333";
const SOLANA_PAYER = "11111111111111111111111111111111";
const railEnv = {
  ...testEnv,
  POLYGON_PAY_TO: RECEIVER,
  ARBITRUM_PAY_TO: RECEIVER,
  WORLD_PAY_TO: RECEIVER,
  SOLANA_PAY_TO: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE",
} as Env;

/** A Solana wire transaction with valid framing: one signature, legacy message. */
function solanaWire(fill: number): string {
  const bytes = new Uint8Array(1 + 64 + 6);
  bytes[0] = 1;
  bytes.fill(fill, 1, 65);
  bytes[65] = 1; // numRequiredSignatures, must equal the signature count
  return btoa(String.fromCharCode(...bytes));
}

interface Rail {
  network: string;
  good: string;
  bad: string;
  credential: () => unknown;
  payer: string;
  identity: (wire: unknown) => Promise<string>;
}
const evmRail = (network: string): Rail => ({
  network,
  good: `0x${"5".repeat(64)}`,
  bad: "0xdeadbeef",
  credential: () => credential(nextNonce()),
  payer: PAYER,
  identity: async (wire) => {
    const nonce = (wire as ReturnType<typeof credential>).payload.authorization.nonce;
    return (await settlementPurchaseIdentity(network, PAYER, nonce, "authorization")).id;
  },
});
const RAILS: Rail[] = [
  evmRail("eip155:8453"),
  evmRail("eip155:137"),
  evmRail("eip155:42161"),
  evmRail("eip155:480"),
  {
    network: SOLANA_NETWORK,
    good: encodeBase58(new Uint8Array(64).fill(9)),
    bad: "notasignature",
    credential: () => ({ x402Version: 2, payload: { transaction: solanaWire(++seed & 0xff || 1) } }),
    payer: SOLANA_PAYER,
    identity: async (wire) =>
      (await settlementPurchaseIdentity(
        SOLANA_NETWORK,
        SOLANA_PAYER,
        (wire as { payload: { transaction: string } }).payload.transaction,
        "transaction",
      )).id,
  },
];

async function admittedOn(rail: Rail) {
  const id = newCheckoutId();
  const lines = [lineTerms(variantGid("hello"), 1)];
  const store = ucpCheckoutStore(railEnv, id);
  const created = await store.createUcpCheckout({ id, lines, nowMs: Date.now() });
  const handler = usdcPaymentHandlers(railEnv, BASE).find((row) => row.config.network === rail.network);
  expect(handler, `${rail.network} must be an open rail in this env`).toBeDefined();
  const totals = checkoutTerms({ checkoutId: id, version: created.version, lines, expiresAt: created.expires_at });
  const terms: PaymentTerms = {
    checkout_id: id,
    checkout_version: created.version,
    network: rail.network,
    asset: handler!.config.asset,
    amount_atomic: totals.total_amount_atomic,
    pay_to: handler!.config.pay_to,
    expires_at: created.expires_at,
  };
  const quoted = await store.quoteUcpCheckout({
    terms,
    digest: await termsDigest(terms),
    requirements: asFrozen(frozenRequirements(railEnv, rail.network, totals.total_amount_atomic)),
    nowMs: Date.now(),
  });
  expect(quoted.ok).toBe(true);
  const wire = rail.credential();
  const outcome = await admitUcpCompletion(railEnv, { checkoutId: id, credential: wire, verify: accepts(rail.payer) });
  expect(outcome.ok, `${rail.network}: ${outcome.ok ? "" : outcome.detail}`).toBe(true);
  return { checkoutId: id, wire, identity: await rail.identity(wire) };
}

/** A resource server that answers as scripted; everything around it is real. */
function scripted(answers: Array<Record<string, unknown>>): { stack: PaymentStack; settle: ReturnType<typeof vi.fn> } {
  const settle = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift()! : answers[0]!;
    return { headers: {}, ...next };
  });
  return {
    settle,
    stack: { httpServer: { processSettlement: settle }, initialized: Promise.resolve() } as unknown as PaymentStack,
  };
}
const success = (transaction: string, network: string, payer: string) => ({ success: true, transaction, network, payer });
const declined = (network: string) => ({ success: false, errorReason: "insufficient_funds", transaction: "", network });
const dead = (network: string) => ({ success: false, errorReason: "facilitator settle failed (502): error code: 502", transaction: "", network });

for (const rail of RAILS) {
  describe(`${rail.network} at the normalisation boundary`, () => {
    const produce = (wire: unknown, stack: PaymentStack) =>
      realSettlementProducer(railEnv, { credential: wire, stack });

    it("a well-formed receipt on the quoted rail confirms, verbatim, and meters the unreconciled cap where one stands", async () => {
      const meterKey = rail.network === SOLANA_NETWORK ? SOLANA_SETTLED_TOTAL_KEY
        : rail.network === POLYGON_NETWORK ? POLYGON_SETTLED_TOTAL_KEY : null;
      const before = {
        solana: Number((await testEnv.COUNTERS.get(SOLANA_SETTLED_TOTAL_KEY)) ?? "0"),
        polygon: Number((await testEnv.COUNTERS.get(POLYGON_SETTLED_TOTAL_KEY)) ?? "0"),
      };
      const { checkoutId, wire, identity } = await admittedOn(rail);
      const { stack, settle } = scripted([success(rail.good, rail.network, rail.payer)]);
      const outcome = await walkToSettlementBoundary(railEnv, { checkoutId, produce: produce(wire, stack) });
      expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
      expect(settle).toHaveBeenCalledOnce();
      const purchase = await purchaseOf(identity);
      expect(purchase.state).toBe("settled");
      expect(purchase.payment?.transaction).toBe(rail.good);
      expect(purchase.payment?.network).toBe(rail.network);
      expect((await submissionOf(identity))?.outcome).toBe("confirmed");
      expect((await read(checkoutId))?.status).toBe("completed");

      // PAYMENT_RAILS.md's bound: Solana and Polygon settles are counted
      // toward their unreconciled caps at the seam money moved; the
      // reconciled rails are not, and neither meter moves for them.
      const after = {
        solana: Number((await testEnv.COUNTERS.get(SOLANA_SETTLED_TOTAL_KEY)) ?? "0"),
        polygon: Number((await testEnv.COUNTERS.get(POLYGON_SETTLED_TOTAL_KEY)) ?? "0"),
      };
      expect(after.solana - before.solana).toBeCloseTo(meterKey === SOLANA_SETTLED_TOTAL_KEY ? 0.5 : 0, 6);
      expect(after.polygon - before.polygon).toBeCloseTo(meterKey === POLYGON_SETTLED_TOTAL_KEY ? 0.5 : 0, 6);

      // The spent-nonce row, on the rails that have a nonce.
      const nonce = (wire as { payload: { authorization?: { nonce?: string } } }).payload.authorization?.nonce;
      if (nonce) {
        const row = await getSpentNonce(railEnv, nonce);
        expect(row?.transaction).toBe(rail.good);
        expect(row?.path).toBe(`/ucp/v1/checkout-sessions/${checkoutId}`);
      }
    });

    it("a success naming another rail is unknown, never confirmed", async () => {
      const { checkoutId, wire, identity } = await admittedOn(rail);
      const other = rail.network === "eip155:137" ? "eip155:8453" : "eip155:137";
      const { stack } = scripted([success(rail.good, other, rail.payer)]);
      const outcome = await walkToSettlementBoundary(railEnv, { checkoutId, produce: produce(wire, stack) });
      expect(outcome.ok).toBe(true);
      expect((await purchaseOf(identity)).state).toBe("unknown");
      expect((await purchaseOf(identity)).payment).toBeUndefined();
      expect((await submissionOf(identity))?.outcome).toBe("unknown");
    });

    it("a success with a malformed transaction is unknown, never confirmed", async () => {
      const { checkoutId, wire, identity } = await admittedOn(rail);
      const { stack } = scripted([success(rail.bad, rail.network, rail.payer)]);
      const outcome = await walkToSettlementBoundary(railEnv, { checkoutId, produce: produce(wire, stack) });
      expect(outcome.ok).toBe(true);
      expect((await purchaseOf(identity)).state).toBe("unknown");
      expect((await submissionOf(identity))?.outcome).toBe("unknown");
    });

    it("a definitive no is declined, with no retry and no rescue", async () => {
      const { checkoutId, wire, identity } = await admittedOn(rail);
      const { stack, settle } = scripted([declined(rail.network)]);
      const outcome = await walkToSettlementBoundary(railEnv, { checkoutId, produce: produce(wire, stack) });
      expect(outcome.ok).toBe(true);
      expect(settle).toHaveBeenCalledOnce();
      expect(authorizationUses).toBe(0);
      expect((await purchaseOf(identity)).state).toBe("not_settled");
      expect((await submissionOf(identity))?.outcome).toBe("declined");
      expect((await read(checkoutId))?.status).toBe("ready_for_complete");
    });

    it("a dead transport twice is unknown; only Base asks its chain, every other rail never touches the Base reader", async () => {
      const { checkoutId, wire, identity } = await admittedOn(rail);
      const { stack, settle } = scripted([dead(rail.network), dead(rail.network)]);
      const outcome = await walkToSettlementBoundary(railEnv, { checkoutId, produce: produce(wire, stack) });
      expect(outcome.ok).toBe(true);
      expect(settle).toHaveBeenCalledTimes(2);
      expect(authorizationUses).toBe(rail.network === "eip155:8453" ? 1 : 0);
      expect((await purchaseOf(identity)).state).toBe("unknown");
      expect((await submissionOf(identity))?.outcome).toBe("unknown");
      expect((await read(checkoutId))?.status).toBe("complete_in_progress");
    });
  });
}
