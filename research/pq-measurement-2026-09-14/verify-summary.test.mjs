import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = 'research/pq-measurement-2026-09-14/verify-summary.mjs';
const summary = 'research/pq-measurement-2026-09-14/summary.json';
const files = [script, summary, 'docs/PQ_MEASUREMENT_2026-09.md',
  ...JSON.parse(readFileSync(join(root, summary))).sources.map(source => source.path)];
function check(directory) {
  return spawnSync(process.execPath, [join(directory, script)], {
    encoding: 'utf8', env: {}, timeout: 10000,
  });
}
test('the published summary agrees with retained source hashes and samples', () => {
  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'retained hashes and derivations agree');
});
for (const [name, path, change, failure] of [
  ['summary', summary, text => text.replace('3309', '3310'), /deep-equal/],
  ['raw record', 'research/qualification-2026-09-11/pq-runtime.json', text => text + ' ', /source hash/],
  ['measuring script', 'experiments/pqc/runtime-qualification.mjs', text => text + '\n// changed\n', /source hash/],
  ['published figure', 'docs/PQ_MEASUREMENT_2026-09.md', text => text.replace('**64 bytes**', '**65 bytes**'), /missing derived figure/],
]) {
  test(`altering the ${name} fails the same checker`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'scvd-pq-record-'));
    try {
      for (const file of files) {
        mkdirSync(dirname(join(directory, file)), { recursive: true });
        copyFileSync(join(root, file), join(directory, file));
      }
      const target = join(directory, path), original = readFileSync(target, 'utf8');
      const changed = change(original);
      assert.notEqual(changed, original, 'the negative control must actually alter its input');
      writeFileSync(target, changed);
      const result = check(directory);
      assert.equal(result.status, 1);
      assert.match(result.stderr, failure);
      assert.doesNotMatch(result.stderr, /ENOENT|ERR_MODULE_NOT_FOUND|SyntaxError/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
