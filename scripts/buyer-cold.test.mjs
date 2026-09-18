import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildPrompt, validatePlan, adapter, normalizeTrace, scoreColdRun, readEvidence, hash, cohortSummary} from './lib/buyer-cold.mjs';

const plan={schema_version:2,subject:'https://merchant.example/quote',spend_usdc:0,budgets:{wall_ms:120000,tool_calls:16,output_bytes:1000000,output_tokens:2000},cells:[{id:'search',host:'codex',model:'gpt-5.6-luna',lane:'intent_search',entry:null,verification:'prompted'}]};
const trace=Array.from({length:8},(_,i)=>JSON.stringify({type:'item.completed',item:{id:String(i),type:'agent_message',text:`Retained observation ${i}`}})).join('\n')+'\n';
const ref={file:'events.jsonl',sha256:hash(trace),start_line:1,end_line:2};
const stages=['discover','connect','check','decide','obtain','verify'];
function baseline(){
 const ref={file:'events.jsonl',sha256:hash(trace),start_line:1,end_line:2};
 const root=mkdtempSync(join(tmpdir(),'cold-test-'));
 writeFileSync(join(root,'events.jsonl'),trace);
 const review={schema_version:2,reviewer:'fixture reviewer',reviewed_at:'2026-09-16T12:00:00Z',transcript_sha256:hash(trace),isolation:{state:'clean',reason:'fresh process and public-only trace',evidence:[ref]},stages:Object.fromEntries(stages.map(k=>[k,{state:'pass',reason:'Evidence reviewed',evidence:[ref]}])),discovery:{selected_origin:'https://scvd.store',query:'verify a merchant endpoint',result_url:'https://scvd.store/',catalogue_complete:true},observation:{subject:plan.subject,observed_at:'2026-09-16T11:00:00Z',stale_after:'2026-09-17T11:00:00Z'},fulfillment:'delivered',recipient:{state:'reviewed',understands:true,evidence:[ref]},payment:{state:'not_needed',reason:'Public signed evidence available'}};
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const payload=JSON.stringify({subject:plan.subject,observed_at:'2026-09-16T11:00:00Z',expires_at:'2026-09-17T11:00:00Z'});
 const artifact={signed_payload:payload,public_key:key,signature:sign(null,Buffer.from(payload),privateKey).toString('hex')};
 const save=(file,value)=>{const bytes=JSON.stringify(value);writeFileSync(join(root,file),bytes);return{file,sha256:hash(bytes)};};
 review.verification={artifact:save('artifact.json',artifact),issuer:save('issuer.json',{public_key:key}),issuer_url:'https://scvd.store/.well-known/trust.json',issuer_evidence:[ref],subject_pointer:'/subject',observed_at_pointer:'/observed_at',expires_at_pointer:'/expires_at'};
 const run={schema_version:2,cell:plan.cells[0],subject:plan.subject,ended_at:'2026-09-16T12:00:00Z',runtime:{state:'completed',exit_code:0,budget_stop:null},trace_sha256:hash(trace),isolation:{fresh_directory:true,config_isolated:true,no_session_resume:true},counts:{tool_calls:0}};
 return{root,review,run,artifact,save,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
async function check(mutate,stage,state){const b=baseline();try{mutate(b);const r=(await scoreColdRun(b.run,b.review,b.root));assert.equal(r.stages[stage].state,state);assert.notEqual(r.usable,'pass');}finally{b.cleanup();}}

test('unbranded prompts contain the task but no store identity or named preflight tool',()=>{const p=buildPrompt(plan,plan.cells[0]);assert.match(p,/merchant\.example/);assert.doesNotMatch(p,/scvd|preflight_endpoint|check_conformance/);});
test('directed entry is explicit and cannot be mixed with discovery',async()=>{const c={...plan.cells[0],lane:'directed',entry:'https://scvd.store/skill.md'};assert.match(buildPrompt(plan,c),/https:\/\/scvd.store/);const b=baseline();try{b.run.cell=c;assert.equal((await scoreColdRun(b.run,b.review,b.root)).stages.discover.state,'not_applicable');}finally{b.cleanup();}});
test('plans reject duplicate cells, paid scope, private entry points and nonpositive budgets',()=>{for(const p of [{...plan,cells:[plan.cells[0],plan.cells[0]]},{...plan,spend_usdc:1},{...plan,cells:[{...plan.cells[0],lane:'catalogue',entry:'http://127.0.0.1/'}]},{...plan,budgets:{...plan.budgets,wall_ms:0}}])assert.throws(()=>validatePlan(p));});
test('adapters never inherit user config, resume sessions or load a store-specific MCP',()=>{for(const h of ['codex','claude']){const a=adapter({...plan.cells[0],host:h},'/tmp/neutral','/tmp/out',plan.budgets,{codex:{disabled_skills:[]}});assert.doesNotMatch(a.args.join(' '),/scvd|resume|continue|dangerously/);assert.match(a.args.join(' '),h==='codex'?/ignore-user-config/:/safe-mode/);}});
test('complete evidence including independently verified original bytes can pass',async()=>{const b=baseline();try{const r=(await scoreColdRun(b.run,b.review,b.root));assert.equal(r.usable,'pass');assert.equal(r.verification.signature,true);}finally{b.cleanup();}});
test('a model success statement without review is incomplete',async()=>{const b=baseline();try{assert.equal((await scoreColdRun(b.run,null,b.root)).usable,'incomplete');}finally{b.cleanup();}});
test('missing transcript cannot pass',()=>check(b=>rmSync(join(b.root,'events.jsonl')),'discover','incomplete'));
test('changed transcript invalidates a previous review',()=>check(b=>writeFileSync(join(b.root,'events.jsonl'),trace+'{}\n'),'discover','incomplete'));
test('inherited store context invalidates every stage',()=>check(b=>b.review.isolation.state='contaminated','check','incomplete'));
test('unreviewed isolation is not inferred from CLI flags',()=>check(b=>delete b.review.isolation,'check','incomplete'));
test('review cannot cite a nonexistent event or modified artifact',()=>check(b=>b.review.stages.check.evidence=[{...ref,start_line:100,end_line:101}],'check','incomplete'));
test('partial catalogue does not prove absence',async()=>{const b=baseline();try{b.review.stages.discover.state='fail';b.review.discovery={catalogue_complete:false};const result=(await scoreColdRun(b.run,b.review,b.root));assert.equal(result.stages.discover.state,'fail');assert.equal(result.catalogue_absence,'unverified');}finally{b.cleanup();}});
test('stale observation fails the freshness stage',()=>check(b=>b.review.observation.stale_after='2026-09-16T11:30:00Z','check','fail'));
test('validly signed wrong subject fails semantic verification',()=>check(b=>{b.review.verification.subject_pointer='/observed_at';},'verify','fail'));
test('tampering fails even with an unreviewed recipient',()=>check(b=>{b.artifact.signed_payload+=' ';b.review.verification.artifact=b.save('artifact.json',b.artifact);delete b.review.recipient;},'verify','fail'));
test('self-supplied key alone is not issuer binding',()=>check(b=>delete b.review.verification.issuer,'verify','incomplete'));
test('issuer mismatch fails while valid artifact signature stays true',()=>check(b=>b.review.verification.issuer=b.save('issuer.json',{public_key:'00'.repeat(32)}),'verify','fail'));
test('queued delivery never becomes evidence obtained',()=>check(b=>b.review.fulfillment='queued','obtain','incomplete'));
test('correct refusal passes the decision without faking obtained evidence',async()=>{const b=baseline();try{b.review.stages.decide.reason='Refused because published gaps do not support payment';b.review.stages.obtain={state:'not_applicable',reason:'No suitable free evidence',evidence:[ref]};b.review.stages.verify={state:'not_applicable',reason:'No evidence obtained',evidence:[ref]};const r=(await scoreColdRun(b.run,b.review,b.root));assert.equal(r.stages.decide.state,'pass');assert.equal(r.usable,'incomplete');}finally{b.cleanup();}});
test('runtime cap does not erase partial observed progress but prevents full completion',async()=>{const b=baseline();try{b.run.runtime={state:'failed',exit_code:null,budget_stop:'tool_calls'};const r=(await scoreColdRun(b.run,b.review,b.root));assert.equal(r.stages.check.state,'pass');assert.equal(r.usable,'incomplete');}finally{b.cleanup();}});
test('evidence path traversal and symlink escape are refused',()=>{const b=baseline();try{assert.throws(()=>readEvidence(b.root,{...ref,file:'../elsewhere'}));symlinkSync('/etc/hosts',join(b.root,'outside'));assert.throws(()=>readEvidence(b.root,{...ref,file:'outside'}));}finally{b.cleanup();}});
test('host events count real tool starts once, preserve malformed rows and usage',()=>{const lines=[JSON.stringify({type:'item.started',item:{id:'t',type:'web_search',query:'x'}}),JSON.stringify({type:'item.completed',item:{id:'t',type:'web_search'}}),'broken',JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:12}})].join('\n');const n=normalizeTrace('codex',lines);assert.equal(n.tool_calls,1);assert.equal(n.malformed_lines,1);assert.equal(n.usage.output_tokens,12);});
test('cohort denominators retain unavailable hosts and separate directed runs',()=>{const rows=[{cell:{host:'codex',lane:'intent_search'},usable:'fail'},{cell:{host:'claude',lane:'intent_search'},usable:'incomplete'},{cell:{host:'codex',lane:'directed'},usable:'pass'}];const r=cohortSummary(rows);assert.equal(r.discovery.attempts,2);assert.equal(r.directed.attempts,1);assert.equal(r.discovery.incomplete,1);assert.equal(r.distinct_hosts_completed,1);});

// Real child processes prove the runner, without spending model tokens or
// relying on any host CLI being installed in CI.
import {runChild,childEnvironment,scoreCohort,runCohort} from './buyer-cold-isolated.mjs';
test('child environment excludes injected API, wallet and parent context variables',()=>{assert.deepEqual(childEnvironment({PATH:'/bin',HOME:'/home',OPENAI_API_KEY:'secret',SIGNING_KEY:'secret',CODEX_THREAD_ID:'parent'}),{PATH:'/bin',HOME:'/home'});});
test('runner retains startup failures instead of dropping the attempted cell',async()=>{const b=baseline();rmSync(join(b.root,'events.jsonl'));try{const r=await runChild('/no-such-buyer-cli',[],{cwd:b.root,output:b.root,prompt:'test',host:'codex',budgets:plan.budgets});assert.equal(r.runtime.state,'unavailable');assert.equal(r.runtime.spawn_error,'ENOENT');}finally{b.cleanup();}});
test('runner terminates at wall-clock cap and retains output',async()=>{const b=baseline();rmSync(join(b.root,'events.jsonl'));try{const r=await runChild(process.execPath,['-e','console.log(JSON.stringify({type:"turn.started"}));setInterval(()=>{},1000)'],{cwd:b.root,output:b.root,prompt:'test',host:'codex',budgets:{...plan.budgets,wall_ms:150}});assert.equal(r.runtime.budget_stop,'wall_ms');assert.ok(r.counts.events.length);}finally{b.cleanup();}});
test('runner terminates a tool burst and enforces combined output ceiling',async()=>{for(const [code,budget,expected] of [['for(let i=0;i<30;i++)console.log(JSON.stringify({type:"item.started",item:{type:"web_search",id:String(i)}}));setInterval(()=>{},1000)',{tool_calls:2},'tool_calls'],['process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)',{output_bytes:1000},'output_bytes']]){const b=baseline();rmSync(join(b.root,'events.jsonl'));try{const r=await runChild(process.execPath,['-e',code],{cwd:b.root,output:b.root,prompt:'test',host:'codex',budgets:{...plan.budgets,...budget}});assert.equal(r.runtime.budget_stop,expected);assert.ok(r.output_bytes<=({...plan.budgets,...budget}).output_bytes);}finally{b.cleanup();}}});
test('fresh-directory requirement refuses overwriting any prior cohort',async()=>{const b=baseline();try{await assert.rejects(runCohort(plan,b.root),/EEXIST/);}finally{b.cleanup();}});
test('scorer keeps planned missing cells in denominator and refuses transplanted runs',async()=>{const b=baseline();try{writeFileSync(join(b.root,'plan.json'),JSON.stringify(plan));assert.equal((await scoreCohort(b.root)).discovery.incomplete,1);mkdirSync(join(b.root,'search'));writeFileSync(join(b.root,'search','run.json'),JSON.stringify({...b.run,subject:'https://other.example/'}));assert.match((await scoreCohort(b.root)).runs[0].exclusions[0],/plan_mismatch/);}finally{b.cleanup();}});

test('choosing a different service is retained as a SCVD discovery miss',()=>check(b=>b.review.discovery.selected_origin='https://other.example','discover','fail'));

test('a separately fetched key from the wrong origin is not SCVD identity',()=>check(b=>b.review.verification.issuer_url='https://attacker.example/key.json','verify','fail'));
test('truncated JSONL does not allow a full journey pass',async()=>{const b=baseline();try{const broken=trace+'{';writeFileSync(join(b.root,'events.jsonl'),broken);b.run.trace_sha256=hash(broken);b.review.transcript_sha256=hash(broken);const rebind=x=>{if(x&&typeof x==='object'){if(x.file==='events.jsonl')x.sha256=hash(broken);Object.values(x).forEach(rebind);}};rebind(b.review);assert.notEqual((await scoreColdRun(b.run,b.review,b.root)).usable,'pass');}finally{b.cleanup();}});
test('JSON primitives and malformed message content cannot crash transcript inspection',()=>{for(const host of ['codex','claude']){const n=normalizeTrace(host,'null\n42\n[]\n{"type":"assistant","message":{"content":{}}}\n');assert.equal(n.malformed_lines,4);}});
test('collector retains the exact instrument source bytes as well as their hashes',async()=>{const root=mkdtempSync(join(tmpdir(),'cold-freeze-test-'));const savedPath=process.env.PATH;try{process.env.PATH='';const out=join(root,'cohort');await runCohort(plan,out);const manifest=JSON.parse(readFileSync(join(out,'instrument.json'),'utf8'));for(const [file,digest] of Object.entries(manifest.files))assert.equal(hash(readFileSync(join(out,'instrument',file))),digest);}finally{if(savedPath===undefined)delete process.env.PATH;else process.env.PATH=savedPath;rmSync(root,{recursive:true,force:true});}});

// Both clocks are injected: suspension and clock changes must not depend on
// putting the test machine to sleep or waiting for its clock to move.
for (const [name,wall,monotonic,reason] of [
 ['suspended monotonic clock',10000,20,'timing_interrupted'],
 ['delayed callbacks with both clocks advancing',10000,10000,'timing_interrupted'],
 ['backward wall clock',-10000,20,'timing_interrupted'],
 ['deadline reached before the timer callback',500,500,'wall_ms'],
]) test(`runner refuses completion after ${name}`,async()=>{
 const b=baseline();rmSync(join(b.root,'events.jsonl'));let reads=0;
 const start=Date.parse('2026-09-18T00:00:00Z');
 const clock=()=>reads++?{wall_ms:start+wall,monotonic_ms:monotonic}:{wall_ms:start,monotonic_ms:0};
 try{
  const r=await runChild(process.execPath,['-e','console.log(JSON.stringify({type:"turn.completed"}))'],{cwd:b.root,output:b.root,prompt:'test',host:'codex',budgets:{...plan.budgets,wall_ms:reason==='wall_ms'?250:30000},clock});
  assert.equal(r.runtime.budget_stop,reason);
  assert.equal(r.runtime.state,'failed');
  assert.equal(r.timing.wall_elapsed_ms,wall);
  assert.equal(r.timing.monotonic_elapsed_ms,monotonic);
  assert.equal(r.runtime.stop_requested.at,new Date(start+wall).toISOString());
  assert.equal(r.runtime.stop_requested.monotonic_elapsed_ms,monotonic);
  assert.ok(r.counts.events.length,'partial output is retained');
  assert.equal(r.timing.interruption!==null,reason==='timing_interrupted');
 }finally{b.cleanup();}
});
test('timing interruption keeps stage evidence but cannot become a full product verdict',async()=>{
 const b=baseline();try{
  b.run.runtime.budget_stop='timing_interrupted';b.run.runtime.state='failed';
  b.review.stages.check.state='fail';
  const result=await scoreColdRun(b.run,b.review,b.root);
  assert.equal(result.stages.check.state,'fail');assert.equal(result.usable,'incomplete');
  assert.ok(result.exclusions.some(x=>/timing|interruption/i.test(x)));
 }finally{b.cleanup();}
});

test('regular samples do not turn a long healthy run into an interruption',async()=>{
 const {runTiming}=await import('./buyer-cold-isolated.mjs');let elapsed=0;
 const timer=runTiming(20000,()=>({wall_ms:1800000000000+elapsed,monotonic_ms:elapsed}));
 for(elapsed=1000;elapsed<=16000;elapsed+=1000){const reading=timer.sample();assert.equal(reading.stop,null);assert.equal(reading.record.interruption,null);}
});
test('cumulative clock divergence is retained even when every callback gap is small',async()=>{
 const {runTiming}=await import('./buyer-cold-isolated.mjs');let n=0;
 const timer=runTiming(30000,()=>({wall_ms:1800000000000+n*4000,monotonic_ms:n*1000}));
 n=1;assert.equal(timer.sample().stop,null);n=2;
 const reading=timer.sample();assert.equal(reading.stop,'timing_interrupted');assert.equal(reading.record.interruption.reason,'clock_divergence');
});
test('clock readings are snapshots even when an injected clock reuses its object',async()=>{
 const {runTiming}=await import('./buyer-cold-isolated.mjs');const now={wall_ms:1800000000000,monotonic_ms:0};
 const timer=runTiming(30000,()=>now);now.wall_ms+=10000;now.monotonic_ms+=10000;
 assert.equal(timer.sample().stop,'timing_interrupted');
});
test('a gap observed at close records a stop without signalling an already closed process',async()=>{
 const b=baseline();rmSync(join(b.root,'events.jsonl'));let reads=0,signals=0;
 const savedKill=process.kill;process.kill=()=>{signals++;return true;};
 try{
  const clock=()=>({wall_ms:1800000000000+(reads++?10000:0),monotonic_ms:0});
  const r=await runChild(process.execPath,['-e',''],{cwd:b.root,output:b.root,prompt:'test',host:'codex',budgets:plan.budgets,clock});
  assert.equal(r.runtime.budget_stop,'timing_interrupted');assert.equal(r.runtime.stop_requested.close_observed,true);assert.equal(r.runtime.stop_requested.signal_requested,false);assert.equal(signals,0);
 }finally{process.kill=savedKill;b.cleanup();}
});
