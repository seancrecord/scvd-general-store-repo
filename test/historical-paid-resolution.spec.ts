import { installExpiredPaymentFixture, refuseSpentVerification } from "./helpers/expired-payment";
import { idempotencyScope, idempotentPurchaseStore, jsonBodyDigest, storeIdempotent } from "@/lib/idempotency";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers, sendLabor } from "./helpers/labor-admission";
import { NOW, object, request, sourceEnv, testEnv, items, baseline } from "./helpers/buyer-harness";
import { decodePaymentRequired } from "./helpers/payment";
import { evmBuyer, solBuyer, solFacts } from "./helpers/buyer-signed-payments";
import { KV_KEYS } from "@/lib/kv-keys";
import { MENU_ITEMS, getMenuItem } from "@/store";
import { evmChainOf, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { SOLANA_CHAIN, SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import { encodeBase58 } from "@/lib/base58";
import { loadHumanResolution, readHumanResolution } from "@/services/human-resolution-record";
import { beginPurchaseIntent, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { deliverRecordedPurchase } from "@/services/purchase-reconciliation";
import { verifyMessageSignature } from "@/lib/signing";
import type { CommissionRequest } from "@/types";

installLaborAdmissionHarness();
installExpiredPaymentFixture();
const auth = { Authorization: `Basic ${btoa("keeper:test-admin-password")}`, "Content-Type": "application/x-www-form-urlencoded" };
const hex = (n: number) => `0x${n.toString(16)}`;
const topic = (s: string) => `0x${s.slice(2).toLowerCase().padStart(64, "0")}`;
let evidence: { network: string; original: string; refund: string; payer: string; receiver: string; units: string; defect?: string } | null = null;
beforeEach(async () => {
  evidence = null; vi.setSystemTime(NOW);
  const ns = sourceEnv.PAID_RECOVERIES!;
  await runInDurableObject(ns.get(ns.idFromName("human-delivery-resolutions")), async (_instance, state) => state.storage.deleteAll());
});
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null), e = evidence;
    if (!e || !["eth_chainId", "eth_getBlockByNumber", "eth_getTransactionReceipt", "getGenesisHash", "getSignatureStatuses", "getTransaction"].includes(String(body.method))) return inner(input, init);
    if (e.defect === "rpc") throw new Error("fixture RPC unavailable");
    const params = body.params as unknown[], refund = params[0] === e.refund;
    const payer = refund ? e.receiver : e.payer, recipient = refund ? e.payer : e.receiver;
    const units = BigInt(e.units) + (e.defect === "amount" && refund ? 1n : 0n);
    let result: unknown;
    if (e.network.startsWith("eip155:")) {
      const chain = evmChainOf(e.network)!;
      if (body.method === "eth_chainId") result = hex(Number(e.network.split(":")[1]));
      else if (body.method === "eth_getBlockByNumber") result = { number: hex(500) };
      else result = { transactionHash: params[0], status: "0x1", blockNumber: hex(refund ? 200 : 100), logs: [{ address: chain.usdc,
        topics: [TRANSFER_TOPIC, topic(payer), topic(recipient)], data: `0x${units.toString(16)}` }] };
    } else {
      if (body.method === "getGenesisHash") result = `${SOLANA_CHAIN.split(":")[1]}fixture`;
      else if (body.method === "getSignatureStatuses") result = { value: [{ err: null, slot: (params[0] as string[])[0] === e.refund ? 200 : 100, confirmationStatus: "finalized" }] };
      else {
        const balance = (owner: string, accountIndex: number, amount: string) => ({ owner, accountIndex, mint: SOLANA_USDC_MINT, uiTokenAmount: { amount, decimals: 6 } });
        result = { slot: refund ? 200 : 100, transaction: { signatures: [params[0]] }, meta: { err: null,
          preTokenBalances: [balance(payer, 0, String(units)), balance(recipient, 1, "0")],
          postTokenBalances: [balance(payer, 0, "0"), balance(recipient, 1, String(units))] } };
      }
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
});
async function resolve(transaction: string, outcome: string, fields: Record<string, string> = {}) {
  return request("/admin/delivery/resolve", { method: "POST", headers: auth,
    body: new URLSearchParams({ transaction, outcome, ...fields }) });
}
const extraPaths = ["/api/commission/pay/25", "/almanac/old-page", "/gazette/issue-1", "/zodiac/archive/old-page", "/api/buy/retired-product"];
for (const path of [...MENU_ITEMS.map(item => `/api/buy/${item.id}`), ...extraPaths]) {
  it(`${path}: an outcome label cannot erase a historical buyer obligation`, async () => {
    const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
    const intent = { path, transaction, payer: evmBuyer.address, paid_usdc: 1, settled_at: NOW.toISOString() };
    await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
    for (const outcome of ["fulfilled_by_hand", "refunded", "house_absorbed"]) {
      expect((await resolve(transaction, outcome)).status).toBeGreaterThanOrEqual(400);
      expect(await sourceEnv.ORDERS.get(`delivery_resolved:${transaction}`)).toBeNull();
      expect(JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)))!)).toEqual(intent);
    }
  });
}
async function seed(rail: number, shelf: string, retained = false) {
  const id = crypto.randomUUID(); let url: string;
  if (shelf === "commission") {
    const quote: CommissionRequest = { id, description: `SCVD-E2E-${id}`, contact: "private@example.com", date: NOW.toISOString(), offer_usdc: 25,
      status: "quoted", quote_usdc: 25, quote_window_hours: 72, quoted_at: NOW.toISOString(), quote_expires_at: new Date(+NOW + 86400000).toISOString() };
    await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify(quote));
    url = `/api/commission/pay/25?commission=${id}`;
  } else if (shelf === "almanac") {
    await sourceEnv.ORDERS.put(KV_KEYS.almanacEntry(id), JSON.stringify({ slug: id, title: id, teaser: id, date: NOW.toISOString(), markdown: `SCVD-E2E-${id}` }));
    url = `/almanac/${id}`;
  } else if (shelf === "gazette") {
    await sourceEnv.ORDERS.put(KV_KEYS.gazetteIssue(999999), JSON.stringify({ issue_number: 999999, title: id, date: NOW.toISOString(), markdown: id, contributors: [], tip_ids: [], signature: "fixture", public_key: "fixture" }));
    url = "/gazette/issue-999999";
  } else if (shelf === "zodiac") {
    const index = object(await (await request("/zodiac/archive?view=compact")).json());
    url = String((index.pages as Record<string, unknown>[])[0]!.buy_url);
  } else {
    const item = items.find(i => i.id === shelf)!;
    url = `/api/buy/${shelf}?${new URLSearchParams(baseline(item) as Record<string, string>)}`;
  }
  const response = await request(url); expect(response.status).toBe(402);
  const network = laborNetworks()[rail]!, offer = decodePaymentRequired(response).accepts.find(a => a.network === network)!;
  const wire = await signLabor(offer), sol = network === SOLANA_CHAIN;
  const transaction = sol ? (await solFacts(wire)).tx : `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const refund = sol ? encodeBase58(new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(id)))) : `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  const path = new URL(url, testEnv.STORE_BASE_URL).pathname, payer = sol ? solBuyer : evmBuyer.address;
  const intent = { path, transaction, payer, paid_usdc: Number(offer.amount) / 1e6, settled_at: NOW.toISOString() };
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(intent));
  if (!sol) await sourceEnv.COUNTERS.put(KV_KEYS.paymentNonce(String(object(object(wire.payload).authorization).nonce)), JSON.stringify({ path, transaction }));
  evidence = { network, original: transaction, refund, payer, receiver: offer.payTo, units: offer.amount };
  let record: PurchaseIntent | undefined;
  if (retained) {
    record = await beginPurchaseIntent(testEnv, { path, door: "http", payer, payload: wire, terms: { ...offer, network: network as `${string}:${string}`, extra: offer.extra ?? {} },
      request: new URL(url, testEnv.STORE_BASE_URL).search.slice(1), item: getMenuItem(shelf),
      ...(shelf === "almanac" ? { publication: { minimum_usdc: intent.paid_usdc, markdown: id, content_type: "text/markdown" } } : {}) });
    await purchaseIntentStore(testEnv, record.id).updatePurchase({ state: "settled", payment: { paidUsdc: intent.paid_usdc, tipUsdc: 0, transaction, network, payer, settleHeaders: {} } });
    record = JSON.parse((await purchaseIntentStore(testEnv, record.id).existingPurchase())!);
  }
  return { ...intent, network, refund, wire, record, offer, url, retry: () => request(url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(wire)) } }) };
}
for (const [rail] of laborNetworks().entries()) for (const shelf of ["small_blessing", "commission", "almanac", "gazette", "zodiac"]) {
  it(`${shelf} rail ${rail}: a verified full refund returns the signed resolution through the original paid door`, async () => {
    const s = await seed(rail, shelf);
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
    const record = await loadHumanResolution(testEnv, s.network, s.transaction);
    expect(record?.statement.evidence.refund).toMatchObject({ transaction: s.refund, network: s.network, recipient: s.network.startsWith("eip155:") ? s.payer.toLowerCase() : s.payer, amount_units: evidence!.units });
    expect(await verifyMessageSignature(record!.signed_payload, record!.signature, record!.public_key)).toBe(true);
    expect(await verifyMessageSignature(record!.signed_payload.replace(s.refund, s.transaction), record!.signature, record!.public_key)).toBe(false);
    await sourceEnv.ORDERS.delete(`delivery_resolved:${s.transaction}`);
    for (let n = 0; n < 2; n++) {
      const reply = await s.retry(); expect(reply.status).toBe(409);
      expect(object(await reply.json())).toMatchObject({ code: "purchase_resolved", charged: true, charged_again: false, refunded: true });
    }
    if (shelf === "small_blessing") for (const door of ["mcp", "mcp-standard"] as const) {
      const response = await sendLabor(shelf, door, {}, s.wire);
      expect(response.body).toMatchObject({ code: "purchase_resolved", charged_again: false, refunded: true });
      expect(response.refused).toBe(true); expect(response.quote).toBe(false);
    }
    expect(transfers).toBe(0);
    expect(await readHumanResolution(testEnv, { ...s, payer: s.payer === evmBuyer.address ? "0x2222222222222222222222222222222222222222" : evmBuyer.address })).toBeNull();
  });
}
for (const [rail] of laborNetworks().entries()) for (const shelf of ["small_blessing", "almanac"]) {
  it(`${shelf} rail ${rail}: private status, direct recovery and alarm respect an existing refund`, async () => {
    const s = await seed(rail, shelf, true), p = s.record!;
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
    expect(await deliverRecordedPurchase(testEnv, p)).toBeNull();
    expect(await runDurableObjectAlarm(purchaseIntentStore(testEnv, p.id))).toBe(true);
    const status = object(await (await request(`/api/purchase-status/${p.id}`, { headers: { Authorization: `Bearer ${p.token}` } })).json());
    expect(status).toMatchObject({ code: "purchase_resolved", refunded: true, charged_again: false });
    expect(status.fulfillment).toBeUndefined(); expect(transfers).toBe(0);
  });
}
for (const [rail] of laborNetworks().entries()) for (const defect of ["amount", "rpc"]) {
  it(`rail ${rail}: invalid ${defect} refund evidence leaves a publication obligation open`, async () => {
    const s = await seed(rail, "almanac"); evidence!.defect = defect;
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBeGreaterThanOrEqual(400);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))).not.toBeNull();
    expect(await loadHumanResolution(testEnv, s.network, s.transaction)).toBeNull();
  });
}
for (const [rail] of laborNetworks().entries()) {
  it(`rail ${rail}: one refund cannot close two publication purchases, even concurrently`, async () => {
    const first = await seed(rail, "almanac"), second = await seed(rail, "almanac");
    evidence!.refund = first.refund;
    const results = await Promise.all([resolve(first.transaction, "refunded", { network: first.network, refund_tx: first.refund }),
      resolve(second.transaction, "refunded", { network: second.network, refund_tx: first.refund })]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    const debts = await Promise.all([first, second].map(s => sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction))));
    expect(debts.filter(Boolean)).toHaveLength(1);
  });
  it(`rail ${rail}: a verified correction preserves the old label and survives lost projections`, async () => {
    const s = await seed(rail, "almanac");
    const intent = JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction)))!);
    const prior = { outcome: "fulfilled_by_hand", intent };
    await sourceEnv.ORDERS.put(`delivery_resolved:${s.transaction}`, JSON.stringify(prior));
    await sourceEnv.ORDERS.delete(KV_KEYS.deliveryIntent(s.transaction));
    const fields = { network: s.network, refund_tx: s.refund };
    expect((await resolve(s.transaction, "refunded", fields)).status).toBe(200);
    expect((await loadHumanResolution(testEnv, s.network, s.transaction))?.legacy_resolution).toEqual(prior);
    await sourceEnv.ORDERS.delete(`delivery_resolved:${s.transaction}`);
    evidence!.defect = "rpc";
    expect((await resolve(s.transaction, "refunded", fields)).status).toBe(200);
    expect(object(await (await s.retry()).json())).toMatchObject({ code: "purchase_resolved", refunded: true });
  });
  it(`rail ${rail}: a product leaving the catalogue cannot block a verified historical refund`, async () => {
    const s = await seed(rail, "small_blessing");
    const intent = JSON.parse((await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(s.transaction)))!);
    intent.path = "/api/buy/retired-product";
    await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(s.transaction), JSON.stringify(intent));
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
    expect((await readHumanResolution(testEnv, { ...s, path: intent.path }))?.statement.outcome).toBe("refunded");
  });
}
for (const bad of [null, false, 0, {}, { path: "/almanac/old-page" }]) {
  it(`incomplete original record ${JSON.stringify(bad)} cannot fall through to an unverified resolution`, async () => {
    const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
    await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify(bad));
    expect((await resolve(transaction, "refunded", { network: laborNetworks()[0]! })).status).toBeGreaterThanOrEqual(400);
    expect(await sourceEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction))).toBe(JSON.stringify(bad));
    expect(await sourceEnv.ORDERS.get(`delivery_resolved:${transaction}`)).toBeNull();
  });
}
it("the keeper's directions require evidence for every paid product", async () => {
  const transaction = `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
  await sourceEnv.ORDERS.put(KV_KEYS.deliveryIntent(transaction), JSON.stringify({ path: "/almanac/old-page", transaction,
    payer: evmBuyer.address, paid_usdc: 1, settled_at: new Date(+NOW - 3600000).toISOString() }));
  const desk = object(await (await request("/admin/deliveries", { headers: auth })).json());
  expect(String(desk.what_to_do)).not.toContain("delete the row");
  expect(String(desk.what_to_do)).toContain("/admin/delivery/resolve");
  const page = await (await request("/admin/reconciliation", { headers: { Authorization: auth.Authorization, Accept: "text/html" } })).text();
  expect(page).not.toContain("<legend>Human purchase evidence</legend>");
  expect(page).toContain("<legend>Paid purchase evidence</legend>");
});

for (const [rail] of laborNetworks().entries()) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`rail ${rail} ${door}: a fresh authorization with the purchase key returns its refund before cached goods`, async () => {
    const s = await seed(rail, "small_blessing", true), key = crypto.randomUUID();
    const query = new URL(s.url, testEnv.STORE_BASE_URL).searchParams;
    const args = Object.fromEntries(query);
    const surface = door === "http"
      ? await idempotencyScope(s.path, query)
      : await idempotencyScope("mcp:buy_small_blessing", new URLSearchParams(), await jsonBodyDigest({ item_id: "small_blessing", ...args }));
    const slot = await idempotentPurchaseStore(testEnv, surface, s.payer, key);
    expect(await slot.claimIdempotentPurchase(s.record!.id)).toBe(s.record!.id);
    await storeIdempotent(testEnv, surface, s.payer, key, { obsolete_cached_goods: true });
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
    const fresh = await signLabor(s.offer);
    const response = door === "http"
      ? { body: object(await (await request(s.url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(fresh)), "Idempotency-Key": key } })).json()) }
      : await sendLabor("small_blessing", door, args, fresh, key);
    expect(response.body).toMatchObject({ code: "purchase_resolved", refunded: true, transaction: s.transaction, charged_again: false });
    expect(response.body.obsolete_cached_goods).toBeUndefined();
    expect(transfers).toBe(0);
  });
}

for (const [rail] of laborNetworks().entries()) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`rail ${rail} ${door}: an expired original payment retrieves its signed refund without a key`, async () => {
    const s = await seed(rail, "small_blessing", true);
    expect((await resolve(s.transaction, "refunded", { network: s.network, refund_tx: s.refund })).status).toBe(200);
    refuseSpentVerification();
    const args = Object.fromEntries(new URL(s.url, testEnv.STORE_BASE_URL).searchParams);
    const response = door === "http"
      ? { body: object(await (await request(s.url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(s.wire)) } })).json()) }
      : await sendLabor("small_blessing", door, args, s.wire);
    expect(response.body).toMatchObject({ code: "purchase_resolved", refunded: true, transaction: s.transaction, charged_again: false });
    expect(object(response.body.resolution).signature).toBeTruthy();
    expect(transfers).toBe(0);
  });
}
