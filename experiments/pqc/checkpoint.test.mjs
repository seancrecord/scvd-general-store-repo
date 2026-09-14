import test from 'node:test';
import assert from 'node:assert/strict';
import { sign,verify,createHash } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as api from './checkpoint.mjs';
import { fixture,resign,wrongPurposeCheckpoint } from './checkpoint-fixture.mjs';

const f=fixture();
test.after(()=>f.dispose());
const check=bytes=>api.verifyCheckpoint({...f,bytes});
const edit=fn=>{const e=JSON.parse(f.bytes);fn(e);return Buffer.from(JSON.stringify(e));};
test('baseline SHA-256 and optional SHA-512 bind exact input bytes without claiming anchoring',()=>{
  for(const sha512 of [false,true]) {
    const sample=fixture(sha512);
    try {
      const result=api.verifyCheckpoint(sample);
      assert.equal(result.valid,true);assert.equal(result.anchoring,'not_checked');assert.equal(result.production_ready,false);
      assert.equal(JSON.parse(JSON.parse(sample.bytes).payload).canonical_sha512===null,!sha512);
    } finally {sample.dispose();}
  }
});
for(const [name,fn] of [
  ['missing PQ signature',e=>e.signatures.pop()],
  ['missing PQ requirement',e=>{e.protected.signers.pop();e.signatures.pop();}],
  ['unknown algorithm',e=>e.protected.signers[1].algorithm='unknown'],
  ['policy downgrade',e=>e.protected.policy='any'],
  ['different context',e=>e.protected.context='other'],
  ['different mode',e=>e.protected.mldsa_mode='prehash'],
  ['different purpose',e=>e.protected.purpose='receipt'],
  ['extra field',e=>e.public_key=f.declaration.keys[1].public_key],
  ['uppercase signature',e=>e.signatures[1].signature=e.signatures[1].signature.toUpperCase()],
  ['changed signature',e=>e.signatures[1].signature=(e.signatures[1].signature[0]==='0'?'1':'0')+e.signatures[1].signature.slice(1)],
  ['unbound signer identity',e=>e.signatures[0].key_id='alias'],
  ['unknown key alias',e=>{e.protected.signers[0].key_id='alias';e.signatures[0].key_id='alias';}],
  ['reordered signatures',e=>e.signatures.reverse()],
]) test(`refuses ${name}`,()=>assert.equal(check(edit(fn)).valid,false));

for(const name of ['corpus_version','sequence','week','snapshot_canonicalization','canonical_sha256','canonical_sha512','key_announcement_sha256']) {
  test(`refuses tampered payload binding ${name}`,()=>{
    const bytes=edit(e=>{const p=JSON.parse(e.payload);p[name]=typeof p[name]==='number'?p[name]+1:'changed';e.payload=JSON.stringify(p);});
    assert.equal(check(bytes).valid,false);
  });
}
test('refuses snapshot edits, edit-and-rehash, mismatched metadata and a valid signature over a wrong extra digest',()=>{
  const snapshot=Buffer.from(JSON.stringify({...JSON.parse(f.snapshot),synthetic:'altered'}));
  assert.equal(api.verifyCheckpoint({...f,snapshot}).valid,false);
  const e=JSON.parse(f.bytes),p=JSON.parse(e.payload);
  p.canonical_sha256=createHash('sha256').update(snapshot).digest('hex');e.payload=JSON.stringify(p);
  assert.equal(api.verifyCheckpoint({...f,snapshot,bytes:Buffer.from(JSON.stringify(e))}).valid,false);
  p.canonical_sha512='0'.repeat(128);e.payload=JSON.stringify(p);
  assert.equal(api.verifyCheckpoint({...f,snapshot,bytes:resign(f,e)}).valid,false);
  p.canonical_sha512=null;p.sequence++;e.payload=JSON.stringify(p);
  assert.equal(api.verifyCheckpoint({...f,snapshot,bytes:resign(f,e)}).valid,false);
});
test('rejects duplicate keys, alternate order/numbers/escaping, malformed UTF-8 and byte-limit excess',()=>{
  const raw=f.bytes.toString();
  const e=JSON.parse(raw),p=JSON.parse(e.payload);
  const cases=[
    raw+'\n', '\ufeff'+raw,
    raw.replace('"protected":','"protected":'+JSON.stringify(e.protected)+',"protected":'),
    JSON.stringify({payload:e.payload,protected:e.protected,signatures:e.signatures}),
    raw.replace('"version":1','"version":1.0'),
    raw.replace('corpus-checkpoint','corpus-\\u0063heckpoint'),
    JSON.stringify({...e,payload:e.payload.replace('"sequence":1','"sequence":1,"sequence":1')}),
    JSON.stringify({...e,payload:JSON.stringify({...p,sequence:9007199254740992})}),
  ];
  for(const bytes of cases) assert.equal(check(Buffer.from(bytes)).valid,false);
  assert.equal(check(Buffer.concat([f.bytes,Buffer.from([0xff])])).valid,false);
  assert.equal(check(Buffer.alloc(api.CONTRACT.max_envelope_bytes+1)).valid,false);
});
function assertCheckpointPurpose(module) {assert.equal(module.verifyCheckpoint({...f,bytes:wrongPurposeCheckpoint(f)}).valid,false);}
function assertArtifactPurpose(module) {
  assert.equal(module.verifyArtifactSignature({bytes:f.snapshot,signature:sign(null,f.snapshot,f.checkpoint.privateKey),
    keyId:f.declaration.keys[1].key_id,trustBytes:f.trustBytes}),false);
}
test('valid mathematical signatures do not authorize a key for the other purpose',()=>{
  const wrong=wrongPurposeCheckpoint(f),e=JSON.parse(wrong);
  assert.equal(verify(null,api.checkpointMessage(e.protected,e.payload),f.artifact.publicKey,Buffer.from(e.signatures[0].signature,'hex')),true);
  assertCheckpointPurpose(api);assertArtifactPurpose(api);
  assert.equal(api.verifyArtifactSignature({bytes:f.snapshot,signature:sign(null,f.snapshot,f.artifact.privateKey),
    keyId:f.declaration.keys[0].key_id,trustBytes:f.trustBytes}),true);
  assert.throws(()=>api.signCheckpoint({...f,edPrivateKey:f.artifact.privateKey,pqSecretKey:f.pq.secretKey}));
});
test('an alias cannot grant the same Ed25519 public key both purposes',()=>{
  const d=structuredClone(f.declaration);d.keys[1].public_key=d.keys[0].public_key;
  assert.throws(()=>api.encodeTrust(d));
  assert.equal(api.verifyCheckpoint({...f,trustBytes:Buffer.from(JSON.stringify(d))}).valid,false);
});
test('missing or changed caller trust never becomes embedded self-appointed trust',()=>{
  assert.equal(check(f.bytes).valid,true);
  assert.equal(api.verifyCheckpoint({...f,trustBytes:undefined}).valid,false);
  const other=fixture();try{assert.equal(api.verifyCheckpoint({...f,trustBytes:other.trustBytes}).valid,false);}finally{other.dispose();}
});
test('hedged label remains a claim; the signer refuses entropy failure without publishing bytes',()=>{
  assert.equal(check(resign(f,JSON.parse(f.bytes),f.checkpoint,false)).valid,true);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  let reads=0;
  try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(){reads++;throw Error('fixture_entropy_failure');}}});
    assert.throws(()=>api.signCheckpoint({...f,edPrivateKey:f.checkpoint.privateKey,pqSecretKey:f.pq.secretKey}),/fixture_entropy_failure/);
    assert.equal(reads,1);
  } finally {Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('both purpose assertions go red if the authorization guard is removed',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'scvd-purpose-mutant-'));
  try {
    const source=await readFile(new URL('./checkpoint.mjs',import.meta.url),'utf8');
    const guard='require(entry.purpose===purpose);';assert.equal(source.split(guard).length,2);
    const mutant=source.replace(guard,'/* intentionally removed by negative control */')
      .replace("'@noble/post-quantum/ml-dsa.js'",JSON.stringify(import.meta.resolve('@noble/post-quantum/ml-dsa.js')));
    const path=join(directory,'checkpoint.mjs');await writeFile(path,mutant);
    const module=await import(pathToFileURL(path).href);
    assert.throws(()=>assertCheckpointPurpose(module),assert.AssertionError);
    assert.throws(()=>assertArtifactPurpose(module),assert.AssertionError);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('public fixtures verify in another process and fixture generation refuses overwrite',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'scvd-checkpoint-cli-'));
  const output=join(directory,'fixture');
  const cli=new URL('./checkpoint-cli.mjs',import.meta.url).pathname;
  const run=args=>spawnSync(process.execPath,[cli,...args],{env:{PATH:process.env.PATH ?? ''},timeout:10000,encoding:'utf8'});
  try {
    const created=run(['create-fixture',output]);assert.equal(created.status,0,created.stderr);
    const saved=await readFile(join(output,'checkpoint.json'));
    const verifyArgs=['verify',join(output,'checkpoint.json'),join(output,'trust.json'),join(output,'snapshot.json')];
    const good=run(verifyArgs);assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).anchoring,'not_checked');
    const bad=run(['verify',join(output,'wrong-purpose-checkpoint.json'),...verifyArgs.slice(2)]);
    assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stdout).valid,false);
    assert.equal(run(['create-fixture',output]).status,1);
    assert.deepEqual(await readFile(join(output,'checkpoint.json')),saved);
    const tampered=Buffer.from(saved);tampered[tampered.length-20]^=1;
    await writeFile(join(output,'checkpoint.json'),tampered);
    assert.equal(run(verifyArgs).status,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('retained public fixture pins the draft contract and remains verifiable',async()=>{
  const root=new URL('../../research/qualification-2026-09-11/checkpoint-draft/',import.meta.url);
  const load=name=>readFile(new URL(name,root));
  const format=JSON.parse(await load('format.json'));
  assert.deepEqual(format,{contract:api.CONTRACT,fields:api.FORMAT_FIELDS});
  const trustBytes=await load('trust.json'),snapshot=await load('snapshot.json');
  assert.equal(api.verifyCheckpoint({bytes:await load('checkpoint.json'),trustBytes,snapshot}).valid,true);
  assert.equal(api.verifyCheckpoint({bytes:await load('wrong-purpose-checkpoint.json'),trustBytes,snapshot}).valid,false);
});
