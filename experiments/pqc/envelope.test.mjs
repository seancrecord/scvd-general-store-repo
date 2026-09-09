import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { signingBytes, verifyEnvelope } from "./envelope.mjs";

// Two independent Ed25519 test keys stand in for backend dispatch here.
// The real ML-DSA backend is exercised separately by the local pilot.
const keys = [generateKeyPairSync('ed25519'), generateKeyPairSync('ed25519')];
const signers = [{ algorithm:'ed25519', key_id:'classical' }, { algorithm:'ML-DSA-65', key_id:'pq' }];
const header = { version:1, purpose:'corpus-checkpoint-pilot', canonicalization:'scvd-envelope-v1', policy:'all', signers };
const options = { purpose:header.purpose, signers:signers.map((s,i)=>({...s, public_key:keys[i].publicKey})), verifiers:Object.fromEntries(signers.map(s=>[s.algorithm, (bytes, signature, key)=>verify(null, bytes, key, signature)])) };
function envelope() {
  const payload = '{"snapshot_digest":"example","observed_at":"2026-09-08T00:00:00Z"}';
  const bytes = signingBytes(header,payload);
  return { protected:structuredClone(header), payload, signatures:signers.map((s,i)=>({...s, signature:sign(null,bytes,keys[i].privateKey).toString('hex')})) };
}
test('all required signatures verify over the same protected header and exact payload', async()=>{
  assert.equal((await verifyEnvelope(envelope(),options)).valid,true);
});
for(const [name,edit] of [
  ['payload',e=>e.payload+=' '], ['purpose',e=>e.protected.purpose='other'],
  ['algorithm',e=>e.protected.signers[1].algorithm='unknown'],
  ['key identity',e=>e.protected.signers[1].key_id='other'],
  ['policy',e=>e.protected.policy='any'],
  ['missing PQ signature',e=>e.signatures.pop()],
  ['stripped PQ declaration and signature',e=>{e.protected.signers.pop();e.signatures.pop();}],
  ['duplicate signature',e=>e.signatures[1]=e.signatures[0]],
  ['unsupported canonicalization',e=>e.protected.canonicalization='JCS'],
  ['extra unsigned header',e=>e.protected.valid=true],
]) test(`refuses ${name}`,async()=>{const e=envelope();edit(e);assert.equal((await verifyEnvelope(e,options)).valid,false);});
test('does not accept a self-appointed key, missing backend, thrown backend, or absent expected policy',async()=>{
  const e=envelope();
  assert.equal((await verifyEnvelope(e,{})).valid,false);
  assert.equal((await verifyEnvelope(e,{...options,verifiers:{}})).valid,false);
  assert.equal((await verifyEnvelope(e,{...options,verifiers:{ed25519:()=>{throw Error('backend down')}}})).valid,false);
  assert.equal((await verifyEnvelope(null,options)).valid,false);
});
