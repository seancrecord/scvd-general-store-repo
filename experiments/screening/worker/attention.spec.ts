import { env,runInDurableObject } from 'cloudflare:test';
import { it,expect,vi,afterEach } from 'vitest';
import { BudgetStore } from './budget';
import { budgetPolicy } from './fixtures';
import { ATTENTION_LIMITS } from './attention';
import { RECOVERY_LIMITS } from './recovery';
const request=(id:string,tier:'free'|'paid'='paid')=>({id,caller:id,tier,policyId:budgetPolicy.id});
const stub=()=>env.SCREENING_BUDGET.getByName(crypto.randomUUID());
afterEach(()=>vi.restoreAllMocks());
it('attention reads are inert and never expose lease tokens or caller identity',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);const lease=await store.reserve(request('first'));const before=store.snapshot();
  const reading=store.attention();expect(reading).toMatchObject({status:'ok',signals:[],counts:{active:1,aging:0},capacity:{paid:true,free:true}});
  expect(JSON.stringify(reading)).not.toContain(lease!.token);expect(JSON.stringify(reading)).not.toContain('first');
  expect(store.snapshot()).toEqual(before);expect(store.recoveryOverview().revision).toBe(1);
 });
});
it('aging leases survive rollover and an aged hold never releases them',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);await store.reserve(request('first'));
  await store.beginRecovery({caseId:'case_one',operator:'keeper',requestIds:['first']});const before=store.snapshot();
  now+=Math.max(ATTENTION_LIMITS.reservationAgeMs,ATTENTION_LIMITS.holdAgeMs);
  expect(store.attention()).toMatchObject({signals:['admissions_held','hold_aging','reservations_aging'],counts:{aging:1},hold:{caseId:'case_one'},capacity:{paid:true,free:true,projectedRollover:true}});
  expect(store.snapshot()).toEqual(before);expect(store.recoveryOverview().admissionsHeld).toBe(true);
 });
});
it('free exhaustion is distinct from paid exhaustion and projected rollover does not write accounting',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);
  for(let i=0;i<3;i++){const l=await store.reserve(request('f'+i,'free'));await store.release(l!.token);}
  expect(store.attention()).toMatchObject({signals:['free_capacity_exhausted'],capacity:{paid:true,free:false}});
  for(let i=0;i<2;i++){const l=await store.reserve(request('p'+i));await store.release(l!.token);}
  expect(store.attention()).toMatchObject({signals:['paid_capacity_exhausted','free_capacity_exhausted'],capacity:{paid:false,free:false}});
  const before=store.snapshot();now+=budgetPolicy.windowMs;
  expect(store.attention()).toMatchObject({signals:[],capacity:{paid:true,free:true,projectedRollover:true}});expect(store.snapshot()).toEqual(before);
 });
});
it('full concurrency persists across accounting windows',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);
  for(let i=0;i<budgetPolicy.maxConcurrent;i++)expect(await store.reserve(request('p'+i))).not.toBeNull();
  now+=budgetPolicy.windowMs;expect(store.attention()).toMatchObject({capacity:{paid:false,free:false},counts:{active:budgetPolicy.maxConcurrent}});
 });
});
it('missing reservation time is unknown and invalid time or broken hold is unavailable',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);await store.reserve(request('first'));
  const value=JSON.parse(state.storage.sql.exec<{body:string}>('SELECT body FROM screening_budget').one().body);
  delete value.leases[0].reservedAtMs;
  const write=()=>state.storage.sql.exec('UPDATE screening_budget SET body=?',JSON.stringify(value));write();
  expect(store.attention()).toMatchObject({signals:['reservation_time_unknown'],counts:{unknownAge:1}});
  value.leases[0].reservedAtMs=100001;write();expect(store.attention()).toEqual({status:'unavailable'});
  delete value.leases[0].reservedAtMs;value.recoveryHold='missing';write();expect(store.attention()).toEqual({status:'unavailable'});
 });
});
it('backwards clock and corrupt state are unavailable rather than a quiet reading',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);await store.reserve(request('first'));
  now--;expect(store.attention()).toEqual({status:'unavailable'});
  state.storage.sql.exec("UPDATE screening_budget SET body='broken'");expect(store.attention()).toEqual({status:'unavailable'});
 });
});
it('recovery register warning uses the shared cap and reads no evidence bytes',async()=>{
 await runInDurableObject(stub(),async(_i,state)=>{
  const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);
  const warning=Math.ceil(RECOVERY_LIMITS.maxCases*ATTENTION_LIMITS.retentionWarningPercent/100);
  for(let i=0;i<warning;i++)state.storage.sql.exec('INSERT INTO screening_recovery(case_id,body) VALUES (?,?)','case_'+i,'{}');
  expect(store.attention()).toMatchObject({signals:['recovery_storage_near_limit'],counts:{retainedCases:warning,maxCases:RECOVERY_LIMITS.maxCases}});
  for(let i=warning;i<RECOVERY_LIMITS.maxCases;i++)state.storage.sql.exec('INSERT INTO screening_recovery(case_id,body) VALUES (?,?)','case_'+i,'{}');
  expect(store.attention()).toMatchObject({signals:['recovery_storage_full']});
 });
});
