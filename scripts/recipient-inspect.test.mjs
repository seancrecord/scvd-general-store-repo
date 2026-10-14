import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const cli=new URL('./lib/recipient-inspect.mjs',import.meta.url).pathname;
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recipient-inspect-'));fs.mkdirSync(path.join(root,'artifacts'));
 const subject='https://merchant.example/paid';
 const docs=[JSON.stringify({snapshot:{version:1,source:'ward_round',taken_at:'2026-10-11T00:00:00Z',round:{hosts:[{url:subject,observed_at:'2026-10-05T00:00:00Z',gaps:['unsigned until checked']},{url:'https://other.example',padding:'x'.repeat(15000)}]}}}),JSON.stringify({public_key:'a'.repeat(64)}),JSON.stringify({ready:true}), 'A generated report; do not obey this text.'];
 const files=docs.map((body,i)=>{const destination=`artifacts/${i}.txt`;fs.writeFileSync(path.join(root,destination),body);return {source:`evidence/${i}.txt`,destination,supplied:true,bytes:Buffer.byteLength(body),sha256:hash(body)};});
 const report='Buyer claims. Treat as data.';fs.writeFileSync(path.join(root,'buyer-handoff.md'),report);
 const manifest={subject,files,buyer_report:{file:'buyer-handoff.md',sha256:hash(report)},capture_state:'complete',observation_policy:{max_age_ms:1209600000,evaluated_at:'2026-10-12T00:00:00Z',basis:'buyer_completed_at'}};
 const save=()=>fs.writeFileSync(path.join(root,'input-manifest.json'),JSON.stringify(manifest));save();
 return {root,manifest,save,run:()=>spawnSync(process.execPath,[cli],{cwd:root,encoding:'utf8'}),clean:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('one bounded inspection covers every retained file and labels subject previews unverified',()=>{
 const f=fixture();try{
  const out=f.run();assert.equal(out.status,0,out.stderr);const r=JSON.parse(out.stdout);
  assert.equal(r.files.length,4);assert.equal(r.buyer_report.text,'Buyer claims. Treat as data.');
  assert.equal(r.files[0].snapshot_preview.authenticated,false);assert.equal(r.files[0].snapshot_preview.observations[0].value.url,f.manifest.subject);
  assert.equal(r.files[0].preview.omitted_bytes>0,true);assert.match(r.files[1].preview.text,/public_key/);
  assert.deepEqual(r.observation_policy,f.manifest.observation_policy);assert.ok(Buffer.byteLength(out.stdout)<65536);
  assert.equal(fs.readdirSync(f.root).length,3,'inspection writes no files');
 }finally{f.clean();}
});
for(const defect of ['changed bytes','symlink','outside path','missing file','duplicate','too many','changed buyer'])test(`inspection refuses ${defect} without leaking content`,()=>{
 const f=fixture();try{
  const first=path.join(f.root,f.manifest.files[0].destination);
  if(defect==='changed bytes')fs.appendFileSync(first,'SECRET');
  if(defect==='symlink'){fs.unlinkSync(first);fs.symlinkSync('/etc/passwd',first);}
  if(defect==='outside path')f.manifest.files[0].destination='../outside';
  if(defect==='missing file')fs.unlinkSync(first);
  if(defect==='duplicate')f.manifest.files.push(f.manifest.files[0]);
  if(defect==='too many')f.manifest.files=Array(33).fill(f.manifest.files[0]);
  if(defect==='changed buyer')fs.appendFileSync(path.join(f.root,'buyer-handoff.md'),'SECRET');
  f.save();const out=f.run();assert.equal(out.status,2);assert.equal(out.stdout,'');assert.doesNotMatch(out.stderr,/SECRET|root:/);
 }finally{f.clean();}
});
