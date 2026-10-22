import {env, SELF, runInDurableObject} from 'cloudflare:test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {authorizationTypes} from '@x402/evm';
import * as payout from '@/services/contribution-payout';
import * as rpc from '@/lib/base-rpc';
import {FieldWalletAllocations,allocationLedger} from '@/services/field-wallet-allocations';
import {renderContributionDesk} from '@/pages/admin/contribution-tasks';
import type {ContributionTask,ContributionTaskState} from '@/services/contribution-task';
import type {FieldSigner} from '@/services/launch-check';
import type {Env} from '@/types';
const bindings=env as unknown as Env,now=Date.UTC(2026,9,22,12),accepted=now-86400000;
const wallet=`0x${'1'.repeat(40)}`,recipient=`0x${'2'.repeat(40)}`,nonce=`0x${'3'.repeat(64)}`,tx=`0x${'4'.repeat(64)}`,hash=`0x${'5'.repeat(64)}`;
const id='manual-brief:00000000-0000-0000-0000-000000000001',second='manual-brief:00000000-0000-0000-0000-000000000002';
const ledger=()=>allocationLedger(bindings,wallet);
const topic=(a:string)=>`0x${a.slice(2).padStart(64,'0')}`;
function args():Parameters<FieldSigner['signTypedData']>[0] {return {domain:{name:'USD Coin',version:'2',chainId:8453,verifyingContract:rpc.BASE_USDC},types:{TransferWithAuthorization:[...authorizationTypes.TransferWithAuthorization]},primaryType:'TransferWithAuthorization',message:{from:wallet,to:recipient,value:'6000000',validAfter:'0',validBefore:String(now/1000+3600),nonce}};}
function receipt():rpc.RpcReceipt {return {transactionHash:tx,blockHash:hash,status:'0x1',blockNumber:'0x65',logs:[{address:rpc.BASE_USDC,topics:[rpc.TRANSFER_TOPIC,topic(wallet),topic(recipient)],data:`0x${(6000000).toString(16).padStart(64,'0')}`} ]};}
function paid(){vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(102);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(4000000n);}
async function imported(identity=id){return ledger().importManualContribution(wallet,identity,recipient,'6000000',accepted,now);}
async function release(identity=id,transaction=tx){return runInDurableObject(ledger(),async instance=>{try{return await instance.releaseManualContribution(wallet,identity,transaction,now);}catch{return {refused:true};}});}
beforeEach(async()=>{
 await runInDurableObject(ledger(),async(_,state)=>{for(const table of ['manual_contribution_holds','contribution_work_holds','contribution_releases','contribution_commitments','allocations','allocation_meta'])state.storage.sql.exec(`DELETE FROM ${table}`);});
 vi.spyOn(rpc,'getFinalizedBlockNumber').mockResolvedValue(100);
 vi.spyOn(rpc,'getBlockTimestamp').mockResolvedValue(new Date(now-1000));
 vi.spyOn(rpc,'usdcBalanceOf').mockResolvedValue(10000000n);
 vi.spyOn(rpc,'getReceipt').mockResolvedValue(receipt());vi.spyOn(rpc,'getChainId').mockResolvedValue('0x2105');vi.spyOn(rpc,'getBlockHash').mockResolvedValue(hash);
 vi.spyOn(payout,'contributionFundingWallet').mockResolvedValue(wallet);
});
afterEach(()=>vi.restoreAllMocks());
it('counts manual debt once in the shared holds even with insufficient balance',async()=>{
 vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(1000000n);
 const results=await Promise.all([imported(),imported()]);expect(results.filter(r=>!r.reused)).toHaveLength(1);
 expect(await ledger().summary()).toMatchObject({held_atomic:'6000000',manual_contribution_holds:1,observed_shortfall_atomic:'5000000'});
 await runInDurableObject(ledger(),async i=>{await expect(i.reserve(wallet,'studies',args(),now)).rejects.toThrow();});
});
it('refuses changed identity terms and never converts manual debt into an authorization',async()=>{
 await imported();
 await runInDurableObject(ledger(),async i=>{
  await expect(i.importManualContribution(wallet,id,recipient,'7000000',accepted,now)).rejects.toThrow();
  await expect(i.importManualContribution(wallet,id,wallet,'6000000',accepted,now)).rejects.toThrow();
  await expect(i.importManualContribution(wallet,id,recipient,'6000000',accepted-1,now)).rejects.toThrow();
  await expect(i.importContributionDebt(wallet,id,recipient,'6000000',now)).rejects.toThrow();
  await expect(i.importContribution(wallet,id,args(),now)).rejects.toThrow();
  await expect(i.commitContribution(wallet,id,recipient,'6000000',now)).rejects.toThrow();
  await expect(i.reserveContributionWork(wallet,id,'6000000',now)).rejects.toThrow();
  await expect(i.reserve(wallet,'contributions',args(),now,id)).rejects.toThrow();
 });
 expect((await ledger().summary()).held_atomic).toBe('6000000');
});
it('refuses to import signed or canceled work as manual debt',async()=>{
 await ledger().importContributionDebt(wallet,id,recipient,'6000000',now);
 await ledger().cancelContributionWork(wallet,second,'6000000');
 await runInDurableObject(ledger(),async i=>{
  await expect(i.importManualContribution(wallet,id,recipient,'6000000',accepted,now)).rejects.toThrow();
  await expect(i.importManualContribution(wallet,second,recipient,'6000000',accepted,now)).rejects.toThrow();
 });
});
it('releases exactly once against finalized balance and permanently retains payment identity',async()=>{
 await imported();paid();const results=await Promise.all([release(),release()]);expect(results[0]).toEqual(results[1]);
 expect(results[0]).toMatchObject({transaction:tx,finalized_block:102,receipt_block:101,balance_atomic:'4000000'});
 expect(await ledger().summary()).toMatchObject({held_atomic:'0',manual_contribution_holds:0,released_contributions:1});
 vi.mocked(rpc.getReceipt).mockClear();expect(await release()).toEqual(results[0]);expect(await release(id,hash)).toEqual({refused:true});expect(rpc.getReceipt).not.toHaveBeenCalled();
 await runInDurableObject(ledger(),async i=>{await expect(i.importManualContribution(wallet,id,recipient,'6000000',accepted,now)).rejects.toThrow();});
});
it('never uses one reported transfer to clear two manual obligations, including concurrent checks',async()=>{
 await imported();await imported(second);paid();
 const results=await Promise.all([release(),release(second)]);
 expect(results.filter(r=>'transaction' in r)).toHaveLength(1);
 expect(results.filter(r=>'refused' in r)).toHaveLength(1);
 expect(await ledger().summary()).toMatchObject({held_atomic:'6000000',released_contributions:1});
});
it.each(['amount','recipient','payer','asset','batch','split','authorization','malformed_topic','malformed_data','reverted','transaction','chain','missing','missing_hash','orphaned','unfinalized','before_acceptance','future_block','stale_balance','rpc_error'] as const)('retains manual debt for %s evidence',async kind=>{
 await imported();paid();const r=receipt(),t=r.logs[0]!;
 if(kind==='amount')t.data=`0x${'0'.repeat(63)}1`;
 if(kind==='recipient')t.topics[2]=topic(wallet);
 if(kind==='payer')t.topics[1]=topic(recipient);
 if(kind==='asset')t.address=wallet;
 if(kind==='batch')r.logs.push({...t});
 if(kind==='split'){t.data=`0x${(3000000).toString(16).padStart(64,'0')}`;r.logs.push({...t});}
 if(kind==='authorization')r.logs.unshift({address:rpc.BASE_USDC,topics:[rpc.AUTHORIZATION_USED_TOPIC,topic(wallet),nonce],data:'0x'});
 if(kind==='malformed_topic')t.topics[1]=wallet;
 if(kind==='malformed_data')t.data='0x1';
 if(kind==='reverted')r.status='0x0';
 if(kind==='transaction')r.transactionHash=hash;
 if(kind==='chain')vi.mocked(rpc.getChainId).mockResolvedValue('0x1');
 if(kind==='missing_hash')delete r.blockHash;
 if(kind==='orphaned')vi.mocked(rpc.getBlockHash).mockResolvedValue(tx);
 if(kind==='unfinalized')r.blockNumber='0x67';
 if(kind==='before_acceptance')vi.mocked(rpc.getBlockTimestamp).mockImplementation(async(_e,b)=>new Date(b===101?accepted-1:now-1000));
 if(kind==='future_block')vi.mocked(rpc.getBlockTimestamp).mockImplementation(async(_e,b)=>new Date(b===101?now+1000:now-1000));
 if(kind==='stale_balance')vi.mocked(rpc.getBlockTimestamp).mockResolvedValue(new Date(now-7200000));
 vi.mocked(rpc.getReceipt).mockResolvedValue(kind==='missing'?null:r);
 if(kind==='rpc_error')vi.mocked(rpc.getReceipt).mockRejectedValue(new Error('private-rpc-data'));
 expect(await release()).toEqual({refused:true});
 expect(await ledger().summary()).toMatchObject({held_atomic:'6000000',released_contributions:0,finalized_block:100});
});
it('rolls back payment identity and balance floor if saving the release fails',async()=>{
 await imported();paid();
 await runInDurableObject(ledger(),async(i,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,'exec').mockImplementation((query,...values)=>{if(query.startsWith('INSERT INTO contribution_releases'))throw new Error('lost-save');return exec(query,...values);});
  await expect(i.releaseManualContribution(wallet,id,tx,now)).rejects.toThrow();spy.mockRestore();
  expect(i.summary()).toMatchObject({held_atomic:'6000000',finalized_block:100});
  expect(state.storage.sql.exec<{transaction_hash:string|null}>('SELECT transaction_hash FROM manual_contribution_holds').one().transaction_hash).toBeNull();
 });
 expect(await release()).toHaveProperty('transaction',tx);
});
it('a delayed allocation cannot use the pre-payment balance after manual release',async()=>{
 await imported();
 await runInDurableObject(ledger(),async i=>{
  let finish!:(n:bigint)=>void,started!:()=>void;const began=new Promise<void>(r=>{started=r;});
  vi.mocked(rpc.usdcBalanceOf).mockImplementationOnce(()=>{started();return new Promise(r=>{finish=r;});});
  const attempt=i.reserve(wallet,'studies',args(),now).then(()=>true,()=>false);
  await began;paid();await i.releaseManualContribution(wallet,id,tx,now);finish(10000000n);
  expect(await attempt).toBe(false);expect(i.summary().held_atomic).toBe('0');
 });
});
async function fixture(){
 const taskId=`manual-${crypto.randomUUID()}`,submission=crypto.randomUUID(),actor=bindings.CONTRIBUTION_TASKS!.getByName(taskId);
 const review={decision:'accepted',reason:'Meets terms',outcome:'no_change',reference:'https://scvd.store/what',at:new Date(accepted).toISOString()};
 const s:ContributionTaskState={terms:{id:taskId,kind:'docs',title:'Read docs',target:'https://scvd.store/what',brief:'Read',acceptance:'Report',reward_usd:6,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(accepted).toISOString(),closed:true,reservations:[{id:submission,key_hash:'private-key',visitor_hash:'private',reserved_at:new Date(accepted).toISOString(),submit_by:new Date(now).toISOString(),status:'accepted',review,payout_to:recipient}]};
 await runInDurableObject(actor,async(_,state)=>{state.storage.sql.exec('CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');state.storage.sql.exec('INSERT INTO task(id,data) VALUES(1,?)',JSON.stringify(s));});
 return {actor,s,body:{submission_id:submission}};
}
async function change(actor:DurableObjectStub<ContributionTask>,edit:(s:ContributionTaskState)=>void){await runInDurableObject<ContributionTask,void>(actor,async(_,state)=>{const s=JSON.parse(state.storage.sql.exec<{data:string}>('SELECT data FROM task').one().data) as ContributionTaskState;edit(s);state.storage.sql.exec('UPDATE task SET data=?',JSON.stringify(s));});}
it('preserves original manual terms and report, releases with no signing key, and keeps treasury data private',async()=>{
 const {actor,s,body}=await fixture();
 expect(renderContributionDesk(null,s,now,'https://scvd.store')).toContain('Import manual obligation');
 expect((await actor.importManualFunding(body,now)).status).toBe(200);
 expect((await actor.act('payment',{...body,tx_hash:tx},'keeper',now)).status).toBe(200);
 expect((await ledger().summary()).held_atomic).toBe('6000000');
 const before=(await actor.adminView())!;expect(renderContributionDesk(null,before,now,'https://scvd.store')).toContain('Reconcile reported manual payment');
 vi.mocked(payout.contributionFundingWallet).mockRejectedValue(new Error('rotated-key'));
 const signer=vi.spyOn(payout,'contributionSigner');paid();
 const result=await actor.releaseManualFunding(body,now);expect(result.status).toBe(200);
 expect(JSON.stringify(result)).not.toContain('balance_atomic');expect(JSON.stringify(result)).not.toContain('manual_funding');
 const after=(await actor.adminView())!;expect(after.terms).toEqual(s.terms);expect(after.reservations[0]!.review).toEqual(s.reservations[0]!.review);expect(after.reservations[0]!.payment).toEqual(before.reservations[0]!.payment);
 expect(after.reservations[0]!.manual_funding?.release).toHaveProperty('transaction',tx);expect(signer).not.toHaveBeenCalled();
 expect((await actor.releaseManualFunding(body,now)).status).toBe(200);
 expect((await actor.importManualFunding(body,now)).status).toBe(200);expect((await ledger().summary()).held_atomic).toBe('0');
});
it('recovers a lost import reply against the original wallet without extending the deadline',async()=>{
 const {actor,s,body}=await fixture(),original=FieldWalletAllocations.prototype.importManualContribution;
 const spy=vi.spyOn(FieldWalletAllocations.prototype,'importManualContribution').mockImplementationOnce(async function(this:FieldWalletAllocations,...args){await original.apply(this,args);throw new Error('private-lost-reply');});
 const failed=await actor.importManualFunding(body,now);expect(failed.status).toBe(503);expect(JSON.stringify(failed)).not.toContain('private-lost-reply');spy.mockRestore();
 expect((await actor.adminView())!.reservations[0]!.manual_funding).toMatchObject({state:'pending',wallet});
 vi.mocked(payout.contributionFundingWallet).mockRejectedValue(new Error('rotated-key'));
 const retry=await actor.importManualFunding(body,now+1);expect(retry.status).toBe(200);expect(retry.data.payment_due_at).toBe(new Date(accepted+3*86400000).toISOString());
 expect((await actor.adminView())!.reservations[0]!.review).toEqual(s.reservations[0]!.review);expect((await ledger().summary()).held_atomic).toBe('6000000');
});
it('recovers a lost release reply without clearing another hold',async()=>{
 const {actor,body}=await fixture();await actor.importManualFunding(body,now);await actor.act('payment',{...body,tx_hash:tx},'keeper',now);paid();
 const original=FieldWalletAllocations.prototype.releaseManualContribution;
 const spy=vi.spyOn(FieldWalletAllocations.prototype,'releaseManualContribution').mockImplementationOnce(async function(this:FieldWalletAllocations,...args){await original.apply(this,args);throw new Error('lost-reply');});
 expect((await actor.releaseManualFunding(body,now)).status).toBe(503);spy.mockRestore();
 expect((await actor.releaseManualFunding(body,now)).status).toBe(200);expect((await ledger().summary()).released_contributions).toBe(1);
});
it.each(['signed','submitted','missing_recipient','managed'] as const)('refuses %s work in the manual path',async kind=>{
 const {actor,body}=await fixture();await change(actor,s=>{const r=s.reservations[0]!;if(kind==='signed')s.terms.payment_method='signed_authorization';if(kind==='submitted')r.status='submitted';if(kind==='missing_recipient')delete r.payout_to;if(kind==='managed')r.work_funding={id:`${s.terms.id}:${r.id}`,wallet,state:'held'};});
 expect((await actor.importManualFunding(body,now)).status).toBe(409);expect((await ledger().summary()).held_atomic).toBe('0');
});
it('does not accept replacement payment details or reconcile an unreported payment',async()=>{
 const {actor,body}=await fixture();await actor.importManualFunding(body,now);
 expect((await actor.releaseManualFunding(body,now)).status).toBe(409);
 expect((await actor.releaseManualFunding({...body,tx_hash:tx},now)).status).toBe(400);
});
it('keeps both actions authenticated and same-origin with form retries using only the submission',async()=>{
 const {s,body}=await fixture();
 vi.mocked(rpc.getFinalizedBlockNumber).mockRejectedValue(new Error('unavailable'));
 for(const action of ['import-manual-funding','release-manual-funding']){
  const url=`https://scvd.store/admin/bounties/contributions/${s.terms.id}/${action}`;
  expect((await SELF.fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(401);
  const auth={Authorization:`Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`,'Content-Type':'application/x-www-form-urlencoded'};
  expect((await SELF.fetch(url,{method:'POST',headers:{...auth,Origin:'https://other.invalid'},body:new URLSearchParams(body).toString()})).status).toBe(403);
  const r=await SELF.fetch(url,{method:'POST',headers:{...auth,Origin:'https://scvd.store'},body:new URLSearchParams(body).toString(),redirect:'manual'});
  expect(r.status).toBe(action==='import-manual-funding'?503:409);
  const html=await r.text();expect(html).toContain('Retry this same action');expect(html).toContain(`name="submission_id" value="${body.submission_id}"`);
 }
});

it('rolls back the imported debt and balance together when its save fails',async()=>{
 await runInDurableObject(ledger(),async(i,state)=>{
  const exec=state.storage.sql.exec.bind(state.storage.sql);
  const spy=vi.spyOn(state.storage.sql,'exec').mockImplementation((query,...values)=>{if(query.startsWith('INSERT INTO manual_contribution_holds'))throw new Error('save failed');return exec(query,...values);});
  await expect(i.importManualContribution(wallet,id,recipient,'6000000',accepted,now)).rejects.toThrow();spy.mockRestore();
  expect(i.summary()).toMatchObject({held_atomic:'0',balance_atomic:null,manual_contribution_holds:0});
 });
 expect(await imported()).toMatchObject({imported:true,reused:false});
});
it('preserves a payment report that arrives while the import is waiting for its wallet',async()=>{
 const {actor,body}=await fixture();
 await runInDurableObject(actor,async i=>{
  let finish!:(wallet:string)=>void,started!:()=>void;const began=new Promise<void>(r=>{started=r;});
  vi.mocked(payout.contributionFundingWallet).mockImplementationOnce(()=>{started();return new Promise(r=>{finish=r;});});
  const pending=i.importManualFunding(body,now);await began;
  expect((await i.act('payment',{...body,tx_hash:tx},'keeper',now)).status).toBe(200);
  finish(wallet);expect((await pending).status).toBe(200);
 });
 const saved=(await actor.adminView())!.reservations[0]!;
 expect(saved.payment?.tx_hash).toBe(tx);expect(saved.status).toBe('payment_reported');expect(saved.manual_funding?.state).toBe('held');
});
it('refuses a manual release overtaken by a newer retained balance',async()=>{
 await imported();paid();
 await runInDurableObject(ledger(),async i=>{
  let finish!:(hash:string)=>void,started!:()=>void;const began=new Promise<void>(r=>{started=r;});
  vi.mocked(rpc.getBlockHash).mockImplementationOnce(()=>{started();return new Promise(r=>{finish=r;});});
  const old=i.releaseManualContribution(wallet,id,tx,now).then(()=>true,()=>false);await began;
  vi.mocked(rpc.getFinalizedBlockNumber).mockResolvedValue(103);vi.mocked(rpc.usdcBalanceOf).mockResolvedValue(10000000n);
  await i.importManualContribution(wallet,second,recipient,'6000000',accepted,now);finish(hash);
  expect(await old).toBe(false);expect(i.summary()).toMatchObject({held_atomic:'12000000',finalized_block:103,released_contributions:0});
 });
});
