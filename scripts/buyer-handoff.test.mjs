import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
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

const fullPlan={schema_version:5,subject:'https://merchant.example/paid',spend_usdc:0,
 budgets:{wall_ms:240000,tool_calls:20,output_bytes:4000000,output_tokens:2500,artifact_bytes:33554432,artifact_files:32},
 freshness:{max_age_ms:1209600000},capability:{public_url:'https://example.org/capability'},
 cells:[{id:'buyer',host:'codex',model:'gpt-5.6-luna',lane:'directed',verification:'prompted',entry:'https://scvd.store/skill.md'}],
 recipient:{host:'codex',model:'gpt-5.6-luna',network:'disabled',attempts_per_eligible_cell:1,input_scope:'all-retained-and-buyer-report',budgets:{wall_ms:180000,tool_calls:12,output_bytes:4194304,output_tokens:1800}}};
async function frozenFixture(){
 const {recipientLaunch}=await import('./lib/buyer-cold.mjs');
 const launch=recipientLaunch(fullPlan,'<recipient>','<output>',{codex:{disabled_skills:[]}});
 return {plan:fullPlan,protocol:{...fullPlan.recipient,protocol_sha256:launch.protocol_sha256,inputs:launch.inputs,prompt_sha256:hash(launch.prompt)},prompt:launch.prompt};
}
test('full capture handoff uses the exact frozen inventory prompt and unchanged offline budgets',async()=>{
 const f=fixture();try{
  const frozen=await frozenFixture();f.selection.scope='buyer_report';for(const row of f.selection.files)row.supply=true;
  const m=prepareHandoff(f.root,f.selection,f.out,frozen);
  assert.equal(fs.readFileSync(path.join(f.out,'recipient-prompt.txt'),'utf8'),frozen.prompt);
  assert.equal(m.protocol_sha256,frozen.protocol.protocol_sha256);
  assert.equal(m.plan_content_sha256,hash(JSON.stringify(fullPlan)));
  assert.equal(m.files.filter(x=>x.supplied).length,f.run.retained_artifacts.files.length);
  assert.match(frozen.prompt,/Read input-manifest.json first/);assert.match(frozen.prompt,/12 tool calls/);assert.match(frozen.prompt,/180 seconds/);
  assert.doesNotMatch(frozen.prompt,/supplied subset is original-response/);
 }finally{f.clean();}
});
for(const mutation of ['prompt','protocol hash','budget','inputs','subject','subset scope','uncited omission'])test(`frozen handoff rejects ${mutation} before creating files`,async()=>{
 const f=fixture();try{
  const frozen=await frozenFixture();f.selection.scope='buyer_report';for(const row of f.selection.files)row.supply=true;
  if(mutation==='prompt')frozen.prompt+='Changed after acquisition';
  if(mutation==='protocol hash')frozen.protocol.protocol_sha256='00'.repeat(32);
  if(mutation==='budget')frozen.protocol.budgets={...fullPlan.recipient.budgets,wall_ms:999999};
  if(mutation==='inputs')frozen.protocol.inputs=['original-response.json'];
  if(mutation==='subject'){f.run.subject='https://different.example/paid';fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));}
  if(mutation==='subset scope')f.selection.scope='signature_subset';
  if(mutation==='uncited omission'){f.selection.files[2].supply=false;f.selection.files[2].cited=false;}
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out,frozen),/frozen|protocol|scope|subject|suppl/i);
  assert.equal(fs.existsSync(f.out),false);
 }finally{f.clean();}
});

for(const mutation of [null,'plan after qualification','different cell'])test(`frozen-cohort CLI ${mutation??'copies the complete inventory'}`,async()=>{
 const f=fixture();try{
  const frozen=await frozenFixture(),cohort=path.join(f.root,'cohort');fs.mkdirSync(cohort);
  const source=path.join(cohort,'buyer');fs.mkdirSync(source);fs.cpSync(path.join(f.root,'evidence'),path.join(source,'evidence'),{recursive:true});
  fs.copyFileSync(path.join(f.root,'events.jsonl'),path.join(source,'events.jsonl'));
  f.run.cell=fullPlan.cells[0];if(mutation==='different cell')f.run.cell={...f.run.cell,model:'different'};
  fs.writeFileSync(path.join(source,'run.json'),JSON.stringify(f.run));
  const planBytes=JSON.stringify(fullPlan,null,2)+'\n';
  for(const [name,bytes] of Object.entries({'plan.json':planBytes,'capability.json':JSON.stringify({plan_sha256:mutation==='plan after qualification'?'00'.repeat(32):hash(planBytes)}),'recipient-protocol.json':JSON.stringify(frozen.protocol),'recipient-prompt.txt':frozen.prompt}))fs.writeFileSync(path.join(cohort,name),bytes);
  f.selection.scope='buyer_report';for(const row of f.selection.files)row.supply=true;
  const selection=path.join(f.root,'selection.json');fs.writeFileSync(selection,JSON.stringify(f.selection));
  const result=spawnSync(process.execPath,['scripts/buyer-recipient-handoff.mjs',source,selection,f.out,'--frozen-cohort',cohort],{encoding:'utf8'});
  if(mutation){assert.notEqual(result.status,0);assert.equal(fs.existsSync(f.out),false);}
  else {assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(path.join(f.out,'recipient-prompt.txt'),'utf8'),frozen.prompt);assert.equal(JSON.parse(result.stdout).supplied,f.run.retained_artifacts.files.length);}
 }finally{f.clean();}
});
