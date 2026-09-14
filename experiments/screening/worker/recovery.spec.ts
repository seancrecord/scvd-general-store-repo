import { env,runInDurableObject,SELF,createExecutionContext } from 'cloudflare:test';
import { it,expect,beforeEach,afterEach,vi } from 'vitest';
import { BudgetStore } from './budget';
import { RECOVERY_LIMITS,type RecoveryCase } from './recovery';
import { fixtureApproval as approval,retainApprovalEvidence } from './evidence-fixtures';
import { budgetPolicy,providers,readerPolicy } from './fixtures';
import { createBaseReader } from './rpc-reader';
import { ScreeningReader,ScreeningRecovery } from './index';
import { BASE_NETWORK } from '../../../src/lib/payment-networks';

beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(100000);});
afterEach(()=>{vi.restoreAllMocks();});
const request=(id:string,tier:'free'|'paid'='free')=>({id,caller:'caller_'+id,tier,policyId:budgetPolicy.id});
const review=(requestIds=['first'],caseId='case_one')=>({caseId,operator:'keeper',requestIds});
async function withStore(run:(store:BudgetStore,state:DurableObjectState,setTime:(n:number)=>void)=>Promise<void>) {
  const stub=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  await runInDurableObject(stub,async(_instance,state)=>{
    let time=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>time);
    await run(store,state,n=>{time=n;});
  });
}

it('overview shows ages without exposing release tokens or treating age as completion',async()=>{
  await withStore(async(store,_state,setTime)=>{
    const lease=await store.reserve(request('first'));expect(lease).not.toBeNull();setTime(200000);
    const view=store.recoveryOverview();expect(view.active[0]?.ageMs).toBe(100000);
    expect(view.assurance).toBe('age_is_not_evidence_of_termination');expect(view.counts.active).toBe(1);
    expect(JSON.stringify(view)).not.toContain(lease!.token);
  });
});
it('opening a review durably holds admissions for both tiers; repeated identical opening is inert',async()=>{
  await withStore(async(store,state)=>{
    await store.reserve(request('first'));const opened=await store.beginRecovery(review());expect(opened.status).toBe('review');
    const second=new BudgetStore(state.storage,budgetPolicy,()=>100000);
    const before=second.recoveryOverview();expect(before.admissionsHeld).toBe(true);
    expect(await second.reserve(request('free'))).toBeNull();expect(await second.reserve(request('paid','paid'))).toBeNull();
    expect(await second.beginRecovery(review())).toEqual(opened);expect(second.recoveryOverview()).toEqual(before);
    expect((await second.beginRecovery(review(['first'],'another_case'))).status).toBe('unavailable');
    expect((await second.beginRecovery({...review(),operator:'someone_else'})).status).toBe('unavailable');
  });
});
it('recovery frees only reviewed slots and never refunds spent credits or request counts',async()=>{
  await withStore(async(store)=>{
    const first=await store.reserve(request('first'));await store.reserve(request('second'));
    const before=store.snapshot();await store.beginRecovery(review());await retainApprovalEvidence(store);const expected=approval(store.inspectRecovery('case_one').revision);
    const result=await store.commitRecovery(expected);expect(result.status).toBe('recovered');
    const after=store.snapshot();expect(after.active).toBe(1);expect(after.requests).toBe(before.requests);
    expect(after.used).toEqual(before.used);expect(after.freeUsed).toEqual(before.freeUsed);
    expect(store.recoveryOverview().active.map(v=>v.id)).toEqual(['second']);
    expect(store.recoveryOverview().admissionsHeld).toBe(false);
    expect(JSON.stringify(result)).not.toContain(first!.token);
    if(result.status!=='recovered')throw Error('missing_receipt');
    expect(result.record.final?.creditsRefunded).toBe(false);
    expect(result.record.final?.assurance).toBe('operator_attestation_not_machine_verified');
    await store.release(first!.token);expect(store.snapshot()).toEqual(after);
    expect(await store.reserve(request('replacement'))).not.toBeNull();
  });
});
it('a lost recovery response can be retried exactly, but cannot be rewritten',async()=>{
  await withStore(async(store,state)=>{
    await store.reserve(request('first'));await store.beginRecovery(review());await retainApprovalEvidence(store);
    const input=approval(store.inspectRecovery('case_one').revision);
    const [result,concurrent]=await Promise.all([store.commitRecovery(input),store.commitRecovery(input)]);
    expect(concurrent).toEqual(result);
    expect(result.status).toBe('recovered');
    const rebuilt=new BudgetStore(state.storage,budgetPolicy,()=>100001);
    await rebuilt.reserve(request('next'));const before=rebuilt.snapshot();
    expect(await rebuilt.commitRecovery(input)).toEqual(result);expect(rebuilt.snapshot()).toEqual(before);
    expect((await rebuilt.commitRecovery({...input,operator:'changed'})).status).toBe('unavailable');
    expect((await rebuilt.beginRecovery(review())).status).toBe('unavailable');
    expect(rebuilt.recoveryHistory().retained).toBe(1);
  });
});
for(const mode of ['missing_provider','wrong_provider','duplicate_provider','missing_ack','future_evidence','stale_evidence','before_review','bad_hash','credential_reference','extra_field','stale_revision','wrong_case']) {
  it(`refuses ${mode} and leaves the recovery hold and credits unchanged`,async()=>{
    await withStore(async(store,_state,setTime)=>{
      await store.reserve(request('first'));await store.beginRecovery(review());await retainApprovalEvidence(store);
      const original=store.recoveryOverview(),input=approval(original.revision);
      if(mode==='missing_provider')input.providers.pop();
      if(mode==='wrong_provider')input.providers[1]!.witnessId='unknown';
      if(mode==='duplicate_provider')input.providers[1]!.witnessId=input.providers[0]!.witnessId;
      if(mode==='missing_ack')Reflect.set(input,'acknowledgement','');
      if(mode==='future_evidence')input.executor.observedAtMs++;
      if(mode==='stale_evidence')setTime(100000+RECOVERY_LIMITS.evidenceMaxAgeMs+1);
      if(mode==='before_review')input.providers[0]!.observedAtMs--;
      if(mode==='bad_hash')input.executor.sha256='not-a-digest';
      if(mode==='credential_reference')input.executor.reference='https://provider.invalid/private-key';
      if(mode==='extra_field')Reflect.set(input.executor,'secret','private-key');
      if(mode==='stale_revision')input.expectedRevision--;
      if(mode==='wrong_case')input.caseId='other';
      expect((await store.commitRecovery(input)).status).toBe('unavailable');
      expect(store.snapshot()).toEqual(original.counts);expect(store.recoveryOverview().admissionsHeld).toBe(true);
      expect(store.inspectRecovery('case_one').record.status).toBe('open');
      expect(JSON.stringify(store.recoveryHistory())).not.toContain('private-key');
    });
  });
}
it('normal completion races invalidate the review revision and cannot release another reservation',async()=>{
  await withStore(async(store,_state,setTime)=>{
    const lease=await store.reserve(request('first'));await store.reserve(request('second'));await store.beginRecovery(review());await retainApprovalEvidence(store);
    const old=approval(store.inspectRecovery('case_one').revision);await store.release(lease!.token);
    expect((await store.commitRecovery(old)).status).toBe('unavailable');
    const current=store.inspectRecovery('case_one');expect(current.stillActive).toEqual([]);
    expect((await store.commitRecovery(approval(current.revision))).status).toBe('unavailable');
    expect(store.snapshot().active).toBe(1);
    expect((await store.cancelRecovery({caseId:'case_one',expectedRevision:current.revision,operator:'keeper'})).status).toBe('cancelled');
    setTime(200000);const replacement=await store.reserve(request('first'));expect(replacement).not.toBeNull();
    expect(replacement!.token).not.toBe(lease!.token);expect((await store.commitRecovery(old)).status).toBe('unavailable');
    expect(store.snapshot().active).toBe(2);
  });
});
it('cancelling a hold is recorded and idempotent without releasing its reservations',async()=>{
  await withStore(async(store)=>{
    await store.reserve(request('first'));await store.beginRecovery(review());await retainApprovalEvidence(store);const before=store.snapshot();
    const input={caseId:'case_one',operator:'keeper',expectedRevision:store.inspectRecovery('case_one').revision};
    const result=await store.cancelRecovery(input);expect(result.status).toBe('cancelled');
    expect(await store.cancelRecovery(input)).toEqual(result);expect(store.snapshot()).toEqual(before);
    expect(store.recoveryOverview().admissionsHeld).toBe(false);
    expect((await store.cancelRecovery({...input,operator:'other'})).status).toBe('unavailable');
    expect((await store.commitRecovery(approval(input.expectedRevision))).status).toBe('unavailable');
  });
});
it('failed audit writes roll back opening and recovery atomically',async()=>{
  await withStore(async(store,state)=>{
    await store.reserve(request('first'));const initial=store.recoveryOverview();
    state.storage.sql.exec("CREATE TRIGGER fail_case_insert BEFORE INSERT ON screening_recovery BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
    expect((await store.beginRecovery(review())).status).toBe('unavailable');expect(store.recoveryOverview()).toEqual(initial);
    expect(store.recoveryHistory().retained).toBe(0);state.storage.sql.exec('DROP TRIGGER fail_case_insert');
    await store.beginRecovery(review());await retainApprovalEvidence(store);const held=store.recoveryOverview(),input=approval(held.revision);
    state.storage.sql.exec("CREATE TRIGGER fail_case_update BEFORE UPDATE ON screening_recovery BEGIN SELECT RAISE(ABORT,'fixture_failure'); END");
    expect((await store.commitRecovery(input)).status).toBe('unavailable');expect(store.recoveryOverview()).toEqual(held);
    expect(store.inspectRecovery('case_one').record.status).toBe('open');state.storage.sql.exec('DROP TRIGGER fail_case_update');
    expect((await store.commitRecovery(input)).status).toBe('recovered');
  });
});
it('legacy reservation age stays unknown and review binds its existing token',async()=>{
  await withStore(async(store,state)=>{
    const lease=await store.reserve(request('first'));
    const row=state.storage.sql.exec<{body:string}>('SELECT body FROM screening_budget WHERE id=1').one();
    const value=JSON.parse(row.body);delete value.revision;delete value.leases[0].reservedAtMs;
    state.storage.sql.exec('UPDATE screening_budget SET body=? WHERE id=1',JSON.stringify(value));
    expect(store.recoveryOverview().active[0]?.ageMs).toBeNull();
    const opened=await store.beginRecovery(review());expect(opened.status).toBe('review');
    expect(store.inspectRecovery('case_one').record.targets[0]?.reservedAtMs).toBeNull();
    expect(JSON.stringify(store.recoveryHistory())).not.toContain(lease!.token);
    await retainApprovalEvidence(store);
    expect((await store.commitRecovery(approval(store.inspectRecovery('case_one').revision))).status).toBe('recovered');
  });
});
it('bounded paginated history keeps its denominator and refuses new cases at the retention cap',async()=>{
  await withStore(async(store,state)=>{
    await store.reserve(request('first'));
    const prior:RecoveryCase={caseId:'prior',operator:'keeper',openedAtMs:1,status:'cancelled',targets:[],policyId:budgetPolicy.id,witnessIds:budgetPolicy.providers.map(v=>v.id)};
    for(let i=0;i<RECOVERY_LIMITS.maxCases;i++)
      state.storage.sql.exec('INSERT INTO screening_recovery (case_id,body) VALUES (?,?)','prior_'+i,JSON.stringify({...prior,caseId:'prior_'+i}));
    const first=store.recoveryHistory(),second=store.recoveryHistory(first.nextSequence);
    expect(first.retained).toBe(RECOVERY_LIMITS.maxCases);expect(first.returned).toBe(RECOVERY_LIMITS.pageSize);
    expect(second.cases[0]!.sequence).toBeGreaterThan(first.nextSequence);
    expect((await store.beginRecovery(review())).status).toBe('unavailable');expect(store.recoveryOverview().admissionsHeld).toBe(false);
    expect(()=>store.recoveryHistory(-1)).toThrow();
  });
});
it('future and backwards clocks cannot authorize recovery',async()=>{
  await withStore(async(store,_state,setTime)=>{
    await store.reserve(request('first'));await store.beginRecovery(review());await retainApprovalEvidence(store);const input=approval(store.inspectRecovery('case_one').revision);
    setTime(99999);expect((await store.commitRecovery(input)).status).toBe('unavailable');
    setTime(100000);expect((await store.commitRecovery(input)).status).toBe('recovered');
  });
});
it('held admissions cause zero RPC work through the real adapter',async()=>{
  const stub=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  await stub.reserve(request('first'));await stub.beginRecovery(review());
  let calls=0;const cleanup:Promise<unknown>[]=[];
  const read=createBaseReader({providers,policy:readerPolicy,budget:stub,now:()=>100000,waitUntil:p=>{cleanup.push(p);},
    fetchImpl:async()=>{calls++;throw Error('no_network_allowed');}});
  const result=await read({network:BASE_NETWORK,address:'0x'+'1'.repeat(40)},{id:'new',caller:'new',tier:'paid'});
  await Promise.all(cleanup);expect(result.status).toBe('unavailable');expect(calls).toBe(0);
});
it('operator methods are separate from the reader and have no public HTTP route',async()=>{
  const reader=new ScreeningReader(createExecutionContext(),env),recovery=new ScreeningRecovery(createExecutionContext(),env);
  expect(Reflect.get(reader,'commit')).toBeUndefined();expect(typeof recovery.commit).toBe('function');
  expect('token' in await recovery.overview()).toBe(false);
  for(const path of ['/recovery','/recovery/begin','/recovery/commit','/recovery/cancel'])
    expect((await SELF.fetch('https://fixture.invalid'+path,{method:'POST',body:'{}'})).status).toBe(404);
});
