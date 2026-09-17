import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { scoreAttempt, parseFinal } from '../verifier-ps3-2026-09-16/score-readers.mjs';

const fields = ['status', 'reasonCodes', 'scope', 'doesNotEstablish'];
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const equalsOutput = (value, expected) => fields.every((key) => isDeepStrictEqual(value?.[key], expected[key]));

export function qualify({ run, observed, final, events, expected, traceReviewed, witnesses, loggerUnchanged, artifactsUnchanged }) {
  const base = scoreAttempt({ run: { ...run, readmeUnchanged: run.unchanged['README.md'],
    tarballUnchanged: Object.entries(run.unchanged).some(([key, value]) => key.endsWith('.tgz') && value === true) },
    observed, final, events, expected, traceReviewed });
  const failures = [...base.failures];
  if (!loggerUnchanged) failures.push('execution logger changed');
  if (!artifactsUnchanged) failures.push('archived consumer artifact differs from runner record');
  const witnessed = witnesses.some((w) => w.record.exitCode === 0 && w.record.signal === null && w.record.errorCode === null
    && w.record.scriptSha256 === hash(w.source) && equalsOutput(w.stdout, expected));
  if (!witnessed) failures.push('no retained successful consumer record matching source and API output');
  const loggerCalled = events.some((e) => e.type === 'item.completed' && e.item?.type === 'command_execution'
    && /\bnode\s+[^\s;&|]*capture-verification\.mjs\b/.test(e.item.command));
  if (!loggerCalled) failures.push('host trace does not invoke the execution logger');
  return { ...base, baselineRubricPassed: base.passed, passed: failures.length === 0, failures,
    timeToCompletedCorrectResponseMs: failures.length === 0 ? run.elapsedMs : null,
    finalScopeVerbatim: isDeepStrictEqual(final?.scope, expected.scope),
    finalExclusionsVerbatim: isDeepStrictEqual(final?.doesNotEstablish, expected.doesNotEstablish),
    executionRecords: witnesses.length, successfulMatchingRecord: witnessed };
}

function within(root, name) {
  const absolute = path.resolve(root, name);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error('Artifact path escapes retained directory');
  return absolute;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('./readers/', import.meta.url));
  const protocol = JSON.parse(fs.readFileSync(path.join(root, 'protocol.json')));
  const consumer = JSON.parse(fs.readFileSync(new URL('../verifier-ps3-2026-09-16/consumer-results.json', import.meta.url)));
  const expected = Object.fromEntries(consumer.runtimeChecks[0].cases.map((row) => [row.scenario, row.result]));
  const reviews = JSON.parse(fs.readFileSync(path.join(root, 'trace-review.json')));
  const results = [];
  const planned = protocol.scenarios.flatMap((s) => Array.from({ length: protocol.attemptsPerScenario }, (_, i) => `${s}-${i + 1}`));
  for (const id of planned) {
    const dir = path.join(root, id);
    if (!fs.existsSync(path.join(dir, 'run.json'))) continue;
    const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
    const run = JSON.parse(read('run.json'));
    const retained = path.join(dir, 'consumer-files');
    const events = read('events.jsonl').trim().split('\n').filter(Boolean).map(JSON.parse);
    let final, observed;
    try { final = parseFinal(read('final.txt')); } catch { /* Missing/malformed final fails. */ }
    // Resolve only a named in-workspace output; never follow a reader's arbitrary path.
    try {
      const relative = path.isAbsolute(final.outputFile) ? path.relative(run.cwd, final.outputFile) : final.outputFile;
      observed = JSON.parse(fs.readFileSync(within(retained, relative)));
    } catch { /* Missing or out-of-scope output fails, not replaced with expected data. */ }
    const witnesses = [];
    for (const artifact of run.artifacts.filter((a) => a.path.startsWith('.verification-runs/') && a.path.endsWith('.json'))) {
      try {
        const record = JSON.parse(fs.readFileSync(within(retained, artifact.path)));
        witnesses.push({ record, source: fs.readFileSync(within(retained, record.script)),
          stdout: JSON.parse(fs.readFileSync(within(retained, record.stdoutFile))) });
      } catch { /* Keep the raw record, but incomplete witnesses cannot qualify. */ }
    }
    const artifactsUnchanged = run.artifacts.every((a) => {
      try { return hash(fs.readFileSync(within(retained, a.path))) === a.sha256; } catch { return false; }
    });
    const review = reviews[id];
    results.push(qualify({ run, observed, final, events, expected: expected[run.scenario], witnesses, artifactsUnchanged,
      loggerUnchanged: run.unchanged['capture-verification.mjs'] === true && hash(fs.readFileSync(path.join(retained, 'capture-verification.mjs'))) === protocol.loggerSha256,
      traceReviewed: review?.approved === true && review?.installedPackageUnchanged === true }));
  }
  const count = (field) => results.filter((r) => r[field]).length;
  const summary = { date: '2026-09-17', host: 'Codex CLI', modelRequested: protocol.modelRequested,
    expectedAttempts: planned.length, completedAttempts: results.length, missing: planned.filter((id) => !results.some((r) => r.id === id)),
    passed: count('passed'), baselineRubricPassed: count('baselineRubricPassed'), correctApiOutputs: count('apiOutputCorrect'),
    finalKeyAuthorityExplicit: count('finalKeyAuthorityExplicit'), finalScopeVerbatim: count('finalScopeVerbatim'), finalExclusionsVerbatim: count('finalExclusionsVerbatim'),
    codexGatePassed: results.length === planned.length && results.every((r) => r.passed), fullTwoHostGatePassed: false,
    secondHost: 'Claude Code auth status still loggedIn:false; untested', results };
  fs.writeFileSync(path.join(root, 'scores.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
}
