// Offline, scoped reproduction from the preserved npm artifact. No install,
// network, CLI execution, registration, or payment. The actual resolver slice
// runs unchanged beside the package's bundled schemas in a timed VM context.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const captured = (name) => readFileSync(`${dir}captures/${name}`);
const registry = JSON.parse(captured('merit-discovery-package-network.body'));
const archive = captured('discovery-tarball.body');
const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
assert.equal(integrity, registry.dist.integrity, 'npm archive integrity mismatch');
const extracted = spawnSync('python3', ['-c', [
  'import tarfile,json,sys',
  'with tarfile.open(sys.argv[1]) as t:',
  ' print(json.dumps({p:t.extractfile("package/"+p).read().decode() for p in ["dist/schemas.js","dist/index.js","package.json"]}))',
].join('\n'), `${dir}captures/discovery-tarball.body`], {
  encoding: 'utf8', maxBuffer: 3 * 1024 * 1024,
});
assert.equal(extracted.status, 0, extracted.stderr);
const files = JSON.parse(extracted.stdout);
assert.equal(JSON.parse(files['package.json']).version, registry.version);
const schemas = files['dist/schemas.js'];
assert.equal((schemas.match(/\nexport \{/g) || []).length, 1);
assert.ok(!/^import /m.test(schemas), 'Unexpected schema import; inspect before execution');
const schemaProgram = schemas.slice(0, schemas.lastIndexOf('\nexport {'));
const index = files['dist/index.js'];
const start = index.indexOf('var ISO_4217_RE =');
const end = index.indexOf('// src/schemas.ts', start);
assert.ok(start > 0 && end > start, 'Pinned resolver markers absent');
const resolver = index.slice(start, end);
assert.ok(resolver.includes('function resolvePaymentInfo(raw)'));

const cases = [
  { id: 'documented-hybrid', expected: false, value: {
    protocols: ['x402'], price: { mode: 'fixed', currency: 'USD', amount: '0.05' },
  } },
  { id: 'structured-protocol-control', expected: true, value: {
    protocols: [{ x402: {} }], price: { mode: 'fixed', currency: 'USD', amount: '0.05' },
  } },
  { id: 'legacy-flat-control', expected: true, value: {
    protocols: ['x402'], pricingMode: 'fixed', price: '0.05', currency: 'USD',
  } },
  { id: 'missing-amount-negative-control', expected: false, value: {
    protocols: [{ x402: {} }], price: { mode: 'fixed', currency: 'USD' },
  } },
];
const program = `${schemaProgram}\n${resolver}\n` +
  `JSON.stringify(${JSON.stringify(cases)}.map(c => {\n` +
  ` const resolved = resolvePaymentInfo(c.value);\n` +
  ` return {id:c.id, input:c.value, schema_accepts:OpenApiPaymentInfoSchema.safeParse(c.value).success, resolved:resolved ?? null};\n` +
  `}))`;
const context = vm.createContext(Object.create(null));
const results = JSON.parse(new vm.Script(program).runInContext(context, { timeout: 3000 }));
for (const [i, result] of results.entries()) {
  assert.equal(result.resolved !== null, cases[i].expected, result.id);
  assert.equal(result.schema_accepts, cases[i].expected, result.id);
}
assert.equal(results[1].resolved.price.amount, '0.05');
assert.deepEqual(results[1].resolved.protocols, [{ x402: {} }]);
console.log(JSON.stringify({
  observed_at: new Date().toISOString(), package: registry.name, version: registry.version,
  node: process.version, archive_integrity_matches_registry: true,
  archive_sha256: createHash('sha256').update(archive).digest('hex'),
  resolver_slice_sha256: createHash('sha256').update(resolver).digest('hex'),
  schema_module_sha256: createHash('sha256').update(schemas).digest('hex'),
  scope: 'Unmodified resolver slice and bundled schema evaluation only; not CLI, live registration, settlement, or a signed SCVD artifact.',
  controls_passed: results.length, results,
}, null, 2));
