// Fresh public-only processes, never a conversation fork. Live execution is
// explicit; deterministic tests and rescoring do not launch an agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {adapter, recipientLaunch, buildPrompt, buildCapabilityPrompt, capabilityVectors, scoreCapability, validatePlan, normalizeTrace, hash, scoreColdRun, cohortSummary, SESSION_WORKSPACE} from './lib/buyer-cold.mjs';

import {retainArtifacts} from './lib/buyer-retention.mjs';
import {disabledCodexSkills} from './lib/buyer-host-context.mjs';
export {retainArtifacts};

const writeJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value,null,2)+'\n', {mode:0o600});
// CLI authentication remains internal to each host; wallet/API credentials
// and the parent task's context are not copied into the child environment.
// NETWORK CONTEXT (2026-09-17): a sandboxed launch context can reach the
// world only through an egress proxy and its CA bundle. Those variables
// name a route, not a credential, and without them the host cannot even
// reach its own API; they ride along and are listed in launch.json.
const NETWORK_CONTEXT=['HTTPS_PROXY','HTTP_PROXY','NO_PROXY','https_proxy','http_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','CURL_CA_BUNDLE','ANTHROPIC_BASE_URL'];
export function childEnvironment(source=process.env) {
  return Object.fromEntries(['PATH','HOME','TMPDIR','SHELL','USER','LANG',...NETWORK_CONTEXT].filter(k=>source[k]).map(k=>[k,source[k]]));
}
function sessionEnvironment(cwd, environment) {
  // The native sandbox cannot write the keeper's default ~/.npm cache.
  // Both spellings agree, including npm's lowercase lifecycle overrides.
  const cache=path.join(cwd,SESSION_WORKSPACE.npm_cache);
  return {...environment,NPM_CONFIG_CACHE:cache,npm_config_cache:cache};
}
// A delayed callback is evidence of an unobserved interval, not a diagnosis
// of sleep. Stop on that gap; never subtract it to grant more run time.
export const TIMING_POLICY = Object.freeze({sample_interval_ms:1000,max_callback_gap_ms:5000,max_clock_divergence_ms:5000});
const systemClock=()=>({wall_ms:Date.now(),monotonic_ms:performance.now()});
export function runTiming(wallBudget,clock=systemClock) {
  const start={...clock()};let last=start,interruption=null,maxGap=0;
  const sample=()=>{
    const now={...clock()},wallGap=now.wall_ms-last.wall_ms,monoGap=now.monotonic_ms-last.monotonic_ms;
    const wallElapsed=now.wall_ms-start.wall_ms,monoElapsed=now.monotonic_ms-start.monotonic_ms;
    maxGap=Math.max(maxGap,wallGap,monoGap);
    const reason=wallGap<0||monoGap<0?'clock_moved_backwards':
      Math.max(wallGap,monoGap)>TIMING_POLICY.max_callback_gap_ms?'callback_gap':
      Math.abs(wallElapsed-monoElapsed)>TIMING_POLICY.max_clock_divergence_ms?'clock_divergence':null;
    if(reason&&!interruption)interruption={reason,previous:last,observed:now,wall_gap_ms:wallGap,monotonic_gap_ms:monoGap};
    last=now;
    return {stop:interruption?'timing_interrupted':Math.max(wallElapsed,monoElapsed)>=wallBudget?'wall_ms':null,
      record:{policy:TIMING_POLICY,started_at:new Date(start.wall_ms).toISOString(),ended_at:new Date(now.wall_ms).toISOString(),wall_elapsed_ms:wallElapsed,monotonic_elapsed_ms:monoElapsed,max_callback_gap_ms:maxGap,interruption}};
  };
  return {started_at:new Date(start.wall_ms).toISOString(),sample};
}
export async function runChild(command, args, {cwd, output, prompt, host, budgets, env=childEnvironment(), clock=systemClock}) {
  fs.mkdirSync(path.join(cwd,SESSION_WORKSPACE.scratch),{recursive:true,mode:0o700});
  const monitor=runTiming(budgets.wall_ms,clock);
  const started_at = monitor.started_at;
  const events = fs.openSync(path.join(output,'events.jsonl'),'wx',0o600);
  const logs = fs.openSync(path.join(output,'runtime.log'),'wx',0o600);
  let stdout='', stderr='', bytes=0, budget_stop=null, spawn_error=null, escalation, stop_requested=null, closed=false;
  const child = spawn(command,args,{cwd,env:sessionEnvironment(cwd,env),detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  const terminate = () => {
    try { if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM'); } catch { /* Already exited. */ }
    escalation = setTimeout(()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}},1000);
    escalation.unref();
  };
  // The final timing sample can follow close; never signal a recycled PID.
  const stop = reason => {if(!budget_stop){budget_stop=reason;const measured=monitor.sample().record;stop_requested={at:measured.ended_at,close_observed:closed,signal_requested:!closed,wall_elapsed_ms:measured.wall_elapsed_ms,monotonic_elapsed_ms:measured.monotonic_elapsed_ms};if(!closed)terminate();}};
  let timing;
  const checkTiming=()=>{const sample=monitor.sample();timing=sample.record;if(sample.stop)stop(sample.stop);};
  const timer = setTimeout(()=>{checkTiming();if(!budget_stop)stop('wall_ms');},budgets.wall_ms);
  const heartbeat = setInterval(checkTiming,TIMING_POLICY.sample_interval_ms);
  const collect = (chunk, fd, stream) => {
    checkTiming();
    const remaining = Math.max(0,budgets.output_bytes-bytes);
    const kept = chunk.subarray(0,remaining);
    fs.writeSync(fd,kept); bytes += kept.length;
    if(stream==='stdout') stdout+=kept.toString(); else stderr+=kept.toString();
    if(chunk.length>remaining)stop('output_bytes');
    // Count distinct tool IDs across started/completed notifications. This
    // bounds exposed tool calls, not hidden HTTP work within a host tool.
    const complete = stdout.slice(0,stdout.lastIndexOf('\n')+1);
    if(normalizeTrace(host,complete).tool_calls>budgets.tool_calls)stop('tool_calls');
  };
  child.stdout.on('data',b=>collect(b,events,'stdout'));
  child.stderr.on('data',b=>collect(b,logs,'stderr'));
  child.stdin.on('error',()=>{}); // A host can reject startup before reading stdin.
  child.stdin.end(prompt);
  const result = await new Promise(resolve=>{
    child.on('error',e=>{spawn_error=e.code??e.message;});
    child.on('close',(exit_code,signal)=>{closed=true;resolve({exit_code,signal});});
  });
  checkTiming();
  clearTimeout(timer); clearInterval(heartbeat); clearTimeout(escalation);
  fs.closeSync(events);fs.closeSync(logs);
  const counts=normalizeTrace(host,stdout);
  const terminalFailure=stdout.split('\n').some(line=>{try{const r=JSON.parse(line);return r.type==='turn.failed'||(r.type==='result'&&r.is_error===true);}catch{return false;}});
  return {started_at,ended_at:timing.ended_at,timing,local_workspace:SESSION_WORKSPACE,runtime:{state:spawn_error?'unavailable':result.exit_code===0&&!terminalFailure&&!budget_stop?'completed':'failed',...result,spawn_error,budget_stop,stop_requested},counts,trace_sha256:hash(fs.readFileSync(path.join(output,'events.jsonl'))),
    output_bytes:bytes,limits:['Token target is advisory; retained bytes are bounded. Deadlines are checked when the runner executes; enforcement during host suspension is impossible. Callback/clock gaps stop the run as timing_interrupted, without diagnosing their cause. Tool budget stops after an over-budget event is observed; batched calls can exceed it.','Host tool events do not establish origin-request count or absence of hidden context.']};
}
export async function scoreCohort(root) {
  const plan=validatePlan(JSON.parse(fs.readFileSync(path.join(root,'plan.json'),'utf8')));
  const rows=await Promise.all(plan.cells.map(async cell=>{
    const dir=path.join(root,cell.id);
    let run,review=null;
    try{run=JSON.parse(fs.readFileSync(path.join(dir,'run.json'),'utf8'));}catch{run={cell,subject:plan.subject,runtime:{state:'not_run'}};}
    try{review=JSON.parse(fs.readFileSync(path.join(dir,'review.json'),'utf8'));}catch{ /* Unreviewed is incomplete. */ }
    // A run cannot silently change its frozen subject, identity or lane.
    if(JSON.stringify(run.cell)!==JSON.stringify(cell)||run.subject!==plan.subject)run={cell,subject:plan.subject,runtime:{state:'plan_mismatch'}};
    return scoreColdRun({...run,freshness:plan.freshness},review,dir);
  }));
  let capability=null;
  try{const c=JSON.parse(fs.readFileSync(path.join(root,'capability.json'),'utf8'));capability={plan_sha256:c.plan_sha256,source_sha256:c.source_sha256??null,hosts:Object.fromEntries(Object.entries(c.hosts??{}).map(([host,h])=>[host,{state:h.state,retention:h.retention??null,local_check:h.local_check??null,denied:h.denied??[]}]))};}catch{ /* Schema 2/3 cohorts carry no probe. */ }
  return {...cohortSummary(rows),...(capability?{capability}:{}),scorer_sha256:hash(fs.readFileSync(new URL('lib/buyer-cold.mjs',import.meta.url))),plan_sha256:hash(fs.readFileSync(path.join(root,'plan.json'))),runs:rows};
}
// The exact collector bytes, frozen beside every acquisition and probe.
const INSTRUMENT_FILES=['buyer-cold-isolated.mjs','buyer-recipient-handoff.mjs','lib/buyer-cold.mjs','lib/buyer-run-evidence.mjs','lib/buyer-retention.mjs','lib/buyer-host-context.mjs','../verifier/evidence-bundle.js','../verifier/x402-verify.js'];
function freezeInstrument(root) {
  const files = {};
  for (const name of INSTRUMENT_FILES) {
    const bytes=fs.readFileSync(new URL(name,import.meta.url)), destination=path.join(root,'instrument',name);
    fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    fs.writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
    files[name]=hash(bytes);
  }
  writeJson(path.join(root,'instrument.json'),{schema_version:2,files});
  return files;
}
const planHosts=plan=>[...new Set([...plan.cells.map(c=>c.host),...(plan.schema_version>=5?[plan.recipient.host]:[])])];
function hostAvailability(names, environment) {
  const hosts=new Map();
  for(const name of names){
    if(hosts.has(name))continue;
    const version=spawnSync(name,['--version'],{env:environment,encoding:'utf8',timeout:10000});
    let available=version.status===0,reason=available?null:'CLI version check failed';
    if(available&&name==='claude'){
      const auth=spawnSync(name,['auth','status'],{env:environment,encoding:'utf8',timeout:10000});
      try{available=JSON.parse(auth.stdout).loggedIn===true;reason=available?null:'Claude CLI reports no active sign-in';}catch{available=false;reason='Claude authentication status unobservable';}
    }
    hosts.set(name,{available,reason,version:version.status===0?version.stdout.trim():null});
  }
  return hosts;
}
function hostContext(hosts,environment) {
  return {schema_version:1,environment_sha256:hash(JSON.stringify(environment)),
    versions:Object.fromEntries([...hosts].map(([name,cli])=>[name,cli.version])),
    ...(hosts.has('codex')?{codex:{disabled_skills:disabledCodexSkills(environment.HOME),plugins:false}}:{})};
}
function checkQualification(root,capability,context) {
  let bytes,manifest;
  try {bytes=fs.readFileSync(path.join(root,'instrument.json'));manifest=JSON.parse(bytes);}
  catch {throw new Error('Capability probe has no readable instrument manifest.');}
  if(hash(bytes)!==capability.instrument_sha256||manifest.schema_version!==2||JSON.stringify(Object.keys(manifest.files??{}).sort())!==JSON.stringify([...INSTRUMENT_FILES].sort()))throw new Error('Capability instrument manifest is missing, changed or incompatible.');
  for(const name of INSTRUMENT_FILES){
    let retained;try{retained=fs.readFileSync(path.join(root,'instrument',name));}catch{throw new Error('Capability instrument snapshot is incomplete.');}
    if(hash(retained)!==manifest.files[name]||hash(fs.readFileSync(new URL(name,import.meta.url)))!==manifest.files[name])throw new Error('Capability probe belongs to a different or changed instrument.');
  }
  let contextBytes;try{contextBytes=fs.readFileSync(path.join(root,'host-context.json'));}catch{throw new Error('Capability probe has no frozen host context.');}
  if(hash(contextBytes)!==capability.host_context_sha256||contextBytes.toString()!==JSON.stringify(context,null,2)+'\n')throw new Error('Capability host context changed (CLI, environment or local skills); qualify again.');
}
// HOST CAPABILITY PROBE (2026-09-17). One generic session per host, with the
// cohort's exact adapter and budgets, before any buyer cell spends usage.
// The runner fetches the reference bytes itself first; a host is launched
// only when there is something independent to compare its retention against.
export async function runCapabilityProbe(plan, root) {
  validatePlan(plan);
  if(plan.schema_version<4)throw new Error('Host capability probes belong to schema 4 plans.');
  fs.mkdirSync(root,{mode:0o700});
  writeJson(path.join(root,'plan.json'),plan);
  freezeInstrument(root);
  const environment=childEnvironment(), hosts=hostAvailability(planHosts(plan),environment);
  writeJson(path.join(root,'hosts.json'),Object.fromEntries(hosts));
  const context=hostContext(hosts,environment);writeJson(path.join(root,'host-context.json'),context);
  const summary={schema_version:2,plan_sha256:hash(fs.readFileSync(path.join(root,'plan.json'))),instrument_sha256:hash(fs.readFileSync(path.join(root,'instrument.json'))),host_context_sha256:hash(fs.readFileSync(path.join(root,'host-context.json'))),public_url:plan.capability.public_url,probed_at:new Date().toISOString(),hosts:{},
    limits:['A probe qualifies a host and adapter for retention and a local signature check; it is not a buyer journey and names no service.']};
  for(const [host,cli] of hosts){
    const cell=plan.cells.find(c=>c.host===host);
    if(!cell)continue; // Recipient-only hosts are recorded, not online buyer probes.
    const dir=path.join(root,host);fs.mkdirSync(dir,{mode:0o700});
    const vectors=capabilityVectors();writeJson(path.join(dir,'vectors.json'),vectors);
    fs.writeFileSync(path.join(dir,'prompt.txt'),buildCapabilityPrompt(plan,host,vectors),{flag:'wx',mode:0o600});
    const skip=(state,reason)=>{writeJson(path.join(dir,'run.json'),{schema_version:plan.schema_version,host,runtime:{state,reason},cli});summary.hosts[host]={state,reason};process.stdout.write(JSON.stringify({host,state,reason})+'\n');};
    if(!cli.available){skip('unavailable',cli.reason);continue;}
    let reference;
    try{
      const response=await fetch(plan.capability.public_url,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>plan.budgets.artifact_bytes)throw new Error('reference exceeds the retained-file budget');
      fs.writeFileSync(path.join(dir,'reference.bin'),bytes,{flag:'wx',mode:0o600});
      reference={sha256:hash(bytes),bytes:bytes.length,fetched_at:new Date().toISOString()};
    }catch(error){skip('unavailable',`Runner could not capture reference bytes (${error.message}); host not launched.`);continue;}
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-capability-'));fs.mkdirSync(path.join(cwd,'evidence'),{mode:0o700});
    const launch=adapter(cell,cwd,dir,plan.budgets,context);
    writeJson(path.join(dir,'launch.json'),{...launch,cwd,cli,local_workspace:SESSION_WORKSPACE,environment_keys:Object.keys(sessionEnvironment(cwd,environment)),prompt_sha256:hash(fs.readFileSync(path.join(dir,'prompt.txt')))});
    process.stdout.write(JSON.stringify({host,state:'started'})+'\n');
    const result=await runChild(launch.command,launch.args,{cwd,output:dir,prompt:fs.readFileSync(path.join(dir,'prompt.txt'),'utf8'),host,budgets:plan.budgets,env:environment});
    const run={schema_version:plan.schema_version,host,model:cell.model,...result,cli,reference,retained_artifacts:retainArtifacts(cwd,dir,plan.budgets)};
    writeJson(path.join(dir,'run.json'),run);
    const score=scoreCapability(host,run,dir,vectors,reference);writeJson(path.join(dir,'capability.json'),score);
    summary.hosts[host]={state:score.state,retention:score.retention.state,local_check:score.local_check.state,denied:score.commands.denied,executed:score.commands.executed};
    process.stdout.write(JSON.stringify({host,state:score.state,retention:score.retention.state,local_check:score.local_check.state,denied:score.commands.denied})+'\n');
  }
  writeJson(path.join(root,'capability.json'),summary);
  return summary;
}
export async function runCohort(plan,root,options={}) {
  validatePlan(plan);
  // Schema 4 spends nothing on a host that has not shown, under this exact
  // frozen plan and adapter, that it can keep bytes and run a local check.
  let capability=null;
  if(plan.schema_version>=4){
    if(!options.capability)throw new Error('Schema 4 acquisition requires a completed host capability probe directory (--qualified).');
    const bytes=fs.readFileSync(path.join(options.capability,'capability.json'));
    capability={...JSON.parse(bytes),source_sha256:hash(bytes)};
    if(capability.plan_sha256!==hash(JSON.stringify(plan,null,2)+'\n'))throw new Error('The capability probe was frozen for a different plan.');
  }
  const environment=childEnvironment(), hosts=hostAvailability(planHosts(plan),environment),context=hostContext(hosts,environment);
  if(capability)checkQualification(options.capability,capability,context);
  fs.mkdirSync(root,{mode:0o700}); // Must be new: never clobber a prior cohort.
  writeJson(path.join(root,'plan.json'),plan);
  if(capability)writeJson(path.join(root,'capability.json'),capability);
  freezeInstrument(root);
  writeJson(path.join(root,'hosts.json'),Object.fromEntries(hosts));
  writeJson(path.join(root,'host-context.json'),context);
  if(plan.schema_version>=5){
    const recipient=recipientLaunch(plan,'<fresh-recipient-directory>','<recipient-output>',context);
    writeJson(path.join(root,'recipient-protocol.json'),{...plan.recipient,protocol_sha256:recipient.protocol_sha256,inputs:recipient.inputs,prompt_sha256:hash(recipient.prompt),timing_policy:TIMING_POLICY});
    fs.writeFileSync(path.join(root,'recipient-prompt.txt'),recipient.prompt,{flag:'wx',mode:0o600});
  }
  // Freeze all assignments/prompts before any model runs. The evidence root
  // is outside each neutral working directory and is not supplied as context.
  for(const cell of plan.cells){
    const dir=path.join(root,cell.id);fs.mkdirSync(dir,{mode:0o700});
    fs.writeFileSync(path.join(dir,'prompt.txt'),buildPrompt(plan,cell),{flag:'wx',mode:0o600});
  }
  for(const cell of plan.cells){
    const dir=path.join(root,cell.id),host=hosts.get(cell.host);
    if(capability&&capability.hosts?.[cell.host]?.state!=='pass'){
      const reason=`Host capability probe state: ${capability.hosts?.[cell.host]?.state??'absent'}; no buyer cell launched.`;
      writeJson(path.join(dir,'run.json'),{schema_version:plan.schema_version,cell,subject:plan.subject,runtime:{state:'capability_unqualified',reason},host});
      process.stdout.write(JSON.stringify({cell:cell.id,state:'capability_unqualified',reason})+'\n');continue;
    }
    if(!host.available){
      writeJson(path.join(dir,'run.json'),{schema_version:2,cell,subject:plan.subject,runtime:{state:'unavailable',reason:host.reason},host});
      process.stdout.write(JSON.stringify({cell:cell.id,state:'unavailable',reason:host.reason})+'\n');continue;
    }
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-session-'));
    if(plan.schema_version>=3)fs.mkdirSync(path.join(cwd,'evidence'),{mode:0o700});
    const launch=adapter(cell,cwd,dir,plan.budgets,context);
    writeJson(path.join(dir,'launch.json'),{...launch,cwd,host,local_workspace:SESSION_WORKSPACE,environment_keys:Object.keys(sessionEnvironment(cwd,environment)),prompt_sha256:hash(fs.readFileSync(path.join(dir,'prompt.txt')))});
    process.stdout.write(JSON.stringify({cell:cell.id,state:'started'})+'\n');
    const result=await runChild(launch.command,launch.args,{cwd,output:dir,prompt:fs.readFileSync(path.join(dir,'prompt.txt'),'utf8'),host:cell.host,budgets:plan.budgets,env:environment});
    writeJson(path.join(dir,'run.json'),{schema_version:plan.schema_version,cell,subject:plan.subject,...result,host,...(plan.schema_version>=3?{freshness:plan.freshness,retained_artifacts:retainArtifacts(cwd,dir,plan.budgets)}:{}),isolation:{fresh_directory:true,config_isolated:true,no_session_resume:true,review_required:true}});
    process.stdout.write(JSON.stringify({cell:cell.id,state:result.runtime.state,budget_stop:result.runtime.budget_stop,tool_calls:result.counts.tool_calls})+'\n');
  }
  const score=await scoreCohort(root);writeJson(path.join(root,'score.json'),score);
  return score;
}
async function main(args){
  if(args[0]==='--score'&&args.length===2){const score=await scoreCohort(path.resolve(args[1]));writeJson(path.resolve(args[1],'score.json'),score);console.log(JSON.stringify({discovery:score.discovery,directed:score.directed,...(score.capability?{capability:Object.fromEntries(Object.entries(score.capability.hosts).map(([h,v])=>[h,v.state]))}:{})}));return;}
  const usage='Usage: node scripts/buyer-cold-isolated.mjs --plan plan.json --out NEW_DIRECTORY [--run] [--qualified PROBE_DIRECTORY], --capability plan.json --out NEW_DIRECTORY [--run], or --score DIRECTORY';
  const options={};
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(flag==='--run'){options.run=true;continue;}
    if(['--plan','--out','--qualified','--capability'].includes(flag)&&args[i+1]!==undefined&&!args[i+1].startsWith('--')){options[flag.slice(2)]=args[++i];continue;}
    throw new Error(usage);
  }
  const input=options.capability??options.plan,out=options.out;
  if(!input||!out||(options.capability&&(options.plan||options.qualified)))throw new Error(usage);
  const plan=validatePlan(JSON.parse(fs.readFileSync(input,'utf8')));
  if(options.run&&plan.schema_version!==5)throw new Error('New live CLI runs require schema 5 with a frozen recipient protocol; old plans remain available for dry runs and rescoring.');
  let recipient=null;
  if(!options.run&&plan.schema_version>=5){
    // Preview only the portable protocol/prompt, never a fictitious inventory
    // of locally disabled skills or a claim that a recipient was launched.
    const prepared=recipientLaunch(plan,'<recipient-directory>','<recipient-output>',{codex:{disabled_skills:[]}});
    recipient={protocol:plan.recipient,inputs:prepared.inputs,prompt:prepared.prompt,protocol_sha256:prepared.protocol_sha256,timing_policy:TIMING_POLICY};
  }
  if(options.capability){
    if(!options.run){console.log(JSON.stringify({schema_version:plan.schema_version,execution:'dry_run',...(recipient?{recipient}:{}),spend_usdc:0,public_url:plan.capability.public_url,hosts:[...new Set(plan.cells.map(c=>c.host))].map(host=>({host,prompt:buildCapabilityPrompt(plan,host,capabilityVectors())})),note:'Vectors are minted afresh at the live probe.'},null,2));return;}
    await runCapabilityProbe(plan,path.resolve(out));return;
  }
  if(!options.run){console.log(JSON.stringify({schema_version:plan.schema_version,cells:plan.cells,spend_usdc:0,execution:'dry_run',...(recipient?{recipient}:{}),...(plan.schema_version>=4?{capability_gate:'A passed probe for this exact plan is required at --run (--qualified).'}:{}),prompts:plan.cells.map(cell=>({id:cell.id,prompt:buildPrompt(plan,cell)}))},null,2));return;}
  await runCohort(plan,path.resolve(out),{capability:options.qualified?path.resolve(options.qualified):undefined});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});}
