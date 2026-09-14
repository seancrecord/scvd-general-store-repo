import { DurableObject } from 'cloudflare:workers';
import { BackupSource } from '../backup/source';
import { ATTENTION_LIMITS,type AttentionReading,type AttentionCode } from './attention';
import { EVIDENCE_LIMITS,normalizeEvidence,evidenceDigest,evidenceScope,evidenceSummary,checkedEvidence,
  type EvidenceSubmission,type RetainedEvidence } from './evidence';
import { label, type Admission, type Lease } from './rpc-reader';
import { RECOVERY_LIMITS,normalizeReview,normalizeApproval,normalizeCancellation,publicCase,
  type RecoveryCase,type ReviewRequest,type RecoveryApproval,type RecoveryCancellation } from './recovery';

export interface BudgetPolicy {
  id: string; windowMs: number; maxRequests: number; maxFreeRequests: number;
  maxPerCaller: number; maxCallersPerTier: number; maxConcurrent: number; reservedPaidConcurrent: number;
  providers: [{ id: string; units: number; totalUnits: number; paidReserveUnits: number }, { id: string; units: number; totalUnits: number; paidReserveUnits: number }];
}
interface Reservation { id: string; token: string; tier: 'free' | 'paid'; window: number; active: boolean; reservedAtMs?:number }
interface State {
  version: 1; policy: string; window: number; lastTime: number; requests: number; free: number;
  used: number[]; freeUsed: number[]; callers: { free: Record<string, number>; paid: Record<string, number> }; leases: Reservation[];
  revision?:number; recoveryHold?:string|null;
}
function require(value: unknown): asserts value { if (!value) throw Error('screening_budget_unavailable'); }
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
function validate(p: BudgetPolicy) {
  require(label(p.id));
  require([p.windowMs,p.maxRequests,p.maxFreeRequests,p.maxPerCaller,p.maxCallersPerTier,p.maxConcurrent,p.reservedPaidConcurrent].every(positive));
  require(p.maxFreeRequests < p.maxRequests && p.reservedPaidConcurrent < p.maxConcurrent);
  require(p.maxRequests <= 10000 && p.maxCallersPerTier <= 10000 && p.maxConcurrent <= 1000);
  require(p.providers.length === 2 && p.providers[0].id !== p.providers[1].id);
  for (const v of p.providers) require(label(v.id) && [v.units,v.totalUnits,v.paidReserveUnits].every(positive) && v.units <= v.paidReserveUnits && v.paidReserveUnits < v.totalUnits);
}

/** One durable coordination atom per independently budgeted provider pair. */
export class BudgetStore {
  private policy: BudgetPolicy;
  private serializedPolicy: string;
  constructor(private storage: DurableObjectStorage, policy: BudgetPolicy, private now: () => number) {
    this.policy = structuredClone(policy); validate(this.policy); this.serializedPolicy = JSON.stringify(this.policy);
    storage.sql.exec('CREATE TABLE IF NOT EXISTS screening_budget (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS screening_recovery (sequence INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS screening_evidence (case_id TEXT NOT NULL, reference TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(case_id,reference))');
  }
  private load(): State {
    const row = this.storage.sql.exec<{body: string}>('SELECT body FROM screening_budget WHERE id=1').toArray()[0];
    if (!row) return {version:1,policy:this.serializedPolicy,window:-1,lastTime:-1,requests:0,free:0,used:[0,0],freeUsed:[0,0],callers:{free:{},paid:{}},leases:[]};
    const state: State = JSON.parse(row.body);
    require(state.version === 1 && state.policy === this.serializedPolicy);
    return state;
  }
  private save(state: State): void {
    const revision=state.revision??0;require(Number.isSafeInteger(revision)&&revision>=0&&revision<Number.MAX_SAFE_INTEGER);
    state.revision=revision+1;
    this.storage.sql.exec('INSERT INTO screening_budget (id,body) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', JSON.stringify(state));
  }
  async reserve(request: Admission): Promise<Lease | null> {
    try {
      const p = this.policy;
      require(label(request.id) && label(request.caller) && ['free','paid'].includes(request.tier) && request.policyId === p.id);
      const lease = this.storage.transactionSync(() => {
        const s = this.load(), time = this.now();
        require(!s.recoveryHold);
        require(Number.isSafeInteger(time) && time >= 0 && time >= s.lastTime); s.lastTime = time;
        const window = Math.floor(time / p.windowMs);
        if (window !== s.window) {
          s.window = window;s.requests = 0;s.free = 0;s.used = [0,0];s.freeUsed = [0,0];s.callers = {free:{},paid:{}};
          s.leases = s.leases.filter(l => l.active);
        }
        const free = request.tier === 'free', callerKey = 'c_' + request.caller, callers = s.callers[request.tier];
        require(!s.leases.some(l => l.id === request.id));
        require(s.requests < p.maxRequests && s.leases.filter(l => l.active).length < p.maxConcurrent);
        require(!free || (s.free < p.maxFreeRequests && s.leases.filter(l => l.active && l.tier === 'free').length < p.maxConcurrent-p.reservedPaidConcurrent));
        require((callers[callerKey] ?? 0) < p.maxPerCaller && (Object.hasOwn(callers,callerKey) || Object.keys(callers).length < p.maxCallersPerTier));
        require(p.providers.every((v,i) => s.used[i]! + v.units <= v.totalUnits));
        require(!free || p.providers.every((v,i) => s.freeUsed[i]! + v.units <= v.totalUnits-v.paidReserveUnits));
        const token = crypto.randomUUID();
        s.requests++;if(free)s.free++;callers[callerKey] = (callers[callerKey] ?? 0)+1;
        p.providers.forEach((v,i) => {s.used[i]! += v.units;if(free)s.freeUsed[i]! += v.units;});
        s.leases.push({id:request.id,token,tier:request.tier,window,active:true,reservedAtMs:time});
        this.save(s);
        return {token,allowances:p.providers.map(v=>({id:v.id,units:v.units}))};
      });
      // An in-process caller must also wait for persistence before external I/O.
      await this.storage.sync();return lease;
    } catch {return null;}
  }
  async release(token: string): Promise<void> {
    require(typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token));
    this.storage.transactionSync(() => {
      const s = this.load(), lease = s.leases.find(l=>l.token===token);
      if(!lease || !lease.active)return;
      lease.active=false;s.leases=s.leases.filter(l=>l.active || l.window===s.window);this.save(s);
    });
    await this.storage.sync();
  }
  snapshot() {
    const s = this.load();
    return {requests:s.requests,freeRequests:s.free,active:s.leases.filter(l=>l.active).length,
      freeActive:s.leases.filter(l=>l.active && l.tier==='free').length,used:s.used,freeUsed:s.freeUsed,
      callerEntries:Object.keys(s.callers.free).length+Object.keys(s.callers.paid).length};
  }

  private recoveryCase(caseId:string):RecoveryCase {
    require(label(caseId));
    const row=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_recovery WHERE case_id=?',caseId).toArray()[0];
    require(row);return JSON.parse(row.body) as RecoveryCase;
  }
  private recoveryTime(s:State):number {
    const time=this.now();require(Number.isSafeInteger(time)&&time>=0&&time>=s.lastTime);return time;
  }
  attention(): AttentionReading | {status:'unavailable'} {
    try {return this.storage.transactionSync(()=>{
      const s=this.load(),p=this.policy,time=this.recoveryTime(s),window=Math.floor(time/p.windowMs);
      const count=(n:number)=>Number.isSafeInteger(n)&&n>=0;
      require(Number.isSafeInteger(s.window)&&s.window>=-1&&s.window<=window);
      require(count(s.requests)&&count(s.free)&&s.free<=s.requests);
      require(s.used.length===2&&s.freeUsed.length===2&&s.used.every(count)&&s.freeUsed.every(count));
      require(Array.isArray(s.leases)&&s.leases.every(l=>typeof l.active==='boolean'&&['free','paid'].includes(l.tier)));
      const active=s.leases.filter(l=>l.active);
      let aging=0,unknownAge=0;
      for(const lease of active) {
        if(lease.reservedAtMs===undefined){unknownAge++;continue;}
        require(count(lease.reservedAtMs)&&lease.reservedAtMs<=time);
        if(time-lease.reservedAtMs>=ATTENTION_LIMITS.reservationAgeMs)aging++;
      }
      const signals:AttentionCode[]=[];let hold:AttentionReading['hold']=null;
      if(s.recoveryHold) {
        const r=this.recoveryCase(s.recoveryHold);
        require(r.caseId===s.recoveryHold&&r.status==='open'&&r.policyId===p.id&&count(r.openedAtMs)&&r.openedAtMs<=time);
        hold={caseId:r.caseId,ageMs:time-r.openedAtMs};signals.push('admissions_held');
        if(hold.ageMs>=ATTENTION_LIMITS.holdAgeMs)signals.push('hold_aging');
      }
      if(aging)signals.push('reservations_aging');if(unknownAge)signals.push('reservation_time_unknown');
      // Reserve resets window counters before checking capacity. Project that same
      // reset without writing it; active leases never reset with the window.
      const rollover=s.window!==window,used=rollover?[0,0]:s.used,freeUsed=rollover?[0,0]:s.freeUsed;
      const paid=(rollover?0:s.requests)<p.maxRequests&&active.length<p.maxConcurrent&&p.providers.every((v,i)=>used[i]!+v.units<=v.totalUnits);
      const free=paid&&(rollover?0:s.free)<p.maxFreeRequests&&active.filter(l=>l.tier==='free').length<p.maxConcurrent-p.reservedPaidConcurrent&&p.providers.every((v,i)=>freeUsed[i]!+v.units<=v.totalUnits-v.paidReserveUnits);
      if(!paid)signals.push('paid_capacity_exhausted');if(!free)signals.push('free_capacity_exhausted');
      const retainedCases=this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM screening_recovery').one().n;
      require(count(retainedCases));
      if(retainedCases>=RECOVERY_LIMITS.maxCases)signals.push('recovery_storage_full');
      else if(retainedCases>=Math.ceil(RECOVERY_LIMITS.maxCases*ATTENTION_LIMITS.retentionWarningPercent/100))signals.push('recovery_storage_near_limit');
      return {status:'ok' as const,observedAtMs:time,policyId:p.id,signals,counts:{active:active.length,aging,unknownAge,retainedCases,maxCases:RECOVERY_LIMITS.maxCases},hold,
        capacity:{paid,free,accountingWindow:window,projectedRollover:rollover},limits:ATTENTION_LIMITS,assurance:'operational_reading_not_termination_evidence' as const};
    });}catch{return {status:'unavailable'};}
  }
  recoveryOverview() {
    const s=this.load(),time=this.recoveryTime(s);
    return {revision:s.revision??0,admissionsHeld:!!s.recoveryHold,caseId:s.recoveryHold??null,observedAtMs:time,
      active:s.leases.filter(l=>l.active).map(l=>({id:l.id,tier:l.tier,reservedAtMs:l.reservedAtMs??null,
        ageMs:l.reservedAtMs===undefined?null:time-l.reservedAtMs})),
      accountingWindow:s.window,windowMs:this.policy.windowMs,
      counts:this.snapshot(),assurance:'age_is_not_evidence_of_termination' as const};
  }
  recoveryHistory(afterSequence=0) {
    require(Number.isSafeInteger(afterSequence)&&afterSequence>=0);
    const rows=this.storage.sql.exec<{sequence:number;body:string}>('SELECT sequence,body FROM screening_recovery WHERE sequence>? ORDER BY sequence LIMIT ?',afterSequence,RECOVERY_LIMITS.pageSize).toArray();
    const total=this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM screening_recovery').one().n;
    return {retained:total,returned:rows.length,cases:rows.map(r=>({sequence:r.sequence,...publicCase(JSON.parse(r.body) as RecoveryCase)})),nextSequence:rows.at(-1)?.sequence??afterSequence};
  }
  inspectRecovery(caseId:string) {
    const s=this.load(),record=this.recoveryCase(caseId);
    return {revision:s.revision??0,admissionsHeld:s.recoveryHold===caseId,record:publicCase(record),
      stillActive:record.targets.filter(t=>s.leases.some(l=>l.token===t.token&&l.active)).map(t=>t.id)};
  }
  async beginRecovery(input:ReviewRequest) {
    try {
      const request=normalizeReview(input,this.policy.maxConcurrent);
      this.storage.transactionSync(()=>{
        const s=this.load(),time=this.recoveryTime(s);
        const existing=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_recovery WHERE case_id=?',request.caseId).toArray()[0];
        if(existing) {
          const prior=JSON.parse(existing.body) as RecoveryCase;
          require(prior.status==='open'&&s.recoveryHold===prior.caseId&&prior.operator===request.operator);
          require(JSON.stringify(prior.targets.map(t=>t.id))===JSON.stringify(request.requestIds));return;
        }
        require(!s.recoveryHold);
        require(this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM screening_recovery').one().n<RECOVERY_LIMITS.maxCases);
        const targets=request.requestIds.map(id=>{
          const lease=s.leases.find(l=>l.id===id&&l.active);require(lease);
          return {id:lease.id,token:lease.token,tier:lease.tier,reservedAtMs:lease.reservedAtMs??null};
        });
        const record:RecoveryCase={caseId:request.caseId,operator:request.operator,openedAtMs:time,status:'open',targets,
          policyId:this.policy.id,witnessIds:this.policy.providers.map(v=>v.id)};
        s.recoveryHold=request.caseId;s.lastTime=time;this.save(s);
        this.storage.sql.exec('INSERT INTO screening_recovery (case_id,body) VALUES (?,?)',record.caseId,JSON.stringify(record));
      });
      await this.storage.sync();return {status:'review' as const,...this.inspectRecovery(request.caseId)};
    } catch {return {status:'unavailable' as const};}
  }
  private retainedEvidence(record:RecoveryCase,reference:string):RetainedEvidence {
    require(label(reference));
    const row=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_evidence WHERE case_id=? AND reference=?',record.caseId,reference).toArray()[0];
    require(row);const value=checkedEvidence(JSON.parse(row.body) as RetainedEvidence,record);
    require(value.reference===reference);return value;
  }
  recoveryEvidence(caseId:string,reference:string) {
    this.load();return {status:'retained' as const,evidence:this.retainedEvidence(this.recoveryCase(caseId),reference),contentTrust:'untrusted_operator_submission' as const};
  }
  recoveryEvidenceList(caseId:string) {
    this.load();const record=this.recoveryCase(caseId);
    const rows=this.storage.sql.exec<{reference:string}>('SELECT reference FROM screening_evidence WHERE case_id=? ORDER BY reference LIMIT ?',caseId,EVIDENCE_LIMITS.maxDocumentsPerCase+1).toArray();
    require(rows.length<=EVIDENCE_LIMITS.maxDocumentsPerCase);
    return {retained:rows.length,documents:rows.map(row=>evidenceSummary(this.retainedEvidence(record,row.reference))),contentTrust:'untrusted_operator_submission' as const};
  }
  async retainRecoveryEvidence(input:EvidenceSubmission) {
    try {
      const request=normalizeEvidence(input);
      this.storage.transactionSync(()=>{
        const s=this.load(),record=this.recoveryCase(request.caseId);
        const existing=this.storage.sql.exec<{body:string}>('SELECT body FROM screening_evidence WHERE case_id=? AND reference=?',request.caseId,request.reference).toArray()[0];
        if(existing) {
          const prior=this.retainedEvidence(record,request.reference);
          require(Object.entries(request).every(([key,value])=>Reflect.get(prior,key)===value));return;
        }
        require(record.status==='open'&&s.recoveryHold===record.caseId);
        const time=this.recoveryTime(s);
        require(request.observedAtMs>=record.openedAtMs&&request.observedAtMs<=time);
        require(request.witnessId===null||record.witnessIds.includes(request.witnessId));
        const count=this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM screening_evidence WHERE case_id=?',record.caseId).one().n;
        require(count<EVIDENCE_LIMITS.maxDocumentsPerCase);
        const value:RetainedEvidence={...request,version:1,sha256:evidenceDigest(request.content),
          byteLength:new TextEncoder().encode(request.content).byteLength,scopeSha256:evidenceScope(record),retainedAtMs:time};
        s.lastTime=time;this.save(s);
        this.storage.sql.exec('INSERT INTO screening_evidence (case_id,reference,body) VALUES (?,?,?)',record.caseId,request.reference,JSON.stringify(value));
      });
      await this.storage.sync();
      return {status:'retained' as const,evidence:evidenceSummary(this.retainedEvidence(this.recoveryCase(request.caseId),request.reference))};
    } catch {return {status:'unavailable' as const};}
  }
  private requireRetainedApproval(record:RecoveryCase,approval:RecoveryApproval) {
    for(const expected of [approval.executor,...approval.providers]) {
      const retained=this.retainedEvidence(record,expected.reference);
      require(retained.kind===expected.kind&&retained.witnessId===('witnessId' in expected?expected.witnessId:null));
      require(retained.sha256===expected.sha256&&retained.observedAtMs===expected.observedAtMs);
    }
  }
  async commitRecovery(input:RecoveryApproval) {
    try {
      const approval=normalizeApproval(input,this.policy.providers.map(v=>v.id));
      this.storage.transactionSync(()=>{
        const s=this.load(),record=this.recoveryCase(approval.caseId);
        if(record.status==='recovered') {require(JSON.stringify(record.final?.approval)===JSON.stringify(approval));return;}
        require(record.status==='open'&&s.recoveryHold===record.caseId);
        require((s.revision??0)===approval.expectedRevision);
        const time=this.recoveryTime(s);
        for(const evidence of [approval.executor,...approval.providers])
          require(evidence.observedAtMs>=record.openedAtMs&&evidence.observedAtMs<=time&&time-evidence.observedAtMs<=RECOVERY_LIMITS.evidenceMaxAgeMs);
        this.requireRetainedApproval(record,approval);
        // Retained bytes document the operator's decision; this code does not authenticate
        // provider evidence or turn an elapsed timeout into proof of termination.
        for(const target of record.targets) {
          const lease=s.leases.find(l=>l.token===target.token&&l.id===target.id);require(lease?.active);
          lease.active=false;
        }
        s.leases=s.leases.filter(l=>l.active||l.window===s.window);s.recoveryHold=null;s.lastTime=time;this.save(s);
        record.status='recovered';record.final={atMs:time,operator:approval.operator,revision:s.revision!,slotsReleased:record.targets.length,
          creditsRefunded:false,assurance:'operator_attestation_not_machine_verified',evidenceRetention:'private_bytes_checked_at_decision_v1',approval};
        this.storage.sql.exec('UPDATE screening_recovery SET body=? WHERE case_id=?',JSON.stringify(record),record.caseId);
      });
      await this.storage.sync();return {status:'recovered' as const,record:publicCase(this.recoveryCase(approval.caseId))};
    } catch {return {status:'unavailable' as const};}
  }
  async cancelRecovery(input:RecoveryCancellation) {
    try {
      const request=normalizeCancellation(input);
      this.storage.transactionSync(()=>{
        const s=this.load(),record=this.recoveryCase(request.caseId);
        if(record.status==='cancelled') {require(record.final?.operator===request.operator&&record.final.revision===request.expectedRevision+1);return;}
        require(record.status==='open'&&s.recoveryHold===record.caseId&&(s.revision??0)===request.expectedRevision);
        const time=this.recoveryTime(s);s.recoveryHold=null;s.lastTime=time;this.save(s);
        record.status='cancelled';record.final={atMs:time,operator:request.operator,revision:s.revision!,slotsReleased:0,creditsRefunded:false,
          assurance:'operator_attestation_not_machine_verified',approval:null};
        this.storage.sql.exec('UPDATE screening_recovery SET body=? WHERE case_id=?',JSON.stringify(record),record.caseId);
      });
      await this.storage.sync();return {status:'cancelled' as const,record:publicCase(this.recoveryCase(request.caseId))};
    } catch {return {status:'unavailable' as const};}
  }
}

export class ScreeningBudget extends DurableObject<ScreeningQualificationEnv> {
  private store: BudgetStore;
  private backup() {return new BackupSource(this.ctx.storage,JSON.parse(this.env.SCREENING_BUDGET_POLICY),Date.now);}
  constructor(ctx: DurableObjectState, env: ScreeningQualificationEnv) {
    super(ctx,env);
    try {this.store=new BudgetStore(ctx.storage,JSON.parse(env.SCREENING_BUDGET_POLICY),Date.now);}
    catch {throw Error('screening_budget_configuration_unavailable');}
  }
  async captureBackup(id:string,previous:string|null) {return this.backup().capture(id,previous);}
  backupManifest() {return this.backup().manifest();}
  backupPage(digest:string,after=0) {return this.backup().page(digest,after);}
  reserve(request: Admission) {return this.store.reserve(request);}
  release(token: string) {return this.store.release(token);}
  snapshot() {return this.store.snapshot();}
  recoveryOverview() {return this.store.recoveryOverview();}
  attention() {return this.store.attention();}
  recoveryHistory(afterSequence=0) {return this.store.recoveryHistory(afterSequence);}
  inspectRecovery(caseId:string) {return this.store.inspectRecovery(caseId);}
  beginRecovery(request:ReviewRequest) {return this.store.beginRecovery(request);}
  retainRecoveryEvidence(request:EvidenceSubmission) {return this.store.retainRecoveryEvidence(request);}
  recoveryEvidence(caseId:string,reference:string) {return this.store.recoveryEvidence(caseId,reference);}
  recoveryEvidenceList(caseId:string) {return this.store.recoveryEvidenceList(caseId);}
  commitRecovery(request:RecoveryApproval) {return this.store.commitRecovery(request);}
  cancelRecovery(request:RecoveryCancellation) {return this.store.cancelRecovery(request);}
}
