// Offline replay of retained release evidence; no fetches or writes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { summarize, summarizeBurst, renderSummary, renderBurst } from '../../scripts/lib/cold-read.mjs';

const root = new URL('./', import.meta.url);
const bytes = name => readFileSync(new URL(name, root));
const json = name => JSON.parse(bytes(name));
const hash = value => createHash('sha256').update(value).digest('hex');
const retained = json('retained-followthrough.json');
for (const row of retained.files) {
  const value = row.decoded_sha256 ? gunzipSync(bytes(row.file)) : bytes(row.file);
  assert.equal(value.length, row.decoded_bytes ?? row.bytes, row.file);
  assert.equal(hash(value), row.decoded_sha256 ?? row.sha256, row.file);
}
const replay = spawnSync(process.execPath, [fileURLToPath(new URL('readback.mjs', root)), '--verify'], { encoding: 'utf8' });
assert.equal(replay.status, 0, replay.stderr);
const reading = json('cold-reading-after/cold-reading.json');
assert.equal(reading.control, null, 'This release capture has no control lane');
const text = [];
for (const door of reading.doors) {
  const summary = summarize(door.knocks);
  assert.deepEqual(Object.fromEntries(Object.keys(summary).map(k => [k, door[k]])), summary);
  text.push(renderSummary(door.url, summary, door.deploy));
}
const burst = summarizeBurst(reading.burst.readings);
assert.deepEqual(Object.fromEntries(Object.keys(burst).map(k => [k, reading.burst[k]])), burst);
text.push(renderBurst(reading.burst.base, burst));
assert.equal(bytes('cold-reading-after/cold-reading.txt').toString('utf8'), `cold read, ${reading.read_at}\n${text.join('\n\n')}\n`);
const buildChecks = json('production-builds.json');
assert.ok(buildChecks.length > 0);
assert.ok(buildChecks.every(c => c.status === 'completed' && c.conclusion === 'success' && c.head_sha === json('readback.json').source_revision));
const doorRun = json('doors-after-execution.json');
const doorReport = json('doors-after.json');
assert.equal(doorRun.outer_timeout, false);
const criteria = doorReport.observation.doors.flatMap(d => d.criteria.map(c => ({ door: d.id, ...c })));
const tally = criteria.reduce((result, c) => ({ ...result, [c.verdict]: (result[c.verdict] ?? 0) + 1 }), {});
console.log(JSON.stringify({
  retained_files_verified: retained.files.length,
  release_response_replay: true,
  successful_production_builds: buildChecks.map(c => c.name),
  live_doors: { execution: doorRun, tally,
    non_met: criteria.filter(c => c.verdict !== 'met'), reviews_due: doorReport.reviews_due,
    files: ['doors-after.json', 'doors-after-execution.json'].map(name => ({ name, sha256: hash(bytes(name)) })),
  },
  cold_workflow: {
    read_at: reading.read_at, same_acquisition_text: true,
    summaries_recomputed: true,
    doors: reading.doors.map(d => ({ url: d.url, first_isolate: d.first_isolate,
      first_ms: d.first_ms, warm_median_ms: d.warm_median_ms, coverage: d.coverage, deploy: d.deploy })),
    burst: { doors: burst.doors, answered: burst.answered, challenged_402: burst.challenged_402 },
    files: ['cold-reading.json', 'cold-reading.txt'].map(name => ({ name,
      bytes: bytes(`cold-reading-after/${name}`).length, sha256: hash(bytes(`cold-reading-after/${name}`)) })),
  },
}, null, 2));
