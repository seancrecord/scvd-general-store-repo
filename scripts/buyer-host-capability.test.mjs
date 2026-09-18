import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPublicKey, verify} from 'node:crypto';
import {validatePlan, buildPrompt, adapter, localToolsStatement, HOST_TOOLS, capabilityVectors, buildCapabilityPrompt, commandEvents, scoreCapability, scoreColdRun, hash} from './lib/buyer-cold.mjs';
import {runCapabilityProbe, runCohort, scoreCohort, childEnvironment} from './buyer-cold-isolated.mjs';
import {disabledCodexSkills} from './lib/buyer-host-context.mjs';

test('a proxied launch context passes its route and CA bundle, never an API key or token',()=>{
 assert.deepEqual(childEnvironment({PATH:'/bin',HTTPS_PROXY:'http://127.0.0.1:1',NODE_EXTRA_CA_CERTS:'/ca.crt',ANTHROPIC_API_KEY:'secret',CLAUDE_CODE_OAUTH_TOKEN:'secret',OPENAI_API_KEY:'secret',CLAUDE_CODE_SESSION_ID:'parent'}),{PATH:'/bin',HTTPS_PROXY:'http://127.0.0.1:1',NODE_EXTRA_CA_CERTS:'/ca.crt'});
});

const budgets={wall_ms:120000,tool_calls:20,output_bytes:4000000,output_tokens:2000,artifact_bytes:8*1024*1024,artifact_files:16};
const plan={schema_version:4,subject:'https://merchant.example/quote',spend_usdc:0,budgets,freshness:{max_age_ms:14*86400000},capability:{public_url:'https://www.rfc-editor.org/rfc/rfc8032.txt'},
 cells:[{id:'codex-catalogue',host:'codex',model:'gpt-5.6-luna',lane:'catalogue',entry:'https://registry.example/v0.1/servers',verification:'prompted'},
        {id:'claude-directed',host:'claude',model:'sonnet',lane:'directed',entry:'https://scvd.store/skill.md',verification:'prompted'}]};
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cold-capability-'));
const keyOf=hex=>createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(hex,'hex')])});

test('local skill inventory follows symlinks, includes system entries, and never edits metadata',()=>{
 const d=root();try{
  const skill=path.join(d,'.codex/skills/.system/a/SKILL.md');fs.mkdirSync(path.dirname(skill),{recursive:true});fs.writeFileSync(skill,'unaltered');
  const external=path.join(d,'external');fs.mkdirSync(external);fs.writeFileSync(path.join(external,'SKILL.md'),'external');
  fs.mkdirSync(path.join(d,'.agents/skills'),{recursive:true});fs.symlinkSync(external,path.join(d,'.agents/skills/linked'),'dir');fs.symlinkSync(d,path.join(external,'loop'),'dir');
  const paths=disabledCodexSkills(d,path.join(d,'no-admin'));
  assert.ok(paths.includes(skill));assert.ok(paths.includes(fs.realpathSync(path.join(external,'SKILL.md'))));
  assert.ok(paths.includes(path.join(d,'.agents/skills/linked/SKILL.md')));
  assert.equal(fs.readFileSync(skill,'utf8'),'unaltered');
  assert.equal(fs.readFileSync(path.join(external,'SKILL.md'),'utf8'),'external');
  assert.throws(()=>disabledCodexSkills('relative'),/absolute HOME/);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('Codex disables local skill entries per launch without changing the sandbox or prompt',()=>{
 const paths=['/tmp/skills/a/SKILL.md','/tmp/skills/space and "quote"/SKILL.md'];
 const args=adapter(plan.cells[0],'/tmp/neutral','/tmp/out',budgets,{codex:{disabled_skills:paths}}).args;
 const config=args.filter((_,i)=>args[i-1]==='-c');
 assert.ok(config.includes('skills.config=['+paths.map(p=>`{path=${JSON.stringify(p)},enabled=false}`).join(',')+']'));
 assert.equal(args[args.indexOf('--sandbox')+1],'workspace-write');
 assert.ok(args.some((v,i)=>v==='--disable'&&args[i+1]==='plugins'));
 assert.doesNotMatch(buildCapabilityPrompt(plan,'codex',capabilityVectors()),/SPKI|xxd|OpenSSL|decode.*hex/i);
});

test('qualification rejects a changed captured instrument before creating buyer output',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';
  const probe=path.join(d,'probe');await runCapabilityProbe(plan,probe);
  fs.appendFileSync(path.join(probe,'instrument/lib/buyer-cold.mjs'),'\n// changed after qualification\n');
  await assert.rejects(runCohort(plan,path.join(d,'buyers'),{capability:probe}),/instrument/i);
  assert.equal(fs.existsSync(path.join(d,'buyers')),false);
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

test('qualification rejects a new local skill after the probe before creating buyer output',async()=>{
 const d=root(),savedPath=process.env.PATH,savedHome=process.env.HOME;
 try{
  process.env.PATH='';process.env.HOME=path.join(d,'home');fs.mkdirSync(process.env.HOME);
  const probe=path.join(d,'probe');await runCapabilityProbe(plan,probe);
  const skill=path.join(process.env.HOME,'.agents/skills/new/SKILL.md');fs.mkdirSync(path.dirname(skill),{recursive:true});fs.writeFileSync(skill,'new metadata');
  await assert.rejects(runCohort(plan,path.join(d,'buyers'),{capability:probe}),/context|skill/i);
  assert.equal(fs.existsSync(path.join(d,'buyers')),false);
 }finally{process.env.PATH=savedPath;process.env.HOME=savedHome;fs.rmSync(d,{recursive:true,force:true});}
});

for(const change of ['manifest','rehashed snapshot','missing snapshot','CLI version','environment','missing binding'])test(`qualification rejects changed ${change}`,async()=>{
 const d=root(),savedPath=process.env.PATH,savedLang=process.env.LANG;
 try{
  process.env.PATH='';const probe=path.join(d,'probe');const capability=await runCapabilityProbe(plan,probe);
  const manifestPath=path.join(probe,'instrument.json'),contextPath=path.join(probe,'host-context.json');
  if(change==='manifest')fs.appendFileSync(manifestPath,' ');
  if(change==='rehashed snapshot'){
   const file=path.join(probe,'instrument/lib/buyer-cold.mjs');fs.appendFileSync(file,'\n// changed\n');
   const manifest=JSON.parse(fs.readFileSync(manifestPath));manifest.files['lib/buyer-cold.mjs']=hash(fs.readFileSync(file));fs.writeFileSync(manifestPath,JSON.stringify(manifest));capability.instrument_sha256=hash(fs.readFileSync(manifestPath));
  }
  if(change==='missing snapshot')fs.unlinkSync(path.join(probe,'instrument/lib/buyer-cold.mjs'));
  if(change==='CLI version'){
   const context=JSON.parse(fs.readFileSync(contextPath));context.versions.codex='different';fs.writeFileSync(contextPath,JSON.stringify(context,null,2)+'\n');capability.host_context_sha256=hash(fs.readFileSync(contextPath));
  }
  if(change==='environment')process.env.LANG='changed-after-probe';
  if(change==='missing binding')delete capability.instrument_sha256;
  fs.writeFileSync(path.join(probe,'capability.json'),JSON.stringify(capability));
  await assert.rejects(runCohort(plan,path.join(d,'buyers'),{capability:probe}),/instrument|context/i);
  assert.equal(fs.existsSync(path.join(d,'buyers')),false);
 }finally{process.env.PATH=savedPath;if(savedLang===undefined)delete process.env.LANG;else process.env.LANG=savedLang;fs.rmSync(d,{recursive:true,force:true});}
});

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
test('capability diagnostics retain each invocation instead of treating its first word as a tool-wide refusal',()=>{
 const f=probeFixture();try{
  const compound='curl -o ./evidence/public.bin https://example.org/ && shasum -a 256 ./evidence/public.bin';
  const standalone='curl -o ./evidence/public.bin https://example.org/';
  const trace=claudeTrace([[compound,'denied'],[standalone,'completed'],['node -e "verify"','completed']]);
  fs.writeFileSync(path.join(f.d,'events.jsonl'),trace);f.run.trace_sha256=hash(trace);
  const s=scoreCapability('claude',f.run,f.d,f.vectors,f.reference);
  assert.equal(s.state,'pass');
  assert.deepEqual(s.command_events,[
   {line:1,command:compound,outcome:'denied',program:'curl'},
   {line:3,command:standalone,outcome:'completed',program:'curl'},
   {line:5,command:'node -e "verify"',outcome:'completed',program:'node'},
  ]);
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
  const probe=path.join(d,'qualified');
  const qualified=await runCapabilityProbe(plan,probe);
  qualified.hosts={codex:{state:'fail'},claude:{state:'pass'}};
  fs.writeFileSync(path.join(probe,'capability.json'),JSON.stringify(qualified));
  const score=await runCohort(plan,path.join(d,'c'),{capability:probe});
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

const recipientProtocol={host:'codex',model:'gpt-5.6-luna',network:'disabled',attempts_per_eligible_cell:1,input_scope:'signed-pair-and-buyer-report',budgets:{wall_ms:180000,tool_calls:12,output_bytes:4194304,output_tokens:1800}};
const plan5={...plan,schema_version:5,recipient:recipientProtocol};
test('schema 5 freezes explicit recipient budgets and supplied scope before acquisition',()=>{
 assert.equal(validatePlan(plan5),plan5);
 for(const change of [undefined,{...recipientProtocol,budgets:undefined},{...recipientProtocol,network:'enabled'},{...recipientProtocol,input_scope:'everything'},{...recipientProtocol,attempts_per_eligible_cell:2},{...recipientProtocol,model:''},{...recipientProtocol,budgets:{...recipientProtocol.budgets,wall_ms:0}}])assert.throws(()=>validatePlan({...plan5,recipient:change}));
 // Old plans remain readable for their own records; they gain no new guarantees.
 assert.equal(validatePlan(plan),plan);
});
test('recipient prompt labels the supplied subset and adapter uses only frozen offline limits',async()=>{
 const {recipientLaunch}=await import('./lib/buyer-cold.mjs');
 const prepared=recipientLaunch(plan5,'/tmp/neutral','/tmp/review',{codex:{disabled_skills:[]}});
 assert.deepEqual(prepared.budgets,recipientProtocol.budgets);
 assert.ok(prepared.args.includes('sandbox_workspace_write.network_access=false'));
 assert.ok(prepared.args.includes('web_search="disabled"'));assert.ok(!prepared.args.includes('--search'));
 assert.match(prepared.prompt,/subset/);assert.match(prepared.prompt,/not supplied does not mean not retained/);
 assert.match(prepared.prompt,/12 tool calls/);assert.match(prepared.prompt,/180 seconds/);
 assert.ok(prepared.prompt.includes(String(recipientProtocol.budgets.output_tokens)));
 for(const file of prepared.inputs)assert.ok(prepared.prompt.includes(file));
 assert.throws(()=>recipientLaunch(plan,'/tmp/n','/tmp/o',{codex:{disabled_skills:[]}}),/recipient|Schema 5/i);
});

test('schema 5 freezes recipient scope and exact prompt before any buyer can run',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';const probe=path.join(d,'probe'),cohort=path.join(d,'cohort');
  await runCapabilityProbe(plan5,probe);await runCohort(plan5,cohort,{capability:probe});
  const frozen=JSON.parse(fs.readFileSync(path.join(cohort,'recipient-protocol.json')));
  assert.deepEqual(frozen.budgets,recipientProtocol.budgets);
  assert.equal(frozen.prompt_sha256,hash(fs.readFileSync(path.join(cohort,'recipient-prompt.txt'))));
  assert.equal(frozen.input_scope,recipientProtocol.input_scope);
  assert.equal(frozen.timing_policy.sample_interval_ms,1000);
  const {recipientLaunch}=await import('./lib/buyer-cold.mjs');
  const launch=recipientLaunch(plan5,'/tmp/n','/tmp/o',{codex:{disabled_skills:[]}});
  assert.equal(frozen.protocol_sha256,launch.protocol_sha256);assert.equal(frozen.prompt_sha256,hash(launch.prompt));
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});
test('a Claude-only buyer plan still freezes the offline Codex recipient context',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';const selected={...plan5,cells:[plan5.cells[1]]};
  const probe=path.join(d,'probe'),cohort=path.join(d,'cohort');
  const result=await runCapabilityProbe(selected,probe);assert.deepEqual(Object.keys(result.hosts),['claude']);
  const context=JSON.parse(fs.readFileSync(path.join(probe,'host-context.json')));assert.ok(Array.isArray(context.codex.disabled_skills));
  await runCohort(selected,cohort,{capability:probe});assert.ok(fs.existsSync(path.join(cohort,'recipient-protocol.json')));
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

test('live CLI rejects a legacy plan before launching hosts while dry runs remain available',()=>{
 const d=root();try{
  const file=path.join(d,'plan.json'),out=path.join(d,'out');fs.writeFileSync(file,JSON.stringify(plan));
  const args=['scripts/buyer-cold-isolated.mjs','--plan',file,'--out',out];
  const live=spawnSync(process.execPath,[...args,'--run'],{encoding:'utf8'});
  assert.equal(live.status,1);assert.match(live.stderr,/schema 5/);assert.equal(fs.existsSync(out),false);
  const dry=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(dry.status,0);assert.equal(JSON.parse(dry.stdout).execution,'dry_run');
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('schema 5 dry run exposes the recipient prompt and limits without creating an acquisition',()=>{
 const d=root();try{
  const file=path.join(d,'plan.json'),out=path.join(d,'out');fs.writeFileSync(file,JSON.stringify(plan5));
  const result=spawnSync(process.execPath,['scripts/buyer-cold-isolated.mjs','--plan',file,'--out',out],{encoding:'utf8'});
  assert.equal(result.status,0);const preview=JSON.parse(result.stdout);
  assert.deepEqual(preview.recipient.protocol,recipientProtocol);assert.match(preview.recipient.prompt,/not supplied does not mean not retained/);
  assert.equal(fs.existsSync(out),false);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
