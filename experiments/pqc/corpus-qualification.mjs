// Recheck frozen public captures and bind their last canonical snapshot to synthetic keys.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash,createPublicKey } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fixture } from './checkpoint-fixture.mjs';
import { encodeTrust } from './checkpoint.mjs';
import { readCorpusForCheckpoint,signCorpusCheckpoint,verifyCorpusCheckpoint,CORPUS_QUALIFICATION_LIMITS } from './corpus-checkpoint.mjs';

const output=process.argv[2];
if(!output) throw Error('Usage: node corpus-qualification.mjs <new-directory>');
const root=new URL('../../research/',import.meta.url);
const sourceRoot=new URL('verification-2026-09-09/',root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestBytes=await readFile(new URL('capture-manifest.json',sourceRoot));
const manifest=JSON.parse(manifestBytes);
const files=manifest.reads.filter(r=>/^corpus-[1-9][0-9]*\.json\.gz$/.test(r.file))
  .sort((a,b)=>Number(a.file.match(/\d+/)[0])-Number(b.file.match(/\d+/)[0]));
assert.equal(files.length,manifest.index_entries);assert.ok(files.length<=CORPUS_QUALIFICATION_LIMITS.records);
const records=[],sources=[];
for(const entry of files) {
  const compressed=await readFile(new URL(entry.file,sourceRoot));
  const bytes=gunzipSync(compressed,{maxOutputLength:CORPUS_QUALIFICATION_LIMITS.total_bytes});
  assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);
  records.push(JSON.parse(bytes));sources.push({file:entry.file,sha256:hash(bytes),bytes:bytes.length,captured_at:entry.read_at});
}
const keyBytes=await readFile(new URL('verification-2026-09-08/key.json',root));
const capturedKey=JSON.parse(keyBytes),keyHistory=capturedKey.data.key_history;
const f=fixture();
try {
  const declaration=structuredClone(f.declaration);
  declaration.keys[0].public_key=createPublicKey({key:{kty:'OKP',crv:'Ed25519',
    x:Buffer.from(keyHistory.current.public_key,'hex').toString('base64url')},format:'jwk'})
    .export({format:'der',type:'spki'}).toString('hex');
  const trustBytes=encodeTrust(declaration);
  const input={records,keyHistory,trustBytes};
  const before=hash(Buffer.from(JSON.stringify(records)));
  const corpus=await readCorpusForCheckpoint(input);assert.equal(corpus.valid,true);
  const checkpoint=await signCorpusCheckpoint({...input,edPrivateKey:f.checkpoint.privateKey,pqSecretKey:f.pq.secretKey});
  const verification=await verifyCorpusCheckpoint({...input,bytes:checkpoint});assert.equal(verification.valid,true);
  assert.equal(hash(Buffer.from(JSON.stringify(records))),before);
  await mkdir(output);
  await writeFile(join(output,'checkpoint.json'),checkpoint,{flag:'wx'});
  await writeFile(join(output,'trust.json'),trustBytes,{flag:'wx'});
  const report={experimental:true,checked_at:new Date().toISOString(),node:process.version,
    source_manifest_sha256:hash(manifestBytes),key_capture_sha256:hash(keyBytes),key_captured_at:capturedKey.read_at,
    sources,checkpoint_sha256:hash(checkpoint),trust_sha256:hash(trustBytes),
    snapshot_sha256:hash(corpus.snapshot),original_records_unchanged:true,verification,
    limitations:['Frozen September captures, not a fresh live-corpus census or current-key assertion.',
      'Key history is caller-supplied capture evidence; its identity/anchoring is not independently revalidated in this run.',
      'New checkpoint keys are disposable and synthetic; no production checkpoint or original re-signing.',
      'Existing bundle reader supplies snapshot shape/canonicalization; no full nested WardRound schema assertion.',
      'Original, declaration and checkpoint Bitcoin proof verification is not performed by this adapter.']};
  await writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,records:records.length,valid:verification.valid,original_records_unchanged:true,production_ready:false}));
} finally {f.dispose();}
