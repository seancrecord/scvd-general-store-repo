import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ mint: false, hits: 0, afterDelivery: false }));
vi.mock("@/services/certificates", async original => {
  const actual = await original<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault.mint) { fault.hits++; throw new Error("fixture signing outage"); }
    return actual.mintCertificate(...args);
  } };
});
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { extractPaymentNonce } from "@/lib/replay-guard";
vi.mock("@/services/fulfillment", async original => {
  const actual = await original<typeof import("@/services/fulfillment")>();
  return { ...actual, fulfillPurchase: async (...args: Parameters<typeof actual.fulfillPurchase>) => {
    const good = await actual.fulfillPurchase(...args);
    if (good && fault.afterDelivery) throw new Error("fixture execution stops before purchase status write");
    return good;
  } };
});
import { getPaymentStack } from "@/lib/payments";
import { evmChainOf, AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC } from "@/lib/base-rpc";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, type LaborDoor } from "./helpers/labor-admission";
import { items, shelves, call, object, request, testEnv, sourceEnv, NOW } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { completeOrder, getOrder } from "@/services/orders";
import { getMenuItem } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";

installLaborAdmissionHarness();
const RECOVERY_NOW = NOW;
let evidence: { record: PurchaseIntent; transaction: string; defect?: string } | null = null;
const topics = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = object(init?.body ? JSON.parse(String(init.body)) : null);
    if (!evidence || !String(body.method).startsWith("eth_")) return inner(input, init);
    const { record, transaction, defect } = evidence;
    const params = body.params as unknown[], chain = evmChainOf(record.terms.network)!;
    const hex = (n: number) => `0x${n.toString(16)}`;
    let result: unknown;
    if (defect === "rpc") throw new Error("fixture RPC outage");
    if (body.method === "eth_chainId") result = hex(defect === "chain" ? 1 : Number(chain.caip2.split(":")[1]));
    else if (body.method === "eth_getBlockByNumber") result = params[0] === "finalized"
      ? defect === "unfinalized" ? null : { number: hex(2000) }
      : { timestamp: hex(Math.floor(RECOVERY_NOW.getTime() / 1000) - 3600 + Number.parseInt(String(params[0]), 16) * 2) };
    else if (body.method === "eth_getLogs") {
      const filter = object(params[0]);
      expect(filter.address).toBe(chain.usdc);
      expect(filter.topics).toEqual([AUTHORIZATION_USED_TOPIC, topics(record.payer), record.authorization!.nonce]);
      const from = Number.parseInt(String(filter.fromBlock), 16), to = Number.parseInt(String(filter.toBlock), 16);
      result = defect === "missing" || from > 1800 || to < 1800 ? [] : [{ transactionHash: transaction }];
    } else if (body.method === "eth_getTransactionReceipt") result = {
      transactionHash: transaction, blockNumber: hex(1800), status: defect === "failed" ? "0x0" : "0x1",
      logs: [
        { address: chain.usdc, topics: [AUTHORIZATION_USED_TOPIC, topics(record.payer), defect === "nonce" ? `0x${"ff".repeat(32)}` : record.authorization!.nonce], data: "0x" },
        { address: defect === "token" ? `0x${"ff".repeat(20)}` : chain.usdc,
          topics: [TRANSFER_TOPIC, topics(defect === "payer" ? `0x${"ee".repeat(20)}` : record.payer), topics(defect === "recipient" ? `0x${"ee".repeat(20)}` : record.terms.payTo)],
          data: hex(Number(record.terms.amount) + (defect === "amount" ? 1 : 0)) },
      ],
    };
    else return inner(input, init);
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  });
});
beforeEach(async () => {
  fault.mint = false; fault.hits = 0; fault.afterDelivery = false; evidence = null;
  vi.setSystemTime(RECOVERY_NOW);
  await sourceEnv.COUNTERS.put(KV_KEYS.keeperLastSeen, RECOVERY_NOW.toISOString());
});
afterEach(() => { vi.restoreAllMocks(); vi.setSystemTime(NOW); });

async function interrupted(id: string, door: LaborDoor, rail: number, unknown: boolean) {
  const item = items.find(i => i.id === id)!, network = laborNetworks()[rail]!;
  const canary = `SCVD-E2E-${crypto.randomUUID()}-${"x".repeat(id === "context_anchor" ? 610 : 300)} 🧾 e\u0301`;
  const args = { [id === "context_anchor" ? "summary" : "detail"]: canary, purpose: "original paid input" };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const signed = await signLabor(offer);
  const payer = network.startsWith("eip155:") ? evmBuyer.address : solBuyer;
  const identity = extractPaymentNonce(signed) ?? object(signed.payload).transaction;
  const purchaseId = await sha256Hex(jcsCanonicalize({ network, payer: network.startsWith("eip155:") ? payer.toLowerCase() : payer, identity }));
  const stub = purchaseIntentStore(testEnv, purchaseId);
  const stack = getPaymentStack(testEnv), original = stack.httpServer.processSettlement.bind(stack.httpServer);
  let transaction = "";
  const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...a) => {
    const result = await original(...a);
    transaction = String(result.transaction);
    if (unknown) throw new Error("fixture loses settlement acknowledgement");
    return result;
  });
  fault.mint = !unknown;
  const first = await sendLabor(id, door, args, signed, crypto.randomUUID());
  expect(first.refused).toBe(true);
  expect(spy).toHaveBeenCalledTimes(1);
  const saved = await stub.existingPurchase();
  expect(saved).not.toBeNull();
  const record = JSON.parse(saved!) as PurchaseIntent;
  expect(record.state).toBe(unknown ? "unknown" : "settled");
  expect(await runInDurableObject(stub, (_, state) => state.storage.getAlarm())).not.toBeNull();
  // Losing the old best-effort desk row cannot lose this wake-up.
  if (record.reconciliation_reference) await sourceEnv.COUNTERS.delete(record.reconciliation_reference);
  evidence = network.startsWith("eip155:") && unknown ? { record, transaction } : null;
  fault.mint = false;
  const read = async () => object(await (await request(`/api/purchase-status/${purchaseId}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  return { stub, record, canary, read, spy, transaction, network };
}

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const rail of [0, 1, 2, 3, 4]) {
  it(`${door} rail ${rail}: a confirmed paid anchor is delivered by its alarm after signing failed`, async () => {
    const fixture = await interrupted("context_anchor", door, rail, false);
    expect(fault.hits).toBeGreaterThan(0);
    expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
    const status = await fixture.read();
    expect(status).toMatchObject({ charged: true, delivery_state: "delivered" });
    const good = object(status.fulfillment), certificate = object(good.certificate);
    const anchor = object(await (await request(String(good.anchor_url))).json());
    expect(object(anchor.anchor).summary).toBe(fixture.canary);
    expect(certificate).toMatchObject({ network: fixture.network, settlement_tx: fixture.transaction, purpose: "original paid input" });
    expect(object(await (await request(String(good.verify_url))).json()).valid).toBe(true);
    expect(await runDurableObjectAlarm(fixture.stub)).toBe(false);
    expect(fixture.spy).toHaveBeenCalledTimes(1);
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  });
}

for (const door of ["http", "mcp", "mcp-standard"] as const) for (const rail of [0, 1, 2, 3]) {
  it(`${door} EVM rail ${rail}: finalized original payment creates the owed order after ambiguity`, async () => {
    const fixture = await interrupted("the_collab", door, rail, true);
    const menu = getMenuItem("the_collab")!, originalSla = menu.sla_hours;
    try {
      menu.sla_hours = 1;
      await sourceEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
      vi.setSystemTime(new Date(RECOVERY_NOW.getTime() + 86400_000));
      expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
      const status = await fixture.read();
      expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "order_created", transaction: fixture.transaction });
      const good = object(status.fulfillment), orderId = String(good.order_id);
      const order = await getOrder(testEnv, orderId);
      expect(order).toMatchObject({ detail: fixture.canary, created_at: fixture.record.created_at, sla_hours: originalSla });
      const deliverable = `Human response to ${fixture.canary}`;
      await completeOrder(testEnv, orderId, deliverable);
      expect(await fixture.read()).toMatchObject({ delivery_state: "delivered", fulfillment: { order_id: orderId, deliverable } });
      const mcp = object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
        name: "check_purchase", arguments: { purchase_id: fixture.record.id, status_token: fixture.record.token },
      } }) })).json());
      expect(object(mcp.result).structuredContent).toMatchObject({ delivery_state: "delivered", fulfillment: { order_id: orderId, deliverable } });
      expect(fixture.spy).toHaveBeenCalledTimes(1);
      expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(1);
    } finally { menu.sla_hours = originalSla; }
  });
}

for (const defect of ["rpc", "unfinalized", "chain", "nonce", "token", "payer", "recipient", "amount", "failed", "missing"]) {
  it(`${defect}: insufficient payment evidence stays unknown and scheduled, then recovers after evidence arrives`, async () => {
    const fixture = await interrupted("context_anchor", "http", 1, true);
    evidence!.defect = defect;
    expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
    expect(await fixture.read()).toMatchObject({ charged: null, payment_state: "unknown" });
    expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(0);
    expect(await runInDurableObject(fixture.stub, (_, state) => state.storage.getAlarm())).not.toBeNull();
    {
      delete evidence!.defect;
      expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
      expect(await fixture.read()).toMatchObject({ charged: true, delivery_state: "delivered" });
    }
    expect(fixture.spy).toHaveBeenCalledTimes(1);
  });
}

it("a signing outage lasting longer than the platform retry limit retains a wake-up and resumes one artifact", async () => {
  const fixture = await interrupted("context_anchor", "http", 1, true);
  fault.mint = true;
  for (let attempt = 0; attempt < 8; attempt++) expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
  expect(await fixture.read()).toMatchObject({ charged: true, delivery_state: "not_established_by_this_record" });
  fault.mint = false;
  expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
  expect(await fixture.read()).toMatchObject({ charged: true, delivery_state: "delivered" });
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  expect(fixture.spy).toHaveBeenCalledTimes(1);
});

it("an interruption between fulfilled order and status write preserves completed human work on alarm retry", async () => {
  const fixture = await interrupted("the_collab", "mcp", 1, true);
  fault.afterDelivery = true;
  expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
  const rows = await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix });
  expect(rows.keys).toHaveLength(1);
  const orderId = rows.keys[0]!.name.slice(KV_KEYS.orderPrefix.length);
  await completeOrder(testEnv, orderId, `Completed ${fixture.canary}`);
  fault.afterDelivery = false;
  expect(await runDurableObjectAlarm(fixture.stub)).toBe(true);
  expect(await fixture.read()).toMatchObject({ delivery_state: "delivered", fulfillment: { order_id: orderId, deliverable: `Completed ${fixture.canary}` } });
  expect((await sourceEnv.ORDERS.list({ prefix: KV_KEYS.orderPrefix })).keys).toHaveLength(1);
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  expect(fixture.spy).toHaveBeenCalledTimes(1);
});
