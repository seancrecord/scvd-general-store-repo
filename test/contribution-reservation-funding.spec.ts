import {env,SELF,runInDurableObject,runDurableObjectAlarm} from "cloudflare:test";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {authorizationTypes} from "@x402/evm";
import * as payout from "@/services/contribution-payout";
import * as rpc from "@/lib/base-rpc";
import {allocationLedger,FieldWalletAllocations} from "@/services/field-wallet-allocations";
import {contributionNextSteps} from "@/services/contribution-worker";
import {renderContributionDesk} from "@/pages/admin/contribution-tasks";
import {CONTRIBUTION_API} from "@/store/contribution-tasks";
import type {ContributionTask} from "@/services/contribution-task";
import type {FieldSigner} from "@/services/launch-check";
import type {Env} from "@/types";
const bindings=env as unknown as Env,now=Date.UTC(2030,0,12,12),hour=3600000;
const wallet=`0x${"1".repeat(40)}`,recipient=`0x${"2".repeat(40)}`,nonce=`0x${"3".repeat(64)}`;
const key=(n=1)=>n.toString(16).padStart(64,"0");
const ledger=()=>allocationLedger(bindings,wallet);
const report={attempted:"Read",environment:"Fixture",expected:"Documented contract",observed:"Matches",evidence:"Timestamp and result",suggestion:"None"};
const review={decision:"accepted",reason:"Meets the terms",outcome:"no_change",reference:"https://scvd.store/what"};
async function task(signed=true,slots=1,expiry=now+hour){const id=`work-${crypto.randomUUID()}`,actor=bindings.CONTRIBUTION_TASKS!.getByName(id);await actor.create({id,kind:"docs",title:"Read docs",target:"https://scvd.store/what",brief:"Read",acceptance:"Report",reward_usd:6,slots,expires_at:new Date(expiry).toISOString(),review_days:3,payment_days:3,...(signed?{payment_method:"signed_authorization" as const}:{})},now);return actor;}
const reserve=(actor:Awaited<ReturnType<typeof task>>,n=1,at=now)=>actor.act("reserve",{reservation_key:key(n)},`visitor-${n}`,at);
const submit=(actor:Awaited<ReturnType<typeof task>>,n=1,at=now)=>actor.act("submit",{reservation_key:key(n),payout_to:recipient,report},"",at);
const release=(actor:Awaited<ReturnType<typeof task>>,n=1,at=now)=>actor.act("release",{reservation_key:key(n)},"",at);
async function alarm(actor:Awaited<ReturnType<typeof task>>,at:number){await runInDurableObject<ContributionTask,void>(actor,async(instance,state)=>{await state.storage.deleteAlarm();await instance.maintainReservations(at);});}
function args(amount="6000000"):Parameters<FieldSigner["signTypedData"]>[0] {return {domain:{name:"USD Coin",version:"2",chainId:8453,verifyingContract:rpc.BASE_USDC},types:{TransferWithAuthorization:[...authorizationTypes.TransferWithAuthorization]},primaryType:"TransferWithAuthorization",message:{from:wallet,to:recipient,value:amount,validAfter:"0",validBefore:String(now/1000+86400),nonce}};}
beforeEach(async()=>{
 await runInDurableObject(ledger(),async(_,state)=>{for(const table of ["contribution_work_holds","contribution_releases","contribution_commitments","allocations","allocation_meta"])state.storage.sql.exec(`DELETE FROM ${table}`);});
 vi.spyOn(Date,"now").mockReturnValue(now);
 vi.spyOn(payout,"contributionFundingWallet").mockResolvedValue(wallet);
 vi.spyOn(rpc,"getFinalizedBlockNumber").mockResolvedValue(100);
 vi.spyOn(rpc,"getBlockTimestamp").mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,"usdcBalanceOf").mockResolvedValue(10000000n);
});
afterEach(()=>vi.restoreAllMocks());
it("funds only one competing six-USDC reservation against ten USDC before either worker starts",async()=>{
 const a=await task(),b=await task();const results=await Promise.all([reserve(a),reserve(b)]);
 expect(results.map(r=>r.status).sort()).toEqual([200,503]);expect(await ledger().summary()).toMatchObject({held_atomic:"6000000",work_reservations:1,contribution_commitments:0});
 const failed=[a,b][results.findIndex(r=>r.status===503)]!;
 const pending=await failed.act("status",{reservation_key:key()},"",now);expect(pending.data.status).toBe("funding_pending");expect(pending.data.work_funding_state).toBe("pending");
 expect((await submit(failed)).data.code).toBe("reservation_funding_pending");
 const steps=contributionNextSteps("https://scvd.store",pending.data);expect(steps.map(s=>s.action)).toEqual(["reserve","release"]);expect(steps[0]!.note).toContain("SAME reservation key");
 expect((await failed.publicView(now))!.available_slots).toBe(0);
});
it("accounts for other programs when reserving work",async()=>{
 await ledger().reserve(wallet,"studies",args(),now);
 expect((await reserve(await task())).status).toBe(503);expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("recovers the same reservation after uncertain funding without another hold or deadline",async()=>{
 const actor=await task();const original=FieldWalletAllocations.prototype.reserveContributionWork;
 const spy=vi.spyOn(FieldWalletAllocations.prototype,"reserveContributionWork").mockImplementationOnce(async function(this:FieldWalletAllocations,...params){await original.apply(this,params);throw new Error("lost reply");});
 expect((await reserve(actor)).status).toBe(503);spy.mockRestore();
 const before=(await actor.adminView())!.reservations[0]!;expect((await ledger().summary()).held_atomic).toBe("6000000");
 const recovered=await reserve(actor,1,now+1000);expect(recovered.status).toBe(200);expect(recovered.data).toMatchObject({submission_id:before.id,submit_by:before.submit_by,status:"reserved",work_funding_state:"held"});
 expect((await ledger().summary()).work_reservations).toBe(1);
});
it("preserves the hold after a task save fails and repairs it with the original key",async()=>{
 const actor=await task();
 await runInDurableObject(actor,async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO task") && String(values[0]).includes('"state":"held"'))throw new Error("save failed");return exec(query,...values);});
  expect((await instance.act("reserve",{reservation_key:key()},"visitor",now)).status).toBe(503);spy.mockRestore();
 });
 expect((await ledger().summary()).held_atomic).toBe("6000000");expect((await reserve(actor)).status).toBe(200);expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("cancels unused work, frees capacity, and permanently refuses resurrection of its identity",async()=>{
 const actor=await task();await reserve(actor);const row=(await actor.adminView())!.reservations[0]!;
 expect((await release(actor)).data.work_funding_state).toBe("released");expect((await ledger().summary()).held_atomic).toBe("0");
 expect((await reserve(actor)).data.status).toBe("released");expect((await submit(actor)).status).toBe(409);
 await runInDurableObject(ledger(),async instance=>{await expect(instance.reserveContributionWork(wallet,row.work_funding!.id,"6000000",now)).rejects.toThrow();await expect(instance.commitContribution(wallet,row.work_funding!.id,recipient,"6000000",now)).rejects.toThrow();});
 expect((await reserve(await task())).status).toBe(200);
});
it("fences cancellation before a delayed ledger reservation can insert",async()=>{
 await runInDurableObject(ledger(),async instance=>{
  const id=`late-work:${crypto.randomUUID()}`;let finish!:(balance:bigint)=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});vi.mocked(rpc.usdcBalanceOf).mockImplementationOnce(()=>{started();return new Promise(resolve=>{finish=resolve;});});
  const pending=instance.reserveContributionWork(wallet,id,"6000000",now).then(()=>"reserved",()=>"refused");await began;
  instance.cancelContributionWork(wallet,id,"6000000");finish(10000000n);
  expect(await pending).toBe("refused");expect(instance.summary().held_atomic).toBe("0");
 });
});
it("does not overwrite a canceled task when its funding reply arrives late",async()=>{
 const actor=await task(),taskId=(await actor.publicView(now))!.id;const original=FieldWalletAllocations.prototype.reserveContributionWork;
 vi.spyOn(FieldWalletAllocations.prototype,"reserveContributionWork").mockImplementationOnce(async function(this:FieldWalletAllocations,...params){const value=await original.apply(this,params);const local=bindings.CONTRIBUTION_TASKS!.getByName(taskId);await local.act("release",{reservation_key:key()},"",now);return value;});
 const result=await reserve(actor);expect(result.data.status).toBe("released");expect(result.data.work_funding_state).toBe("released");expect((await ledger().summary()).held_atomic).toBe("0");
});
it("leaves work stopped and funds held if cleanup fails, then repairs it through the alarm",async()=>{
 const actor=await task();await reserve(actor);
 const spy=vi.spyOn(FieldWalletAllocations.prototype,"cancelContributionWork").mockImplementationOnce(()=>{throw new Error("lost request");});
 expect((await release(actor)).status).toBe(503);expect((await ledger().summary()).held_atomic).toBe("6000000");expect((await submit(actor)).status).toBe(409);
 await runInDurableObject(actor,async(_,state)=>{expect(await state.storage.getAlarm()).toBeLessThan(now+hour);});spy.mockRestore();
 await alarm(actor,now+60000);expect((await ledger().summary()).held_atomic).toBe("0");expect((await actor.adminView())!.reservations[0]!.work_funding!.state).toBe("released");
});
it("recovers cleanup after cancellation succeeded but the response was lost",async()=>{
 const actor=await task();await reserve(actor);const original=FieldWalletAllocations.prototype.cancelContributionWork;
 const spy=vi.spyOn(FieldWalletAllocations.prototype,"cancelContributionWork").mockImplementationOnce(function(this:FieldWalletAllocations,...params){original.apply(this,params);throw new Error("lost reply");});
 expect((await release(actor)).status).toBe(503);expect((await ledger().summary()).held_atomic).toBe("0");spy.mockRestore();
 expect((await release(actor)).data.work_funding_state).toBe("released");
});
it("expires unused work but retains submitted evidence and its funding past the reservation deadline",async()=>{
 const a=await task(),b=await task();vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(12000000n);await reserve(a);await reserve(b);await submit(b);
 await alarm(a,now+hour);await alarm(b,now+hour);
 expect((await a.adminView())!.reservations[0]!.status).toBe("released");expect((await b.adminView())!.reservations[0]!.status).toBe("submitted");expect((await ledger().summary()).held_atomic).toBe("6000000");
 expect((await submit(a,1,now+hour)).status).toBe(409);expect((await release(b)).status).toBe(409);
});
it("reuses the work hold through acceptance and issuance without a second allocation or current-wallet lookup",async()=>{
 const actor=await task();const r=await reserve(actor);await submit(actor);
 vi.mocked(payout.contributionFundingWallet).mockClear().mockResolvedValue(recipient);vi.mocked(rpc.getFinalizedBlockNumber).mockRejectedValue(new Error("offline"));
 expect((await actor.act("review",{submission_id:r.data.submission_id,...review},"",now)).status).toBe(200);
 expect(payout.contributionFundingWallet).not.toHaveBeenCalled();expect(await ledger().summary()).toMatchObject({held_atomic:"6000000",work_reservations:0,contribution_commitments:1});
 const row=(await actor.adminView())!.reservations[0]!;expect(row.acceptance_funding!.wallet).toBe(wallet);
 vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(100);await ledger().reserve(wallet,"contributions",args(),now,row.acceptance_funding!.id);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
 await runInDurableObject(ledger(),async instance=>{expect(()=>instance.cancelContributionWork(wallet,row.acceptance_funding!.id,"6000000")).toThrow();});
});
it("releases rejected work only after retaining the immutable rejection and recovers the same review",async()=>{
 const actor=await task(),r=await reserve(actor);await submit(actor);
 const body={submission_id:r.data.submission_id,...review,decision:"rejected"};const spy=vi.spyOn(FieldWalletAllocations.prototype,"cancelContributionWork").mockImplementationOnce(()=>{throw new Error("offline");});
 expect((await actor.act("review",body,"",now)).status).toBe(503);const before=(await actor.adminView())!.reservations[0]!;expect(before.status).toBe("rejected");expect((await ledger().summary()).held_atomic).toBe("6000000");spy.mockRestore();
 expect((await actor.act("review",{...body,decision:"accepted"},"",now)).status).toBe(409);
 expect((await actor.act("review",body,"",now+1000)).status).toBe(200);expect((await actor.adminView())!.reservations[0]!.review).toEqual(before.review);expect((await ledger().summary()).held_atomic).toBe("0");
});
it("does not schedule a later reservation over an earlier expiry",async()=>{
 const actor=await task(true,2,now+24*hour);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(12000000n);await reserve(actor,1,now);
 await runInDurableObject(actor,async(_,state)=>{await state.storage.setAlarm(now+1000);});await reserve(actor,2,now+2000);
 await runInDurableObject(actor,async(_,state)=>{expect(await state.storage.getAlarm()).toBe(now+1000);});
});
it("keeps a reservation valid after the keeper closes new slots and leaves manual terms unchanged",async()=>{
 const signed=await task();await reserve(signed);await signed.act("close",{},"",now);expect((await submit(signed)).status).toBe(200);
 const manual=await task(false);vi.mocked(payout.contributionFundingWallet).mockClear();const result=await reserve(manual);expect(result.status).toBe(200);expect(result.data.work_funding_state).toBeUndefined();expect(payout.contributionFundingWallet).not.toHaveBeenCalled();expect((await manual.publicView(now))!.reservation_funding).toBe("not_managed");
});
it("serves pending funding and same-key instructions privately without leaking ledger identities",async()=>{
 const actor=await task(),id=(await actor.publicView(now))!.id;vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(0n);
 const request=(action:string)=>SELF.fetch(`https://scvd.store${CONTRIBUTION_API}/${id}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reservation_key:key()})});
 expect((await request("reserve")).status).toBe(503);const status=await request("status");const body=await status.json() as {status:string;next_steps:Array<{action:string}>};expect(body.status).toBe("funding_pending");expect(body.next_steps.map(s=>s.action)).toEqual(["reserve","release"]);
 const saved=(await actor.adminView())!;const html=renderContributionDesk(null,saved,now,"https://scvd.store");expect(html).toContain("Work funding: pending");
 for(const value of [wallet,saved.reservations[0]!.id,key()])expect(JSON.stringify(await actor.publicView(now))).not.toContain(value);
 expect(JSON.stringify(body)).not.toContain(wallet);
});
it("cancels before wallet lookup completes without allowing a late hold",async()=>{
 const actor=await task();
 await runInDurableObject(actor,async instance=>{
  let finish!:(wallet:string)=>void,started!:()=>void;const began=new Promise<void>(resolve=>{started=resolve;});
  vi.mocked(payout.contributionFundingWallet).mockImplementationOnce(()=>{started();return new Promise(resolve=>{finish=resolve;});});
  const pending=instance.act("reserve",{reservation_key:key()},"visitor",now);await began;
  expect((await instance.act("release",{reservation_key:key()},"",now)).data.work_funding_state).toBe("released");finish(wallet);
  expect((await pending).data.status).toBe("released");expect(instance.adminView()!.reservations[0]!.work_funding!.wallet).toBeUndefined();
 });
 expect((await ledger().summary()).held_atomic).toBe("0");
});
it("does not retain a signed reservation if its cleanup alarm cannot be scheduled",async()=>{
 const actor=await task();await runInDurableObject(actor,async(instance,state)=>{
  const spy=vi.spyOn(state.storage,"transaction").mockRejectedValueOnce(new Error("alarm unavailable"));
  await expect(instance.act("reserve",{reservation_key:key()},"visitor",now)).rejects.toThrow("alarm unavailable");spy.mockRestore();
  expect(instance.adminView()!.reservations).toHaveLength(0);
 });expect(payout.contributionFundingWallet).not.toHaveBeenCalled();expect((await ledger().summary()).held_atomic).toBe("0");
});
it("rolls back acceptance conversion if saving its work-hold transition fails",async()=>{
 const identity=`atomic-work:${crypto.randomUUID()}`;await ledger().reserveContributionWork(wallet,identity,"6000000",now);
 await runInDurableObject(ledger(),async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("UPDATE contribution_work_holds"))throw new Error("transition failed");return exec(query,...values);});
  await expect(instance.commitContribution(wallet,identity,recipient,"6000000",now)).rejects.toThrow();spy.mockRestore();
  expect(instance.summary()).toMatchObject({held_atomic:"6000000",work_reservations:1,contribution_commitments:0});
  await instance.commitContribution(wallet,identity,recipient,"6000000",now);expect(instance.summary()).toMatchObject({held_atomic:"6000000",work_reservations:0,contribution_commitments:1});
 });
});

it("runs the platform alarm callback against the injected clock",async()=>{
 const actor=await task();await reserve(actor);vi.mocked(Date.now).mockReturnValue(now+hour);
 expect(await runDurableObjectAlarm(actor)).toBe(true);
 expect((await actor.adminView())!.reservations[0]!.work_funding!.state).toBe("released");expect((await ledger().summary()).held_atomic).toBe("0");
});
it.each(["released","rejected"] as const)("recovers a crash between saving %s work and marking its cleanup pending",async terminal=>{
 const actor=await task(),reserved=await reserve(actor);if(terminal==="rejected")await submit(actor);
 await runInDurableObject(actor,async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...values)=>{if(query.startsWith("INSERT INTO task") && String(values[0]).includes('"state":"release_pending"'))throw new Error("interrupted cleanup intent");return exec(query,...values);});
  const result=terminal==="released" ? await instance.act("release",{reservation_key:key()},"",now) : await instance.act("review",{submission_id:reserved.data.submission_id,...review,decision:"rejected"},"",now);
  expect(result.status).toBe(503);spy.mockRestore();expect(instance.adminView()!.reservations[0]!).toMatchObject({status:terminal,work_funding:{state:"held"}});
 });
 expect((await ledger().summary()).held_atomic).toBe("6000000");await alarm(actor,now+60000);expect((await ledger().summary()).held_atomic).toBe("0");
});
