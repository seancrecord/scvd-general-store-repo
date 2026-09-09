import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { checkReport, summarizeCoverage } from './lib/evidence-coverage.mjs';
const pair = generateKeyPairSync('ed25519');
const key = pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
const hash = x => createHash('sha256').update(x).digest('hex');
const core = { audit_id:'audit_test', observed_at:'2026-09-09', facts:'a door' };
const payload = { ...core, evidence_hash:hash(JSON.stringify(core)), scope:'one read' };
const signed = { ...payload, signature:sign(null,Buffer.from(JSON.stringify(payload)),pair.privateKey).toString('hex'),public_key:key,signature_covers:'fields before signature' };
test('verifies report bytes and recomputes the certificate binding; tampering does not pass', () => {
 assert.equal(checkReport({audit:signed},'core',[key]).status,'verified');
 const changed = structuredClone(signed);changed.facts='different';
 assert.equal(checkReport({audit:changed},'core',[key]).status,'invalid_signature');
 const wrong = {...payload,evidence_hash:'0'.repeat(64)};
 const resigned = {...wrong,signature:sign(null,Buffer.from(JSON.stringify(wrong)),pair.privateKey).toString('hex'),public_key:key};
 assert.equal(checkReport({audit:resigned},'core',[key]).status,'hash_mismatch');
 assert.equal(checkReport({audit:signed},'core',[]).status,'untrusted_key');
});
test('missing and unreadable certificates stay in the denominator; unresolved links and partial lists stay explicit', () => {
 const result = summarizeCoverage([
  {status:'verified',attests:payload.evidence_hash,anchor:'pending',saw:'a'.repeat(64)},
  {status:'verified',attests:'b'.repeat(64),anchor:'absent'},
  {status:'unreadable'}, {status:'missing'},
 ],[{status:'verified',evidence_hash:payload.evidence_hash}],false);
 assert.equal(result.certificates.listed,4);
 assert.equal(result.certificates.unreadable,1);
 assert.equal(result.certificates.missing,1);
 assert.equal(result.links.matched_verified_report,1);
 assert.equal(result.links.not_found_in_verified_inventory,1);
 assert.equal(result.inventory_lists_complete,false);
 assert.equal(result.timestamps.independently_verified,0);
});

test('certificate canonicalization follows production and excludes unsigned legacy bindings', async () => {
 const {loadInventorySchema}=await import('./lib/load-inventory-schema.mjs');
 const {canonicalizeCertificate,canonicalizeCertificateLegacy}=await loadInventorySchema();
 const {checkCertificate}=await import('./lib/evidence-coverage.mjs');
 const cert={cert_id:'cert_test',item:'audit',patron_number:1,date:'2026-09-09',attests:payload.evidence_hash};
 const make=canonical=>({certificate:cert,signature:sign(null,Buffer.from(canonical(cert)),pair.privateKey).toString('hex'),public_key:key});
 const current=checkCertificate(make(canonicalizeCertificate),[key],canonicalizeCertificate,canonicalizeCertificateLegacy);
 assert.equal(current.status,'verified');assert.equal(current.attests,payload.evidence_hash);
 const legacy=checkCertificate(make(canonicalizeCertificateLegacy),[key],canonicalizeCertificate,canonicalizeCertificateLegacy);
 assert.equal(legacy.form,'legacy');assert.equal(legacy.attests,null);
 const broken=make(canonicalizeCertificate);broken.certificate={...cert,item:'rewritten'};
 assert.equal(checkCertificate(broken,[key],canonicalizeCertificate,canonicalizeCertificateLegacy).status,'invalid_signature');
});

test('offline command preserves the listed denominator when a captured record is deleted', async () => {
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {loadInventorySchema}=await import('./lib/load-inventory-schema.mjs');
 const {canonicalizeCertificate}=await loadInventorySchema();
 const dir=await mkdtemp(join(tmpdir(),'scvd-inventory-test-'));
 const cert={cert_id:'cert_test',item:'audit',patron_number:1,date:'2026-09-09',attests:payload.evidence_hash};
 const bytes=JSON.stringify({certificate:cert,signature:sign(null,Buffer.from(canonicalizeCertificate(cert)),pair.privateKey).toString('hex'),public_key:key});
 const list=JSON.stringify([{name:'cert:cert_test'},{name:'cert:missing'}]);
 const reportList=JSON.stringify([{name:'service_audit:audit_test'}]);
 const report=JSON.stringify({audit:signed});
 try{
  await writeFile(join(dir,'keys.json'),JSON.stringify([key]));
  for(const [name,data] of [['certs.json',list],['reports.json',reportList],['cert.json',bytes],['report.json',report]])await writeFile(join(dir,name),data);
  await writeFile(join(dir,'manifest.json'),JSON.stringify({format:'scvd-private-inventory/v1',byte_limit:8*1024*1024,started_at:'2026-09-09',completed_at:'2026-09-09',counters:[],
   families:[{name:'certificates',listed:2,read:2,complete:true,file:'certs.json',sha256:hash(list)},{name:'service_audit',listed:1,read:1,complete:true,file:'reports.json',sha256:hash(reportList)}],
   reads:[{family:'certificates',key:'cert:cert_test',status:'readable',file:'cert.json',sha256:hash(bytes)},{family:'certificates',key:'cert:missing',status:'readable',file:'deleted.json',sha256:hash(bytes)},{family:'service_audit',key:'service_audit:audit_test',status:'readable',file:'report.json',sha256:hash(report)}]}));
  await promisify(execFile)(process.execPath,[new URL('./evidence-coverage.mjs',import.meta.url).pathname,dir,join(dir,'keys.json')]);
  const result=JSON.parse(await readFile(join(dir,'coverage-summary.json'),'utf8'));
  assert.equal(result.certificates.listed,2);assert.equal(result.certificates.verified,1);assert.equal(result.certificates.unreadable,1);
  assert.equal(result.links.matched_verified_report,1);assert.equal(result.inventory_lists_complete,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
