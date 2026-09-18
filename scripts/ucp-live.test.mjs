import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifyUcpCheckout, RECORDED } from "./ucp-live.mjs";

/**
 * THE QUALIFICATION DRIVER AGAINST A FAKE STORE, so the instrument is
 * tested before it is pointed at real money. The fake implements the
 * loop the way the real store does — one settle per checkout, the
 * identical Complete recognised, a different one refused — and the
 * defective variants below are the ways a store could fail the bar.
 */

const BASE = "https://scvd.store";
const ORDER = "ord_fixture123456";
const REQUIREMENTS = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  amount: "1000",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 300,
  extra: { name: "USD Coin", version: "2" },
};

function fakeStore(defects = {}) {
  let settles = 0;
  let completedWith = null;
  let transaction = null;
  const order = () => ({
    ucp: { version: "2026-08-25" },
    id: ORDER,
    checkout_id: "chk_fixture123456",
    permalink_url: `${BASE}/ucp/v1/orders/${ORDER}`,
    currency: "USD",
    line_items: [{ id: "li_1", item: { id: "gid://scvd.store/Variant/hello", title: "Hello", price: 1 }, quantity: { original: 1, total: 1, fulfilled: 1 }, totals: [], status: "fulfilled" }],
    totals: [],
    fulfillment: { events: [] },
    "store.scvd": { settlement: { network: "eip155:8453", transaction } },
  });
  const checkout = (status, extra = {}) => ({
    ucp: { version: "2026-08-25", payment_handlers: { "store.scvd.payment.usdc": [{ id: "scvd-usdc-base", config: { network: "eip155:8453", amount_atomic: "1000", x402_requirements: REQUIREMENTS } }] } },
    id: "chk_fixture123456",
    status,
    ...(status === "completed" ? { order: { id: ORDER, permalink_url: `${BASE}/ucp/v1/orders/${ORDER}` } } : {}),
    ...extra,
  });
  const fetcher = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    if (path === "/.well-known/ucp") {
      return Response.json({
        ucp: {
          capabilities: defects.noCapability ? {} : { "dev.ucp.shopping.checkout": [{}], "dev.ucp.shopping.order": [{}] },
          payment_handlers: { "store.scvd.payment.usdc": [{ config: { network: "eip155:8453" } }] },
        },
        "store.scvd": { status: { checkout: "live", items: ["hello"] } },
      });
    }
    if (path === "/ucp/v1/catalog/lookup") return Response.json({ products: [{ variants: [{ id: "gid://scvd.store/Variant/hello" }] }] });
    if (path === "/ucp/v1/checkout-sessions" && method === "POST") return Response.json(checkout("ready_for_complete"), { status: 201 });
    if (path === "/ucp/v1/checkout-sessions/chk_fixture123456/complete") {
      const credential = JSON.parse(init.body).payment.instruments[0].credential;
      const fingerprint = JSON.stringify(credential);
      if (completedWith === null || defects.settlesEveryTime) {
        settles += 1;
        completedWith = fingerprint;
        transaction = defects.settlesEveryTime ? `0x${settles.toString(16).padStart(64, "0")}` : `0x${"ab".repeat(32)}`;
        return Response.json(checkout("completed"));
      }
      if (completedWith === fingerprint) return Response.json(checkout("completed"));
      return Response.json(checkout("completed", { messages: [{ type: "error", code: "checkout_not_payable" }] }), { status: 409 });
    }
    if (path === "/ucp/v1/checkout-sessions/chk_fixture123456") return Response.json(checkout(completedWith ? "completed" : "ready_for_complete"));
    if (path === `/ucp/v1/orders/${ORDER}`) return Response.json(order());
    return Response.json({ messages: [{ code: "not_found" }] }, { status: 404 });
  };
  return { fetcher, settled: () => settles };
}

const sign = async (requirements, resource) => ({
  x402Version: 2,
  resource,
  accepted: requirements,
  payload: { signature: "0xsig", authorization: { from: "0x2222222222222222222222222222222222222222", nonce: "0x01" } },
});

test("a store that settles once and recognises the identical Complete passes the bar, and every recorded document names its schema", async () => {
  const store = fakeStore();
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign, fetcher: store.fetcher, now: () => new Date("2026-09-18T12:00:00Z") });
  assert.equal(run.pass, true, JSON.stringify(run.checks.filter((c) => c.status === "fail")));
  assert.equal(store.settled(), 1);
  assert.equal(run.report.order_id, ORDER);
  assert.equal(run.report.transaction, `0x${"ab".repeat(32)}`);
  assert.deepEqual(Object.keys(run.responses), RECORDED.map((row) => row[0]));
  for (const [name, entry] of Object.entries(run.responses)) assert.ok(entry.schema?.startsWith("https://ucp.dev/schemas/"), name);
  // The credential is never in the record; its fingerprint is.
  assert.match(run.report.credential_sha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(run).includes("0xsig"), false, "the signed credential must never be in the record; only its fingerprint is");
});

test("a store that charges again on the identical Complete fails on the settlement, not silently", async () => {
  const store = fakeStore({ settlesEveryTime: true });
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign, fetcher: store.fetcher });
  assert.equal(run.pass, false);
  assert.ok(run.checks.some((c) => c.id === "replay:same-settlement" && c.status === "fail"));
  assert.ok(store.settled() > 1);
});

test("a profile that advertises no checkout stops the run before anything is signed", async () => {
  let signed = 0;
  const store = fakeStore({ noCapability: true });
  const run = await qualifyUcpCheckout({ base: BASE, item: "hello", rail: "eip155:8453", sign: async (...args) => { signed += 1; return sign(...args); }, fetcher: store.fetcher });
  assert.equal(run.pass, false);
  assert.equal(signed, 0);
  assert.equal(store.settled(), 0);
  assert.match(run.report.stopped, /nothing was paid/);
});
