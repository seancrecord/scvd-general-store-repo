import { deliverRecordedPurchase } from "@/services/purchase-reconciliation";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { atomicToUsdc, getPaymentStack } from "@/lib/payments";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { completeOrder, getOrder } from "@/services/orders";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { NOW, object, request, sourceEnv, testEnv } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { decodePaymentRequired } from "./helpers/payment";
import type { CommissionRequest } from "@/types";

installLaborAdmissionHarness();
let fault = "", hits = 0;
vi.mock("@/services/certificates", async load => {
  const actual = await load<typeof import("@/services/certificates")>();
  return { ...actual, mintCertificate: async (...args: Parameters<typeof actual.mintCertificate>) => {
    if (fault === "certificate-before") { hits++; throw new Error("fixture certificate interruption"); }
    const result = await actual.mintCertificate(...args);
    if (fault === "certificate-after") { hits++; throw new Error("fixture certificate acknowledgement"); }
    return result;
  } };
});
vi.mock("@/services/commission-desk", async load => {
  const actual = await load<typeof import("@/services/commission-desk")>();
  return { ...actual, acceptCommission: async (...args: Parameters<typeof actual.acceptCommission>) => {
    if (fault === "desk-before") { hits++; throw new Error("fixture desk interruption"); }
    await actual.acceptCommission(...args);
    if (fault === "desk-after") { hits++; throw new Error("fixture desk acknowledgement"); }
  } };
});
vi.mock("@/lib/kv-retry", async load => {
  const actual = await load<typeof import("@/lib/kv-retry")>();
  return { ...actual, kvPut: async (...args: Parameters<typeof actual.kvPut>) => {
    const order = args[1].startsWith(KV_KEYS.orderPrefix);
    if (order && fault === "order-before") { hits++; throw new Error("fixture order interruption"); }
    await actual.kvPut(...args);
    if (order && fault === "order-after") { hits++; throw new Error("fixture order acknowledgement"); }
  } };
});
beforeAll(() => {
  const namespace = testEnv.PAID_RECOVERIES!;
  testEnv.PAID_RECOVERIES = new Proxy(namespace, { get(target, property) {
    if (property === "get") return (...args: Parameters<typeof namespace.get>) => {
      const stub = target.get(...args);
      return new Proxy(stub, { get(inner, method) {
        if (method === "beginPurchase") return async (...a: Parameters<typeof inner.beginPurchase>) => {
          if (fault === "capture") { hits++; throw new Error("fixture purchase unavailable"); }
          return inner.beginPurchase(...a);
        };
        const member = Reflect.get(inner, method);
        return typeof member === "function" ? (...a: unknown[]) => Reflect.apply(member, inner, a) : member;
      } });
    };
    const member = Reflect.get(target, property);
    return typeof member === "function" ? member.bind(target) : member;
  } });
});
beforeEach(() => { fault = ""; hits = 0; vi.setSystemTime(NOW); });
async function purchase(rail: number) {
  const id = `req_${crypto.randomUUID()}`;
  const brief = `${"observe 👁 é & ?\n".repeat(50)}SCVD-E2E-${id}`;
  const quote: CommissionRequest = { id, description: brief, contact: "private@example.com", date: NOW.toISOString(),
    offer_usdc: 25, status: "quoted", quote_usdc: 25, quote_window_hours: 72,
    quoted_at: NOW.toISOString(), quote_expires_at: new Date(NOW.getTime() + 86400000).toISOString(), quote_note: "Preserve this exact scope." };
  await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(id), JSON.stringify(quote));
  const path = `/api/commission/pay/25?commission=${id}&agent_name=SCVD-E2E-buyer`;
  const challenge = await request(path); expect(challenge.status).toBe(402);
  const network = laborNetworks()[rail]!;
  const accepted = decodePaymentRequired(challenge).accepts.find(a => a.network === network)!;
  expect(accepted).toBeDefined();
  const payment = await signLabor(accepted);
  const identity = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, payment);
  return { id, brief, quote, path, network, payment, stub: purchaseIntentStore(sourceEnv, identity.id),
    send: (url = path) => request(url, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)) } }) };
}
async function recover(p: Awaited<ReturnType<typeof purchase>>) {
  expect(await runDurableObjectAlarm(p.stub)).toBe(true);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  const status = object(await (await request(`/api/purchase-status/${record.id}`, { headers: { Authorization: `Bearer ${record.token}` } })).json());
  expect(status).toMatchObject({ charged: true, payment_state: "settled", delivery_state: "order_created" });
  const good = object(status.fulfillment);
  const order = await getOrder(sourceEnv, String(good.order_id));
  expect(order?.detail).toBe(`Commission ${p.id}: ${p.brief}`);
  expect(order?.created_at).toBe(NOW.toISOString());
  expect(order?.sla_hours).toBe(72);
  expect(good.commission_terms).toMatchObject({ description: p.brief, window_hours: 72, quote_usdc: 25 });
  expect(JSON.stringify(status)).not.toContain("private@example.com");
  const verified = object(await (await request(String(good.verify_url))).json());
  expect(verified.valid).toBe(true);
  expect(transfers).toBe(1);
  return { good, record, order };
}
for (const [rail] of laborNetworks().entries()) {
  for (const point of ["certificate-before", "certificate-after", "desk-before", "desk-after", "order-before", "order-after"]) {
    it(`rail ${rail}: ${point} retains the full commission and recovers once after quote loss`, async () => {
      const p = await purchase(rail); fault = point;
      const response = await p.send(), body = object(await response.json());
      expect(body.charged).toBe(true); expect(hits).toBeGreaterThan(0); expect(transfers).toBe(1);
      expect(object(body.recovery).status_token).toBeTypeOf("string");
      const immediate = await p.send(), retry = object(await immediate.json());
      expect(immediate.status).toBe(503);
      expect(retry).toMatchObject({ charged: true, charged_again: false });
      expect(object(retry.recovery).status_token).toBe(object(body.recovery).status_token);
      expect(transfers).toBe(1);
      fault = "";
      await sourceEnv.ORDERS.delete(KV_KEYS.commissionRequest(p.id));
      await sourceEnv.COUNTERS.delete("keeper_last_seen");
      const { good } = await recover(p);
      const replay = await p.send(); expect(replay.status).toBe(200);
      expect(object(await replay.json()).order_id).toBe(good.order_id);
      expect(transfers).toBe(1);
    });
  }
  it(`rail ${rail}: purchase-record failure refuses before settlement`, async () => {
    const p = await purchase(rail); fault = "capture";
    const response = await p.send();
    expect(response.status).toBe(503); expect(hits).toBeGreaterThan(0); expect(transfers).toBe(0);
    expect(object(await response.json()).settlement_attempted).toBe(false);
    expect(await p.stub.existingPurchase()).toBeNull();
    fault = ""; expect((await p.send()).status).toBe(200); await recover(p);
  });
  it(`rail ${rail}: simultaneous retries retain one order and later completed work`, async () => {
    const p = await purchase(rail);
    const responses = await Promise.all([p.send(), p.send()]);
    expect(responses.some(response => response.status === 200)).toBe(true);
    const { good } = await recover(p);
    await completeOrder(sourceEnv, String(good.order_id), `SCVD-E2E completed ${p.id}`);
    const replay = object(await (await p.send()).json());
    expect(replay).toMatchObject({ order_id: good.order_id, status: "completed", deliverable: `SCVD-E2E completed ${p.id}` });
    expect(transfers).toBe(1);
  });
  it(`rail ${rail}: changed quote and expired shelf cannot replace an accepted brief`, async () => {
    const p = await purchase(rail), first = object(await (await p.send()).json());
    expect(first.order_id).toBeTypeOf("string");
    await sourceEnv.ORDERS.put(KV_KEYS.commissionRequest(p.id), JSON.stringify({ ...p.quote, description: "WRONG BRIEF", quote_window_hours: 1 }));
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 86400000));
    const { good } = await recover(p); expect(good.order_id).toBe(first.order_id);
    const desk = object(await (await request(`/api/commission/${p.id}`)).json());
    expect(desk.description).toBe(p.brief);
    expect(desk.accepted_at).toBe(NOW.toISOString());
    const mismatch = await p.send(p.path.replace(p.id, "different-commission"));
    expect(mismatch.status).not.toBe(200); expect(transfers).toBe(1);
  });
  it(`rail ${rail}: a lost settlement answer retains terms before any order exists`, async () => {
    const p = await purchase(rail), stack = getPaymentStack(testEnv);
    const settle = stack.httpServer.processSettlement.bind(stack.httpServer);
    let receipt: Awaited<ReturnType<typeof settle>> | undefined;
    const spy = vi.spyOn(stack.httpServer, "processSettlement").mockImplementation(async (...args) => {
      if (!receipt) receipt = await settle(...args);
      throw new TypeError("fixture dropped paid response");
    });
    try {
      expect(object(await (await p.send()).json()).charged).toBeNull(); expect(transfers).toBe(1);
      const saved = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
      expect(saved.state).toBe("unknown"); expect(saved.commission?.description).toBe(p.brief);
      if (!receipt?.success) throw new Error("Fixture settlement missing");
      await p.stub.updatePurchase({ state: "settled", payment: { transaction: receipt.transaction, network: p.network,
        payer: saved.payer, paidUsdc: atomicToUsdc(saved.terms.amount), tipUsdc: 0, settleHeaders: receipt.headers } });
      await sourceEnv.ORDERS.delete(KV_KEYS.commissionRequest(p.id));
      await recover(p);
    } finally { spy.mockRestore(); }
  });
}

it("an older commission without its retained brief cannot become a generic collab", async () => {
  const p = await purchase(0);
  expect((await p.send()).status).toBe(200);
  const record = JSON.parse((await p.stub.existingPurchase())!) as PurchaseIntent;
  delete record.commission;
  expect(await deliverRecordedPurchase(testEnv, record)).toBeNull();
  expect(transfers).toBe(1);
});

it("a spent legacy commission never falls through to an unpaid generic handler", async () => {
  const p = await purchase(0); fault = "certificate-before";
  expect(object(await (await p.send()).json()).charged).toBe(true);
  await runInDurableObject(p.stub, async (_instance, state) => { await state.storage.delete("purchase"); });
  fault = "";
  const retry = object(await (await p.send()).json());
  expect(retry).toMatchObject({ charged: true, charged_again: false, recovery_reason: "original_inputs_unavailable" });
  expect(transfers).toBe(1);
});
