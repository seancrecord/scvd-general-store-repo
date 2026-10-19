import { beforeEach, expect, it, vi } from "vitest";
import { runDurableObjectAlarm } from "cloudflare:test";
import { KV_KEYS } from "@/lib/kv-keys";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { installBuyerHarness, items, baseline, shelves, call, signature, facilitator, object, request, sourceEnv } from "./helpers/buyer-harness";
let unavailable = false, publicationFault = false, accountingFault = false, reads = 0;
vi.mock("@/lib/metrics", async original => {
  const actual = await original<typeof import("@/lib/metrics")>();
  return { ...actual, recordSettlement: async (...args: Parameters<typeof actual.recordSettlement>) => {
    if (accountingFault) throw new Error("fixture interrupted before accounting");
    return actual.recordSettlement(...args);
  } };
});
vi.mock("@/services/spot-check", async original => {
  const actual=await original<typeof import("@/services/spot-check")>();
  return {...actual, performSpotCheck: async (...args:Parameters<typeof actual.performSpotCheck>) => {
    reads++;
    if (unavailable) throw new Error("fixture archive unavailable");
    return actual.performSpotCheck(...args);
  }};
});
vi.mock("@/services/spot-evidence", async original => {
  const actual=await original<typeof import("@/services/spot-evidence")>();
  return {...actual, retainSpotEvidence: async (...args:Parameters<typeof actual.retainSpotEvidence>) => {
    if (publicationFault) throw new Error("fixture artifact publication unavailable");
    return actual.retainSpotEvidence(...args);
  }};
});
installBuyerHarness();
beforeEach(()=>{ unavailable=false; publicationFault=false; accountingFault=false; reads=0; });
for (const id of ["change_check","batch_spot_check"]) for (const door of ["http","mcp"] as const) {
  it(`${id} ${door}: an unavailable instrument never settles a partial answer`,async()=>{
    const item=items.find(row=>row.id===id)!, args=await baseline(item), tool=shelves(item)[0]!;
    const quote=await call(item,door,args,tool), payment=signature(quote.offers[0]!);
    const before=facilitator.settleCalls;
    unavailable=true;
    const failed=await call(item,door,args,tool,payment,crypto.randomUUID());
    expect(failed.protocolError).toBe(true);
    expect(facilitator.settleCalls).toBe(before);
    expect(reads).toBeGreaterThan(0);
  });
  it(`${id} ${door}: publication recovery uses the journal when the archive is gone`,async()=>{
    const item=items.find(row=>row.id===id)!, args=await baseline(item), tool=shelves(item)[0]!;
    const quote=await call(item,door,args,tool), payment=signature(quote.offers[0]!), key=crypto.randomUUID();
    const before=facilitator.settleCalls;
    publicationFault=true;
    const interrupted=await call(item,door,args,tool,payment,key);
    expect(interrupted.protocolError).toBe(true);
    expect(interrupted.body.charged).toBe(true);
    expect(facilitator.settleCalls).toBe(before+1);
    const readBefore=reads;
    publicationFault=false; unavailable=true;
    const recovered=await call(item,door,args,tool,payment,key);
    expect(recovered.protocolError,JSON.stringify(recovered.body)).toBe(false);
    expect(reads).toBe(readBefore);
    expect(facilitator.settleCalls).toBe(before+1);
    const verified=object(await (await request(String(recovered.body.verify_url))).json());
    expect(verified.valid).toBe(true);
    expect(object(verified.certificate).attests).toBe(recovered.body.evidence_hash);
    const original=await request(String(recovered.body.view_url));
    expect(original.status).toBe(200);
    expect(object(await original.json()).observation).toEqual(recovered.body.observation);
  });
}

it("batch_spot_check: the recovery alarm books an interrupted HTTP sale as well as delivering its certificate", async () => {
  const item = items.find(row => row.id === "batch_spot_check")!, args = await baseline(item), tool = shelves(item)[0]!;
  const quote = await call(item, "http", args, tool), payment = signature(quote.offers[0]!);
  const before = facilitator.settleCalls;
  accountingFault = publicationFault = true;
  const interrupted = await call(item, "http", args, tool, payment, crypto.randomUUID());
  expect(interrupted.protocolError).toBe(true);
  expect(interrupted.body.charged).toBe(true);
  expect(facilitator.settleCalls).toBe(before + 1);
  const wire = object(JSON.parse(atob(payment)));
  const payer = String(object(object(wire.payload).authorization).from);
  const { id } = await purchaseIdentity(quote.offers[0]!.network, payer, wire);
  const stub = purchaseIntentStore(sourceEnv, id);
  const original = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  const key = KV_KEYS.payerSettle(original.payer, original.payment!.transaction);
  expect(await sourceEnv.COUNTERS.get(key)).toBeNull();
  accountingFault = publicationFault = false;
  unavailable = true;
  const readsBefore = reads;
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  const recovered = JSON.parse((await stub.existingPurchase())!) as PurchaseIntent;
  expect(recovered.delivery?.certificate).toMatchObject({ item: item.id, settlement_tx: original.payment!.transaction });
  expect(await sourceEnv.COUNTERS.get(key, "json")).toMatchObject({ item: item.id, transaction: original.payment!.transaction });
  expect(facilitator.settleCalls).toBe(before + 1);
  expect(reads).toBe(readsBefore);
});
