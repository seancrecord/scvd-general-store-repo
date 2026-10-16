import {BASE_EVM} from '@/lib/base-rpc';
import {usdcToAtomic} from '@/lib/payments';
import {readTransferClaim, FINALITY_BLOCKS} from '@/services/attestation';
import {ContributionInputError, type ContributionTaskState, type ContributionReservation} from '@/services/contribution-task';
import type {Env} from '@/types';

export const CONTRIBUTION_RECONCILIATION_LIMITS = 'A fresh read of one supplied Base transaction against the retained reward authorization. The private desk saves the latest check and latest confirmed observation. These are unsigned, dated readings, not a live balance. The funding view keeps gross commitments and shows observed redemptions separately. It does not establish spendable wallet balance, reserve funds, authorize another payout or pay gas. Legacy manual payments lack the retained authorization needed for this check.';

export interface ContributionPaymentObservation {
  read_at: string; task_id: string; submission_id: string; transaction: string;
  network: string; reward_usd: number; required_confirmations: number; limits: string;
  status: 'confirmed' | 'pending_finality' | 'not_matched' | 'unavailable';
  reason: string; confirmations: number | null;
  binding?: {asset:string; authorizer:string; recipient:string; nonce:string; amount_atomic:string; block_height:number; authorization_receipt_offset:number; transfer_receipt_offset:number};
}
export interface ContributionPaymentChecks {latest:ContributionPaymentObservation; confirmed?:ContributionPaymentObservation; confirmation_withdrawn_at?:string}

/** Retained evidence is counted only while it still binds this exact obligation.
 * A failed recheck of that same transaction withdraws its accounting credit. */
export function confirmedContributionPayment(task: ContributionTaskState, row: ContributionReservation, now: number): ContributionPaymentObservation | null {
  const checks = row.payment_checks, read = checks?.confirmed, a = row.payout?.authorization;
  if (!read || !checks || checks.confirmation_withdrawn_at || !a || !row.payout?.signature || row.status !== 'accepted' || task.terms.payment_method !== 'signed_authorization') return null;
  const b = read.binding;
  if (!b || read.status !== 'confirmed' || read.task_id !== task.terms.id || read.submission_id !== row.id ||
    read.network !== BASE_EVM.caip2 || b.asset !== BASE_EVM.usdc || !/^0x[0-9a-f]{64}$/i.test(read.transaction) ||
    !/^0x[0-9a-f]{40}$/i.test(b.authorizer) || !/^0x[0-9a-f]{40}$/i.test(b.recipient) || !/^0x[0-9a-f]{64}$/i.test(b.nonce) ||
    b.authorizer.toLowerCase() !== a.from.toLowerCase() || b.recipient.toLowerCase() !== a.to.toLowerCase() ||
    b.recipient.toLowerCase() !== row.payout_to?.toLowerCase() || b.nonce.toLowerCase() !== a.nonce.toLowerCase() ||
    b.amount_atomic !== a.value || b.amount_atomic !== usdcToAtomic(task.terms.reward_usd) || read.reward_usd !== task.terms.reward_usd ||
    !Number.isSafeInteger(read.confirmations) || read.confirmations! < FINALITY_BLOCKS || !Number.isSafeInteger(read.required_confirmations) || read.required_confirmations < FINALITY_BLOCKS ||
    !Number.isSafeInteger(b.block_height) || b.block_height < 0 || !Number.isSafeInteger(b.authorization_receipt_offset) || b.authorization_receipt_offset < 0 ||
    b.transfer_receipt_offset !== b.authorization_receipt_offset + 1 || !Number.isFinite(Date.parse(read.read_at)) || Date.parse(read.read_at) > now) return null;
  if (checks.latest.transaction.toLowerCase() === read.transaction.toLowerCase() && checks.latest.status !== 'confirmed') return null;
  return read;
}

/** A consumed nonce can also mean cancellation. Require the exact event/transfer pair. */
export async function reconcileContributionPayment(env: Env, task: ContributionTaskState, submissionId: string, transaction: string, now = Date.now()): Promise<ContributionPaymentObservation> {
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
    if (read.status === 'SETTLED' && exact.observed && read.blockHeight !== null) return {...base,status:'confirmed',reason:'retained_authorization_and_reward_matched',confirmations:read.confirmations,
      binding:{asset:BASE_EVM.usdc, authorizer:exact.observed.authorizer, recipient:exact.observed.recipient, nonce:exact.observed.nonce, amount_atomic:exact.observed.amount_atomic,
        block_height:read.blockHeight, authorization_receipt_offset:exact.observed.authorization_receipt_offset, transfer_receipt_offset:exact.observed.transfer_receipt_offset}};
    if (read.status === 'PENDING_FINALITY') return {...base,status:'pending_finality' as const,reason:'matching_transfer_needs_more_confirmations',confirmations:read.confirmations};
    return unavailable('settlement_not_established');
  } catch {
    // RPC errors can contain provider details. Never echo them into the admin response.
    return unavailable('chain_read_unavailable');
  }
}
