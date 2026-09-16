import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import CiSequencer, { partition } from './ci-sequencer.mjs';

const root = process.cwd();
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const shards = JSON.parse(workflow.match(/shard: (\[[^\n]+\])/)[1]);
const files = readdirSync('test', { recursive: true }).filter(f => f.endsWith('.spec.ts'))
  .map(f => ({ moduleId: path.resolve('test', f) }));

test('every discovered file appears once across the workflow matrix, including new files', async () => {
  assert.deepEqual(shards, Array.from({ length: shards.length }, (_, i) => i + 1));
  assert.ok(shards.length > 1);
  const inventory = [...files, { moduleId: path.resolve('test/future-protocol.spec.ts') }];
  const groups = await Promise.all(shards.map(index => new CiSequencer({ config: {
    root, shard: { index, count: shards.length },
  } }).shard(inventory)));
  const selected = groups.flat().map(f => f.moduleId);
  assert.equal(new Set(selected).size, inventory.length);
  assert.deepEqual(selected.sort(), inventory.map(f => f.moduleId).sort());
  assert.deepEqual(partition(inventory, shards.length, root), partition([...inventory].reverse(), shards.length, root));
  assert.match(workflow, /--shard=\$\{\{ matrix.shard \}\}\/\$\{\{ strategy.job-total \}\}/);
  assert.match(workflow, /--config=vitest.ci.config.mjs/);
});

test('bad partition configuration refuses to run rather than silently losing files', async () => {
  assert.throws(() => partition(files, 0, root));
  await assert.rejects(new CiSequencer({ config: { root, shard: { index: 0, count: 4 } } }).shard(files));
  await assert.rejects(new CiSequencer({ config: { root, shard: { index: 5, count: 4 } } }).shard(files));
});

const gate = workflow.match(/  check:\n([\s\S]*?)(?=\n  # THE RED LIGHT)/)?.[1];
test('required check runs even when a dependency is skipped or cancelled', () => {
  assert.ok(gate);
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(gate, /needs: \[quality, tests\]/);
  assert.match(gate, /QUALITY_RESULT: \$\{\{ needs.quality.result \}\}/);
  assert.match(gate, /TEST_RESULT: \$\{\{ needs.tests.result \}\}/);
  assert.match(workflow, /fail-fast: false/);
});

test('the actual required-check shell fails for every non-success result', () => {
  const shell = gate.match(/        run: \|\n([\s\S]*)/)[1].replace(/^          /gm, '');
  for (const quality of ['success', 'failure', 'cancelled', 'skipped', '']) {
    for (const tests of ['success', 'failure', 'cancelled', 'skipped', '']) {
      const run = spawnSync('bash', ['-e', '-c', shell], { env: { ...process.env, QUALITY_RESULT: quality, TEST_RESULT: tests } });
      assert.equal(run.status === 0, quality === 'success' && tests === 'success', `${quality}/${tests}`);
    }
  }
});
