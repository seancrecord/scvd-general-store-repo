import { env,runInDurableObject,SELF,createExecutionContext } from 'cloudflare:test';
import { it,expect } from 'vitest';
import { BudgetStore } from './budget';
import { budgetPolicy } from './fixtures';
import { RECOVERY_ACK } from './recovery';
import { EVIDENCE_LIMITS,evidenceDigest,type RetainedEvidence } from './evidence';
import { evidenceInputs,fixtureApproval,retainApprovalEvidence } from './evidence-fixtures';
import { ScreeningReader,ScreeningRecovery } from './index';

it('refuses recovery when references have no retained evidence bytes',async()=>{
  const stub=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  await runInDurableObject(stub,async(_instance,state)=>{
    const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);
    await store.reserve({id:'first',caller:'keeper',tier:'paid',policyId:budgetPolicy.id});
    await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});
    const before=store.recoveryOverview();
    const result=await store.commitRecovery({caseId:'case_one',operator:'keeper',expectedRevision:before.revision,acknowledgement:RECOVERY_ACK,
      executor:{kind:'executor_terminated',reference:'executor',sha256:'a'.repeat(64),observedAtMs:100000},
      providers:budgetPolicy.providers.map(p=>({kind:'no_active_provider_requests',witnessId:p.id,reference:p.id,sha256:'b'.repeat(64),observedAtMs:100000}))});
    expect(result.status).toBe('unavailable');
    expect(store.recoveryOverview()).toEqual(before);
  });
});

async function withReview(run:(store:BudgetStore,state:DurableObjectState,setTime:(n:number)=>void)=>Promise<void>) {
  const stub=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  await runInDurableObject(stub,async(_instance,state)=>{
    let time=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>time);
    await store.reserve({id:'first',caller:'keeper',tier:'paid',policyId:budgetPolicy.id});
    await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});
    await run(store,state,n=>{time=n;});
  });
}
it('retains exact UTF-8 bytes privately and computes a digest independently checked with WebCrypto',async()=>{
  await withReview(async(store,state)=>{
    const input={...evidenceInputs()[0]!,content:'Redacted fixture\r\nα 😀 <script>untrusted()</script>\n'};
    const before=store.recoveryOverview();const result=await store.retainRecoveryEvidence(input);
    expect(result.status).toBe('retained');if(result.status!=='retained')throw Error('missing evidence');
    const bytes=new TextEncoder().encode(input.content);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    expect(result.evidence.sha256).toBe(digest);expect(result.evidence.byteLength).toBe(bytes.length);
    expect(Reflect.has(result.evidence,'content')).toBe(false);
    expect(store.recoveryOverview().revision).toBe(before.revision+1);expect(store.snapshot()).toEqual(before.counts);
    const rebuilt=new BudgetStore(state.storage,budgetPolicy,()=>100001);
    expect(rebuilt.recoveryEvidence('case_one',input.reference).evidence.content).toBe(input.content);
    expect(rebuilt.recoveryEvidence('case_one',input.reference).contentTrust).toBe('untrusted_operator_submission');
    for(const view of [rebuilt.recoveryOverview(),rebuilt.recoveryHistory(),rebuilt.inspectRecovery('case_one'),rebuilt.recoveryEvidenceList('case_one')])
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(input.content).slice(1,-1));
    expect(rebuilt.recoveryEvidenceList('case_one').retained).toBe(1);
  });
});
it('identical concurrent retention retries are inert and closed evidence cannot be rewritten',async()=>{
  await withReview(async(store,state)=>{
    const input=evidenceInputs()[0]!;const before=store.recoveryOverview();
    const [first,second]=await Promise.all([store.retainRecoveryEvidence(input),store.retainRecoveryEvidence(input)]);
    expect(first.status).toBe('retained');expect(second).toEqual(first);
    expect(store.recoveryOverview().revision).toBe(before.revision+1);
    expect((await store.retainRecoveryEvidence({...input,content:'changed'})).status).toBe('unavailable');
    expect((await store.retainRecoveryEvidence({...input,operator:'another_keeper'})).status).toBe('unavailable');
    await retainApprovalEvidence(store);const approved=fixtureApproval(store.inspectRecovery('case_one').revision);
    const receipt=await store.commitRecovery(approved);expect(receipt.status).toBe('recovered');
    if(receipt.status!=='recovered')throw Error('missing receipt');
    expect(receipt.record.final?.evidenceRetention).toBe('private_bytes_checked_at_decision_v1');
    const rebuilt=new BudgetStore(state.storage,budgetPolicy,()=>200000),closed=rebuilt.recoveryOverview();
    expect(await rebuilt.retainRecoveryEvidence(input)).toEqual(first);
    expect((await rebuilt.retainRecoveryEvidence({...input,reference:'new_after_close'})).status).toBe('unavailable');
    expect(rebuilt.recoveryOverview()).toEqual(closed);
  });
});
for(const mode of ['unknown_case','unknown_witness','wrong_kind','executor_witness','provider_null','empty','whitespace','oversized','multibyte_oversized','lossy_unicode','future','before_review','non_integer_time','bad_reference','extra_field']) {
  it(`refuses evidence submission ${mode} without changing storage`,async()=>{
    await withReview(async(store)=>{
      const input={...evidenceInputs()[0]!},before=store.recoveryOverview();
      if(mode==='unknown_case')input.caseId='unknown';
      if(mode==='unknown_witness'){input.kind='no_active_provider_requests';input.witnessId='other';}
      if(mode==='wrong_kind')Reflect.set(input,'kind','provider_cancelled');
      if(mode==='executor_witness')input.witnessId=budgetPolicy.providers[0].id;
      if(mode==='provider_null')input.kind='no_active_provider_requests';
      if(mode==='empty')input.content='';
      if(mode==='whitespace')input.content=' \n';
      if(mode==='oversized')input.content='x'.repeat(EVIDENCE_LIMITS.maxBytes+1);
      if(mode==='multibyte_oversized')input.content='é'.repeat(EVIDENCE_LIMITS.maxBytes);
      if(mode==='lossy_unicode')input.content='bad\ud800';
      if(mode==='future')input.observedAtMs++;
      if(mode==='before_review')input.observedAtMs--;
      if(mode==='non_integer_time')input.observedAtMs+=0.5;
      if(mode==='bad_reference')input.reference='https://fixture.invalid/private';
      if(mode==='extra_field')Reflect.set(input,'unexpected','value');
      expect(await store.retainRecoveryEvidence(input)).toEqual({status:'unavailable'});
      expect(store.recoveryOverview()).toEqual(before);expect(store.recoveryEvidenceList('case_one').retained).toBe(0);
    });
  });
}
it('accepts the byte bound exactly and refuses a full evidence set without deleting prior documents',async()=>{
  await withReview(async(store)=>{
    const input={...evidenceInputs()[0]!,content:'x'.repeat(EVIDENCE_LIMITS.maxBytes)};
    for(let i=0;i<EVIDENCE_LIMITS.maxDocumentsPerCase;i++)
      expect((await store.retainRecoveryEvidence({...input,reference:'reference_'+i})).status).toBe('retained');
    const before=store.recoveryOverview();
    expect((await store.retainRecoveryEvidence({...input,reference:'one_too_many'})).status).toBe('unavailable');
    expect(store.recoveryOverview()).toEqual(before);expect(store.recoveryEvidenceList('case_one').retained).toBe(EVIDENCE_LIMITS.maxDocumentsPerCase);
    expect(store.recoveryEvidence('case_one','reference_0').evidence.content).toBe(input.content);
    expect((await store.retainRecoveryEvidence({...input,reference:'reference_0'})).status).toBe('retained');
  });
});
for(const mode of ['edited_bytes','edited_and_rehashed','deleted','wrong_scope','wrong_role','wrong_time']) {
  it(`refuses recovery after retained evidence is ${mode}`,async()=>{
    await withReview(async(store,state)=>{
      await retainApprovalEvidence(store);const input=fixtureApproval(store.inspectRecovery('case_one').revision),before=store.recoveryOverview();
      const row=state.storage.sql.exec<{body:string}>('SELECT body FROM screening_evidence WHERE reference=?',input.executor.reference).one();
      const value:RetainedEvidence=JSON.parse(row.body);
      if(mode==='edited_bytes'||mode==='edited_and_rehashed')value.content='Altered fixture material';
      if(mode==='edited_and_rehashed'){value.sha256=evidenceDigest(value.content);value.byteLength=new TextEncoder().encode(value.content).byteLength;}
      if(mode==='wrong_scope')value.scopeSha256='0'.repeat(64);
      if(mode==='wrong_role'){value.kind='no_active_provider_requests';value.witnessId=budgetPolicy.providers[0].id;}
      if(mode==='wrong_time'){value.observedAtMs++;value.retainedAtMs++;}
      state.storage.sql.exec('UPDATE screening_evidence SET body=? WHERE reference=?',JSON.stringify(value),input.executor.reference);
      if(mode==='deleted')state.storage.sql.exec('DELETE FROM screening_evidence WHERE reference=?',input.executor.reference);
      expect((await store.commitRecovery(input)).status).toBe('unavailable');expect(store.recoveryOverview()).toEqual(before);
      if(['edited_bytes','wrong_scope','deleted'].includes(mode))expect(()=>store.recoveryEvidence('case_one',input.executor.reference)).toThrow();
    });
  });
}
it('a copied evidence row cannot authorize another case even with identical request IDs',async()=>{
  await withReview(async(store,state)=>{
    await retainApprovalEvidence(store);
    const revision=store.inspectRecovery('case_one').revision;
    await store.cancelRecovery({caseId:'case_one',operator:'keeper',expectedRevision:revision});
    await store.beginRecovery({caseId:'case_two',operator:'keeper',requestIds:['first']});
    state.storage.sql.exec("INSERT INTO screening_evidence (case_id,reference,body) SELECT 'case_two',reference,body FROM screening_evidence WHERE case_id='case_one'");
    const before=store.recoveryOverview();
    expect((await store.commitRecovery(fixtureApproval(before.revision,'case_two'))).status).toBe('unavailable');
    expect(store.recoveryOverview()).toEqual(before);
  });
});
it('uploading new evidence invalidates a previously read approval revision',async()=>{
  await withReview(async(store)=>{
    const earlier=fixtureApproval(store.inspectRecovery('case_one').revision);
    await retainApprovalEvidence(store);const before=store.recoveryOverview();
    expect((await store.commitRecovery(earlier)).status).toBe('unavailable');expect(store.recoveryOverview()).toEqual(before);
    expect((await store.commitRecovery({...earlier,expectedRevision:before.revision})).status).toBe('recovered');
  });
});
it('an evidence insert failure rolls back its revision and can be retried safely',async()=>{
  await withReview(async(store,state)=>{
    const input=evidenceInputs()[0]!,before=store.recoveryOverview();
    state.storage.sql.exec("CREATE TRIGGER fail_evidence BEFORE INSERT ON screening_evidence BEGIN SELECT RAISE(ABORT,'fixture_private_error'); END");
    expect(await store.retainRecoveryEvidence(input)).toEqual({status:'unavailable'});
    expect(store.recoveryOverview()).toEqual(before);expect(store.recoveryEvidenceList('case_one').retained).toBe(0);
    state.storage.sql.exec('DROP TRIGGER fail_evidence');
    expect((await store.retainRecoveryEvidence(input)).status).toBe('retained');
  });
});
it('cancelled cases retain documents and accept only exact upload retries',async()=>{
  await withReview(async(store)=>{
    const input=evidenceInputs()[0]!,retained=await store.retainRecoveryEvidence(input);
    await store.cancelRecovery({caseId:'case_one',operator:'keeper',expectedRevision:store.inspectRecovery('case_one').revision});
    expect(await store.retainRecoveryEvidence(input)).toEqual(retained);
    expect((await store.retainRecoveryEvidence({...input,reference:'later'})).status).toBe('unavailable');
    expect(store.recoveryEvidence('case_one',input.reference).evidence.content).toBe(input.content);
  });
});
it('evidence has a separate private service surface and every public path remains closed',async()=>{
  const reader=new ScreeningReader(createExecutionContext(),env),recovery=new ScreeningRecovery(createExecutionContext(),env);
  for(const method of ['retainEvidence','evidence','evidenceList']) {
    expect(Reflect.get(reader,method)).toBeUndefined();expect(typeof Reflect.get(recovery,method)).toBe('function');
    expect((await SELF.fetch('https://fixture.invalid/'+method,{method:'POST',body:'{}'})).status).toBe(404);
  }
  expect(await recovery.evidence('absent','missing')).toEqual({status:'unavailable'});
  expect(await recovery.retainEvidence(evidenceInputs('absent')[0]!)).toEqual({status:'unavailable'});
});
it('refresh uses a new document reference and old documents remain available',async()=>{
  await withReview(async(store,_state,setTime)=>{
    await retainApprovalEvidence(store);setTime(100001);
    const input={...evidenceInputs()[0]!,reference:'executor_refresh',content:'Synthetic refreshed termination evidence.',observedAtMs:100001};
    expect((await store.retainRecoveryEvidence(input)).status).toBe('retained');
    const approval=fixtureApproval(store.inspectRecovery('case_one').revision);
    approval.executor={kind:'executor_terminated',reference:input.reference,sha256:evidenceDigest(input.content),observedAtMs:input.observedAtMs};
    expect((await store.commitRecovery(approval)).status).toBe('recovered');
    expect(store.recoveryEvidenceList('case_one').retained).toBe(evidenceInputs().length+1);
    expect(store.recoveryEvidence('case_one',evidenceInputs()[0]!.reference).evidence.content).toBe(evidenceInputs()[0]!.content);
  });
});
it('replaying a legacy decision does not manufacture retained evidence or an integrity claim',async()=>{
  await withReview(async(store,state)=>{
    await retainApprovalEvidence(store);const approval=fixtureApproval(store.inspectRecovery('case_one').revision);
    const result=await store.commitRecovery(approval);expect(result.status).toBe('recovered');
    const row=state.storage.sql.exec<{body:string}>('SELECT body FROM screening_recovery WHERE case_id=?','case_one').one();
    const old=JSON.parse(row.body);delete old.final.evidenceRetention;
    state.storage.sql.exec('UPDATE screening_recovery SET body=? WHERE case_id=?',JSON.stringify(old),'case_one');
    state.storage.sql.exec('DELETE FROM screening_evidence WHERE case_id=?','case_one');
    const before=store.recoveryOverview(),retried=await store.commitRecovery(approval);
    expect(retried.status).toBe('recovered');if(retried.status!=='recovered')throw Error('missing historical receipt');
    expect(retried.record.final?.evidenceRetention).toBeUndefined();expect(store.recoveryEvidenceList('case_one').retained).toBe(0);
    expect(store.recoveryOverview()).toEqual(before);
  });
});
