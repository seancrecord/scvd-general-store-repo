import { runDurableObjectAlarm } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { completeOrder } from "@/services/orders";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor, transfers, type LaborDoor } from "./helpers/labor-admission";
import { baseline, items, shelves, call, object, request, sourceEnv, testEnv, facilitator, NOW, type Obj } from "./helpers/buyer-harness";
import { evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";

installLaborAdmissionHarness();
let blocked = false, fulfillments = 0;
vi.mock("@/services/fulfillment", async original => {
  const actual = await original<typeof import("@/services/fulfillment")>();
  return { ...actual, fulfillPurchase: async (...args: Parameters<typeof actual.fulfillPurchase>) => {
    fulfillments++;
    if (blocked) throw new Error("Fixture forbids fulfillment on a completed-purchase replay");
    return actual.fulfillPurchase(...args);
  } };
});
beforeEach(() => { blocked = false; fulfillments = 0; vi.setSystemTime(NOW); });
const doors = ["http", "mcp", "mcp-standard"] as const;
async function wire(id: string, door: LaborDoor, args: Obj, payment: Obj, key?: string) {
  const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
  const response = door === "http"
    ? await request(`${item.buy_url}?${new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)]))}`, {
      headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payment)), ...(key ? { "Idempotency-Key": key } : {}) },
    })
    : await request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: tool.name, arguments: { item_id: id, ...args },
        _meta: { "x402/payment": payment, ...(key ? { "x402/idempotency-key": key } : {}) } },
    }) });
  const raw = object(await response.json()), result = object(raw.result), error = object(raw.error);
  return { status: response.status,
    refused: door === "http" ? !response.ok : !!raw.error || result.isError === true,
    body: door === "http" ? raw : raw.error ? object(error.data) : object(result.structuredContent),
    receipt: door === "http" ? response.headers.get("Payment-Response") : object(result._meta)["x402/payment-response"],
  };
}
async function purchase(id: string, door: LaborDoor, network: string) {
  const item = items.find(i => i.id === id)!, canary = `SCVD-E2E-${crypto.randomUUID()}`;
  const args = { ...baseline(item), agent_name: canary, purpose: canary };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const payment = await signLabor(offer), key = crypto.randomUUID();
  expect((await sendLabor(id, door, args, payment, key)).refused).toBe(false);
  const identity = await purchaseIdentity(network, network.startsWith("eip155:") ? evmBuyer.address : solBuyer, payment);
  const stub = purchaseIntentStore(sourceEnv, identity.id);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  const record = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(record.state).toBe("settled");
  expect(object(record.delivery?.certificate).item).toBe(id);
  const calls = fulfillments;
  // The local facilitator validates the signature on replay. Expired or
  // rejected facilitator verification remains a separate buyer finding.
  vi.setSystemTime(new Date(NOW.getTime() + 86400_000));
  // Native KV expiration uses its own clock, so remove the cache explicitly.
  const prefix = KV_KEYS.idempotency("", "", "").split(":")[0] + ":";
  for (const key of (await sourceEnv.COUNTERS.list({ prefix })).keys) await sourceEnv.COUNTERS.delete(key.name);
  blocked = true;
  return { args, key, payment, stub, record, calls, canary };
}
async function assertReplay(result: Awaited<ReturnType<typeof wire>>, p: Awaited<ReturnType<typeof purchase>>, door: LaborDoor) {
  expect(result.refused, String(result.body.code)).toBe(false);
  expect(result.body).toMatchObject({ charged: true, charged_again: false, paid_retry: true, item_id: p.record.delivery!.item_id });
  const original = p.record.delivery!, cert = object(original.certificate);
  expect(door === "http" ? result.body.certificate : result.body.cert_id).toEqual(door === "http" ? cert : cert.cert_id);
  expect(result.body.deliverable).toEqual(original.deliverable);
  const header = Object.entries(p.record.payment!.settleHeaders).find(([name]) => name.toLowerCase() === "payment-response")?.[1];
  expect(header).toBeDefined();
  expect(door === "http" ? result.receipt : JSON.stringify(result.receipt)).toBe(door === "http" ? header : JSON.stringify(JSON.parse(atob(header!))));
  expect(fulfillments).toBe(p.calls);
  expect(transfers).toBe(1);
  expect((await sourceEnv.PATRONS.list({ prefix: KV_KEYS.certPrefix })).keys).toHaveLength(1);
  expect(object(await (await request(String(result.body.verify_url))).json()).valid).toBe(true);
}
for (const door of doors) for (const network of laborNetworks()) {
  for (const keyMode of ["same", "new", "omitted"]) it(`${door} ${network}: completed good survives cache expiry with ${keyMode} key`, async () => {
    const p = await purchase("hello", door, network);
    const result = await wire("hello", door, p.args, p.payment, keyMode === "same" ? p.key : keyMode === "new" ? crypto.randomUUID() : undefined);
    await assertReplay(result, p, door);
  });
  for (const mutation of ["inputs", "product"]) it(`${door} ${network}: completed receipt refuses changed ${mutation}`, async () => {
    const id = mutation === "product" ? "daily_fortune" : "hello";
    const other = items.find(i => i.id === "the_confession")!;
    if (mutation === "product") expect(other.price_usdc).toBe(items.find(i => i.id === id)!.price_usdc);
    const p = await purchase(id, door, network), verifies = facilitator.verifyCalls;
    const result = await wire(mutation === "product" ? other.id : id, door,
      mutation === "inputs" ? { ...p.args, purpose: "wrong input" } : { ...baseline(other), ...p.args }, p.payment);
    expect(result.refused).toBe(true);
    expect(facilitator.verifyCalls).toBeGreaterThan(verifies);
    expect(result.body).toMatchObject({ code: "purchase_input_mismatch", charged: true, settlement_attempted: false });
    expect(result.body.fulfillment).toBeUndefined();
    expect(fulfillments).toBe(p.calls);
    expect(transfers).toBe(1);
  });
}
for (const door of doors) {
  const network = laborNetworks().find(n => n.startsWith("solana:"))!;
  for (const id of ["service_audit", "good_buyer", "signature_agent_card", "onpage_audit"]) it(`${door} ${id}: Solana replay returns the purchased signed report without another probe`, async () => {
    const p = await purchase(id, door, network);
    const result = await wire(id, door, p.args, p.payment);
    await assertReplay(result, p, door);
    for (const field of ["audit", "reading", "card"]) if (p.record.delivery![field]) expect(result.body[field]).toEqual(p.record.delivery![field]);
  });
  it(`${door}: concurrent completed retries return the same good`, async () => {
    const p = await purchase("hello", door, network);
    const results = await Promise.all(Array.from({ length: 3 }, () => wire("hello", door, p.args, p.payment)));
    for (const result of results) await assertReplay(result, p, door);
  });
  it(`${door}: tampering with the saved Solana signature cannot retrieve its purchase`, async () => {
    const p = await purchase("hello", door, network), tampered = structuredClone(p.payment);
    const bytes = Uint8Array.from(atob(String(object(tampered.payload).transaction)), c => c.charCodeAt(0));
    bytes[65] = bytes[65]! ^ 1;
    object(tampered.payload).transaction = btoa(String.fromCharCode(...bytes));
    const result = await wire("hello", door, p.args, tampered, p.key);
    expect(result.refused).toBe(true);
    expect(result.body.cert_id).toBeUndefined();
    expect(result.body.certificate).toBeUndefined();
    expect(result.body.fulfillment).toBeUndefined();
    expect(transfers).toBe(1);
  });
  it(`${door}: completed human work survives ordinary purchase replay`, async () => {
    const p = await purchase("aura_walk", door, network), finished = `${p.canary} completed work`;
    await completeOrder(testEnv, String(p.record.delivery!.order_id), finished);
    const result = await wire("aura_walk", door, p.args, p.payment);
    expect(result.refused, String(result.body.code)).toBe(false);
    expect(result.body).toMatchObject({ order_id: p.record.delivery!.order_id, status: "completed", deliverable: finished, charged: true });
    expect(fulfillments).toBe(p.calls);
    expect(transfers).toBe(1);
  });
}
