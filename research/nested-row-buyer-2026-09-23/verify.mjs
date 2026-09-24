// Check the public record, optionally checking all hash-bound private evidence.
// No network access, agent launches, rescoring or writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base = new URL('./', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, base), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const score = read('score.json');
const runs = read('runs.json');
const reviews = read('reviews.json');
const raw = read('private-retention.json').files;
const checks = read('controller-checks.json');
const index = new Map(raw.map(r => [r.file, r]));
const qualification = read('qualification-runs.json');
const execution = read('execution.json');
const freeze = read('freeze.json');
assert.equal(hash(fs.readFileSync(new URL('plan.json', base))), freeze.plan_sha256);
assert.equal(score.plan_sha256, freeze.plan_sha256);
assert.equal(runs.length, score.runs.length);
assert.equal(new Set(runs.map(r => r.cell.id)).size, runs.length);
const totals = {attempts:runs.length, pass:0, fail:0, incomplete:0};
let references = 0;
for (const run of runs) {
  const cell = run.cell.id;
  const scored = score.runs.find(r => r.cell.id === cell);
  assert.ok(scored, cell);
  totals[scored.usable]++;
  assert.equal(run.run_sha256, index.get(`cohort/${cell}/run.json`).sha256);
  assert.equal(run.trace_sha256, reviews[cell].transcript_sha256);
  const files = new Map(run.retained_artifacts.files.map(f => [f.file, f]));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.file === 'string' && typeof value.sha256 === 'string') {
      const known = files.get(value.file) ?? index.get(`cohort/${cell}/${value.file}`);
      assert.ok(known, `${cell}/${value.file}`);
      assert.equal(value.sha256, known.sha256, `${cell}/${value.file}`);
      references++;
    }
    for (const v of Object.values(value)) visit(v);
  };
  visit(reviews[cell]);
  for (const artifact of checks.find(c => c.cell === cell).verified) {
    visit(artifact.artifact);
    visit(artifact.issuer);
  }
  if (run.recipient) {
    assert.equal(run.recipient.run_sha256, reviews[cell].recipient.run.sha256);
    assert.equal(run.recipient.input_manifest_sha256,
      index.get(`cohort/${cell}/recipient/inputs/input-manifest.json`).sha256);
    assert.equal(run.recipient.trace_sha256,
      index.get(`cohort/${cell}/recipient/events.jsonl`).sha256);
  }
}
assert.deepEqual(totals, score.directed);
const sessions = [...qualification, ...runs, ...runs.flatMap(r => r.recipient ? [r.recipient] : [])];
const interruptions = sessions.filter(r => r.timing.interruption !== null).length;
assert.equal(interruptions, execution.timing_interruptions);
assert.equal(runs.filter(r => r.recipient).length, execution.recipient_attempts);
let privateFilesChecked = 0;
if (process.argv[2]) {
  const privateRoot = path.resolve(process.argv[2]);
  const validate = record => {
    const file = path.resolve(privateRoot, record.file);
    assert.ok(file.startsWith(`${privateRoot}${path.sep}`));
    const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), record.sha256, record.file);
    assert.equal(bytes.length, record.bytes, record.file);
    privateFilesChecked++;
  };
  for (const record of raw) validate(record);
  for (const run of runs) for (const file of run.retained_artifacts.files) {
    validate({...file, file:`cohort/${run.cell.id}/${file.file}`});
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(privateRoot, 'cohort/score.json'))), score);
}
console.log(JSON.stringify({directed:totals, references_checked:references,
  native_sessions:sessions.length, timing_interruptions:interruptions,
  private_files_checked:privateFilesChecked,
  scope:'Record consistency and optional byte identity. Human interpretations and private trace contents are not proven by public hashes.'}, null, 2));
