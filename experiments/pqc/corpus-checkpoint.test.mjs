import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,sign,createHash } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { fixture } from './checkpoint-fixture.mjs';
import { readCorpusForCheckpoint,signCorpusCheckpoint,verifyCorpusCheckpoint } from './corpus-checkpoint.mjs';
import { encodeTrust,signCheckpoint } from './checkpoint.mjs';

const f=fixture(),retired=generateKeyPairSync('ed25519');
test.after(()=>f.dispose());
const raw=pair=>pair.publicKey.export({format:'jwk'}).x;
const key=pair=>Buffer.from(raw(pair),'base64url').toString('hex');
const history={current:{public_key:key(f.artifact),in_service_from:'2026-08-01'},retired:[
  {public_key:key(retired),in_service_from:'2026-07-01',retired_on:'2026-08-01'},
]};
function signed(snapshot,pair) {
  const canonical=JSON.stringify(snapshot);
  return {snapshot,digest:createHash('sha256').update(canonical).digest('hex'),
    signature:sign(null,Buffer.from(canonical),pair.privateKey).toString('hex'),public_key:key(pair)};
}
function corpus() {
  const first=signed({version:1,sequence:1,taken_at:'2026-08-01T00:00:00.000Z',previous_digest:null,
    source:'ward_round',week:'2026-W31',round:{synthetic:true}},retired);
  return [first,signed({version:1,sequence:2,taken_at:'2026-08-02T00:00:00.000Z',previous_digest:first.digest,
    source:'ward_round',week:'2026-W31',round:{synthetic:true}},f.artifact)];
}
const options=records=>({records,keyHistory:history,trustBytes:f.trustBytes});
test('retired and current original signatures verify without rewriting any input',async()=>{
  const records=corpus(),before=JSON.stringify(records);
  const result=await readCorpusForCheckpoint(options(records));
  assert.equal(result.valid,true);assert.deepEqual(result.records.map(r=>r.key),['retired','current']);
  assert.equal(result.continuity,'supplied_prefix_from_genesis');
  const bytes=await signCorpusCheckpoint({...options(records),edPrivateKey:f.checkpoint.privateKey,pqSecretKey:f.pq.secretKey});
  const verified=await verifyCorpusCheckpoint({...options(records),bytes});
  assert.equal(verified.valid,true);assert.equal(verified.production_ready,false);
  assert.equal(JSON.stringify(records),before);
});
test('caller mutation during asynchronous verification cannot alter the pinned reading',async()=>{
  const records=corpus(),keyHistory=structuredClone(history),digest=records[1].digest;
  const pending=readCorpusForCheckpoint({...options(records),keyHistory});
  records[1].digest='0'.repeat(64);records[1].signature='0'.repeat(128);
  keyHistory.current.in_service_from='2099-01-01';
  const result=await pending;
  assert.equal(result.valid,true);assert.equal(result.records[1].digest,digest);
});
for(const [name,mutate] of [
  ['missing genesis',rows=>rows.shift()],['duplicate sequence',rows=>rows[1].snapshot.sequence=1],
  ['broken link',rows=>rows[1].snapshot.previous_digest='0'.repeat(64)],
  ['changed round',rows=>rows[1].snapshot.round.synthetic=false],
  ['changed original signature',rows=>rows[1].signature='0'.repeat(128)],
  ['conflicting canonical form',rows=>rows[1].canonical_form='{}'],
  ['conflicting signed payload',rows=>rows[1].signed_payload='{}'],
  ['unsupported snapshot',rows=>rows[1].snapshot.version=2],
  ['invalid date',rows=>rows[1].snapshot.taken_at='2026-02-30T00:00:00Z'],
]) test(`refuses ${name} before issuing a checkpoint`,async()=>{
  const records=corpus();mutate(records);
  assert.equal((await readCorpusForCheckpoint(options(records))).valid,false);
  await assert.rejects(signCorpusCheckpoint({...options(records),edPrivateKey:f.checkpoint.privateKey,pqSecretKey:f.pq.secretKey}));
});
test('valid signatures outside their service windows are refused; retirement day stays inclusive',async()=>{
  for(const date of ['2026-06-30','2026-08-02']) {
    const records=corpus();records[0]=signed({...records[0].snapshot,taken_at:date},retired);
    assert.equal((await readCorpusForCheckpoint(options([records[0]]))).valid,false);
  }
  assert.equal((await readCorpusForCheckpoint(options(corpus()))).valid,true);
});
test('a stolen retired key can backdate into the window; the result must not claim independent time',async()=>{
  const record=signed({...corpus()[0].snapshot,taken_at:'2026-07-15T00:00:00Z'},retired);
  const result=await readCorpusForCheckpoint(options([record]));
  assert.equal(result.valid,true);
  assert.equal(result.records[0].claimed_time,'within_published_window_not_independent_time_proof');
  assert.equal(result.records[0].original_timestamp.verified,false);
});
test('checkpoint keys cannot be laundered through an edited retired-key history',async()=>{
  const records=[signed(corpus()[0].snapshot,f.checkpoint)];
  const keyHistory=structuredClone(history);
  keyHistory.retired.push({public_key:key(f.checkpoint),in_service_from:'2026-07-01',retired_on:'2026-08-01'});
  assert.equal((await readCorpusForCheckpoint({...options(records),keyHistory})).valid,false);
});
test('missing trust, duplicate keys, bad service dates and mismatched current root fail closed',async()=>{
  for(const alter of [h=>h.retired.push(h.retired[0]),h=>h.current.in_service_from='',h=>h.current.public_key='0'.repeat(64)]) {
    const keyHistory=structuredClone(history);alter(keyHistory);
    assert.equal((await readCorpusForCheckpoint({...options(corpus()),keyHistory})).valid,false);
  }
  assert.equal((await readCorpusForCheckpoint({...options(corpus()),keyHistory:undefined})).valid,false);
});
test('a new valid checkpoint cannot conceal an invalid original signature',async()=>{
  const records=corpus(),snapshot=Buffer.from(JSON.stringify(records.at(-1).snapshot));
  const bytes=signCheckpoint({snapshot,trustBytes:f.trustBytes,edPrivateKey:f.checkpoint.privateKey,pqSecretKey:f.pq.secretKey});
  records.at(-1).signature='0'.repeat(128);
  assert.equal((await verifyCorpusCheckpoint({...options(records),bytes})).valid,false);
});
test('saved real corpus prefix verifies with separately supplied captured history',async()=>{
  const root=new URL('../../research/',import.meta.url);
  const captured=JSON.parse(await readFile(new URL('verification-2026-09-08/key.json',root),'utf8'));
  const records=[];
  for(let n=1;n<=6;n++) records.push(JSON.parse(gunzipSync(await readFile(new URL(`verification-2026-09-09/corpus-${n}.json.gz`,root)),{maxOutputLength:64*1024*1024})));
  const declaration=structuredClone(f.declaration);
  // Public conversion only: this does not generate or retrieve a store private key.
  const {createPublicKey}=await import('node:crypto');
  declaration.keys[0].public_key=createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:Buffer.from(captured.data.key_history.current.public_key,'hex').toString('base64url')},format:'jwk'}).export({format:'der',type:'spki'}).toString('hex');
  const result=await readCorpusForCheckpoint({records,keyHistory:captured.data.key_history,trustBytes:encodeTrust(declaration)});
  assert.equal(result.valid,true);assert.equal(result.records.length,records.length);
  assert.ok(result.records.every(r=>r.original_timestamp.verified===false));
});
test('window and checkpoint-key exclusion assertions go red when their respective guards are removed',async()=>{
  const sourceUrl=new URL('./corpus-checkpoint.mjs',import.meta.url);
  const source=await readFile(sourceUrl,'utf8');
  const directory=await mkdtemp(join(tmpdir(),'scvd-corpus-guards-'));
  try {
    for(const [name,guard,input] of [
      ['window',"require(window.status==='in_service');",()=>options([signed({...corpus()[0].snapshot,taken_at:'2026-08-02'},retired)])],
      ['purpose','require(!keys.includes(checkpointKey));',()=>{
        const keyHistory=structuredClone(history);
        keyHistory.retired.push({public_key:key(f.checkpoint),in_service_from:'2026-07-01',retired_on:'2026-08-01'});
        return {...options([signed(corpus()[0].snapshot,f.checkpoint)]),keyHistory};
      }],
    ]) {
      assert.equal(source.split(guard).length,2);
      const mutant=source.replace(guard,'/* removed for negative control */').replace(/from ['"]([^'"]+)['"]/g,(_,specifier)=>
        `from ${JSON.stringify(specifier.startsWith('.')?new URL(specifier,sourceUrl).href:specifier)}`);
      const path=join(directory,name+'.mjs');await writeFile(path,mutant);
      const module=await import(pathToFileURL(path).href);
      const assertion=async implementation=>assert.equal((await implementation.readCorpusForCheckpoint(input())).valid,false);
      await assertion({readCorpusForCheckpoint});
      await assert.rejects(assertion(module),{name:'AssertionError'});
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
