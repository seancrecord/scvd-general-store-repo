import {BASE_EVM} from '@/lib/base-rpc';
import {usdcToAtomic} from '@/lib/payments';
import {readTransferClaim, FINALITY_BLOCKS} from '@/services/attestation';
import {ContributionInputError, type ContributionTaskState} from '@/services/contribution-task';
import type {Env} from '@/types';

export const CONTRIBUTION_RECONCILIATION_LIMITS = 'A fresh read of one supplied Base transaction against the retained reward authorization. This observation is not saved, signed or deducted from the funding inventory. It does not establish spendable wallet balance, reserve funds, authorize another payout or pay gas. Legacy manual payments lack the retained authorization needed for this check.';

/** A consumed nonce can also mean cancellation. Require the exact event/transfer pair. */
export async function reconcileContributionPayment(env: Env, task: ContributionTaskState, submissionId: string, transaction: string, now = Date.now()) {
  if (!/^0x[0-9a-f]{64}$/i.test(transaction)) throw new ContributionInputError('Enter a Base transaction hash: 0x followed by 64 hexadecimal characters.');
  const row = task.reservations.find(r => r.id === submissionId);
  const base = {read_at:new Date(now).toISOString(), task_id:task.terms.id, submission_id:submissionId,
    transaction, network:BASE_EVM.caip2, reward_usd:task.terms.reward_usd, required_confirmations:FINALITY_BLOCKS,
    limits:CONTRIBUTION_RECONCILIATION_LIMITS};
  const unavailable = (reason: string) => ({...base, status:'unavailable' as const, reason, confirmations:null as number | null});
  if (!row || row.status !== 'accepted' || task.terms.payment_method !== 'signed_authorization' || !row.payout?.signature) return unavailable('issued_authorization_required');
  const a = row.payout.authorization;
  // The retained authorizer survives wallet rotation; never substitute today's key.
  if (!/^0x[0-9a-f]{40}$/i.test(a.from) || !/^0x[0-9a-f]{40}$/i.test(a.to) ||
    !/^0x[0-9a-f]{64}$/i.test(a.nonce) || !/^\d+$/.test(a.value) ||
    !Number.isFinite(task.terms.reward_usd) || task.terms.reward_usd <= 0 ||
    a.to.toLowerCase() !== row.payout_to?.toLowerCase() || BigInt(a.value) !== BigInt(usdcToAtomic(task.terms.reward_usd))) return unavailable('retained_terms_inconsistent');
  try {
    const read = await readTransferClaim(env, transaction, {txHash:transaction, payer:a.from, recipient:a.to,
      nonce:a.nonce, amountUsdc:task.terms.reward_usd,
      authorization:{network:BASE_EVM.caip2, asset:BASE_EVM.usdc, payer:a.from, recipient:a.to, nonce:a.nonce, amount_atomic:a.value}}, BASE_EVM);
    const exact = read.authorization;
    if (!exact || exact.status === 'unavailable') return unavailable(exact?.reason ?? 'exact_authorization_not_read');
    if (exact.status !== 'matched') return {...base,status:'not_matched' as const,reason:exact.reason,confirmations:read.confirmations};
    if (read.status === 'SETTLED') return {...base,status:'confirmed' as const,reason:'retained_authorization_and_reward_matched',confirmations:read.confirmations};
    if (read.status === 'PENDING_FINALITY') return {...base,status:'pending_finality' as const,reason:'matching_transfer_needs_more_confirmations',confirmations:read.confirmations};
    return unavailable('settlement_not_established');
  } catch {
    // RPC errors can contain provider details. Never echo them into the admin response.
    return unavailable('chain_read_unavailable');
  }
}
