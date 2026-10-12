import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexJourneyEvidence } from './journey-evidence-index.mjs';

test('keeps duplicate cell names in separate cohorts and does not guess resolved models or pool results', () => {
  const root = mkdtempSync(join(tmpdir(), 'journey-index-'));
  try {
    for (const [name, state] of [['first', 'fail'], ['second', 'pass']]) {
      const dir = join(root, 'research', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'score.json'), JSON.stringify({ schema_version: 2,
        directed: { attempts: 1, pass: state === 'pass' ? 1 : 0 },
        runs: [{ cell: { id: 'same-cell', host: 'codex', model: 'declared' }, usable: state,
          stages: { decide: { state, reason: 'fixture' } } }] }));
    }
    const result = indexJourneyEvidence(root);
    assert.equal(result.cohorts.length, 2);
    assert.deepEqual(result.cohorts.map(c => c.runs[0].usable), ['fail', 'pass']);
    assert.equal(result.cohorts[0].runs[0].resolved_model, null);
    assert.equal(result.cohorts[0].plan, null);
    assert.notEqual(result.cohorts[0].score_sha256, result.cohorts[1].score_sha256);
    assert.equal('conversion' in result, false);
    assert.deepEqual(result.cohorts[0].runs[0].observed_failure_stages, ['decide']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
