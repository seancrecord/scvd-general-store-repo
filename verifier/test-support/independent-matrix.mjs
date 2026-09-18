import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const keyIdentity = (jwk) => digest(jwk);
export const controls = ['positive', 'payload-tamper', 'signature-tamper', 'wrong-key', 'wrong-authority', 'authority-unavailable'];

export function validateInventory(matrix) {
  assert.deepEqual(matrix.families.map((row) => row.id).sort(), ['EdDSA', 'ES256', 'ES256K', 'eip712'].sort());
  const ids = new Set();
  for (const vector of matrix.vectors) {
    assert.ok(!ids.has(vector.id), `duplicate ${vector.id}`);
    ids.add(vector.id);
    const { sha256, ...body } = vector;
    assert.equal(digest(body), sha256, `${vector.id}: fixture hash`);
    assert.equal(vector.provenance.license, 'MIT');
    assert.ok(vector.provenance.sources.length > 0);
  }
  for (const family of matrix.families) for (const kind of ['offer', 'receipt']) {
    const cases = matrix.vectors.filter((v) => v.family === family.id && v.kind === kind);
    for (const control of controls) assert.ok(cases.some((v) => v.case === control), `${family.id}/${kind} lacks ${control}`);
    const positive = cases.find((v) => v.case === 'positive');
    assert.equal(positive.expectedPackage.status, family.id === 'EdDSA' ? 'valid' : 'unsupported');
  }
}

export function decodePayload(vector) {
  return vector.oracle.encoding === 'jws'
    ? JSON.parse(Buffer.from(vector.artifact.split('.')[1], 'base64url')) : vector.artifact.payload;
}

// A deliberately bounded schema oracle for the fields exercised here, not a
// general conformance implementation. It catches the known local-profile gaps.
export function schemaValid(payload, kind) {
  const fields = kind === 'offer'
    ? ['resourceUrl', 'scheme', 'network', 'asset', 'payTo', 'amount']
    : ['resourceUrl', 'network', 'payer'];
  if (!payload || payload.version !== 1 || fields.some((f) => typeof payload[f] !== 'string')) return false;
  const integer = (v) => Number.isSafeInteger(v) && v >= 0;
  if (kind === 'offer' && payload.validUntil !== undefined && !integer(payload.validUntil)) return false;
  if (kind === 'receipt' && (!integer(payload.issuedAt) || (payload.transaction !== undefined && typeof payload.transaction !== 'string'))) return false;
  return true;
}

export function nativeJws(vector) {
  try {
    const [header, payload, signature] = vector.artifact.split('.');
    return verify(vector.family === 'EdDSA' ? null : 'sha256', Buffer.from(`${header}.${payload}`),
      { key: createPublicKey({ key: vector.publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  } catch { return false; }
}

export function evaluateClaim(vector, signature) {
  const payload = decodePayload(vector);
  const schema = schemaValid(payload, vector.kind);
  const identity = vector.oracle.encoding === 'jws' ? keyIdentity(vector.publicJwk) : vector.expectedSigner.toLowerCase();
  const allowed = vector.authorization[new URL(payload.resourceUrl).origin];
  const authorization = allowed === undefined ? 'inconclusive' : allowed.includes(identity) ? 'valid' : 'invalid';
  const claim = !signature || !schema || authorization === 'invalid' ? 'invalid' : authorization;
  return { signature, schema, authorization, claim };
}

export function assertOracle(vector, signature) {
  assert.deepEqual(evaluateClaim(vector, signature), {
    signature: vector.oracle.signature, schema: vector.oracle.schema,
    authorization: vector.oracle.authorization, claim: vector.oracle.claim,
  }, `${vector.id}: independent claim`);
}
