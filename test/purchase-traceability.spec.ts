import { afterEach, expect, it, vi } from "vitest";
import { installLaborAdmissionHarness, signLabor, sendLabor } from "./helpers/labor-admission";
import { call, items, shelves, request, object, testEnv, facilitator } from "./helpers/buyer-harness";
import { purchaseIntentStore, readPurchaseStatus, type PurchaseIntent } from "@/services/purchase-intent";
import { getMenuItem } from "@/store";

installLaborAdmissionHarness();
afterEach(() => { vi.restoreAllMocks(); facilitator.settleShouldFail = false; });

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: a definitive decline carries the private record actually retained before settlement`, async () => {
    const item = items.find(i => i.id === "context_anchor")!;
    const args = { summary: `SCVD-E2E-reference-${crypto.randomUUID()}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers[0]!;
    const payment = await signLabor(offer);
    facilitator.settleShouldFail = true;
    const failed = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(failed.body).toMatchObject({ code: "payment_declined", charged: false });
    const recovery = object(failed.body.recovery);
    expect(recovery.purchase_id).toMatch(/^[a-f0-9]{64}$/);
    expect(recovery.purchase_recorded).toBe(true);
    const response = await request(String(recovery.status_url), { headers: { Authorization: `Bearer ${recovery.status_token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purchase_id: recovery.purchase_id, payment_state: "not_settled", charged: false });
    expect((await request(String(recovery.status_url))).status).toBe(404);
  });
}

it("a failed fulfillment refresh preserves authenticated settlement facts and the same status handle", async () => {
  const item = items.find(i => i.id === "the_collab")!;
  const terms = (await call(item, "mcp", { detail: "SCVD-E2E-reference" }, shelves(item)[0])).offers[0]!;
  const id = "a".repeat(64), token = "b".repeat(64);
  const record: PurchaseIntent = { version: 1, id, token, path: "/api/buy/the_collab", door: "http", payer: "fixture",
    terms: { ...terms, network: terms.network as `${string}:${string}`, extra: terms.extra ?? {} }, request: "detail=SCVD-E2E-reference", item: getMenuItem("the_collab"), created_at: "2026-09-05T12:00:00Z", state: "settled",
    payment: { transaction: "fixture-transaction", network: terms.network, paidUsdc: 1, tipUsdc: 0, settleHeaders: {} },
    delivery: { order_id: "missing-order-fixture" },
  };
  await purchaseIntentStore(testEnv, id).beginPurchase(JSON.stringify(record));
  const before = facilitator.settleCalls;
  const result = await readPurchaseStatus(testEnv, id, token);
  expect(result.status).toBe(503);
  expect(result.body).toMatchObject({ code: "purchase_status_unavailable", purchase_id: id, charged: true,
    payment_state: "settled", transaction: "fixture-transaction", delivery_state: "unavailable",
    recovery: { purchase_id: id, status_token: token, purchase_recorded: true },
  });
  expect(result.body.fulfillment).toBeUndefined();
  const denied = await readPurchaseStatus(testEnv, id, "c".repeat(64));
  expect(denied.status).toBe(404);
  expect(denied.body.recovery).toBeUndefined();
  expect(facilitator.settleCalls).toBe(before);
});

for (const door of ['http','mcp','mcp-standard'] as const) {
  it(`${door}: a successful buyer receives a private status handle outside the signed certificate`, async()=>{
    const item=items.find(i=>i.id==='context_anchor')!;
    const args={summary:`SCVD-E2E-guidance-${crypto.randomUUID()}`};
    const offer=(await call(item,'mcp',args,shelves(item)[0])).offers[0]!;
    const paid=await sendLabor(item.id,door,args,await signLabor(offer),crypto.randomUUID());
    expect(paid.refused).toBe(false);
    expect(object(paid.body.store_credit).balance_url).toMatch(/^https:\/\/scvd.store\/api\/credit\/0x[0-9a-f]{40}$/);
    const recovery=object(paid.body.recovery);
    expect(recovery.status_token).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof paid.body.signed_payload).toBe('string');
    expect(String(paid.body.signed_payload)).not.toContain(String(recovery.status_token));
    const publicVerification=await request(String(paid.body.verify_url));
    expect(publicVerification.status).toBe(200);
    expect(await publicVerification.text()).not.toContain(String(recovery.status_token));
    const before=facilitator.settleCalls;
    const status=await request(String(recovery.status_url),{headers:{Authorization:`Bearer ${recovery.status_token}`}});
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({charged:true,payment_state:'settled'});
    expect((await request(String(recovery.status_url))).status).toBe(404);
    expect(facilitator.settleCalls).toBe(before);
  });
}
