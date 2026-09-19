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


test("publication completion preserves the private recovery header across cached replies", async () => {
  const recovery = btoa(JSON.stringify({ purchase_id: "fixture-purchase", status_token: "fixture-private-token", status_url: origin + "/api/purchase-status/fixture-purchase" }));
  const f = fixture(async (_url, _init, n) => {
    if (n === 1) return response();
    const paid = response(200, "# Retained publication");
    paid.headers.set("Purchase-Recovery", recovery);
    return paid;
  });
  const quote = (await f.quote({ buy_url: "/almanac/retained-page" })).structuredContent;
  const result = await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(result.structuredContent.purchase_recovery, recovery);
  assert.equal(result.structuredContent.body, "# Retained publication");
  const again = await f.complete({ quote_id: quote.quote_id, signed_payment: signed });
  assert.equal(again.structuredContent.purchase_recovery, recovery);
  assert.equal(f.requests.length, 2);
});


/*
 * THE NATIVE LANE (2026-09-18): the same quote carries the door's MPP
 * challenge, keyed to the quote's retry key, and a credential a payment
 * client signed against it completes the purchase in the Authorization
 * header. Signing still happens elsewhere; the page only carries.
 */
import { parsePaymentChallenge, MAX_CREDENTIAL_BYTES } from "./purchase.js";
const b64url = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function challengeHeader(purchaseKey, overrides = {}) {
  const request = b64url({ amount: "4000", currency: "0x1111111111111111111111111111111111111111", methodDetails: { chainId: 8453, credentialTypes: ["authorization"], decimals: 6 }, recipient: "0x2222222222222222222222222222222222222222" });
  const opaque = b64url({ request_digest: "ab".repeat(32), purchase_key: purchaseKey, _mppx_scope: "/api/buy/hello" });
  const params = { id: "challenge-id-fixture", realm: "scvd.store", method: "evm", intent: "charge", request, expires: "2026-09-18T18:00:00.000Z", opaque, ...overrides };
  return "Payment " + Object.entries(params).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}="${value}"`).join(", ");
}
function nativeResponse(init, status = 402) {
  const key = init?.headers?.["Idempotency-Key"];
  const res = response(status, status === 402 ? { error: "Payment required" } : { delivered: true });
  if (status === 402) res.headers.set("WWW-Authenticate", challengeHeader(key));
  if (status === 200) { res.headers.set("Payment-Receipt", "receipt-native-fixture"); res.headers.delete("PAYMENT-RESPONSE"); }
  return res;
}
const credentialFor = (id, payload = { type: "authorization", from: "0x3333333333333333333333333333333333333333", nonce: "fixture", signature: "fixture" }) =>
  "Payment " + Buffer.from(JSON.stringify({ challenge: { id, realm: "scvd.store", method: "evm", intent: "charge", request: "e30", opaque: "e30" }, payload })).toString("base64url");

test("a quote sends its retry key and carries the door's native challenge, bound to that key", async () => {
  const f = fixture(async (_url, init) => nativeResponse(init));
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  assert.equal(f.requests[0].init.headers["Idempotency-Key"], quote.idempotency_key);
  assert.equal(quote.payment_challenge.id, "challenge-id-fixture");
  assert.equal(quote.payment_challenge.request.amount, "4000");
  assert.equal(quote.payment_challenge.meta.purchase_key, quote.idempotency_key);
  assert.equal(quote.payment_challenge.header, challengeHeader(quote.idempotency_key));
  assert.match(quote.next, /signed_credential/);
  assert.deepEqual(quote.payment_required, required, "x402 terms ride beside it unchanged");
});

test("a challenge keyed to someone else's retry, or no challenge at all, is not offered and cannot be paid natively", async () => {
  const keyedElsewhere = fixture(async () => { const res = response(); res.headers.set("WWW-Authenticate", challengeHeader("another-key-0000000000")); return res; });
  const quote = (await keyedElsewhere.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  assert.equal(quote.payment_challenge, null);
  assert.doesNotMatch(quote.next, /signed_credential/);
  const refused = await keyedElsewhere.complete({ quote_id: quote.quote_id, signed_credential: credentialFor("challenge-id-fixture") });
  assert.equal(refused.isError, true);
  assert.equal(keyedElsewhere.requests.length, 1);
  assert.equal(parsePaymentChallenge('Bearer realm="x"'), null);
  assert.equal(parsePaymentChallenge(challengeHeader("k", { method: "solana" })), null);
});

test("a signed credential for this quote's challenge reaches the door in Authorization with the quote's key, and the receipt comes back", async () => {
  const f = fixture(async (_url, init, n) => nativeResponse(init, n === 1 ? 402 : 200));
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const result = await f.complete({ quote_id: quote.quote_id, signed_credential: credentialFor(quote.payment_challenge.id) });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.payment_receipt, "receipt-native-fixture");
  assert.equal(result.structuredContent.payment_response, null);
  const paid = f.requests[1];
  assert.equal(paid.url, f.requests[0].url);
  assert.equal(paid.init.headers.Authorization, credentialFor(quote.payment_challenge.id));
  assert.equal(paid.init.headers["Idempotency-Key"], quote.idempotency_key);
  assert.equal(paid.init.headers["PAYMENT-SIGNATURE"], undefined);
  assert.equal(await f.complete({ quote_id: quote.quote_id, signed_credential: credentialFor(quote.payment_challenge.id) }), result, "a completed quote returns its original result");
  assert.equal(f.requests.length, 2);
});

test("the credential object form is carried as the same Payment header a client emits", async () => {
  const f = fixture(async (_url, init, n) => nativeResponse(init, n === 1 ? 402 : 200));
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const payload = { type: "authorization", from: "0x3333333333333333333333333333333333333333", nonce: "fixture", signature: "fixture" };
  const object = { challenge: { id: quote.payment_challenge.id, realm: "scvd.store", method: "evm", intent: "charge", request: quote.payment_challenge.request, meta: quote.payment_challenge.meta }, payload };
  const result = await f.complete({ quote_id: quote.quote_id, signed_credential: object });
  assert.equal(result.isError, false);
  const header = f.requests[1].init.headers.Authorization;
  assert.match(header, /^Payment [A-Za-z0-9_-]+$/);
  const wire = JSON.parse(Buffer.from(header.slice("Payment ".length), "base64url").toString());
  assert.equal(wire.challenge.id, quote.payment_challenge.id);
  assert.equal(wire.challenge.request, Buffer.from(JSON.stringify(quote.payment_challenge.request)).toString("base64url"), "the request is the SDK's canonical, sorted form");
  assert.deepEqual(wire.payload, payload);
  assert.equal(wire.challenge.meta, undefined);
});

test("both credentials at once, a credential for another challenge, and an oversized one never leave the page", async () => {
  const f = fixture(async (_url, init) => nativeResponse(init));
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  for (const args of [
    { signed_payment: signed, signed_credential: credentialFor(quote.payment_challenge.id) },
    { signed_credential: credentialFor("some-other-challenge") },
    { signed_credential: "not a credential" },
    { signed_credential: { challenge: {}, payload: {} } },
    { signed_credential: "Payment " + "A".repeat(MAX_CREDENTIAL_BYTES) },
  ]) {
    assert.equal((await f.complete({ quote_id: quote.quote_id, ...args })).isError, true, JSON.stringify(args).slice(0, 60));
  }
  assert.equal(f.requests.length, 1);
});

test("a lost native response preserves the credential's retry identity and never re-signs", async () => {
  const f = fixture(async (_url, init, n) => { if (n === 2) throw new Error("connection lost"); return nativeResponse(init, n === 1 ? 402 : 200); });
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  const credential = credentialFor(quote.payment_challenge.id);
  const failed = await f.complete({ quote_id: quote.quote_id, signed_credential: credential });
  assert.equal(failed.isError, true);
  assert.match(failed.structuredContent.error, /unknown/);
  assert.equal((await f.complete({ quote_id: quote.quote_id, signed_credential: credential })).isError, false);
  assert.equal(f.requests[2].init.headers.Authorization, credential);
  assert.equal(f.requests[2].init.headers["Idempotency-Key"], quote.idempotency_key);
});


/*
 * NATIVE TIPS (2026-09-19): a door that takes tips lists one challenge per
 * price tier in the same header, minimum first. The quote carries the list
 * as payment_challenges and keeps payment_challenge as the minimum; a
 * credential for any listed tier completes, and the store books the excess.
 */
import { parsePaymentChallenges } from "./purchase.js";
function tierHeaders(purchaseKey) {
  const tier = (id, amount) => challengeHeader(purchaseKey, { id, request: b64url({ amount, currency: "0x1111111111111111111111111111111111111111", methodDetails: { chainId: 8453, credentialTypes: ["authorization"], decimals: 6 }, recipient: "0x2222222222222222222222222222222222222222" }) });
  return [challengeHeader(purchaseKey), tier("tier-generous", "8000"), tier("tier-patron", "20000")].join(", ");
}

test("a tipping door's quote lists every tier, keeps the minimum first, and completes with a credential for any tier", async () => {
  const f = fixture(async (_url, init, n) => {
    if (n === 1) { const res = response(); res.headers.set("WWW-Authenticate", tierHeaders(init.headers["Idempotency-Key"])); return res; }
    return nativeResponse(init, 200);
  });
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  assert.equal(quote.payment_challenge.id, "challenge-id-fixture", "the minimum stays first");
  assert.deepEqual(quote.payment_challenges.map(offered => offered.request.amount), ["4000", "8000", "20000"]);
  assert.ok(quote.payment_challenges.every(offered => offered.meta.purchase_key === quote.idempotency_key));
  assert.match(quote.next, /3 native price tiers/);
  const result = await f.complete({ quote_id: quote.quote_id, signed_credential: credentialFor("tier-patron") });
  assert.equal(result.structuredContent.status, 200);
  assert.equal(result.structuredContent.payment_receipt, "receipt-native-fixture");
  assert.equal(f.requests[1].init.headers.Authorization, credentialFor("tier-patron"));
  assert.equal(f.requests[1].init.headers["Idempotency-Key"], quote.idempotency_key);
});

test("a single-tier door lists one challenge, another scheme beside it is skipped, and a tier keyed elsewhere is dropped", async () => {
  const parsed = parsePaymentChallenges('Bearer realm="x", ' + tierHeaders("k"));
  assert.deepEqual(parsed.map(offered => offered.id), ["challenge-id-fixture", "tier-generous", "tier-patron"]);
  assert.equal(parsePaymentChallenges("Bearer realm=\"x\"").length, 0);
  const f = fixture(async (_url, init, n) => {
    if (n === 1) { const res = response(); res.headers.set("WWW-Authenticate", [challengeHeader(init.headers["Idempotency-Key"]), challengeHeader("another-key-0000000000", { id: "foreign-tier" })].join(", ")); return res; }
    return nativeResponse(init, 200);
  });
  const quote = (await f.quote({ buy_url: "/api/buy/hello" })).structuredContent;
  assert.deepEqual(quote.payment_challenges.map(offered => offered.id), ["challenge-id-fixture"]);
  assert.doesNotMatch(quote.next, /price tiers/);
  const refused = await f.complete({ quote_id: quote.quote_id, signed_credential: credentialFor("foreign-tier") });
  assert.match(refused.structuredContent.error, /different challenge/);
  assert.equal(f.requests.length, 1, "nothing left the page");
});
