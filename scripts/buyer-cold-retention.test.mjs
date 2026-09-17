import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as runner from './buyer-cold-isolated.mjs';
import {validatePlan,buildPrompt,scoreColdRun,hash} from './lib/buyer-cold.mjs';
import {createEvidenceBundle} from '../verifier/evidence-bundle.js';

const budgets={wall_ms:120000,tool_calls:20,output_bytes:4000000,output_tokens:2000,artifact_bytes:8*1024*1024,artifact_files:16};
const plan={schema_version:3,subject:'https://merchant.example/quote',spend_usdc:0,budgets,freshness:{max_age_ms:14*86400000},cells:[{id:'source',host:'codex',model:'gpt-5.6-luna',lane:'directed',entry:'https://scvd.store/skill.md',verification:'prompted'}]};
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'cold-retention-'));

test('v3 freezes bounded artifact retention and explicit maximum observation age',()=>{
 assert.equal(validatePlan(plan).schema_version,3);
 for(const broken of [{...plan,freshness:undefined},{...plan,budgets:{...budgets,artifact_bytes:Infinity}},{...plan,budgets:{...budgets,artifact_files:0}}])assert.throws(()=>validatePlan(broken));
 assert.match(buildPrompt(plan,plan.cells[0]),/\.\/evidence/);
 assert.doesNotMatch(buildPrompt(plan,{...plan.cells[0],lane:'intent_search',entry:null}),/scvd|corpus/);
});

test('collector retains full bytes independently of shortened model output',()=>{
 const d=root();try{
  fs.mkdirSync(path.join(d,'session/evidence'),{recursive:true});fs.mkdirSync(path.join(d,'out'));
  const original=Buffer.from(JSON.stringify({snapshot:'x'.repeat(2*1024*1024)}));fs.writeFileSync(path.join(d,'session/evidence/original.json'),original);
  const r=runner.retainArtifacts(path.join(d,'session'),path.join(d,'out'),budgets);
  assert.equal(r.state,'complete');assert.equal(r.files.length,1);
  assert.deepEqual(fs.readFileSync(path.join(d,'out',r.files[0].file)),original);
  assert.equal(r.files[0].sha256,hash(original));
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('collector refuses symlinks, marks its limits, and never treats partial bytes as a file',()=>{
 const d=root();try{
  fs.mkdirSync(path.join(d,'session/evidence'),{recursive:true});fs.mkdirSync(path.join(d,'out'));
  fs.writeFileSync(path.join(d,'outside'),'not public evidence');fs.symlinkSync(path.join(d,'outside'),path.join(d,'session/evidence/link'));
  fs.writeFileSync(path.join(d,'session/evidence/large'),'x'.repeat(32));
  const r=runner.retainArtifacts(path.join(d,'session'),path.join(d,'out'),{...budgets,artifact_bytes:16});
  assert.equal(r.state,'incomplete');assert.equal(r.files.length,0);assert.ok(r.issues.length>=2);
  assert.throws(()=>runner.retainArtifacts(path.join(d,'session'),path.join(d,'out'),budgets),/EEXIST/);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});

async function fixture(){
 const d=root();const save=(file,value)=>{const bytes=JSON.stringify(value);fs.writeFileSync(path.join(d,file),bytes);return{file,sha256:hash(bytes)};};
 const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
 const snapshot={version:1,sequence:6,taken_at:'2026-09-08T12:00:00Z',previous_digest:null,source:'ward_round',week:'2026-W37',round:{hosts:[{host:'merchant.example',url:plan.subject,observed_at:'2026-09-07T12:00:00Z',gaps:['no paid delivery']}]}};
 const bytes=JSON.stringify(snapshot),original={snapshot,digest:hash(bytes),public_key:key,signature:sign(null,Buffer.from(bytes),pair.privateKey).toString('hex')};
 const bundle=await createEvidenceBundle(original);
 const events=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Retained public bytes and local verification'}})+'\n';fs.writeFileSync(path.join(d,'events.jsonl'),events);const ref={file:'events.jsonl',sha256:hash(events)};
 const review={schema_version:2,reviewer:'fixture reviewer',reviewed_at:'2026-09-16T12:00:00Z',transcript_sha256:hash(events),isolation:{state:'clean',evidence:[ref]},stages:Object.fromEntries(['discover','connect','check','decide','obtain','verify'].map(k=>[k,{state:'pass',reason:'fixture stage',evidence:[ref]}])),observation:{subject:plan.subject,observed_at:'2026-09-16T11:00:00Z',stale_after:'2026-09-17T11:00:00Z'},fulfillment:'delivered',payment:{state:'not_needed'},recipient:{state:'reviewed',understands:true,evidence:[ref]},verification:{format:'portable',artifact:save('original.json',original),bundle:save('bundle.json',bundle),issuer:save('issuer.json',{public_key:key}),issuer_url:'https://scvd.store/.well-known/scvd-signing-key',issuer_evidence:[ref],subject_pointer:'/round/hosts/0/url',observed_at_pointer:'/round/hosts/0/observed_at'}};
 const run={schema_version:3,cell:plan.cells[0],subject:plan.subject,freshness:plan.freshness,ended_at:'2026-09-16T12:00:00Z',runtime:{state:'completed',exit_code:0},trace_sha256:hash(events),isolation:{fresh_directory:true,config_isolated:true,no_session_resume:true},retained_artifacts:{state:'complete',files:[review.verification.artifact,review.verification.issuer]}};
 return{d,save,original,bundle,review,run};
}

test('a historical corpus snapshot verifies without inventing an expiry, entirely offline',async()=>{
 const b=await fixture(),old=globalThis.fetch;globalThis.fetch=()=>{throw Error('no network permitted');};
 try{const r=await scoreColdRun(b.run,b.review,b.d);assert.equal(r.usable,'pass');assert.equal(r.verification.expiry,'not_declared');assert.equal(r.verification.signature,true);}finally{globalThis.fetch=old;fs.rmSync(b.d,{recursive:true,force:true});}
});
for(const [name,mutate] of [
 ['stale observation',b=>{b.run.freshness={max_age_ms:86400000};}],
 ['wrong endpoint',b=>{b.review.verification.subject_pointer='/round/hosts/0/host';}],
 ['tampered snapshot with rehashed file',b=>{b.original.snapshot.round.hosts[0].url='https://other.example/';b.review.verification.artifact=b.save('original.json',b.original);b.run.retained_artifacts.files[0]=b.review.verification.artifact;delete b.review.verification.bundle;}],
 ['post-run replacement provenance',b=>{b.run.retained_artifacts.files=[];}],
 ['missing original',b=>{fs.rmSync(path.join(b.d,'original.json'));}],
 ['missing recipient',b=>{delete b.review.recipient;}],
 ['partial capture',b=>{b.run.retained_artifacts.state='incomplete';}],
 ['future observation',b=>{b.run.ended_at='2026-09-01T00:00:00Z';}],
])test(`portable acceptance refuses ${name}`,async()=>{const b=await fixture();try{mutate(b);assert.notEqual((await scoreColdRun(b.run,b.review,b.d)).usable,'pass');}finally{fs.rmSync(b.d,{recursive:true,force:true});}});
