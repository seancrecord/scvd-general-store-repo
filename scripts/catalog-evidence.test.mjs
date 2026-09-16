import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {catalogCandidates,checkCatalogCandidates,joinCatalogEvidence} from './lib/catalog-evidence.mjs';
import {digest} from './lib/evidence-coverage.mjs';
import {loadInventorySchema} from './lib/load-inventory-schema.mjs';
const record=await catalogCandidates();
const candidate=record.candidates[0];

test('catalog candidates derive from production and match only exact bytes and item',()=>{
 assert.ok(record.source_inputs.length>0);
 assert.equal(checkCatalogCandidates(record).length,record.candidates.length);
 const rows=joinCatalogEvidence([
  {cert_id:'one',item:candidate.item,saw:candidate.sha256},
  {cert_id:'two',item:candidate.item,saw:'f'.repeat(64)},
  {cert_id:'three',item:candidate.item},
  {cert_id:'four',item:'different',saw:candidate.sha256},
 ],record);
 assert.deepEqual(rows.map(x=>x.status),['matched_catalog_preimage','unresolved_saw','no_signed_saw','unresolved_saw']);
});

test('changed candidate bytes, duplicate hashes and noncanonical encodings refuse',()=>{
 const altered=structuredClone(record);altered.candidates[0].canonical+=' ';
 assert.throws(()=>checkCatalogCandidates(altered),/Candidate bytes changed/);
 altered.candidates[0].sha256=digest(altered.candidates[0].canonical);
 assert.throws(()=>checkCatalogCandidates(altered),/Noncanonical candidate/);
 const duplicate=structuredClone(record);duplicate.candidates.push(duplicate.candidates[0]);
 assert.throws(()=>checkCatalogCandidates(duplicate),/Duplicate candidate/);
});

test('changed catalog fields cannot recover an old commitment, and input order is preserved',()=>{
 const original={price_usdc:1,required:['first','second'],route:`/api/buy/${candidate.item}`};
 const reversed={...original,required:[...original.required].reverse()};
 const canonical=JSON.stringify(reversed);
 assert.equal(joinCatalogEvidence([{item:candidate.item,saw:digest(JSON.stringify(original))}],{...record,candidates:[{item:candidate.item,canonical,sha256:digest(canonical)}]})[0].status,'unresolved_saw');
 const surface=JSON.parse(candidate.canonical);
 for(const changed of [{...surface,price_usdc:surface.price_usdc+1},{...surface,required:['second','first']}]) {
  const canonical=JSON.stringify(changed);
  const next={...record,candidates:[{item:candidate.item,canonical,sha256:digest(canonical)}]};
  assert.equal(joinCatalogEvidence([{item:candidate.item,saw:candidate.sha256}],next)[0].status,'unresolved_saw');
 }
});

test('offline command preserves the cohort and checks stored bytes, results and certificate signatures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scvd-catalog-test-'));
 const source=join(dir,'source');await mkdir(source);
 const output=join(dir,'supplement');
 const {canonicalizeCertificate,inventoryFamilies}=await loadInventorySchema();
 const pair=generateKeyPairSync('ed25519');
 const key=pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const save=async(base,file,value)=>{const bytes=JSON.stringify(value);await writeFile(join(base,file),bytes);return {file,sha256:digest(bytes)};};
 const certs=[
  {cert_id:'cert_match',item:candidate.item,date:'2026-09-01',patron_number:1,saw:candidate.sha256},
  {cert_id:'cert_missing',item:candidate.item,date:'2026-09-01',patron_number:2,saw:'f'.repeat(64)},
  {cert_id:'cert_legacy',item:candidate.item,date:'2026-08-01',patron_number:3},
 ];
 const prefix=inventoryFamilies.find(x=>x.mode==='certificate').prefix;
 const manifest={format:'scvd-private-inventory/v1',started_at:'2026-09-15',completed_at:'2026-09-15',families:[
  {name:'certificates',complete:true,listed:certs.length,...await save(source,'list.json',certs.map(c=>({name:prefix+c.cert_id})))},
 ],reads:[]};
 for(const c of certs)manifest.reads.push({family:'certificates',key:prefix+c.cert_id,status:'readable',...await save(source,c.cert_id+'.json',{
  certificate:c,signature:sign(null,Buffer.from(canonicalizeCertificate(c)),pair.privateKey).toString('hex'),public_key:key,
 })});
 await save(source,'manifest.json',manifest);await save(dir,'keys.json',[key]);
 const run=async(verify=false,destination=output,suppliedCandidates)=>JSON.parse((await promisify(execFile)(process.execPath,[
  new URL('./catalog-evidence.mjs',import.meta.url).pathname,...(verify?['--verify']:suppliedCandidates?['--candidates',suppliedCandidates]:[]),source,join(dir,'keys.json'),destination,
 ])).stdout);
 try{
  const result=await run();assert.equal(result.certificate_count,3);
  assert.deepEqual(result.outcomes,{matched_catalog_preimage:1,unresolved_saw:1,no_signed_saw:1});
  assert.equal((await run(true)).verified_stored_supplement,true);
  const imported=join(dir,'imported-supplement');
  assert.deepEqual((await run(false,imported,join(output,'candidates.json'))).outcomes,result.outcomes);
  assert.equal((await run(true,imported)).verified_stored_supplement,true);
  const preimage=join(output,`catalog-${candidate.sha256}.json`);
  assert.equal(digest(await readFile(preimage)),candidate.sha256);
  await writeFile(preimage,candidate.canonical+'\n');
  await assert.rejects(run(true),/Detached preimage changed/);
  await writeFile(preimage,candidate.canonical);
  const storedManifest=JSON.parse(await readFile(join(output,'manifest.json')));
  const originalResults=await readFile(join(output,'results.json'));
  await writeFile(join(output,'results.json'),originalResults.toString()+' ');
  await assert.rejects(run(true),/Capture checksum failed/);
  await writeFile(join(output,'results.json'),originalResults);
  const changedResults=JSON.parse(originalResults);changedResults[1].status='matched_catalog_preimage';
  storedManifest.results=await save(output,'results.json',changedResults);
  await save(output,'manifest.json',storedManifest);
  await assert.rejects(run(true),/Stored results disagree/);
  const signed=JSON.parse(await readFile(join(source,'cert_match.json')));const originalSigned=structuredClone(signed);signed.certificate.saw='e'.repeat(64);
  Object.assign(manifest.reads[0],await save(source,'cert_match.json',signed));await save(source,'manifest.json',manifest);
  await assert.rejects(run(true),/Certificate signature did not verify/);
  Object.assign(manifest.reads[0],await save(source,'cert_match.json',originalSigned));await save(source,'manifest.json',manifest);
  await rm(join(source,'cert_missing.json'));
  await assert.rejects(run(),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
