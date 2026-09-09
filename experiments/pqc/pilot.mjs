// Local feasibility exercise. Ephemeral keys never leave this process.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signingBytes, verifyEnvelope } from './envelope.mjs';

const hex = bytes => Buffer.from(bytes).toString('hex');
const backends = {
  ed25519: (bytes, signature, publicKey) => verify(null, bytes, createPublicKey({key:Buffer.from(publicKey,'hex'),format:'der',type:'spki'}), signature),
  'ML-DSA-65': (bytes, signature, publicKey) => ml_dsa65.verify(signature, bytes, Buffer.from(publicKey,'hex')),
};
const [mode, input, output] = process.argv.slice(2);
if (mode === 'verify' && input && output) {
  const envelope = JSON.parse(await readFile(input,'utf8'));
  const trust = JSON.parse(await readFile(output,'utf8'));
  const result = await verifyEnvelope(envelope,{...trust,verifiers:backends});
  console.log(JSON.stringify(result,null,2));
  process.exitCode = result.valid ? 0 : 1;
} else if (mode === 'create' && input && output) {
  const checkpoint = await readFile(input);
  if (checkpoint.length > 1024*1024) throw Error('checkpoint_too_large');
  JSON.parse(checkpoint.toString('utf8'));
  const ed = generateKeyPairSync('ed25519');
  const pq = ml_dsa65.keygen();
  const signers = [{algorithm:'ed25519',key_id:'pilot-ed25519'}, {algorithm:'ML-DSA-65',key_id:'pilot-ml-dsa-65'}];
  const header = {version:1,purpose:'corpus-checkpoint-pilot',canonicalization:'scvd-envelope-v1',policy:'all',signers};
  const payload = JSON.stringify({experimental:true,checkpoint_file_sha256:createHash('sha256').update(checkpoint).digest('hex'),checkpoint_bytes:checkpoint.length,scope:'A new experimental signature over captured file bytes; no renewal of the historical issuer signature, factual claim or timestamp.'});
  const bytes = signingBytes(header,payload);
  const signatures = [sign(null,bytes,ed.privateKey),ml_dsa65.sign(bytes,pq.secretKey)];
  const envelope = {protected:header,payload,signatures:signers.map((s,i)=>({...s,signature:hex(signatures[i])}))};
  const keys = [hex(ed.publicKey.export({format:'der',type:'spki'})),hex(pq.publicKey)];
  const trust = {purpose:header.purpose,signers:signers.map((s,i)=>({...s,public_key:keys[i]}))};
  const options = {...trust,verifiers:backends};
  const verified = await verifyEnvelope(envelope,options);
  if (!verified.valid) throw Error('pilot_verification_failed');
  const mutations = {
    payload: e => {e.payload += ' ';},
    pq_signature: e => {e.signatures[1].signature = '00'+e.signatures[1].signature.slice(2); e.signatures[1].signature = (e.signatures[1].signature === envelope.signatures[1].signature ? '01' : '00') + e.signatures[1].signature.slice(2);},
    downgrade: e => {e.protected.signers.pop();e.signatures.pop();},
    purpose: e => {e.protected.purpose='receipt';},
  };
  const rejected = {};
  for (const [name,mutate] of Object.entries(mutations)) {
    const altered = structuredClone(envelope); mutate(altered);
    rejected[name] = !(await verifyEnvelope(altered,options)).valid;
    if (!rejected[name]) throw Error('tampering_not_rejected');
  }
  const iterations = 20;
  const timing = {};
  for (const [i,s] of signers.entries()) {
    const signOne = i===0 ? ()=>sign(null,bytes,ed.privateKey) : ()=>ml_dsa65.sign(bytes,pq.secretKey);
    let start=performance.now();
    for(let n=0;n<iterations;n++) signOne();
    const sign_ms=(performance.now()-start)/iterations;
    start=performance.now();
    for(let n=0;n<iterations;n++) if(!backends[s.algorithm](bytes,signatures[i],keys[i])) throw Error('verification_failed');
    timing[s.algorithm]={iterations,mean_sign_ms:sign_ms,mean_verify_ms:(performance.now()-start)/iterations,signature_bytes:signatures[i].length,public_key_bytes:Buffer.from(keys[i],'hex').length,public_key_encoding:i===0?'SPKI DER':'raw'};
  }
  pq.secretKey.fill(0);
  const report = {experimental:true,run_at:new Date().toISOString(),runtime:process.version,platform:process.platform,architecture:process.arch,checkpoint_sha256:JSON.parse(payload).checkpoint_file_sha256,signed_bytes:bytes.length,envelope_json_bytes:Buffer.byteLength(JSON.stringify(envelope)),verified,rejected,timing,limitations:['Unaudited candidate library @noble/post-quantum 0.7.1; not approved for production.','Sign and verify use the same ML-DSA implementation; no independent interoperability or FIPS validation.','Local Node timing under concurrent test load; not Worker CPU or customer latency.','Throwaway trust document demonstrates mechanics, not issuer identity or secure operational custody.','Existing corpus signature and Bitcoin proof are not verified by this experiment.']};
  // Exclusive creation preserves earlier experimental evidence.
  await writeFile(output+'.envelope.json',JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
  await writeFile(output+'.trust.json',JSON.stringify(trust,null,2)+'\n',{flag:'wx'});
  await writeFile(output+'.result.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report,null,2));
} else {
  console.error('Usage: node pilot.mjs create <checkpoint.json> <new-output-prefix> | verify <envelope.json> <trusted-keys.json>');
  process.exitCode=2;
}
