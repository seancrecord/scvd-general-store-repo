import { env, SELF, createExecutionContext } from 'cloudflare:test';
import { it,expect,beforeEach,afterEach,vi } from 'vitest';
import { createBaseReader, type Budget } from './rpc-reader';
import { providers,readerPolicy } from './fixtures';
import { BASE_NETWORK } from '../../../src/lib/payment-networks';
import { SANCTIONS_ORACLE_BASE,oracleCalldata } from '../../../src/lib/sanctions-oracle';
import { ScreeningReader } from './index';

const hash=(n:string)=>'0x'+n.repeat(64);
const head=(number=10)=>({number:'0x'+number.toString(16),hash:hash(number===10?'a':'b'),parentHash:hash(number===10?'9':'a'),timestamp:'0x63'});
const input=()=>({network:BASE_NETWORK,address:'0x'+'1'.repeat(40)});
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(100000);});
afterEach(()=>{vi.restoreAllMocks();});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
interface Call {provider:number;method:string;params:unknown[];signal:AbortSignal|null|undefined}
function fixture(mode='good',customBudget?:Budget){
  const calls:Call[]=[],cleanups:Promise<unknown>[]=[];let clock=100000,expire:()=>void=()=>{};
  const gate=deferred();
  const budget=customBudget??env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  const fetchImpl:typeof fetch=async(url,init)=>{
    const n=String(url).includes('alpha.')?0:1;
    const body=JSON.parse(String(init?.body)) as {id:number;method:string;params:unknown[]};
    calls.push({provider:n,method:body.method,params:body.params,signal:init?.signal});
    if(mode==='hang' && n===1)await gate.promise;
    if(mode==='error' && n===1)throw Error('https://secret-provider.invalid/key');
    if(mode==='oversize')return new Response('x'.repeat(readerPolicy.maxResponseBytes+1));
    if(mode==='status')return new Response('secret',{status:429});
    let result:unknown;
    if(body.method==='eth_chainId')result=mode==='chain'&&n===1?'0x1':'0x'+BigInt(BASE_NETWORK.split(':')[1]!).toString(16);
    else if(body.method==='eth_getBlockByNumber') {
      expect(body.params).toEqual(['safe',false]);
      result=head(n===1 && ['skew','fork','bad_parent','too_far'].includes(mode)?mode==='too_far'?14:11:10);
      if(mode==='stale')result={...head(),timestamp:'0x1'};
      if(mode==='future')result={...head(),timestamp:'0x65'};
      if(mode==='different_hash' && n===1)result={...head(),hash:hash('c')};
      if(mode==='different_parent' && n===1)result={...head(),parentHash:hash('c')};
    } else if(body.method==='eth_getBlockByHash') {
      result=head();if(mode==='fork')result={...head(),hash:hash('c')};
      if(mode==='bad_parent')result={...head(),number:'0x9'};
    } else if(body.method==='eth_call') {
      expect(body.params).toEqual([{to:SANCTIONS_ORACLE_BASE,data:oracleCalldata(input().address)},{blockHash:hash('a'),requireCanonical:true}]);
      if(mode==='rpc_error')return Response.json({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:'secret-provider-key'}});
      result=mode==='malformed'?'0x02':mode==='listed'||(mode==='disagree'&&n===1)?'0x'+'0'.repeat(63)+'1':'0x'+'0'.repeat(64);
    } else throw Error('unexpected_method');
    return Response.json({jsonrpc:'2.0',id:mode==='wrong_id'?999:body.id,result});
  };
  const reader=createBaseReader({providers,policy:readerPolicy,budget,now:()=>clock,fetchImpl,
    waitUntil:p=>{cleanups.push(p);},schedule:fn=>{expire=fn;return 1;},cancel:()=>{}});
  return {calls,reader,budget,gate,expire:()=>expire(),setTime:(n:number)=>{clock=n;},
    read:(id='one',tier:'free'|'paid'='free')=>reader(input(),{id,caller:id,tier}),
    cleanup:async()=>{await Promise.all(cleanups);}};
}
for(const mode of ['good','listed','skew'])it(`reads bounded real RPC envelopes: ${mode}`,async()=>{
  const f=fixture(mode),r=await f.read();await f.cleanup();
  expect(r.status).toBe('observed_unsigned');expect(r.production_ready).toBe(false);
  if(r.status!=='observed_unsigned')throw Error('missing_observation');
  expect(r.result).toBe(mode==='listed'?'listed':'not_listed');expect(r.block.hash).toBe(hash('a'));
  expect(f.calls).toHaveLength(mode==='skew'?7:6);
  expect(r.attempts.reduce((n,a)=>n+a.units,0)).toBe(mode==='skew'?18:15);
  expect(JSON.stringify(r)).not.toMatch(/test-key|https:/);
});
for(const mode of ['chain','stale','future','different_hash','different_parent','fork','bad_parent','too_far','malformed','disagree','rpc_error','wrong_id','oversize','status','error']) {
  it(`refuses ${mode} without retry, alternate source or credential leakage`,async()=>{
    const f=fixture(mode),r=await f.read();await f.cleanup();
    expect(r.status).toBe('unavailable');expect(JSON.stringify(r)).not.toMatch(/secret|test-key|https:/);
    expect(f.calls.filter(c=>c.method==='eth_call').length).toBeLessThanOrEqual(2);
  });
}
it('unsupported coverage and failed admission make no RPC calls',async()=>{
  const f=fixture();expect((await f.reader({network:'solana:fixture',address:'not-evm'},{id:'u',caller:'u',tier:'free'})).status).toBe('unsupported');
  expect(f.calls).toHaveLength(0);
  const denied=fixture('good',{reserve:async()=>null,release:async()=>{throw Error('not_reserved');}});
  expect((await denied.read()).status).toBe('unavailable');await denied.cleanup();expect(denied.calls).toHaveLength(0);
});
it('deadline aborts both requests while late completion retains and then releases the durable lease',async()=>{
  const s=env.SCREENING_BUDGET.getByName(crypto.randomUUID()),f=fixture('hang',s);
  const pending=f.read();
  for(let i=0;i<100 && f.calls.length<2;i++){await s.snapshot();await flush();}
  expect(f.calls.length).toBeGreaterThanOrEqual(2);f.expire();
  expect((await pending).status).toBe('unavailable');expect((await s.snapshot()).active).toBe(1);
  expect(f.calls.every(c=>c.signal?.aborted)).toBe(true);
  f.gate.resolve();await f.cleanup();expect((await s.snapshot()).active).toBe(0);
});
it('late admission after deadline is released without starting any RPC',async()=>{
  const gate=deferred(),s=env.SCREENING_BUDGET.getByName(crypto.randomUUID());
  const f=fixture('good',{reserve:async r=>{await gate.promise;return s.reserve(r);},release:t=>s.release(t)});
  const pending=f.read();await flush();f.expire();expect((await pending).status).toBe('unavailable');
  gate.resolve();await f.cleanup();expect(f.calls).toHaveLength(0);expect((await s.snapshot()).active).toBe(0);
});
it('free load cannot consume paid durable allowances',async()=>{
  const f=fixture();
  for(let i=0;i<3;i++){expect((await f.read('f'+i)).status).toBe('observed_unsigned');await f.cleanup();}
  expect((await f.read('excess')).status).toBe('unavailable');await f.cleanup();const count=f.calls.length;
  expect((await f.read('paid','paid')).status).toBe('observed_unsigned');await f.cleanup();expect(f.calls.length).toBe(count+6);
});
it('qualification Worker HTTP surface cannot read, reserve or select a paid tier',async()=>{
  for(const path of ['/','/screen','/reserve','/paid'])expect((await SELF.fetch('https://fixture.invalid'+path,{method:'POST',body:'{"tier":"paid"}'})).status).toBe(404);
});
it('unconfigured internal reader fails closed with fixed output',async()=>{
  const reader=new ScreeningReader(createExecutionContext(),env);
  expect(await reader.observe(input(),{id:'disabled',caller:'disabled',tier:'paid'})).toEqual({status:'unavailable',production_ready:false});
});
it('mismatched durable allowances cannot start reads and completion still releases the lease',async()=>{
  let released=0;
  const f=fixture('good',{reserve:async()=>({token:'synthetic',allowances:[{id:'a',units:1},{id:'b',units:1}]}),release:async()=>{released++;}});
  expect((await f.read()).status).toBe('unavailable');await f.cleanup();expect(f.calls).toHaveLength(0);expect(released).toBe(1);
});
it('invalid endpoint configuration does not echo its supplied credential text',()=>{
  const invalid=structuredClone(providers);invalid[0].endpoint='secret-provider-key';
  let message='';try {
    createBaseReader({providers:invalid,policy:readerPolicy,budget:env.SCREENING_BUDGET.getByName('unused'),now:()=>100000,waitUntil:()=>{}});
  } catch(error){message=String(error);}
  expect(message).toContain('configuration_unavailable');expect(message).not.toContain('secret-provider-key');
});
