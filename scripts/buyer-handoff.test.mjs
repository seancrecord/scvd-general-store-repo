import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
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
test('automatic whole-capture handoffs leave citation status unknown and cannot omit a file',()=>{
 const f=fixture();try{
  f.selection.scope='buyer_report';f.selection.citation_policy='unclassified';
  for(const row of f.selection.files){row.supply=true;row.cited=null;row.role='other';}
  f.selection.files[0].supply=false;
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out));assert.equal(fs.existsSync(f.out),false);
  f.selection.files[0].supply=true;
  const manifest=prepareHandoff(f.root,f.selection,f.out);
  assert.equal(manifest.citation_policy,'unclassified');assert.ok(manifest.files.every(row=>row.cited_in_report===null&&row.supplied));
  assert.match(fs.readFileSync(path.join(f.out,'recipient-prompt.txt'),'utf8'),/citation status are unclassified/);
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

// Opt in only for a new frozen plan: old cohorts keep their library-only prompt.
function cliPlan(){
 const plan=structuredClone(fullPlan);plan.schema_version=6;
 const pkg=JSON.parse(fs.readFileSync(new URL('../verifier/package.json',import.meta.url)));
 plan.recipient.verifier={name:pkg.name,version:pkg.version,files:Object.fromEntries(['evidence-cli.mjs','evidence-bundle.js','x402-verify.js','package.json'].map(file=>[file,hash(fs.readFileSync(new URL('../verifier/'+file,import.meta.url)))]))};
 return plan;
}
async function cliFrozen(plan=cliPlan()){
 const {recipientLaunch}=await import('./lib/buyer-cold.mjs');
 const launch=recipientLaunch(plan,'<recipient>','<output>',{codex:{disabled_skills:[]}});
 return {plan,protocol:{...plan.recipient,protocol_sha256:launch.protocol_sha256,inputs:launch.inputs,prompt_sha256:hash(launch.prompt)},prompt:launch.prompt};
}
test('a new frozen CLI handoff supplies executable pinned package bytes without selecting buyer evidence',async()=>{
 const f=fixture();try{
  const frozen=await cliFrozen();f.selection.scope='buyer_report';f.selection.citation_policy='unclassified';
  for(const row of f.selection.files){row.supply=true;row.cited=null;row.role='other';}
  assert.ok(frozen.protocol.inputs.includes('evidence-cli.mjs'));
  assert.match(frozen.prompt,/node evidence-cli\.mjs verify-source artifacts\/ORIGINAL_FILE/);
  assert.match(frozen.prompt,/--subject EXACT_SUBJECT_URL/);
  const m=prepareHandoff(f.root,f.selection,f.out,frozen);
  assert.deepEqual(m.verifier,frozen.plan.recipient.verifier);
  assert.equal(m.machinery.length,4);
  for(const [file,digest] of Object.entries(frozen.plan.recipient.verifier.files))assert.equal(hash(fs.readFileSync(path.join(f.out,file))),digest);
  assert.ok(m.files.every(row=>row.supplied&&row.cited_in_report===null));
  const result=spawnSync(process.execPath,['evidence-cli.mjs','--help'],{cwd:f.out,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/--subject/);
  const old=await frozenFixture();assert.ok(!old.protocol.inputs.includes('evidence-cli.mjs'));assert.doesNotMatch(old.prompt,/node evidence-cli/);
 }finally{f.clean();}
});
for(const change of ['missing hash','extra file','bad hash','wrong package','legacy schema','subset'])test(`CLI plan refuses ${change}`,async()=>{
 const plan=cliPlan();
 if(change==='missing hash')delete plan.recipient.verifier.files['evidence-cli.mjs'];
 if(change==='extra file')plan.recipient.verifier.files['../extra.js']='0'.repeat(64);
 if(change==='bad hash')plan.recipient.verifier.files['evidence-cli.mjs']='not-a-hash';
 if(change==='wrong package')plan.recipient.verifier.name='another-package';
 if(change==='legacy schema')plan.schema_version=5;
 if(change==='subset')plan.recipient.input_scope='signed-pair-and-buyer-report';
 await assert.rejects(cliFrozen(plan));
});
for(const change of ['changed CLI','changed package metadata','wrong version'])test(`CLI handoff refuses ${change} before writing files`,async()=>{
 const f=fixture();try{
  const plan=cliPlan();
  if(change==='changed CLI')plan.recipient.verifier.files['evidence-cli.mjs']='0'.repeat(64);
  if(change==='changed package metadata')plan.recipient.verifier.files['package.json']='0'.repeat(64);
  if(change==='wrong version')plan.recipient.verifier.version='999.0.0';
  const frozen=await cliFrozen(plan);f.selection.scope='buyer_report';for(const row of f.selection.files)row.supply=true;
  assert.throws(()=>prepareHandoff(f.root,f.selection,f.out,frozen),/verifier|package/i);assert.equal(fs.existsSync(f.out),false);
 }finally{f.clean();}
});

test('the supplied CLI verifies the retained original and excludes unsigned history in the actual recipient directory',async()=>{
 const f=fixture();try{
  const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const snapshot={version:1,sequence:1,taken_at:'2026-09-18T00:00:00Z',previous_digest:null,source:'ward_round',week:'2026-W38',round:{hosts:[{url:fullPlan.subject,observed_at:'2026-09-07T00:00:00Z',gaps:['delivery unobserved']}]}};
  const payload=JSON.stringify(snapshot),doc={snapshot,digest:hash(payload),signature:sign(null,Buffer.from(payload),pair.privateKey).toString('hex'),public_key:key,history:[{url:fullPlan.subject,observed_at:'2026-09-18T00:00:00Z'}]};
  const original=JSON.stringify(doc),ref=f.run.retained_artifacts.files[0];
  fs.writeFileSync(path.join(f.root,ref.file),original);ref.bytes=Buffer.byteLength(original);ref.sha256=hash(original);fs.writeFileSync(path.join(f.root,'run.json'),JSON.stringify(f.run));
  f.selection.scope='buyer_report';for(const row of f.selection.files)row.supply=true;
  const frozen=await cliFrozen(),m=prepareHandoff(f.root,f.selection,f.out,frozen);
  const args=['evidence-cli.mjs','verify-source',m.files[0].destination,'--public-key',key,'--max-bytes',String(fullPlan.budgets.artifact_bytes),'--subject',fullPlan.subject];
  const result=spawnSync(process.execPath,args,{cwd:f.out,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.valid,true);assert.equal(report.source_sha256,hash(original));assert.equal(report.subject_evidence.matched_observations,1);assert.equal(report.subject_evidence.observations[0].value.observed_at,'2026-09-07T00:00:00Z');assert.deepEqual(report.subject_evidence.observations[0].value.gaps,['delivery unobserved']);
  doc.snapshot.round.hosts[0].observed_at='2026-09-18T00:00:00Z';doc.digest=hash(JSON.stringify(doc.snapshot));fs.writeFileSync(path.join(f.out,m.files[0].destination),JSON.stringify(doc));
  const tampered=spawnSync(process.execPath,args,{cwd:f.out,encoding:'utf8'});assert.equal(tampered.status,1);assert.equal(JSON.parse(tampered.stdout).subject_evidence.status,'not_verified');
  assert.equal(fs.readFileSync(path.join(f.root,ref.file),'utf8'),original);
 }finally{f.clean();}
});

// Execute the example the recipient actually sees, using the same two modules
// the preparer supplies. A prose promise of scope separation is not this test.
async function scopeExampleFixture() {
 const {generateKeyPairSync,sign}=await import('node:crypto');
 const {inventoryRecipientPrompt}=await import('./lib/buyer-cold.mjs');
 const prompt=inventoryRecipientPrompt('https://merchant.example/paid','buyer_report',{unclassified:true});
 const code=/```js\n([\s\S]*?)\n```/.exec(prompt)?.[1];
 assert.ok(code,'the recipient prompt must supply a runnable scope example');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recipient-scope-'));
 for(const file of ['evidence-bundle.js','x402-verify.js'])fs.copyFileSync(new URL('../verifier/'+file,import.meta.url),path.join(dir,file));
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const subject='https://merchant.example/paid';
 const snapshot={version:1,sequence:1,taken_at:'2026-09-18T12:00:00Z',previous_digest:null,source:'ward_round',week:'2026-W37',round:{hosts:[{url:'https://other.example/paid',observed_at:'2026-09-18T10:00:00Z'},{url:subject,observed_at:'2026-09-07T02:30:20.531Z',verdict:'ready',gaps:['unpaid probe']}]}};
 const envelope=claims=>{const signed_payload=JSON.stringify(claims);return {algorithm:'ed25519',public_key:key,signed_payload,signature:sign(null,Buffer.from(signed_payload),privateKey).toString('hex')};};
 const original={snapshot,digest:hash(JSON.stringify(snapshot)),public_key:key,signature:envelope(snapshot).signature};
 const run=(value=original,issuer=key,target=subject)=>{
  fs.writeFileSync(path.join(dir,'original.json'),JSON.stringify(value));fs.writeFileSync(path.join(dir,'key.json'),JSON.stringify({public_key:issuer}));
  return spawnSync(process.execPath,['--input-type=module','-e',code,'original.json','key.json',target],{cwd:dir,encoding:'utf8',timeout:10000});
 };
 return {dir,subject,original,envelope,run,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('recipient example reports only the exact signed observation and keeps publication separate',async()=>{
 const f=await scopeExampleFixture();try{
  const result=f.run();assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout);
  assert.equal(out.snapshot_publication,'2026-09-18T12:00:00Z');assert.equal(out.snapshot_declared_expiry,null);
  assert.deepEqual(out.authenticated_observations,[{pointer:'/round/hosts/1',subject:f.subject,observed_at:'2026-09-07T02:30:20.531Z',declared_expiry:null}]);
  assert.match(out.scope,/supplied by the caller/);assert.ok(out.limits.some(x=>x.includes('truth')));
  const decorated=structuredClone(f.original);decorated.timeline=[{url:f.subject,observed_at:'2026-09-18T12:00:00Z'},{url:f.subject,observed_at:'2026-09-01T12:00:00Z'}];decorated.expires_at='2099-01-01T00:00:00Z';
  assert.deepEqual(JSON.parse(f.run(decorated).stdout),out);
 }finally{f.clean();}
});
for(const mutation of ['signed tamper','rehash tamper','wrong key','wrong subject','other artifact','missing bound evidence'])test(`recipient example reports no authenticated observations for ${mutation}`,async()=>{
 const f=await scopeExampleFixture();try{
  let value=structuredClone(f.original),key=value.public_key,subject=f.subject;
  if(mutation==='signed tamper'||mutation==='rehash tamper')value.snapshot.round.hosts[1].observed_at='2026-09-18T12:00:00Z';
  if(mutation==='rehash tamper')value.digest=hash(JSON.stringify(value.snapshot));
  if(mutation==='wrong key')key='00'.repeat(32);
  if(mutation==='wrong subject')subject+='?different=true';
  if(mutation==='other artifact')value=f.envelope({subject:f.subject,observed_at:'2026-09-07T02:30:20.531Z'});
  if(mutation==='missing bound evidence')value=f.envelope({...value.snapshot,attests:'12'.repeat(32)});
  const result=f.run(value,key,subject);assert.notEqual(result.status,0);assert.equal(result.stdout,'');
 }finally{f.clean();}
});
test('skill capture commands preserve a large original and separately fetched key byte for byte',async()=>{
 const {createServer}=await import('node:http');const {promisify}=await import('node:util');const {execFile}=await import('node:child_process');
 const skill=fs.readFileSync(new URL('../skills/scvd-x402-verification/SKILL.md',import.meta.url),'utf8');
 const commands=[...skill.matchAll(/^curl --fail --output (\.\/evidence\/\S+) "([^"]+)"$/gm)];
 assert.equal(commands.length,2,'whole original and issuer key each need a standalone capture command');
 assert.deepEqual(commands.map(x=>x[2]),['ACTUAL_CITED_SNAPSHOT_URL','https://scvd.store/.well-known/scvd-signing-key']);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-capture-'));fs.mkdirSync(path.join(dir,'evidence'));
 const bodies=[Buffer.from(JSON.stringify({padding:'é'.repeat(1600000),signature:'original bytes'})),Buffer.from('{"public_key":"separately obtained"}\n')];
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(bodies[req.url==='/0'?0:1]);});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const [i,command] of commands.entries()){
   // Substitute only the external URL with a local fixture server. Exercise
   // the documented executable and flags, without an Internet dependency.
   await promisify(execFile)('curl',['--fail','--output',command[1],`http://127.0.0.1:${server.address().port}/${i}`],{cwd:dir});
   assert.deepEqual(fs.readFileSync(path.join(dir,command[1])),bodies[i]);
  }
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
