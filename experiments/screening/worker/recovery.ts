import { label } from './rpc-reader';

// Qualification bounds, not production timing or account guarantees.
export const RECOVERY_LIMITS = Object.freeze({maxCases:512,pageSize:50,evidenceMaxAgeMs:300000});
export const RECOVERY_ACK = 'I reviewed current evidence that both providers have no active work for these reservations and their executor cannot resume.';
export interface ReviewRequest { caseId:string; operator:string; requestIds:string[] }
export interface EvidenceReference { reference:string; sha256:string; observedAtMs:number }
export interface RecoveryApproval {
  caseId:string; expectedRevision:number; operator:string; acknowledgement:typeof RECOVERY_ACK;
  executor:EvidenceReference & {kind:'executor_terminated'};
  providers:(EvidenceReference & {witnessId:string;kind:'no_active_provider_requests'})[];
}
export interface RecoveryCancellation { caseId:string; expectedRevision:number; operator:string }
export interface RecoveryCase {
  caseId:string; operator:string; openedAtMs:number; status:'open'|'recovered'|'cancelled';
  policyId:string; witnessIds:string[];
  targets:{id:string;token:string;tier:'free'|'paid';reservedAtMs:number|null}[];
  final?:{atMs:number;operator:string;revision:number;slotsReleased:number;creditsRefunded:false;
    assurance:'operator_attestation_not_machine_verified';evidenceRetention?:'private_bytes_checked_at_decision_v1';approval:RecoveryApproval|null};
}
export function recoveryRequire(value:unknown):asserts value {if(!value)throw Error('screening_recovery_unavailable');}
function keys(value:object,expected:string[]) {
  recoveryRequire(value && typeof value==='object' && Object.keys(value).length===expected.length && expected.every(k=>Object.hasOwn(value,k)));
}
export function normalizeReview(input:ReviewRequest,maxTargets:number):ReviewRequest {
  keys(input,['caseId','operator','requestIds']);recoveryRequire(label(input.caseId)&&label(input.operator));
  recoveryRequire(Array.isArray(input.requestIds)&&input.requestIds.length>0&&input.requestIds.length<=maxTargets&&input.requestIds.every(label));
  recoveryRequire(new Set(input.requestIds).size===input.requestIds.length);
  return {caseId:input.caseId,operator:input.operator,requestIds:[...input.requestIds].sort()};
}
export function normalizeApproval(input:RecoveryApproval,witnesses:string[]):RecoveryApproval {
  keys(input,['caseId','expectedRevision','operator','acknowledgement','executor','providers']);
  recoveryRequire(label(input.caseId)&&label(input.operator)&&Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0);
  recoveryRequire(input.acknowledgement===RECOVERY_ACK);
  function ref(v:EvidenceReference):EvidenceReference {
    recoveryRequire(label(v.reference)&&typeof v.sha256==='string'&&/^[0-9a-f]{64}$/.test(v.sha256));
    recoveryRequire(Number.isSafeInteger(v.observedAtMs)&&v.observedAtMs>=0);
    return {reference:v.reference,sha256:v.sha256,observedAtMs:v.observedAtMs};
  }
  keys(input.executor,['kind','reference','sha256','observedAtMs']);recoveryRequire(input.executor.kind==='executor_terminated');
  recoveryRequire(Array.isArray(input.providers)&&input.providers.length===witnesses.length);
  recoveryRequire(new Set(input.providers.map(v=>v.witnessId)).size===witnesses.length);
  const providers=witnesses.map(id=>{
    const v=input.providers.find(v=>v.witnessId===id);recoveryRequire(v);
    keys(v,['witnessId','kind','reference','sha256','observedAtMs']);recoveryRequire(v.kind==='no_active_provider_requests');
    return {witnessId:id,kind:'no_active_provider_requests' as const,...ref(v)};
  });
  return {caseId:input.caseId,expectedRevision:input.expectedRevision,operator:input.operator,acknowledgement:RECOVERY_ACK,
    executor:{kind:'executor_terminated',...ref(input.executor)},providers};
}
export function normalizeCancellation(input:RecoveryCancellation):RecoveryCancellation {
  keys(input,['caseId','expectedRevision','operator']);
  recoveryRequire(label(input.caseId)&&label(input.operator)&&Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0);
  return {caseId:input.caseId,expectedRevision:input.expectedRevision,operator:input.operator};
}
export function publicCase(value:RecoveryCase) {
  return {...value,targets:value.targets.map(({id,tier,reservedAtMs})=>({id,tier,reservedAtMs}))};
}
