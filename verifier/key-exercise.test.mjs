import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { checkKeyServiceWindow } from './x402-verify.js';
import { createEvidenceBundle, verifyEvidenceBundle } from './evidence-bundle.js';

test('loss, rotation and stolen-key backdating have different evidence boundaries', async () => {
  const oldKey=generateKeyPairSync('ed25519');
  const newKey=generateKeyPairSync('ed25519');
  const pub=k=>k.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const oldPub=pub(oldKey), newPub=pub(newKey);
  const history={current:{public_key:newPub,in_service_from:'2026-09-01'},retired:[{public_key:oldPub,in_service_from:'2026-08-01',retired_on:'2026-09-01'}]};
  const record = date => {
    const signed_payload=JSON.stringify({date,observation:'synthetic exercise only'});
    return {algorithm:'ed25519',public_key:oldPub,signed_payload,signature:sign(null,Buffer.from(signed_payload),oldKey.privateKey).toString('hex')};
  };
  const historical=await createEvidenceBundle(record('2026-08-15T12:00:00Z'));
  // Losing access to the private key cannot prevent verification with its retained public key.
  assert.equal((await verifyEvidenceBundle(historical,{publicKey:oldPub})).valid,true);
  assert.equal((await verifyEvidenceBundle(historical,{publicKey:newPub})).valid,false);
  const late=await createEvidenceBundle(record('2026-09-08T12:00:00Z'));
  assert.equal((await verifyEvidenceBundle(late,{publicKey:oldPub})).valid,true);
  assert.equal(checkKeyServiceWindow(history,oldPub,'2026-09-08T12:00:00Z').status,'after_retirement');
  // A stolen key can write an in-window date. Neither check establishes when signing happened.
  const backdated=await createEvidenceBundle(record('2026-08-20T12:00:00Z'));
  const verified=await verifyEvidenceBundle(backdated,{publicKey:oldPub});
  assert.equal(verified.valid,true);
  assert.equal(checkKeyServiceWindow(history,oldPub,'2026-08-20T12:00:00Z').status,'in_service');
  assert.equal(verified.timestamp.verified,false);
  assert.equal(verified.timestamp.status,'absent');
  assert.ok(verified.does_not_establish.includes('issue time or key authorization at issue time'));
});
