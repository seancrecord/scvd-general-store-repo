import test from 'node:test';
import {packageReportFixture,scorePackageReport,packageInstallCommand,packageReportCommand,packageReviewSources,packageInspectionCommand,literalCommandMatches} from './lib/buyer-package-access.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPublicKey, verify} from 'node:crypto';
import {validatePlan, buildPrompt, adapter, recipientLaunch, localToolsStatement, HOST_TOOLS, capabilityVectors, buildCapabilityPrompt, commandEvents, scoreCapability, scoreColdRun, hash} from './lib/buyer-cold.mjs';
import {runCapabilityProbe, runCohort, scoreCohort, childEnvironment, runChild} from './buyer-cold-isolated.mjs';
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

test('both online qualification prompts require reports from computed results',()=>{
 for(const host of ['codex','claude']){
  const prompt=buildCapabilityPrompt(plan,host,capabilityVectors());
  assert.match(prompt,/serialize.*computed.*results/i);
  assert.match(prompt,/do not.*transcribe.*boolean/i);
  assert.match(prompt,/final.*saved report/i);
  assert.match(prompt,/cannot complete.*report.*incomplete/i);
  assert.match(prompt,/operational errors.*invalid signatures/i);
  assert.match(prompt,/nonzero exit.*not.*signature/i);
  assert.match(prompt,/retain.*stderr.*exit.*exception/i);
  assert.match(prompt,/leave.*capability\.json.*unwritten.*incomplete/i);
 }
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

test('a completed verifier cannot excuse a report that marks a tampered vector valid',()=>{
 const f=probeFixture();try{
  const id=Object.keys(f.vectors.truth).find(id=>!f.vectors.truth[id]);
  // Reproduce the observed failure: correct tool output, then a false saved bit.
  const trace=claudeTrace([['node verify','completed']]).replace('content":"ok"',`content":${JSON.stringify(JSON.stringify(f.vectors.truth))}`);
  fs.writeFileSync(path.join(f.d,'events.jsonl'),trace);f.run.trace_sha256=hash(trace);
  f.report.signatures[id]=true;f.rewrite();
  const score=scoreCapability('claude',f.run,f.d,f.vectors,f.reference);
  assert.equal(score.retention.state,'pass');assert.equal(score.local_check.report_matches_retained,true);
  assert.equal(score.local_check.expected[id],false);assert.equal(score.local_check.reported[id],true);
  assert.equal(score.state,'fail');
 }finally{f.cleanup();}
});

test('a successful wrapper that converts verifier errors to all-false results still fails qualification',()=>{
 const f=probeFixture();try{
  // The native wrapper completed despite unsupported verifier arguments.
  const trace=claudeTrace([['node verification-wrapper','completed']]);
  fs.writeFileSync(path.join(f.d,'events.jsonl'),trace);f.run.trace_sha256=hash(trace);
  f.report.signatures=Object.fromEntries(Object.keys(f.vectors.truth).map(id=>[id,false]));f.rewrite();
  const score=scoreCapability('claude',f.run,f.d,f.vectors,f.reference);
  assert.equal(score.retention.state,'pass');assert.equal(score.local_check.report_matches_retained,true);
  assert.ok(Object.values(score.local_check.expected).some(Boolean));
  assert.equal(score.local_check.state,'fail');assert.equal(score.state,'fail');
 }finally{f.cleanup();}
});

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

test('the full-inventory recipient prompt is frozen before acquisition and remains offline',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';const full={...plan5,recipient:{...recipientProtocol,input_scope:'all-retained-and-buyer-report'}};
  const probe=path.join(d,'probe'),cohort=path.join(d,'cohort');
  await runCapabilityProbe(full,probe);await runCohort(full,cohort,{capability:probe});
  const frozen=JSON.parse(fs.readFileSync(path.join(cohort,'recipient-protocol.json')));
  const {recipientLaunch}=await import('./lib/buyer-cold.mjs');
  const launch=recipientLaunch(full,'/tmp/recipient','/tmp/output',{codex:{disabled_skills:[]}});
  assert.equal(frozen.prompt_sha256,hash(launch.prompt));assert.equal(fs.readFileSync(path.join(cohort,'recipient-prompt.txt'),'utf8'),launch.prompt);
  assert.ok(launch.inputs.includes('input-manifest.json'));assert.ok(launch.inputs.includes('artifacts/'));
  assert.ok(launch.args.includes('sandbox_workspace_write.network_access=false'));assert.ok(launch.args.includes('web_search="disabled"'));assert.ok(!launch.args.includes('--search'));
  assert.deepEqual(launch.budgets,recipientProtocol.budgets);
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

function packagePlan(){
 const p=JSON.parse(fs.readFileSync(new URL('../research/generated-report-buyer-2026-09-28/plan.json',import.meta.url)));
 p.package_access=true;return p;
}
test('directed package access declares one script-disabled pinned installation in prompt and Claude allowlist',()=>{
 const p=packagePlan();const c=p.cells.find(c=>c.host==='claude');
 const command=`npm install --ignore-scripts --no-audit --no-fund --prefix ./work/tooling --cache ./work/npm-cache --registry https://registry.npmjs.org ${p.recipient.verifier.name}@${p.recipient.verifier.version}`;
 assert.ok(buildPrompt(p,c).includes(command));
 const args=adapter(c,'/tmp/neutral','/tmp/out',p.budgets,undefined,p).args;
 assert.ok(args[args.indexOf('--allowedTools')+1].includes(`Bash(${command})`));
 assert.ok(!args[args.indexOf('--allowedTools')+1].includes('Bash(npm *)'));
});
test('package access refuses unbranded lanes, missing report runtime and nonboolean opt-ins',()=>{
 for(const mutate of [p=>p.cells[0].lane='catalogue',p=>delete p.recipient.verifier,p=>p.package_access='yes']){
  const p=packagePlan();mutate(p);assert.throws(()=>validatePlan(p),/package|directed|report/i);
 }
});
test('package-qualified capability asks for an actual installed report and original runtime bytes',()=>{
 const p=packagePlan();const text=buildCapabilityPrompt(p,'claude',capabilityVectors(),packageReportFixture());
 assert.match(text,/installed-report\.md/);assert.match(text,/evidence\/installed/);
});

function installedReportFixture(){
 const p=packagePlan(),d=root(),fixture=packageReportFixture();
 const install=path.join(d,'evidence/installed');fs.mkdirSync(install,{recursive:true});
 for(const file of Object.keys(p.recipient.verifier.files))fs.copyFileSync(new URL('../verifier/'+file,import.meta.url),path.join(install,file));
 fs.writeFileSync(path.join(d,'evidence/report-original.json'),JSON.stringify(fixture.original));
 const result=spawnSync(process.execPath,[path.join(install,'evidence-cli.mjs'),'verify-source',path.join(d,'evidence/report-original.json'),'--public-key',fixture.original.public_key,'--subject',fixture.subject,'--format','markdown','--report-out',path.join(d,'evidence/installed-report.md')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const files=[];const walk=dir=>{for(const f of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory())walk(full);else files.push({file:path.relative(d,full),sha256:hash(fs.readFileSync(full))});}};walk(path.join(d,'evidence'));
 return {p,d,fixture,run:{retained_artifacts:{state:'complete',files}},commands:[{command:packageInstallCommand(p),outcome:'completed'},{command:packageReportCommand(p,fixture),outcome:'completed'}],cleanup:()=>fs.rmSync(d,{recursive:true,force:true})};
}
test('installed report qualification independently reproduces the fixture and every pinned module',()=>{
 const f=installedReportFixture();try{
  const result=scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands);assert.equal(result.state,'pass',result.reason);
  assert.equal(result.version,f.p.recipient.verifier.version);
 }finally{f.cleanup();}
});
for(const [name,mutate] of [
 ['missing installation event',f=>f.commands=[]],
 ['incomplete capture',f=>f.run.retained_artifacts.state='incomplete'],
 ['refused installation',f=>f.commands[0].outcome='denied'],
 ['missing CLI execution',f=>f.commands.pop()],
 ['echoed installation text',f=>f.commands[0].command='echo '+f.commands[0].command],
 ['compound installation',f=>f.commands[0].command+=' && echo done'],
 ['missing report',f=>f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(x=>!x.file.endsWith('installed-report.md'))],
 ['missing runtime module',f=>f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(x=>!x.file.endsWith('payment-identity.js'))],
 ['rehashed forged report',f=>{const row=f.run.retained_artifacts.files.find(x=>x.file.endsWith('installed-report.md'));fs.writeFileSync(path.join(f.d,row.file),'valid: true');row.sha256=hash(Buffer.from('valid: true'));}],
 ['rehashed changed runtime',f=>{const row=f.run.retained_artifacts.files.find(x=>x.file.endsWith('evidence-report.js'));fs.appendFileSync(path.join(f.d,row.file),'\n// changed');row.sha256=hash(fs.readFileSync(path.join(f.d,row.file)));}],
 ['another fixture',f=>f.fixture=packageReportFixture()],
])test(`installed report qualification refuses ${name}`,()=>{
 const f=installedReportFixture();try{mutate(f);assert.notEqual(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'pass');}finally{f.cleanup();}
});
test('generic capability success cannot substitute for required installed-report qualification',()=>{
 const f=probeFixture();try{
  const score=scoreCapability('claude',f.run,f.d,f.vectors,f.reference,packagePlan(),packageReportFixture());
  assert.equal(score.local_check.state,'pass');assert.equal(score.package_report.state,'incomplete');assert.equal(score.state,'incomplete');
 }finally{f.cleanup();}
});

test('source review requires an explicit package plan and immutable source commit',()=>{
 for(const review of [true,{}, {source_commit:'main'}, {source_commit:'a'.repeat(40),extra:true}]){
  assert.throws(()=>validatePlan({...packagePlan(),package_review:review}),/review|commit/i);
 }
 const p=packagePlan();delete p.package_access;p.package_review={source_commit:'a'.repeat(40)};
 assert.throws(()=>validatePlan(p),/review|package/i);
});
test('source-review opt-in cannot pass on installation and a generated report alone',()=>{
 const f=installedReportFixture();try{
  f.p.package_review={source_commit:'a'.repeat(40)};
  assert.notEqual(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'pass');
 }finally{f.cleanup();}
});
test('source-review prompt offers inspection and an explicit decision before installation',()=>{
 const p=packagePlan();p.package_review={source_commit:'a'.repeat(40)};
 const text=buildCapabilityPrompt(p,'claude',capabilityVectors(),packageReportFixture());
 assert.match(text,/package-review\.json/);assert.match(text,/decline/);assert.match(text,/before.*install/i);
 assert.match(text,/raw\.githubusercontent\.com.*a{40}/);
 assert.doesNotMatch(buildPrompt(packagePlan(),p.cells[0]),/package-review\.json/);
});

function reviewedReportFixture(){
 const f=installedReportFixture();f.p.package_review={source_commit:'a'.repeat(40)};
 f.retain=(file,data)=>{
  const p=path.join(f.d,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);
  f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(r=>r.file!==file);
  f.run.retained_artifacts.files.push({file,sha256:hash(fs.readFileSync(p))});
 };
 for(const row of packageReviewSources(f.p))f.retain(row.file,fs.readFileSync(new URL('../verifier/'+path.basename(row.file),import.meta.url)));
 f.retain('evidence/package-review.json',JSON.stringify({decision:'proceed',reason:'Reviewed source as text; remaining trust in the runtime and controller pin is explicit.'}));
 f.commands.unshift({command:packageInspectionCommand(f.p),outcome:'completed'});return f;
}
test('source inspection runs as data only and preserves complete pinned bytes',()=>{
 const f=reviewedReportFixture();try{
  const result=spawnSync('/bin/sh',['-c',packageInspectionCommand(f.p)],{cwd:f.d,encoding:'utf8',maxBuffer:f.p.budgets.output_bytes});
  assert.equal(result.status,0,result.stderr);
  for(const row of packageReviewSources(f.p))assert.ok(result.stdout.includes(fs.readFileSync(path.join(f.d,row.file),'utf8')));
  assert.equal(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'pass');
  fs.appendFileSync(path.join(f.d,'evidence/source/evidence-cli.mjs'),'\nthrow Error("must never execute");');
  const bad=spawnSync('/bin/sh',['-c',packageInspectionCommand(f.p)],{cwd:f.d,encoding:'utf8'});
  assert.notEqual(bad.status,0);assert.match(bad.stderr,/source hash mismatch/);assert.equal(bad.stdout,'');
 }finally{f.cleanup();}
});
for(const [name,mutate] of [
 ['missing source',f=>f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(r=>!r.file.endsWith('source/payment-identity.js'))],
 ['rehashed changed source',f=>f.retain('evidence/source/evidence-report.js','different bytes')],
 ['missing decision',f=>f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(r=>!r.file.endsWith('package-review.json'))],
 ['empty reason',f=>f.retain('evidence/package-review.json','{"decision":"proceed","reason":""}')],
 ['missing inspection',f=>f.commands.shift()],
 ['denied inspection',f=>f.commands[0].outcome='denied'],
 ['inspection after install',f=>f.commands.push(f.commands.shift())],
 ['echoed inspection',f=>f.commands[0].command='echo '+f.commands[0].command],
])test(`source-review gate refuses ${name}`,()=>{
 const f=reviewedReportFixture();try{mutate(f);assert.equal(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'incomplete');}finally{f.cleanup();}
});
test('a declined source review is retained without inventing a command denial or qualification pass',()=>{
 const f=reviewedReportFixture();try{
  f.retain('evidence/package-review.json','{"decision":"decline","reason":"I do not want to inspect or execute this package."}');f.commands=[];
  f.run.retained_artifacts.files=f.run.retained_artifacts.files.filter(r=>r.file==='evidence/package-review.json');
  const result=scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands);
  assert.equal(result.state,'incomplete');assert.equal(result.source_review.decision,'decline');
  assert.equal(result.source_review.inspection,'not_established');assert.equal(result.source_review.package_attempt_observed,false);
  assert.match(result.reason,/voluntary.*not a tool permission denial/);
  f.commands=[{command:packageInstallCommand(f.p),outcome:'completed'}];
  assert.match(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).reason,/conflicts/);
 }finally{f.cleanup();}
});
test('source review preserves the same narrow permissions and offline recipient',()=>{
 const p=packagePlan(),c=p.cells.find(c=>c.host==='claude');
 const old=adapter(c,'/tmp/neutral','/tmp/out',p.budgets,undefined,p);
 p.package_review={source_commit:'a'.repeat(40)};
 assert.deepEqual(adapter(c,'/tmp/neutral','/tmp/out',p.budgets,undefined,p),old);
 const prompt=buildPrompt(p,c);assert.match(prompt,/untrusted text/);assert.match(prompt,/not a safety audit/);
 for(const row of packageReviewSources(p)){assert.ok(prompt.includes(row.url));assert.equal(row.sha256,p.recipient.verifier.files[path.basename(row.file)]);}
});
test('source inspection accepts real quoted shell wrappers but not a compound command',()=>{
 const f=reviewedReportFixture();try{
  const cmd=packageInspectionCommand(f.p);
  for(const quote of [s=>JSON.stringify(s),s=>"'"+s.replaceAll("'","'\"'\"'")+"'"]){
   const wrapped='/bin/sh -lc '+quote(cmd);
   const run=spawnSync('/bin/sh',['-c',wrapped],{cwd:f.d,encoding:'utf8',maxBuffer:f.p.budgets.output_bytes});
   assert.equal(run.status,0,run.stderr);
   f.commands[0].command=wrapped;
   assert.equal(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'pass');
  }
  f.commands[0].command=cmd+' && echo inspected';
  assert.equal(scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands).state,'incomplete');
 }finally{f.cleanup();}
});
test('inspection never executes even hash-matching code and refuses escaped or oversized files',()=>{
 const f=reviewedReportFixture(),outside=root();try{
  const file='evidence/source/payment-identity.js';const malicious='require("node:fs").writeFileSync("executed-marker", "unexpected")';
  f.retain(file,malicious);f.p.recipient.verifier.files['payment-identity.js']=hash(Buffer.from(malicious));
  const inspect=()=>spawnSync('/bin/sh',['-c',packageInspectionCommand(f.p)],{cwd:f.d,encoding:'utf8',maxBuffer:f.p.budgets.output_bytes});
  assert.equal(inspect().status,0);assert.equal(fs.existsSync(path.join(f.d,'executed-marker')),false);
  fs.writeFileSync(path.join(outside,'source'),malicious);fs.unlinkSync(path.join(f.d,file));fs.symlinkSync(path.join(outside,'source'),path.join(f.d,file));
  const escaped=inspect();assert.notEqual(escaped.status,0);assert.match(escaped.stderr,/source escaped workspace/);
  f.p.budgets.artifact_bytes=1;
  const bounded=inspect();assert.notEqual(bounded.status,0);assert.match(bounded.stderr,/source exceeds read bound/);
 }finally{f.cleanup();fs.rmSync(outside,{recursive:true,force:true});}
});
test('source inspection recognizes the retained native mixed-quote wrapper',()=>{
 const observed=JSON.parse(fs.readFileSync(new URL('./fixtures/buyer-source-review-command.json',import.meta.url)));
 const f=reviewedReportFixture();try{
  f.p.package_review.source_commit=observed.source_commit;
  assert.equal(packageInspectionCommand(f.p),observed.expected);
  f.commands[0].command=observed.actual;
  const result=scorePackageReport(f.p,f.run,f.d,f.fixture,f.commands);
  assert.equal(result.state,'pass',result.reason);
 }finally{f.cleanup();}
});
test('literal matching rejects expansion, operators and extra execution without evaluating input',()=>{
 const expected='node --input-type=module -e \'console.log("ok")\'';
 assert.equal(literalCommandMatches(expected,expected),true);
 assert.equal(literalCommandMatches('n\'o\'de --input-type=module -e \'console.log("ok")\'',expected),true);
 for(const bad of [
  'echo '+expected,expected+'; true',expected+' && true',expected+' | cat',expected+' > result',expected+'\ntrue',
  'ENV=x '+expected,'$(echo node) --input-type=module -e \'console.log("ok")\'',
  '`echo node` --input-type=module -e \'console.log("ok")\'',
  'node --input-type=module -e "${CODE}"', 'node --input-type=module -e $\'console.log("ok")\'',
  '/bin/sh -lc '+JSON.stringify(expected+'; true'),
  '/bin/sh -lc '+JSON.stringify(expected)+' extra',
  '/bin/sh -lc '+JSON.stringify('/bin/sh -lc '+JSON.stringify(expected)),
  expected+' # comment',expected+"'",expected+'\\',
  'node* --input-type=module -e \'console.log("ok")\'',
 ])assert.equal(literalCommandMatches(bad,expected),false,bad);
});


test('setup guidance rejects unknown conditions and pre-capability schemas',()=>{
 for(const value of [true, null, 'standalone-node', {}, ['standalone-node-v1']]){
  const p=structuredClone(plan);p.capability.setup_guidance=value;
  assert.throws(()=>validatePlan(p),/setup guidance/i);
 }
 assert.throws(()=>validatePlan({...plan,schema_version:3,capability:{...plan.capability,setup_guidance:'standalone-node-v1'}}),/setup guidance/i);
});

test('setup guidance names available native tools and standalone file operations only when opted in',()=>{
 const p=structuredClone(plan);p.capability.setup_guidance='standalone-node-v1';
 validatePlan(p);
 const vectors=capabilityVectors();
 for(const host of ['claude','codex']){
  const old=buildCapabilityPrompt(plan,host,vectors),guided=buildCapabilityPrompt(p,host,vectors);
  assert.ok(guided.endsWith(old),'qualification task, vectors and budgets remain byte-identical');
  const prefix=guided.slice(0,-old.length);
  assert.match(prefix,/standalone-node-v1/);
  assert.match(prefix,/node -e/);
  assert.match(prefix,/writeFileSync/);
  assert.match(prefix,/mkdirSync/);
  assert.match(prefix,/heredocs/);
  assert.match(prefix,/truncated/);
  assert.doesNotMatch(prefix,/crypto\.verify|SPKI|302a3005|signature.*true|decision.*proceed/i);
  if(host==='claude'){
   assert.match(prefix,/WebSearch, WebFetch, Bash/);
   assert.match(prefix,/No separate Write or Edit tool/);
   const launch=adapter(plan.cells[1],'/tmp/neutral','/tmp/out',budgets).args;
   assert.equal(launch[launch.indexOf('--tools')+1],HOST_TOOLS.claude.tools.join(','));
  }
 }
});

test('setup guidance changes neither buyer prompts nor execution permissions',()=>{
 const p=packagePlan();p.package_review={source_commit:'a'.repeat(40)};
 const guided=structuredClone(p);guided.capability.setup_guidance='standalone-node-v1';
 for(const cell of p.cells){
  assert.equal(buildPrompt(guided,cell),buildPrompt(p,cell));
  const context={codex:{disabled_skills:[]}};
  assert.deepEqual(adapter(cell,'/tmp/neutral','/tmp/out',p.budgets,context,guided),adapter(cell,'/tmp/neutral','/tmp/out',p.budgets,context,p));
 }
 assert.deepEqual(guided.budgets,p.budgets);
 assert.deepEqual(guided.recipient,p.recipient);
});


test('buyer setup guidance requires explicit true and the qualified setup condition',()=>{
 for(const value of [false,null,'standalone-node-v1',{},1]){
  const p=structuredClone(plan);p.capability.setup_guidance='standalone-node-v1';p.buyer_setup_guidance=value;
  assert.throws(()=>validatePlan(p),/buyer setup/i);
 }
 const missing=structuredClone(plan);missing.buyer_setup_guidance=true;
 assert.throws(()=>validatePlan(missing),/buyer setup/i);
});

test('buyer setup guidance shares qualified instructions while preserving task and permissions',()=>{
 const p=packagePlan();p.package_review={source_commit:'a'.repeat(40)};p.capability.setup_guidance='standalone-node-v1';
 const guided=structuredClone(p);guided.buyer_setup_guidance=true;validatePlan(guided);
 const vectors=capabilityVectors(),fixture=packageReportFixture();
 const recipientContext={codex:{disabled_skills:[]}};
 assert.deepEqual(recipientLaunch(guided,'/tmp/offline','/tmp/out',recipientContext),recipientLaunch(p,'/tmp/offline','/tmp/out',recipientContext));
 for(const cell of p.cells){
  const before=buildPrompt(p,cell),after=buildPrompt(guided,cell);
  assert.notEqual(after,before);
  assert.ok(after.endsWith(before),'buyer question, constraints, source review and budgets are unchanged');
  const prefix=after.slice(0,-before.length);
  const bare=structuredClone(p);delete bare.capability.setup_guidance;
  const qualification=buildCapabilityPrompt(p,cell.host,vectors,fixture),oldQualification=buildCapabilityPrompt(bare,cell.host,vectors,fixture);
  assert.equal(prefix,qualification.slice(0,-oldQualification.length));
  assert.match(prefix,/mkdirSync/);assert.match(prefix,/multiple permitted operations within one Node program/);
  assert.equal(buildCapabilityPrompt(guided,cell.host,vectors,fixture),qualification,'no second qualification hint');
  const context={codex:{disabled_skills:[]}};
  assert.deepEqual(adapter(cell,'/tmp/neutral','/tmp/out',p.budgets,context,guided),adapter(cell,'/tmp/neutral','/tmp/out',p.budgets,context,p));
 }
});

test('buyer setup guidance does not give unbranded lanes a service identity or a verdict',()=>{
 const p=structuredClone(plan);p.capability.setup_guidance='standalone-node-v1';p.buyer_setup_guidance=true;
 for(const cell of [p.cells[0],{...p.cells[0],lane:'intent_search',entry:null}]){
  const text=buildPrompt(p,cell);assert.match(text,/standalone-node-v1/);
  assert.doesNotMatch(text,/scvd|preflight_endpoint|check_conformance|302a3005|signature.*true/i);
 }
});

test('buyer setup guidance cannot reuse a qualification from the old buyer condition',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';const p=structuredClone(plan);p.capability.setup_guidance='standalone-node-v1';
  const probe=path.join(d,'probe');await runCapabilityProbe(p,probe);
  p.buyer_setup_guidance=true;
  await assert.rejects(runCohort(p,path.join(d,'buyers'),{capability:probe}),/different plan/);
  assert.equal(fs.existsSync(path.join(d,'buyers')),false);
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});


function directoryPlan(){
 const p=packagePlan();p.package_review={source_commit:'a'.repeat(40)};p.package_source_directories=true;return p;
}
test('source directory setup requires explicit true and reviewed package access',()=>{
 for(const value of [false,null,'true',{},1]){
  const p=directoryPlan();p.package_source_directories=value;
  assert.throws(()=>validatePlan(p),/source director/i);
 }
 const p=directoryPlan();delete p.package_review;
 assert.throws(()=>validatePlan(p),/source director/i);
});
test('source directory setup declares only derived empty parents without changing permissions or offline prompts',()=>{
 const p=directoryPlan(),old=structuredClone(p);delete old.package_source_directories;
 const dirs=[...new Set(packageReviewSources(p).map(r=>path.posix.dirname(r.file)))].sort();
 const statement=` The runner prepared empty source-review directories: ${JSON.stringify(dirs)}. No source files or verification results are preloaded.`;
 const vectors=capabilityVectors(),fixture=packageReportFixture(),context={codex:{disabled_skills:[]}};
 for(const cell of p.cells){
  const buyer=buildPrompt(p,cell),capability=buildCapabilityPrompt(p,cell.host,vectors,fixture);
  assert.ok(buyer.includes(statement));assert.ok(capability.includes(statement));
  assert.equal(buyer.replace(statement,''),buildPrompt(old,cell));
  assert.equal(capability.replace(statement,''),buildCapabilityPrompt(old,cell.host,vectors,fixture));
  assert.deepEqual(adapter(cell,'/tmp/w','/tmp/o',p.budgets,context,p),adapter(cell,'/tmp/w','/tmp/o',p.budgets,context,old));
 }
 assert.deepEqual(recipientLaunch(p,'/tmp/w','/tmp/o',context),recipientLaunch(old,'/tmp/w','/tmp/o',context));
});
test('source directory setup reaches the child as empty folders and records them only for the opted-in run',async()=>{
 const d=root();try{
  for(const enabled of [true,false]){
   const cwd=path.join(d,String(enabled)),output=path.join(d,String(enabled)+'-out');fs.mkdirSync(cwd);fs.mkdirSync(output);
   const p=directoryPlan();if(!enabled)delete p.package_source_directories;
   const dirs=[...new Set(packageReviewSources(p).map(r=>path.posix.dirname(r.file)))].sort();
   const script=`const fs=require('node:fs');console.log(JSON.stringify(${JSON.stringify(dirs)}.map(p=>({path:p,exists:fs.existsSync(p),files:fs.existsSync(p)?fs.readdirSync(p):null}))));`;
   const result=await runChild(process.execPath,['-e',script],{cwd,output,prompt:'',host:'codex',budgets:p.budgets,plan:p});
   assert.equal(result.runtime.state,'completed');
   const observed=JSON.parse(fs.readFileSync(path.join(output,'events.jsonl'),'utf8'));
   assert.deepEqual(observed,dirs.map(p=>({path:p,exists:enabled,files:enabled?[]:null})));
   assert.deepEqual(result.prepared_source_directories,enabled?dirs:undefined);
  }
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('source directory setup refuses symlinked or populated destinations before launching a child',async()=>{
 const d=root();try{
  for(const kind of ['symlink','populated']){
   const cwd=path.join(d,kind),output=path.join(d,kind+'-out');fs.mkdirSync(cwd);fs.mkdirSync(output);fs.mkdirSync(path.join(cwd,'evidence'));
   const dest=path.join(cwd,'evidence/source');
   if(kind==='symlink'){const elsewhere=path.join(d,'elsewhere');fs.mkdirSync(elsewhere);fs.symlinkSync(elsewhere,dest,'dir');}
   else{fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'existing.txt'),'keep');}
   const p=directoryPlan();
   await assert.rejects(runChild(process.execPath,['-e','process.stdout.write("launched")'],{cwd,output,prompt:'',host:'codex',budgets:p.budgets,plan:p}),/source director/i);
   assert.equal(fs.existsSync(path.join(output,'events.jsonl')),false);
   if(kind==='populated')assert.equal(fs.readFileSync(path.join(dest,'existing.txt'),'utf8'),'keep');
  }
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('source directory setup cannot reuse qualification from an unprepared workspace',async()=>{
 const d=root(),savedPath=process.env.PATH;
 try{
  process.env.PATH='';const p=directoryPlan();delete p.package_source_directories;
  const probe=path.join(d,'probe');await runCapabilityProbe(p,probe);p.package_source_directories=true;
  await assert.rejects(runCohort(p,path.join(d,'buyers'),{capability:probe}),/different plan/);
  assert.equal(fs.existsSync(path.join(d,'buyers')),false);
 }finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});


function boundedReviewPlan(){const p=directoryPlan();p.package_review_flow='bounded-fetch-v1';return p;}
function boundedReviewFixture(){
 const d=root(),p=boundedReviewPlan();fs.mkdirSync(path.join(d,'evidence/source'),{recursive:true});
 const files=Object.fromEntries(packageReviewSources(p).map(r=>[r.url,fs.readFileSync(new URL('../verifier/'+path.posix.basename(r.file),import.meta.url),'utf8')]));
 const fake=path.join(d,'fetch.mjs');
 const configure=(mode='ok')=>fs.writeFileSync(fake,`import fs from 'node:fs';const files=${JSON.stringify(files)};globalThis.fetch=async(url,options)=>{if(!(url in files)||options.redirect!=='error')throw Error('unexpected fetch');fs.appendFileSync('fetches.jsonl',JSON.stringify({url,redirect:options.redirect})+'\\n');return new Response(${JSON.stringify(mode)}==='bad-hash'?'tampered':${JSON.stringify(mode)}==='oversize'?'x'.repeat(5000000):files[url],{status:${mode==='http-error'?503:200}});};`);
 configure();
 const inspect=()=>spawnSync('/bin/sh',['-c',packageInspectionCommand(p)],{cwd:d,env:{...process.env,NODE_OPTIONS:'--import='+fake},encoding:'utf8',maxBuffer:p.budgets.output_bytes});
 return {d,p,files,configure,inspect,cleanup:()=>fs.rmSync(d,{recursive:true,force:true})};
}
test('bounded source review requires its explicit version and prepared review directories',()=>{
 for(const value of [true,false,null,'bounded-fetch',{},1]){const p=boundedReviewPlan();p.package_review_flow=value;assert.throws(()=>validatePlan(p),/review flow/i);}
 const p=boundedReviewPlan();delete p.package_source_directories;assert.throws(()=>validatePlan(p),/review flow/i);
});
test('bounded source review fetches exact pinned files and prints accountable previews within its declared bound',()=>{
 const f=boundedReviewFixture();try{
  const result=f.inspect();assert.equal(result.status,0,result.stderr);
  const rows=result.stdout.trim().split('\n').map(JSON.parse);assert.equal(rows.length,packageReviewSources(f.p).length);
  const prompt=buildCapabilityPrompt(f.p,'claude',capabilityVectors(),packageReportFixture());
  const budget=Number(prompt.match(/at most (\d+) UTF-8 output bytes/)[1]);assert.ok(Buffer.byteLength(result.stdout)<=budget);
  assert.match(prompt,/saved workspace files/);assert.match(prompt,/host-managed/);assert.match(prompt,/remaining review gaps/);
  for(const row of rows){const bytes=fs.readFileSync(path.join(f.d,row.file));assert.equal(hash(bytes),f.p.recipient.verifier.files[path.posix.basename(row.file)]);assert.equal(row.sha256,hash(bytes));assert.equal(row.source_bytes,bytes.length);assert.equal(row.displayed_utf8_bytes,Buffer.byteLength(row.untrusted_source_prefix));assert.equal(row.omitted_bytes,bytes.length-row.displayed_utf8_bytes);assert.ok(row.omitted_bytes>0);assert.ok(bytes.toString().startsWith(row.untrusted_source_prefix));}
  const requests=fs.readFileSync(path.join(f.d,'fetches.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(requests.map(r=>r.url),packageReviewSources(f.p).map(r=>r.url));
  const second=f.inspect();assert.notEqual(second.status,0);assert.match(second.stderr,/already exists/);assert.equal(fs.readFileSync(path.join(f.d,'fetches.jsonl'),'utf8').trim().split('\n').length,requests.length);
 }finally{f.cleanup();}
});
for(const mode of ['bad-hash','oversize','http-error'])test(`bounded source review refuses ${mode} without a successful inspection display`,()=>{
 const f=boundedReviewFixture();try{f.configure(mode);const result=f.inspect();assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,mode==='bad-hash'?/hash mismatch/:mode==='oversize'?/read bound/:/HTTP 503/);}finally{f.cleanup();}
});
test('bounded source review refuses a symlinked parent before fetching anything',()=>{
 const f=boundedReviewFixture(),outside=root();try{
  fs.rmdirSync(path.join(f.d,'evidence/source'));fs.symlinkSync(outside,path.join(f.d,'evidence/source'),'dir');
  const result=f.inspect();assert.notEqual(result.status,0);assert.match(result.stderr,/escaped workspace/);assert.equal(fs.existsSync(path.join(f.d,'fetches.jsonl')),false);assert.deepEqual(fs.readdirSync(outside),[]);
 }finally{f.cleanup();fs.rmSync(outside,{recursive:true,force:true});}
});
test('bounded source review changes no adapter permissions or offline recipient and needs fresh qualification',async()=>{
 const p=boundedReviewPlan(),old=structuredClone(p);delete old.package_review_flow;const context={codex:{disabled_skills:[]}};
 for(const cell of p.cells)assert.deepEqual(adapter(cell,'/tmp/w','/tmp/o',p.budgets,context,p),adapter(cell,'/tmp/w','/tmp/o',p.budgets,context,old));
 assert.deepEqual(recipientLaunch(p,'/tmp/w','/tmp/o',context),recipientLaunch(old,'/tmp/w','/tmp/o',context));
 const d=root(),savedPath=process.env.PATH;try{process.env.PATH='';const probe=path.join(d,'probe');await runCapabilityProbe(old,probe);await assert.rejects(runCohort(p,path.join(d,'buyers'),{capability:probe}),/different plan/);assert.equal(fs.existsSync(path.join(d,'buyers')),false);}finally{process.env.PATH=savedPath;fs.rmSync(d,{recursive:true,force:true});}
});

test('bounded source review preserves hostile Unicode source as data and enforces a cumulative download cap',()=>{
 const f=boundedReviewFixture();try{
  const row=packageReviewSources(f.p).find(r=>r.file.endsWith('payment-identity.js'));
  const source='\ufeff'+`require("node:fs").writeFileSync("executed-marker","bad");`+'😀\t'.repeat(1000);
  f.files[row.url]=source;f.p.recipient.verifier.files['payment-identity.js']=hash(Buffer.from(source));f.configure();
  const result=f.inspect();assert.equal(result.status,0,result.stderr);assert.equal(fs.existsSync(path.join(f.d,'executed-marker')),false);
  const display=result.stdout.trim().split('\n').map(JSON.parse).find(r=>r.file===row.file);
  assert.ok(source.startsWith(display.untrusted_source_prefix));assert.equal(display.displayed_utf8_bytes,Buffer.byteLength(display.untrusted_source_prefix));assert.deepEqual(fs.readFileSync(path.join(f.d,row.file)),Buffer.from(source));
 }finally{f.cleanup();}
 const limited=boundedReviewFixture();try{
  limited.p.budgets.artifact_bytes=50000;const result=limited.inspect();assert.notEqual(result.status,0);assert.match(result.stderr,/read bound/);assert.equal(result.stdout,'');
 }finally{limited.cleanup();}
});
