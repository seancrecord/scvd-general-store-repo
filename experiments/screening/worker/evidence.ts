import { createHash } from 'node:crypto';
import { label } from './rpc-reader';
import { recoveryRequire as require,type RecoveryCase } from './recovery';

// Bounded qualification storage. Refresh uses a new reference; old evidence stays.
export const EVIDENCE_LIMITS=Object.freeze({maxBytes:16384,maxDocumentsPerCase:9});
export interface EvidenceSubmission {
  caseId:string;operator:string;reference:string;
  kind:'executor_terminated'|'no_active_provider_requests';witnessId:string|null;
  observedAtMs:number;content:string;
}
export interface RetainedEvidence extends EvidenceSubmission {
  version:1;sha256:string;byteLength:number;scopeSha256:string;retainedAtMs:number;
}
export function evidenceDigest(content:string):string {return createHash('sha256').update(content,'utf8').digest('hex');}
export function evidenceScope(record:RecoveryCase):string {
  // Internal generations bind the material to these reservations, not reused IDs.
  return evidenceDigest(JSON.stringify({caseId:record.caseId,policyId:record.policyId,witnessIds:record.witnessIds,targets:record.targets}));
}
export function normalizeEvidence(input:EvidenceSubmission):EvidenceSubmission {
  const fields=['caseId','operator','reference','kind','witnessId','observedAtMs','content'];
  require(input&&typeof input==='object'&&Object.keys(input).length===fields.length&&fields.every(k=>Object.hasOwn(input,k)));
  require(label(input.caseId)&&label(input.operator)&&label(input.reference));
  require(input.kind==='executor_terminated'?input.witnessId===null:input.kind==='no_active_provider_requests'&&label(input.witnessId));
  require(Number.isSafeInteger(input.observedAtMs)&&input.observedAtMs>=0);
  require(typeof input.content==='string'&&input.content.length>0&&input.content.length<=EVIDENCE_LIMITS.maxBytes);
  const bytes=new TextEncoder().encode(input.content);
  require(bytes.byteLength<=EVIDENCE_LIMITS.maxBytes&&input.content.trim().length>0);
  // Reject lossy UTF-8 encoding; never silently normalize evidence bytes.
  require(new TextDecoder().decode(bytes)===input.content);
  return {caseId:input.caseId,operator:input.operator,reference:input.reference,kind:input.kind,witnessId:input.witnessId,
    observedAtMs:input.observedAtMs,content:input.content};
}
export function evidenceSummary(value:RetainedEvidence) {
  const {content,...summary}=value;void content;return summary;
}
export function checkedEvidence(value:RetainedEvidence,record:RecoveryCase):RetainedEvidence {
  normalizeEvidence({caseId:value.caseId,operator:value.operator,reference:value.reference,kind:value.kind,witnessId:value.witnessId,
    observedAtMs:value.observedAtMs,content:value.content});
  require(value.version===1&&value.caseId===record.caseId&&value.scopeSha256===evidenceScope(record));
  require(value.sha256===evidenceDigest(value.content)&&value.byteLength===new TextEncoder().encode(value.content).byteLength);
  require(Number.isSafeInteger(value.retainedAtMs)&&value.retainedAtMs>=record.openedAtMs&&value.observedAtMs>=record.openedAtMs&&value.observedAtMs<=value.retainedAtMs);
  require(value.witnessId===null||record.witnessIds.includes(value.witnessId));
  return value;
}
