import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPublicKey, verify} from 'node:crypto';
import {validatePlan, buildPrompt, adapter, localToolsStatement, HOST_TOOLS, capabilityVectors, buildCapabilityPrompt, commandEvents, scoreCapability, scoreColdRun, hash} from './lib/buyer-cold.mjs';
import {runCapabilityProbe, runCohort, scoreCohort, childEnvironment} from './buyer-cold-isolated.mjs';

test('a proxied launch context passes its route and CA bundle, never an API key or token',()=>{
 assert.deepEqual(childEnvironment({PATH:'/bin',HTTPS_PROXY:'http://127.0.0.1:1',NODE_EXTRA_CA_CERTS:'/ca.crt',ANTHROPIC_API_KEY:'secret',CLAUDE_CODE_OAUTH_TOKEN:'secret',OPENAI_API_KEY:'secret',CLAUDE_CODE_SESSION_ID:'parent'}),{PATH:'/bin',HTTPS_PROXY:'http://127.0.0.1:1',NODE_EXTRA_CA_CERTS:'/ca.crt'});
});

const budgets={wall_ms:120000,tool_calls:20,output_bytes:4000000,output_tokens:2000,artifact_bytes:8*1024*1024,artifact_files:16};
const plan={schema_version:4,subject:'https://merchant.example/quote',spend_usdc:0,budgets,freshness:{max_age_ms:14*86400000},capability:{public_url:'https://www.rfc-editor.org/rfc/rfc8032.txt'},
 cells:[{id:'codex-catalogue',host:'codex',model:'gpt-5.6-luna',lane:'catalogue',entry:'https://registry.example/v0.1/servers',verification:'prompted'},
        {id:'claude-directed',host:'claude',model:'sonnet',lane:'directed',entry:'https://scvd.store/skill.md',verification:'prompted'}]};
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cold-capability-'));
const keyOf=hex=>createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(hex,'hex')])});

test('schema 4 freezes a generic public capability URL and refuses one naming the store',()=>{
 assert.equal(validatePlan(plan).schema_version,4);
 for(const broken of [{...plan,capability:undefined},{...plan,capability:{public_url:'https://scvd.store/.well-known/scvd-signing-key'}},{...plan,capability:{public_url:'http://example.com/x'}}])assert.throws(()=>validatePlan(broken));
});

test('the prompt states the local tools the adapter actually allows, derived from one list',()=>{
 const claude=buildPrompt(plan,plan.cells[1]);
 const allowed=adapter(plan.cells[1],'/tmp/neutral','/tmp/out',budgets).args;
 for(const command of HOST_TOOLS.claude.commands){assert.match(claude,new RegExp(`\\b${command}\\b`));assert.ok(allowed.some(a=>a.includes(`Bash(${command} *)`)));}
 assert.match(claude,/refus/i);
 assert.match(buildPrompt(plan,plan.cells[0]),/workspace-write/);
 assert.doesNotMatch(localToolsStatement('claude')+localToolsStatement('codex'),/scvd/i);
 assert.doesNotMatch(buildPrompt(plan,{...plan.cells[0],lane:'intent_search',entry:null}),/scvd|preflight_endpoint|check_conformance/i);
 assert.doesNotMatch(buildPrompt({...plan,schema_version:3},plan.cells[1]),/first word/);
});

test('catalogue cells are told to retain the returned candidates and name the selection',()=>{
 const p=buildPrompt(plan,plan.cells[0]);
 assert.match(p,/candidate list/);assert.match(p,/\.\/evidence/);assert.match(p,/selected/);
 assert.doesNotMatch(buildPrompt(plan,{...plan.cells[0],lane:'intent_search',entry:null}),/candidate list/);
});

test('capability vectors mix valid and tampered signatures and never name a service',()=>{
 const v=capabilityVectors();
 const states=Object.values(v.truth);
 assert.ok(states.includes(true)&&states.includes(false));
 for(const {id,message,signature} of v.signatures)assert.equal(verify(null,Buffer.from(message),keyOf(v.public_key),Buffer.from(signature,'hex')),v.truth[id]);
 assert.equal(new Set(v.signatures.map(s=>s.signature)).size,4,'every vector is distinct bytes');
 assert.equal(new Set(v.signatures.map(s=>s.message)).size,4);
 const p=buildCapabilityPrompt(plan,'claude',v);
 assert.doesNotMatch(p,/scvd|preflight|x402/i);
 assert.match(p,/public\.bin/);assert.match(p,/capability\.json/);assert.match(p,new RegExp(v.public_key));
 assert.doesNotMatch(p,/truth/);
});

const claudeTrace=(commands)=>commands.map(([command,outcome],i)=>[
 JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:`t${i}`,name:'Bash',input:{command}}]}}),
 JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:`t${i}`,is_error:outcome!=='completed',content:outcome==='denied'?'Permission to use Bash with command '+command+' has been denied.':outcome==='failed'?'exit 1':'ok'}]}})
].join('\n')).join('\n')+'\n'+JSON.stringify({type:'result',is_error:false,usage:{output_tokens:5}})+'\n';

test('trace command events separate completed, refused and failed local commands on both hosts',()=>{
 const c=commandEvents('claude',claudeTrace([['curl -o ./evidence/public.bin https://example.org/','completed'],['python3 -c "print(1)"','denied'],['node -e "process.exit(1)"','failed']]));
 assert.deepEqual(c.map(x=>[x.program,x.outcome]),[['curl','completed'],['python3','denied'],['node','failed']]);
 const codex=[JSON.stringify({type:'item.completed',item:{id:'c1',type:'command_execution',command:'node -e "1"',exit_code:0,status:'completed'}}),JSON.stringify({type:'item.completed',item:{id:'c2',type:'command_execution',command:'rm -rf /',exit_code:null,status:'declined'}})].join('\n');
 assert.deepEqual(commandEvents('codex',codex).map(x=>[x.program,x.outcome]),[['node','completed'],['rm','denied']]);
});

function probeFixture(){
 const d=root();const vectors=capabilityVectors();const reference=Buffer.from('public bytes '.repeat(100));
 fs.mkdirSync(path.join(d,'evidence'));
 fs.writeFileSync(path.join(d,'evidence','public.bin'),reference);
 const report={fetched_sha256:hash(reference),signatures:{...vectors.truth},commands_denied:['python3']};
 fs.writeFileSync(path.join(d,'evidence','capability.json'),JSON.stringify(report));
 const trace=claudeTrace([['curl -o ./evidence/public.bin https://www.rfc-editor.org/rfc/rfc8032.txt','completed'],['python3 -c "x"','denied'],['node -e "verify"','completed']]);
 fs.writeFileSync(path.join(d,'events.jsonl'),trace);
 const files=['public.bin','capability.json'].map(f=>({file:`evidence/${f}`,bytes:fs.statSync(path.join(d,'evidence',f)).size,sha256:hash(fs.readFileSync(path.join(d,'evidence',f)))}));
 const run={schema_version:4,host:'claude',runtime:{state:'completed',exit_code:0,budget_stop:null},trace_sha256:hash(trace),retained_artifacts:{state:'complete',files}};
 return {d,vectors,run,report,reference:{sha256:hash(reference),bytes:reference.length},rewrite(){const bytes=JSON.stringify(this.report);fs.writeFileSync(path.join(d,'evidence','capability.json'),bytes);files[1].sha256=hash(bytes);files[1].bytes=bytes.length;},cleanup:()=>fs.rmSync(d,{recursive:true,force:true})};
}

test('a host that retained exact bytes and ran a correct local check passes, with refusals recorded',()=>{
 const f=probeFixture();try{
  const s=scoreCapability('claude',f.run,f.d,f.vectors,f.reference);
  assert.equal(s.state,'pass');assert.equal(s.retention.state,'pass');assert.equal(s.local_check.state,'pass');
  assert.deepEqual(s.commands.denied,['python3']);assert.ok(s.commands.executed.includes('node'));
 }finally{f.cleanup();}
});
for(const [name,mutate,field,state] of [
 ['changed retained bytes',f=>{fs.writeFileSync(path.join(f.d,'evidence','public.bin'),'other');f.run.retained_artifacts.files[0].sha256=hash('other');},'retention','fail'],
 ['no retained public bytes',f=>{f.run.retained_artifacts.files.splice(0,1);},'retention','incomplete'],
 ['no runner reference',f=>{f.reference={state:'unavailable'};},'retention','incomplete'],
 ['wrong reported signature results',f=>{const id=Object.keys(f.report.signatures)[0];f.report.signatures[id]=!f.report.signatures[id];f.rewrite();},'local_check','fail'],
 ['missing capability report',f=>{f.run.retained_artifacts.files.splice(1,1);},'local_check','incomplete'],
 ['a report with no completed local command behind it',f=>{const t=claudeTrace([['python3 -c "x"','denied']]);fs.writeFileSync(path.join(f.d,'events.jsonl'),t);f.run.trace_sha256=hash(t);},'local_check','incomplete'],
])test(`capability probe refuses ${name}`,()=>{const f=probeFixture();try{mutate(f);const s=scoreCapability('claude',f.run,f.d,f.vectors,f.reference);assert.equal(s[field].state,state);assert.notEqual(s.state,'pass');}finally{f.cleanup();}});
test('a capped or failed probe process cannot pass even with good files',()=>{const f=probeFixture();try{f.run.runtime={state:'failed',exit_code:null,budget_stop:'tool_calls'};assert.equal(scoreCapability('claude',f.run,f.d,f.vectors,f.reference).state,'incomplete');}finally{f.cleanup();}});

test('probe dry path records unavailable hosts without fetching or launching anything',async()=>{
 const d=root(),savedPath=process.env.PATH,oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('no network permitted');};
 try{process.env.PATH='';const out=path.join(d,'probe');const summary=await runCapabilityProbe(plan,out);
  assert.deepEqual(Object.keys(summary.hosts).sort(),['claude','codex']);
  for(const h of ['codex','claude']){assert.equal(summary.hosts[h].state,'unavailable');assert.ok(fs.existsSync(path.join(out,h,'prompt.txt')));assert.ok(fs.existsSync(path.join(out,h,'vectors.json')));}
  const manifest=JSON.parse(fs.readFileSync(path.join(out,'instrument.json'),'utf8'));
  for(const [file,digest] of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(out,'instrument',file))),digest);
  assert.equal(summary.plan_sha256,hash(fs.readFileSync(path.join(out,'plan.json'))));
 }finally{globalThis.fetch=oldFetch;if(savedPath===undefined)delete process.env.PATH;else process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

test('a schema 4 acquisition refuses to start without a passed probe for the same frozen plan',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{process.env.PATH='';
  await assert.rejects(runCohort(plan,path.join(d,'a')),/capability/i);
  fs.mkdirSync(path.join(d,'probe'));fs.writeFileSync(path.join(d,'probe','capability.json'),JSON.stringify({schema_version:1,plan_sha256:'00'.repeat(32),hosts:{codex:{state:'pass'},claude:{state:'pass'}}}));
  await assert.rejects(runCohort(plan,path.join(d,'b'),{capability:path.join(d,'probe')}),/different plan/i);
  const planBytes=JSON.stringify(plan,null,2)+'\n';
  fs.writeFileSync(path.join(d,'probe','capability.json'),JSON.stringify({schema_version:1,plan_sha256:hash(planBytes),hosts:{codex:{state:'fail'},claude:{state:'pass'}}}));
  const score=await runCohort(plan,path.join(d,'c'),{capability:path.join(d,'probe')});
  const codex=JSON.parse(fs.readFileSync(path.join(d,'c','codex-catalogue','run.json'),'utf8'));
  assert.equal(codex.runtime.state,'capability_unqualified');
  const claude=JSON.parse(fs.readFileSync(path.join(d,'c','claude-directed','run.json'),'utf8'));
  assert.equal(claude.runtime.state,'unavailable');
  assert.equal(score.capability.hosts.codex.state,'fail');
  assert.equal(score.discovery.incomplete,1);
  assert.equal((await scoreCohort(path.join(d,'c'))).capability.hosts.claude.state,'pass');
 }finally{if(savedPath===undefined)delete process.env.PATH;else process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

function catalogueFixture(){
 const d=root();const save=(file,value)=>{const bytes=typeof value==='string'?value:JSON.stringify(value);fs.writeFileSync(path.join(d,file),bytes);return{file,sha256:hash(bytes)};};
 fs.mkdirSync(path.join(d,'evidence'));
 const events=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Queried the catalogue, selected a service, used it'}})+'\n';fs.writeFileSync(path.join(d,'events.jsonl'),events);const ref={file:'events.jsonl',sha256:hash(events)};
 const candidates=save('evidence/candidates.json',{servers:[{name:'store.scvd/general-store'},{name:'com.other/thing'}]});
 const stages=Object.fromEntries(['discover','connect','check','decide','obtain','verify'].map(k=>[k,{state:k==='discover'||k==='connect'||k==='check'||k==='decide'?'pass':'not_applicable',reason:'fixture',evidence:[ref]}]));
 const review={schema_version:2,reviewer:'fixture reviewer',reviewed_at:'2026-09-17T12:00:00Z',transcript_sha256:hash(events),isolation:{state:'clean',reason:'fixture',evidence:[ref]},stages,
  discovery:{query:'x402 verification',result_url:'https://registry.example/v0.1/servers?search=x402',selected_origin:'https://scvd.store',catalogue:{entry:'https://registry.example/v0.1/servers?search=x402',query:'x402',returned:2,candidates,selected:'store.scvd/general-store',scvd_returned:true}},
  observation:{subject:plan.subject,observed_at:'2026-09-17T11:00:00Z',stale_after:'2026-09-18T11:00:00Z'},payment:{state:'not_needed',reason:'fixture'}};
 const run={schema_version:4,cell:plan.cells[0],subject:plan.subject,freshness:plan.freshness,ended_at:'2026-09-17T12:00:00Z',runtime:{state:'completed',exit_code:0},trace_sha256:hash(events),isolation:{fresh_directory:true,config_isolated:true,no_session_resume:true},retained_artifacts:{state:'complete',files:[{...candidates,bytes:1}]}};
 return {d,save,review,run,candidates,cleanup:()=>fs.rmSync(d,{recursive:true,force:true})};
}
test('catalogue discovery passes only with the retained candidate list, query and selection',async()=>{
 const f=catalogueFixture();try{
  const r=await scoreColdRun(f.run,f.review,f.d);
  assert.equal(r.stages.discover.state,'pass');assert.equal(r.catalogue_observation.state,'found');assert.equal(r.catalogue_observation.complete,false);assert.equal(r.catalogue_absence,'unverified');
 }finally{f.cleanup();}
});
for(const [name,mutate,observation] of [
 ['no catalogue block',f=>{delete f.review.discovery.catalogue;},'unchecked'],
 ['candidates fetched after the run',f=>{f.run.retained_artifacts.files=[];},'unchecked'],
 ['candidates changed',f=>{fs.writeFileSync(path.join(f.d,'evidence/candidates.json'),'{}');},'unchecked'],
 ['no selected candidate',f=>{delete f.review.discovery.catalogue.selected;},'found'],
 ['entry on another origin',f=>{f.review.discovery.catalogue.entry='https://elsewhere.example/';},'unchecked'],
])test(`catalogue discovery is incomplete with ${name}`,async()=>{const f=catalogueFixture();try{mutate(f);const r=await scoreColdRun(f.run,f.review,f.d);assert.equal(r.stages.discover.state,'incomplete');assert.equal(r.catalogue_observation.state,observation);}finally{f.cleanup();}});
test('a catalogue miss retains the bounded not-returned observation without claiming absence',async()=>{
 const f=catalogueFixture();try{f.review.stages.discover.state='fail';f.review.discovery.selected_origin='https://merchant.example';f.review.discovery.catalogue.scvd_returned=false;f.review.discovery.catalogue.selected='com.other/thing';
  const r=await scoreColdRun(f.run,f.review,f.d);
  assert.equal(r.stages.discover.state,'fail');assert.equal(r.catalogue_observation.state,'not_returned');assert.equal(r.catalogue_absence,'unverified');assert.equal(r.catalogue_observation.search_basis,'buyer-query-v1');
 }finally{f.cleanup();}
});
