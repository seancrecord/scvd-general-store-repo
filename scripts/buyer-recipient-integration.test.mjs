import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,recipientLaunch,validatePlan,recipientCompletion} from './lib/buyer-cold.mjs';
import {freezeInstrument,hostContext,childEnvironment,TIMING_POLICY,prepareRecipient,runRecipient,runCapabilityProbe,runCohort} from './buyer-cold-isolated.mjs';
const json=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recipient-integration-test-'));
 const saved={PATH:process.env.PATH,HOME:process.env.HOME};
 const bin=path.join(root,'bin');fs.mkdirSync(bin);const home=path.join(root,'home');fs.mkdirSync(home);
 // A deterministic local child, never a native agent or model API.
 fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}\nif(process.argv.includes('--version'))console.log('fixture-cli');else{process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Fixture recipient only; no acceptance claim.'}}));console.log(JSON.stringify({type:'turn.completed'}));});}\n`,{mode:0o700});
 process.env.PATH=bin;process.env.HOME=home;
 const plan={schema_version:6,subject:'https://merchant.example/paid',spend_usdc:0,budgets:{wall_ms:2000,tool_calls:10,output_bytes:100000,output_tokens:1000,artifact_bytes:100000,artifact_files:8},freshness:{max_age_ms:86400000},capability:{public_url:'https://example.com/public'},recipient:{host:'codex',model:'fixture-model',network:'disabled',attempts_per_eligible_cell:1,input_scope:'all-retained-and-buyer-report',budgets:{wall_ms:2000,tool_calls:8,output_bytes:100000,output_tokens:500}},cells:[{id:'fixture',host:'codex',model:'fixture-model',lane:'directed',verification:'prompted',entry:'https://example.com/guide'}]};
 const cohort=path.join(root,'cohort');fs.mkdirSync(cohort);json(path.join(cohort,'plan.json'),plan);freezeInstrument(cohort);
 const context=hostContext(new Map([['codex',{version:'fixture-cli'}]]),childEnvironment());json(path.join(cohort,'host-context.json'),context);
 json(path.join(cohort,'capability.json'),{plan_sha256:hash(fs.readFileSync(path.join(cohort,'plan.json'))),recipient:{state:'pass'},hosts:{codex:{state:'pass'}},note:'Synthetic fixture, not qualification evidence.'});
 const launch=recipientLaunch(plan,'<fresh-recipient-directory>','<recipient-output>',context);
 const protocol={...plan.recipient,plan_sha256:hash(fs.readFileSync(path.join(cohort,'plan.json'))),instrument_sha256:hash(fs.readFileSync(path.join(cohort,'instrument.json'))),host_context_sha256:hash(fs.readFileSync(path.join(cohort,'host-context.json'))),capability_sha256:hash(fs.readFileSync(path.join(cohort,'capability.json'))),protocol_sha256:launch.protocol_sha256,inputs:launch.inputs,prompt_sha256:hash(launch.prompt),timing_policy:TIMING_POLICY};
 json(path.join(cohort,'recipient-protocol.json'),protocol);fs.writeFileSync(path.join(cohort,'recipient-prompt.txt'),launch.prompt);
 const source=path.join(cohort,'fixture');fs.mkdirSync(source);fs.mkdirSync(path.join(source,'evidence'));
 const bytes=Buffer.from([0,255,195,169]);fs.writeFileSync(path.join(source,'evidence/original.bin'),bytes);
 const trace=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Verbatim buyer report'}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n';fs.writeFileSync(path.join(source,'events.jsonl'),trace);
 const run={schema_version:6,cell:plan.cells[0],subject:plan.subject,freshness:plan.freshness,runtime:{state:'completed',exit_code:0,budget_stop:null},trace_sha256:hash(trace),retained_artifacts:{state:'complete',files:[{file:'evidence/original.bin',sha256:hash(bytes),bytes:bytes.length}]}};json(path.join(source,'run.json'),run);
 return {root,cohort,source,plan,run,protocol,context,bytes,clean(){for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}fs.rmSync(root,{recursive:true,force:true});}};
}
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
 assert.deepEqual(launch.budgets,f.plan.recipient.budgets);assert.equal(launch.prompt_sha256,f.protocol.prompt_sha256);assert.equal(manifest.prompt_sha256,f.protocol.prompt_sha256);assert.equal(manifest.files[0].supplied,true);assert.equal(manifest.citation_policy,'unclassified');assert.equal(manifest.files[0].cited_in_report,null);
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
