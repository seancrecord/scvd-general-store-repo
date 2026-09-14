import type { BudgetStore } from './budget';
import { evidenceDigest,type EvidenceSubmission } from './evidence';
import { RECOVERY_ACK,type RecoveryApproval } from './recovery';
import { budgetPolicy } from './fixtures';

export function evidenceInputs(caseId='case_one',observedAtMs=100000):EvidenceSubmission[] {
  return [{caseId,operator:'keeper',reference:'executor_evidence',kind:'executor_terminated',witnessId:null,observedAtMs,
    content:'Synthetic fixture: executor cannot resume.'},...budgetPolicy.providers.map(v=>({
      caseId,operator:'keeper',reference:'provider_'+v.id,kind:'no_active_provider_requests' as const,witnessId:v.id,observedAtMs,
      content:'Synthetic fixture: provider '+v.id+' has no active target work.'}))];
}
export function fixtureApproval(revision:number,caseId='case_one',at=100000):RecoveryApproval {
  const entries=evidenceInputs(caseId,at);
  const executor=entries[0]!;
  return {caseId,expectedRevision:revision,operator:'keeper',acknowledgement:RECOVERY_ACK,
    executor:{kind:'executor_terminated',reference:executor.reference,sha256:evidenceDigest(executor.content),observedAtMs:at},
    providers:entries.slice(1).map(v=>({kind:'no_active_provider_requests',witnessId:v.witnessId!,reference:v.reference,sha256:evidenceDigest(v.content),observedAtMs:at}))};
}
export async function retainApprovalEvidence(store:BudgetStore,caseId='case_one',at=100000) {
  for(const input of evidenceInputs(caseId,at)) {
    const result=await store.retainRecoveryEvidence(input);
    if(result.status!=='retained')throw Error('fixture_evidence_not_retained');
  }
}
