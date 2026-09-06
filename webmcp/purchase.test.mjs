import test from "node:test";
import assert from "node:assert/strict";
import { createPurchaseBridge, MAX_QUOTES, MAX_QUOTE_AGE_MS } from "./purchase.js";
const origin = "https://scvd.store";
const offer = { scheme: "exact", network: "eip155:8453", amount: "4000", asset: "0x1111111111111111111111111111111111111111", payTo: "0x2222222222222222222222222222222222222222", maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } };
const required = { x402Version: 2, resource: { url: origin + "/api/buy/hello" }, accepts: [offer] };
const signed = { x402Version: 2, accepted: offer, payload: { signature: "fixture", authorization: { nonce: "fixture" } } };
function response(status = 402, body = { error: "Payment required" }, challenge = required) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": typeof body === "string" ? "text/markdown" : "application/json", ...(status === 402 ? { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) } : {}), ...(status === 200 ? { "PAYMENT-RESPONSE": "receipt-fixture" } : {}) } });
}
function fixture(reply = async () => response()) {
  let time = 1_000_000;
  let id = 0;
  const requests = [];
  const bridge = createPurchaseBridge({ origin, itemIds: ["hello", "service_audit"], now: () => time, randomId: () => `test-key-${String(++id).padStart(16, "0")}`, fetch: async (url, init) => { requests.push({ url, init }); return reply(url, init, requests.length); } });
  return { ...bridge, requests, advance: ms => { time += ms; } };
}

test("a quote sends no authorization and retains query inputs and offered atomic amounts", async () => {
  const f = fixture();
  const result = await f.quote({ buy_url: "/api/buy/service_audit?url=https%3A%2F%2Fmerchant.example%2Fapi&name=Fran%C3%A7ois" });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.payment_sent, false);
  assert.deepEqual(result.structuredContent.payment_required, required);
  assert.equal(result.structuredContent.payment_required.accepts[0].amount, "4000");
  const request = f.requests[0];
  assert.equal(request.init.headers["PAYMENT-SIGNATURE"], undefined);
  assert.equal(new URL(request.url).searchParams.get("url"), "https://merchant.example/api");
  assert.equal(new URL(request.url).searchParams.get("name"), "François");
  assert.equal(new URL(request.url).searchParams.get("src"), "webmcp");
  assert.equal(request.init.credentials, "omit");
  assert.equal(request.init.redirect, "error");
});

test("payment requires a quote and matching already-signed terms", async () => {
  const f = fixture();
  assert.equal((await f.complete({ quote_id: "invented", signed_payment: signed })).isError, true);
  assert.equal(f.requests.length, 0);
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  for (const payment of [undefined, { ...signed, x402Version: 1 }, { ...signed, accepted: { ...offer, amount: "4000000000" } }, { ...signed, accepted: { ...offer, network: "eip155:1" } }, { ...signed, resource: { url: origin + "/api/buy/service_audit" } }]) {
    assert.equal((await f.complete({ quote_id: quote.quote_id, signed_payment: payment })).isError, true);
  }
  assert.equal(f.requests.length, 1);
});

test("the exact quoted URL and retry key reach the existing gate; markdown and receipt survive", async () => {
  const f = fixture(async (_url, _init, n) => n === 1 ? response() : response(200, "# The paid page\nCafé"));
  const quote = (await f.quote({ buy_url: "/almanac/notes-from-a-tuesday-in-oak-city?name=reader" })).structuredContent;
  const result = await f.complete({ quote_id: quote.quote_id, signed_payment: signed, buy_url: "https://wrong.example" });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.body, "# The paid page\nCafé");
  assert.equal(result.structuredContent.payment_response, "receipt-fixture");
  assert.equal(f.requests[1].url, f.requests[0].url);
  assert.equal(f.requests[1].init.headers["Idempotency-Key"], quote.idempotency_key);
  assert.deepEqual(JSON.parse(atob(f.requests[1].init.headers["PAYMENT-SIGNATURE"])), signed);
  assert.equal(await f.complete({ quote_id: quote.quote_id, signed_payment: signed }), result);
  assert.equal(f.requests.length, 2, "a completed quote returns its original result");
});

test("unknown, cross-origin, credentialed and redirect-shaped destinations never receive payment", async () => {
  const f = fixture();
  for (const buy_url of ["https://evil.example/api/buy/hello", "//evil.example/api/buy/hello", "https://user:secret@scvd.store/api/buy/hello", "http://scvd.store/api/buy/hello", "/admin/withdraw", "/api/buy/missing", "/almanac/a/../../admin", "/api/buy/hello#other"]) {
    assert.equal((await f.quote({ buy_url })).isError, true, buy_url);
  }
  assert.equal(f.requests.length, 0);
});

test("a declined payment is an error and is never retried automatically", async () => {
  const f = fixture();
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const result = await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, 402);
  assert.equal(f.requests.length, 2);
});

test("a lost response preserves recovery identity and does not silently buy again", async () => {
  const f = fixture(async (_url, _init, n) => { if (n === 2) throw new Error("connection lost"); return n === 1 ? response() : response(200, { order: { order_id: "order-fixture" } }); });
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const failed = await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(failed.isError, true);
  assert.match(failed.structuredContent.error, /unknown/);
  assert.equal(failed.structuredContent.idempotency_key, quote.idempotency_key);
  assert.equal(f.requests.length, 2);
  assert.equal((await f.complete({ quote_id: quote.quote_id, signed_payment: signed })).isError, false);
  assert.equal(f.requests[1].init.headers["Idempotency-Key"], f.requests[2].init.headers["Idempotency-Key"]);
});

test("cancellation propagates to fetch; an already-aborted call sends nothing", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.quote({ buy_url: "/api/buy/hello" }, controller.signal), { name: "AbortError" });
  assert.equal(f.requests.length, 0);
  const live = new AbortController();
  await f.quote({ buy_url: "/api/buy/hello" }, live.signal);
  assert.equal(f.requests[0].init.signal, live.signal);
});

test("quotes are bounded and expired quotes cannot submit", async () => {
  const f = fixture();
  const first = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  for (let i = 1; i < MAX_QUOTES; i++) assert.equal((await f.quote({ buy_url: "/api/buy/hello" })).isError, false);
  assert.equal((await f.quote({ buy_url: "/api/buy/hello" })).isError, true);
  assert.equal(f.requests.length, MAX_QUOTES);
  f.advance(MAX_QUOTE_AGE_MS);
  assert.equal((await f.complete({ quote_id: first.quote_id, signed_payment: signed })).isError, true);
  assert.equal((await f.quote({ buy_url: "/api/buy/hello" })).isError, false);
});

test("concurrent payment calls submit a quote only once", async () => {
  let finish;
  const f = fixture(async (_url, _init, n) => n === 1 ? response() : await new Promise(resolve => { finish = resolve; }));
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const first = f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  const second = await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(second.isError, true);
  assert.equal(f.requests.length, 2);
  finish(response(200, { delivered: true }));
  assert.equal((await first).isError, false);
});

test("malformed quotes are errors, and free/refused responses never become payment quotes", async () => {
  for (const reply of [() => response(402, {}, { x402Version: 1, accepts: [offer] }), () => response(402, {}, { ...required, accepts: [] }), () => response(404, { error: "missing" }), () => new Response("broken", { status: 402 })]) {
    const f = fixture(reply);
    assert.equal((await f.quote({ buy_url: "/api/buy/hello" })).isError, true);
    assert.equal(f.requests.length, 1);
  }
  const free = fixture(() => response(200, "free page"));
  assert.equal((await free.quote({ buy_url: "/api/buy/hello" })).structuredContent.payment_sent, false);
});


test("concurrent quote requests cannot exceed the page's memory bound", async () => {
  const finishes = [];
  const f = fixture(() => new Promise(resolve => finishes.push(resolve)));
  const pending = Array.from({ length: MAX_QUOTES }, () => f.quote({ buy_url: "/api/buy/hello" }));
  assert.equal((await f.quote({ buy_url: "/api/buy/hello" })).isError, true);
  assert.equal(f.requests.length, MAX_QUOTES);
  for (const finish of finishes) finish(response());
  assert.ok((await Promise.all(pending)).every(result => result.isError === false));
});


test("a cancelled submission retains its retry identity and never retries itself", async () => {
  const controller = new AbortController();
  const f = fixture(async (_url, init, n) => {
    if (n === 1) return response();
    if (n === 2) { controller.abort(); init.signal.throwIfAborted(); }
    return response(200, { delivered: true });
  });
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  await assert.rejects(f.complete({ quote_id: quote.quote_id, signed_payment: signed }, controller.signal), { name: "AbortError" });
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].init.signal, controller.signal);
  await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(f.requests[2].init.headers["Idempotency-Key"], quote.idempotency_key);
  assert.equal(f.requests[2].url, quote.buy_url);
});
