import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('the publication workflow actually runs the verifier package tests', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish-npm.yml', import.meta.url), 'utf8');
  const step = workflow.split('- name: Run the package\'s own tests')[1]?.split('\n      - name:')[0];
  assert.ok(step, 'publication test step exists');
  // Execute its case arm with a stub node: this catches a missing or wrong
  // package branch without recursively launching this test from itself.
  const block = step.slice(step.indexOf('case "$PACKAGE"'));
  const end = block.indexOf('esac') + 4;
  const script = `node() { printf '%s\\n' "$*"; }; PACKAGE=x402-verify; ${block.slice(0, end)}`;
  const result = spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--test .*verifier\/evidence-bundle\.test\.mjs/);
  assert.match(result.stdout, /verifier\/evidence-cli\.test\.mjs/);
});
