import {jcsCanonicalize} from '@/lib/jcs';
import {sha256Hex} from '@/lib/idempotency';
import {signMessage} from '@/lib/signing';
import {issuerDid} from '@/lib/did-key';
import {BASE_NETWORK} from '@/lib/payment-networks';
import {CONTRIBUTION_RECEIPT_SIGNS, CONTRIBUTION_RECEIPT_LIMITS, CONTRIBUTION_RECEIPT_VERIFY} from '@/store/contribution-receipt';
import type {ContributionTaskState, ContributionReservation} from '@/services/contribution-task';
import type {Env} from '@/types';
export interface ContributionReceipt {algorithm:'ed25519'; signed_payload:string; signature:string; public_key:string; verification:string}
export async function signContributionAcceptance(env:Env, state:ContributionTaskState, row:ContributionReservation, now:number):Promise<ContributionReceipt> {
  if (row.review?.decision !== 'accepted' || !row.report || !row.submitted_at || !row.payout_to) throw new Error('Accepted contribution required');
  const [terms_sha256, report_sha256, review_sha256] = await Promise.all([state.terms,row.report,row.review].map(value=>sha256Hex(jcsCanonicalize(value))));
  const signed_payload = jcsCanonicalize({type:'scvd.contribution-acceptance.v1',issuer:issuerDid(env.STORE_BASE_URL),trust_model:'self_signed',
    task_id:state.terms.id,submission_id:row.id,terms_sha256,report_sha256,review_sha256,
    hash_covers:'sha256 of RFC 8785 canonical JSON: terms is the exact posted terms object (legacy omitted payment_method stays omitted); report and review are their original objects.',
    decision:row.review.decision,outcome:row.review.outcome,submitted_at:row.submitted_at,reviewed_at:row.review.at,issued_at:new Date(now).toISOString(),
    declared_payout_to:row.payout_to,reward_usd:state.terms.reward_usd,network:BASE_NETWORK,payment_method:state.terms.payment_method ?? 'keeper_paid_base_usdc',
    payment_due_at:new Date(Date.parse(row.review.at)+state.terms.payment_days*86400000).toISOString(),payment_verified:false,
    signs:CONTRIBUTION_RECEIPT_SIGNS,does_not_prove:CONTRIBUTION_RECEIPT_LIMITS});
  const signed=await signMessage(signed_payload,env.SIGNING_KEY);
  return {algorithm:'ed25519',signed_payload,signature:signed.signature,public_key:signed.publicKey,verification:CONTRIBUTION_RECEIPT_VERIFY};
}
