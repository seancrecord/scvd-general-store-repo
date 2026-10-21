import {env, SELF, runInDurableObject} from "cloudflare:test";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import * as rpc from "@/lib/base-rpc";
import * as payout from "@/services/contribution-payout";
import {allocationLedger,FieldWalletAllocations} from "@/services/field-wallet-allocations";
import {renderContributionDesk,renderFieldAllocations} from "@/pages/admin/contribution-tasks";
import type {ContributionTask,ContributionTaskState} from "@/services/contribution-task";
import type {Env} from "@/types";
const bindings=env as unknown as Env,now=Date.UTC(2026,9,21,12);
const wallet=`0x${"1".repeat(40)}`,recipient=`0x${"2".repeat(40)}`,nonce=`0x${"3".repeat(64)}`,other=`0x${"4".repeat(64)}`,tx=`0x${"5".repeat(64)}`,hash=`0x${"6".repeat(64)}`;
const id="legacy-brief:00000000-0000-0000-0000-000000000001",second="legacy-brief:00000000-0000-0000-0000-000000000002";
const ledger=()=>allocationLedger(bindings,wallet);
const auth=(n=nonce)=>({from:wallet,to:recipient,value:"6000000",validAfter:"0",validBefore:String(now/1000+3600),nonce:n});
const args=(n=nonce)=>payout.contributionSigningRequest(auth(n));
async function imported(identity=id,intent=args()) {return ledger().importContribution(wallet,identity,intent,now);}
async function refuses(fn:(instance:FieldWalletAllocations)=>Promise<unknown>){await runInDurableObject(ledger(),async instance=>{await expect(fn(instance)).rejects.toThrow("Field wallet allocation unavailable");});}
beforeEach(async()=>{
 await runInDurableObject(ledger(),async(_,state)=>{for(const table of ["contribution_work_holds","contribution_releases","contribution_commitments","allocations","allocation_meta"])state.storage.sql.exec(`DELETE FROM ${table}`);});
 vi.spyOn(rpc,"getFinalizedBlockNumber").mockResolvedValue(100);
 vi.spyOn(rpc,"getBlockTimestamp").mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,"usdcBalanceOf").mockResolvedValue(10000000n);
});
afterEach(()=>vi.restoreAllMocks());
it("imports old debt despite a shortfall, then refuses new allocations",async()=>{
 vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(1000000n);
 expect(await imported()).toEqual({imported:true,reused:false});
 expect(await ledger().summary()).toMatchObject({held_atomic:"6000000",observed_shortfall_atomic:"5000000",contribution_commitments:1,spendable_atomic:null});
 await refuses(i=>i.reserve(wallet,"studies",args(other),now));
 await refuses(i=>i.reserveContributionWork(wallet,second,"1",now));
 expect(renderFieldAllocations({status:"observed",...await ledger().summary()})).toContain("Observed shortfall: 5 USDC");
});
it("links an existing signature allocation without counting it twice",async()=>{
 await ledger().reserve(wallet,"contributions",args(),now);
 await imported();expect((await ledger().summary()).held_atomic).toBe("6000000");
 expect(await imported()).toEqual({imported:true,reused:true});
 await runInDurableObject(ledger(),async(_,state)=>{expect(state.storage.sql.exec("SELECT * FROM allocations").toArray()).toHaveLength(1);});
});
it("counts expired signatures as unresolved work and does not prune the imported debt",async()=>{
 const expired=args();expired.message.validBefore=String(now/1000-3600);
 await imported(id,expired);
 const additional=args(other);additional.message.value="4000000";
 await ledger().reserve(wallet,"studies",additional,now);
 expect((await ledger().summary()).held_atomic).toBe("10000000");
 await refuses(i=>i.reserveContributionWork(wallet,second,"1",now));
});
it("makes concurrent imports idempotent and binds a nonce to only one obligation",async()=>{
 const result=await Promise.all([imported(),imported()]);expect(result.filter(r=>!r.reused)).toHaveLength(1);
 await refuses(i=>i.importContribution(wallet,second,args(),now));
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it.each(["amount","recipient","nonce","expiry","domain","program","work"] as const)("refuses conflicting %s without changing the hold",async kind=>{
 if(kind==="program")await ledger().reserve(wallet,"studies",args(),now);
 else if(kind==="work")await ledger().reserveContributionWork(wallet,id,"6000000",now);
 else await imported();
 const changed=args();
 if(kind==="amount")changed.message.value="7000000";
 if(kind==="recipient")changed.message.to=wallet;
 if(kind==="nonce")changed.message.nonce=other;
 if(kind==="expiry")changed.message.validBefore=String(now/1000+7200);
 if(kind==="domain")changed.domain.chainId=1;
 await refuses(i=>i.importContribution(wallet,id,changed,now));
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("a concurrent new allocation sees an import that landed during its balance read",async()=>{
 await runInDurableObject(ledger(),async instance=>{
  let finish!:(n:bigint)=>void,started!:()=>void;
  const began=new Promise<void>(r=>{started=r;});
  vi.mocked(rpc.usdcBalanceOf).mockImplementationOnce(()=>{started();return new Promise(r=>{finish=r;});});
  const attempt=instance.reserve(wallet,"studies",args(other),now).then(()=>"reserved",()=>"refused");
  await began;await instance.importContribution(wallet,id,args(),now);finish(10000000n);
  expect(await attempt).toBe("refused");expect(instance.summary().held_atomic).toBe("6000000");
 });
});
it("rolls back all import writes when the commitment cannot be saved",async()=>{
 await runInDurableObject(ledger(),async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO contribution_commitments"))throw new Error("save failed");return exec(query,...values);});
  await expect(instance.importContribution(wallet,id,args(),now)).rejects.toThrow();spy.mockRestore();
  expect(instance.summary()).toMatchObject({held_atomic:"0",balance_atomic:null});
  expect(state.storage.sql.exec("SELECT * FROM allocations").toArray()).toHaveLength(0);
 });
 expect(await imported()).toMatchObject({imported:true});
});
async function fixture(){
 const taskId=`legacy-${crypto.randomUUID()}`,submission=crypto.randomUUID(),actor=bindings.CONTRIBUTION_TASKS!.getByName(taskId);
 const review={decision:"accepted",reason:"Meets terms",outcome:"no_change",reference:"https://scvd.store/what",at:new Date(now-86400000).toISOString()};
 const s:ContributionTaskState={terms:{id:taskId,kind:"docs",title:"Read docs",target:"https://scvd.store/what",brief:"Read",acceptance:"Report",payment_method:"signed_authorization",reward_usd:6,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(now-172800000).toISOString(),closed:true,reservations:[{id:submission,key_hash:"private",visitor_hash:"private",reserved_at:new Date(now-172800000).toISOString(),submit_by:new Date(now-86400000).toISOString(),status:"accepted",review,payout_to:recipient,payout:{created_at:new Date(now-86400000).toISOString(),signature:"private-signature",authorization:auth()}}]};
 await runInDurableObject(actor,async(_,state)=>{state.storage.sql.exec("CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");state.storage.sql.exec("INSERT INTO task(id,data) VALUES(1,?)",JSON.stringify(s));});
 return {actor,s,body:{submission_id:submission}};
}
async function change(actor:DurableObjectStub<ContributionTask>,edit:(s:ContributionTaskState)=>void){
 await runInDurableObject<ContributionTask,void>(actor,async(_,state)=>{const s=JSON.parse(state.storage.sql.exec<{data:string}>("SELECT data FROM task").one().data) as ContributionTaskState;edit(s);state.storage.sql.exec("UPDATE task SET data=?",JSON.stringify(s));});
}
it("imports using the retained wallet, preserving review, deadline, receipt and authorization",async()=>{
 const {actor,s,body}=await fixture();
 const signer=vi.spyOn(payout,"contributionFundingWallet").mockRejectedValue(new Error("rotated-key"));
 expect(renderContributionDesk(null,s,now,"https://scvd.store")).toContain("Import existing obligation");
 const result=await actor.importRewardFunding(body,now);
 expect(result.status).toBe(200);expect(result.data.payment_due_at).toBe(new Date(now+2*86400000).toISOString());
 const saved=(await actor.adminView())!.reservations[0]!;
 expect(saved.review).toEqual(s.reservations[0]!.review);expect(saved.payout).toEqual(s.reservations[0]!.payout);
 expect(saved.acceptance_funding).toMatchObject({wallet,state:"held",source:"legacy_import"});expect(signer).not.toHaveBeenCalled();
 expect(JSON.stringify(result.data)).not.toContain("balance_atomic");
 expect((await actor.importRewardFunding(body,now)).status).toBe(200);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("recovers a lost ledger response without signing again or restarting acceptance",async()=>{
 const {actor,s,body}=await fixture();const original=FieldWalletAllocations.prototype.importContribution;
 const spy=vi.spyOn(FieldWalletAllocations.prototype,"importContribution").mockImplementationOnce(async function(this:FieldWalletAllocations,...args){await original.apply(this,args);throw new Error("lost-reply-secret");});
 const failed=await actor.importRewardFunding(body,now);expect(failed.status).toBe(503);expect(JSON.stringify(failed)).not.toContain("secret");spy.mockRestore();
 expect((await actor.adminView())!.reservations[0]!.acceptance_funding?.state).toBe("pending");
 expect((await actor.importRewardFunding(body,now+1)).status).toBe(200);
 expect((await actor.adminView())!.reservations[0]!.review).toEqual(s.reservations[0]!.review);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it.each(["manual","unsigned","submitted","amount","recipient","managed"] as const)("refuses %s records without creating an obligation",async kind=>{
 const {actor,body}=await fixture();await change(actor,s=>{const row=s.reservations[0]!;
  if(kind==="manual")delete s.terms.payment_method;
  if(kind==="unsigned")delete row.payout!.signature;
  if(kind==="submitted")row.status="submitted";
  if(kind==="amount")row.payout!.authorization.value="7000000";
  if(kind==="recipient")row.payout!.authorization.to=wallet;
  if(kind==="managed")row.acceptance_funding={id:`${s.terms.id}:${row.id}`,wallet,state:"held",review:row.review!};
 });
 expect((await actor.importRewardFunding(body,now)).status).toBe(409);expect((await ledger().summary()).held_atomic).toBe("0");
});
it("reconciles imported expired rewards only through exact finalized payment, never resurrecting paid holds",async()=>{
 const {actor,body}=await fixture();await change(actor,s=>{s.reservations[0]!.payout!.authorization.validBefore=String(now/1000-1);});
 await actor.importRewardFunding(body,now);
 const topic=(a:string)=>`0x${a.slice(2).padStart(64,"0")}`;
 vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(102);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(4000000n);
 vi.spyOn(rpc,"getChainId").mockResolvedValue("0x2105");vi.spyOn(rpc,"getBlockHash").mockResolvedValue(hash);
 vi.spyOn(rpc,"getReceipt").mockResolvedValue({transactionHash:tx,blockHash:hash,status:"0x1",blockNumber:"0x65",logs:[
  {address:rpc.BASE_USDC,topics:[rpc.AUTHORIZATION_USED_TOPIC,topic(wallet),nonce],data:"0x"},
  {address:rpc.BASE_USDC,topics:[rpc.TRANSFER_TOPIC,topic(wallet),topic(recipient)],data:`0x${(6000000).toString(16).padStart(64,"0")}`},
 ]});
 expect((await actor.releaseRewardFunding({...body,tx_hash:tx},now)).status).toBe(200);
 expect((await actor.importRewardFunding(body,now)).status).toBe(200);
 expect((await ledger().summary()).held_atomic).toBe("0");
 const s=(await actor.adminView())!;const expired=payout.contributionSigningRequest(s.reservations[0]!.payout!.authorization);
 await refuses(i=>i.importContribution(wallet,`${s.terms.id}:${body.submission_id}`,expired,now));
});
it("requires admin authentication and same-origin submission",async()=>{
 const {s,body}=await fixture(),url=`https://scvd.store/admin/bounties/contributions/${s.terms.id}/import-funding`;
 expect((await SELF.fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status).toBe(401);
 expect((await SELF.fetch(url,{method:"POST",headers:{Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,"Content-Type":"application/json",Origin:"https://elsewhere.example"},body:JSON.stringify(body)})).status).toBe(403);
});

it("imports from the authenticated form and redirects back to the same brief",async()=>{
 const {s,body}=await fixture();vi.spyOn(Date,"now").mockReturnValue(now);
 const response=await SELF.fetch(`https://scvd.store/admin/bounties/contributions/${s.terms.id}/import-funding`,{method:"POST",headers:{Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,Origin:"https://scvd.store","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body).toString(),redirect:"manual"});
 expect(response.status).toBe(303);expect(response.headers.get("location")).toBe(`/admin/bounties/contributions/${s.terms.id}`);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("recovers a task save failure after ledger import without resetting the deadline",async()=>{
 const {actor,body,s}=await fixture();
 await runInDurableObject<ContributionTask,void>(actor,async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO task") && String(values[0]).includes('"state":"held"'))throw new Error("save failed");return exec(query,...values);});
  expect((await instance.importRewardFunding(body,now)).status).toBe(503);spy.mockRestore();
 });
 expect((await actor.importRewardFunding(body,now+1)).status).toBe(200);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
 expect((await actor.adminView())!.reservations[0]!.review).toEqual(s.reservations[0]!.review);
});
it("does not interpret an unavailable or stale chain read as successful import",async()=>{
 const {actor,body}=await fixture();vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now-7200000));
 expect((await actor.importRewardFunding(body,now)).status).toBe(503);
 expect((await ledger().summary()).held_atomic).toBe("0");
 expect((await actor.adminView())!.reservations[0]!.status).toBe("accepted");
 vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now-1000));
 expect((await actor.importRewardFunding(body,now)).status).toBe(200);
});
