import { env, runInDurableObject } from 'cloudflare:test';
import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { BudgetStore, type BudgetPolicy } from './budget';
import { budgetPolicy } from './fixtures';

declare module 'cloudflare:test' { interface ProvidedEnv extends ScreeningQualificationEnv {} }
const stub = () => env.SCREENING_BUDGET.getByName(crypto.randomUUID());
const request = (id: string, tier: 'free'|'paid'='free') => ({id,caller:id,tier,policyId:budgetPolicy.id});
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(100000);});
afterEach(()=>{vi.restoreAllMocks();});

describe('durable screening admission',()=>{
  it('RPC admission uses the injected clock as well as direct storage tests',async()=>{
    const s=stub();expect(await s.reserve(request('clock'))).not.toBeNull();
    await runInDurableObject(s,async(_instance,state)=>{
      const row=state.storage.sql.exec<{body:string}>('SELECT body FROM screening_budget WHERE id=1').one();
      expect(JSON.parse(row.body).lastTime).toBe(100000);
    });
  });
  it('serializes simultaneous callers while preserving paid slots and credits',async()=>{
    const s=stub();
    const results=await Promise.all(Array.from({length:12},(_,i)=>s.reserve(request('f'+i))));
    expect(results.filter(Boolean)).toHaveLength(3);
    const paid=await s.reserve(request('paid','paid'));expect(paid).not.toBeNull();
    expect(await s.reserve(request('overflow','paid'))).toBeNull();
    for(const lease of [...results,paid])if(lease)await s.release(lease.token);
    expect((await s.snapshot()).active).toBe(0);
    expect(await s.reserve(request('free_again'))).toBeNull();
    const last=await s.reserve(request('last_paid','paid'));expect(last).not.toBeNull();
    if(last)await s.release(last.token);
    expect(await s.reserve(request('out_of_credits','paid'))).toBeNull();
  });
  it('reconstructed instances retain spending, active leases and duplicate refusal',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      const first=new BudgetStore(state.storage,budgetPolicy,()=>100000);
      const lease=await first.reserve(request('once'));expect(lease).not.toBeNull();
      const second=new BudgetStore(state.storage,budgetPolicy,()=>100000);
      expect(second.snapshot()).toEqual(first.snapshot());expect(second.snapshot().active).toBe(1);
      expect(await second.reserve(request('once'))).toBeNull();
      await second.release(lease!.token);await second.release(lease!.token);
      expect(new BudgetStore(state.storage,budgetPolicy,()=>100000).snapshot().active).toBe(0);
      expect(second.snapshot().used).toEqual(budgetPolicy.providers.map(v=>v.units));
      expect(await second.reserve(request('once'))).toBeNull();
    });
  });
  it('rollover never clears orphaned leases; explicit completion recovers capacity',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      let now=100000;const store=new BudgetStore(state.storage,budgetPolicy,()=>now);
      const leases=await Promise.all([0,1,2].map(i=>store.reserve(request('f'+i))));
      now=200000;expect(await store.reserve(request('next_free'))).toBeNull();
      const paid=await store.reserve(request('next_paid','paid'));expect(paid).not.toBeNull();
      expect(store.snapshot().active).toBe(4);
      for(const lease of [...leases,paid])if(lease)await store.release(lease.token);
      expect(store.snapshot().active).toBe(0);expect(await store.reserve(request('recovered'))).not.toBeNull();
      now=199999;expect(await store.reserve(request('backwards'))).toBeNull();
    });
  });
  it('invalid identity, policy mismatch and changed configuration cannot reset budgets',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);
      expect(await store.reserve({...request('bad'),caller:'https://secret.invalid/token'})).toBeNull();
      expect(await store.reserve({...request('bad'),policyId:'other'})).toBeNull();
      const lease=await store.reserve(request('first'));expect(lease).not.toBeNull();
      const changed=new BudgetStore(state.storage,{...budgetPolicy,maxRequests:11},()=>100000);
      expect(await changed.reserve(request('cannot_reset'))).toBeNull();
      expect(store.snapshot().requests).toBe(1);
    });
  });
  it('storage failures roll back the reservation rather than grant unrecorded credit',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);
      expect(await store.reserve(request('first'))).not.toBeNull();const before=store.snapshot();
      state.storage.sql.exec("CREATE TRIGGER refuse_budget_write BEFORE UPDATE ON screening_budget BEGIN SELECT RAISE(ABORT,'fixture_write_failure'); END");
      expect(await store.reserve(request('failed'))).toBeNull();expect(store.snapshot()).toEqual(before);
      state.storage.sql.exec('DROP TRIGGER refuse_budget_write');
      expect(await store.reserve(request('failed'))).not.toBeNull();
    });
  });
  it('failed second allowance and exhausted free caller entries preserve the paid side',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      const p: BudgetPolicy=structuredClone(budgetPolicy);p.maxCallersPerTier=1;p.maxPerCaller=1;
      const store=new BudgetStore(state.storage,p,()=>100000);
      const free=await store.reserve(request('f'));expect(free).not.toBeNull();await store.release(free!.token);
      expect(await store.reserve(request('g'))).toBeNull();expect(await store.reserve(request('f'))).toBeNull();
      expect(await store.reserve(request('p','paid'))).not.toBeNull();expect(store.snapshot().callerEntries).toBe(2);
    });
    await runInDurableObject(stub(),async(_instance,state)=>{
      const p=structuredClone(budgetPolicy);p.providers[1].totalUnits=p.providers[1].paidReserveUnits+1;
      const store=new BudgetStore(state.storage,p,()=>100000);
      expect(await store.reserve(request('cannot_partially_reserve'))).toBeNull();expect(store.snapshot().used).toEqual([0,0]);
    });
  });
  it('retains malformed persisted data as unavailable instead of silently starting fresh',async()=>{
    await runInDurableObject(stub(),async(_instance,state)=>{
      const store=new BudgetStore(state.storage,budgetPolicy,()=>100000);
      state.storage.sql.exec("INSERT INTO screening_budget (id,body) VALUES (1,'not-json')");
      expect(await store.reserve(request('bad_state'))).toBeNull();
    });
  });
});
