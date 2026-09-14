import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,statSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
import {api,fixture} from './test-fixtures.mjs';
const tmp=()=>mkdtempSync(path.join(tmpdir(),'scvd-backup-test-'));
function rehash(f){for(const r of f.rows)r.sha256=api.recordDigest(r);f.manifest.bodyBytes=f.rows.reduce((n,r)=>n+api.size(r.body),0);f.manifest.recordsSha256=api.digest(f.rows.map(r=>r.sha256+'\n').join(''));f.manifestSha256=api.manifestDigest(f.manifest);}
function restore(f,dir){const r=new api.OfflineRestore(path.join(dir,'restore.sqlite'),f.manifest,f.manifestSha256);try{for(const row of f.rows)r.append([row]);return r.finish();}finally{r.close();}}
for(const closed of [false,true])test(`offline restore verifies ${closed?'recovered':'held'} state without enabling admissions`,async()=>{
 const dir=tmp();try{const f=await fixture({closed});assert.equal(restore(f,dir).admissionsEnabled,false);
  const db=new DatabaseSync(path.join(dir,'restore.sqlite'));const rows=db.prepare('SELECT body FROM restore_rows ORDER BY n').all().map(r=>JSON.parse(r.body));assert.deepEqual(rows,f.rows.map(r=>({...r})));
  assert.equal(JSON.parse(db.prepare('SELECT body FROM restore_meta').get().body).quarantined,true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('screening_budget','screening_recovery','screening_evidence')").get().n,0);db.close();
  assert.equal(statSync(path.join(dir,'restore.sqlite')).mode&0o777,0o600);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['edited','missing','duplicate','reordered','wrong_manifest','rehash_without_trusted_hash','cross_case'])test('restore refuses '+mode,async()=>{
 const dir=tmp();try{const f=await fixture({closed:true});
  if(mode==='edited')f.rows.at(-1).body+=' ';
  if(mode==='missing')f.rows.pop();
  if(mode==='duplicate')f.rows.splice(2,0,f.rows[2]);
  if(mode==='reordered')[f.rows[2],f.rows[3]]=[f.rows[3],f.rows[2]];
  if(mode==='wrong_manifest')f.manifest.createdAtMs++;
  if(mode==='rehash_without_trusted_hash'){const expected=f.manifestSha256;f.rows.at(-1).body+=' ';rehash(f);f.manifestSha256=expected;}
  if(mode==='cross_case'){const v=JSON.parse(f.rows.at(-1).body);v.caseId='other';f.rows.at(-1).body=JSON.stringify(v);rehash(f);}
  assert.throws(()=>restore(f,dir));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('restore refuses a linked approval document removed even if replacement hashes are supplied',async()=>{
 const dir=tmp();try{const f=await fixture({closed:true});f.rows.pop();f.manifest.rows--;f.manifest.counts.evidence--;rehash(f);assert.throws(()=>restore(f,dir));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('append failure rolls back the entire page and leaves an unverified quarantined archive',async()=>{
 const dir=tmp();try{const f=await fixture(),r=new api.OfflineRestore(path.join(dir,'restore.sqlite'),f.manifest,f.manifestSha256);
  assert.throws(()=>r.append([f.rows[0],f.rows[0]]));r.close();const db=new DatabaseSync(path.join(dir,'restore.sqlite'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM restore_rows').get().n,0);assert.equal(JSON.parse(db.prepare('SELECT body FROM restore_meta').get().body).verified,false);db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('existing output files are never overwritten',async()=>{
 const dir=tmp();try{const f=await fixture(),file=path.join(dir,'restore.sqlite');writeFileSync(file,'leave this');assert.throws(()=>restore(f,dir));assert.equal(readFileSync(file,'utf8'),'leave this');}finally{rmSync(dir,{recursive:true,force:true});}
});
test('offline CLI consumes bounded newline records and requires the external manifest hash',async()=>{
 const dir=tmp();try{const f=await fixture();writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(f.manifest));writeFileSync(path.join(dir,'records.ndjson'),f.rows.map(r=>JSON.stringify(r)+'\n').join(''));
  const run=spawnSync(process.execPath,[path.join(here,'.build-check/restore-cli.mjs'),dir,f.manifestSha256,path.join(dir,'restored.sqlite')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).verified,true);
  const wrong=spawnSync(process.execPath,[path.join(here,'.build-check/restore-cli.mjs'),dir,'0'.repeat(64),path.join(dir,'wrong.sqlite')],{encoding:'utf8'});assert.equal(wrong.status,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI output is a real file even when its name is SQLite memory syntax',async()=>{
 const dir=tmp();try{const f=await fixture();writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(f.manifest));writeFileSync(path.join(dir,'records.ndjson'),f.rows.map(r=>JSON.stringify(r)+'\n').join(''));
  const run=spawnSync(process.execPath,[path.join(here,'.build-check/restore-cli.mjs'),dir,f.manifestSha256,':memory:'],{cwd:dir,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  assert.ok(statSync(path.join(dir,':memory:')).size>0,'verified output must exist on disk');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
