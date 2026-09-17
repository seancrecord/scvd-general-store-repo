import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

function containsApiResult(text = '', expected) {
  // Shell output may contain the full API object, labels, or repeated JSON.
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) { if (ch === '{') { start = i; depth = 1; } continue; }
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; continue; }
    if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        const value = JSON.parse(text.slice(start, i + 1));
        for (const field of ['status', 'reasonCodes', 'scope', 'doesNotEstablish']) assert.deepEqual(value[field], expected[field]);
        return true;
      } catch { /* Continue to the next complete object. */ }
      start = -1;
    }
  }
  return false;
}

export function scoreAttempt({ run, observed, final, events, expected, traceReviewed }) {
  const failures = [];
  if (run.exitCode !== 0 || run.timedOut) failures.push('host did not complete normally');
  if (!run.readmeUnchanged || !run.tarballUnchanged) failures.push('frozen input changed');
  for (const field of ['status', 'reasonCodes', 'scope', 'doesNotEstablish']) {
    try { assert.deepEqual(observed?.[field], expected[field]); }
    catch { failures.push(`observed ${field} differs from the independently executed package result`); }
  }
  const apiOutputCorrect = !failures.some((text) => text.startsWith('observed '));
  if (final?.status !== expected.status) failures.push('final status is incorrect');
  if (!expected.reasonCodes.every((code) => final?.reasonCodes?.includes(code))) failures.push('final reasons omit a required finding');
  if (final?.canAuthorizePayment !== false) failures.push('final answer does not reject payment authorization');
  if (!Array.isArray(final?.doesNotEstablish) || !final.doesNotEstablish.some((s) => /authoriz/i.test(s))) failures.push('final answer loses the authority exclusion');
  const executions = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'command_execution');
  // A later, unrelated command in the same shell can set a nonzero exit.
  // Count that error, but retain the completed API output as execution evidence
  // when it matches exactly and the consumer source/trace has been reviewed.
  const ranNode = executions.some((e) => /\bnode\s+[^\s;&|]+\.mjs\b/.test(e.item.command)
    && (e.item.exit_code === 0 || containsApiResult(e.item.aggregated_output, expected)));
  if (!ranNode) failures.push('no successful consumer execution in the trace');
  if (!traceReviewed) failures.push('trace review has not qualified permitted inputs and actual API use');
  if (!events.some((e) => e.type === 'turn.completed')) failures.push('no completed host turn');
  const executionQualified = failures.length === 0;
  const finalKeyAuthorityExplicit = final?.doesNotEstablish?.some((s) => /authoriz/i.test(s) && /key|sign|resource/i.test(s)) ?? false;
  if (!finalKeyAuthorityExplicit) failures.push('final summary omits signing-key/resource authorization exclusion');
  return { id: run.id, scenario: run.scenario, attempt: run.attempt, passed: failures.length === 0, apiOutputCorrect,
    executionQualified, failures, elapsedMs: run.elapsedMs,
    timeToCompletedCorrectResponseMs: failures.length === 0 ? run.elapsedMs : null,
    timingScope: 'Host startup through completed response; includes model/tool latency, not API verification latency.',
    finalKeyAuthorityExplicit,
    commands: executions.length, commandFailures: executions.filter((e) => e.item.exit_code !== 0).length };
}

export function parseFinal(text) {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('./readers/', import.meta.url);
  const consumer = JSON.parse(fs.readFileSync(new URL('./consumer-results.json', import.meta.url)));
  const expected = Object.fromEntries(consumer.runtimeChecks[0].cases.map((row) => [row.scenario, row.result]));
  const review = JSON.parse(fs.readFileSync(new URL('trace-review.json', root)));
  const results = [];
  for (const id of fs.readdirSync(root).filter((name) => /^(valid|tampered|unsupported|unavailable-key)-[12]$/.test(name)).sort()) {
    const read = (name) => fs.readFileSync(new URL(`${id}/${name}`, root), 'utf8');
    let observed, final;
    try { observed = JSON.parse(read('observed.json')); } catch { /* retained as a failed observation */ }
    try { final = parseFinal(read('final.txt')); } catch { /* no invented final result */ }
    const events = read('events.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
    const run = JSON.parse(read('run.json'));
    results.push(scoreAttempt({ run, observed, final, events, expected: expected[run.scenario],
      traceReviewed: review[id]?.approved === true && review[id]?.installedPackageUnchanged === true }));
  }
  const planned = Object.keys(expected).flatMap((s) => [`${s}-1`, `${s}-2`]);
  const missing = planned.filter((id) => !results.some((r) => r.id === id));
  const summary = { host: 'Codex CLI', modelRequested: 'gpt-5.6-luna', expectedAttempts: planned.length,
    completedAttempts: results.length, passed: results.filter((r) => r.passed).length, missing,
    executionQualified: results.filter((r) => r.executionQualified).length,
    correctApiOutputs: results.filter((r) => r.apiOutputCorrect).length,
    finalKeyAuthorityExplicit: results.filter((r) => r.finalKeyAuthorityExplicit).length,
    codexGatePassed: missing.length === 0 && results.every((r) => r.passed),
    fullTwoHostGatePassed: false, secondHost: 'Claude Code not signed in; untested',
    results };
  fs.writeFileSync(new URL('scores.json', root), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}
