import {env, runInDurableObject} from 'cloudflare:test';
import {expect, it, vi, afterEach} from 'vitest';
import {summarizeRewardCommitments} from '@/services/reward-commitments';
import {renderContributionDesk} from '@/pages/admin/contribution-tasks';
import type {ContributionTaskState} from '@/services/contribution-task';
import type {Env} from '@/types';
const now=Date.parse('2026-10-16T12:00:00Z');
const payer=`0x${'1'.repeat(40)}`,recipient=`0x${'2'.repeat(40)}`,nonce=`0x${'3'.repeat(64)}`,tx=`0x${'4'.repeat(64)}`;
function fixture(): ContributionTaskState {
 return {terms:{id:`saved-${crypto.randomUUID()}`,kind:'docs',title:'Read docs',target:'https://example.com',brief:'Read',acceptance:'Report',payment_method:'signed_authorization',reward_usd:2.5,slots:1,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(now).toISOString(),closed:false,reservations:[{id:'one',key_hash:'private-key',visitor_hash:'private-visitor',reserved_at:new Date(now).toISOString(),submit_by:new Date(now).toISOString(),status:'accepted',payout_to:recipient,payout:{created_at:new Date(now).toISOString(),signature:'private-signature',authorization:{from:payer,to:recipient,value:'2500000',validAfter:'0',validBefore:'1',nonce}}}]};
}
afterEach(()=>vi.restoreAllMocks());
it('explains that the reward check retains a private observation for the funding view',()=>{
 expect(renderContributionDesk(null,fixture(),now,'https://scvd.store')).toContain('Save a payment observation');
});

import * as reconciliation from '@/services/contribution-reconciliation';
import {BASE_EVM} from '@/lib/base-rpc';
import {FINALITY_BLOCKS} from '@/services/attestation';
import {sha256Hex} from '@/lib/idempotency';
const bindings=env as unknown as Env;
function observation(s: ContributionTaskState, status: reconciliation.ContributionPaymentObservation['status']='confirmed', transaction=tx): reconciliation.ContributionPaymentObservation {
 return {read_at:new Date(now).toISOString(),task_id:s.terms.id,submission_id:'one',transaction,network:BASE_EVM.caip2,reward_usd:2.5,required_confirmations:FINALITY_BLOCKS,limits:reconciliation.CONTRIBUTION_RECONCILIATION_LIMITS,status,reason:status,confirmations:20,
 ...(status==='confirmed'?{binding:{asset:BASE_EVM.usdc,authorizer:payer,recipient,nonce,amount_atomic:'2500000',block_height:100,authorization_receipt_offset:0,transfer_receipt_offset:1}}:{})};
}
async function stored(s=fixture()) {
 const actor=bindings.CONTRIBUTION_TASKS!.getByName(s.terms.id);
 await runInDurableObject(actor,async(_instance,state)=>{
  state.storage.sql.exec('CREATE TABLE IF NOT EXISTS task (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  state.storage.sql.exec('INSERT INTO task(id,data) VALUES(1,?)',JSON.stringify(s));
 });
 return actor;
}
function confirmed(s=fixture()) {
 const read=observation(s);s.reservations[0]!.payment_checks={latest:read,confirmed:read};return s;
}
it('shows observed redemption separately while preserving gross exposure and never claiming available funds',()=>{
 const s=confirmed();const r=summarizeRewardCommitments([s],[],[],now);
 expect(r.contributions).toMatchObject({accepted_total_usd:2.5,confirmed_redemption_observed_usd:2.5,accepted_unreconciled_usd:0,confirmation_observed_from:new Date(now).toISOString()});
 expect(r.reward_exposure_usd).toBe(2.5);expect(r.spendable_usd).toBeNull();
 expect(JSON.stringify(r)).not.toContain(nonce);expect(JSON.stringify(r)).not.toContain('private');
});
it.each(['recipient','nonce','amount','payer','asset','task','submission','finality','future','pair','unsigned'] as const)('does not subtract a confirmation with mismatching %s',field=>{
 const s=confirmed(),row=s.reservations[0]!,r=row.payment_checks!.confirmed!,b=r.binding!;
 if(field==='recipient') b.recipient=payer;
 if(field==='nonce') b.nonce=tx;
 if(field==='amount') b.amount_atomic='1';
 if(field==='payer') b.authorizer=recipient;
 if(field==='asset') b.asset=payer;
 if(field==='task') r.task_id='different-task';
 if(field==='submission') r.submission_id='different-submission';
 if(field==='finality') r.confirmations=FINALITY_BLOCKS-1;
 if(field==='future') r.read_at=new Date(now+1).toISOString();
 if(field==='pair') b.transfer_receipt_offset=3;
 if(field==='unsigned') delete row.payout!.signature;
 expect(summarizeRewardCommitments([s],[],[],now).contributions.accepted_unreconciled_usd).toBe(2.5);
});
it('does not use one nonce to subtract two separately indexed obligations',()=>{
 const a=confirmed(),b=confirmed();
 const r=summarizeRewardCommitments([a,b],[],[],now);
 expect(r.contributions).toMatchObject({accepted_total_usd:5,confirmed_redemption_observed_usd:2.5,accepted_unreconciled_usd:2.5});
});
it('withdraws credit after an unsuccessful recheck of the confirmed transaction but preserves its historical observation',async()=>{
 const s=confirmed(),actor=await stored(s);
 const read=vi.spyOn(reconciliation,'reconcileContributionPayment').mockResolvedValue(observation(s,'unavailable'));
 expect(await actor.checkRewardPayment('one',tx,now)).toMatchObject({saved:true,status:'unavailable'});
 const after=(await actor.adminView())!;
 expect(after.reservations[0]!.payment_checks!.confirmed!.status).toBe('confirmed');
 expect(after.reservations[0]!.payment_checks!.latest.status).toBe('unavailable');
 expect(summarizeRewardCommitments([after],[],[],now).contributions.accepted_unreconciled_usd).toBe(2.5);
 const other=`0x${'6'.repeat(64)}`;
 read.mockResolvedValue(observation(s,'not_matched',other));await actor.checkRewardPayment('one',other,now);
 expect(summarizeRewardCommitments([(await actor.adminView())!],[],[],now).contributions.accepted_unreconciled_usd).toBe(2.5);
 read.mockResolvedValue(observation(s));await actor.checkRewardPayment('one',tx,now);
 expect(summarizeRewardCommitments([(await actor.adminView())!],[],[],now).contributions.accepted_unreconciled_usd).toBe(0);
});
it('does not discard a confirmed transaction when an unrelated candidate does not match',async()=>{
 const s=confirmed(),actor=await stored(s),other=`0x${'5'.repeat(64)}`;
 vi.spyOn(reconciliation,'reconcileContributionPayment').mockResolvedValue(observation(s,'not_matched',other));
 await actor.checkRewardPayment('one',other,now);
 expect(summarizeRewardCommitments([(await actor.adminView())!],[],[],now).contributions.accepted_unreconciled_usd).toBe(0);
});
it('retains only two bounded observations after repeated reads and exposes them only through private status',async()=>{
 const s=fixture(),key='a'.repeat(64);s.reservations[0]!.key_hash=await sha256Hex(key);const actor=await stored(s);
 vi.spyOn(reconciliation,'reconcileContributionPayment').mockResolvedValue(observation(s));
 await actor.checkRewardPayment('one',tx,now);await actor.checkRewardPayment('one',tx,now);
 const after=(await actor.adminView())!;
 expect(Object.keys(after.reservations[0]!.payment_checks!)).toEqual(['latest','confirmed']);
 expect(after.reservations[0]!.payout).toEqual(s.reservations[0]!.payout);
 expect(after.reservations[0]!.status).toBe('accepted');
 expect(JSON.stringify(await actor.publicView(now))).not.toContain(tx);
 expect((await actor.act('status',{reservation_key:key},'',now)).data.payment_checks?.confirmed?.transaction).toBe(tx);
 expect((await actor.act('status',{reservation_key:'b'.repeat(64)},'',now)).status).toBe(404);
});
it('does not let a slower old read overwrite a newer check or intervening stored notes',async()=>{
 const s=fixture(),actor=await stored(s),other=`0x${'5'.repeat(64)}`;
 let resolve!: (v: reconciliation.ContributionPaymentObservation)=>void;
 const old=new Promise<reconciliation.ContributionPaymentObservation>(r=>{resolve=r;});
 const read=vi.spyOn(reconciliation,'reconcileContributionPayment').mockImplementationOnce(()=>old).mockResolvedValueOnce(observation(s,'not_matched',other));
 const first=actor.checkRewardPayment('one',tx,now);
 await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(1));
 await runInDurableObject(actor,async(_instance,state)=>{
  const retained=JSON.parse(state.storage.sql.exec<{data:string}>('SELECT data FROM task WHERE id=1').toArray()[0]!.data) as ContributionTaskState;
  retained.closed=true;
  state.storage.sql.exec('UPDATE task SET data=? WHERE id=1',JSON.stringify(retained));
 });
 expect(await actor.checkRewardPayment('one',other,now+1)).toMatchObject({saved:true});
 resolve(observation(s));
 expect(await first).toMatchObject({saved:false,save_reason:'newer_check_started'});
 const after=(await actor.adminView())!;
 expect(after.closed).toBe(true);expect(after.reservations[0]!.payment_checks!.latest.transaction).toBe(other);
 expect(after.reservations[0]!.payment_checks!.confirmed).toBeUndefined();
});
it('validates transaction input before storing a check sequence',async()=>{
 const s=fixture(),actor=await stored(s);
 await runInDurableObject(actor,async instance=>{await expect(instance.checkRewardPayment('one','invalid',now)).rejects.toThrow('Base transaction hash');});
 expect(await actor.adminView()).toEqual(s);
 expect(await actor.checkRewardPayment('missing',tx,now)).toBeNull();
});
