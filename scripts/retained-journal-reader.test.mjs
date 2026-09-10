import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readJournal,handleJournalRequest} from './lib/retained-journal-reader.mjs';
const input={item:'spot_check',network:'eip155:8453',settlement_tx:'0xabc',payer:'0xdef'};
function fixture({artifact=true,response=JSON.stringify({observation:{signed_payload:'original'},status_token:'never export'}),legacy=null,fail=false}={}){
 const calls=[];
 const stub={async readArtifact(value){calls.push(['readArtifact',value]);if(fail)throw Error('private error');return artifact?{digest:'bound'}:null;},async artifactStage(...args){calls.push(['artifactStage',args]);return response;},async readCompleted(value){calls.push(['readCompleted',value]);return legacy;}};
 return {calls,env:{PAID_RECOVERIES:{idFromName(name){calls.push(['idFromName',name]);return name;},get(){return stub;}}}};
}
test('capture uses only existing read methods and never passes a proposed write',async()=>{
 const {calls,env}=fixture();const result=await readJournal(env,input);
 assert.equal(result.status,'readable');assert.deepEqual(result.goods,{observation:{signed_payload:'original'}});
 assert.deepEqual(calls.find(x=>x[0]==='artifactStage')[1],['bound','response']);
 assert.equal(calls[0][1],'eip155:8453:0xabc');
 assert.equal(calls[1][1].path,'/api/buy/spot_check');
 assert.equal(JSON.stringify(result).includes('never export'),false);
});
test('legacy completed journals are readable; absence, malformed data and provider failure differ',async()=>{
 assert.equal((await readJournal(fixture({artifact:false,legacy:{response:JSON.stringify({observation:{signed_payload:'original'}})}}).env,input)).status,'readable');
 assert.equal((await readJournal(fixture({artifact:false}).env,input)).status,'not_found');
 assert.equal((await readJournal(fixture({response:'broken'}).env,input)).status,'unreadable');
 assert.equal((await readJournal(fixture({fail:true}).env,input)).status,'unavailable');
 assert.equal((await readJournal(fixture({response:null}).env,input)).status,'response_not_retained');
});
test('wrong or missing session authorization cannot reach a production binding',async()=>{
 const {calls,env}=fixture();env.CAPTURE_TOKEN_HASH=createHash('sha256').update('session-token').digest('hex');
 for(const token of [undefined,'wrong']){
  const response=await handleJournalRequest(new Request('https://preview.invalid/read',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(input)}),env);
  assert.equal(response.status,401);
 }
 assert.equal(calls.length,0);
 const response=await handleJournalRequest(new Request('https://preview.invalid/read',{method:'POST',headers:{Authorization:'Bearer session-token'},body:JSON.stringify(input)}),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('unknown items and oversized requests cannot reach a production binding',async()=>{
 const {calls,env}=fixture();env.CAPTURE_TOKEN_HASH=createHash('sha256').update('session-token').digest('hex');
 assert.equal((await readJournal(env,{...input,item:'../other'})).status,'unsupported_identity');
 const response=await handleJournalRequest(new Request('https://preview.invalid/read',{method:'POST',headers:{Authorization:'Bearer session-token'},body:' '.repeat(17000)}),env);
 assert.equal(response.status,413);assert.equal(calls.length,0);
});
