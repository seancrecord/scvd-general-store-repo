// Test support only: fresh private keys stay in process memory.
import { generateKeyPairSync, sign } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { CONTRACT,encodeTrust,signCheckpoint,checkpointMessage } from './checkpoint.mjs';

export function fixture(includeSha512=false) {
  const artifact=generateKeyPairSync('ed25519'),checkpoint=generateKeyPairSync('ed25519'),pq=ml_dsa65.keygen();
  const publicKey=key=>key.export({format:'der',type:'spki'}).toString('hex');
  const declaration={version:1,purpose:'synthetic-checkpoint-trust',keys:[
    {algorithm:'ed25519',key_id:'fixture-artifact',purpose:'artifact',encoding:'spki-der-hex',public_key:publicKey(artifact.publicKey)},
    {algorithm:'ed25519',key_id:'fixture-checkpoint',purpose:'checkpoint',encoding:'spki-der-hex',public_key:publicKey(checkpoint.publicKey)},
    {algorithm:'ML-DSA-65',key_id:'fixture-pq',purpose:'checkpoint',encoding:'raw-hex',public_key:Buffer.from(pq.publicKey).toString('hex')},
  ]};
  const trustBytes=encodeTrust(declaration);
  // Opaque synthetic input, deliberately not presented as a real ward reading.
  const snapshot=Buffer.from(JSON.stringify({version:1,sequence:1,week:'2026-W37',synthetic:true}));
  const f={artifact,checkpoint,pq,declaration,trustBytes,snapshot};
  f.bytes=signCheckpoint({...f,edPrivateKey:checkpoint.privateKey,pqSecretKey:pq.secretKey,includeSha512});
  f.dispose=()=>pq.secretKey.fill(0);
  return f;
}
export function resign(f,envelope,ed=f.checkpoint,extraEntropy) {
  const bytes=checkpointMessage(envelope.protected,envelope.payload);
  envelope.signatures=[sign(null,bytes,ed.privateKey),ml_dsa65.sign(bytes,f.pq.secretKey,{context:Buffer.from(CONTRACT.context),extraEntropy})]
    .map((signature,i)=>({...envelope.protected.signers[i],signature:Buffer.from(signature).toString('hex')}));
  return Buffer.from(JSON.stringify(envelope));
}
export function wrongPurposeCheckpoint(f) {
  const e=JSON.parse(f.bytes);
  e.protected.signers[0].key_id=f.declaration.keys[0].key_id;
  return resign(f,e,f.artifact);
}
