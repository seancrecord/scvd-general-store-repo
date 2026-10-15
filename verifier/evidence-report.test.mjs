import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cli=new URL('./evidence-cli.mjs',import.meta.url).pathname;
const sha=x=>createHash('sha256').update(x).digest('hex');
const address='0x68e3E7822cf83C824cF9606EC999b5e8a93c85B5';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'scvd-report-'));const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const key=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const subject='https://merchant.example/paid?kind=one';
 const row={url:subject,observed_at:'2026-09-21T02:30:40.084Z',offer:{pay_to_digest:[sha('scvd:payto:v1:'+address.toLowerCase())]},gaps:['No payment made.']};
 const snapshot={version:1,sequence:100,taken_at:'2026-09-27T11:00:00Z',previous_digest:null,source:'ward_round',week:'2026-W39',round:{hosts:[row]}};
 const payload=JSON.stringify(snapshot);const doc={snapshot,digest:sha(payload),public_key:key,signature:sign(null,Buffer.from(payload),privateKey).toString('hex'),history:Array.from({length:4},()=>row)};
 const original=join(dir,'original.json'),headers=join(dir,'headers.txt');await writeFile(original,JSON.stringify(doc));
 const challenge={x402Version:2,resource:{url:subject},accepts:[{scheme:'exact',network:'eip155:8453',asset:'USDC',amount:'1000',payTo:address}]};
 async function saveHeaders(value=challenge,extra=''){await writeFile(headers,'HTTP/2 402\r\nPAYMENT-REQUIRED: '+Buffer.from(JSON.stringify(value)).toString('base64')+'\r\n'+extra+'\r\n');}
 await saveHeaders();
 function run(extra=[]){return spawnSync(process.execPath,[cli,'verify-source',original,'--public-key',key,'--subject',subject,...extra],{encoding:'utf8'});}
 async function saveOriginal(){const payload=JSON.stringify(snapshot);doc.digest=sha(payload);doc.signature=sign(null,Buffer.from(payload),privateKey).toString('hex');await writeFile(original,JSON.stringify(doc));}
 return {dir,key,subject,row,snapshot,payload,doc,original,headers,challenge,saveHeaders,saveOriginal,run,clean:()=>rm(dir,{recursive:true,force:true})};
}
function markdownData(output){const match=output.match(/```json\n([\s\S]*?)\n```/);assert.ok(match,'generated report contains its exact structured result');return JSON.parse(match[1]);}
test('generated report preserves exact hashes and one-snapshot scope despite sequence and unsigned history',async()=>{
 const f=await fixture();try{const before=await readFile(f.original);const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);const report=markdownData(out.stdout);
 assert.equal(report.source_sha256,sha(before));assert.equal(report.signed_message_sha256,sha(f.payload));assert.notEqual(report.source_sha256,report.signed_message_sha256);
 assert.equal(report.corpus_snapshots_verified,1);assert.equal(report.subject_evidence.matched_observations,1);assert.equal(report.subject_evidence.observations[0].value.observed_at,f.row.observed_at);
 assert.match(out.stdout,/Unsigned history.*not authenticated/i);assert.deepEqual(await readFile(f.original),before);
 }finally{await f.clean();}
});
test('header-derived report preserves each exact address and compares only the signed subject digest',async()=>{
 const f=await fixture();try{f.challenge.accepts.push({...f.challenge.accepts[0],network:'eip155:1',payTo:address.slice(0,-1)});await f.saveHeaders();
 const out=f.run(['--challenge-headers',f.headers,'--format','markdown']);assert.equal(out.status,0,out.stderr);const p=markdownData(out.stdout).payment_challenge;
 assert.equal(p.source_sha256,sha(await readFile(f.headers)));assert.equal(p.authenticated,false);assert.equal(p.offers.length,2);assert.equal(p.offers[0].pay_to,address);assert.equal(p.offers[1].pay_to,address.slice(0,-1));
 assert.equal(p.offers[0].comparison,'matched');assert.equal(p.offers[1].comparison,'not_matched');assert.deepEqual(p.offers[0].matched_signed_observations,['/round/hosts/0']);assert.equal(p.offers[1].network,'eip155:1');
 }finally{await f.clean();}
});
test('wrong keys never produce an authenticated report or payment linkage',async()=>{
 const f=await fixture();try{const out=spawnSync(process.execPath,[cli,'verify-source',f.original,'--public-key','00'.repeat(32),'--subject',f.subject,'--challenge-headers',f.headers,'--format','markdown'],{encoding:'utf8'});assert.equal(out.status,1,out.stderr);const r=markdownData(out.stdout);assert.equal(r.signed_message_sha256,null);assert.equal(r.corpus_snapshots_verified,0);assert.equal(r.subject_evidence.matched_observations,null);assert.equal(r.payment_challenge.offers[0].comparison,'unavailable');}finally{await f.clean();}
});
test('a different challenge subject cannot be linked to the signed row',async()=>{
 const f=await fixture();try{f.challenge.resource.url='https://merchant.example/paid';await f.saveHeaders();const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const p=JSON.parse(out.stdout).payment_challenge;assert.equal(p.subject_matches,false);assert.equal(p.offers[0].comparison,'unavailable');}finally{await f.clean();}
});
test('ambiguous payment headers produce a gap, not a selected offer',async()=>{
 const f=await fixture();try{await f.saveHeaders(f.challenge,'payment-required: e30=\r\n');const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const p=JSON.parse(out.stdout).payment_challenge;assert.equal(p.status,'ambiguous_header');assert.deepEqual(p.offers,[]);}finally{await f.clean();}
});
test('missing signed observation time stays explicitly unknown instead of using publication time',async()=>{
 const f=await fixture();try{delete f.row.observed_at;await f.saveOriginal();const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);const r=markdownData(out.stdout);assert.deepEqual(r.observation_dates,[{signed_claims_pointer:'/round/hosts/0',observed_at:null,status:'unknown'}]);assert.equal(r.subject_evidence.snapshot_taken_at,f.snapshot.taken_at);}finally{await f.clean();}
});
test('changed and rehashed signed bytes cannot become a verified report',async()=>{
 const f=await fixture();try{f.row.observed_at='2026-09-28T00:00:00Z';f.doc.digest=sha(JSON.stringify(f.snapshot));await writeFile(f.original,JSON.stringify(f.doc));const out=f.run(['--format','markdown','--challenge-headers',f.headers]);assert.equal(out.status,1,out.stderr);const r=markdownData(out.stdout);assert.equal(r.valid,false);assert.equal(r.signed_message_sha256,null);assert.equal(r.corpus_snapshots_verified,0);assert.deepEqual(r.subject_evidence.observations,[]);assert.equal(r.payment_challenge.offers[0].comparison,'unavailable');}finally{await f.clean();}
});
test('issuer Markdown and HTML stay inside the generated JSON record',async()=>{
 const f=await fixture();try{const attack='\n```\n<img src=x onerror=alert(1)>\n[pay](https://attacker.example)\u2028```';f.row.gaps=[attack];await f.saveOriginal();const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);assert.equal(out.stdout.split('\n').filter(line=>line.startsWith('```')).length,2);assert.equal(markdownData(out.stdout).subject_evidence.observations[0].value.gaps[0],attack);assert.ok(!out.stdout.includes('\u2028'));}finally{await f.clean();}
});
test('omitted signed rows cannot turn an unmatched address into a conclusive mismatch',async()=>{
 const f=await fixture();try{f.row.padding='x'.repeat(40000);await f.saveOriginal();const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const r=JSON.parse(out.stdout);assert.equal(r.subject_evidence.matched_observations,1);assert.equal(r.subject_evidence.omitted_observations,1);assert.deepEqual(r.subject_evidence.observations,[]);assert.equal(r.payment_challenge.offers[0].comparison,'unavailable');}finally{await f.clean();}
});
test('base58 comparison preserves case while EVM comparison follows the shared normalization',async()=>{
 const f=await fixture();try{const base58='Abcdefghijkmnopqrstuvwxyz123456789';f.row.offer.pay_to_digest=[sha('scvd:payto:v1:'+base58),sha('scvd:payto:v1:'+address.toLowerCase())];f.challenge.accepts=[{...f.challenge.accepts[0],network:'solana:test',payTo:base58},{...f.challenge.accepts[0],network:'solana:test',payTo:base58.toLowerCase()},{...f.challenge.accepts[0],payTo:address.toLowerCase()}];await f.saveOriginal();await f.saveHeaders();const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const offers=JSON.parse(out.stdout).payment_challenge.offers;assert.deepEqual(offers.map(x=>x.comparison),['matched','not_matched','matched']);assert.equal(offers[0].pay_to,base58);}finally{await f.clean();}
});
for(const [name,headers,status] of [
 ['no payment header','HTTP/2 402\r\ncontent-type: application/json\r\n\r\n','missing_header'],
 ['non-402 response','HTTP/2 200\r\npayment-required: e30=\r\n\r\n','not_a_402_response'],
 ['bad base64','HTTP/2 402\r\npayment-required: !!!!\r\n\r\n','malformed_challenge'],
 ['unsupported challenge','HTTP/2 402\r\npayment-required: e30=\r\n\r\n','unsupported_challenge'],
])test(`${name} is an explicit unsigned challenge gap`,async()=>{
 const f=await fixture();try{await writeFile(f.headers,headers);const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const p=JSON.parse(out.stdout).payment_challenge;assert.equal(p.status,status);assert.deepEqual(p.offers,[]);}finally{await f.clean();}
});
test('only the final HTTP response supplies offers and oversized captures are refused',async()=>{
 const f=await fixture();try{const saved=await readFile(f.headers,'utf8');await writeFile(f.headers,saved+'HTTP/2 200\r\n\r\n');let out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).payment_challenge.status,'not_a_402_response');await writeFile(f.headers,'x'.repeat(65537));out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,2);assert.equal(out.stdout,'');}finally{await f.clean();}
});
test('missing offer fields remain visible as gaps and never become a chosen rail',async()=>{
 const f=await fixture();try{f.challenge.accepts.push(null,{network:'eip155:1',payTo:null});await f.saveHeaders();const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const p=JSON.parse(out.stdout).payment_challenge;assert.equal(p.status,'read_with_gaps');assert.equal(p.offers.length,3);assert.equal(p.offers[1].pay_to,null);assert.equal(p.offers[1].comparison,'unavailable');assert.equal(p.offers[2].network,'eip155:1');}finally{await f.clean();}
});
test('the command saves a new report without shell redirection and refuses any overwrite',async()=>{
 const f=await fixture();try{const file=join(f.dir,'report.md');const before=await readFile(f.original);let out=f.run(['--format','markdown','--report-out',file]);assert.equal(out.status,0,out.stderr);const receipt=JSON.parse(out.stdout);assert.equal(receipt.report_file,file);assert.equal(receipt.source_sha256,sha(before));const saved=await readFile(file);assert.equal(markdownData(saved.toString()).source_sha256,sha(before));out=f.run(['--format','markdown','--report-out',file]);assert.equal(out.status,2);assert.deepEqual(await readFile(file),saved);out=f.run(['--format','markdown','--report-out',f.original]);assert.equal(out.status,2);assert.deepEqual(await readFile(f.original),before);}finally{await f.clean();}
});
test('the report-capable installation example agrees with the prepared package',async()=>{
 const readme=await readFile(new URL('./README.md',import.meta.url),'utf8');const pkg=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));const install=readme.match(/npm install --prefix \.\/tooling[^\n]*x402-verify@([^\s]+)/);assert.ok(install);assert.equal(install[1],pkg.version);
});
test('the buyer guide actually saves a generated report using its documented command',async()=>{
 const f=await fixture();try{const guide=await readFile(new URL('../skills/scvd-x402-verification/SKILL.md',import.meta.url),'utf8');const command=[...guide.matchAll(/```sh\n([\s\S]*?)\n```/g)].map(x=>x[1].replace(/\\\n\s*/g,' ').trim()).find(x=>x.startsWith('scvd-evidence verify-source ')&&x.includes('--report-out'));assert.ok(command);const words=command.match(/'[^']*'|"[^"]*"|\S+/g).map(x=>x.replace(/^(['"])(.*)\1$/,'$2'));const report=join(f.dir,'guide-report.md');const replacements={'./evidence/original.json':f.original,TRUSTED_PUBLIC_KEY_HEX:f.key,CALLER_MAX_BYTES:'33554432',EXACT_ENDPOINT_URL:f.subject,'./evidence/verification-report.md':report};const args=words.slice(1).map(x=>replacements[x]??x);const out=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(out.status,0,out.stderr);assert.equal(markdownData(await readFile(report,'utf8')).subject_evidence.matched_observations,1);}finally{await f.clean();}
});
test('generated Markdown respects a caller limit below the report ceiling',async()=>{
 const {renderEvidenceReport}=await import('./evidence-report.js');const reading={corpus_snapshots_verified:0,source_sha256:'a'.repeat(64)};const report=renderEvidenceReport(reading);assert.throws(()=>renderEvidenceReport(reading,Buffer.byteLength(report)-1),/report_too_large/);
});
test('a blank payment address is an explicit gap, not a usable comparison',async()=>{
 const f=await fixture();try{f.challenge.accepts[0].payTo='  ';await f.saveHeaders();const out=f.run(['--challenge-headers',f.headers]);assert.equal(out.status,0,out.stderr);const p=JSON.parse(out.stdout).payment_challenge;assert.equal(p.status,'read_with_gaps');assert.equal(p.offers[0].address_digest,null);assert.equal(p.offers[0].comparison,'unavailable');}finally{await f.clean();}
});

test('draft identifier check catches a shortened digest without changing the draft or original',async()=>{
 const f=await fixture();try{
  const draft=join(f.dir,'draft.md'),original=await readFile(f.original),digest=sha(f.payload);
  const text=`Signed-message SHA-256: ${digest.slice(0,31)+digest.slice(33)}\nOriginal SHA-256: ${sha(original)}\n`;
  await writeFile(draft,text);
  const out=f.run(['--check-identifiers',draft]);assert.equal(out.status,4,out.stderr);
  const check=JSON.parse(out.stdout).identifier_check;
  assert.equal(check.status,'needs_review');assert.equal(check.matched,1);assert.equal(check.unrecognized,1);
  assert.equal(check.draft_sha256,sha(text));assert.equal(check.candidates,2);
  assert.equal(check.readings[0].length,62);assert.equal(check.readings[0].status,'unrecognized');
  assert.equal(await readFile(draft,'utf8'),text);assert.deepEqual(await readFile(f.original),original);
 }finally{await f.clean();}
});

test('draft matching is a scoped lexical check, with empty and unverified drafts never passing',async()=>{
 const f=await fixture();try{
  const draft=join(f.dir,'draft.md');await writeFile(draft,`Not a correctness claim: ${sha(f.payload).toUpperCase()} ${f.key}`);
  let out=f.run(['--check-identifiers',draft]);assert.equal(out.status,0,out.stderr);
  let check=JSON.parse(out.stdout).identifier_check;assert.equal(check.status,'all_candidates_recognized');assert.equal(check.matched,2);
  assert.equal(check.prose_verified,false);assert.match(check.scope,/labels|roles/);assert.match(check.scope,/short|split/);
  await writeFile(draft,'No hexadecimal identifier here.');out=f.run(['--check-identifiers',draft]);assert.equal(out.status,4);
  assert.equal(JSON.parse(out.stdout).identifier_check.status,'no_candidates');
  f.doc.signature='0'.repeat(128);await writeFile(f.original,JSON.stringify(f.doc));await writeFile(draft,f.key);
  out=f.run(['--check-identifiers',draft]);assert.equal(out.status,1);check=JSON.parse(out.stdout).identifier_check;
  assert.equal(check.status,'verification_failed');assert.equal(check.matched,0);assert.equal(check.readings[0].status,'unchecked');
 }finally{await f.clean();}
});

test('draft scan bounds output, checks omitted candidates and refuses malformed or oversized text',async()=>{
 const f=await fixture();try{
  const draft=join(f.dir,'draft.md');await writeFile(draft,Array(60).fill(sha(f.payload)).join('\n')+'\n'+'b'.repeat(200));
  let out=f.run(['--check-identifiers',draft]);assert.equal(out.status,4,out.stderr);
  let check=JSON.parse(out.stdout).identifier_check;assert.equal(check.candidates,61);assert.equal(check.matched,60);assert.equal(check.unrecognized,1);assert.ok(check.omitted>0);assert.equal(check.readings.length+check.omitted,61);assert.ok(Buffer.byteLength(JSON.stringify(check))<16384);
  await writeFile(draft,Buffer.from([0xff]));out=f.run(['--check-identifiers',draft]);assert.equal(out.status,2);assert.equal(out.stdout,'');
  await writeFile(draft,'x'.repeat(131073));assert.equal(f.run(['--check-identifiers',draft]).status,2);
  await writeFile(draft,sha(f.payload));assert.equal(f.run(['--check-identifiers',draft,'--format','markdown','--report-out',join(f.dir,'report.md')]).status,2);
  const wrong=spawnSync(process.execPath,[cli,'sources',f.original,'--check-identifiers',draft],{encoding:'utf8'});assert.equal(wrong.status,2);
 }finally{await f.clean();}
});

test('draft lexical coverage keeps token boundaries and bounds repeated reference names',async()=>{
 const {checkDraftIdentifiers}=await import('./evidence-report.js');
 const value='a'.repeat(64),references=Object.fromEntries(Array.from({length:20},(_,i)=>[`field_${i}`,value]));
 const text=`0x${value.toUpperCase()} ${'b'.repeat(129)} g${value} _${value} ${value}_ ${'c'.repeat(47)}`;
 const check=await checkDraftIdentifiers(Buffer.from(text),references,true);
 assert.equal(check.candidates,2);assert.equal(check.matched,1);assert.equal(check.unrecognized,1);
 assert.equal(check.readings[0].reference_fields.length,4);assert.equal(check.readings[0].omitted_reference_fields,16);
 assert.equal(check.readings[1].value,null);assert.equal(check.readings[1].length,129);
});

test('signed advisory codes acquire scoped readings without changing signed rows or originals',async()=>{
 const f=await fixture();try{
  f.row.advisories=['retry-key-not-in-challenge','signed-offers-not-in-challenge'];await f.saveOriginal();
  const before=await readFile(f.original);const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);
  const r=markdownData(out.stdout),a=r.advisory_readings;
  assert.equal(a.basis,'reader_interpretation_of_signed_codes');
  assert.equal(a.omitted_observations,0);assert.equal(a.observations.length,1);
  assert.equal(a.observations[0].signed_claims_pointer,'/round/hosts/0');
  const retry=a.observations[0].advisories[0];
  assert.equal(retry.code,'retry-key-not-in-challenge');
  assert.match(retry.observed,/declared input.*recognized retry/i);
  assert.match(retry.unknown,/header.*session.*settlement/i);
  assert.match(retry.unknown,/double.charg/i);
  assert.match(a.observations[0].advisories[1].unknown,/elsewhere/i);
  assert.deepEqual(r.subject_evidence.observations[0].value,f.row);
  assert.deepEqual(await readFile(f.original),before);
  const json=JSON.parse(f.run().stdout);assert.deepEqual(json.advisory_readings,a);
 }finally{await f.clean();}
});

test('declared retry fields remain untested and unknown advisory codes remain uninterpreted',async()=>{
 const f=await fixture();try{
  const hostile='new-code\n```\n<img src=x>\u2028';
  f.row.advisories=['retry-key-declared',hostile,'toString','no-signed-offers'];await f.saveOriginal();
  const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);
  const a=markdownData(out.stdout).advisory_readings.observations[0].advisories;
  assert.match(a[0].unknown,/honor|honour/);assert.match(a[0].unknown,/retry/i);
  assert.equal(a[1].code,hostile);assert.equal(a[1].observed,null);assert.equal(a[2].observed,null);
  assert.match(a[1].unknown,/not interpreted/i);assert.match(a[3].unknown,/elsewhere/i);
  assert.equal(out.stdout.split('\n').filter(x=>x.startsWith('```')).length,2);
 }finally{await f.clean();}
});

test('advisory interpretation excludes unsigned history, rejected signatures and omitted rows',async()=>{
 const f=await fixture();try{
  f.row.advisories=['retry-key-not-in-challenge'];await f.saveOriginal();
  f.doc.history=[{...f.row,advisories:['unsigned-only']}];await writeFile(f.original,JSON.stringify(f.doc));
  let r=JSON.parse(f.run().stdout);assert.equal(r.advisory_readings.observations.length,1);
  f.row.padding='x'.repeat(40000);await f.saveOriginal();r=JSON.parse(f.run().stdout);
  assert.deepEqual(r.advisory_readings.observations,[]);assert.equal(r.advisory_readings.omitted_observations,1);
  f.row.padding='tampered';f.doc.digest=sha(JSON.stringify(f.snapshot));await writeFile(f.original,JSON.stringify(f.doc));
  const out=f.run();assert.equal(out.status,1);r=JSON.parse(out.stdout);
  assert.equal(r.advisory_readings.status,'not_verified');assert.deepEqual(r.advisory_readings.observations,[]);
 }finally{await f.clean();}
});

test('expanded advisory commentary has a byte bound and counts every omitted entry',async()=>{
 const f=await fixture();try{
  f.row.advisories=Array(400).fill('retry-key-not-in-challenge');await f.saveOriginal();
  const out=f.run();assert.equal(out.status,0,out.stderr);const a=JSON.parse(out.stdout).advisory_readings;
  const retained=a.observations.reduce((n,row)=>n+row.advisories.length,0);
  assert.ok(retained>0);assert.ok(a.omitted_advisories>0);
  assert.equal(retained+a.omitted_advisories,f.row.advisories.length);
  assert.ok(Buffer.byteLength(JSON.stringify(a.observations))<=a.max_bytes);
 }finally{await f.clean();}
});

test('exported bundle produces a compact report without authenticating its response context',async()=>{
 const f=await fixture();try{
  const {createEvidenceBundle}=await import('./evidence-bundle.js');
  f.row.advisories=['retry-key-not-in-challenge'];await f.saveOriginal();
  const bundle=await createEvidenceBundle(f.doc);bundle.context.response={snapshot:{round:{hosts:[{url:f.subject,advisories:['forged-context'],observed_at:'2099-01-01'}]}}};
  const file=join(f.dir,'bundle.json');await writeFile(file,JSON.stringify(bundle));const before=await readFile(file);
  const legacy=spawnSync(process.execPath,[cli,'verify',file,'--public-key',f.key],{encoding:'utf8'});assert.equal(legacy.status,0,legacy.stderr);assert.deepEqual(JSON.parse(legacy.stdout).signed_claims,f.snapshot);
  const compact=spawnSync(process.execPath,[cli,'verify',file,'--public-key',f.key,'--format','json'],{encoding:'utf8'});assert.equal(compact.status,0,compact.stderr);assert.equal(Object.hasOwn(JSON.parse(compact.stdout),'signed_claims'),false);
  const args=[cli,'verify',file,'--public-key',f.key,'--subject',f.subject];
  let out=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(out.status,0,out.stderr);
  const r=JSON.parse(out.stdout);assert.equal(r.input_kind,'evidence_bundle');assert.equal(r.source_sha256,sha(before));assert.equal(r.signed_message_sha256,sha(bundle.artifact.signed_payload));
  assert.equal(r.context_authenticated,false);assert.equal(Object.hasOwn(r,'signed_claims'),false);
  assert.deepEqual(r.subject_evidence.observations[0].value,f.row);assert.equal(r.advisory_readings.observations[0].advisories[0].code,'retry-key-not-in-challenge');
  assert.ok(out.stdout.length<15000);assert.deepEqual(await readFile(file),before);
  out=spawnSync(process.execPath,[...args,'--format','markdown','--challenge-headers',f.headers,'--report-out',join(f.dir,'bundle-report.md')],{encoding:'utf8'});assert.equal(out.status,0,out.stderr);
  const md=await readFile(join(f.dir,'bundle-report.md'),'utf8');assert.match(md,/input-file/i);assert.match(md,/bundle bytes/i);assert.equal(markdownData(md).payment_challenge.offers[0].comparison,'matched');
  const again=spawnSync(process.execPath,[...args,'--format','markdown','--report-out',join(f.dir,'bundle-report.md')],{encoding:'utf8'});assert.equal(again.status,2);assert.equal(await readFile(join(f.dir,'bundle-report.md'),'utf8'),md);
  bundle.artifact.signed_payload+=' ';await writeFile(file,JSON.stringify(bundle));
  out=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(out.status,1,out.stderr);const bad=JSON.parse(out.stdout);assert.equal(bad.signed_message_sha256,null);assert.deepEqual(bad.subject_evidence.observations,[]);assert.deepEqual(bad.advisory_readings.observations,[]);
 }finally{await f.clean();}
});

test('bundle reporting preserves missing attachments, trusted-key and bounded-file failures',async()=>{
 const f=await fixture();try{
  const {createEvidenceBundle}=await import('./evidence-bundle.js');const bundle=await createEvidenceBundle(f.doc);const file=join(f.dir,'bundle.json');await writeFile(file,JSON.stringify(bundle));
  const args=[cli,'verify',file,'--format','markdown'];
  let out=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(out.status,1,out.stderr);assert.equal(markdownData(out.stdout).valid,false);
  out=spawnSync(process.execPath,[...args,'--public-key',f.key,'--max-bytes','10'],{encoding:'utf8'});assert.equal(out.status,2);assert.equal(out.stdout,'');
  const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const payload=JSON.stringify({attests:sha('missing attachment')});
  const cert=await createEvidenceBundle({algorithm:'ed25519',signed_payload:payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('hex'),public_key:key});await writeFile(file,JSON.stringify(cert));
  out=spawnSync(process.execPath,[...args,'--public-key',key],{encoding:'utf8'});assert.equal(out.status,3,out.stderr);assert.deepEqual(markdownData(out.stdout).missing_evidence,['attests']);
 }finally{await f.clean();}
});

test('wrong report input forms return fixed recovery guidance without writing or echoing input',async()=>{
 const f=await fixture();try{
  const {createEvidenceBundle}=await import('./evidence-bundle.js');const bundle=await createEvidenceBundle(f.doc);bundle.context.secret='do-not-echo-this';await writeFile(f.original,JSON.stringify(bundle));
  let out=f.run(['--format','markdown','--report-out',join(f.dir,'missing.md')]);assert.equal(out.status,2);assert.match(out.stderr,/verify <bundle.json>/);assert.doesNotMatch(out.stderr,/do-not-echo-this/);await assert.rejects(readFile(join(f.dir,'missing.md')),{code:'ENOENT'});
  await writeFile(f.original,JSON.stringify(f.snapshot));out=f.run();assert.equal(out.status,2);assert.match(out.stderr,/detached payload/i);assert.match(out.stderr,/verify <bundle.json>/);
  await f.saveOriginal();out=spawnSync(process.execPath,[cli,'verify',f.original,'--public-key',f.key,'--format','markdown'],{encoding:'utf8'});assert.equal(out.status,2);assert.match(out.stderr,/verify-source <saved-response.json>/);
 }finally{await f.clean();}
});

for(const kind of ['saved_response','evidence_bundle'])test(`save and display ${kind} reports in one invocation without changing default receipts`,async()=>{
 const f=await fixture();try{
  let command='verify-source',input=f.original;
  if(kind==='evidence_bundle'){
   const {createEvidenceBundle}=await import('./evidence-bundle.js');input=join(f.dir,'bundle.json');command='verify';
   await writeFile(input,JSON.stringify(await createEvidenceBundle(f.doc)));
  }
  for(const valid of [true,false]){
   const output=join(f.dir,`inline-${valid}.md`),args=[cli,command,input,'--public-key',valid?f.key:'00'.repeat(32),'--subject',f.subject,'--format','markdown','--report-out',output,'--report-stdout'];
   const out=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(out.status,valid?0:1,out.stderr);
   assert.equal(out.stdout,await readFile(output,'utf8'));assert.equal(markdownData(out.stdout).valid,valid);
   const again=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(again.status,2);assert.equal(again.stdout,'');assert.equal(await readFile(output,'utf8'),out.stdout);
  }
 }finally{await f.clean();}
});
test('inline report option rejects incompatible or duplicate arguments before writing',async()=>{
 const f=await fixture();try{
  for(const flags of [['--report-stdout'],['--format','markdown','--report-stdout'],['--format','json','--report-out',join(f.dir,'no.md'),'--report-stdout'],['--format','markdown','--report-out',join(f.dir,'no.md'),'--report-stdout','--report-stdout']]){
   const out=f.run(flags);assert.equal(out.status,2);assert.equal(out.stdout,'');
  }
  await assert.rejects(readFile(join(f.dir,'no.md')),{code:'ENOENT'});
 }finally{await f.clean();}
});

// The October 12 buyers read the report yet broadened a missing declaration
// into an endpoint-wide claim. Its boundary must precede the raw record.
for (const code of ['signed-offers-not-in-challenge','no-signed-offers','retry-key-not-in-challenge','retry-key-declared']) test(`first-screen scope accompanies ${code} before the evidence block`,async()=>{
 const f=await fixture();try{
  f.row.advisories=[code,code];await f.saveOriginal();const original=await readFile(f.original);
  const out=f.run(['--format','markdown']);assert.equal(out.status,0,out.stderr);
  const result=markdownData(out.stdout),front=out.stdout.split('```json')[0];
  const reading=result.advisory_readings.observations[0].advisories[0];
  assert.ok(front.includes(reading.observed),'first screen states the scoped observation');
  assert.ok(front.includes(reading.unknown),'first screen retains the untested alternatives');
  assert.equal(front.split(reading.observed).length-1,1,'repeated codes do not bury the boundary');
  assert.match(front,/reader commentary/i);assert.match(front,/not additional signed evidence/i);
  assert.deepEqual(await readFile(f.original),original);
  assert.deepEqual(result,JSON.parse(f.run().stdout),'Markdown adds no claim to the structured result');
 }finally{await f.clean();}
});
test('first-screen scope cannot promote unsigned, unknown, mismatched or rejected advisory rows',async()=>{
 const f=await fixture();try{
  const hostile='unrecognized\n# PAY NOW\n<script>bad()</script>';
  f.row.advisories=[hostile];await f.saveOriginal();
  f.doc.history=[{...f.row,advisories:['signed-offers-not-in-challenge']}];await writeFile(f.original,JSON.stringify(f.doc));
  let out=f.run(['--format','markdown']),front=out.stdout.split('```json')[0];
  assert.doesNotMatch(front,/PAY NOW|<script>|no signed offer was found/);
  assert.match(front,/unknown|unrecognized/i);
  f.row.advisories=['signed-offers-not-in-challenge'];await f.saveOriginal();
  out=f.run(['--format','markdown','--subject','https://another.example/']);
  assert.doesNotMatch(out.stdout.split('```json')[0],/no signed offer was found/);
  f.doc.signature='00'.repeat(64);await writeFile(f.original,JSON.stringify(f.doc));
  out=f.run(['--format','markdown']);assert.equal(out.status,1);
  assert.doesNotMatch(out.stdout.split('```json')[0],/no signed offer was found/);
 }finally{await f.clean();}
});
