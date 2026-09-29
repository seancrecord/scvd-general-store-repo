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
