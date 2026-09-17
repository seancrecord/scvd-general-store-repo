import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyReceipt } from '../verifier/x402-verify.js';

const root = new URL('../verifier/', import.meta.url);
const matrix = JSON.parse(readFileSync(new URL('fixtures/independent/matrix.json', root)));
const find = (family, control) => matrix.vectors.find((v) => v.family === family && v.kind === 'receipt' && v.case === control);
const good = find('EdDSA', 'positive');
const fixtures = {
  'receipt.json': { receipt: good.artifact, sourceVector: good.id },
  'receipt-tampered.json': { receipt: find('EdDSA', 'payload-tamper').artifact, sourceVector: find('EdDSA', 'payload-tamper').id },
  'receipt-es256.json': { receipt: find('ES256', 'positive').artifact, sourceVector: find('ES256', 'positive').id },
  'issuer-key.json': { publicKeyHex: Buffer.from(good.publicJwk.x, 'base64url').toString('hex'),
    provenance: 'Synthetic public test key from the independent noble generator; separately supplied to the verifier. Does not establish real service authorization.',
    sourceVector: good.id, sourceVectorSha256: good.sha256, sourceGenerator: matrix.provenance.generatedBy,
    generatorSha256: matrix.provenance.generatorSha256, license: 'MIT' },
};
const write = process.argv.includes('--write');
for (const [name, value] of Object.entries(fixtures)) {
  const path = new URL(`fixtures/start-here/${name}`, root);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (write) { mkdirSync(new URL('fixtures/start-here/', root), { recursive: true }); writeFileSync(path, text); }
  else assert.equal(readFileSync(path, 'utf8'), text, `${name} differs from independent source`);
}
const result = await verifyReceipt({ receipt: good.artifact, publicKey: fixtures['issuer-key.json'].publicKeyHex }, { subtle: webcrypto.subtle });
assert.equal(result.status, 'valid');
const { status, reasonCodes, scope, doesNotEstablish } = result;
const output = JSON.stringify({ status, reasonCodes, scope, doesNotEstablish }, null, 2);
const code = readFileSync(new URL('examples/verify-receipt.mjs', root), 'utf8').trim();
const path = new URL('README.md', root);
let readme = readFileSync(path, 'utf8');
for (const [marker, language, content] of [['code', 'js', code], ['output', 'json', output]]) {
  const pattern = new RegExp(`<!-- quickstart-${marker} -->\\s*\x60\x60\x60${language}\\n[\\s\\S]*?\\n\x60\x60\x60`);
  const block = `<!-- quickstart-${marker} -->\n\x60\x60\x60${language}\n${content}\n\x60\x60\x60`;
  assert.match(readme, pattern, 'quickstart marker missing');
  if (write) readme = readme.replace(pattern, block);
  else assert.equal(readme.match(pattern)?.[0], block, `quickstart ${marker} drift`);
}
if (write) writeFileSync(path, readme);
console.log(JSON.stringify({ checked: Object.keys(fixtures), matrixSha256: createHash('sha256').update(readFileSync(new URL('fixtures/independent/matrix.json', root))).digest('hex') }));
