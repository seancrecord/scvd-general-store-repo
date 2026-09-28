import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyArtifact, verifyOffer, verifyReceipt, CAPABILITIES } from './x402-verify.js';
import { nativeJws, assertOracle } from './test-support/independent-matrix.mjs';
const matrix = JSON.parse(readFileSync(new URL('./fixtures/independent/matrix.json', import.meta.url)));
const vectors = matrix.vectors.filter(v => v.family === 'EdDSA' && v.oracle.encoding === 'jws');
const positive = kind => vectors.find(v => v.kind === kind && v.case === 'positive');
const key = v => Buffer.from(v.publicJwk.x, 'base64url');
const options = v => ({ publicKey: key(v), nowSeconds: matrix.clock, kind: v.kind,
  fetch: async () => { throw new Error('no live issuer'); } });
const bounded = (v, artifact, overrides = {}) => (v.kind === 'offer' ? verifyOffer : verifyReceipt)({ [v.kind]: artifact, publicKey: key(v), ...overrides }, options(v));

for (const v of vectors) test(`JWS envelope preserves independent ${v.id}`, async () => {
  assertOracle(v, nativeJws(v));
  const envelope = { format: 'jws', signature: v.artifact };
  const compact = await verifyArtifact(v.artifact, options(v));
  const wrapped = await verifyArtifact(envelope, options(v));
  assert.deepEqual({ ...wrapped, scope: compact.scope }, compact);
  assert.match(wrapped.scope, /acceptIndex.*unsigned/);
  const plain = await bounded(v, v.artifact);
  const result = await bounded(v, envelope);
  assert.equal(result.status, plain.status);
  assert.deepEqual(result.payload, plain.payload);
  assert.deepEqual(result.reasonCodes, plain.reasonCodes);
  for (const limit of plain.doesNotEstablish) assert.ok(result.doesNotEstablish.includes(limit));
  assert.ok(result.doesNotEstablish.some(x => /unsigned.*acceptIndex/.test(x)));
});

test('acceptIndex never selects payload, changes signed bytes or establishes negotiation agreement', async () => {
  const v = positive('offer');
  for (const acceptIndex of [0, 1, Number.MAX_SAFE_INTEGER]) {
    const result = await bounded(v, { format: 'jws', signature: v.artifact, acceptIndex });
    assert.equal(result.status, 'valid');
    assert.deepEqual(result.payload, JSON.parse(Buffer.from(v.artifact.split('.')[1], 'base64url')));
    assert.match(result.scope, /acceptIndex.*unsigned/);
    assert.ok(result.doesNotEstablish.some(x => /payment terms/.test(x)));
  }
});

test('ambiguous/malformed wrappers fail before fetching a key or invoking crypto', async () => {
  const v = positive('offer'); const base = { format: 'jws', signature: v.artifact };
  for (const artifact of [
    { ...base, payload: {} }, { ...base, payload: undefined },
    { ...base, signature: null }, { ...base, signature: { format: 'jws', signature: v.artifact } },
    { format: 'jws' }, { ...base, signature: '' },
    ...[-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER + 1].map(acceptIndex => ({ ...base, acceptIndex })),
    { ...base, issuerKeyUrl: 'https://attacker.invalid/key' }, { ...base, publicKey: key(v) },
  ]) {
    let calls = 0;
    const result = await verifyArtifact(artifact, { kind: 'offer', fetch: async () => { calls++; }, verify: () => { calls++; return true; } });
    assert.equal(result.ok, false);
    assert.ok(['invalid', 'unsupported'].includes(result.status));
    assert.equal(calls, 0);
  }
  const receipt = positive('receipt');
  const result = await verifyReceipt({ receipt: { format: 'jws', signature: receipt.artifact, acceptIndex: 0 } }, {
    fetch: async () => { throw new Error('must not fetch'); }, verify: () => assert.fail('must not verify'),
  });
  assert.equal(result.status, 'invalid');
  assert.ok(result.reasonCodes.includes('malformed_input'));
});

test('wrapped algorithm confusion and unsupported formats cannot enable the Ed25519 seam', async () => {
  for (const family of ['ES256', 'ES256K']) {
    const v = matrix.vectors.find(v => v.family === family && v.kind === 'receipt' && v.case === 'positive');
    const result = await verifyArtifact({ format: 'jws', signature: v.artifact }, {
      publicKey: key(positive('receipt')), verify: () => assert.fail('wrong algorithm reached Ed25519'),
    });
    assert.equal(result.status, 'unsupported');
    assert.ok(result.reasonCodes.includes('unsupported_algorithm'));
  }
  for (const format of ['eip712', 'future', 'jws-detached']) {
    const result = await verifyArtifact({ format, signature: positive('receipt').artifact });
    assert.equal(result.status, 'unsupported');
    assert.ok(result.reasonCodes.includes('unsupported_format'));
  }
});

test('wrapper key lookup uses the signed kid or caller-selected URL, never wrapper metadata', async () => {
  const v = positive('receipt'); const artifact = { format: 'jws', signature: v.artifact };
  const kid = JSON.parse(Buffer.from(v.artifact.split('.')[0], 'base64url')).kid;
  const urls = [];
  const fetch = async url => { urls.push(url); return new Response(JSON.stringify({ verificationMethod: [{ id: kid, publicKeyJwk: v.publicJwk }] })); };
  assert.equal((await verifyArtifact(artifact, { fetch })).status, 'valid');
  assert.equal((await verifyReceipt({ receipt: artifact, issuerKeyUrl: 'https://independent.example.test/key' }, { fetch })).status, 'valid');
  assert.deepEqual(urls, ['https://independent.example.test/.well-known/did.json', 'https://independent.example.test/key']);
  const unavailable = await verifyArtifact(artifact, { fetch: async () => new Response(null, { status: 503 }) });
  assert.equal(unavailable.status, 'inconclusive');
  assert.ok(unavailable.reasonCodes.includes('key_unavailable'));
});

test('capability inventory names the implemented wrapper', () => {
  assert.ok(CAPABILITIES.artifact_formats.includes('x402-jws-envelope'));
});
