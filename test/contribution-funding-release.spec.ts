import {env, SELF, runInDurableObject} from "cloudflare:test";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {authorizationTypes} from "@x402/evm";
import * as payout from "@/services/contribution-payout";
import * as rpc from "@/lib/base-rpc";
import {allocationLedger} from "@/services/field-wallet-allocations";
import {renderContributionDesk} from "@/pages/admin/contribution-tasks";
import {CONTRIBUTION_API} from "@/store/contribution-tasks";
import {sha256Hex} from "@/lib/idempotency";
import type {ContributionTaskState} from "@/services/contribution-task";
import type {FieldSigner} from "@/services/launch-check";
import type {Env} from "@/types";
const bindings=env as unknown as Env,now=Date.UTC(2026,9,21,12);
const wallet=`0x${"1".repeat(40)}`,recipient=`0x${"2".repeat(40)}`,nonce=`0x${"3".repeat(64)}`,tx=`0x${"4".repeat(64)}`,hash=`0x${"5".repeat(64)}`,key="a".repeat(64);
const topic=(address:string)=>`0x${address.slice(2).padStart(64,"0")}`;
const ledger=()=>allocationLedger(bindings,wallet);
const id=`release-brief:00000000-0000-0000-0000-000000000001`;
function args(amount="6000000",n=nonce):Parameters<FieldSigner["signTypedData"]>[0] {
 return {domain:{name:"USD Coin",version:"2",chainId:8453,verifyingContract:rpc.BASE_USDC},types:{TransferWithAuthorization:[...authorizationTypes.TransferWithAuthorization]},primaryType:"TransferWithAuthorization",message:{from:wallet,to:recipient,value:amount,validAfter:"0",validBefore:String(now/1000+3600),nonce:n}};
}
function receipt():rpc.RpcReceipt {return {transactionHash:tx,blockHash:hash,status:"0x1",blockNumber:"0x65",logs:[
 {address:rpc.BASE_USDC,topics:[rpc.AUTHORIZATION_USED_TOPIC,topic(wallet),nonce],data:"0x"},
 {address:rpc.BASE_USDC,topics:[rpc.TRANSFER_TOPIC,topic(wallet),topic(recipient)],data:`0x${(6000000).toString(16).padStart(64,"0")}`},
]};}
function paid(){vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(102);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(4000000n);}
async function funded(identity=id){await ledger().commitContribution(wallet,identity,recipient,"6000000",now);await ledger().reserve(wallet,"contributions",args(),now,identity);}
async function release(identity=id,transaction=tx){return runInDurableObject(ledger(),async instance=>{try{return await instance.releaseContribution(wallet,identity,transaction,now);}catch(error){return {error:(error as Error).message};}});}
beforeEach(async()=>{
 await runInDurableObject(ledger(),async(_,state)=>{for(const table of ["contribution_releases","contribution_commitments","allocations","allocation_meta"])state.storage.sql.exec(`DELETE FROM ${table}`);});
 vi.spyOn(rpc,"getFinalizedBlockNumber").mockResolvedValue(100);
 vi.spyOn(rpc,"getBlockTimestamp").mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,"usdcBalanceOf").mockResolvedValue(10000000n);
 vi.spyOn(rpc,"getReceipt").mockResolvedValue(receipt());vi.spyOn(rpc,"getChainId").mockResolvedValue("0x2105");vi.spyOn(rpc,"getBlockHash").mockResolvedValue(hash);
});
afterEach(()=>vi.restoreAllMocks());
it("releases the paid hold against the post-payment balance, retaining permanent identities",async()=>{
 await funded();paid();
 expect(await release()).toMatchObject({transaction:tx,receipt_block:101,receipt_block_hash:hash,finalized_block:102,balance_atomic:"4000000"});
 expect(await ledger().summary()).toMatchObject({held_atomic:"0",contribution_commitments:0,released_contributions:1,balance_atomic:"4000000",spendable_atomic:null});
 await runInDurableObject(ledger(),async(instance,state)=>{
  expect(state.storage.sql.exec("SELECT * FROM allocations").toArray()).toHaveLength(1);
  expect(state.storage.sql.exec("SELECT * FROM contribution_commitments").toArray()).toHaveLength(1);
  await expect(instance.commitContribution(wallet,id,recipient,"6000000",now)).rejects.toThrow();
  await expect(instance.reserve(wallet,"contributions",args(),now,id)).rejects.toThrow();
  await expect(instance.reserve(wallet,"contributions",args(),now)).rejects.toThrow();
  await expect(instance.reserve(wallet,"studies",args("6000000",hash),now)).rejects.toThrow();
  expect(await instance.reserve(wallet,"studies",args("4000000",hash),now)).toMatchObject({reserved:true});
 });
});
it("makes concurrent retries idempotent and refuses another transaction without reading again",async()=>{
 await funded();paid();const results=await Promise.all([release(),release()]);expect(results[0]).toEqual(results[1]);
 vi.mocked(rpc.getReceipt).mockClear();expect(await release()).toEqual(results[0]);expect(await release(id,hash)).toHaveProperty("error");expect(rpc.getReceipt).not.toHaveBeenCalled();
 expect((await ledger().summary()).released_contributions).toBe(1);
});
it.each(["nonce","recipient","amount","asset","payer","unpaired","canceled","reverted","transaction","chain","missing","missing_hash","orphaned","unfinalized","rpc_error","stale_balance"] as const)("retains the full hold for %s evidence",async kind=>{
 await funded();paid();const r=receipt(),auth=r.logs[0]!,transfer=r.logs[1]!;
 if(kind==="nonce")auth.topics[2]=hash;
 if(kind==="recipient")transfer.topics[2]=topic(wallet);
 if(kind==="amount")transfer.data=`0x${"0".repeat(63)}1`;
 if(kind==="asset")auth.address=transfer.address=wallet;
 if(kind==="payer")auth.topics[1]=transfer.topics[1]=topic(recipient);
 if(kind==="unpaired")r.logs.splice(1,0,{...transfer,data:`0x${"0".repeat(63)}1`});
 if(kind==="canceled")r.logs=[];
 if(kind==="reverted")r.status="0x0";
 if(kind==="transaction")r.transactionHash=hash;
 if(kind==="chain")vi.mocked(rpc.getChainId).mockResolvedValue("0x1");
 if(kind==="missing_hash")delete r.blockHash;
 if(kind==="orphaned")vi.mocked(rpc.getBlockHash).mockResolvedValue(tx);
 if(kind==="unfinalized")r.blockNumber="0x67";
 if(kind==="stale_balance")vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now-7200000));
 vi.mocked(rpc.getReceipt).mockResolvedValue(kind==="missing"?null:r);
 if(kind==="rpc_error")vi.mocked(rpc.getReceipt).mockRejectedValue(new Error("private-provider-key"));
 expect(await release()).toEqual({error:"Field wallet allocation unavailable"});
 expect(await ledger().summary()).toMatchObject({held_atomic:"6000000",released_contributions:0,finalized_block:100});
});
it("blocks an older in-flight allocation after release advances the balance floor",async()=>{
 await funded();
 await runInDurableObject(ledger(),async instance=>{
  let finish!:(n:bigint)=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});
  vi.mocked(rpc.usdcBalanceOf).mockImplementationOnce(()=>{started();return new Promise(resolve=>{finish=resolve;});});
  const stale=instance.reserve(wallet,"studies",args("6000000",hash),now).then(()=>"reserved",()=>"refused");
  await began;paid();await instance.releaseContribution(wallet,id,tx,now);finish(10000000n);
  expect(await stale).toBe("refused");expect(instance.summary().held_atomic).toBe("0");
 });
});
it("rejects a release overtaken by a newer retained balance",async()=>{
 await funded();paid();
 await runInDurableObject(ledger(),async instance=>{
  let finish!:(hash:string)=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});
  vi.mocked(rpc.getBlockHash).mockImplementationOnce(()=>{started();return new Promise(resolve=>{finish=resolve;});});
  const old=instance.releaseContribution(wallet,id,tx,now).then(()=>"released",()=>"refused");
  await began;vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(103);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(10000000n);
  await instance.reserve(wallet,"studies",args("1000000",hash),now);finish(hash);
  expect(await old).toBe("refused");expect(instance.summary()).toMatchObject({held_atomic:"7000000",released_contributions:0,finalized_block:103});
 });
});
it("rolls back the balance floor with a failed release save and safely retries",async()=>{
 await funded();paid();
 await runInDurableObject(ledger(),async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO contribution_releases"))throw new Error("save failed");return exec(query,...values);});
  await expect(instance.releaseContribution(wallet,id,tx,now)).rejects.toThrow();spy.mockRestore();
  expect(instance.summary()).toMatchObject({held_atomic:"6000000",finalized_block:100,released_contributions:0});
 });
 expect(await release()).toHaveProperty("transaction",tx);
});
it("can reconcile an actual payment even when other obligations exceed the remaining balance",async()=>{
 await funded();await ledger().reserve(wallet,"studies",args("4000000",hash),now);paid();vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(1000000n);
 expect(await release()).toHaveProperty("transaction",tx);
 expect(await ledger().summary()).toMatchObject({held_atomic:"4000000",balance_atomic:"1000000"});
});
async function task(){
 const taskId=`release-${crypto.randomUUID()}`,submission=crypto.randomUUID(),actor=bindings.CONTRIBUTION_TASKS!.getByName(taskId);
 const review={decision:"accepted",reason:"Meets terms",outcome:"no_change",reference:"https://scvd.store/what",at:new Date(now).toISOString()};
 const identity=`${taskId}:${submission}`;
 const s:ContributionTaskState={terms:{id:taskId,kind:"docs",title:"Read docs",target:"https://scvd.store/what",brief:"Read",acceptance:"Report",payment_method:"signed_authorization",reward_usd:6,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(now).toISOString(),closed:false,reservations:[{id:submission,key_hash:await sha256Hex(key),visitor_hash:"private-visitor",reserved_at:new Date(now).toISOString(),submit_by:new Date(now).toISOString(),status:"accepted",review,payout_to:recipient,acceptance_funding:{id:identity,wallet,state:"held",review},payout:{created_at:new Date(now).toISOString(),signature:"private-signature",authorization:{from:wallet,to:recipient,value:"6000000",validAfter:"0",validBefore:String(now/1000+3600),nonce}}}]};
 await runInDurableObject(actor,async(_,state)=>{state.storage.sql.exec("CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)");state.storage.sql.exec("INSERT INTO task(id,data) VALUES(1,?)",JSON.stringify(s));});
 await funded(identity);paid();return {actor,s,body:{submission_id:submission,tx_hash:tx}};
}
it("keeps ordinary payment checks read-only for funding, then releases through the separate action",async()=>{
 const {actor,s,body}=await task();vi.spyOn(rpc,"getBlockNumber").mockResolvedValue(130);
 await actor.checkRewardPayment(body.submission_id,tx,now);expect((await ledger().summary()).held_atomic).toBe("6000000");
 const html=renderContributionDesk(null,await actor.adminView(),now,"https://scvd.store");expect(html).toContain("Reconcile funding hold");
 vi.spyOn(payout,"contributionFundingWallet").mockRejectedValue(new Error("rotated or absent key"));
 vi.spyOn(payout,"contributionSigner").mockRejectedValue(new Error("rotated or absent key"));
 const result=await actor.releaseRewardFunding(body,now);expect(result.status).toBe(200);expect(result.data.acceptance_funding_state).toBe("released");expect(result.data.payout?.redemption_state).toBe("finalized_observed");expect(payout.contributionSigner).not.toHaveBeenCalled();expect(payout.contributionFundingWallet).not.toHaveBeenCalled();
 expect(result.data.acceptance_funding_release).toEqual({transaction:tx,receipt_block:101,read_at:new Date(now).toISOString()});
 const saved=(await actor.adminView())!;expect(saved.terms).toEqual(s.terms);expect(saved.reservations[0]!.review).toEqual(s.reservations[0]!.review);expect(saved.reservations[0]!.status).toBe("accepted");
 expect(saved.reservations[0]!.payment_checks?.confirmed).toBeDefined();
 expect(JSON.stringify(await actor.publicView(now))).not.toContain(tx);
 expect(renderContributionDesk(null,saved,now,"https://scvd.store")).not.toContain("Reconcile funding hold</button>");
 expect((await actor.act("status",{reservation_key:key},"",now)).data.acceptance_funding_release).toEqual(result.data.acceptance_funding_release);
});
it.each(["legacy","unsigned","wrong_amount","wrong_wallet","pending","manual"] as const)("refuses %s task records before chain reads",async kind=>{
 const {actor,body}=await task();
 await runInDurableObject(actor,async(_,state)=>{const s=JSON.parse(state.storage.sql.exec<{data:string}>("SELECT data FROM task").one().data) as ContributionTaskState,row=s.reservations[0]!;
 if(kind==="legacy")delete row.acceptance_funding;
 if(kind==="unsigned")delete row.payout!.signature;
 if(kind==="wrong_amount")row.payout!.authorization.value="1";
 if(kind==="wrong_wallet")row.payout!.authorization.from=recipient;
 if(kind==="pending")row.acceptance_funding!.state="pending";
 if(kind==="manual")delete s.terms.payment_method;
 state.storage.sql.exec("UPDATE task SET data=?",JSON.stringify(s));});
 expect((await actor.releaseRewardFunding(body,now)).status).toBe(409);expect(rpc.getReceipt).not.toHaveBeenCalled();
});
it("recovers ledger success after the private task save fails without another chain read",async()=>{
 const {actor,body}=await task();
 await runInDurableObject(actor,async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO task"))throw new Error("save failed");return exec(query,...values);});
  expect((await instance.releaseRewardFunding(body,now)).status).toBe(503);spy.mockRestore();
 });
 expect((await ledger().summary()).held_atomic).toBe("0");expect((await actor.adminView())!.reservations[0]!.acceptance_funding_release).toBeUndefined();
 vi.mocked(rpc.getReceipt).mockClear();expect((await actor.releaseRewardFunding(body,now)).status).toBe(200);expect(rpc.getReceipt).not.toHaveBeenCalled();
});
it("authenticates the action, rejects unknown fields, and retains the browser retry on an unavailable read",async()=>{
 const {actor,s,body}=await task(),url=`https://scvd.store/admin/bounties/contributions/${s.terms.id}/release-funding`;
 const auth={Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`};
 expect((await SELF.fetch(url,{method:"POST"})).status).toBe(401);
 expect((await SELF.fetch(url,{method:"POST",headers:{...auth,Origin:"https://elsewhere.invalid"}})).status).toBe(403);
 expect((await SELF.fetch(url,{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({...body,extra:true})})).status).toBe(400);
 vi.spyOn(Date,"now").mockReturnValue(now);vi.mocked(rpc.getReceipt).mockRejectedValue(new Error("private-provider-key"));
 const response=await SELF.fetch(url,{method:"POST",headers:{...auth,Origin:"https://scvd.store","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(body).toString()});
 expect(response.status).toBe(503);expect(response.headers.get("Cache-Control")).toBe("no-store");const html=await response.text();expect(html).toContain(tx);expect(html).toContain("Retry this same action");expect(html).not.toContain("private-provider-key");
 expect((await actor.adminView())!.reservations[0]!.acceptance_funding_release).toBeUndefined();
 vi.mocked(rpc.getReceipt).mockResolvedValue(receipt());const success=await SELF.fetch(url,{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify(body)});expect(success.status).toBe(200);
 const status=await SELF.fetch(`https://scvd.store${CONTRIBUTION_API}/${s.terms.id}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reservation_key:key})});
 expect(status.status).toBe(200);const output=await status.json() as {completion:{redemption_state:string;reward_note:string}};expect(output.completion.redemption_state).toBe("finalized_observed");expect(output.completion.reward_note).not.toContain("Arrange redemption");
});
