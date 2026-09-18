// Copy this file into a clean project containing only the packed x402-verify.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyArtifact, verifyOffer, verifyReceipt } from 'x402-verify';

const root = new URL('.', import.meta.resolve('x402-verify'));
const matrix = JSON.parse(readFileSync(new URL('fixtures/independent/matrix.json', root)));
const manifest = JSON.parse(readFileSync(new URL('package.json', root)));
assert.equal(manifest.dependencies, undefined);
const statuses = {};
for (const vector of matrix.vectors) {
  const publicKey = vector.publicJwk?.kty === 'OKP' ? Buffer.from(vector.publicJwk.x, 'base64url') : undefined;
  const options = { kind: vector.kind, publicKey, nowSeconds: matrix.clock,
    fetch: async () => { throw new Error('offline package consumer'); } };
  const report = await verifyArtifact(vector.artifact, options);
  assert.equal(report.status, vector.expectedPackage.status, vector.id);
  for (const reason of vector.expectedPackage.reasons) assert.ok(report.reasonCodes.includes(reason), vector.id);
  const bounded = vector.kind === 'offer' ? await verifyOffer({ offer: vector.artifact, publicKey }, options)
    : await verifyReceipt({ receipt: vector.artifact, publicKey }, options);
  assert.equal(bounded.status, report.status, vector.id);
  statuses[report.status] = (statuses[report.status] ?? 0) + 1;
}
const vector = matrix.vectors.find((v) => v.family === 'EdDSA' && v.case === 'positive');
const missing = await verifyArtifact(vector.artifact, { kind: vector.kind, nowSeconds: matrix.clock,
  fetch: async () => { throw new Error('unavailable'); } });
assert.equal(missing.status, 'inconclusive');
assert.ok(missing.reasonCodes.includes('key_unavailable'));
console.log(JSON.stringify({ version: manifest.version, runtime: process.version, vectors: matrix.vectors.length,
  statuses, unavailableKey: missing.status, dependencies: 0, liveNetwork: false }, null, 2));
