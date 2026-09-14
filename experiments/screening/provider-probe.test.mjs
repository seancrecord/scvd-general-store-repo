import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function run(mode) {
  const dir=mkdtempSync(join(tmpdir(),'scvd-rpc-fixture-'));
  try {
    const preload=join(dir,'preload.mjs'),output=join(dir,'result.json');
    writeFileSync(preload,`
      const mode=${JSON.stringify(mode)};
      globalThis.fetch=async (url,options)=>{
        if(mode==='offline') throw Error('synthetic transport failure');
        const {id,method,params}=JSON.parse(options.body);
        let result;
        if(method==='eth_chainId') result=mode==='wrong-chain'?'0x1':'0x2105';
        else if(method==='eth_getBlockByNumber') {
          const digit={latest:'3',safe:'2',finalized:'1'}[params[0]];
          result={number:'0x'+digit,hash:'0x'+digit.repeat(64),timestamp:'0x1',parentHash:'0x'+'0'.repeat(64)};
        } else if(method==='eth_call') {
          if(params[1].blockHash==='0x'+'0'.repeat(64)) return Response.json({jsonrpc:'2.0',id,error:{code:-32001,message:'block not found'}});
          result='0x'+'0'.repeat(64);
        } else throw Error('unexpected method');
        return Response.json({jsonrpc:'2.0',id,result});
      };
    `);
    const r=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,new URL('./provider-probe.mjs',import.meta.url).pathname,output],{
      env:{PATH:process.env.PATH ?? ''},timeout:5000,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    return JSON.parse(readFileSync(output,'utf8'));
  } finally {rmSync(dir,{recursive:true,force:true});}
}
test('public probe stops on silence or wrong chain without inventing capability evidence',()=>{
  for(const mode of ['offline','wrong-chain']) {
    const r=run(mode); assert.equal(r.attempts.length,1);assert.equal(r.qualified_for_product,false);
  }
});
test('calls are pinned to sampled safe/finalized hashes and stay within the read budget',()=>{
  const r=run('answers');assert.equal(r.attempts.length,7);
  const calls=r.attempts.filter(x=>x.method==='eth_call');
  assert.deepEqual(calls.map(x=>x.params[1]),['2','1','0'].map(d=>({blockHash:'0x'+d.repeat(64),requireCanonical:true})));
  assert.equal(calls[2].outcome,'rpc_error');
  assert.equal(r.qualified_for_product,false,'happy sample is still incomplete qualification');
  assert.ok(r.attempts.every(x=>['eth_chainId','eth_getBlockByNumber','eth_call'].includes(x.method)));
});
