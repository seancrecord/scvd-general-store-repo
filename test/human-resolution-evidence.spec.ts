import { beforeEach, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { installBuyerHarness, request, sourceEnv, testEnv, object } from "./helpers/buyer-harness";
import { KV_KEYS } from "@/lib/kv-keys";
import { BASE_NETWORK } from "@/lib/payments";
import { getMenuItem } from "@/store";

installBuyerHarness();
beforeEach(async () => {
  const ns = sourceEnv.PAID_RECOVERIES!;
  await runInDurableObject(ns.get(ns.idFromName("human-delivery-resolutions")), async (_instance, state) => state.storage.deleteAll());
});
const AUTH = { Authorization: `Basic ${btoa("keeper:test-admin-password")}`, "Content-Type": "application/x-www-form-urlencoded" };
const buyer = "0x2222222222222222222222222222222222222222";
async function open(id = "aura_walk") {
  const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const intent = { transaction, path: `/api/buy/${id}`, payer: buyer, paid_usdc: getMenuItem(id)!.price_usdc,
    settled_at: "2026-09-04T12:00:00.000Z", query: "detail=truncated-preview" };
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
  return { transaction, intent };
}
async function resolve(transaction: string, outcome: string, evidence: Record<string, string> = {}) {
  return request("/admin/delivery/resolve", { method: "POST", headers: AUTH,
    body: new URLSearchParams({ transaction, outcome, ...evidence }) });
}
for (const id of ["aura_walk", "the_collab"]) for (const outcome of ["fulfilled_by_hand", "refunded", "house_absorbed"]) {
  it(`${id}: ${outcome} cannot clear a buyer obligation with a label alone`, async () => {
    const { transaction, intent } = await open(id);
    const response = await resolve(transaction, outcome);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(object(await response.json()).refused).toBeTruthy();
    expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)))!)).toEqual(intent);
    expect(await sourceEnv.ORDERS.get(`delivery_resolved:${transaction}`)).toBeNull();
  });
}
for (const evidence of ([{ order_id: "ord_missing" }, { refund_tx: `0x${"ab".repeat(32)}` }] as Record<string, string>[])) {
  it(`a nonexistent ${Object.keys(evidence)[0]} is not resolution evidence`, async () => {
    const { transaction, intent } = await open();
    const response = await resolve(transaction, "order_id" in evidence ? "fulfilled_by_hand" : "refunded",
      { network: BASE_NETWORK, ...evidence });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)))!)).toEqual(intent);
  });
}
it("the desk labels a truncated query as a preview, not enough information to replace the work", async () => {
  await open();
  const page = await request("/admin/reconciliation", { headers: { Authorization: AUTH.Authorization, Accept: "text/html" } });
  const html = await page.text();
  expect(html).not.toContain("enough to produce the goods");
  expect(html).toContain("preview");
  expect(html).toContain('name="refund_tx"');
  expect(html).toContain('name="order_id"');
  expect(html).toContain('name="network"');
});

import { beforeAll, vi } from "vitest";
import { items, call, shelves, baseline, facilitator } from "./helpers/buyer-harness";
import { evmPayment, evmValid } from "./helpers/buyer-signed-payments";
import type { ChallengeRequirement } from "./helpers/payment";
import { evmChainOf, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { POLYGON_NETWORK } from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import { createOrder } from "@/services/orders";
import { verifyMessageSignature } from "@/lib/signing";
import { loadHumanResolution, readHumanResolution } from "@/services/human-resolution-record";
import { resolveHumanDelivery } from "@/services/human-delivery-resolution";
import { isExactHouseWallet } from "@/lib/channel";

const hex = (n: number) => `0x${n.toString(16)}`;
const topic = (s: string) => `0x${s.slice(2).toLowerCase().padStart(64, "0")}`;
let chainEvidence: { network: string; original: string; refund: string; payer: string; receiver: string; amount: number; defect?: string } | null = null;
beforeEach(() => { chainEvidence = null; });
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null);
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/verify")) {
      facilitator.verifyCalls++;
      const wire = object(body.paymentPayload);
      return Response.json({ isValid: await evmValid(wire, body.paymentRequirements as ChallengeRequirement), payer: object(object(wire.payload).authorization).from });
    }
    const e = chainEvidence;
    if (!e || !String(body.method).startsWith("eth_")) return inner(input, init);
    if (e.defect === "rpc") throw new Error("fixture RPC unavailable");
    const chain = evmChainOf(e.network)!;
    const params = body.params as unknown[];
    let result: unknown;
    if (body.method === "eth_chainId") result = hex(e.defect === "chain" ? 1 : Number(chain.caip2.split(":")[1]));
    else if (body.method === "eth_getBlockByNumber") result = { number: hex(e.defect === "pending" ? 10 : 500) };
    else if (body.method === "eth_getTransactionReceipt") {
      const refund = params[0] === e.refund;
      const from = refund ? e.receiver : e.payer, to = refund ? e.payer : e.receiver;
      result = { transactionHash: e.defect === "transaction" && refund ? e.original : params[0],
        status: e.defect === "failed" && refund ? "0x0" : "0x1", blockNumber: hex(refund ? 200 : 100),
        logs: [{ address: e.defect === "token" && refund ? buyer : chain.usdc,
          topics: [TRANSFER_TOPIC, topic(from), topic(e.defect === "recipient" && refund ? buyer : to)],
          data: hex(Math.round(e.amount * 1e6) + (e.defect === "amount" && refund ? 1 : 0)) }] };
    } else return inner(input, init);
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
});
async function seed(network = BASE_NETWORK, id = "aura_walk") {
  const item = items.find(row => row.id === id)!, tool = shelves(item)[0]!;
  const args: Record<string, unknown> & { detail: string } = { ...baseline(item), detail: `SCVD-E2E-${crypto.randomUUID()} — original full brief` };
  const quote = await call(item, "http", args, tool);
  const offer = quote.offers.find(row => row.network === network)!;
  const wire = await evmPayment(offer);
  const auth = object(object(wire.payload).authorization);
  const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const refund = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const intent = { path: `/api/buy/${id}`, transaction, payer: String(auth.from), paid_usdc: item.price_usdc,
    settled_at: "2026-09-04T12:00:00.000Z", query: "detail=truncated-preview" };
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
  await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(auth.nonce)), JSON.stringify({ path: intent.path, transaction }));
  chainEvidence = { network, original: transaction, refund, payer: intent.payer, receiver: offer.payTo, amount: intent.paid_usdc };
  async function retry(door: "http" | "mcp" | "standard") {
    const payment = btoa(JSON.stringify(wire));
    if (door !== "standard") return call(item, door, args, tool, payment);
    const raw = object(await (await request("/mcp?payment=tool-result", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name,
        arguments: { item_id: id, ...args }, _meta: { "x402/payment": payment } } }) })).json());
    return { body: object(object(raw.result).structuredContent), protocolError: object(raw.result).isError === true,
      quote: object(object(raw.result)._meta)["x402/payment-required"] !== undefined };
  }
  async function completedOrder() {
    const minted = await mintCertificate(testEnv, { itemId: id, paidUsdc: item.price_usdc, payer: intent.payer, network, settlementTx: transaction });
    const order = await createOrder(testEnv, { item: getMenuItem(id)!, paidUsdc: item.price_usdc, tipUsdc: 0,
      payer: intent.payer, patronNumber: minted.patronNumber, certId: minted.certificate.cert_id,
      detail: args.detail, targetUrl: typeof args.url === "string" ? args.url : undefined, createdAt: intent.settled_at, slaHours: 24 });
    order.status = "completed"; order.deliverable = `${args.detail} — completed work`; order.completed_at = "2026-09-05T11:00:00.000Z";
    await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
    return order;
  }
  return { transaction, refund, network, intent, retry, completedOrder, wire, offer, args };
}
for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const door of ["http", "mcp", "standard"] as const)
  for (const outcome of ["fulfilled_by_hand", "refunded"] as const) {
  it(`${network} ${door}: retains ${outcome} evidence for buyer retries after the desk and order disappear`, async () => {
    const s = await seed(network);
    const order = outcome === "fulfilled_by_hand" ? await s.completedOrder() : null;
    const evidence = { network, ...(order ? { order_id: order.order_id } : { refund_tx: s.refund }) };
    const response = await resolve(s.transaction, outcome, evidence);
    expect(response.status).toBe(200);
    const record = await loadHumanResolution(testEnv, network, s.transaction);
    expect(record?.statement.outcome).toBe(outcome);
    expect(await verifyMessageSignature(record!.signed_payload, record!.signature, record!.public_key)).toBe(true);
    expect(await verifyMessageSignature(record!.signed_payload.replace(s.transaction, s.refund), record!.signature, record!.public_key)).toBe(false);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).toBeNull();
    await sourceEnv.ORDERS.delete(`delivery_resolved:${s.transaction}`);
    if (order) await sourceEnv.ORDERS.delete(KV_KEYS.order(order.order_id));
    const settles = facilitator.settleCalls;
    for (let n = 0; n < 2; n++) {
      const result = await s.retry(door);
      expect(result.quote).toBe(false);
      expect(result.protocolError).toBe(!order);
      expect(result.body).toMatchObject({ charged: true, charged_again: false, settlement_attempted: false });
      expect(object(object(result.body.resolution).statement).outcome).toBe(outcome);
      if (order) expect(result.body.deliverable).toBe(order.deliverable);
      else expect(result.body).toMatchObject({ code: "purchase_resolved", refunded: true });
    }
    expect(facilitator.settleCalls).toBe(settles);
    // Durable history, not the expiring desk row, classifies this retry.
    chainEvidence!.defect = "rpc";
    expect((await resolve(s.transaction, outcome, evidence)).status).toBe(200);
    expect((await resolve(s.transaction, "house_absorbed")).status).toBeGreaterThanOrEqual(400);
  });
}
for (const network of [BASE_NETWORK, POLYGON_NETWORK]) for (const defect of ["chain", "pending", "failed", "token", "recipient", "amount", "transaction", "rpc"]) {
  it(`${network}: ${defect} cannot close an obligation as refunded`, async () => {
    const s = await seed(network); chainEvidence!.defect = defect;
    const response = await resolve(s.transaction, "refunded", { network, refund_tx: s.refund });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await loadHumanResolution(testEnv, network, s.transaction)).toBeNull();
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).not.toBeNull();
  });
}
it("one refund cannot close two independent purchases", async () => {
  const first = await seed();
  expect((await resolve(first.transaction, "refunded", { network: first.network, refund_tx: first.refund })).status).toBe(200);
  const second = await seed(); chainEvidence!.refund = first.refund;
  expect((await resolve(second.transaction, "refunded", { network: second.network, refund_tx: first.refund })).status).toBeGreaterThanOrEqual(400);
  expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(second.transaction))).not.toBeNull();
});
it("a resolution never discloses its evidence to another payer, product, or network", async () => {
  const s = await seed();
  expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
  for (const change of [{ payer: buyer }, { path: "/api/buy/the_collab" }, { network: POLYGON_NETWORK }]) {
    expect(await readHumanResolution(testEnv, { ...s.intent, network: s.network, ...change })).toBeNull();
  }
});
it("house classification preserves Solana case and accepts EVM checksum variants", () => {
  const wallet = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
  const env = { ...testEnv, HOUSE_WALLETS: `${wallet},0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD` };
  expect(isExactHouseWallet(env, wallet)).toBe(true);
  expect(isExactHouseWallet(env, wallet.toLowerCase())).toBe(false);
  expect(isExactHouseWallet(env, "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(true);
});
it("corrections retain the earlier signed resolution and need evidence again", async () => {
  const s = await seed(); const order = await s.completedOrder();
  expect((await resolve(s.transaction, "fulfilled_by_hand", { network: s.network, order_id: order.order_id })).status).toBe(200);
  const first = await loadHumanResolution(testEnv, s.network, s.transaction);
  expect((await resolve(s.transaction, "refunded", { network: s.network })).status).toBeGreaterThanOrEqual(400);
  expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
  const second = await loadHumanResolution(testEnv, s.network, s.transaction);
  expect(second?.previous?.signature).toBe(first?.signature);
  expect(second?.statement.previous_signature).toBe(first?.signature);
  expect(second?.statement.revision).toBe(2);
});

const fault = vi.hoisted(() => ({ stage: "", hits: 0 }));
vi.mock("@/lib/kv-retry", async original => {
  const actual = await original<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const active = String(args[1]).startsWith("delivery_resolved:");
    if (active && fault.stage === "projection-before") { fault.hits++; throw new Error("fixture write failure"); }
    const value = await actual.kvPut(...args);
    if (active && fault.stage === "projection-after") { fault.hits++; throw new Error("fixture lost acknowledgement"); }
    return value;
  } };
});
vi.mock("@/services/human-resolution-record", async original => {
  const actual = await original<typeof import("@/services/human-resolution-record")>();
  return { ...actual, saveHumanResolution: async (...args: Parameters<typeof actual.saveHumanResolution>) => {
    if (fault.stage === "commit-before") { fault.hits++; throw new Error("fixture storage unavailable"); }
    const value = await actual.saveHumanResolution(...args);
    if (fault.stage === "commit-after") { fault.hits++; throw new Error("fixture lost acknowledgement"); }
    return value;
  } };
});
vi.mock("@/lib/signing", async original => {
  const actual = await original<typeof import("@/lib/signing")>();
  return { ...actual, signMessage: async (...args: Parameters<typeof actual.signMessage>) => {
    if (fault.stage === "signing") { fault.hits++; throw new Error("fixture signing unavailable"); }
    return actual.signMessage(...args);
  } };
});
beforeEach(() => { fault.stage = ""; fault.hits = 0; });
for (const stage of ["signing", "commit-before", "commit-after", "projection-before", "projection-after"]) {
  it(`${stage}: an interrupted resolution keeps the obligation or its retrievable proof`, async () => {
    const s = await seed(); fault.stage = stage;
    const evidence = { network: s.network, refund_tx: s.refund };
    const first = await resolve(s.transaction, "refunded", evidence);
    expect(first.status).toBeGreaterThanOrEqual(400);
    expect(fault.hits).toBeGreaterThan(0);
    const durable = await loadHumanResolution(testEnv, s.network, s.transaction);
    const beforeCommit = stage === "signing" || stage === "commit-before";
    expect(durable === null).toBe(beforeCommit);
    if (stage !== "commit-after") expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).not.toBeNull();
    if (durable) {
      const retry = await s.retry("http");
      expect(retry.body).toMatchObject({ code: "purchase_resolved", refunded: true });
      chainEvidence!.defect = "rpc";
    }
    fault.stage = "";
    expect((await resolve(s.transaction, "refunded", evidence)).status).toBe(200);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).toBeNull();
    expect((await loadHumanResolution(testEnv, s.network, s.transaction))?.statement.revision).toBe(1);
  });
}
it("concurrent resolutions cannot allocate one refund twice", async () => {
  const a = await seed(); const b = await seed();
  // Both original receipts are valid identical-amount payments in this fixture.
  chainEvidence!.refund = a.refund;
  const results = await Promise.all([a, b].map(s => resolveHumanDelivery(testEnv, s.transaction, "refunded", s.intent,
    { network: s.network, refund_tx: a.refund })));
  expect(results.filter(r => r.ok)).toHaveLength(1);
  const records = await Promise.all([a, b].map(s => loadHumanResolution(testEnv, s.network, s.transaction)));
  expect(records.filter(Boolean)).toHaveLength(1);
});

import { beginPurchaseIntent, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { runDurableObjectAlarm } from "cloudflare:test";
import type { PaymentRequirements } from "@x402/core/types";
for (const outcome of ["fulfilled_by_hand", "refunded"] as const) {
  it(`${outcome}: protected purchase status returns the resolution and the alarm creates no replacement`, async () => {
    const s = await seed();
    const purchase = await beginPurchaseIntent(testEnv, { path: s.intent.path, door: "http", payer: s.intent.payer,
      terms: s.offer as PaymentRequirements, payload: s.wire, request: new URLSearchParams(Object.entries(s.args).map(([k, v]) => [k, String(v)])).toString(), item: getMenuItem("aura_walk") });
    const stub = purchaseIntentStore(testEnv, purchase.id);
    await stub.updatePurchase({ state: "settled", payment: { paidUsdc: s.intent.paid_usdc, tipUsdc: 0,
      payer: s.intent.payer, transaction: s.transaction, network: s.network, settleHeaders: {} } });
    const order = outcome === "fulfilled_by_hand" ? await s.completedOrder() : null;
    expect((await resolve(s.transaction, outcome, { network: s.network, ...(order ? { order_id: order.order_id } : { refund_tx: s.refund }) })).status).toBe(200);
    await sourceEnv.ORDERS.delete(`delivery_resolved:${s.transaction}`);
    if (order) await sourceEnv.ORDERS.delete(KV_KEYS.order(order.order_id));
    await sourceEnv.COUNTERS.delete(KV_KEYS.paymentNonce(String(object(object(s.wire.payload).authorization).nonce)));
    await runInDurableObject(stub, async (_instance, state) => {
      const record = await state.storage.get<PurchaseIntent>("purchase");
      await state.storage.put("purchase", { ...record!, delivery: { status: "queued", order_id: "stale-order" } });
    });
    const result = object(await (await request(`/api/purchase-status/${purchase.id}`, { headers: { Authorization: `Bearer ${purchase.token}` } })).json());
    expect(result).toMatchObject({ code: "purchase_resolved", outcome, charged: true, delivery_state: "resolved" });
    expect(object(object(result.resolution).statement).outcome).toBe(outcome);
    if (order) expect(object(result.fulfillment).deliverable).toBe(order.deliverable);
    else expect(result.fulfillment).toBeUndefined();
    expect((await s.retry("http")).body.resolution).toBeTruthy();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runDurableObjectAlarm(stub)).toBe(false);
    expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(0);
  });
}
