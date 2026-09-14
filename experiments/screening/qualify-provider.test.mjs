import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyProvider } from './qualify-provider.mjs';
const word=n=>'0x'+n.repeat(64);
const fixture={chain_id:'0x2105',contract:'0x'+'1'.repeat(40),calldata:'0x12345678',
  historical_hash:word('1'),noncanonical_hash:word('2'),unknown_hash:word('0'),
  historical_result:word('3'),noncanonical_result:word('4'),noncanonical_error_code:-32000,unknown_error_code:-32001};
function rpc(mode='correct') {
  return async request=>{
    const {method,id,params}=request;
    if(mode==='throws') throw Error('secret-provider-url-must-not-escape');
    const result=value=>({jsonrpc:'2.0',id,result:value});
    const error=code=>({jsonrpc:'2.0',id,error:{code,message:'secret-provider-url-must-not-escape'}});
    if(method==='eth_chainId') return result(mode==='wrong-chain'?'0x1':fixture.chain_id);
    if(mode==='unsupported') return error(-32602);
    if(mode==='ignore-hash') return result(word('5'));
    const selector=params[1];
    if(selector==='latest') return result(mode==='no-changing-fixture'?fixture.historical_result:word('5'));
    if(selector.blockHash===fixture.historical_hash) return result(fixture.historical_result);
    if(selector.blockHash===fixture.unknown_hash) return error(fixture.unknown_error_code);
    if(mode==='missing-fork') return error(-32001);
    return selector.requireCanonical && mode!=='ignore-canonical'?error(fixture.noncanonical_error_code):result(fixture.noncanonical_result);
  };
}
test('passes all controls but does not promote protocol cases into product qualification',async()=>{
  const r=await qualifyProvider({witnessId:'synthetic',rpc:rpc(),fixture});
  assert.equal(r.protocol_cases_passed,true);assert.equal(r.qualified_for_product,false);
  assert.equal(r.attempts.length,6);assert.doesNotMatch(JSON.stringify(r),/secret-provider/);
});
for(const mode of ['wrong-chain','ignore-hash','unsupported','no-changing-fixture','missing-fork','ignore-canonical','throws']) {
  test(`refuses ${mode} instead of counting a broken instrument as a passing case`,async()=>{
    const r=await qualifyProvider({witnessId:'synthetic',rpc:rpc(mode),fixture});
    assert.equal(r.protocol_cases_passed,false);assert.equal(r.qualified_for_product,false);
    assert.doesNotMatch(JSON.stringify(r),/secret-provider/);
  });
}
test('timeout aborts transport and starts no follow-on read',async()=>{
  let calls=0,signal;
  const r=await qualifyProvider({witnessId:'synthetic',fixture,timeoutMs:10,rpc:(_request,s)=>{calls++;signal=s;return new Promise(()=>{});}});
  assert.equal(r.protocol_cases_passed,false);assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('missing or contradictory fixture controls refuse before a read',async()=>{
  let calls=0;
  for(const changes of [{noncanonical_hash:fixture.unknown_hash},{chain_id:[fixture.chain_id]},{contract:[fixture.contract]}]) {
    const r=await qualifyProvider({witnessId:'synthetic',fixture:{...fixture,...changes},rpc:()=>{calls++;}});
    assert.equal(r.protocol_cases_passed,false);assert.equal(calls,0);
  }
});
test('malformed result text and a mistaken URL as witness ID cannot escape in reports',async()=>{
  const secret='https://provider.invalid/private-credential';
  const r=await qualifyProvider({witnessId:'synthetic',fixture,rpc:async req=>({jsonrpc:'2.0',id:req.id,result:secret})});
  assert.equal(r.protocol_cases_passed,false);assert.equal(JSON.stringify(r).includes(secret),false);
  const badId=await qualifyProvider({witnessId:secret,fixture,rpc:rpc()});
  assert.equal(badId.attempts.length,0);assert.equal(JSON.stringify(badId).includes(secret),false);
});
