import {SELF,env,runInDurableObject} from "cloudflare:test";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import * as payout from "@/services/contribution-payout";
import * as rpc from "@/lib/base-rpc";
import {allocationLedger} from "@/services/field-wallet-allocations";
import {renderContributionDesk} from "@/pages/admin/contribution-tasks";
import type {Env} from "@/types";
const bindings=env as unknown as Env,now=Date.UTC(2026,9,19,12);
const wallet=`0x${"1".repeat(40)}`,recipient=`0x${"2".repeat(40)}`,key="a".repeat(64);
const review={decision:"accepted",reason:"Meets the terms",outcome:"no_change",reference:"https://scvd.store/what"};
const ledger=()=>allocationLedger(bindings,wallet);
beforeEach(async()=>{
 await runInDurableObject(ledger(),async(_,state)=>{state.storage.sql.exec("DELETE FROM contribution_work_holds");state.storage.sql.exec("DELETE FROM contribution_releases");state.storage.sql.exec("DELETE FROM contribution_commitments");state.storage.sql.exec("DELETE FROM allocations");state.storage.sql.exec("DELETE FROM allocation_meta");});
 vi.spyOn(payout,"contributionFundingWallet").mockResolvedValue(wallet);
 vi.spyOn(rpc,"getFinalizedBlockNumber").mockResolvedValue(100);
 vi.spyOn(rpc,"getBlockTimestamp").mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,"usdcBalanceOf").mockResolvedValue(10000000n);
});
afterEach(()=>vi.restoreAllMocks());
async function submitted(signed=true){
 const id=`fund-${crypto.randomUUID()}`,store=bindings.CONTRIBUTION_TASKS!.getByName(id);
 await store.create({id,kind:"docs",title:"Read docs",target:"https://scvd.store/what",brief:"Read",acceptance:"Report",reward_usd:6,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3,},now);
 const reserved=await store.act("reserve",{reservation_key:key},"visitor",now);
 await store.act("submit",{reservation_key:key,payout_to:recipient,report:{attempted:"Read",environment:"Fixture",expected:"Contract",observed:"Matches",evidence:"Transcript",suggestion:"None"}},"",now);
 // Seed the existing pre-upgrade submission whose funding begins at acceptance.
 if(signed)await runInDurableObject(store,async(_,state)=>{const saved=JSON.parse(state.storage.sql.exec<{data:string}>("SELECT data FROM task").one().data);saved.terms.payment_method="signed_authorization";state.storage.sql.exec("UPDATE task SET data=?",JSON.stringify(saved));});
 return {store,id:reserved.data.submission_id!};
}
it("accepts only one of two six-USDC submissions against ten USDC",async()=>{
 const a=await submitted(),b=await submitted();
 const replies=await Promise.all([a,b].map(({store,id})=>store.act("review",{submission_id:id,...review},"",now)));
 expect(replies.map(r=>r.status).sort()).toEqual([200,503]);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
 for(const {store} of [a,b]){
  const state=(await store.adminView())!,row=state.reservations[0]!;
  expect(row.status).toBe(row.acceptance_funding!.state==="held"?"accepted":"submitted");
  const status=await store.act("status",{reservation_key:key},"",now);
  expect(status.data.acceptance_funding_state).toBe(row.acceptance_funding!.state);
  expect(JSON.stringify(await store.publicView(now))).not.toContain(wallet);
 }
});
it("recovers an uncertain funding response without a second hold, decision, or payment deadline",async()=>{
 const {store,id}=await submitted();
 const original=payout.reserveContributionAcceptance;
 const reserve=vi.spyOn(payout,"reserveContributionAcceptance").mockImplementationOnce(async(...args)=>{await original(...args);throw new Error("lost reply");});
 expect((await store.act("review",{submission_id:id,...review},"",now)).status).toBe(503);
 expect((await store.adminView())!.reservations[0]!.review).toBeUndefined();
 expect((await ledger().summary()).held_atomic).toBe("6000000");
 expect((await store.act("review",{submission_id:id,...review,decision:"rejected"},"",now)).data.code).toBe("review_pending");
 expect((await store.act("review",{submission_id:id,...review,reason:"Changed"},"",now)).data.code).toBe("review_pending");
 reserve.mockRestore();
 const result=await store.act("review",{submission_id:id,...review},"",now+1000);
 expect(result.status).toBe(200);expect(result.data.review?.at).toBe(new Date(now+1000).toISOString());
 expect((await store.act("review",{submission_id:id,...review},"",now+2000)).data.review).toEqual(result.data.review);
 expect((await ledger().summary()).contribution_commitments).toBe(1);
});
it("keeps the original wallet across a failed funding reply and refuses issuance after rotation",async()=>{
 const {store,id}=await submitted();
 const reserve=vi.spyOn(payout,"reserveContributionAcceptance").mockRejectedValueOnce(new Error("offline"));
 expect((await store.act("review",{submission_id:id,...review},"",now)).status).toBe(503);
 vi.mocked(payout.contributionFundingWallet).mockResolvedValue(`0x${"3".repeat(40)}`);
 reserve.mockRestore();
 expect((await store.act("review",{submission_id:id,...review},"",now)).status).toBe(200);
 const sign=vi.fn();vi.spyOn(payout,"contributionSigner").mockResolvedValue({address:`0x${"3".repeat(40)}`,signTypedData:sign});
 expect((await store.issueReward({submission_id:id},now)).data.code).toBe("payout_wallet_changed");expect(sign).not.toHaveBeenCalled();
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("preserves the funding intent if saving the final acceptance fails",async()=>{
 const {store,id}=await submitted();
 await runInDurableObject(store,async(instance,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,"exec").mockImplementation((query,...args)=>{
   if(query.startsWith("INSERT INTO task") && String(args[0]).includes('"state":"held"'))throw new Error("save failed");
   return exec(query,...args);
  });
  expect((await instance.act("review",{submission_id:id,...review},"",now)).status).toBe(503);spy.mockRestore();
 });
 expect((await store.adminView())!.reservations[0]!.status).toBe("submitted");
 expect((await ledger().summary()).held_atomic).toBe("6000000");
 expect((await store.act("review",{submission_id:id,...review},"",now)).status).toBe(200);
 expect((await ledger().summary()).held_atomic).toBe("6000000");
});
it("leaves manual-payment terms and rejected work outside the new acceptance holds",async()=>{
 for(const signed of [false,true]){
  const {store,id}=await submitted(signed);
  expect((await store.act("review",{submission_id:id,...review,decision:signed?"rejected":"accepted"},"",now)).status).toBe(200);
  expect((await store.adminView())!.reservations[0]!.acceptance_funding).toBeUndefined();
 }
 expect((await ledger().summary()).held_atomic).toBe("0");expect(payout.contributionFundingWallet).not.toHaveBeenCalled();
});
it("shows the retained pending review as a direct retry in the private desk",async()=>{
 const {store,id}=await submitted();vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(0n);
 await store.act("review",{submission_id:id,...review},"",now);
 const html=renderContributionDesk(null,await store.adminView(),now,"https://scvd.store");
 expect(html).toContain("Retry saved acceptance");expect(html).toContain('name="reason" value="Meets the terms"');
 expect(html).not.toContain("Accept and owe the posted reward</option>");
});

it("preserves the browser review fields and uncertain-save guidance on a funding failure",async()=>{
 const {store,id}=await submitted();vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(0n);vi.spyOn(Date,"now").mockReturnValue(now);
 const taskId=(await store.publicView(now))!.id;
 const response=await SELF.fetch(`https://scvd.store/admin/bounties/contributions/${taskId}/review`,{
  method:"POST",headers:{Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,Origin:"https://scvd.store","Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({submission_id:id,...review}).toString(),
 });
 expect(response.status).toBe(503);const html=await response.text();
 expect(html).toContain("This action may already have been saved");expect(html).toContain("Meets the terms");
 expect(html).toContain('name="submission_id" value="'+id+'"');
 expect((await store.adminView())!.reservations[0]!.status).toBe("submitted");
});
