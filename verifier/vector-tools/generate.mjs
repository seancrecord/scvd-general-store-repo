import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData } from 'viem';
import { ethers } from 'ethers';
import { digest, keyIdentity, nativeJws, assertOracle, validateInventory } from '../test-support/independent-matrix.mjs';

const file = new URL('../fixtures/independent/matrix.json', import.meta.url);
const bytesHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const b64 = (value) => Buffer.from(value).toString('base64url');
const encode = (value) => b64(JSON.stringify(value));
const clone = (value) => structuredClone(value);
const clock = 1767225600;
const origin = 'https://independent.example.test';
const kid = 'did:web:independent.example.test#signing-key';
// PUBLIC TEST MATERIAL. Every private scalar is reproducible from this label.
const secret = (label) => sha256(new TextEncoder().encode(`SCVD PS2 public test key only: ${label}`));
const sourceRecords = JSON.parse(readFileSync(new URL('../../research/verifier-ps2-2026-09-16/sources.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('./package-lock.json', import.meta.url)));
const dependencies = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).dependencies)
  .map(([name, version]) => [name, { version, integrity: lock.packages[`node_modules/${name}`].integrity, license: lock.packages[`node_modules/${name}`].license }]));
const sources = [...sourceRecords,
  { id: 'rfc8037', revision: 'RFC 8037, January 2017', url: 'https://www.rfc-editor.org/rfc/rfc8037' },
  { id: 'rfc7518', revision: 'RFC 7518, May 2015', url: 'https://www.rfc-editor.org/rfc/rfc7518' },
  { id: 'rfc8812', revision: 'RFC 8812, June 2020', url: 'https://www.rfc-editor.org/rfc/rfc8812' },
];
const matrix = {
  version: 1, clock,
  scope: 'Synthetic offline vectors. Signature, bounded field-schema oracle and supplied authorization policy are separate. No live issuer authorization or settlement observation.',
  provenance: { license: 'MIT', generatedBy: 'verifier/vector-tools/generate.mjs',
    generatorSha256: bytesHash(readFileSync(new URL('./generate.mjs', import.meta.url))),
    helperSha256: bytesHash(readFileSync(new URL('../test-support/independent-matrix.mjs', import.meta.url))),
    lockSha256: bytesHash(readFileSync(new URL('./package-lock.json', import.meta.url))),
    dependencies, sources,
    independentVerification: { jws: 'Node node:crypto / OpenSSL', eip712: 'ethers 5.8.0 / elliptic 6.6.1' },
    runtimeQualification: 'See research/verifier-ps2-2026-09-16/verification.json; versions are observations, not generator inputs.' },
  families: [
    { id: 'EdDSA', curve: 'Ed25519', specification: ['x402', 'rfc8037'], independentVectors: true, implemented: 'compact JWS signature and local revision-1 profile', expectedUnsupported: 'format-labelled object envelope', runtimeTargets: ['node', 'workerd'] },
    { id: 'ES256', curve: 'P-256', specification: ['x402', 'rfc7518'], independentVectors: true, implemented: false, expectedUnsupported: 'unsupported_algorithm for well-formed compact JWS', runtimeTargets: ['node', 'workerd'] },
    { id: 'ES256K', curve: 'secp256k1', specification: ['x402', 'rfc8812'], independentVectors: true, implemented: false, expectedUnsupported: 'unsupported_algorithm for well-formed compact JWS', runtimeTargets: ['node', 'workerd'] },
    { id: 'eip712', curve: 'secp256k1', specification: ['x402', 'eip712'], independentVectors: true, implemented: false, expectedUnsupported: 'unsupported_format for EIP-712 envelope', runtimeTargets: ['node', 'workerd'] },
  ],
  issuerCases: ['receipt-valid.json', 'offer-expired-but-wellformed.json'].map((name) => ({
    issuer: 'SCVD conformance test key', family: 'EdDSA', fixture: name,
    independence: 'supplemental existing synthetic issuer fixture; neither independent generation nor a live production artifact',
    sha256: digest(JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)))),
  })),
  vectors: [],
};

function payloadFor(kind) {
  return kind === 'offer' ? { version: 1, resourceUrl: `${origin}/resource`, scheme: 'exact', network: 'eip155:8453', asset: '0x0000000000000000000000000000000000000004', payTo: '0x0000000000000000000000000000000000000001', amount: '1000', validUntil: clock + 3600 }
    : { version: 1, resourceUrl: `${origin}/resource`, network: 'eip155:8453', payer: '0x0000000000000000000000000000000000000002', issuedAt: clock - 60, transaction: `0x${'ab'.repeat(32)}` };
}
function packageExpectation(family, control) {
  if (control === 'labelled-envelope' || family === 'eip712') return { status: 'unsupported', reasons: ['unsupported_format'] };
  if (control === 'malformed') return { status: 'invalid', reasons: ['malformed_input'] };
  if (control === 'missing-expiry') return { status: 'invalid', reasons: ['schema_invalid'], signature: family === 'EdDSA' ? 'valid' : 'unobserved' };
  if (family !== 'EdDSA') return { status: 'unsupported', reasons: ['unsupported_algorithm'], signature: 'unobserved' };
  if (['payload-tamper', 'signature-tamper', 'wrong-key', 'header-tamper'].includes(control)) return { status: 'invalid', reasons: ['signature_invalid'], signature: 'invalid' };
  return { status: 'valid', reasons: [], signature: 'valid' };
}
function add(vector, control, overrides = {}) {
  vector.case = control;
  vector.id = `${vector.family}/${vector.kind}/${control}`;
  vector.expectedPackage = packageExpectation(vector.family, control);
  vector.oracle = { ...vector.oracle, ...overrides };
  vector.provenance = { license: 'MIT', sources: matrix.families.find((f) => f.id === vector.family).specification, generator: vector.family === 'eip712' ? 'viem@2.56.3' : '@noble/curves@1.9.1' };
  vector.sha256 = digest(vector);
  matrix.vectors.push(vector);
}
function publicJwk(curve, privateKey, family) {
  if (family === 'EdDSA') return { kty: 'OKP', crv: 'Ed25519', x: b64(curve.getPublicKey(privateKey)) };
  const point = curve.getPublicKey(privateKey, false);
  return { kty: 'EC', crv: family === 'ES256' ? 'P-256' : 'secp256k1', x: b64(point.slice(1, 33)), y: b64(point.slice(33)) };
}
function jws(curve, privateKey, family, payload) {
  const message = `${encode({ alg: family, kid, typ: 'JWT' })}.${encode(payload)}`;
  const bytes = new TextEncoder().encode(message);
  const signature = family === 'EdDSA' ? curve.sign(bytes, privateKey) : curve.sign(sha256(bytes), privateKey).toCompactRawBytes();
  return `${message}.${b64(signature)}`;
}
const flipSignature = (value) => { const bytes = Buffer.from(value, 'base64url'); bytes[0] ^= 1; return bytes.toString('base64url'); };
const goodOracle = (encoding) => ({ encoding, signature: true, schema: true, authorization: 'valid', claim: 'valid' });

for (const [family, curve] of [['EdDSA', ed25519], ['ES256', p256], ['ES256K', secp256k1]]) {
  for (const kind of ['offer', 'receipt']) {
    const privateKey = secret(family);
    const jwk = publicJwk(curve, privateKey, family);
    const payload = payloadFor(kind);
    const base = { family, kind, artifact: jws(curve, privateKey, family, payload), publicJwk: jwk,
      authorization: { [origin]: [keyIdentity(jwk)] }, oracle: goodOracle('jws') };
    add(clone(base), 'positive');
    let v = clone(base); let parts = v.artifact.split('.');
    parts[1] = encode({ ...payload, [kind === 'offer' ? 'amount' : 'payer']: kind === 'offer' ? '1001' : '0x0000000000000000000000000000000000000005' }); v.artifact = parts.join('.');
    add(v, 'payload-tamper', { signature: false, claim: 'invalid' });
    v = clone(base); parts = v.artifact.split('.'); parts[2] = flipSignature(parts[2]); v.artifact = parts.join('.');
    add(v, 'signature-tamper', { signature: false, claim: 'invalid' });
    v = clone(base); v.publicJwk = publicJwk(curve, secret(`${family}-other`), family);
    add(v, 'wrong-key', { signature: false, authorization: 'invalid', claim: 'invalid' });
    v = clone(base); v.authorization[origin] = ['another-authorized-key'];
    add(v, 'wrong-authority', { authorization: 'invalid', claim: 'invalid' });
    v = clone(base); v.authorization = {};
    add(v, 'authority-unavailable', { authorization: 'inconclusive', claim: 'inconclusive' });
    v = clone(base); parts = v.artifact.split('.'); parts[0] = encode({ alg: family, kid: `${kid}-other`, typ: 'JWT' }); v.artifact = parts.join('.');
    add(v, 'header-tamper', { signature: false, claim: 'invalid' });
    v = clone(base); v.artifact = jws(curve, privateKey, family, { ...payload, [kind === 'offer' ? 'amount' : 'payer']: 42 });
    add(v, 'wrong-field-type', { schema: false, claim: 'invalid' });
    if (kind === 'offer') {
      v = clone(base); const without = clone(payload); delete without.validUntil; v.artifact = jws(curve, privateKey, family, without);
      add(v, 'missing-expiry');
      v = clone(base); v.artifact = jws(curve, privateKey, family, { ...payload, validUntil: clock - 1 });
      add(v, 'expired');
    }
    // These transport controls are outside the cryptographic/policy oracle.
    v = clone(base); v.artifact = { format: 'jws', signature: v.artifact }; v.oracle = { encoding: 'transport' };
    add(v, 'labelled-envelope');
    v = clone(base); v.artifact = 'not.a.compact.jws'; v.oracle = { encoding: 'transport' };
    add(v, 'malformed');
  }
}

const fields = {
  offer: [['version', 'uint256'], ['resourceUrl', 'string'], ['scheme', 'string'], ['network', 'string'], ['asset', 'string'], ['payTo', 'string'], ['amount', 'string'], ['validUntil', 'uint256']],
  receipt: [['version', 'uint256'], ['network', 'string'], ['resourceUrl', 'string'], ['payer', 'string'], ['issuedAt', 'uint256'], ['transaction', 'string']],
};
const account = privateKeyToAccount(`0x${Buffer.from(secret('eip712')).toString('hex')}`);
for (const kind of ['offer', 'receipt']) {
  const primaryType = kind === 'offer' ? 'Offer' : 'Receipt';
  const typedData = { domain: { name: `x402 ${kind}`, version: '1', chainId: 1 }, primaryType,
    types: { [primaryType]: fields[kind].map(([name, type]) => ({ name, type })) } };
  const payload = payloadFor(kind);
  const signature = await account.signTypedData({ ...typedData, message: payload });
  const base = { family: 'eip712', kind, artifact: { format: 'eip712', payload, signature }, typedData,
    typedDataHash: hashTypedData({ ...typedData, message: payload }), expectedSigner: account.address,
    authorization: { [origin]: [account.address.toLowerCase()] }, oracle: goodOracle('eip712') };
  add(clone(base), 'positive');
  let v = clone(base); v.artifact.payload[kind === 'offer' ? 'amount' : 'payer'] = kind === 'offer' ? '1001' : '0x0000000000000000000000000000000000000005';
  v.typedDataHash = hashTypedData({ ...v.typedData, message: v.artifact.payload });
  add(v, 'payload-tamper', { signature: false, claim: 'invalid' });
  v = clone(base); v.artifact.signature = `0x${(parseInt(signature.slice(2, 4), 16) ^ 1).toString(16).padStart(2, '0')}${signature.slice(4)}`;
  add(v, 'signature-tamper', { signature: false, claim: 'invalid' });
  v = clone(base); v.expectedSigner = '0x0000000000000000000000000000000000000003';
  add(v, 'wrong-key', { signature: false, authorization: 'invalid', claim: 'invalid' });
  v = clone(base); v.authorization[origin] = ['another-authorized-address'];
  add(v, 'wrong-authority', { authorization: 'invalid', claim: 'invalid' });
  v = clone(base); v.authorization = {};
  add(v, 'authority-unavailable', { authorization: 'inconclusive', claim: 'inconclusive' });
  for (const [field, value] of [['name', `x402 ${kind === 'offer' ? 'receipt' : 'offer'}`], ['version', '2'], ['chainId', 8453]]) {
    v = clone(base); v.typedData.domain[field] = value;
    v.typedDataHash = hashTypedData({ ...v.typedData, message: payload });
    add(v, `domain-${field}`, { signature: false, claim: 'invalid' });
  }
  v = clone(base); v.typedData.primaryType = 'WrongType'; v.typedData.types = { WrongType: v.typedData.types[primaryType] };
  v.typedDataHash = hashTypedData({ ...v.typedData, message: payload });
  add(v, 'primary-type', { signature: false, claim: 'invalid' });
  v = clone(base); v.artifact.format = 'jws'; v.oracle = { encoding: 'transport' };
  add(v, 'cross-format');
  v = clone(base); v.artifact.payload[kind === 'offer' ? 'validUntil' : 'transaction'] = kind === 'offer' ? 0 : '';
  v.typedDataHash = hashTypedData({ ...v.typedData, message: v.artifact.payload });
  v.artifact.signature = await account.signTypedData({ ...v.typedData, message: v.artifact.payload });
  add(v, 'optional-default');
}

export function checkEip(vector) {
  const { domain, types } = vector.typedData;
  assert.equal(ethers.utils._TypedDataEncoder.hash(domain, types, vector.artifact.payload), vector.typedDataHash, `${vector.id}: independent typed hash`);
  let signature = false;
  try { signature = ethers.utils.verifyTypedData(domain, types, vector.artifact.payload, vector.artifact.signature).toLowerCase() === vector.expectedSigner.toLowerCase(); } catch { /* malformed signatures fail closed */ }
  assertOracle(vector, signature);
}
validateInventory(matrix);
for (const vector of matrix.vectors) {
  if (vector.oracle.encoding === 'jws') assertOracle(vector, nativeJws(vector));
  if (vector.oracle.encoding === 'eip712') checkEip(vector);
}
// Kill altered evidence even when an editor also recomputes its fixture hash.
const eipPositive = matrix.vectors.find((v) => v.family === 'eip712' && v.case === 'positive');
const domainMutant = clone(eipPositive); domainMutant.typedData.domain.chainId = 2;
assert.throws(() => checkEip(domainMutant), /independent typed hash/);
const sigMutant = clone(eipPositive); sigMutant.artifact.signature = `0x${'00'.repeat(65)}`;
assert.throws(() => checkEip(sigMutant), /independent claim/);
const serialized = `${JSON.stringify(matrix, null, 2)}\n`;
if (process.argv.includes('--write')) {
  mkdirSync(new URL('../fixtures/independent/', import.meta.url), { recursive: true });
  writeFileSync(file, serialized);
} else {
  assert.equal(readFileSync(file, 'utf8'), serialized, 'retained vectors differ from independent regeneration');
}
console.log(`${matrix.vectors.length} independent vectors reproduced and checked; domain/signature harness mutants rejected.`);
