import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hash} from './lib/buyer-cold.mjs';
import {prepareHandoff} from './buyer-recipient-handoff.mjs';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-handoff-test-'));fs.mkdirSync(path.join(root,'evidence'));
 const files=['snapshot.json','key.json','preflight.json','history.json'].map((name,i)=>{
  const bytes=JSON.stringify({fixture:i});const file=`evidence/${name}`;fs.writeFileSync(path.join(root,file),bytes);return {file,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};
 });
 const trace=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'The buyer report.\nCurrent and historical claims.'}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n';fs.writeFileSync(path.join(root,'events.jsonl'),trace);
 const run={runtime:{state:'completed',exit_code:0,budget_stop:null},cell:{host:'codex'},subject:'https://merchant.example/paid',trace_sha256:hash(trace),retained_artifacts:{state:'complete',files}};fs.writeFileSync(path.join(root,'run.json'),JSON.stringify(run));
 const selection={schema_version:1,scope:'signature_subset',files:files.map((f,i)=>({file:f.file,supply:i<2,cited:true,role:i===0?'signature_candidate':i===1?'issuer_key':'unsigned_context'}))};
 return {root,run,selection,out:path.join(root,'recipient'),clean:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('a signature subset distinguishes supplied originals from retained but omitted unsigned context',()=>{
 const f=fixture();try{
  const m=prepareHandoff(f.root,f.selection,f.out);
  assert.equal(m.files.length,4);assert.equal(m.files.filter(x=>x.supplied).length,2);
  assert.equal(m.files[2].retained,true);assert.equal(m.files[2].supplied,false);assert.equal(m.files[2].destination,null);
  assert.match(fs.readFileSync(path.join(f.out,'recipient-prompt.txt'),'utf8'),/retained but omitted/);
  assert.match(m.limit,/not authenticate/);
  assert.equal(fs.readFileSync(path.join(f.out,'buyer-handoff.md'),'utf8'),'The buyer report.\nCurrent and historical claims.');
  for(const row of m.files.filter(x=>x.supplied))assert.equal(hash(fs.readFileSync(path.join(f.out,row.destination))),row.sha256);
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out),/EEXIST/);
 }finally{f.clean();}
});
test('whole-report preparation refuses cited omissions before creating recipient files',()=>{
 const f=fixture();try{f.selection.scope='buyer_report';assert.throws(()=>prepareHandoff(f.root,f.selection,f.out),/cited.*omitted/i);assert.equal(fs.existsSync(f.out),false);
  for(const row of f.selection.files)row.supply=true;
  assert.equal(prepareHandoff(f.root,f.selection,f.out).files.filter(x=>x.supplied).length,4);
 }finally{f.clean();}
});
for(const mutation of ['tampered supplied','tampered omitted','missing selection','duplicate selection','invented file','changed transcript','missing final','wrong size','unknown role'])test(`handoff refuses ${mutation}`,()=>{
 const f=fixture();try{
  if(mutation==='tampered supplied')fs.appendFileSync(path.join(f.root,f.run.retained_artifacts.files[0].file),' ');
  if(mutation==='tampered omitted')fs.appendFileSync(path.join(f.root,f.run.retained_artifacts.files[2].file),' ');
  if(mutation==='missing selection')f.selection.files.pop();
  if(mutation==='duplicate selection')f.selection.files[3]=f.selection.files[0];
  if(mutation==='invented file')f.selection.files[3].file='evidence/invented.json';
  if(mutation==='changed transcript')fs.appendFileSync(path.join(f.root,'events.jsonl'),'{}\n');
  if(mutation==='missing final'){const t='{}\n';fs.writeFileSync(path.join(f.root,'events.jsonl'),t);f.run.trace_sha256=hash(t);fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));}
  if(mutation==='wrong size'){f.run.retained_artifacts.files[0].bytes++;fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));}
  if(mutation==='unknown role')f.selection.files[0].role='authenticated_every_week';
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out));assert.equal(fs.existsSync(f.out),false);
 }finally{f.clean();}
});
test('Claude final text is retained verbatim and incomplete capture is disclosed',()=>{
 const f=fixture();try{
  const t=JSON.stringify({type:'result',result:'Claude final\nwith caveats'})+'\n';fs.writeFileSync(path.join(f.root,'events.jsonl'),t);
  f.run.cell.host='claude';f.run.trace_sha256=hash(t);f.run.retained_artifacts.state='incomplete';f.run.retained_artifacts.issues=[{file:'too-big.json',reason:'byte_limit'}];fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));
  const m=prepareHandoff(f.root,f.selection,f.out);assert.equal(m.capture_state,'incomplete');assert.equal(m.capture_issues[0].reason,'byte_limit');assert.equal(fs.readFileSync(path.join(f.out,'buyer-handoff.md'),'utf8'),'Claude final\nwith caveats');
 }finally{f.clean();}
});
test('handoff preserves Unicode and non-UTF8 response bytes exactly',()=>{
 const f=fixture();try{
  const bytes=Buffer.concat([Buffer.from('Signed text: café — '),Buffer.from([0xff,0x00,0xfe])]);
  const row=f.run.retained_artifacts.files[0];fs.writeFileSync(path.join(f.root,row.file),bytes);row.bytes=bytes.length;row.sha256=hash(bytes);fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));
  const m=prepareHandoff(f.root,f.selection,f.out);assert.deepEqual(fs.readFileSync(path.join(f.out,m.files[0].destination)),bytes);
 }finally{f.clean();}
});

for(const reason of ['stopped buyer','no terminal event'])test(`handoff cannot relabel an intermediate message as final: ${reason}`,()=>{
 const f=fixture();try{
  if(reason==='stopped buyer')f.run.runtime={state:'failed',exit_code:null,budget_stop:'wall_ms'};
  else {const trace=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Still working'}})+'\n';fs.writeFileSync(path.join(f.root,'events.jsonl'),trace);f.run.trace_sha256=hash(trace);}
  fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out),/complete|terminal/i);assert.equal(fs.existsSync(f.out),false);
 }finally{f.clean();}
});
