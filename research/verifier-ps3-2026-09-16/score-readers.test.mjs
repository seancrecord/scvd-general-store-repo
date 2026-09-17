import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAttempt } from './score-readers.mjs';

const sample = () => {
  const expected = { status: 'unsupported', reasonCodes: ['unsupported_algorithm', 'signature_not_checked'], scope: 'A bounded result', doesNotEstablish: ['authorization of the signing key'] };
  return { expected, observed: structuredClone(expected), final: { ...structuredClone(expected), canAuthorizePayment: false },
    run: { id: 'unsupported-1', scenario: 'unsupported', attempt: 1, exitCode: 0, timedOut: false, readmeUnchanged: true, tarballUnchanged: true, elapsedMs: 123 },
    events: [{ type: 'item.completed', item: { type: 'command_execution', command: 'node verify.mjs unsupported > observed.json', exit_code: 0 } }, { type: 'turn.completed' }], traceReviewed: true };
};
test('a completed correct response counts only with execution and trace review', () => {
  assert.equal(scoreAttempt(sample()).passed, true);
  for (const change of [
    (s) => { s.observed.status = 'valid'; },
    (s) => { s.final.canAuthorizePayment = true; },
    (s) => { s.final.reasonCodes = []; },
    (s) => { s.final.doesNotEstablish = ['authorization to spend']; },
    (s) => { s.events = []; },
    (s) => { s.run.tarballUnchanged = false; },
    (s) => { s.run.timedOut = true; },
    (s) => { s.traceReviewed = false; },
    (s) => { delete s.observed; },
  ]) {
    const s = sample(); change(s);
    const result = scoreAttempt(s);
    assert.equal(result.passed, false);
    assert.equal(result.timeToCompletedCorrectResponseMs, null);
  }
});

test('an unrelated trailing shell failure retains both API evidence and the tool error', () => {
  const s = sample();
  s.events[0].item.command = 'node verify.mjs; git status --short';
  s.events[0].item.exit_code = 128;
  s.events[0].item.aggregated_output = `${JSON.stringify(s.expected, null, 2)}\nfatal: not a git repository`;
  assert.equal(scoreAttempt(s).passed, true);
  assert.equal(scoreAttempt(s).commandFailures, 1);
  s.events[0].item.aggregated_output = `${JSON.stringify({ kind: 'receipt', ...s.expected, checks: [] }, null, 2)}\nfatal: not a git repository`;
  assert.equal(scoreAttempt(s).passed, true);
  s.events[0].item.aggregated_output = 'node failed';
  assert.equal(scoreAttempt(s).passed, false);
});
