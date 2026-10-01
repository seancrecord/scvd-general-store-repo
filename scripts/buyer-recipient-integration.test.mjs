import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,recipientLaunch,validatePlan,recipientCompletion} from './lib/buyer-cold.mjs';
import {freezeInstrument,hostContext,childEnvironment,TIMING_POLICY,prepareRecipient,runRecipient,runCapabilityProbe,runCohort} from './buyer-cold-isolated.mjs';
import {draftCheckCommand,sourceCheckCommand,checkSourceQualification} from './lib/buyer-evidence-workflow.mjs';
import {packageReportFixture,literalCommandMatches} from './lib/buyer-package-access.mjs';
import {prepareHandoff} from './buyer-recipient-handoff.mjs';
const json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
function fixture(verifier=null,assisted=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recipient-integration-test-'));
 const saved={PATH:process.env.PATH,HOME:process.env.HOME};
 const bin=path.join(root,'bin');fs.mkdirSync(bin);const home=path.join(root,'home');fs.mkdirSync(home);
 // A deterministic local child, never a native agent or model API.
 fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}\nif(process.argv.includes('--version'))console.log('fixture-cli');else{process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Fixture recipient only; no acceptance claim.'}}));console.log(JSON.stringify({type:'turn.completed'}));});}\n`,{mode:0o700});
 process.env.PATH=bin;process.env.HOME=home;
 const plan={schema_version:6,subject:'https://merchant.example/paid',spend_usdc:0,budgets:{wall_ms:2000,tool_calls:10,output_bytes:100000,output_tokens:1000,artifact_bytes:100000,artifact_files:8},freshness:{max_age_ms:86400000},capability:{public_url:'https://example.com/public'},recipient:{host:'codex',model:'fixture-model',network:'disabled',attempts_per_eligible_cell:1,input_scope:'all-retained-and-buyer-report',budgets:{wall_ms:2000,tool_calls:8,output_bytes:100000,output_tokens:500}},cells:[{id:'fixture',host:'codex',model:'fixture-model',lane:'directed',verification:'prompted',entry:'https://example.com/guide'}]};
 if(verifier)plan.recipient.verifier=verifier;
 const reportFixture=assisted?packageReportFixture():null;
 if(assisted){plan.evidence_workflow='sources-and-draft-v1';plan.package_access=true;plan.subject=reportFixture.subject;}
 const cohort=path.join(root,'cohort');fs.mkdirSync(cohort);json(path.join(cohort,'plan.json'),plan);freezeInstrument(cohort);
 const context=hostContext(new Map([['codex',{version:'fixture-cli'}]]),childEnvironment());json(path.join(cohort,'host-context.json'),context);
 json(path.join(cohort,'capability.json'),{plan_sha256:hash(fs.readFileSync(path.join(cohort,'plan.json'))),recipient:{state:'pass'},hosts:{codex:{state:'pass'}},note:'Synthetic fixture, not qualification evidence.'});
 const launch=recipientLaunch(plan,'<fresh-recipient-directory>','<recipient-output>',context);
 const protocol={...plan.recipient,plan_sha256:hash(fs.readFileSync(path.join(cohort,'plan.json'))),instrument_sha256:hash(fs.readFileSync(path.join(cohort,'instrument.json'))),host_context_sha256:hash(fs.readFileSync(path.join(cohort,'host-context.json'))),capability_sha256:hash(fs.readFileSync(path.join(cohort,'capability.json'))),protocol_sha256:launch.protocol_sha256,inputs:launch.inputs,prompt_sha256:hash(launch.prompt),timing_policy:TIMING_POLICY};
 json(path.join(cohort,'recipient-protocol.json'),protocol);fs.writeFileSync(path.join(cohort,'recipient-prompt.txt'),launch.prompt);
 const source=path.join(cohort,'fixture');fs.mkdirSync(source);fs.mkdirSync(path.join(source,'evidence'));
 const bytes=reportFixture?Buffer.from(JSON.stringify(reportFixture.original)):Buffer.from([0,255,195,169]);fs.writeFileSync(path.join(source,'evidence/original.bin'),bytes);
 const trace=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Verbatim buyer report'}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n';fs.writeFileSync(path.join(source,'events.jsonl'),trace);
 const run={schema_version:6,cell:plan.cells[0],subject:plan.subject,freshness:plan.freshness,ended_at:'2026-09-28T12:34:56.789Z',runtime:{state:'completed',exit_code:0,budget_stop:null},trace_sha256:hash(trace),retained_artifacts:{state:'complete',files:[{file:'evidence/original.bin',sha256:hash(bytes),bytes:bytes.length}]}};json(path.join(source,'run.json'),run);
 return {root,cohort,source,plan,run,protocol,context,bytes,clean(){for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}fs.rmSync(root,{recursive:true,force:true});}};
}
test('the recipient receives the actual frozen age policy and buyer completion time',()=>{
 const f=fixture();try{
  const prepared=prepareRecipient(f.cohort,'fixture');
  const out=path.join(f.root,'policy-handoff');
  const manifest=prepareHandoff(f.source,prepared.selection,out,prepared.frozen);
  assert.deepEqual(manifest.observation_policy,{max_age_ms:f.plan.freshness.max_age_ms,evaluated_at:f.run.ended_at,basis:'buyer_completed_at'});
  assert.match(prepared.launch.prompt,/observation_policy/);
  assert.match(prepared.launch.prompt,/missing.*unknown/i);
  assert.equal(manifest.plan_content_sha256,hash(JSON.stringify(f.plan)));
  assert.equal(manifest.run_sha256,hash(fs.readFileSync(path.join(f.source,'run.json'))));
 }finally{f.clean();}
});
for(const change of ['missing completion time','invalid completion time','changed age policy'])test(`handoff refuses ${change} before creating inputs`,()=>{
 const f=fixture();try{
  const prepared=prepareRecipient(f.cohort,'fixture');
  if(change==='missing completion time')delete f.run.ended_at;
  if(change==='invalid completion time')f.run.ended_at='not a date';
  if(change==='changed age policy')f.run.freshness={max_age_ms:1};
  json(path.join(f.source,'run.json'),f.run);
  const out=path.join(f.root,'refused-policy-handoff');
  assert.throws(()=>prepareHandoff(f.source,prepared.selection,out,prepared.frozen),/freshness|completion/i);
  assert.equal(fs.existsSync(out),false);
 }finally{f.clean();}
});
test('schema 6 freezes all retained inputs and cannot silently use the old subset',()=>{
 const f=fixture();try{assert.equal(validatePlan(f.plan).schema_version,6);assert.throws(()=>validatePlan({...f.plan,recipient:{...f.plan.recipient,input_scope:'signed-pair-and-buyer-report'}}));
 const p=prepareRecipient(f.cohort,'fixture');assert.equal(p.selection.files[0].supply,true);assert.equal(p.selection.files[0].role,'other');assert.match(p.launch.prompt,/Every retained buyer file/);assert.ok(p.launch.args.includes('sandbox_workspace_write.network_access=false'));assert.ok(p.launch.args.includes('web_search="disabled"'));assert.ok(!p.launch.args.includes('--search'));
 }finally{f.clean();}
});
test('preview writes nothing and a local dummy launch retains exact inputs, budgets and a one-attempt lock',async()=>{
 const f=fixture();try{
 const preview=spawnSync(process.execPath,['scripts/buyer-cold-isolated.mjs','--recipient',f.cohort,'--cell','fixture'],{encoding:'utf8'});assert.equal(preview.status,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).execution,'dry_run');assert.equal(fs.existsSync(path.join(f.source,'recipient')),false);
 const result=await runRecipient(f.cohort,'fixture');assert.equal(result.runtime.state,'completed');assert.equal(result.review_required,true);
 const out=path.join(f.source,'recipient'),launch=JSON.parse(fs.readFileSync(path.join(out,'launch.json'))),manifest=JSON.parse(fs.readFileSync(path.join(out,'inputs/input-manifest.json')));
 assert.deepEqual(launch.budgets,f.plan.recipient.budgets);assert.equal(launch.prompt_sha256,f.protocol.prompt_sha256);assert.equal(manifest.prompt_sha256,f.protocol.prompt_sha256);assert.equal(manifest.protocol_sha256,f.protocol.protocol_sha256);assert.equal(manifest.plan_content_sha256,hash(JSON.stringify(f.plan)));assert.equal(manifest.files[0].supplied,true);assert.equal(manifest.citation_policy,'unclassified');assert.equal(manifest.files[0].cited_in_report,null);
 const original=path.join(out,'inputs',manifest.files[0].destination);assert.deepEqual(fs.readFileSync(original),f.bytes);
 fs.writeFileSync(path.join(launch.cwd,manifest.files[0].destination),'changed by recipient');assert.deepEqual(fs.readFileSync(original),f.bytes);
 await assert.rejects(runRecipient(f.cohort,'fixture'),/EEXIST/);
 fs.rmSync(launch.cwd,{recursive:true,force:true});
 }finally{f.clean();}
});
for(const change of ['plan','prompt','instrument','protocol','source subject','source identity','source freshness','unfinished buyer','interruption','recipient qualification','buyer qualification'])test(`recipient refuses ${change}`,()=>{
 const f=fixture();try{
 if(change==='plan'){f.plan.recipient.budgets.wall_ms++;json(path.join(f.cohort,'plan.json'),f.plan);}
 if(change==='prompt')fs.appendFileSync(path.join(f.cohort,'recipient-prompt.txt'),' changed');
 if(change==='instrument')fs.appendFileSync(path.join(f.cohort,'instrument/buyer-cold-isolated.mjs'),' changed');
 if(change==='protocol'){f.protocol.prompt_sha256='0'.repeat(64);json(path.join(f.cohort,'recipient-protocol.json'),f.protocol);}
 if(change==='source subject')f.run.subject='https://another.example/';
 if(change==='source identity')f.run.cell={...f.run.cell,id:'another'};
 if(change==='source freshness')f.run.freshness={max_age_ms:1};
 if(change==='unfinished buyer')f.run.runtime.state='failed';
 if(change==='interruption')f.run.timing={interruption:{reason:'callback_gap'}};
 if(change.endsWith('qualification')){const cap=JSON.parse(fs.readFileSync(path.join(f.cohort,'capability.json')));if(change.startsWith('recipient'))cap.recipient.state='incomplete';else cap.hosts.codex.state='fail';json(path.join(f.cohort,'capability.json'),cap);}
 json(path.join(f.source,'run.json'),f.run);
 assert.throws(()=>prepareRecipient(f.cohort,'fixture'));assert.equal(fs.existsSync(path.join(f.source,'recipient')),false);
 }finally{f.clean();}
});
test('tampered retained bytes consume no model launch, preserve failure and cannot retry',async()=>{
 const f=fixture();try{
 fs.appendFileSync(path.join(f.source,'evidence/original.bin'),'changed');
 await assert.rejects(runRecipient(f.cohort,'fixture'),/hash/i);
 const out=path.join(f.source,'recipient');assert.equal(fs.existsSync(path.join(out,'events.jsonl')),false);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'failure.json'))).retry_allowed,false);
 await assert.rejects(runRecipient(f.cohort,'fixture'),/EEXIST/);
 }finally{f.clean();}
});
test('host context drift refuses before reserving an attempt',async()=>{
 const f=fixture(),saved=process.env.LANG;try{process.env.LANG='changed-for-test';await assert.rejects(runRecipient(f.cohort,'fixture'),/context changed/);assert.equal(fs.existsSync(path.join(f.source,'recipient')),false);}finally{if(saved===undefined)delete process.env.LANG;else process.env.LANG=saved;f.clean();}
});
test('schema 6 blocks acquisition when the offline capability is absent',async()=>{
 const f=fixture();try{
 process.env.PATH='';const probe=path.join(f.root,'probe');const result=await runCapabilityProbe(f.plan,probe);
 assert.equal(result.recipient.state,'unavailable');await assert.rejects(runCohort(f.plan,path.join(f.root,'buyers'),{capability:probe}),/Offline recipient capability/);assert.equal(fs.existsSync(path.join(f.root,'buyers')),false);
 }finally{f.clean();}
});

test('a recipient review cannot promote a stopped or unfinished trace to acceptance',async()=>{
 const f=fixture();try{
 await runRecipient(f.cohort,'fixture');
 const file=path.join(f.source,'recipient/run.json'),record=JSON.parse(fs.readFileSync(file));
 const review={recipient:{run:{file:'recipient/run.json',sha256:hash(fs.readFileSync(file))},evidence:[{file:'recipient/events.jsonl',sha256:record.trace_sha256}]}};
 assert.equal(recipientCompletion(f.source,review).state,'completed');
 for(const mutate of [r=>{r.runtime.budget_stop='wall_ms';},r=>{r.timing.interruption={reason:'callback_gap'};},r=>{r.runtime.exit_code=1;}]){
  const bad=structuredClone(record);mutate(bad);json(file,bad);review.recipient.run.sha256=hash(fs.readFileSync(file));assert.equal(recipientCompletion(f.source,review).state,'incomplete');
 }
 json(file,record);review.recipient.run.sha256=hash(fs.readFileSync(file));
 fs.writeFileSync(path.join(f.source,'recipient/events.jsonl'),'{}\n');assert.equal(recipientCompletion(f.source,review).state,'incomplete');
 fs.rmSync(JSON.parse(fs.readFileSync(path.join(f.source,'recipient/launch.json'))).cwd,{recursive:true,force:true});
 }finally{f.clean();}
});
test('offline capability executes the recipient adapter and checks fresh signature vectors',async()=>{
 const f=fixture(),fetchBefore=globalThis.fetch;try{
 globalThis.fetch=async()=>new Response('fixture public bytes');
 fs.writeFileSync(path.join(f.root,'bin/codex'),`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto');
if(process.argv.includes('--version'))console.log('fixture-cli');
else{let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{
 if(fs.existsSync('public.bin')){
 const bytes=fs.readFileSync('public.bin'),key=prompt.match(/public key hex ([a-f0-9]+)/)[1];
 const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),format:'der',type:'spki'});
 const signatures=Object.fromEntries(JSON.parse(bytes).map(v=>[v.id,crypto.verify(null,Buffer.from(v.message),publicKey,Buffer.from(v.signature,'hex'))]));
 fs.copyFileSync('public.bin','evidence/public.bin');fs.writeFileSync('evidence/capability.json',JSON.stringify({fetched_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),signatures,commands_denied:[]}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',id:'fixture-local-check',command:'node local-check',status:'completed',exit_code:0}}));
 }
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Dummy process complete'}}));console.log(JSON.stringify({type:'turn.completed'}));
 });}
`,{mode:0o700});
 const probe=path.join(f.root,'offline-probe'),result=await runCapabilityProbe(f.plan,probe);
 assert.equal(result.recipient.state,'pass');
 const launch=JSON.parse(fs.readFileSync(path.join(probe,'recipient/launch.json')));
 assert.ok(launch.args.includes('sandbox_workspace_write.network_access=false'));assert.doesNotMatch(launch.prompt,/merchant\.example|scvd/i);assert.deepEqual(launch.budgets,f.plan.recipient.budgets);
 assert.match(launch.prompt,/serialize.*computed.*results/i);
 assert.match(launch.prompt,/do not.*transcribe.*boolean/i);
 assert.match(launch.prompt,/final.*saved report/i);
 assert.match(launch.prompt,/cannot complete.*report.*incomplete/i);
 assert.match(launch.prompt,/operational errors.*invalid signatures/i);
 assert.match(launch.prompt,/nonzero exit.*not.*signature/i);
 assert.match(launch.prompt,/retain.*stderr.*exit.*exception/i);
 assert.match(launch.prompt,/leave.*capability\.json.*unwritten.*incomplete/i);
 const score=JSON.parse(fs.readFileSync(path.join(probe,'recipient/capability.json')));assert.deepEqual(score.local_check.reported,score.local_check.expected);
 for(const name of ['recipient','codex'])fs.rmSync(JSON.parse(fs.readFileSync(path.join(probe,name,'launch.json'))).cwd,{recursive:true,force:true});
 }finally{globalThis.fetch=fetchBefore;f.clean();}
});
test('a completed recipient cannot be transplanted onto a changed buyer record',async()=>{
 const f=fixture();try{
 const record=await runRecipient(f.cohort,'fixture');
 const review={recipient:{run:{file:'recipient/run.json',sha256:hash(fs.readFileSync(path.join(f.source,'recipient/run.json')))},evidence:[{file:'recipient/events.jsonl',sha256:record.trace_sha256}]}};
 assert.equal(recipientCompletion(f.source,review).state,'completed');
 f.run.subject='https://different.example/';json(path.join(f.source,'run.json'),f.run);
 assert.equal(recipientCompletion(f.source,review).state,'incomplete');
 fs.rmSync(JSON.parse(fs.readFileSync(path.join(f.source,'recipient/launch.json'))).cwd,{recursive:true,force:true});
 }finally{f.clean();}
});

test('the integrated recipient supplies pinned CLI machinery and freezes its exact bytes',async()=>{
 const names=['evidence-cli.mjs','evidence-bundle.js','x402-verify.js','package.json','evidence-report.js','payment-identity.js'];
 const pkg=JSON.parse(fs.readFileSync(new URL('../verifier/package.json',import.meta.url)));
 const verifier={name:pkg.name,version:pkg.version,files:Object.fromEntries(names.map(file=>[file,hash(fs.readFileSync(new URL('../verifier/'+file,import.meta.url)))]))};
 const f=fixture(verifier);try{
  const prepared=prepareRecipient(f.cohort,'fixture');assert.ok(prepared.launch.inputs.includes('evidence-cli.mjs'));assert.match(prepared.launch.prompt,/node evidence-cli/);
  await runRecipient(f.cohort,'fixture');const out=path.join(f.source,'recipient');
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'inputs/input-manifest.json'))),instrument=JSON.parse(fs.readFileSync(path.join(f.cohort,'instrument.json')));
  assert.deepEqual(manifest.verifier,verifier);
  for(const file of names){assert.equal(hash(fs.readFileSync(path.join(out,'inputs',file))),verifier.files[file]);assert.equal(instrument.files['../verifier/'+file],verifier.files[file]);}
  fs.appendFileSync(path.join(f.cohort,'verifier/evidence-cli.mjs'),' changed');assert.throws(()=>prepareRecipient(f.cohort,'fixture'),/instrument/i);
  fs.rmSync(JSON.parse(fs.readFileSync(path.join(out,'launch.json'))).cwd,{recursive:true,force:true});
 }finally{f.clean();}
});

test('incorrect frozen CLI bytes stop qualification before any native child or output directory',async()=>{
 const names=['evidence-cli.mjs','evidence-bundle.js','x402-verify.js','package.json','evidence-report.js','payment-identity.js'];
 const pkg=JSON.parse(fs.readFileSync(new URL('../verifier/package.json',import.meta.url)));
 const verifier={name:pkg.name,version:pkg.version,files:Object.fromEntries(names.map(file=>[file,hash(fs.readFileSync(new URL('../verifier/'+file,import.meta.url)))]))};
 const f=fixture(verifier);try{
  f.plan.recipient.verifier.files['evidence-cli.mjs']='0'.repeat(64);
  const out=path.join(f.root,'refused');await assert.rejects(runCapabilityProbe(f.plan,out),/verifier bytes/);assert.equal(fs.existsSync(out),false);
 }finally{f.clean();}
});

function currentVerifier(){
 const pkg=JSON.parse(fs.readFileSync(new URL('../verifier/package.json',import.meta.url)));
 const names=pkg.files.filter(file=>/\.(mjs|js)$/.test(file)).concat('package.json');
 return {name:pkg.name,version:pkg.version,files:Object.fromEntries(names.map(file=>[file,hash(fs.readFileSync(new URL('../verifier/'+file,import.meta.url)))]))};
}
function assistedPlan(f){f.plan.evidence_workflow='sources-and-draft-v1';f.plan.package_access=true;return f.plan;}
test('assisted evidence condition rejects missing runtime, old versions and unknown conditions',()=>{
 const f=fixture(currentVerifier());try{
  const plan=assistedPlan(f);assert.equal(validatePlan(plan),plan);
  for(const mutate of [p=>{p.evidence_workflow='unknown';},p=>{delete p.recipient.verifier;},p=>{p.recipient.verifier.version='1.9.0';},p=>{delete p.package_access;}]){
   const bad=structuredClone(plan);mutate(bad);assert.throws(()=>validatePlan(bad),/workflow|verifier|package/i);
  }
 }finally{f.clean();}
});
test('assisted evidence condition freezes source helper and checked draft instructions',()=>{
 const f=fixture(currentVerifier());try{
  const previous=recipientLaunch(f.plan,'cwd','out',f.context);
  const assisted=recipientLaunch(assistedPlan(f),'cwd','out',f.context);
  assert.match(assisted.prompt,/sources SAVED_JSON/);assert.match(assisted.prompt,/recipient-draft\.md/);assert.match(assisted.prompt,/check-identifiers/);
  assert.match(assisted.prompt,/byte-for-byte/);assert.match(assisted.prompt,/prose/);
  assert.deepEqual(assisted.budgets,previous.budgets);
  delete f.plan.evidence_workflow;delete f.plan.package_access;
  assert.equal(recipientLaunch(f.plan,'cwd','out',f.context).prompt,previous.prompt);
 }finally{f.clean();}
});
function installDraftChild(f,{drift=false,omit=false,failed=false,missingTerminal=false}={}){
 fs.symlinkSync(process.execPath,path.join(f.root,'bin/node'));
 const command=draftCheckCommand(f.plan);
 fs.writeFileSync(path.join(f.root,'bin/codex'),`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
if(process.argv.includes('--version'))console.log('fixture-cli');else{
 process.stdin.resume();process.stdin.on('end',()=>{
 const manifest=JSON.parse(fs.readFileSync('input-manifest.json')),file=manifest.files[0].destination,bytes=fs.readFileSync(file),original=JSON.parse(bytes);
 const draft='Synthetic original SHA-256 '+crypto.createHash('sha256').update(bytes).digest('hex')+'. This does not prove identity or delivery.';
 fs.writeFileSync('evidence/recipient-draft.md',draft);fs.writeFileSync('evidence/recipient-check-request.json',JSON.stringify({original:file,public_key:original.public_key}));
 if(!${omit}){const check=spawnSync('/bin/sh',['-c',${JSON.stringify(command)}],{encoding:'utf8'});console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:${JSON.stringify(command)},status:'completed',exit_code:check.status}}));}
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:draft+${JSON.stringify(drift?' Later changed final.':'')}}}));if(!${missingTerminal})console.log(JSON.stringify({type:${JSON.stringify(failed?'turn.failed':'turn.completed')}}));
 });}
`,{mode:0o700});
}
function recipientReview(f,record){return {recipient:{run:{file:'recipient/run.json',sha256:hash(fs.readFileSync(path.join(f.source,'recipient/run.json')))},evidence:[{file:'recipient/events.jsonl',sha256:record.trace_sha256}]}};}
function cleanRecipientFixture(f){
 const launch=path.join(f.source,'recipient/launch.json');if(fs.existsSync(launch))fs.rmSync(JSON.parse(fs.readFileSync(launch)).cwd,{recursive:true,force:true});f.clean();
}
test('assisted recipient retains the checked draft and exact final and independently replays before completion',async()=>{
 const f=fixture(currentVerifier(),true);try{
  installDraftChild(f);const record=await runRecipient(f.cohort,'fixture');
  assert.equal(record.draft_check.state,'pass',JSON.stringify(record.draft_check));
  assert.equal(record.draft_check.final_matches_draft,true);assert.equal(record.draft_check.prose_verified,false);
  const out=path.join(f.source,'recipient');assert.deepEqual(fs.readFileSync(path.join(out,'final-verbatim.md')),fs.readFileSync(path.join(out,'evidence/recipient-draft.md')));
  assert.equal(recipientCompletion(f.source,recipientReview(f,record)).state,'completed');
  fs.appendFileSync(path.join(out,'evidence/recipient-draft.md'),'edited');
  assert.equal(recipientCompletion(f.source,recipientReview(f,record)).state,'incomplete');
 }finally{cleanRecipientFixture(f);}
});
for(const variant of ['drift','omit'])test(`assisted recipient refuses completion after ${variant}`,async()=>{
 const f=fixture(currentVerifier(),true);try{
  installDraftChild(f,{[variant]:true});const record=await runRecipient(f.cohort,'fixture');
  assert.equal(record.runtime.state,'completed');assert.equal(record.draft_check.state,'incomplete');
  assert.equal(recipientCompletion(f.source,recipientReview(f,record)).state,'incomplete');
  if(variant==='drift'){assert.equal(record.draft_check.final_matches_draft,false);assert.equal(record.draft_check.saved_check_matches_replay,true);}
  assert.equal(fs.existsSync(path.join(f.source,'recipient/final-verbatim.md')),true);
 }finally{cleanRecipientFixture(f);}
});
for(const variant of ['report','request','original','command','symlink','missing','plan','missing plan','removed flag'])test(`assisted scorer rejects ${variant} tampering even with refreshed outer hashes`,async()=>{
 const f=fixture(currentVerifier(),true);try{
  installDraftChild(f);const record=await runRecipient(f.cohort,'fixture');assert.equal(record.draft_check.state,'pass',record.draft_check.reason);
  const out=path.join(f.source,'recipient');
  const changed=name=>{const row=record.retained_artifacts.files.find(r=>r.file===name);row.sha256=hash(fs.readFileSync(path.join(out,name)));};
  if(variant==='report'){fs.writeFileSync(path.join(out,'evidence/recipient-check.json'),'{}');changed('evidence/recipient-check.json');}
  if(variant==='request'){json(path.join(out,'evidence/recipient-check-request.json'),{original:'../../outside',public_key:'0'.repeat(64)});changed('evidence/recipient-check-request.json');}
  if(variant==='original')fs.appendFileSync(path.join(out,'inputs/artifacts/0-original.bin'),' ');
  if(variant==='command'){
   const events=fs.readFileSync(path.join(out,'events.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.item?.type!=='command_execution');fs.writeFileSync(path.join(out,'events.jsonl'),events.map(JSON.stringify).join('\n')+'\n');record.trace_sha256=hash(fs.readFileSync(path.join(out,'events.jsonl')));
  }
  if(variant==='symlink'){const file=path.join(out,'evidence/recipient-draft.md');fs.renameSync(file,path.join(out,'draft-copy'));fs.symlinkSync('../draft-copy',file);}
  if(variant==='missing')record.retained_artifacts.files=record.retained_artifacts.files.filter(r=>r.file!=='evidence/recipient-draft.md');
  if(variant==='missing plan')fs.unlinkSync(path.join(f.cohort,'plan.json'));
  if(variant==='removed flag'){delete f.plan.evidence_workflow;json(path.join(f.cohort,'plan.json'),f.plan);}
  if(variant==='plan'){f.plan.recipient.budgets.wall_ms++;json(path.join(f.cohort,'plan.json'),f.plan);}
  json(path.join(out,'run.json'),record);assert.equal(recipientCompletion(f.source,recipientReview(f,record)).state,'incomplete');
 }finally{cleanRecipientFixture(f);}
});
test('source helper qualification executes the pinned CLI and rejects altered output or absent execution',()=>{
 const f=fixture(currentVerifier(),true);try{
  const cwd=path.join(f.root,'source-check');fs.mkdirSync(path.join(cwd,'evidence'),{recursive:true});fs.mkdirSync(path.join(cwd,'work/tooling/node_modules'),{recursive:true});
  fs.symlinkSync(path.resolve('verifier'),path.join(cwd,'work/tooling/node_modules/x402-verify'));
  fs.symlinkSync(process.execPath,path.join(f.root,'bin/node'));
  const report=packageReportFixture(),command=sourceCheckCommand(f.plan,report);
  const run=spawnSync('/bin/sh',['-c',command],{cwd,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const bytes=name=>fs.readFileSync(path.join(cwd,name));
  checkSourceQualification(f.plan,report,bytes,c=>literalCommandMatches(command,c),cwd);
  assert.throws(()=>checkSourceQualification(f.plan,report,bytes,()=>false,cwd),/No completed/);
  const output=JSON.parse(bytes('evidence/source-candidates.json'));output.scope='invented authenticated claim';json(path.join(cwd,'evidence/source-candidates.json'),output);
  assert.throws(()=>checkSourceQualification(f.plan,report,bytes,()=>true,cwd),/independent replay/);
 }finally{f.clean();}
});
for(const checked of [false,true])test(`offline qualification requires an exercised checked-draft workflow (${checked?'present':'missing'})`,async()=>{
 const f=fixture(currentVerifier(),true),fetchBefore=globalThis.fetch;let probe;
 try{
  globalThis.fetch=async()=>new Response('synthetic public bytes');
  fs.symlinkSync(process.execPath,path.join(f.root,'bin/node'));
  fs.writeFileSync(path.join(f.root,'bin/codex'),`#!${process.execPath}
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
if(process.argv.includes('--version'))console.log('fixture-cli');else{let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{
let final='Synthetic capability only.';
if(fs.existsSync('public.bin')){
 const bytes=fs.readFileSync('public.bin'),key=prompt.match(/public key hex ([a-f0-9]+)/)[1];
 const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),format:'der',type:'spki'});
 const signatures=Object.fromEntries(JSON.parse(bytes).map(v=>[v.id,crypto.verify(null,Buffer.from(v.message),publicKey,Buffer.from(v.signature,'hex'))]));
 fs.copyFileSync('public.bin','evidence/public.bin');fs.writeFileSync('evidence/capability.json',JSON.stringify({fetched_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),signatures,commands_denied:[]}));
 console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'node local-check',status:'completed',exit_code:0}}));
 if(${checked}){
  const source=fs.readFileSync('artifacts/0-original.json'),original=JSON.parse(source);final='Synthetic file SHA-256 '+crypto.createHash('sha256').update(source).digest('hex')+'. Not merchant evidence.';
  fs.writeFileSync('evidence/recipient-draft.md',final);fs.writeFileSync('evidence/recipient-check-request.json',JSON.stringify({original:'artifacts/0-original.json',public_key:original.public_key}));
  const command=prompt.match(/\\n(node -e [^\\n]+)\\n/)[1],run=spawnSync('/bin/sh',['-c',command],{encoding:'utf8'});
  console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command,status:'completed',exit_code:run.status}}));
 }
}
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:final}}));console.log(JSON.stringify({type:'turn.completed'}));});}
`,{mode:0o700});
  probe=path.join(f.root,'assisted-probe');const result=await runCapabilityProbe(f.plan,probe);
  const score=JSON.parse(fs.readFileSync(path.join(probe,'recipient/capability.json')));
  assert.equal(score.local_check.state,'pass');assert.equal(score.retention.state,'pass');
  assert.equal(result.recipient.state,checked?'pass':'incomplete',JSON.stringify(score));
  assert.equal(score.draft_check.state,checked?'pass':'incomplete');
  const launch=JSON.parse(fs.readFileSync(path.join(probe,'recipient/launch.json')));assert.deepEqual(launch.budgets,f.plan.recipient.budgets);assert.ok(launch.args.includes('sandbox_workspace_write.network_access=false'));
 }finally{
  if(probe)for(const name of ['codex','recipient']){const file=path.join(probe,name,'launch.json');if(fs.existsSync(file))fs.rmSync(JSON.parse(fs.readFileSync(file)).cwd,{recursive:true,force:true});}
  globalThis.fetch=fetchBefore;f.clean();
 }
});

test('a stopped assisted recipient preserves its last message without labelling it a completed final',async()=>{
 const f=fixture(currentVerifier(),true);try{
  installDraftChild(f,{failed:true});const record=await runRecipient(f.cohort,'fixture');
  assert.equal(record.runtime.state,'failed');assert.equal(record.draft_check.state,'incomplete');
  assert.equal(fs.existsSync(path.join(f.source,'recipient/final-verbatim.md')),false);
  assert.equal(fs.existsSync(path.join(f.source,'recipient/last-message-verbatim.md')),true);
 }finally{cleanRecipientFixture(f);}
});

test('an assisted process exiting without a terminal event preserves only a last message',async()=>{
 const f=fixture(currentVerifier(),true);try{
  installDraftChild(f,{missingTerminal:true});const record=await runRecipient(f.cohort,'fixture');
  assert.equal(record.draft_check.state,'incomplete');
  assert.equal(fs.existsSync(path.join(f.source,'recipient/final-verbatim.md')),false);
  assert.equal(fs.existsSync(path.join(f.source,'recipient/last-message-verbatim.md')),true);
 }finally{cleanRecipientFixture(f);}
});
