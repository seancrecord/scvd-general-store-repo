import { certificateProtocol, inspectNativeCertificate } from "@/services/certificate-accounting";
import type { Certificate } from "@/types";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Challenge, Credential, Receipt } from "mppx";
import { Fetch } from "mppx/client";
import { charge } from "mppx/evm/client";
import { privateKeyToAccount } from "viem/accounts";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";
import { request, testEnv, facilitator, NOW } from "./helpers/buyer-harness";
import { getPaymentStack } from "@/lib/payments";
import { purchaseIntentStore } from "@/services/purchase-intent";
import { readMppSales } from "@/services/mpp-sales";
import { computeStats } from "@/services/stats";
import { doors } from "@/lib/doors-app";
import { MPP_CHECKOUT_PATH } from "@/lib/mpp-checkout-capability";
import * as fulfillment from "@/services/fulfillment";
import * as mppSales from "@/services/mpp-sales";
import { beginPurchaseIntent, type PurchaseIntent } from "@/services/purchase-intent";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { idempotencyScope } from "@/lib/idempotency";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { getMenuItem } from "@/store";
import type { PaymentRequirements } from "@x402/core/types";
import { renderTakePage } from "@/pages/admin/take-page";
import { AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { raiseCountersToRecords } from "@/services/counter-raise";

installLaborAdmissionHarness();
const buyer = privateKeyToAccount(`0x${"07".repeat(32)}`);
const client = charge({ account: buyer, authorization: { name: "USD Coin", version: "2" }, networks: [8453] });
type ClientChallenge = Parameters<typeof client.createCredential>[0]["challenge"];
const ledger = () => testEnv.COUNTER_LEDGER!.get(testEnv.COUNTER_LEDGER!.idFromName(`${NOW.toISOString().slice(0, 7)}/mpp-sales`));
beforeEach(async () => {
  vi.setSystemTime(NOW);
  facilitator.settleCalls = 0;
  facilitator.verifyCalls = 0;
  testEnv.MPP_CHECKOUT_ENABLED = "true";
  testEnv.MPP_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";
  await ledger().reset();
  const keys = await testEnv.COUNTERS.list({ prefix: "mpp:" });
  for (const key of keys.keys) await testEnv.COUNTERS.delete(key.name);
});
afterEach(() => { vi.restoreAllMocks(); delete testEnv.MPP_CHECKOUT_ENABLED; delete testEnv.MPP_CHALLENGE_KEY; });

async function quote() {
  const path = `${MPP_CHECKOUT_PATH}?summary=SCVD-E2E-native-${crypto.randomUUID()}`;
  const key = crypto.randomUUID();
  const response = await request(path, { headers: { "Idempotency-Key": key } });
  expect(response.status).toBe(402);
  const challenge = Challenge.deserialize(response.headers.get("WWW-Authenticate")!);
  const header = await client.createCredential({ challenge: challenge as ClientChallenge, context: {} });
  return { path, key, challenge, header, response };
}
const pay = (f: Awaited<ReturnType<typeof quote>>, extra: Record<string, string> = {}) => request(f.path,
  { headers: { Authorization: f.header, "Idempotency-Key": f.key, ...extra } });

it("stock MPP client buys through the real HTTP route and records one native sale", async () => {
  const path = `${MPP_CHECKOUT_PATH}?summary=SCVD-E2E-stock-${crypto.randomUUID()}`;
  const fetch = Fetch.from({ methods: [client], fetch: async (input, init) => {
    const req = new Request(input, init);
    return request(req.url, { method: req.method, headers: req.headers });
  } });
  const before = await computeStats(testEnv);
  const response = await fetch(`https://scvd.store${path}`);
  expect(response.status).toBe(200);
  const body = await response.json<Record<string, unknown>>();
  expect(body).toHaveProperty("certificate");
  const certificate = body.certificate as Certificate;
  expect(await certificateProtocol(testEnv, certificate)).toBe("mpp");
  expect(await inspectNativeCertificate(testEnv, certificate)).toBe("matched");
  expect(Receipt.deserialize(response.headers.get("Payment-Receipt")!)).toMatchObject({ method: "evm", status: "success" });
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, house: 0 });
  const after = await computeStats(testEnv);
  expect(after.organic_settlements).toBe(before.organic_settlements + 1);
  expect(after.payment_sources!.find(row => row.protocol === "x402")).toEqual(before.payment_sources![0]);
  expect(after.payments!.by_protocol).toContainEqual({ name: "mpp", purchases: 1 });
  await raiseCountersToRecords(testEnv);
  expect((await computeStats(testEnv)).payment_sources!.find(row => row.protocol === "x402")).toEqual(before.payment_sources![0]);
});

it("retains identical goods and receipt after expiry and disabling the native flag", async () => {
  const f = await quote();
  const first = await pay(f), goods = await first.json<Record<string, unknown>>();
  expect(first.status).toBe(200);
  const receipt = first.headers.get("Payment-Receipt");
  vi.setSystemTime(new Date(NOW.getTime() + 600_000));
  delete testEnv.MPP_CHECKOUT_ENABLED;
  delete testEnv.MPP_CHALLENGE_KEY;
  const again = await pay(f);
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject(goods);
  expect(again.headers.get("Payment-Receipt")).toBe(receipt);
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
});

it("rejects a changed input or purchase key before submission", async () => {
  const f = await quote();
  expect((await pay({ ...f, path: `${f.path}changed` })).status).toBe(402);
  expect((await pay(f, { "Idempotency-Key": crypto.randomUUID() })).status).toBe(400);
  expect(facilitator.settleCalls).toBe(0);
});

it("refuses malformed, tampered and expired new credentials", async () => {
  const f = await quote();
  expect((await pay({ ...f, header: "Payment bad" })).status).toBe(400);
  const decoded = Credential.deserialize<Record<string, unknown>>(f.header);
  decoded.payload.value = "1";
  expect((await pay({ ...f, header: Credential.serialize(decoded) })).status).toBe(402);
  vi.setSystemTime(new Date(NOW.getTime() + 600_000));
  expect((await pay(f)).status).toBe(402);
  expect(facilitator.settleCalls).toBe(0);
});

it("refuses both payment protocols on one request before either can settle", async () => {
  const f = await quote();
  const response = await pay(f, { "PAYMENT-SIGNATURE": "untrusted" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "ambiguous_payment_credentials" });
  expect(facilitator.settleCalls).toBe(0);
});

it("preparation failure makes no submission and no native sale", async () => {
  const f = await quote();
  vi.spyOn(fulfillment, "fulfillPurchase").mockRejectedValueOnce(new Error("fixture preparation failure"));
  expect((await pay(f)).status).toBe(500);
  expect(facilitator.settleCalls).toBe(0);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 0 });
});

it("a lost settlement reply owns the key and never submits on a retry", async () => {
  const f = await quote();
  const submit = vi.spyOn(getPaymentStack(testEnv).facilitator, "settle").mockRejectedValue(new Error("fixture response lost"));
  const first = await pay(f);
  expect(first.status).toBe(503);
  const body = await first.json<{ recovery: { purchase_id: string } }>();
  const record = JSON.parse((await purchaseIntentStore(testEnv, body.recovery.purchase_id).existingPurchase())!);
  expect(record).toMatchObject({ state: "unknown", payment_context: { protocol: "mpp" } });
  expect((await pay(f)).status).toBe(503);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 0 });
});

it("concurrent retries admit one purchase", async () => {
  const f = await quote();
  const responses = await Promise.all([pay(f), pay(f)]);
  expect(responses.some(response => response.status === 200)).toBe(true);
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
});

it("forwards Payment credentials and native unsigned offers through the doors Worker", async () => {
  const f = await quote();
  const forwarded: Request[] = [];
  const binding = { fetch: async (input: Request) => {
    forwarded.push(input);
    return request(input.url, { method: input.method, headers: input.headers });
  } } as unknown as Fetcher;
  const bindings = { ...testEnv, STORE: binding };
  const offered = await doors.request(`https://scvd.store${f.path}`, { headers: { "Idempotency-Key": f.key } }, bindings);
  expect(offered.status).toBe(402);
  expect(Challenge.deserialize(offered.headers.get("WWW-Authenticate")!)).toMatchObject({ method: "evm" });
  const paid = await doors.request(`https://scvd.store${f.path}`, { headers: { Authorization: f.header, "Idempotency-Key": f.key } }, bindings);
  expect(paid.status).toBe(200);
  expect(forwarded).toHaveLength(2);
  expect(forwarded[1]!.headers.get("Authorization")).toBe(f.header);
  expect(facilitator.settleCalls).toBe(1);
});

it("defaults dark and keeps the x402 challenge usable", async () => {
  delete testEnv.MPP_CHECKOUT_ENABLED;
  const response = await request(`${MPP_CHECKOUT_PATH}?summary=SCVD-E2E-dark`);
  expect(response.status).toBe(402);
  expect(response.headers.has("PAYMENT-REQUIRED")).toBe(true);
  expect(() => Challenge.deserialize(response.headers.get("WWW-Authenticate")!)).toThrow();
  expect(facilitator.settleCalls).toBe(0);
});

it("a receipt-write acknowledgement loss recovers the original goods and one sale", async () => {
  const f = await quote();
  const auth = Credential.deserialize<{ from: string; nonce: string }>(f.header).payload;
  const id = (await settlementPurchaseIdentity("eip155:8453", auth.from, auth.nonce, "authorization")).id;
  const store = purchaseIntentStore(testEnv, id);
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, name) {
    if (name === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(object, method) {
        if (method === "updatePurchase") return async (...update: Parameters<typeof stub.updatePurchase>) => {
          await stub.updatePurchase(...update);
          throw new Error("fixture loses purchase acknowledgement");
        };
        const value = Reflect.get(object, method);
        return typeof value === "function" ? (...args: unknown[]) => Reflect.apply(value, object, args) : value;
      } });
    };
    const value = Reflect.get(target, name);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  let first: Response;
  try { first = await pay(f); } finally { testEnv.PAID_RECOVERIES = namespace; }
  expect(first.status).toBe(200);
  const goods = await first.json<Record<string, unknown>>();
  expect((await pay(f)).status).toBe(200);
  expect(await (await pay(f)).json()).toMatchObject(goods);
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
});

it("the alarm retries a lost sales acknowledgement even after successful delivery", async () => {
  const f = await quote();
  const original = mppSales.recordMppSale;
  const write = vi.spyOn(mppSales, "recordMppSale").mockImplementation(async (...args) => {
    await original(...args);
    throw new Error("fixture loses sales acknowledgement");
  });
  const response = await pay(f);
  expect(response.status).toBe(200);
  const auth = Credential.deserialize<{ from: string; nonce: string }>(f.header).payload;
  const id = (await settlementPurchaseIdentity("eip155:8453", auth.from, auth.nonce, "authorization")).id;
  const store = purchaseIntentStore(testEnv, id);
  const before = JSON.parse((await store.existingPurchase())!) as PurchaseIntent;
  expect(before.delivery).toBeDefined();
  expect(before.mpp?.accounted).toBeUndefined();
  expect(await runInDurableObject(store, (_, state) => state.storage.getAlarm())).not.toBeNull();
  write.mockRestore();
  await runDurableObjectAlarm(store);
  const after = JSON.parse((await store.existingPurchase())!) as PurchaseIntent;
  expect(after.mpp?.accounted).toBe(true);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
  expect(facilitator.settleCalls).toBe(1);
});

it("a native authorization wrapped as x402 cannot acquire a second purchase", async () => {
  const f = await quote();
  expect((await pay(f)).status).toBe(200);
  const credential = Credential.deserialize<Record<string, unknown>>(f.header);
  const { type: _type, signature, ...authorization } = credential.payload;
  const terms = manifestAccepts(testEnv, priceTiersUsdc(getMenuItem("context_anchor")!))[0]! as PaymentRequirements;
  const wire = { x402Version: 2, accepted: terms, payload: { authorization, signature } };
  // Both the durable seam and the real alternate protocol route refuse a second charge.
  await expect(beginPurchaseIntent(testEnv, { path: MPP_CHECKOUT_PATH, door: "http", terms,
    payer: buyer.address, payload: wire, request: new URL(`https://scvd.store${f.path}`).searchParams.toString(),
    item: getMenuItem("context_anchor"), idempotency: { surface: await idempotencyScope(MPP_CHECKOUT_PATH,
      new URL(`https://scvd.store${f.path}`).searchParams, null), key: f.key } })).rejects.toThrow();
  const replay = await request(f.path, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(wire)), "Idempotency-Key": f.key } });
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ charged_again: false });
  expect(facilitator.settleCalls).toBe(1);
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
});

it("house purchases and amounts stay out of the organic headline and remain visible in admin", async () => {
  const f = await quote();
  const original = testEnv.HOUSE_WALLETS;
  testEnv.HOUSE_WALLETS = buyer.address;
  try {
    expect((await pay(f)).status).toBe(200);
    expect(await readMppSales(testEnv)).toMatchObject({ organic: 0, house: 1 });
    const stats = await computeStats(testEnv);
    expect(stats.payment_sources!.find(row => row.protocol === "mpp")).toMatchObject({ organic: 0, house: 1,
      amounts: { organic_atomic: "0", house_atomic: f.challenge.request.amount } });
    const page = renderTakePage({ stats, take: null, allTime: null, till: null, loadNotes: [] });
    expect(page).toContain("mpp settlement amounts");
    expect(page).toContain("House: ");
  } finally { testEnv.HOUSE_WALLETS = original; }
});

it("browser negotiation exposes the native headers and the challenge stays under the header budget", async () => {
  const f = await quote();
  const preflight = await request(f.path, { method: "OPTIONS", headers: { Origin: "https://buyer.example",
    "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,idempotency-key" } });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  const response = await request(f.path, { headers: { Origin: "https://buyer.example" } });
  expect(response.headers.get("Access-Control-Expose-Headers")).toContain("Payment-Receipt");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Vary")).toContain("Authorization");
  expect(new TextEncoder().encode([...response.headers].map(([k, v]) => `${k}: ${v}\r\n`).join("")).length).toBeLessThan(16_384);
});

it("a lost settlement response is recovered from finalized chain evidence with a receipt and one sale", async () => {
  const f = await quote();
  const provider = getPaymentStack(testEnv).facilitator;
  const original = provider.settle.bind(provider);
  let transaction = "";
  vi.spyOn(provider, "settle").mockImplementation(async (...args) => {
    const result = await original(...args);
    transaction = result.transaction;
    throw new Error("fixture loses confirmed settlement response");
  });
  const response = await pay(f);
  expect(response.status).toBe(503);
  const body = await response.json<{ recovery: { purchase_id: string } }>();
  const store = purchaseIntentStore(testEnv, body.recovery.purchase_id);
  const record = JSON.parse((await store.existingPurchase())!) as PurchaseIntent;
  expect(record.state).toBe("unknown");
  const inner = globalThis.fetch;
  const topic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
  const hex = (value: number) => `0x${value.toString(16)}`;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const rpc = init?.body ? JSON.parse(String(init.body)) : {};
    if (!String(rpc.method).startsWith("eth_")) return inner(input, init);
    let result: unknown;
    if (rpc.method === "eth_chainId") result = hex(Number(record.terms.network.split(":")[1]));
    else if (rpc.method === "eth_getBlockByNumber") result = rpc.params[0] === "finalized" ? { number: hex(2000) } :
      { timestamp: hex(Math.floor(NOW.getTime() / 1000) - 3600 + parseInt(rpc.params[0], 16) * 2) };
    else if (rpc.method === "eth_getLogs") result = [{ transactionHash: transaction }];
    else if (rpc.method === "eth_getTransactionReceipt") result = { transactionHash: transaction, blockNumber: hex(1800), status: "0x1", logs: [
      { address: record.terms.asset, topics: [AUTHORIZATION_USED_TOPIC, topic(record.payer), record.authorization!.nonce], data: "0x" },
      { address: record.terms.asset, topics: [TRANSFER_TOPIC, topic(record.payer), topic(record.terms.payTo)],
        data: `0x${BigInt(record.terms.amount).toString(16).padStart(64, "0")}` },
    ] };
    else return inner(input, init);
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  });
  try {
    vi.setSystemTime(new Date(NOW.getTime() + 600_000));
    await runDurableObjectAlarm(store);
    const recovered = JSON.parse((await store.existingPurchase())!) as PurchaseIntent;
    expect(recovered).toMatchObject({ state: "settled", mpp: { accounted: true }, payment: { transaction } });
    expect(recovered.delivery).toBeDefined();
    expect(Receipt.deserialize(recovered.payment!.settleHeaders["Payment-Receipt"]!)).toMatchObject({ method: "evm", reference: transaction });
    expect((await pay(f)).status).toBe(200);
    expect(facilitator.settleCalls).toBe(1);
    expect(await readMppSales(testEnv)).toMatchObject({ organic: 1 });
  } finally { vi.stubGlobal("fetch", inner); }
});

it("concurrent ledger retries count a confirmed sale once and reject altered evidence", async () => {
  const sale = { id: "a".repeat(64), month: NOW.toISOString().slice(0, 7), payer: buyer.address.toLowerCase(),
    transaction: `0x${"bb".repeat(32)}`, amount: "5000", house: false };
  await Promise.all(Array.from({ length: 20 }, () => ledger().recordMppSale(sale)));
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, organic_amount_atomic: sale.amount });
  await expect((async () => await ledger().recordMppSale({ ...sale, amount: "5001" }))()).rejects.toThrow("MPP sale evidence changed");
  expect(await readMppSales(testEnv)).toMatchObject({ organic: 1, organic_amount_atomic: sale.amount });
});

it("a new credential for an unresolved purchase key cannot submit through x402", async () => {
  const f = await quote();
  const submit = vi.spyOn(getPaymentStack(testEnv).facilitator, "settle").mockRejectedValue(new Error("fixture ambiguity"));
  expect((await pay(f)).status).toBe(503);
  vi.setSystemTime(new Date(NOW.getTime() + 1000));
  const response = await request(f.path, { headers: { "Idempotency-Key": f.key } });
  const challenge = Challenge.deserialize(response.headers.get("WWW-Authenticate")!);
  const second = Credential.deserialize<Record<string, unknown>>(await client.createCredential({ challenge: challenge as ClientChallenge, context: {} }));
  const { type: _type, signature, ...authorization } = second.payload;
  expect(authorization.nonce).not.toBe(Credential.deserialize<Record<string, unknown>>(f.header).payload.nonce);
  // x402 requires its exact echoed wire offer, including address spelling.
  const terms = (JSON.parse(atob(response.headers.get("PAYMENT-REQUIRED")!)) as { accepts: PaymentRequirements[] }).accepts.find(row => row.network === "eip155:8453")!;
  const replay = await request(f.path, { headers: { "Idempotency-Key": f.key,
    "PAYMENT-SIGNATURE": btoa(JSON.stringify({ x402Version: 2, accepted: terms, payload: { authorization, signature } })) } });
  expect(replay.status).toBe(503);
  expect(await replay.json()).toMatchObject({ charged_again: false });
  expect(submit).toHaveBeenCalledTimes(1);
});
