import {confirmedContributionPayment} from '@/services/contribution-reconciliation';
import {usdcToAtomic, atomicToUsdc} from '@/lib/payments';
import {listKeys} from '@/lib/kv-list';
import {bulkGetJson} from '@/lib/kv-bulk';
import {KV_KEYS} from '@/lib/kv-keys';
import {CONTRIBUTION_INDEX_PREFIX} from '@/store/contribution-tasks';
import {publicContribution, type ContributionTaskState} from '@/services/contribution-task';
import type {BountyRecord} from '@/services/bounty-board';
import type {StudyRecord} from '@/services/field-study';
import type {Env} from '@/types';

export const REWARD_COMMITMENT_SCAN_CAP = 100;
function atomic(value: number): number {
  const result = Number(usdcToAtomic(value));
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(result)) throw new Error('Invalid reward amount');
  return result;
}
function seconds(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid authorization expiry');
  return Number(value);
}
/** Face-value exposure in retained records, NOT a settlement or solvency check. */
export function summarizeRewardCommitments(contributions: readonly ContributionTaskState[], bounties: readonly BountyRecord[], studies: readonly StudyRecord[], now: number) {
  let accepted = 0, issued = 0, reported = 0, pending = 0, available = 0, expired = 0, confirmed = 0;
  const counted = new Set<string>();
  const confirmationDates: string[] = [];
  for (const task of contributions) {
    const reward = atomic(task.terms.reward_usd);
    available += reward * publicContribution(task, now).available_slots;
    for (const row of task.reservations) {
      if (row.status === 'accepted' || row.status === 'payment_reported') {
        accepted += reward;
        const observation = confirmedContributionPayment(task, row, now);
        if (observation?.binding) {
          const identity = `${observation.binding.authorizer.toLowerCase()}:${observation.binding.nonce.toLowerCase()}`;
          // One on-chain authorization cannot discharge two separately indexed obligations.
          if (!counted.has(identity)) {counted.add(identity); confirmed += reward; confirmationDates.push(observation.read_at);}
        }
        if (row.payment) reported += reward;
        if (row.payout?.signature) {
          issued += reward;
          if (seconds(row.payout.authorization.validBefore) * 1000 <= now) expired++;
        }
      } else if (row.status === 'submitted' || row.status === 'reserved' && Date.parse(row.submit_by) > now) pending += reward;
    }
  }
  const bounty = bounties.reduce((sum, row) => row.status === 'paid' && row.claim && seconds(row.claim.authorization_valid_before) * 1000 > now ? sum + atomic(row.reward_usd) : sum, 0);
  const study = studies.reduce((sum, row) => row.debrief && seconds(row.debrief.authorization_valid_before) * 1000 > now ? sum + atomic(row.debrief.reward_usd) : sum, 0);
  if (![accepted, confirmed, issued, reported, pending, available, bounty, study, accepted+bounty+study].every(Number.isSafeInteger)) throw new Error('Reward total exceeds accounting range');
  return {
    contributions: {accepted_total_usd: atomicToUsdc(String(accepted)), confirmed_redemption_observed_usd: atomicToUsdc(String(confirmed)), accepted_unreconciled_usd: atomicToUsdc(String(accepted-confirmed)), confirmation_observed_from: confirmationDates.sort()[0] ?? null, confirmation_observed_through: confirmationDates.at(-1) ?? null, issued_authorization_subset_usd: atomicToUsdc(String(issued)), manual_report_subset_usd: atomicToUsdc(String(reported)), expired_authorizations: expired, conditional_reserved_or_submitted_usd: atomicToUsdc(String(pending)), available_slot_maximum_usd: atomicToUsdc(String(available))},
    shopping_authorization_face_value_usd: atomicToUsdc(String(bounty)),
    study_authorization_face_value_usd: atomicToUsdc(String(study)),
    reward_exposure_usd: atomicToUsdc(String(accepted+bounty+study)),
    spendable_usd: null,
  };
}

export async function readRewardCommitments(env: Env, now = Date.now()) {
  const gaps: string[] = [];
  const coverage: Record<string, {records_read:number; truncated:boolean}> = {};
  async function records<T>(name: string, prefix: string): Promise<T[]> {
    try {
      const keys = await listKeys(env.COUNTERS, {prefix, cap:REWARD_COMMITMENT_SCAN_CAP});
      const values = await bulkGetJson<T>(env.COUNTERS, keys.names);
      coverage[name] = {records_read: keys.names.length, truncated:keys.truncated};
      if (keys.truncated) gaps.push(`${name}_truncated`);
      if (keys.names.some(key => !values.get(key))) gaps.push(`${name}_record_unavailable`);
      return [...values.values()].filter((value): value is T => value !== null);
    } catch {gaps.push(`${name}_unavailable`);return [];}
  }
  async function tasks(): Promise<ContributionTaskState[]> {
    try {
      if (!env.CONTRIBUTION_TASKS) throw new Error('Storage unavailable');
      const keys = await listKeys(env.COUNTERS, {prefix:CONTRIBUTION_INDEX_PREFIX, cap:REWARD_COMMITMENT_SCAN_CAP});
      coverage.contributions = {records_read:keys.names.length,truncated:keys.truncated};
      if (keys.truncated) gaps.push('contributions_truncated');
      const rows: ContributionTaskState[] = [];
      // Bounded actor concurrency; this inventory reads no reports into the response.
      for (let n=0;n<keys.names.length;n+=5) {
        const batch = await Promise.all(keys.names.slice(n,n+5).map(key => env.CONTRIBUTION_TASKS!.getByName(key.slice(CONTRIBUTION_INDEX_PREFIX.length)).adminView()));
        for (const row of batch) {if(row) rows.push(row);else gaps.push('contribution_record_unavailable');}
      }
      return rows;
    } catch {gaps.push('contributions_unavailable');return [];}
  }
  const [contributions,bounties,studies] = await Promise.all([tasks(), records<BountyRecord>('shopping',KV_KEYS.bountyPrefix),records<StudyRecord>('studies',KV_KEYS.studyPrefix)]);
  let summary: ReturnType<typeof summarizeRewardCommitments> | null = null;
  try {summary = summarizeRewardCommitments(contributions,bounties,studies,now);} catch {gaps.push('reward_record_invalid');}
  return {
    read_at:new Date(now).toISOString(), scan_complete:gaps.length===0, coverage, gaps:[...new Set(gaps)],
    observed:summary, reward_exposure_usd:gaps.length===0 ? summary?.reward_exposure_usd ?? null : null,
    spendable_usd:null,
    limits:'This is a bounded, non-atomic inventory of indexed reward records. Recent KV writes may not yet appear. Contributions count accepted work once; issued authorizations and manual payment reports are overlapping subsets. Contribution confirmations are retained dated observations, validated against the current obligation; one authorization is counted once. A failed recheck of the same transaction withdraws its accounting credit. Gross reward exposure still includes observed redemptions. This inventory does not refresh chain reads; shopping, study and manual reported transactions remain unreconciled. Expired contribution authorizations remain unresolved accepted work. Store-credit cash-outs, live purchases by store instruments, other wallet transfers and wallet-key changes are outside this inventory. No spendable balance, full wallet cover, reservation of funds or permission to raise caps is established.',
  };
}
