import { createHash } from 'node:crypto';
import { EVIDENCE_LIMITS,checkedEvidence,type RetainedEvidence } from '../worker/evidence';
import { RECOVERY_LIMITS,normalizeApproval,type RecoveryCase } from '../worker/recovery';
import { label } from '../worker/rpc-reader';
import type { BudgetPolicy } from '../worker/budget';

export const BACKUP_FORMAT='scvd-screening-private-backup-v1';
export const BACKUP_LIMITS=Object.freeze({budgetBytes:8*1024*1024,caseBytes:1024*1024,evidenceBytes:EVIDENCE_LIMITS.maxBytes*6+8192,
  maxRows:1+RECOVERY_LIMITS.maxCases*(1+EVIDENCE_LIMITS.maxDocumentsPerCase),pageRows:16,pageBytes:16*1024*1024+65536});
export type BackupRecord = {n:number;kind:'budget'|'case'|'evidence';key:string;subkey:string;sequence:number;body:string;sha256:string}
export interface BackupManifest {format:typeof BACKUP_FORMAT;snapshotId:string;createdAtMs:number;policy:string;counts:{budget:number;cases:number;evidence:number};rows:number;bodyBytes:number;sequence:number;recordsSha256:string}
export function demand(v:unknown):asserts v {if(!v)throw Error('screening_backup_unavailable');}
export const digest=(v:string)=>createHash('sha256').update(v,'utf8').digest('hex');
export const size=(v:string)=>new TextEncoder().encode(v).byteLength;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function exact(v:object,names:string[]) {demand(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k)));}
export function recordDigest(r:Omit<BackupRecord,'sha256'>) {return digest(JSON.stringify([r.n,r.kind,r.key,r.subkey,r.sequence,r.body]));}
export function manifestDigest(m:BackupManifest) {return digest(JSON.stringify([m.format,m.snapshotId,m.createdAtMs,m.policy,m.counts.budget,m.counts.cases,m.counts.evidence,m.rows,m.bodyBytes,m.sequence,m.recordsSha256]));}
export function checkManifest(m:BackupManifest,expected:string) {
 exact(m,['format','snapshotId','createdAtMs','policy','counts','rows','bodyBytes','sequence','recordsSha256']);exact(m.counts,['budget','cases','evidence']);
 demand(m.format===BACKUP_FORMAT&&label(m.snapshotId)&&count(m.createdAtMs)&&count(m.rows)&&m.rows>=1&&m.rows<=BACKUP_LIMITS.maxRows&&count(m.bodyBytes)&&count(m.sequence));
 demand(m.counts.budget===1&&count(m.counts.cases)&&m.counts.cases<=RECOVERY_LIMITS.maxCases&&count(m.counts.evidence)&&m.counts.evidence<=m.counts.cases*EVIDENCE_LIMITS.maxDocumentsPerCase);
 demand(m.rows===1+m.counts.cases+m.counts.evidence&&typeof m.policy==='string'&&size(m.policy)<=BACKUP_LIMITS.budgetBytes);
 demand(/^[a-f0-9]{64}$/.test(expected)&&manifestDigest(m)===expected);
 const p=JSON.parse(m.policy) as BudgetPolicy;
 exact(p,['id','windowMs','maxRequests','maxFreeRequests','maxPerCaller','maxCallersPerTier','maxConcurrent','reservedPaidConcurrent','providers']);
 demand(label(p.id)&&[p.windowMs,p.maxRequests,p.maxFreeRequests,p.maxPerCaller,p.maxCallersPerTier,p.maxConcurrent,p.reservedPaidConcurrent].every(v=>count(v)&&v>0));
 demand(p.maxRequests<=10000&&p.maxCallersPerTier<=10000&&p.maxConcurrent<=1000&&p.maxFreeRequests<p.maxRequests&&p.reservedPaidConcurrent<p.maxConcurrent);
 demand(Array.isArray(p.providers)&&p.providers.length===2&&p.providers[0].id!==p.providers[1].id);
 for(const v of p.providers){exact(v,['id','units','totalUnits','paidReserveUnits']);demand(label(v.id)&&[v.units,v.totalUnits,v.paidReserveUnits].every(n=>count(n)&&n>0)&&v.units<=v.paidReserveUnits&&v.paidReserveUnits<v.totalUnits);}
 return p;
}
export function checkRecord(r:BackupRecord) {
 exact(r,['n','kind','key','subkey','sequence','body','sha256']);
 demand(count(r.n)&&r.n>=1&&r.n<=BACKUP_LIMITS.maxRows&&['budget','case','evidence'].includes(r.kind)&&typeof r.body==='string');
 const limit=r.kind==='budget'?BACKUP_LIMITS.budgetBytes:r.kind==='case'?BACKUP_LIMITS.caseBytes:BACKUP_LIMITS.evidenceBytes;
 demand(size(r.body)<=limit&&new TextDecoder().decode(new TextEncoder().encode(r.body))===r.body);
 demand(r.kind==='budget'?r.key==='state'&&r.subkey===''&&r.sequence===0:label(r.key)&&(r.kind==='case'?r.subkey===''&&count(r.sequence)&&r.sequence>0:label(r.subkey)&&r.sequence===0));
 demand(r.sha256===recordDigest(r));
 return r;
}
type Lease={id:string;token:string;tier:'free'|'paid';window:number;active:boolean;reservedAtMs?:number};
type Budget={version:number;policy:string;window:number;lastTime:number;requests:number;free:number;used:number[];freeUsed:number[];callers:{free:Record<string,number>;paid:Record<string,number>};leases:Lease[];revision?:number;recoveryHold?:string|null};
const token=(v:unknown)=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);

/** Checks exact bytes against an independently retained manifest hash, then links. */
export function verifyBackup(m:BackupManifest,expected:string,records:Iterable<BackupRecord>,lookup:(kind:BackupRecord['kind'],key:string,subkey?:string)=>BackupRecord|undefined) {
 const p=checkManifest(m,expected),root=createHash('sha256');let n=0,bytes=0,cases=0,evidence=0,lastSequence=0,phase=0;
 const seen=new Set<string>(),perCase=new Map<string,number>();let budget:Budget|null=null;
 const readCase=(id:string)=>{const row=lookup('case',id);demand(row);checkRecord(row);const r=JSON.parse(row.body) as RecoveryCase;demand(r.caseId===id);return r;};
 for(const r of records){checkRecord(r);demand(r.n===++n);bytes+=size(r.body);root.update(r.sha256+'\n');
  const identity=JSON.stringify([r.kind,r.key,r.subkey]);demand(!seen.has(identity));seen.add(identity);
  if(r.kind==='budget'){
   demand(n===1);budget=JSON.parse(r.body) as Budget|null;
   if(budget===null){demand(m.counts.cases===0&&m.counts.evidence===0);continue;}
   const s=budget;demand(s.version===1&&s.policy===m.policy&&count(s.lastTime)&&s.lastTime<=m.createdAtMs&&count(s.window)&&s.window<=Math.floor(s.lastTime/p.windowMs));
   demand(count(s.requests)&&s.requests<=p.maxRequests&&count(s.free)&&s.free<=s.requests&&s.free<=p.maxFreeRequests&&count(s.revision??0));
   demand(Array.isArray(s.used)&&Array.isArray(s.freeUsed)&&s.used.length===2&&s.freeUsed.length===2&&p.providers.every((v,i)=>s.used[i]===s.requests*v.units&&s.freeUsed[i]===s.free*v.units&&s.used[i]!<=v.totalUnits&&s.freeUsed[i]!<=v.totalUnits-v.paidReserveUnits));
   demand(Array.isArray(s.leases)&&s.leases.length<=p.maxRequests+p.maxConcurrent);
   const ids=new Set<string>(),tokens=new Set<string>();let current=0,freeCurrent=0;
   for(const l of s.leases){demand(label(l.id)&&token(l.token)&&!ids.has(l.id)&&!tokens.has(l.token)&&['free','paid'].includes(l.tier)&&typeof l.active==='boolean'&&count(l.window)&&l.window<=s.window&&(l.active||l.window===s.window));ids.add(l.id);tokens.add(l.token);
    demand(l.reservedAtMs===undefined||count(l.reservedAtMs)&&l.reservedAtMs<=s.lastTime&&Math.floor(l.reservedAtMs/p.windowMs)===l.window);
    if(l.window===s.window){current++;if(l.tier==='free')freeCurrent++;}
   }
   demand(current===s.requests&&freeCurrent===s.free&&s.leases.filter(l=>l.active).length<=p.maxConcurrent);
   for(const tier of ['free','paid'] as const){const c=s.callers[tier];demand(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length<=p.maxCallersPerTier);let total=0;
    for(const [k,v] of Object.entries(c)){demand(k.startsWith('c_')&&label(k.slice(2))&&count(v)&&v>0&&v<=p.maxPerCaller);total+=v;}
    demand(total===(tier==='free'?s.free:s.requests-s.free));
   }
   demand(s.recoveryHold===undefined||s.recoveryHold===null||label(s.recoveryHold));
  }else if(r.kind==='case'){
   demand(budget&&phase<=1&&r.sequence>lastSequence);phase=1;lastSequence=r.sequence;cases++;
   const c=JSON.parse(r.body) as RecoveryCase;
   demand(c.caseId===r.key&&label(c.operator)&&c.policyId===p.id&&count(c.openedAtMs)&&c.openedAtMs<=m.createdAtMs&&JSON.stringify(c.witnessIds)===JSON.stringify(p.providers.map(v=>v.id)));
   demand(Array.isArray(c.targets)&&c.targets.length>0&&c.targets.length<=p.maxConcurrent&&new Set(c.targets.map(t=>t.id)).size===c.targets.length&&new Set(c.targets.map(t=>t.token)).size===c.targets.length);
   for(const t of c.targets)demand(label(t.id)&&token(t.token)&&['free','paid'].includes(t.tier)&&(t.reservedAtMs===null||count(t.reservedAtMs)&&t.reservedAtMs<=c.openedAtMs));
   if(c.status==='open'){
    demand(!c.final&&budget.recoveryHold===c.caseId);
    // Targets may finish normally during an open review; retained generations must agree.
    for(const t of c.targets){const l=budget.leases.find(v=>v.token===t.token);if(l)demand(l.id===t.id&&l.tier===t.tier&&(l.reservedAtMs??null)===t.reservedAtMs);}
   }else{
    const f=c.final;demand((c.status==='recovered'||c.status==='cancelled')&&f&&count(f.atMs)&&f.atMs>=c.openedAtMs&&f.atMs<=m.createdAtMs&&label(f.operator)&&count(f.revision)&&f.revision<=(budget.revision??0)&&f.creditsRefunded===false&&f.assurance==='operator_attestation_not_machine_verified');
    if(c.status==='cancelled')demand(f.slotsReleased===0&&f.approval===null);
    else {
     demand(f.slotsReleased===c.targets.length&&f.approval&&f.evidenceRetention==='private_bytes_checked_at_decision_v1');const approval=normalizeApproval(f.approval,c.witnessIds);
     demand(approval.caseId===c.caseId&&approval.operator===f.operator&&approval.expectedRevision+1===f.revision);
     for(const ref of [approval.executor,...approval.providers]){const doc=lookup('evidence',c.caseId,ref.reference);demand(doc);checkRecord(doc);const v=checkedEvidence(JSON.parse(doc.body) as RetainedEvidence,c);
      demand(v.sha256===ref.sha256&&v.observedAtMs===ref.observedAtMs&&v.kind===ref.kind&&v.witnessId===('witnessId' in ref?ref.witnessId:null)&&v.retainedAtMs<=f.atMs&&ref.observedAtMs<=f.atMs&&f.atMs-ref.observedAtMs<=RECOVERY_LIMITS.evidenceMaxAgeMs);
     }
     demand(c.targets.every(t=>!budget!.leases.some(l=>l.token===t.token&&l.active)));
    }
   }
  }else{
   demand(budget);phase=2;evidence++;
   const c=readCase(r.key),v=checkedEvidence(JSON.parse(r.body) as RetainedEvidence,c);demand(v.reference===r.subkey&&v.retainedAtMs<=m.createdAtMs);
   const total=(perCase.get(r.key)??0)+1;perCase.set(r.key,total);demand(total<=EVIDENCE_LIMITS.maxDocumentsPerCase);
  }
 }
 if(budget?.recoveryHold)demand(readCase(budget.recoveryHold).status==='open');
 demand(n===m.rows&&bytes===m.bodyBytes&&cases===m.counts.cases&&evidence===m.counts.evidence&&lastSequence<=m.sequence);
 demand(root.digest('hex')===m.recordsSha256);
 return {verified:true as const,manifestSha256:expected,rows:n,cases,evidence,admissionsEnabled:false as const};
}
