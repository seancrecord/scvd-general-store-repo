// One native-tool control per host. This is not a buyer or capability score.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {adapter,hash,commandEvents,localToolsStatement} from '../../scripts/lib/buyer-cold.mjs';
import {runChild,childEnvironment,retainArtifacts} from '../../scripts/buyer-cold-isolated.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const plan=read(path.join(root,'plan.json'));
const context=read(path.join(root,'private/capability/host-context.json'));
const environment=childEnvironment();
if(context.environment_sha256!==hash(JSON.stringify(environment)))throw Error('Host environment changed; do not reuse the probe.');
const budgets={...plan.budgets,wall_ms:90000,tool_calls:6,output_tokens:1000};
const output=path.join(root,'private/cache-control-v2');fs.mkdirSync(output,{mode:0o700});
const summary={schema_version:2,kind:'native_cache_control',budgets,hosts:{},limits:['Not a buyer, package-install or discovery test. No npm command or network request is requested. The standalone launcher tests exercise actual npm cache resolution; this control checks native-tool environment inheritance and filesystem access.','Version 2 compares canonical filesystem locations. The original lexical-path attempts and scores remain unchanged.']};
for(const host of [...new Set(plan.cells.map(cell=>cell.host))]){
  const cell=plan.cells.find(cell=>cell.host===host),dir=path.join(output,host);
  fs.mkdirSync(dir,{mode:0o700});
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-cache-control-'));
  fs.mkdirSync(path.join(cwd,'evidence'),{mode:0o700});
  const nonce=randomUUID();
  const prompt=`This is a generic check of this session's local tools, not a buyer task. ${localToolsStatement(host)}
Use Node only. Read exactly NPM_CONFIG_CACHE and npm_config_cache from the tool's environment. Independently derive the expected cache directory by joining the current working directory with work/npm-cache. Compare filesystem locations, not just strings: for each variable, require basename npm-cache and use fs.realpathSync on its parent directory to compare with fs.realpathSync of ./work. The parent exists already; the cache directory may not. If both variables identify that expected location, create the cache directory and write ${JSON.stringify(nonce)} to native-cache-check.txt inside it. Otherwise report the mismatch and do not write outside this workspace.
Write ./evidence/cache.json with {"uppercase":<actual first variable or null>,"lowercase":<actual second variable or null>,"expected":<derived path>,"written":<boolean>,"nonce":${JSON.stringify(nonce)}}. Do not claim a write without executing it. Explain refusals or failures.
No network, npm invocation, package installation, other local file reads, credentials, configuration changes, payments or delegation. Stop within 6 tool calls and 90 seconds. Finish briefly.`;
  fs.writeFileSync(path.join(dir,'prompt.txt'),prompt,{flag:'wx',mode:0o600});
  const launch=adapter(cell,cwd,dir,budgets,context);
  save(path.join(dir,'launch.json'),{...launch,cwd,model:cell.model,prompt_sha256:hash(prompt)});
  console.log(JSON.stringify({host,control:'cache',state:'started'}));
  const run=await runChild(launch.command,launch.args,{cwd,output:dir,prompt,host,budgets,env:environment});
  const retained=retainArtifacts(cwd,dir,budgets);
  save(path.join(dir,'run.json'),{...run,retained_artifacts:retained});
  const expected=path.join(cwd,'work/npm-cache'),canonicalExpected=path.join(fs.realpathSync(cwd),'work/npm-cache');let report=null,marker=null;
  try{report=read(path.join(dir,'evidence/cache.json'));}catch{}
  try{marker=fs.readFileSync(path.join(expected,'native-cache-check.txt'),'utf8');}catch{}
  const commands=commandEvents(host,fs.readFileSync(path.join(dir,'events.jsonl'),'utf8'));
  const checks={runtime:run.runtime.state==='completed'&&!run.runtime.budget_stop,retention:retained.state==='complete',uppercase:report?.uppercase===expected,lowercase:report?.lowercase===expected,expected:report?.expected===canonicalExpected,reported_write:report?.written===true&&report?.nonce===nonce,independent_write:marker===nonce,executed:commands.some(command=>command.outcome==='completed')};
  summary.hosts[host]={state:Object.values(checks).every(Boolean)?'pass':'incomplete',checks,started_at:run.started_at,ended_at:run.ended_at,trace_sha256:run.trace_sha256,tool_calls:run.counts.tool_calls,budget_stop:run.runtime.budget_stop};
  console.log(JSON.stringify({host,control:'cache',...summary.hosts[host]}));
}
save(path.join(root,'cache-control-v2.json'),summary);
