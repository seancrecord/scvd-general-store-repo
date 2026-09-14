import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFixtureBudget,createFixturePairReader} from './pair-policy.mjs';

const word=n=>'0x'+n.repeat(64);
const clock=()=>{let value=100000;return {now:()=>value,set:x=>{value=x;}};};
const budgetPolicy=()=>({windowMs:10000,maxRequests:10,maxFreeRequests:8,maxPerCaller:8,maxCallers:16,
  maxConcurrent:4,reservedPaidConcurrent:1,
  providers:[{id:'a',unitsPerObservation:2,totalUnits:10,reservedPaidUnits:4},{id:'b',unitsPerObservation:3,totalUnits:15,reservedPaidUnits:6}]});
const readerPolicy={chain:'eip155:12345',contract:'0x'+'1'.repeat(40),selector:'0x12345678',maxAgeMs:2000,deadlineMs:100};
const input=()=>({chain:readerPolicy.chain,address:'0x'+'2'.repeat(40),block:{number:10,hash:word('a'),timestampMs:99000}});
const answer=(request,raw=word('0'))=>({chain:request.chain,contract:request.contract,calldata:request.calldata,
  block:{...request.block},safeHeadNumber:11,canonical:true,raw});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup({reads,policy=budgetPolicy(),budget:customBudget}={}) {
  const time=clock(),budget=customBudget??createFixtureBudget({policy,now:time.now}),calls=[];
  let timeout;
  const witnesses=['a','b'].map((id,i)=>({id,operator:'operator_'+id,budgetId:'budget_'+id,
    read:async(request,signal)=>{calls.push({id,request,signal});return reads?.[i]?reads[i](request,signal):answer(request);}}));
  const reader=createFixturePairReader({witnesses,budget,policy:readerPolicy,now:time.now,
    schedule:fn=>{timeout=fn;return 1;},cancel:()=>{timeout=undefined;}});
  return {reader,budget,time,calls,witnesses,expire:()=>timeout(),
    observe:(tier='free',callerId='caller',value=input())=>reader({tier,callerId,input:value})};
}

for(const raw of [word('0'),'0x'+'0'.repeat(63)+'1']) {
  test(`both matching witnesses produce only an unsigned ${raw.endsWith('1')?'listed':'not-listed'} observation`,async()=>{
    const s=setup({reads:[r=>answer(r,raw),r=>answer(r,raw)]});
    const result=await s.observe();await flush();
    assert.equal(result.status,'observed_unsigned');assert.equal(result.production_ready,false);
    assert.equal(result.result,raw.endsWith('1')?'listed':'not_listed');
    assert.equal(s.calls.length,2);assert.equal(s.budget.snapshot().active,0);
    assert.ok(s.calls.every(c=>c.request.selector.requireCanonical && c.request.selector.blockHash===input().block.hash));
    assert.equal(result.witnesses.length,2);
  });
}
test('starts both witnesses concurrently and cannot return on the first answer',async()=>{
  const gate=deferred();const s=setup({reads:[r=>answer(r),async r=>{await gate.promise;return answer(r);}]});
  let completed=false;const pending=s.observe().then(r=>{completed=true;return r;});await flush();
  assert.equal(s.calls.length,2);assert.equal(completed,false);assert.equal(s.budget.snapshot().active,1);
  gate.resolve();assert.equal((await pending).status,'observed_unsigned');
});
for(const defect of ['listed_disagreement','malformed_bool','wrong_chain','wrong_contract','wrong_calldata','wrong_hash','wrong_number','wrong_time','unsafe_head','noncanonical','silence']) {
  test(`second witness ${defect} makes the entire observation unavailable`,async()=>{
    const s=setup({reads:[r=>answer(r),r=>{
      const a=answer(r);
      if(defect==='listed_disagreement')a.raw='0x'+'0'.repeat(63)+'1';
      if(defect==='malformed_bool')a.raw='0x'+'0'.repeat(63)+'2';
      if(defect==='wrong_chain')a.chain='eip155:1';
      if(defect==='wrong_contract')a.contract='0x'+'3'.repeat(40);
      if(defect==='wrong_calldata')a.calldata='0xdeadbeef';
      if(defect==='wrong_hash')a.block.hash=word('b');
      if(defect==='wrong_number')a.block.number++;
      if(defect==='wrong_time')a.block.timestampMs++;
      if(defect==='unsafe_head')a.safeHeadNumber=9;
      if(defect==='noncanonical')a.canonical=false;
      if(defect==='silence')throw Error('private-provider-url');
      return a;
    }]});
    assert.deepEqual(await s.observe(),{status:'unavailable',production_ready:false});
    assert.equal(s.calls.length,2,'no third witness or retry');
  });
}
test('rejects stale, future and unsupported inputs before admission or reads',async()=>{
  const cases=[input(),input(),input(),input()];
  cases[0].block.timestampMs=97000;cases[1].block.timestampMs=100001;
  cases[2].chain='solana:fixture';cases[3].address='not-an-evm-address';
  for(const [i,value] of cases.entries()) {
    const s=setup();assert.equal((await s.observe('free','caller',value)).status,i<2?'unavailable':'unsupported');
    assert.equal(s.calls.length,0);assert.equal(s.budget.snapshot().requests,0);
  }
});
test('shared deadline aborts both adapters and retains slots until actual completion',async()=>{
  const gate=deferred(),s=setup({reads:[async r=>{await gate.promise;return answer(r);},r=>answer(r)]});
  const pending=s.observe();await flush();s.expire();
  assert.equal((await pending).status,'unavailable');assert.ok(s.calls.every(c=>c.signal.aborted));
  assert.equal(s.budget.snapshot().active,1);gate.resolve();await flush();assert.equal(s.budget.snapshot().active,0);
  assert.deepEqual(s.budget.snapshot().providers.map(x=>x.used),[2,3],'timeouts never refund reserved provider work');
});
test('an early failure cannot free the slot of a still-running second adapter',async()=>{
  const gate=deferred(),s=setup({reads:[()=>{throw Error('down');},async r=>{await gate.promise;return answer(r);} ]});
  assert.equal((await s.observe()).status,'unavailable');assert.equal(s.budget.snapshot().active,1);
  gate.resolve();await flush();assert.equal(s.budget.snapshot().active,0);
});
test('clock and block age are rechecked at completion',async()=>{
  for(const time of [99999,100100,101001]) {
    const gate=deferred(),s=setup({reads:[async r=>{await gate.promise;return answer(r);},r=>answer(r)]});
    const pending=s.observe();await flush();s.time.set(time);gate.resolve();
    assert.equal((await pending).status,'unavailable');
  }
  const gate=deferred(),s=setup({reads:[async r=>{await gate.promise;return answer(r);},r=>answer(r)]});
  const value=input();value.block.timestampMs=98001;
  const pending=s.observe('free','caller',value);await flush();s.time.set(100002);gate.resolve();
  assert.equal((await pending).status,'unavailable');
});
test('caller mutation cannot replace the pinned block or witness pair',async()=>{
  const gate=deferred(),s=setup({reads:[async r=>{await gate.promise;return answer(r);},r=>answer(r)]});
  const value=input(),pending=s.observe('free','caller',value);await flush();
  value.block.hash=word('b');s.witnesses[1].read=()=>{throw Error('changed');};gate.resolve();
  const result=await pending;assert.equal(result.status,'observed_unsigned');assert.equal(result.request.block.hash,word('a'));
});
test('free saturation leaves provider credits for paid work; all tiers remain capped',async()=>{
  const s=setup();
  for(let i=0;i<3;i++)assert.equal((await s.observe('free','free_'+i)).status,'observed_unsigned');
  const before=s.calls.length;assert.equal((await s.observe('free','excess')).status,'unavailable');assert.equal(s.calls.length,before);
  for(let i=0;i<2;i++)assert.equal((await s.observe('paid','paid_'+i)).status,'observed_unsigned');
  assert.equal((await s.observe('paid','excess')).status,'unavailable');
  assert.deepEqual(s.budget.snapshot().providers.map(x=>x.used),[10,15]);
});
test('concurrent free flood cannot take the reserved paid slot',async()=>{
  const gate=deferred(),s=setup({reads:[async r=>{await gate.promise;return answer(r);},r=>answer(r)]});
  const free=Array.from({length:3},(_,i)=>s.observe('free','f'+i));await flush();
  assert.equal((await s.observe('free','flood')).status,'unavailable');
  const paid=s.observe('paid','pay');await flush();assert.equal(s.calls.length,8);
  assert.equal((await s.observe('paid','overflow')).status,'unavailable');
  gate.resolve();assert.ok((await Promise.all([...free,paid])).every(x=>x.status==='observed_unsigned'));
});
test('limiter failure or witness budget mismatch causes zero provider reads',async()=>{
  for(const budget of [{reserve(){throw Error('private-budget-error');}},{reserve(){return null;}},{reserve(){return {};}}]) {
    const s=setup({budget});assert.equal((await s.observe()).status,'unavailable');assert.equal(s.calls.length,0);
  }
  const policy=budgetPolicy();policy.providers[1].id='other';const s=setup({policy});
  assert.equal((await s.observe()).status,'unavailable');assert.equal(s.calls.length,0);
});
test('per-caller caps and bounded free caller storage cannot consume paid caller entries',async()=>{
  const policy=budgetPolicy();policy.maxPerCaller=1;policy.maxCallers=1;const s=setup({policy});
  assert.equal((await s.observe('free','first')).status,'observed_unsigned');
  assert.equal((await s.observe('free','first')).status,'unavailable');
  assert.equal((await s.observe('free','new')).status,'unavailable');
  assert.equal((await s.observe('paid','paid')).status,'observed_unsigned');
  assert.equal(s.budget.snapshot().callerEntries,2);
});
test('window rollover resets spending but preserves inflight concurrency; backwards clock refuses',()=>{
  const time=clock(),budget=createFixtureBudget({policy:budgetPolicy(),now:time.now});
  const reserve=(tier,id)=>budget.reserve({tier,callerId:id,witnessIds:['a','b']});
  const leases=[reserve('free','f1'),reserve('free','f2'),reserve('free','f3')];
  time.set(110000);assert.equal(reserve('free','f4'),null);
  const paid=reserve('paid','paid');assert.ok(paid);assert.equal(budget.snapshot().active,4);
  time.set(109999);assert.equal(reserve('paid','backwards'),null);
  for(const lease of [...leases,paid]){lease.release();lease.release();}assert.equal(budget.snapshot().active,0);
});
test('failed second-provider capacity check never partially debits the first provider',()=>{
  const time=clock(),policy=budgetPolicy();policy.providers[1].totalUnits=7;
  const budget=createFixtureBudget({policy,now:time.now});
  assert.equal(budget.reserve({tier:'free',callerId:'f',witnessIds:['a','b']}),null);
  assert.deepEqual(budget.snapshot().providers.map(x=>x.used),[0,0]);
});
test('request-count caps apply even when credit budgets have room',async()=>{
  const policy=budgetPolicy();policy.maxFreeRequests=1;policy.maxRequests=2;
  const s=setup({policy});assert.equal((await s.observe('free','free')).status,'observed_unsigned');
  assert.equal((await s.observe('free','more_free')).status,'unavailable');
  assert.equal((await s.observe('paid','paid')).status,'observed_unsigned');
  assert.equal((await s.observe('paid','more_paid')).status,'unavailable');
  assert.equal(s.calls.length,4);
});
test('configuration requires exactly two distinct operator and account labels',()=>{
  for(const field of ['id','operator','budgetId']) {
    const s=setup();s.witnesses[1][field]=s.witnesses[0][field];
    assert.throws(()=>createFixturePairReader({witnesses:s.witnesses,budget:s.budget,policy:readerPolicy,now:s.time.now}));
  }
  const s=setup();assert.throws(()=>createFixturePairReader({witnesses:[...s.witnesses,s.witnesses[0]],budget:s.budget,policy:readerPolicy,now:s.time.now}));
});
test('disposable guard removals make the original agreement and reserve assertions fail',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'scvd-pair-guards-'));
  try {
    const source=await readFile(new URL('./pair-policy.mjs',import.meta.url),'utf8');
    const agreement="require(answers[0].raw===answers[1].raw);";
    const reserve="require(!free || p.providers.every((v,i)=>freeUsed[i]+v.unitsPerObservation<=v.totalUnits-v.reservedPaidUnits));";
    for(const [name,guard] of [['agreement',agreement],['reserve',reserve]]) {
      assert.ok(source.includes(guard));const path=join(dir,name+'.mjs');await writeFile(path,source.replace(guard,''));
      const modified=await import(pathToFileURL(path).href);
      if(name==='agreement') {
        const s=setup();s.witnesses[1].read=r=>answer(r,'0x'+'0'.repeat(63)+'1');
        const reader=modified.createFixturePairReader({witnesses:s.witnesses,budget:s.budget,policy:readerPolicy,now:s.time.now});
        const result=await reader({tier:'free',callerId:'caller',input:input()});
        assert.throws(()=>assert.equal(result.status,'unavailable'),{code:'ERR_ASSERTION'});
      } else {
        const time=clock(),budget=modified.createFixtureBudget({policy:budgetPolicy(),now:time.now});
        for(let i=0;i<3;i++)budget.reserve({tier:'free',callerId:'f'+i,witnessIds:['a','b']}).release();
        const excess=budget.reserve({tier:'free',callerId:'excess',witnessIds:['a','b']});
        assert.throws(()=>assert.equal(excess,null),{code:'ERR_ASSERTION'});excess.release();
      }
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
