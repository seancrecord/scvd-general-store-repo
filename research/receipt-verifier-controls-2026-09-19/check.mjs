// Recheck retained public artifacts with the pinned registry CLI. No native
// agent, network, payment or private key is involved; stdout is the receipt.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const plan=JSON.parse(fs.readFileSync(path.join(here,'plan.json')));
const pkg=process.argv[2];
if(!pkg || !path.isAbsolute(pkg))throw new Error('Supply an absolute path to the installed x402-verify package directory.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [file,digest] of Object.entries(plan.verifier.files))assert.equal(hash(fs.readFileSync(path.join(pkg,file))),digest,`Package bytes changed: ${file}`);
assert.equal(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version,plan.verifier.version);
const sources=Object.fromEntries(plan.sources.map(source=>{
 const bytes=fs.readFileSync(path.join(root,source.file));
 assert.equal(hash(bytes),source.sha256,`Retained source changed: ${source.file}`);
 return [source.name,JSON.parse(bytes)];
}));
const historical=sources.purchase.historical_control;
const old=historical.body;
const paid=sources.receipt.data;
const keys=[historical.registry.key_history.current,...historical.registry.key_history.retired];
const keyFor=artifact=>{
 const matches=keys.filter(k=>k.public_key===artifact.public_key);
 assert.equal(matches.length,1,'Exactly one separately retained key record must match');
 return matches[0];
};
const oldKey=keyFor(old),paidKey=keyFor(paid);
// These are published-key observations. Matching this self-published registry
// is not independent issuer authentication or proof of key control on a date.
const independent=artifact=>verify(null,Buffer.from(artifact.signed_payload,'utf8'),createPublicKey({
 format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(artifact.public_key,'hex')]),
}),Buffer.from(artifact.signature,'hex'));
assert.equal(independent(old),true);assert.equal(independent(paid),true);
const claims=JSON.parse(old.signed_payload);
assert.equal(claims.cert_id,'cert_4dww28dx5j');
assert.equal(claims.date.slice(0,10)>=oldKey.in_service_from && claims.date.slice(0,10)<=oldKey.retired_on,true);
assert.equal(Object.hasOwn(claims,'settlement_tx'),false);
assert.equal(Object.hasOwn(claims,'paid_usdc'),false);
const tampered=structuredClone(old);
tampered.signed_payload=JSON.stringify({...claims,item:'replacement item'});
tampered.artifact_hash=hash(tampered.signed_payload);
// This retained artifact also has a timestamp digest. Change both claimed
// hashes to reach signature verification; the old OTS proof is not endorsed.
tampered.existence.digest=tampered.artifact_hash;
assert.equal(independent(tampered),false);
const wrapper=structuredClone(old);
wrapper.certificate={...wrapper.certificate,item:'unsigned replacement',paid_usdc:99};
wrapper.signed_by={...wrapper.signed_by,status:'current'};
assert.equal(independent(wrapper),true);
const cases=[
 {id:'retired-key-original',artifact:old,key:oldKey.public_key,exit:0,valid:true,complete:true},
 {id:'retired-key-with-current-key',artifact:old,key:paidKey.public_key,exit:1,valid:false,problem:'embedded_key_differs_from_trusted_key'},
 {id:'retired-key-missing-caller-key',artifact:old,exit:1,valid:false},
 {id:'changed-signed-item-rehashed',artifact:tampered,key:oldKey.public_key,exit:1,valid:false,problem:'invalid_signature'},
 {id:'changed-unsigned-display',artifact:wrapper,key:oldKey.public_key,exit:0,valid:true,complete:true},
 {id:'paid-receipt-missing-bound-evidence',artifact:paid,key:paidKey.public_key,exit:3,valid:true,complete:false,missing:['saw']},
 {id:'paid-receipt-with-retired-key',artifact:paid,key:oldKey.public_key,exit:1,valid:false,problem:'embedded_key_differs_from_trusted_key'},
];
assert.deepEqual(cases.map(c=>c.id),plan.case_ids);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'scvd-receipt-control-'));
const results=[];
try{
 const guard=path.join(scratch,'offline.mjs');
 fs.writeFileSync(guard,'globalThis.fetch = () => { throw new Error("network_forbidden"); };\n');
 for(const c of cases){
  // Only the outer JSON is reserialized. signed_payload stays byte-identical
  // except in the explicitly altered control. No capture is overwritten.
  const file=path.join(scratch,c.id+'.json');fs.writeFileSync(file,JSON.stringify(c.artifact));
  const before=hash(fs.readFileSync(file));
  const args=['--import',guard,path.join(pkg,'evidence-cli.mjs'),'verify-source',file,...(c.key?['--public-key',c.key]:[])];
  const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:plan.limits.cli_timeout_ms,maxBuffer:plan.limits.cli_output_bytes});
  assert.ifError(run.error);assert.equal(run.status,c.exit,`${c.id}: ${run.stderr}`);
  const result=JSON.parse(run.stdout);
  assert.equal(result.valid,c.valid,c.id);
  if(c.complete!==undefined)assert.equal(result.evidence_complete,c.complete,c.id);
  if(c.problem)assert.ok(result.problems.includes(c.problem),c.id);
  if(c.missing)assert.deepEqual(result.missing_evidence,c.missing,c.id);
  assert.equal(result.context_authenticated,false,c.id);
  assert.equal(result.source_sha256,before,c.id);
  assert.equal(hash(fs.readFileSync(file)),before,`${c.id}: CLI changed input`);
  results.push({id:c.id,input_sha256:before,exit_code:run.status,reading:result});
 }
 assert.deepEqual(fs.readdirSync(scratch).sort(),['offline.mjs',...cases.map(c=>c.id+'.json')].sort());
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log(JSON.stringify({schema_version:1,checked_at:new Date().toISOString(),plan_sha256:hash(fs.readFileSync(path.join(here,'plan.json'))),checker_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),node_version:process.version,verifier:plan.verifier,source_references:plan.sources,independent_crypto:{original_historical:true,original_paid:true,changed_signed_item:false,changed_unsigned_display:true},historical_claim:{certificate_id:claims.cert_id,date:claims.date,key_record_in_service_from:oldKey.in_service_from,key_record_retired_on:oldKey.retired_on,declared_date_in_published_window:true,payment_record_in_signed_claims:false},controls_passed:results.length,results,scope:'Controller receipt controls, not a native recipient or buyer journey. Signatures against separately retained published keys; no independent issuer identity, signing time, key authorization, current delivery, chain consensus or Bitcoin timestamp proof. Old service-window dates are unsigned registry statements, not independently authenticated facts.'},null,2));
