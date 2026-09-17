import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('verifier/package.json', repo)));
const readme = readFileSync(new URL('verifier/README.md', repo), 'utf8');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('the README example works from the actual package in a clean offline project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scvd-verifier-activation-'));
  const pack = JSON.parse(run('npm', ['pack', './verifier', '--ignore-scripts', '--json', '--pack-destination', dir, '--cache', join(dir, 'cache')], repo))[0];
  assert.ok(pack.files.some((f) => f.path === 'examples/verify-receipt.mjs'));
  assert.ok(pack.files.every((f) => !/node_modules|vector-tools|test-support|\.test\./.test(f.path)));
  assert.match(readme, new RegExp(`npm install \\./${pack.filename.replaceAll('.', '\\.')}`));
  writeFileSync(join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
  run('npm', ['install', `./${pack.filename}`, '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--cache', join(dir, 'cache')], dir);
  const script = readme.match(/<!-- quickstart-code -->\s*```js\n([\s\S]*?)\n```/)?.[1];
  assert.ok(script, 'README must contain a runnable quickstart');
  assert.equal(script.trim(), readFileSync(join(dir, 'node_modules/x402-verify/examples/verify-receipt.mjs'), 'utf8').trim());
  writeFileSync(join(dir, 'verify.mjs'), script);
  const expected = JSON.parse(readme.match(/<!-- quickstart-output -->\s*```json\n([\s\S]*?)\n```/)?.[1] ?? 'null');
  const cases = { valid: ['valid', undefined], tampered: ['invalid', 'signature_invalid'], unsupported: ['unsupported', 'unsupported_algorithm'], 'unavailable-key': ['inconclusive', 'key_unavailable'] };
  for (const [scenario, [status, reason]] of Object.entries(cases)) {
    const result = JSON.parse(run(process.execPath, ['verify.mjs', scenario], dir));
    assert.equal(result.status, status, scenario);
    if (reason) assert.ok(result.reasonCodes.includes(reason), scenario);
    assert.equal(typeof result.scope, 'string');
    assert.ok(result.doesNotEstablish.some((s) => s.includes('authorization')));
    assert.ok(result.doesNotEstablish.some((s) => s.includes('settlement')));
    if (scenario === 'valid') assert.deepEqual(result, expected);
  }
  assert.throws(() => run(process.execPath, ['verify.mjs', 'unknown'], dir), /Unknown scenario/);
  const installed = JSON.parse(readFileSync(join(dir, 'node_modules/x402-verify/package.json')));
  assert.equal(installed.dependencies, undefined);
  assert.equal(installed.version, manifest.version);
  assert.ok(!existsSync(join(dir, 'node_modules/x402-sign')));
  // Compiler and ambient Node types live only in this disposable consumer.
  // No monorepo aliases, Worker globals, or workspace module imports are used.
  for (const name of ['typescript', '@types/node', 'undici-types']) {
    cpSync(new URL(`verifier/activation-tools/node_modules/${name}`, repo), join(dir, 'node_modules', name), { recursive: true });
  }
  cpSync(new URL('research/verifier-ps3-2026-09-16/consumer.mts', repo), join(dir, 'consumer.mts'));
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--outDir', 'built', 'consumer.mts'], dir);
  const typed = run(process.execPath, ['built/consumer.mjs'], dir).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(typed.map((row) => row.status), Object.values(cases).map(([status]) => status));
});
