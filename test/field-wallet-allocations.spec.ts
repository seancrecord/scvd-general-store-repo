import {env, runInDurableObject} from "cloudflare:test";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {authorizationTypes} from "@x402/evm";
import * as rpc from "@/lib/base-rpc";
import {allocatedFieldSigner, allocationLedger, FIELD_ALLOCATION_PROGRAMS, type FieldAllocationProgram} from "@/services/field-wallet-allocations";
import type {FieldSigner} from "@/services/launch-check";
import type {Env} from "@/types";
const bindings = env as unknown as Env;
const now=Date.UTC(2026,9,16,18), seconds=now/1000;
const wallet=`0x${"1".repeat(40)}`, recipient=`0x${"2".repeat(40)}`;
const n=(i:number)=>`0x${i.toString(16).padStart(64,"0")}`;
function args(i=1,amount="6000000",until=seconds+100):Parameters<FieldSigner["signTypedData"]>[0] {
 return {domain:{name:"USD Coin",version:"2",chainId:8453,verifyingContract:rpc.BASE_USDC},types:{TransferWithAuthorization:[...authorizationTypes.TransferWithAuthorization]},primaryType:"TransferWithAuthorization",message:{from:wallet,to:recipient,value:amount,validAfter:"0",validBefore:String(until),nonce:n(i)}};
}
let actor:ReturnType<typeof allocationLedger>;
beforeEach(async()=>{
 actor=allocationLedger(bindings,wallet);
 await runInDurableObject(actor,async(_,state)=>{state.storage.sql.exec("DELETE FROM contribution_commitments");state.storage.sql.exec("DELETE FROM allocations");state.storage.sql.exec("DELETE FROM allocation_meta");});
 vi.spyOn(rpc,"getFinalizedBlockNumber").mockResolvedValue(100);
 vi.spyOn(rpc,"getBlockTimestamp").mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,"usdcBalanceOf").mockResolvedValue(10000000n);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function reserve(i:number, program:FieldAllocationProgram="contributions",amount="6000000",at=now,until=seconds+100) {
 return runInDurableObject(actor,async(instance)=>{
  try {return await instance.reserve(wallet,program,args(i,amount,until),at);} catch(error) {return {error:(error as Error).message};}
 });
}
it("lets only one competing six-USDC authorization allocate a ten-USDC balance across programs",async()=>{
 const results=await Promise.all([reserve(1,"contributions"),reserve(2,"studies")]);
 expect(results.filter(r=>"reserved" in r)).toHaveLength(1);
 expect(results.filter(r=>"error" in r)).toHaveLength(1);
 expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("shares one total across all six programs and retains only private aggregate data",async()=>{
 for(let i=0;i<FIELD_ALLOCATION_PROGRAMS.length;i++) expect(await reserve(i+1,FIELD_ALLOCATION_PROGRAMS[i],"1000000")).toMatchObject({reserved:true});
 const summary=await actor.summary(); expect(summary.held_atomic).toBe("6000000"); expect(summary.spendable_atomic).toBeNull();
 for(const p of FIELD_ALLOCATION_PROGRAMS) expect(summary.programs[p]).toEqual({count:1,amount_atomic:"1000000"});
 const body=JSON.stringify(summary);expect(body).not.toContain(wallet);expect(body).not.toContain(recipient);expect(body).not.toContain(n(1));expect(body).not.toContain("private-signature");
});
it("reuses exactly the same allocation but refuses different terms or a different program for its nonce",async()=>{
 expect(await reserve(1)).toMatchObject({reserved:true,reused:false});
 expect(await reserve(1)).toMatchObject({reserved:true,reused:true});
 expect(await reserve(1,"contributions","1")).toHaveProperty("error");
 expect(await reserve(1,"studies")).toHaveProperty("error");
 expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("pins the balance call to the finalized block",async()=>{
 await reserve(1);
 expect(rpc.usdcBalanceOf).toHaveBeenCalledWith(bindings,wallet,rpc.BASE_EVM,100);
});
it("does not release an authorization merely because the wall clock expired",async()=>{
 await reserve(1);
 expect(await reserve(2,"studies","6000000",now+200000,seconds+500)).toHaveProperty("error");
 expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("releases expired holds only against the later finalized balance, including any old redemption",async()=>{
 await reserve(1);
 vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(101);
 vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now+101000));
 vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(4000000n);
 expect(await reserve(2,"studies","6000000",now+200000,seconds+500)).toHaveProperty("error");
 expect((await actor.summary()).held_atomic).toBe("6000000"); // Failed allocation rolls back pruning too.
 expect(await reserve(3,"credit","4000000",now+200000,seconds+500)).toMatchObject({reserved:true});
 expect((await actor.summary()).held_atomic).toBe("4000000");
});
it("rejects an older RPC result after a newer allocation has committed",async()=>{
 const results=await runInDurableObject(actor,async(instance)=>{
  let release!:(value:number)=>void, started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});
  vi.mocked(rpc.getFinalizedBlockNumber).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;started();}));
  const pending=instance.reserve(wallet,"shopping",args(1,"1000000"),now).then(()=>"reserved",()=>"refused");
  await began;
  vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(101);
  const newer=await instance.reserve(wallet,"studies",args(2,"1000000"),now);
  release(100);return {older:await pending,newer};
 });
 expect(results.older).toBe("refused");expect(results.newer).toMatchObject({reserved:true});
 expect((await actor.summary()).held_atomic).toBe("1000000");
});
it.each(["rpc","stale","future","missing_time","balance","same_block_changed"])("refuses an unavailable or inconsistent %s reading without taking funds",async(kind)=>{
 if(kind==="same_block_changed") {await reserve(1,"shopping","1");vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(20000000n);}
 if(kind==="rpc") vi.mocked(rpc.usdcBalanceOf).mockRejectedValue(new Error("secret RPC details"));
 if(kind==="stale") vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now-3600001));
 if(kind==="future") vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now+1));
 if(kind==="missing_time") vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(null);
 if(kind==="balance") vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(-1n);
 expect(await reserve(2)).toEqual({error:"Field wallet allocation unavailable"});
 expect((await actor.summary()).held_atomic).toBe(kind==="same_block_changed"?"1":"0");
});
it.each(["amount","chain","asset","from","nonce","expiry","types","extra"])("rejects invalid %s before reading the balance",async(kind)=>{
 const a=args();
 if(kind==="amount") a.message.value="-1";
 if(kind==="chain") a.domain.chainId=1;
 if(kind==="asset") a.domain.verifyingContract=recipient as `0x${string}`;
 if(kind==="from") a.message.from=recipient;
 if(kind==="nonce") a.message.nonce="bad";
 if(kind==="expiry") a.message.validBefore=String(seconds);
 if(kind==="types") a.types={};
 if(kind==="extra") a.message.extra="no";
 const result=await runInDurableObject(actor,async(instance)=>{try {await instance.reserve(wallet,"contributions",a,now);return "signed";}catch{return "refused";}});
 expect(result).toBe("refused");expect(rpc.usdcBalanceOf).not.toHaveBeenCalled();
});
it("persists before calling the signer, keeps uncertain attempts held, and retries the same nonce without another allocation",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);
 const sign=vi.fn(async()=>{expect((await actor.summary()).held_atomic).toBe("6000000");throw new Error("sign failed");});
 const signer=allocatedFieldSigner(bindings,{address:wallet,signTypedData:sign},"contributions");
 await expect(signer.signTypedData(args())).rejects.toThrow("sign failed");
 await expect(signer.signTypedData(args())).rejects.toThrow("sign failed");
 expect(sign).toHaveBeenCalledTimes(2);expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("never invokes the signer without allocation storage",async()=>{
 const sign=vi.fn().mockResolvedValue("signature");
 const signer=allocatedFieldSigner({...bindings,FIELD_WALLET_ALLOCATIONS:undefined},{address:wallet,signTypedData:sign},"credit");
 await expect(signer.signTypedData(args())).rejects.toThrow("Field wallet allocation unavailable");expect(sign).not.toHaveBeenCalled();
});
it("does not let an actor switch to a different wallet",async()=>{
 await reserve(1);
 const a=args(2,"1");a.message.from=recipient;
 const result=await runInDurableObject(actor,async(instance)=>{try {await instance.reserve(recipient,"credit",a,now);return "signed";}catch{return "refused";}});
 expect(result).toBe("refused");
});

it("the production contribution signer allocates before returning a real signature",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);
 const {contributionSigner}=await import("@/services/contribution-payout");
 const signer=await contributionSigner({...bindings,FIELD_WALLET_KEY:"11".repeat(32)});
 const ledger=allocationLedger(bindings,signer.address);
 await runInDurableObject(ledger,async(_,state)=>{state.storage.sql.exec("DELETE FROM contribution_commitments");state.storage.sql.exec("DELETE FROM allocations");state.storage.sql.exec("DELETE FROM allocation_meta");});
 const a=args();a.message.from=signer.address;
 expect(await signer.signTypedData(a)).toMatch(/^0x[0-9a-f]{130}$/i);
 expect((await ledger.summary()).held_atomic).toBe("6000000");
 const b=args(2);b.message.from=signer.address;
 await expect(signer.signTypedData(b)).rejects.toThrow("Field wallet allocation unavailable");
});

it("sends an explicit block to the RPC balance reader and preserves latest for other callers",async()=>{
 vi.mocked(rpc.usdcBalanceOf).mockRestore();
 const calls:unknown[][]=[];
 vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:RequestInit)=>{
  const body=JSON.parse(String(init.body)) as {method:string;params:unknown[]};
  calls.push(body.params);return Response.json({jsonrpc:"2.0",id:1,result:"0x64"});
 }));
 expect(await rpc.usdcBalanceOf(bindings,wallet,rpc.BASE_EVM,123)).toBe(100n);
 expect(calls[0]?.[1]).toBe("0x7b");
 expect(await rpc.usdcBalanceOf(bindings,wallet)).toBe(100n);
 expect(calls[1]?.[1]).toBe("latest");
});

it("signs the allocated snapshot even if its caller mutates the original request while awaiting storage",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);
 const sign=vi.fn().mockResolvedValue("signature");
 const signer=allocatedFieldSigner(bindings,{address:wallet,signTypedData:sign},"shopping");
 const a=args(),pending=signer.signTypedData(a);a.message.value="99999999";a.message.nonce=n(55);
 await pending;expect(sign).toHaveBeenCalledWith(args());expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("renders unavailable allocation storage without claiming zero holds",async()=>{
 const {renderFieldAllocations}=await import("@/pages/admin/contribution-tasks");
 const body=renderFieldAllocations({status:"unavailable",limits:"Coverage limits"});
 expect(body).toContain("Allocation records are unavailable");expect(body).not.toContain("Total held: 0");
});

const commitmentId=(i:number)=>`brief:${i.toString(16).padStart(8,"0")}-0000-4000-8000-000000000000`;
async function commit(i=1,amount="6000000",to=recipient) {
 return runInDurableObject(actor,async instance=>{
  try{return await instance.commitContribution(wallet,commitmentId(i),to,amount,now);}catch{return {error:"refused"};}
 });
}
it("shares accepted contribution holds with concurrent authorizations from other programs",async()=>{
 const results=await Promise.all([commit(),reserve(2,"studies")]);
 expect(results.filter(r=>"reserved" in r)).toHaveLength(1);
 expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("retains one exact commitment across response loss and refuses rebinding its amount or recipient",async()=>{
 expect(await commit()).toMatchObject({reserved:true,reused:false});
 vi.mocked(rpc.usdcBalanceOf).mockRejectedValue(new Error("offline"));
 expect(await commit()).toMatchObject({reserved:true,reused:true});
 expect(await commit(1,"1")).toHaveProperty("error");
 expect(await commit(1,"6000000",wallet)).toHaveProperty("error");
 expect((await actor.summary()).contribution_commitments).toBe(1);
});
it("counts an accepted reward once when signing, and keeps its debt held after authorization expiry",async()=>{
 await commit();
 await runInDurableObject(actor,async instance=>expect(await instance.reserve(wallet,"contributions",args(),now,commitmentId(1))).toMatchObject({reserved:true}));
 expect((await actor.summary()).held_atomic).toBe("6000000");
 expect(await reserve(2,"credit","4000000")).toMatchObject({reserved:true});
 vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(101);
 vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now+101000));
 expect(await reserve(3,"credit","5000000",now+200000,seconds+500)).toHaveProperty("error");
 expect(await reserve(3,"credit","4000000",now+200000,seconds+500)).toMatchObject({reserved:true});
 expect((await actor.summary()).held_atomic).toBe("10000000");
});
it.each(["amount","recipient","program","missing"])("refuses a %s mismatch when signing against accepted work",async kind=>{
 await commit();const a=args();if(kind==="amount")a.message.value="1";if(kind==="recipient")a.message.to=wallet;
 const result=await runInDurableObject(actor,async instance=>{
  try {await instance.reserve(wallet,kind==="program"?"studies":"contributions",a,now,commitmentId(kind==="missing"?2:1));return "signed";}catch{return "refused";}
 });
 expect(result).toBe("refused");expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("binds one nonce to a commitment even when competing signing requests race",async()=>{
 await commit();
 const results=await runInDurableObject(actor,async instance=>Promise.all([1,2].map(async i=>{
  try{await instance.reserve(wallet,"contributions",args(i),now,commitmentId(1));return "signed";}catch{return "refused";}
 })));
 expect(results.sort()).toEqual(["refused","signed"]);expect((await actor.summary()).held_atomic).toBe("6000000");
});
it("the production contribution signer consumes its acceptance hold without allocating twice",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);
 const {contributionSigner}=await import("@/services/contribution-payout");
 const local={...bindings,FIELD_WALLET_KEY:"11".repeat(32)},signer=await contributionSigner(local,commitmentId(1));
 const ledger=allocationLedger(local,signer.address);
 await runInDurableObject(ledger,async(instance,state)=>{
  state.storage.sql.exec("DELETE FROM contribution_commitments");state.storage.sql.exec("DELETE FROM allocations");state.storage.sql.exec("DELETE FROM allocation_meta");
  await instance.commitContribution(signer.address,commitmentId(1),recipient,"6000000",now);
 });
 const a=args();a.message.from=signer.address;
 expect(await signer.signTypedData(a)).toMatch(/^0x[0-9a-f]{130}$/i);
 expect((await ledger.summary()).held_atomic).toBe("6000000");
});
