import { SELF, createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { orderIdOf, variantGid } from "@/lib/ucp/ids";
import { ucpCheckoutOpen, ucpLaunchStatus } from "@/lib/ucp/launch";
import { acceptedNetworks } from "@/lib/payment-networks";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { storeGuideText } from "@/routes/llms";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store/menu";
import { coreCommerceItems } from "@/store/commerce";
import {
  installMultiPurchaseFacilitatorMock,
  TEST_PAYER,
  type FacilitatorMockState,
} from "../helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * THE LAUNCH INVARIANT, HELD FROM OUTSIDE.
 *
 *   profile advertises dev.ucp.shopping.checkout
 *     ⇕ Complete is not a refusal
 *     ⇕ a paid Complete returns the checkout completed with its order
 *     ⇕ Get Checkout shows completed + order
 *     ⇕ Get Order returns the same durable order
 *     ⇕ the identical Complete sent again never charges again
 *
 * Every row below is driven through the HTTP doors a platform would
 * use, never through the services directly, because the seam this
 * chapter adds is the route. The suite runs with the switch OPEN
 * (vitest.config.ts); the closed rows pass their own bindings.
 */

vi.mock("@/lib/base-rpc", async (original) => {
  const actual = await original<typeof import("@/lib/base-rpc")>();
  return { ...actual, findAuthorizationUse: async () => null };
});

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const NETWORK = "eip155:8453";

let seed = 0x7000;
const nextNonce = () => `0x${(++seed).toString(16).padStart(64, "0")}`;

function credential(nonce: string, atomic: string) {
  return {
    type: "x402",
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: TEST_PAYER,
        to: "0x1111111111111111111111111111111111111111",
        value: atomic,
        validAfter: "0",
        validBefore: "99999999999",
        nonce,
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
  network: NETWORK,
};
function inputsFor(itemId: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const name of buyInputSchema(getMenuItem(itemId)!).required ?? []) {
    inputs[name] = INPUT_VALUES[name] ?? "https://example.test/door";
  }
  return inputs;
}
const atomicOf = (itemId: string) => String(Math.round(getMenuItem(itemId)!.price_usdc * 1e6));

/** A request through the Worker with a chosen environment: the closed-door rows use this. */
async function fetchWith(bindings: Env, path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`${BASE}${path}`, init), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function openCheckout(itemId = "hello", bindings?: Env) {
  const body = {
    line_items: [{ item: { id: variantGid(itemId) }, quantity: 1 }],
    "store.scvd": { inputs: inputsFor(itemId) },
  };
  const res = bindings
    ? await fetchWith(bindings, "/ucp/v1/checkout-sessions", json(body))
    : await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, json(body));
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as Record<string, any>;
}

function completion(cred: unknown) {
  return {
    payment: {
      instruments: [
        { id: "pi_1", handler_id: "scvd-usdc-base", type: "x402", selected: true, credential: cred },
      ],
    },
  };
}

async function complete(checkoutId: string, cred: unknown, bindings?: Env) {
  const path = `/ucp/v1/checkout-sessions/${checkoutId}/complete`;
  const res = bindings
    ? await fetchWith(bindings, path, json(completion(cred)))
    : await SELF.fetch(`${BASE}${path}`, json(completion(cred)));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const getJson = async (path: string, bindings?: Env) => {
  const res = bindings ? await fetchWith(bindings, path) : await SELF.fetch(`${BASE}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

const closed = (): Env => ({ ...testEnv, UCP_CHECKOUT_ENABLED: "false" });

let facilitator: FacilitatorMockState;
beforeAll(() => {
  facilitator = installMultiPurchaseFacilitatorMock();
});
afterEach(() => {
  facilitator.settleShouldFail = false;
  facilitator.verifyShouldFail = false;
  facilitator.settleTransient502s = 0;
});

describe("the switch", () => {
  it("is open in the suite, closed in the shipped config, and reads one source", () => {
    expect(ucpCheckoutOpen(testEnv)).toBe(true);
    expect(ucpCheckoutOpen(closed())).toBe(false);
    expect(ucpCheckoutOpen({ ...testEnv, UCP_CHECKOUT_ENABLED: "yes" })).toBe(false);
    expect(ucpCheckoutOpen({ ...testEnv, PAID_RECOVERIES: undefined })).toBe(false);
    // An allow-list that names nothing the store has is a closed door.
    expect(ucpLaunchStatus({ ...testEnv, UCP_CHECKOUT_RAILS: "eip155:999" })).toMatchObject({
      open: false,
      closed_because: expect.stringContaining("rail"),
    });
    expect(ucpLaunchStatus({ ...testEnv, UCP_CHECKOUT_ITEMS: "no_such_item" })).toMatchObject({
      open: false,
      closed_because: expect.stringContaining("item"),
    });
    // And open means every rail and every catalog item unless narrowed.
    const status = ucpLaunchStatus(testEnv);
    expect(status.rails.sort()).toEqual([...acceptedNetworks(testEnv)].sort());
    expect(status.items.sort()).toEqual(coreCommerceItems().map((item) => item.id).sort());
  });
});

describe("the profile and the door agree", () => {
  it("open: advertises checkout and order, says so in words, and lists the rails a checkout is quoted on", async () => {
    const { body: profile } = await getJson("/.well-known/ucp");
    expect(Object.keys(profile.ucp.capabilities)).toEqual(
      expect.arrayContaining(["dev.ucp.shopping.checkout", "dev.ucp.shopping.order"]),
    );
    expect(profile.ucp.capabilities["dev.ucp.shopping.checkout"][0].schema).toBe(
      `https://ucp.dev/${profile.ucp.version}/schemas/shopping/checkout.json`,
    );
    expect(profile.ucp.capabilities["dev.ucp.shopping.order"][0].schema).toBe(
      `https://ucp.dev/${profile.ucp.version}/schemas/shopping/order.json`,
    );
    expect(profile["store.scvd"].status).toMatchObject({ catalog: "live", checkout: "live", order: "live" });
    expect(profile["store.scvd"].payment_handler_note.drivable_through_ucp).toBe(true);
    expect(profile["store.scvd"].how_to_actually_buy.ucp).toContain("/ucp/v1/checkout-sessions");
    const rails = profile.ucp.payment_handlers["store.scvd.payment.usdc"].map((h: any) => h.config.network);
    expect(rails.sort()).toEqual(ucpLaunchStatus(testEnv).rails.sort());
  });

  it("closed: advertises neither, says why, and Complete refuses in writing without touching the facilitator", async () => {
    const bindings = closed();
    const { body: profile } = await getJson("/.well-known/ucp", bindings);
    const names = Object.keys(profile.ucp.capabilities);
    expect(names).not.toContain("dev.ucp.shopping.checkout");
    expect(names).not.toContain("dev.ucp.shopping.order");
    expect(profile["store.scvd"].status.checkout).toBe("not enabled");
    expect(profile["store.scvd"].status.note).toContain("switched off");
    expect(profile["store.scvd"].payment_handler_note.drivable_through_ucp).toBe(false);
    expect(profile["store.scvd"].how_to_actually_buy.ucp).toBeUndefined();
    // Every rail the till settles on is still declared: the handler is true on its own terms.
    expect(profile.ucp.payment_handlers["store.scvd.payment.usdc"].length).toBe(acceptedNetworks(testEnv).length);

    const checkout = await openCheckout("hello", bindings);
    const verifies = facilitator.verifyCalls;
    const settles = facilitator.settleCalls;
    const { status, body } = await complete(checkout.id, credential(nextNonce(), atomicOf("hello")), bindings);
    expect(status).toBe(503);
    expect(body.status).toBe("ready_for_complete");
    expect(body.messages[0].code).toBe("payment_failed");
    expect(body.messages[0].content).toContain("switched off");
    expect(body.messages[0].content).toContain("/api/buy/hello");
    expect(facilitator.verifyCalls).toBe(verifies);
    expect(facilitator.settleCalls).toBe(settles);
    // And the checkout is untouched: still payable, never admitted.
    const stored = await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout();
    expect(stored?.completion).toBeUndefined();
  });

  it("narrowed: the profile's handlers and Create's rails are the allow-list, and Create refuses the rest by name", async () => {
    const narrowed: Env = { ...testEnv, UCP_CHECKOUT_RAILS: NETWORK, UCP_CHECKOUT_ITEMS: "hello, luckies" };
    const { body: profile } = await getJson("/.well-known/ucp", narrowed);
    expect(profile.ucp.capabilities["dev.ucp.shopping.checkout"]).toBeDefined();
    expect(profile.ucp.payment_handlers["store.scvd.payment.usdc"].map((h: any) => h.config.network)).toEqual([NETWORK]);
    expect(profile["store.scvd"].status.items).toEqual(["hello", "luckies"]);
    expect(profile["store.scvd"].status.rails).toEqual([NETWORK]);
    expect(profile["store.scvd"].status.note).toContain("2 of the");

    const refused = await fetchWith(narrowed, "/ucp/v1/checkout-sessions", json({
      line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
      "store.scvd": { inputs: { url: "https://example.test/pay" } },
    }));
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as Record<string, any>;
    expect(body.messages[0].code).toBe("item_unavailable");
    expect(body.messages[0].content).toContain("hello, luckies");
    expect(body.messages[0].content).toContain("/api/buy/service_audit");

    const wrongRail = await fetchWith(narrowed, "/ucp/v1/checkout-sessions", json({
      line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }],
      "store.scvd": { network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" },
    }));
    expect(wrongRail.status).toBe(400);
    expect(((await wrongRail.json()) as any).messages[0].content).toContain(NETWORK);

    // An open item on the open rail is quoted, on that rail only — and
    // the quoted handler carries the exact x402 requirements to sign,
    // EIP-712 domain included, so any x402 client can pay it.
    const opened = await openCheckout("hello", narrowed);
    const config = opened.ucp.payment_handlers["store.scvd.payment.usdc"][0].config;
    expect(config.network).toBe(NETWORK);
    expect(config.x402_requirements).toMatchObject({
      scheme: "exact",
      network: NETWORK,
      amount: config.amount_atomic,
      payTo: config.pay_to,
      extra: { name: expect.any(String), version: expect.any(String) },
    });
  });
});

describe("a paid Complete, through the door", () => {
  it("returns the checkout completed with its order; Get Checkout and Get Order agree; one settle", async () => {
    const checkout = await openCheckout("hello");
    const cred = credential(nextNonce(), atomicOf("hello"));
    const settles = facilitator.settleCalls;
    const { status, body } = await complete(checkout.id, cred);
    expect(status, JSON.stringify(body.messages)).toBe(200);
    expect(body.status).toBe("completed");
    expect(body.order).toEqual({
      id: orderIdOf(checkout.id),
      permalink_url: `${BASE}/ucp/v1/orders/${orderIdOf(checkout.id)}`,
    });
    expect(body.messages).toBeUndefined();
    expect(facilitator.settleCalls).toBe(settles + 1);

    const read = await getJson(`/ucp/v1/checkout-sessions/${checkout.id}`);
    expect(read.body.status).toBe("completed");
    expect(read.body.order).toEqual(body.order);

    const order = await getJson(`/ucp/v1/orders/${orderIdOf(checkout.id)}`);
    expect(order.status).toBe(200);
    expect(order.body.id).toBe(orderIdOf(checkout.id));
    expect(order.body.checkout_id).toBe(checkout.id);
    expect(order.body.line_items[0].status).toBe("fulfilled");
    expect(order.body["store.scvd"].settlement.network).toBe(NETWORK);
    expect(order.body["store.scvd"].settlement.transaction).toBe(facilitator.settledTransactions.at(-1));
  });

  it("the identical Complete again returns the same order and charges nothing again; a different payment is refused", async () => {
    const checkout = await openCheckout("hello");
    const cred = credential(nextNonce(), atomicOf("hello"));
    const first = await complete(checkout.id, cred);
    expect(first.status).toBe(200);
    const settles = facilitator.settleCalls;
    const verifies = facilitator.verifyCalls;

    const again = await complete(checkout.id, cred);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("completed");
    expect(again.body.order).toEqual(first.body.order);
    expect(facilitator.settleCalls).toBe(settles);
    // Recognised by its fingerprint: the facilitator is not asked to re-verify a burned nonce.
    expect(facilitator.verifyCalls).toBe(verifies);

    const other = await complete(checkout.id, credential(nextNonce(), atomicOf("hello")));
    expect(other.status).toBe(409);
    expect(other.body.status).toBe("completed");
    expect(other.body.messages[0].code).toBe("checkout_not_payable");
    expect(other.body.messages[0].content).toContain("one checkout is one sale");
    expect(facilitator.settleCalls).toBe(settles);
  });

  it("a lost response: the platform never saw the answer, sends the same Complete, and gets the one order", async () => {
    const checkout = await openCheckout("hello");
    const cred = credential(nextNonce(), atomicOf("hello"));
    const settles = facilitator.settleCalls;
    // The first response is dropped on the floor, unread.
    const lost = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}/complete`, json(completion(cred)));
    await lost.body?.cancel();
    const retry = await complete(checkout.id, cred);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("completed");
    expect(retry.body.order.id).toBe(orderIdOf(checkout.id));
    expect(facilitator.settleCalls).toBe(settles + 1);
    const order = await getJson(`/ucp/v1/orders/${orderIdOf(checkout.id)}`);
    expect(order.body.id).toBe(orderIdOf(checkout.id));
  });

  it("a declined settlement: 402, nothing charged, the checkout payable again", async () => {
    const checkout = await openCheckout("hello");
    facilitator.settleShouldFail = true;
    const { status, body } = await complete(checkout.id, credential(nextNonce(), atomicOf("hello")));
    expect(status).toBe(402);
    expect(body.messages[0].code).toBe("payment_failed");
    expect(body.messages[0].content).toContain("nothing was charged");
    expect(body.status).toBe("ready_for_complete");
    facilitator.settleShouldFail = false;
    const read = await getJson(`/ucp/v1/checkout-sessions/${checkout.id}`);
    expect(read.body.status).toBe("ready_for_complete");
    expect(read.body.order).toBeUndefined();
    // A fresh payment then completes it.
    const paid = await complete(checkout.id, credential(nextNonce(), atomicOf("hello")));
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("completed");
  });

  it("a refused verification: 402 before any settle, the checkout untouched", async () => {
    const checkout = await openCheckout("hello");
    facilitator.verifyShouldFail = true;
    const settles = facilitator.settleCalls;
    const { status, body } = await complete(checkout.id, credential(nextNonce(), atomicOf("hello")));
    expect(status).toBe(402);
    expect(body.messages[0].code).toBe("payment_failed");
    expect(body.messages[0].content).toContain("insufficient_funds");
    expect(body.status).toBe("ready_for_complete");
    expect(facilitator.settleCalls).toBe(settles);
    expect((await ucpCheckoutStore(testEnv, checkout.id).readUcpCheckout())?.completion).toBeUndefined();
  });

  it("no instrument, or a malformed body: 400 in the checkout's own words, nothing charged", async () => {
    const checkout = await openCheckout("hello");
    const settles = facilitator.settleCalls;
    const none = await complete(checkout.id, undefined);
    expect(none.status).toBe(400);
    expect(none.body.messages[0].content).toContain("payment.instruments[0].credential");
    const garbage = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${checkout.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(garbage.status).toBe(400);
    const missing = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/chk_nosuchcheckout/complete`, json(completion(credential(nextNonce(), "1"))));
    expect(missing.status).toBe(404);
    expect(facilitator.settleCalls).toBe(settles);
  });

  it("a product with inputs, through the same door: the audit is quoted, paid, and its order carries the work", async () => {
    const checkout = await openCheckout("service_audit");
    const { status, body } = await complete(checkout.id, credential(nextNonce(), atomicOf("service_audit")));
    expect(status, JSON.stringify(body.messages)).toBe(200);
    expect(body.status).toBe("completed");
    const order = await getJson(`/ucp/v1/orders/${orderIdOf(checkout.id)}`);
    expect(order.status).toBe(200);
    expect(order.body["store.scvd"].lines[0].item_id).toBe("service_audit");
  });
});

describe("the doors are on the surfaces agents read, exactly while open", () => {
  it("the guide, the service index and the handler spec name the checkout when open, and not when closed", async () => {
    const open = storeGuideText(BASE, testEnv);
    expect(open).toContain(`${BASE}/ucp/v1/checkout-sessions`);
    expect(open).not.toContain("store has no UCP checkout");
    const shut = storeGuideText(BASE, closed());
    expect(shut).not.toContain("POST a checkout");
    expect(shut).toContain("switched off");

    const index = await getJson("/ucp/v1");
    expect(Object.keys(index.body.operations)).toEqual(
      expect.arrayContaining(["checkout.create", "checkout.get", "checkout.complete", "checkout.cancel", "order.get"]),
    );
    expect(index.body.not_enabled).toBeUndefined();
    const shutIndex = await getJson("/ucp/v1", closed());
    expect(shutIndex.body.operations["checkout.complete"]).toBeUndefined();
    expect(shutIndex.body.not_enabled).toEqual(["checkout", "order"]);

    const spec = await getJson("/ucp/specs/payment/usdc-x402");
    expect(spec.body.complete_request.payment.instruments[0].credential.type).toBe("x402");
    expect(spec.body.negotiable).toBe(true);
    expect((await getJson("/ucp/specs/payment/usdc-x402", closed())).body.negotiable).toBe(false);
  });

  it("every open item carries a ucp payment_capabilities row pointing at the profile, and none when closed", async () => {
    const open = await getJson("/menu.json");
    const hello = open.body.items.find((row: { id: string }) => row.id === "hello");
    expect(hello.payment_capabilities).toContainEqual({
      protocol: "ucp",
      transport: "rest",
      path: "/ucp/v1/checkout-sessions",
      profile: "/.well-known/ucp",
    });
    // The x402 row is untouched, and first.
    expect(hello.payment_capabilities[0].protocol).toBe("x402");
    const shut = await getJson("/menu.json", closed());
    const helloShut = shut.body.items.find((row: { id: string }) => row.id === "hello");
    expect(helloShut.payment_capabilities.some((row: { protocol: string }) => row.protocol === "ucp")).toBe(false);
    // OpenAPI carries the pointer once at its root, never per operation
    // (the document has a byte ceiling), and says whether checkout is
    // advertised here.
    const openapi = await getJson("/openapi.json");
    expect(openapi.body["x-scvd-ucp"]).toEqual({ profile: `${BASE}/.well-known/ucp`, checkout: "advertised" });
    expect(openapi.body.paths["/api/buy/hello"].get["x-scvd-payment-capabilities"].some((row: { protocol: string }) => row.protocol === "ucp")).toBe(false);
    const openapiShut = await getJson("/openapi.json", closed());
    expect(openapiShut.body["x-scvd-ucp"].checkout).toBe("not advertised");
    // Narrowed: only the open item carries it.
    const narrowed = await getJson("/menu.json", { ...testEnv, UCP_CHECKOUT_ITEMS: "hello" });
    const audit = narrowed.body.items.find((row: { id: string }) => row.id === "service_audit");
    expect(audit.payment_capabilities.some((row: { protocol: string }) => row.protocol === "ucp")).toBe(false);
    expect(narrowed.body.items.find((row: { id: string }) => row.id === "hello").payment_capabilities.some((row: { protocol: string }) => row.protocol === "ucp")).toBe(true);
  });

  it("agents.md stops saying 'not UCP' the moment it is UCP", async () => {
    const open = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(open).not.toContain("not UCP");
    expect(open).toContain("/.well-known/ucp");
    const shut = await (await fetchWith(closed(), "/agents.md")).text();
    expect(shut).toContain("switched off");
  });
});
