import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { walkToSettlementBoundary } from "@/services/ucp-settlement-boundary";
import { realSettlementProducer } from "@/services/ucp-settlement-producer";
import { settleClaimedSubmission, type WonClaim } from "@/services/ucp-settlement-resolution";
import { finalizeUcpOrder, recoverUcpOrder } from "@/services/ucp-order";
import { deliverRecordedPurchase } from "@/services/purchase-reconciliation";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { getOrder } from "@/services/orders";
import { checkoutIdOfOrder, orderIdOf, variantGid } from "@/lib/ucp/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { getMenuItem } from "@/store/menu";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  installMultiPurchaseFacilitatorMock,
  TEST_PAYER,
  TEST_TRANSACTION,
  type FacilitatorMockState,
} from "../helpers/facilitator-mock";
import type { StoredUcpOrder } from "@/lib/ucp/order/document";
import type { SettlementSubmission } from "@/services/settlement-submission";
import { coreCommerceItems } from "@/store/commerce";
import { supportsSimpleInstantRecovery } from "@/lib/artifact-checkpoint";
import type { Env } from "@/types";

/**
 * THE CRASH BEFORE THE ORDER TRANSACTION, injected where it would
 * happen: the completion write itself dies, after the goods were made
 * and checkpointed. The same Proxy-on-the-namespace pattern the
 * observation-recovery spec uses; the order a dying process was about
 * to write is captured so the retry can be held to its bytes.
 */
let dieBeforeOrderOnce = false;
let orderThatDied: StoredUcpOrder | undefined;

vi.mock("@/lib/base-rpc", async (original) => {
  const actual = await original<typeof import("@/lib/base-rpc")>();
  return { ...actual, findAuthorizationUse: async () => null };
});

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = TEST_PAYER;
const NETWORK = "eip155:8453";

let seed = 0x4000;
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

const INPUT_VALUES: Record<string, string> = {
  url: "https://example.test/door",
  wallet: "0x3333333333333333333333333333333333333333",
  address: "0x3333333333333333333333333333333333333333",
  summary: "A short agent state summary, for the anchor.",
  digest: "a".repeat(64),
  mandate: "Spend up to ten dollars on audits.",
  transaction: `0x${"b".repeat(64)}`,
  tx: `0x${"b".repeat(64)}`,
  network: "eip155:8453",
};
function inputsFor(itemId: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const name of buyInputSchema(getMenuItem(itemId)!).required ?? []) {
    inputs[name] = INPUT_VALUES[name] ?? "https://example.test/door";
  }
  return inputs;
}

const accepts = () => vi.fn(async () => ({ isValid: true, payer: PAYER }));
const read = (id: string) => ucpCheckoutStore(testEnv, id).readUcpCheckout();
const readOrder = async (id: string): Promise<StoredUcpOrder | null> => {
  const raw = await ucpCheckoutStore(testEnv, id).readUcpOrder();
  return raw ? (JSON.parse(raw) as StoredUcpOrder) : null;
};
/** Each settle in this file lands its own chain identity, as distinct sales must. */
const lastSettled = () => facilitator.settledTransactions.at(-1)!;
const purchases = (identity: string) => purchaseIntentStore(testEnv, identity);
async function purchaseOf(identity: string): Promise<PurchaseIntent> {
  return JSON.parse((await purchases(identity).existingPurchase())!) as PurchaseIntent;
}
async function submissionOf(identity: string): Promise<SettlementSubmission | undefined> {
  const raw = await purchases(identity).readSettlementSubmission();
  return raw ? (JSON.parse(raw) as SettlementSubmission) : undefined;
}
const atomicOf = (itemId: string, tier?: number) => {
  const item = getMenuItem(itemId)!;
  const usdc = tier === undefined ? item.price_usdc : item.price_usdc * [1, 2, 5][tier]!;
  return String(Math.round(usdc * 1e6));
};

async function openCheckout(itemId = "hello", tier?: number) {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      line_items: [{ item: { id: variantGid(itemId, tier) }, quantity: 1 }],
      "store.scvd": { inputs: inputsFor(itemId) },
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as Record<string, any>;
}

async function admitted(itemId = "hello", tier?: number) {
  const checkout = await openCheckout(itemId, tier);
  const nonce = nextNonce();
  const cred = credential(nonce, atomicOf(itemId, tier));
  const outcome = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: cred, verify: accepts() });
  expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
  const { id } = await settlementPurchaseIdentity(NETWORK, PAYER, `0x${nonce}`, "authorization");
  return { checkout, nonce, cred, identity: id };
}

const producer = (cred: unknown) => realSettlementProducer(testEnv, { credential: cred });
const getJson = async (path: string) => {
  const res = await SELF.fetch(`${BASE}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

/** The month's paid counters for an item, organic and house together. */
async function paidCount(itemId: string): Promise<number> {
  const month = metricsMonth();
  let total = 0;
  for (const suffix of ["", "h", "i", "hi"]) {
    total += Number((await testEnv.COUNTERS.get(KV_KEYS.metric(month, `paid${suffix}`, itemId))) ?? "0");
  }
  return total;
}

let facilitator: FacilitatorMockState;
beforeAll(() => {
  facilitator = installMultiPurchaseFacilitatorMock();
  const namespace = testEnv.PAID_RECOVERIES!;
  // The namespace's native methods (idFromName, ...) must run against
  // their real receiver, so they are bound. The stub's methods are RPC
  // proxies that take no receiver — and reading `.bind` off one would
  // itself be an RPC call — so those are handed back untouched.
  const bound = (target: object, property: string | symbol) => {
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  };
  testEnv.PAID_RECOVERIES = new Proxy(namespace, {
    get(target, property) {
      if (property !== "get") return bound(target, property);
      return (...args: Parameters<typeof namespace.get>) => {
        const stub = target.get(...args);
        return new Proxy(stub, {
          get(inner, method) {
            if (method !== "completeUcpCheckout") return Reflect.get(inner, method);
            return async (inputJson: string) => {
              if (dieBeforeOrderOnce) {
                dieBeforeOrderOnce = false;
                orderThatDied = (JSON.parse(inputJson) as { order: StoredUcpOrder }).order;
                throw new Error("fixture: the process died before the order transaction");
              }
              return inner.completeUcpCheckout(inputJson);
            };
          },
        });
      };
    },
  });
});
afterEach(() => {
  facilitator.settleShouldFail = false;
  facilitator.settleTransient502s = 0;
  facilitator.settleCalls = 0;
});

describe("the order's id is the checkout's, and reversible", () => {
  it("derives the same id from the same checkout, forever", () => {
    expect(orderIdOf("chk_abc123DEF456")).toBe("ord_abc123DEF456");
    expect(orderIdOf("chk_abc123DEF456")).toBe(orderIdOf("chk_abc123DEF456"));
    expect(orderIdOf("chk_other")).not.toBe(orderIdOf("chk_abc123DEF456"));
    expect(checkoutIdOfOrder("ord_abc123DEF456")).toBe("chk_abc123DEF456");
    expect(checkoutIdOfOrder("ord_x")).toBeNull();
    expect(checkoutIdOfOrder("chk_abc123DEF456")).toBeNull();
    expect(() => orderIdOf("ord_abc")).toThrow();
  });
});

/**
 * THE HAPPY PATH, END TO END: a confirmed real settlement writes the
 * order and completes the checkout in one transaction; the completion
 * response, Get Checkout and Get Order all show the same order; the
 * order carries frozen lines, the settlement, and the goods.
 */
describe("a confirmed settlement becomes a completed checkout with a durable order", () => {
  it("writes the order beside the checkout, and every read agrees", async () => {
    const { checkout, cred, identity } = await admitted();
    const before = await paidCount("hello");
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.order?.id).toBe(orderIdOf(checkout.id));
    expect(outcome.checkout.status).toBe("completed");

    // The store: order row present, checkout completed and pointing at it.
    const stored = await read(checkout.id);
    const order = await readOrder(checkout.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.order?.id).toBe(order?.id);
    expect(order?.checkout_id).toBe(checkout.id);
    expect(order?.settlement.purchase_id).toBe(identity);
    expect(order?.settlement.transaction).toBe(lastSettled());
    expect(order?.settlement.network).toBe(NETWORK);
    expect(order?.fulfillment.kind).toBe("instant");
    expect(order?.fulfillment.status).toBe("fulfilled");
    // The goods are the same body the x402 door would have served.
    expect(order?.fulfillment.goods).toHaveProperty("certificate");

    // Get Checkout carries the confirmation; Get Order carries the whole order.
    const viewed = await getJson(`/ucp/v1/checkout-sessions/${checkout.id}`);
    expect(viewed.body.status).toBe("completed");
    expect(viewed.body.order).toEqual({ id: order!.id, permalink_url: `${BASE}/ucp/v1/orders/${order!.id}` });
    const full = await getJson(`/ucp/v1/orders/${order!.id}`);
    expect(full.status).toBe(200);
    expect(full.body.id).toBe(order!.id);
    expect(full.body.checkout_id).toBe(checkout.id);
    expect(full.body.currency).toBe("USD");
    expect(full.body.line_items[0].item.id).toBe(variantGid("hello"));
    expect(full.body.line_items[0].item.price).toBe(checkout.line_items[0].item.price);
    expect(full.body.line_items[0].quantity).toEqual({ original: 1, total: 1, fulfilled: 1 });
    expect(full.body.line_items[0].status).toBe("fulfilled");
    expect(full.body.fulfillment.events[0].type).toBe("delivered");
    expect(full.body.totals.map((row: { type: string }) => row.type)).toEqual(["subtotal", "total"]);
    expect(full.body["store.scvd"].settlement.transaction).toBe(order!.settlement.transaction);

    // The till: one sale, attributed to the item, not to the path.
    expect((await paidCount("hello")) - before).toBe(1);
    // And the purchase record still names the door and the settlement.
    expect((await purchaseOf(identity)).state).toBe("settled");
    expect((await submissionOf(identity))?.outcome).toBe("confirmed");
  });

  it("keeps the frozen tier and price when the shelf changes after checkout", async () => {
    const item = getMenuItem("luckies")!;
    const { checkout, cred } = await admitted("luckies", 2);
    const frozen = checkout.line_items[0].item.price;
    const original = item.price_usdc;
    (item as { price_usdc: number }).price_usdc = original * 3;
    try {
      const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
      expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
      const full = await getJson(`/ucp/v1/orders/${orderIdOf(checkout.id)}`);
      expect(full.body.line_items[0].item.price).toBe(frozen);
      expect(full.body.totals.find((row: { type: string }) => row.type === "total").amount).toBe(frozen);
      expect((await readOrder(checkout.id))?.lines[0]?.tier_index).toBe(2);
    } finally {
      (item as { price_usdc: number }).price_usdc = original;
    }
  });

  it("does not open Complete or advertise checkout: the chapter stops before the door", async () => {
    const checkout = await openCheckout();
    const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(501);
    const profile = (await (await SELF.fetch(`${BASE}/.well-known/ucp`)).json()) as { ucp: { capabilities: Record<string, unknown> } };
    expect(Object.keys(profile.ucp.capabilities).some((name) => /checkout|order/.test(name))).toBe(false);
  });
});

/**
 * THE CRASH MATRIX. This chapter is mostly persistence ordering, and
 * every row below reproduces the durable state a dying process would
 * have left, then runs the retry the next request would run.
 */
describe("the order survives every crash point", () => {
  it("settled, then died before the order: the retry writes the deterministic order and never resettles", async () => {
    const { checkout, cred, nonce, identity } = await admitted();
    // Settle through the resolver alone: money moved, no goods, no order.
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    const claim: WonClaim = { won: true, submission: walked.submission };
    const settled = await settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim, produce: producer(cred) });
    expect(settled.money).toBe("settled");
    expect(facilitator.settleCalls).toBe(1);
    expect(await readOrder(checkout.id)).toBeNull();
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");

    // The identical Complete, retried.
    const retry = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nonce, atomicOf("hello")), verify: accepts() });
    expect(retry.ok).toBe(true);
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(again.ok, again.ok ? "" : again.detail).toBe(true);
    if (!again.ok) return;
    expect(again.order?.id).toBe(orderIdOf(checkout.id));
    expect(facilitator.settleCalls).toBe(1);
    expect((await read(checkout.id))?.status).toBe("completed");
    expect((await purchaseOf(identity)).payment?.transaction).toBe(lastSettled());
    expect(again.order?.settlement.transaction).toBe(lastSettled());
  });

  it("completed, then the response was lost: the retry and Get Order return the same order", async () => {
    const { checkout, cred, nonce } = await admitted();
    const first = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = await paidCount("hello");

    const retry = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nonce, atomicOf("hello")), verify: accepts() });
    expect(retry.ok).toBe(true);
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.order).toEqual(first.order);
    expect(facilitator.settleCalls).toBe(1);
    // The sale was booked once; the retry books nothing.
    expect(await paidCount("hello")).toBe(before);

    const full = await getJson(`/ucp/v1/orders/${first.order!.id}`);
    expect(full.status).toBe(200);
    expect(full.body.id).toBe(first.order!.id);
    expect(full.body["store.scvd"].settlement).toEqual(first.order!.settlement);
  });

  it("repeated order creation is one order: same id, same canonical record, booked once", async () => {
    const { checkout, cred, identity } = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const before = await paidCount("hello");
    const goods = outcome.order!.fulfillment.goods;
    const once = await finalizeUcpOrder(testEnv, { checkoutId: checkout.id, identity, goods });
    const twice = await finalizeUcpOrder(testEnv, { checkoutId: checkout.id, identity, goods: { forged: true } });
    expect(once.ok && twice.ok).toBe(true);
    if (!once.ok || !twice.ok) return;
    expect(once.created).toBe(false);
    expect(twice.created).toBe(false);
    expect(twice.order).toEqual(once.order);
    expect(twice.order.fulfillment.goods).not.toHaveProperty("forged");
    expect(await paidCount("hello")).toBe(before);
  });

  it("the purchase desk's alarm recovers a settled UCP purchase through the order, never the HTTP parser", async () => {
    const { checkout, cred, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    if (!walked.ok) return;
    await settleClaimedSubmission(testEnv, { checkoutId: checkout.id, claim: { won: true, submission: walked.submission }, produce: producer(cred) });
    expect(await readOrder(checkout.id)).toBeNull();

    const delivered = await deliverRecordedPurchase(testEnv, await purchaseOf(identity));
    expect(delivered).not.toBeNull();
    expect(delivered).toHaveProperty("certificate");
    expect(facilitator.settleCalls).toBe(1);
    const order = await readOrder(checkout.id);
    expect(order?.id).toBe(orderIdOf(checkout.id));
    expect(order?.fulfillment.goods).toEqual(delivered);
    expect((await read(checkout.id))?.status).toBe("completed");

    // A second pass is a read, not a second production.
    const againDelivered = await deliverRecordedPurchase(testEnv, await purchaseOf(identity));
    expect(againDelivered).toEqual(delivered);
  });

  it("a settled purchase whose checkout still says ready_for_complete is promised, then completed", async () => {
    // The crash between the claim and the public promise, then settled by reconciliation.
    const { checkout, identity } = await admitted();
    await purchases(identity).updatePurchase({
      state: "settled",
      payment: { paidUsdc: 0.5, tipUsdc: 0, payer: PAYER, transaction: TEST_TRANSACTION, network: NETWORK, settleHeaders: {} },
    });
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
    const goods = await recoverUcpOrder(testEnv, await purchaseOf(identity));
    expect(goods).not.toBeNull();
    expect((await read(checkout.id))?.status).toBe("completed");
    expect((await readOrder(checkout.id))?.settlement.transaction).toBe(TEST_TRANSACTION);
  });
});

describe("no order is manufactured", () => {
  it("refuses a purchase that is not settled", async () => {
    const { checkout, identity } = await admitted();
    const result = await finalizeUcpOrder(testEnv, { checkoutId: checkout.id, identity, goods: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_settled");
    expect(await readOrder(checkout.id)).toBeNull();
    expect((await read(checkout.id))?.status).toBe("ready_for_complete");
  });

  it("refuses a payment record that is not this checkout's", async () => {
    const a = await admitted();
    const b = await admitted();
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: b.checkout.id, produce: producer(b.cred) });
    expect(outcome.ok).toBe(true);
    // b's settled purchase, offered to a's checkout.
    const result = await finalizeUcpOrder(testEnv, { checkoutId: a.checkout.id, identity: b.identity, goods: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("inconsistent");
    expect(await readOrder(a.checkout.id)).toBeNull();
    expect((await read(a.checkout.id))?.status).toBe("ready_for_complete");
    // And the recovery branch will not cross the streams either.
    const crossed = { ...(await purchaseOf(b.identity)), path: `/ucp/v1/checkout-sessions/${a.checkout.id}` };
    expect(await recoverUcpOrder(testEnv, crossed)).toBeNull();
    expect(await readOrder(a.checkout.id)).toBeNull();
  });

  it("the completion transaction refuses an order naming another identity, and writes nothing", async () => {
    const { checkout, identity } = await admitted();
    const walked = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id });
    expect(walked.ok).toBe(true);
    const bogus = {
      id: orderIdOf(checkout.id),
      checkout_id: checkout.id,
      permalink_url: `${BASE}/ucp/v1/orders/${orderIdOf(checkout.id)}`,
      created_at: new Date().toISOString(),
      currency: "USD" as const,
      lines: (await read(checkout.id))!.lines,
      line_titles: ["Hello"],
      settlement: { purchase_id: "f".repeat(64), network: NETWORK, transaction: TEST_TRANSACTION, paid_usdc: 0.5, tip_usdc: 0 },
      fulfillment: { kind: "instant" as const, status: "fulfilled" as const, delivered_at: new Date().toISOString(), goods: {} },
    };
    const complete = async (input: unknown) =>
      JSON.parse(await ucpCheckoutStore(testEnv, checkout.id).completeUcpCheckout(JSON.stringify(input))) as { ok: boolean; reason?: string };
    const wrongIdentity = await complete({ order: bogus, identity: "f".repeat(64), nowMs: Date.now() });
    expect(wrongIdentity.ok).toBe(false);
    const wrongOrder = await complete({ order: bogus, identity, nowMs: Date.now() });
    expect(wrongOrder.ok).toBe(false);
    expect(wrongOrder.reason).toBe("inconsistent");
    expect(await readOrder(checkout.id)).toBeNull();
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
  });

  it("answers 404 for an order id that names no checkout, or a checkout with no order", async () => {
    expect((await getJson("/ucp/v1/orders/nonsense")).status).toBe(404);
    const { checkout } = await admitted();
    expect((await getJson(`/ucp/v1/orders/${orderIdOf(checkout.id)}`)).status).toBe(404);
  });
});

/**
 * THE GOODS ARE READ BACK, NEVER MADE AGAIN. hello and the random goods
 * are in supportsSimpleInstantRecovery: fulfillment checkpoints the
 * minted certificate and the drawn text under the settlement, and a
 * re-run reads them. The UCP path hands that same checkpoint to both
 * the walk and the recovery branch, so a crash after the goods and
 * before the order is finished with the ORIGINAL goods — same cert
 * id, same deliverable — by the retry, by the alarm, and by a second
 * recovery alike, with the facilitator never asked again.
 */
describe("a crash after the goods and before the order keeps the original goods", () => {
  const cert = (goods: Record<string, unknown> | undefined) =>
    (goods?.certificate as { cert_id?: string } | undefined)?.cert_id;

  it("hello: the identical retry finishes the order with the same certificate, and no re-mint", async () => {
    const { checkout, cred, nonce, identity } = await admitted();
    dieBeforeOrderOnce = true;
    orderThatDied = undefined;
    await expect(walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) })).rejects.toThrow(/died before the order/);
    expect(facilitator.settleCalls).toBe(1);
    expect(await readOrder(checkout.id)).toBeNull();
    expect((await read(checkout.id))?.status).toBe("complete_in_progress");
    expect((await purchaseOf(identity)).state).toBe("settled");
    const original = orderThatDied!.fulfillment.goods;
    expect(cert(original)).toMatch(/^cert_/);

    const retry = await admitUcpCompletion(testEnv, { checkoutId: checkout.id, credential: credential(nonce, atomicOf("hello")), verify: accepts() });
    expect(retry.ok).toBe(true);
    const again = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(again.ok, again.ok ? "" : again.detail).toBe(true);
    if (!again.ok) return;
    expect(facilitator.settleCalls).toBe(1);
    expect(again.order?.id).toBe(orderIdOf(checkout.id));
    expect(cert(again.order?.fulfillment.goods)).toBe(cert(original));
    expect(again.order?.fulfillment.goods.deliverable).toBe(original.deliverable);
    expect((await read(checkout.id))?.status).toBe("completed");
  });

  it("hello: the purchase desk's alarm finishes it through the UCP branch with the same certificate", async () => {
    const { checkout, cred, identity } = await admitted();
    dieBeforeOrderOnce = true;
    orderThatDied = undefined;
    await expect(walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) })).rejects.toThrow(/died before the order/);
    const original = orderThatDied!.fulfillment.goods;

    const delivered = await deliverRecordedPurchase(testEnv, await purchaseOf(identity));
    expect(cert(delivered ?? undefined)).toBe(cert(original));
    expect(delivered?.deliverable).toBe(original.deliverable);
    expect(facilitator.settleCalls).toBe(1);
    const order = await readOrder(checkout.id);
    expect(order?.id).toBe(orderIdOf(checkout.id));
    expect(cert(order?.fulfillment.goods)).toBe(cert(original));

    // A second recovery execution: the same deterministic order, untouched.
    const second = await recoverUcpOrder(testEnv, await purchaseOf(identity));
    expect(second).toEqual(delivered);
    expect(await readOrder(checkout.id)).toEqual(order);
  });

  it("a random good keeps the text it drew, not a fresh draw", async () => {
    const random = coreCommerceItems().find(
      (item) => item.id !== "hello" && supportsSimpleInstantRecovery(item) && item.pricing === "fixed",
    );
    expect(random, "a checkout-able random good must exist on the shelf for this to mean anything").toBeDefined();
    const { checkout, cred, identity } = await admitted(random!.id);
    dieBeforeOrderOnce = true;
    orderThatDied = undefined;
    await expect(walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) })).rejects.toThrow(/died before the order/);
    const original = orderThatDied!.fulfillment.goods;
    expect(typeof original.deliverable).toBe("string");

    const delivered = await deliverRecordedPurchase(testEnv, await purchaseOf(identity));
    expect(delivered?.deliverable).toBe(original.deliverable);
    expect(cert(delivered ?? undefined)).toBe(cert(original));
    expect(facilitator.settleCalls).toBe(1);
    expect((await readOrder(checkout.id))?.fulfillment.goods.deliverable).toBe(original.deliverable);
  });
});

/**
 * THE HUMAN QUEUE: the UCP order references the operational work-order
 * the store already keeps, and never duplicates it.
 */
describe("a human work-order is referenced, never copied or duplicated", () => {
  it("creates one operational order, and recovery reuses it", async () => {
    const { checkout, cred, identity } = await admitted("the_collab", 1);
    const outcome = await walkToSettlementBoundary(testEnv, { checkoutId: checkout.id, produce: producer(cred) });
    expect(outcome.ok, outcome.ok ? "" : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    const order = outcome.order!;
    expect(order.fulfillment.kind).toBe("human_queue");
    if (order.fulfillment.kind !== "human_queue") return;
    const operationalId = order.fulfillment.operational_order_id;
    expect(operationalId).toMatch(/^ord_/);
    expect(operationalId).not.toBe(order.id);
    const operational = await getOrder(testEnv, operationalId);
    expect(operational?.item_id).toBe("the_collab");
    expect(operational?.status).toBe("queued");

    const full = await getJson(`/ucp/v1/orders/${order.id}`);
    expect(full.body.line_items[0].status).toBe("processing");
    expect(full.body.fulfillment.events).toEqual([]);
    expect(full.body["store.scvd"].work_order.order_id).toBe(operationalId);

    // Recovery through the desk finds the same work-order.
    const delivered = await deliverRecordedPurchase(testEnv, await purchaseOf(identity));
    expect(delivered?.order_id).toBe(operationalId);
    expect((await readOrder(checkout.id))?.fulfillment).toEqual(order.fulfillment);
  });
});
