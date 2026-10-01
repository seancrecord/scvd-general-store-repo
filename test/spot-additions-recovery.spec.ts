import { beforeEach, expect, it, vi } from "vitest";
import { installBuyerHarness, items, baseline, shelves, call, signature, facilitator, object, request } from "./helpers/buyer-harness";
let unavailable = false, publicationFault = false, reads = 0;
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
beforeEach(()=>{ unavailable=false; publicationFault=false; reads=0; });
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
