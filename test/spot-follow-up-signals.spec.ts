import { beforeEach, expect, it } from "vitest";
import { readBuyerSignals } from "@/services/buyer-signals";
import { signalStore } from "@/services/signal-store";
import { installBuyerHarness, items, shelves, call, signature, object, request, testEnv } from "./helpers/buyer-harness";
installBuyerHarness();
beforeEach(async()=>{ await signalStore(testEnv)?.reset(); });
it("keeps returned offers separate from artifact reads and does not recount a completed retry",async()=>{
  const item=items.find(row=>row.id==="spot_check")!, args={host:"signals.example"}, tool=shelves(item)[0]!;
  const quote=await call(item,"http",args,tool), payment=signature(quote.offers[0]!), key=crypto.randomUUID();
  const first=await call(item,"http",args,tool,payment,key);
  expect(first.protocolError).toBe(false);
  expect((await readBuyerSignals(testEnv)).follow_ups).toEqual({"spot_check:returned":1});
  expect((await readBuyerSignals(testEnv)).reads).toEqual({});
  const again=await call(item,"http",args,tool,payment,key);
  expect(again.protocolError).toBe(false);
  expect((await readBuyerSignals(testEnv)).follow_ups).toEqual({"spot_check:returned":1});
  const artifact=await request(String(first.body.view_url));
  expect(artifact.status).toBe(200);
  expect((await readBuyerSignals(testEnv)).reads).toEqual({"spot_evidence_read:under_1h":1});
  await request(String(first.body.view_url),{headers:{"X-House":"fixture"}});
  expect((await readBuyerSignals(testEnv)).reads).toEqual({"spot_evidence_read:under_1h":1});
});
it("excludes a known house wallet's offer response",async()=>{
  const item=items.find(row=>row.id==="spot_check")!, args={host:"house-signals.example"}, tool=shelves(item)[0]!;
  const quote=await call(item,"http",args,tool), payment=signature(quote.offers[0]!);
  const wire=object(JSON.parse(atob(payment)));
  const payer=String(object(object(wire.payload).authorization).from);
  const before=testEnv.HOUSE_WALLETS;
  testEnv.HOUSE_WALLETS=payer;
  try {
    const bought=await call(item,"http",args,tool,payment,crypto.randomUUID());
    expect(bought.protocolError).toBe(false);
    expect(bought.body.counter_note).toBeDefined();
    expect((await readBuyerSignals(testEnv)).follow_ups).toEqual({});
  } finally { testEnv.HOUSE_WALLETS=before; }
});
