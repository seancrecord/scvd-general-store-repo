import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const verifier=fileURLToPath(new URL('verify.mjs',import.meta.url));
const original=JSON.parse(fs.readFileSync(new URL('evidence.json',import.meta.url)));
const baseline=spawnSync(process.execPath,[verifier],{encoding:'utf8'});
assert.equal(baseline.status,0,baseline.stderr);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-evidence-controls-'));
const mutations={
 changed_signed_bytes:e=>{e.payments[0].artifact.signed_payload+=' ';},
 wrong_buyer_subject:e=>{e.payments[0].inputs.host='wrong.example';},
 wrong_buyer_text:e=>{e.payments.find(p=>p.item==='the_confession').inputs.confession='different text';},
 cross_wired_certificate:e=>{e.payments[0].artifact=e.payments[1].artifact;},
 duplicate_settlement:e=>{e.money.rows[0].authorization_uses=2;},
 mismatched_transfer:e=>{e.money.receipts[0].logs[1].data='0x'+(999n).toString(16).padStart(64,'0');},
 lost_recovery_good:e=>{e.payments[0].review.recovery.same_deliverable=false;},
 wrong_balance:e=>{e.money.end_balance_atomic=String(BigInt(e.money.end_balance_atomic)-1n);},
 settlement_checked_after_retry:e=>{e.control_settled_before_replay.at='2099-01-01T00:00:00.000Z';},
};
try{
 for(const [name,change] of Object.entries(mutations)){
  const e=structuredClone(original);change(e);
  const file=path.join(dir,name+'.json');fs.writeFileSync(file,JSON.stringify(e));
  const r=spawnSync(process.execPath,[verifier,file],{encoding:'utf8'});
  assert.notEqual(r.status,0,name+' was not detected');
  assert.match(r.stderr,/AssertionError/,name+' failed for an unrelated reason');
 }
 console.log(JSON.stringify({baseline_passes:true,rejected_mutations:Object.keys(mutations)},null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
