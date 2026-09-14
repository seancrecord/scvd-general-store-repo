import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync,statSync,existsSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { api,fixture } from './test-fixtures.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const age=process.env.SCVD_AGE_BIN;
assert.ok(age&&path.isAbsolute(age),'Set SCVD_AGE_BIN to the independently qualified age executable. These are real encryption tests.');
const keygen=path.join(path.dirname(age),'age-keygen');
const tmp=()=>mkdtempSync(path.join(tmpdir(),'scvd-encryption-test-'));
async function setup(dir) {
 const f=await fixture({closed:true});
 // Force multiple authenticated age chunks while keeping the original state valid.
 f.rows.at(-1).body+=' '.repeat(80000);
 for(const r of f.rows)r.sha256=api.recordDigest(r);
 f.manifest.bodyBytes=f.rows.reduce((n,r)=>n+api.size(r.body),0);
 f.manifest.recordsSha256=api.digest(f.rows.map(r=>r.sha256+'\n').join(''));
 f.manifestSha256=api.manifestDigest(f.manifest);
 writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(f.manifest),{mode:0o600});
 writeFileSync(path.join(dir,'records.ndjson'),f.rows.map(r=>JSON.stringify(r)+'\n').join(''),{mode:0o600});
 for(const name of ['identity','wrong']) {
  const generated=spawnSync(keygen,['-pq','-o',path.join(dir,name)],{encoding:'utf8'});
  assert.equal(generated.status,0,'Synthetic key generation failed');
 }
 const publicKey=spawnSync(keygen,['-y',path.join(dir,'identity')],{encoding:'utf8'});
 assert.equal(publicKey.status,0);
 writeFileSync(path.join(dir,'recipient'),publicKey.stdout,{mode:0o600});
 let cli=path.join(here,'.build-check/encrypted-cli.mjs');
 if(process.env.SCVD_BACKUP_ENCRYPTION_MUTATION) {
  assert.equal(process.env.SCVD_BACKUP_ENCRYPTION_MUTATION,'exit');cli=path.join(dir,'mutated-cli.mjs');
  await build({entryPoints:[path.join(here,'encrypted-cli.ts')],outfile:cli,bundle:true,platform:'node',format:'esm',plugins:[{name:'exit-negative-control',setup(b){b.onLoad({filter:/backup\/encrypted\.ts$/},args=>{const source=readFileSync(args.path,'utf8'),guard='code===0?yes()';assert.ok(source.includes(guard));return {contents:source.replace(guard,'true?yes()'),loader:'ts'};});}}]});
 }
 const run=(mode,options={})=>spawnSync(process.execPath,[cli,mode,options.binary??age,options.input??(mode==='seal'?dir:path.join(dir,'archive.age')),options.hash??f.manifestSha256,options.key??path.join(dir,mode==='seal'?'recipient':'identity'),options.output??path.join(dir,mode==='seal'?'archive.age':'restored.sqlite')],{encoding:'utf8',timeout:20000});
 return {f,run};
}
function refused(result,dir,output='restored.sqlite') {
 assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
 assert.match(result.stderr,/Encrypted backup refused\./);
 assert.equal(existsSync(path.join(dir,output)),false);
 assert.ok(!readdirSync(dir).some(n=>n.startsWith('.screening-')),'no ordinary-failure staging residue');
}
test('real hybrid encryption and restore preserve exact recovered state and no live authority',async()=>{
 const dir=tmp();try{const {f,run}=await setup(dir),sealed=run('seal');assert.equal(sealed.status,0,sealed.stderr);
  const receipt=JSON.parse(sealed.stdout),bytes=readFileSync(path.join(dir,'archive.age'));
  assert.equal(receipt.remoteDeliveryVerified,false);assert.equal(receipt.ciphertextBytes,bytes.length);
  assert.equal(receipt.ciphertextSha256,api.digest(bytes));
  assert.equal(bytes.includes(Buffer.from('fixture_buyer')),false);
  assert.equal(bytes.includes(Buffer.from(f.rows[0].body)),false);
  const opened=run('open');assert.equal(opened.status,0,opened.stderr);assert.equal(JSON.parse(opened.stdout).ageAuthenticated,true);
  const db=new DatabaseSync(path.join(dir,'restored.sqlite'));try{
   assert.deepEqual(db.prepare('SELECT body FROM restore_rows ORDER BY n').all().map(r=>JSON.parse(r.body)),f.rows.map(r=>({...r})));
   const meta=JSON.parse(db.prepare('SELECT body FROM restore_meta').get().body);assert.equal(meta.quarantined,true);assert.equal(meta.receipt.admissionsEnabled,false);
   assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'screening_%'").get().n,0);
  }finally{db.close();}
  for(const file of ['archive.age','restored.sqlite'])assert.equal(statSync(path.join(dir,file)).mode&0o777,0o600);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['wrong_key','wrong_hash','tampered','truncated','appended','missing_input'])test('encrypted restore refuses '+mode,async()=>{
 const dir=tmp();try{const {run}=await setup(dir);assert.equal(run('seal').status,0);
  const file=path.join(dir,'archive.age');let options={};
  if(mode==='wrong_key')options.key=path.join(dir,'wrong');
  if(mode==='wrong_hash')options.hash='0'.repeat(64);
  if(mode==='tampered'){const bytes=readFileSync(file);bytes[bytes.length-25]^=1;writeFileSync(file,bytes);}
  if(mode==='truncated'){const bytes=readFileSync(file);writeFileSync(file,bytes.subarray(0,-1));}
  if(mode==='appended')writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('trailing')]));
  if(mode==='missing_input')options.input=path.join(dir,'absent');
  refused(run('open',options),dir);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['wrong_hash','bad_record','missing_newline','private_recipient','classic_recipient','missing_tool'])test('seal refuses '+mode,async()=>{
 const dir=tmp();try{const {run}=await setup(dir);let options={};
  if(mode==='wrong_hash')options.hash='0'.repeat(64);
  if(mode==='bad_record'){const p=path.join(dir,'records.ndjson');writeFileSync(p,readFileSync(p,'utf8').replace('fixture_buyer','tampered_buyer'));}
  if(mode==='missing_newline'){const p=path.join(dir,'records.ndjson');writeFileSync(p,readFileSync(p).subarray(0,-1));}
  if(mode==='private_recipient')options.key=path.join(dir,'identity');
  if(mode==='classic_recipient')writeFileSync(path.join(dir,'recipient'),'age1gde3ncmahlqd9gg50tanl99r960llztrhfapnmx853s4tjum03uqfssgdh');
  if(mode==='missing_tool')options.binary=path.join(dir,'absent');
  refused(run('seal',options),dir,'archive.age');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['seal','open'])for(const symlink of [false,true])test(`${mode} refuses overwrite of ${symlink?'symlink':'file'}`,async()=>{
 const dir=tmp();try{const {run}=await setup(dir);if(mode==='open')assert.equal(run('seal').status,0);
  const output=path.join(dir,'existing'),target=path.join(dir,'target');writeFileSync(target,'original');
  if(symlink)symlinkSync(target,output);else writeFileSync(output,'original');
  assert.equal(run(mode,{output}).status,1);assert.equal(readFileSync(output,'utf8'),'original');assert.equal(readFileSync(target,'utf8'),'original');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('complete decrypted plaintext followed by tool failure never publishes a verified restore',async()=>{
 const dir=tmp();try{const {f,run}=await setup(dir);
  const payload=JSON.stringify({format:'scvd-screening-age-stream-v1',manifest:f.manifest})+'\n'+f.rows.map(r=>JSON.stringify(r)+'\n').join('');
  writeFileSync(path.join(dir,'payload'),payload,{mode:0o600});writeFileSync(path.join(dir,'archive.age'),'synthetic input');
  const binary=path.join(dir,'late-failure');
  writeFileSync(binary,`#!${process.execPath}\nif(process.argv[2]==='--version'){process.stdout.write('v1.3.2\\n');}else{process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(path.join(dir,'payload'))}),()=>process.exit(1));});}`,{mode:0o700});
  refused(run('open',{binary}),dir);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['exact','edited','short','extra'])test('ciphertext readback '+mode,async()=>{
 const dir=tmp();try{const {run}=await setup(dir),sealed=run('seal');assert.equal(sealed.status,0,sealed.stderr);
  const receipt=JSON.parse(sealed.stdout),file=path.join(dir,'downloaded.age'),bytes=readFileSync(path.join(dir,'archive.age'));
  if(mode==='edited')bytes[bytes.length-1]^=1;
  writeFileSync(file,mode==='short'?bytes.subarray(0,-1):mode==='extra'?Buffer.concat([bytes,Buffer.from('!')]):bytes);
  const checked=spawnSync(process.execPath,[path.join(here,'.build-check/encrypted-cli.mjs'),'check-copy',file,receipt.ciphertextSha256,String(receipt.ciphertextBytes)],{encoding:'utf8'});
  if(mode==='exact'){assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).copyMatches,true);assert.equal(JSON.parse(checked.stdout).remoteOriginVerified,false);}
  else {assert.equal(checked.status,1);assert.equal(checked.stdout,'');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('unqualified version and private tool diagnostics are refused without echoing them',async()=>{
 const dir=tmp();try{const {run}=await setup(dir),binary=path.join(dir,'bad-tool');
  for(const version of ['v0.0.0','v1.3.2']) {
   writeFileSync(binary,`#!${process.execPath}\nif(process.argv[2]==='--version'){process.stdout.write('${version}\\n');}else{process.stderr.write('synthetic_private_diagnostic');process.exit(1);}`,{mode:0o700});
   const result=run('seal',{binary});refused(result,dir,'archive.age');assert.ok(!result.stderr.includes('synthetic_private_diagnostic'));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
