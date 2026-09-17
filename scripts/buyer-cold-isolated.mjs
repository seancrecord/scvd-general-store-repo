// Fresh public-only processes, never a conversation fork. Live execution is
// explicit; deterministic tests and rescoring do not launch an agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {adapter, buildPrompt, validatePlan, normalizeTrace, hash, scoreColdRun, cohortSummary} from './lib/buyer-cold.mjs';

import {retainArtifacts} from './lib/buyer-retention.mjs';
export {retainArtifacts};

const writeJson = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value,null,2)+'\n', {mode:0o600});
// CLI authentication remains internal to each host; wallet/API credentials
// and the parent task's context are not copied into the child environment.
export function childEnvironment(source=process.env) {
  return Object.fromEntries(['PATH','HOME','TMPDIR','SHELL','USER','LANG'].filter(k=>source[k]).map(k=>[k,source[k]]));
}
export async function runChild(command, args, {cwd, output, prompt, host, budgets, env=childEnvironment()}) {
  const started_at = new Date().toISOString();
  const events = fs.openSync(path.join(output,'events.jsonl'),'wx',0o600);
  const logs = fs.openSync(path.join(output,'runtime.log'),'wx',0o600);
  let stdout='', stderr='', bytes=0, budget_stop=null, spawn_error=null, escalation;
  const child = spawn(command,args,{cwd,env,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  const terminate = () => {
    try { if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM'); } catch { /* Already exited. */ }
    escalation = setTimeout(()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}},1000);
    escalation.unref();
  };
  const stop = reason => {if(!budget_stop){budget_stop=reason;terminate();}};
  const timer = setTimeout(()=>stop('wall_ms'),budgets.wall_ms);
  const collect = (chunk, fd, stream) => {
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
    child.on('close',(exit_code,signal)=>resolve({exit_code,signal}));
  });
  clearTimeout(timer); clearTimeout(escalation);
  fs.closeSync(events);fs.closeSync(logs);
  const counts=normalizeTrace(host,stdout);
  const terminalFailure=stdout.split('\n').some(line=>{try{const r=JSON.parse(line);return r.type==='turn.failed'||(r.type==='result'&&r.is_error===true);}catch{return false;}});
  return {started_at,ended_at:new Date().toISOString(),runtime:{state:spawn_error?'unavailable':result.exit_code===0&&!terminalFailure?'completed':'failed',...result,spawn_error,budget_stop},counts,trace_sha256:hash(fs.readFileSync(path.join(output,'events.jsonl'))),
    output_bytes:bytes,limits:['Token target is advisory; wall time and retained bytes are bounded. Tool budget stops after an over-budget event is observed; batched calls can exceed it.','Host tool events do not establish origin-request count or absence of hidden context.']};
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
  return {...cohortSummary(rows),scorer_sha256:hash(fs.readFileSync(new URL('lib/buyer-cold.mjs',import.meta.url))),plan_sha256:hash(fs.readFileSync(path.join(root,'plan.json'))),runs:rows};
}
export async function runCohort(plan,root) {
  validatePlan(plan);
  fs.mkdirSync(root,{mode:0o700}); // Must be new: never clobber a prior cohort.
  writeJson(path.join(root,'plan.json'),plan);
  const instrumentFiles = {};
  for (const name of ['buyer-cold-isolated.mjs','lib/buyer-cold.mjs','lib/buyer-run-evidence.mjs','lib/buyer-retention.mjs','../verifier/evidence-bundle.js','../verifier/x402-verify.js']) {
    const bytes=fs.readFileSync(new URL(name,import.meta.url)), destination=path.join(root,'instrument',name);
    fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    fs.writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
    instrumentFiles[name]=hash(bytes);
  }
  writeJson(path.join(root,'instrument.json'),{schema_version:2,files:instrumentFiles});
  const environment=childEnvironment(), hosts=new Map();
  for(const cell of plan.cells){
    if(hosts.has(cell.host))continue;
    const version=spawnSync(cell.host,['--version'],{env:environment,encoding:'utf8',timeout:10000});
    let available=version.status===0,reason=available?null:'CLI version check failed';
    if(available&&cell.host==='claude'){
      const auth=spawnSync(cell.host,['auth','status'],{env:environment,encoding:'utf8',timeout:10000});
      try{available=JSON.parse(auth.stdout).loggedIn===true;reason=available?null:'Claude CLI reports no active sign-in';}catch{available=false;reason='Claude authentication status unobservable';}
    }
    hosts.set(cell.host,{available,reason,version:version.status===0?version.stdout.trim():null});
  }
  writeJson(path.join(root,'hosts.json'),Object.fromEntries(hosts));
  // Freeze all assignments/prompts before any model runs. The evidence root
  // is outside each neutral working directory and is not supplied as context.
  for(const cell of plan.cells){
    const dir=path.join(root,cell.id);fs.mkdirSync(dir,{mode:0o700});
    fs.writeFileSync(path.join(dir,'prompt.txt'),buildPrompt(plan,cell),{flag:'wx',mode:0o600});
  }
  for(const cell of plan.cells){
    const dir=path.join(root,cell.id),host=hosts.get(cell.host);
    if(!host.available){
      writeJson(path.join(dir,'run.json'),{schema_version:2,cell,subject:plan.subject,runtime:{state:'unavailable',reason:host.reason},host});
      process.stdout.write(JSON.stringify({cell:cell.id,state:'unavailable',reason:host.reason})+'\n');continue;
    }
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-session-'));
    if(plan.schema_version===3)fs.mkdirSync(path.join(cwd,'evidence'),{mode:0o700});
    const launch=adapter(cell,cwd,dir,plan.budgets);
    writeJson(path.join(dir,'launch.json'),{...launch,cwd,host,environment_keys:Object.keys(environment),prompt_sha256:hash(fs.readFileSync(path.join(dir,'prompt.txt')))});
    process.stdout.write(JSON.stringify({cell:cell.id,state:'started'})+'\n');
    const result=await runChild(launch.command,launch.args,{cwd,output:dir,prompt:fs.readFileSync(path.join(dir,'prompt.txt'),'utf8'),host:cell.host,budgets:plan.budgets,env:environment});
    writeJson(path.join(dir,'run.json'),{schema_version:plan.schema_version,cell,subject:plan.subject,...result,host,...(plan.schema_version===3?{freshness:plan.freshness,retained_artifacts:retainArtifacts(cwd,dir,plan.budgets)}:{}),isolation:{fresh_directory:true,config_isolated:true,no_session_resume:true,review_required:true}});
    process.stdout.write(JSON.stringify({cell:cell.id,state:result.runtime.state,budget_stop:result.runtime.budget_stop,tool_calls:result.counts.tool_calls})+'\n');
  }
  const score=await scoreCohort(root);writeJson(path.join(root,'score.json'),score);
  return score;
}
async function main(args){
  if(args[0]==='--score'&&args.length===2){const score=await scoreCohort(path.resolve(args[1]));writeJson(path.resolve(args[1],'score.json'),score);console.log(JSON.stringify({discovery:score.discovery,directed:score.directed}));return;}
  const value=flag=>{const i=args.indexOf(flag);return i===-1?null:args[i+1];};
  const input=value('--plan'),out=value('--out');
  if(!input||!out||args.some((a,i)=>i%2===0&&!['--plan','--out','--run'].includes(a))){throw new Error('Usage: node scripts/buyer-cold-isolated.mjs --plan plan.json --out NEW_DIRECTORY [--run], or --score DIRECTORY');}
  const plan=validatePlan(JSON.parse(fs.readFileSync(input,'utf8')));
  if(!args.includes('--run')){console.log(JSON.stringify({schema_version:2,cells:plan.cells,spend_usdc:0,execution:'dry_run',prompts:plan.cells.map(cell=>({id:cell.id,prompt:buildPrompt(plan,cell)}))},null,2));return;}
  await runCohort(plan,path.resolve(out));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});}
