import {env} from 'cloudflare:test';
import {describe,expect,it} from 'vitest';
import {summarizeRewardCommitments, readRewardCommitments} from '@/services/reward-commitments';
import type {ContributionTaskState} from '@/services/contribution-task';
import type {Env} from '@/types';
const now = Date.parse('2026-10-16T12:00:00Z');
function contribution(): ContributionTaskState {
  return {terms:{id:'example',kind:'docs',title:'Read docs',target:'https://example.com',brief:'Read',acceptance:'Report',reward_usd:2.5,slots:2,expires_at:new Date(now+86400000).toISOString(),review_days:3,payment_days:3},published_at:new Date(now).toISOString(),closed:false,reservations:[{id:'one',key_hash:'private',visitor_hash:'private',reserved_at:new Date(now).toISOString(),submit_by:new Date(now+1000).toISOString(),status:'accepted',payout:{created_at:new Date(now).toISOString(),signature:'private-signature',authorization:{from:'private-wallet',to:'private-wallet',value:'2500000',validAfter:'0',validBefore:'1',nonce:'private-nonce'}}}]};
}
describe('reward commitments before increasing capacity',()=>{
  it('counts accepted contribution work once, keeps expired authorization unresolved and excludes private data',()=>{
    const result=summarizeRewardCommitments([contribution()],[],[],now);
    expect(result.contributions.accepted_unreconciled_usd).toBe(2.5);
    expect(result.contributions.issued_authorization_subset_usd).toBe(2.5);
    expect(result.contributions.expired_authorizations).toBe(1);
    expect(result.contributions.available_slot_maximum_usd).toBe(2.5);
    expect(result.reward_exposure_usd).toBe(2.5);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.spendable_usd).toBeNull();
  });
  it('separates future work and manual reports from chain-verified payment',()=>{
    const state=contribution();state.closed=true;state.reservations[0]!.status='payment_reported';delete state.reservations[0]!.payout;
    state.reservations[0]!.payment={tx_hash:'private',at:new Date(now).toISOString(),verification:'not_checked'};
    const result=summarizeRewardCommitments([state],[],[],now);
    expect(result.contributions.accepted_unreconciled_usd).toBe(2.5);
    expect(result.contributions.manual_report_subset_usd).toBe(2.5);
    expect(result.contributions.available_slot_maximum_usd).toBe(0);
  });
  it('does not turn missing contribution storage into a zero-obligation result',async()=>{
    const result=await readRewardCommitments({...env,CONTRIBUTION_TASKS:undefined} as unknown as Env,now);
    expect(result.scan_complete).toBe(false);
    expect(result.reward_exposure_usd).toBeNull();
    expect(result.gaps).toContain('contributions_unavailable');
  });
});

// Only the retained reward fields participate in this pure summary.
it('combines three programs while excluding expired shopping and study authorizations',()=>{
  const valid = String(Math.floor(now/1000)+1);
  const bounties = [{status:'paid',reward_usd:0.25,claim:{authorization_valid_before:valid}}, {status:'paid',reward_usd:9,claim:{authorization_valid_before:'1'}}] as import('@/services/bounty-board').BountyRecord[];
  const studies = [{debrief:{reward_usd:6,authorization_valid_before:valid}}, {debrief:{reward_usd:9,authorization_valid_before:'1'}}] as import('@/services/field-study').StudyRecord[];
  expect(summarizeRewardCommitments([contribution()],bounties,studies,now).reward_exposure_usd).toBe(8.75);
});
it('does not report a complete total when an indexed record disappears during the scan',async()=>{
  const {KV_KEYS}=await import('@/lib/kv-keys');
  const runtime={...env,COUNTERS:{list:async({prefix}:{prefix:string})=>({keys:prefix===KV_KEYS.bountyPrefix?[{name:prefix+'missing'}]:[],list_complete:true}),get:async()=>null}} as unknown as Env;
  const result=await readRewardCommitments(runtime,now);
  expect(result.scan_complete).toBe(false);
  expect(result.reward_exposure_usd).toBeNull();
  expect(result.gaps).toContain('shopping_record_unavailable');
});

it('preserves sub-cent USDC authorizations in the combined inventory',()=>{
  const valid = String(Math.floor(now/1000)+1);
  const bounties = [0.001, 0.000001].map(reward_usd=>({status:'paid',reward_usd,claim:{authorization_valid_before:valid}})) as import('@/services/bounty-board').BountyRecord[];
  const result=summarizeRewardCommitments([contribution()],bounties,[],now);
  expect(result.shopping_authorization_face_value_usd).toBe(0.001001);
  expect(result.reward_exposure_usd).toBe(2.501001);
});

it('separates manual terms from signed rewards without treating a manual report as payment',()=>{
  const manual=contribution(); delete manual.reservations[0]!.payout;
  const reported=contribution(); delete reported.reservations[0]!.payout;
  reported.reservations[0]!.status='payment_reported';
  reported.reservations[0]!.payment={tx_hash:'private-transaction',at:new Date(now).toISOString(),verification:'not_checked'};
  const signed=contribution(); signed.terms.payment_method='signed_authorization';
  const pending=contribution(); pending.reservations[0]!.status='submitted';
  const result=summarizeRewardCommitments([manual,reported,signed,pending],[],[],now);
  expect(result.contributions).toMatchObject({manual_terms_accepted_subset_usd:5,manual_terms_without_report_subset_usd:2.5,accepted_total_usd:7.5,accepted_unreconciled_usd:7.5,manual_report_subset_usd:2.5,conditional_reserved_or_submitted_usd:2.5});
  expect(result.reward_exposure_usd).toBe(7.5);
  expect(JSON.stringify(result)).not.toContain('private-transaction');
});
