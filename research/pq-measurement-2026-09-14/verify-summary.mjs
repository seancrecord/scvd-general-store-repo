// Check the retained public measurement; this does not re-run the benchmark.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summary = await json('research/pq-measurement-2026-09-14/summary.json');
const sourcePaths = [
  'research/qualification-2026-09-11/pq-runtime.json',
  'research/qualification-2026-09-11/pq-acvp.json',
  'research/qualification-2026-09-11/pq-interop.json',
  'experiments/pqc/runtime-qualification.mjs',
];
assert.deepEqual(summary.sources.map(source => source.path), sourcePaths);
for (const source of summary.sources) {
  assert.equal(hash(await read(source.path)), source.sha256, `source hash: ${source.path}`);
}
const runtime = await json(sourcePaths[0]);
const acvp = await json(sourcePaths[1]);
const interop = await json(sourcePaths[2]);
assert.equal(runtime.sources.find(source => source.path === 'runtime-qualification.mjs').sha256,
  summary.sources.at(-1).sha256);
assert.equal(summary.kind, 'derived_summary_not_new_benchmark');
assert.equal(summary.measurement_date, runtime.checked_at);
assert.deepEqual(summary.limitations, runtime.limitations);
const grouped = [
  ['ed25519', '--child-ed'], ['ed25519_plus_ml_dsa65', '--child-pq'],
];
assert.ok(runtime.runs.every(run => grouped.some(([, mode]) => run.mode === mode)));
const modes = {};
for (const [name, mode] of grouped) {
  const runs = runtime.runs.filter(run => run.mode === mode);
  assert.ok(runs.length > 0);
  for (const run of runs) {
    for (const metric of ['signing', 'verifying']) {
      const values = [...run[metric].raw_ms].sort((a, b) => a - b);
      assert.ok(values.length > 0 && values.every(value => Number.isFinite(value) && value >= 0));
      assert.equal(run[metric].samples, values.length);
      assert.equal(run[metric].median_ms, values[Math.floor(values.length / 2)]);
      assert.equal(run[metric].min_ms, values[0]);
      assert.equal(run[metric].max_ms, values.at(-1));
    }
  }
  modes[name] = {
    processes: runs.length,
    warm_iterations_per_process: runs.map(run => run.signing.samples),
    warm_signing_medians_ms: runs.map(run => run.signing.median_ms),
    warm_verification_medians_ms: runs.map(run => run.verifying.median_ms),
    first_signing_ms: runs.map(run => run.first_sign_ms),
    max_rss_kib: runs.map(run => run.max_rss_kib),
  };
}
assert.deepEqual(summary.modes, modes);
const [ed, pq] = runtime.runs.find(run => run.mode === '--child-pq').signature_bytes;
for (const run of runtime.runs) {
  assert.deepEqual(run.signature_bytes, run.mode === '--child-ed' ? [ed] : [ed, pq]);
}
assert.deepEqual(summary.raw_signature_bytes, {
  ed25519: ed, ml_dsa65: pq, dual_total: ed + pq, ml_dsa65_to_ed25519_ratio: pq / ed,
});
assert.deepEqual(summary.base64url_unpadded_signature_characters, {
  ed25519: Math.ceil(ed * 8 / 6), ml_dsa65: Math.ceil(pq * 8 / 6),
});
const checked = Object.values(acvp.totals).reduce((sum, row) => sum + row.checked, 0);
const excluded = Object.values(acvp.totals).reduce((sum, row) => sum + row.excluded, 0);
assert.equal(acvp.passed.length, checked);
assert.equal(acvp.excluded.reduce((sum, row) => sum + row.tests, 0), excluded);
let negativeChecks = 0;
for (const row of interop.cases) {
  assert.equal(row.openssl_signed_noble_verified, true);
  assert.equal(row.noble_signed_openssl_verified, true);
  for (const rejected of Object.values(row.rejected)) {
    assert.equal(rejected, true);
    negativeChecks++;
  }
}
// The human report must carry the figures derived above, not a second table.
const report = (await read('docs/PQ_MEASUREMENT_2026-09.md')).toString().replace(/\s+/g, ' ');
const range = values => `${Math.min(...values).toFixed(4)}–${Math.max(...values).toFixed(4)}`;
for (const figure of [
  `**${ed} bytes**`, `**${pq.toLocaleString('en-US')} bytes**`,
  `**${pq / ed} times**`, `${ed + pq}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  ...Object.values(modes).flatMap(mode => [
    range(mode.warm_signing_medians_ms), range(mode.warm_verification_medians_ms),
  ]),
  `${checked} selected ML-DSA-65 cases`, `${excluded} ML-DSA-65 cases`,
  `${negativeChecks} negative`,
]) assert.ok(report.includes(figure), `report is missing derived figure: ${figure}`);
console.log(JSON.stringify({
  status: 'retained hashes and derivations agree', sources: sourcePaths.length,
  processes: runtime.runs.length, raw_signature_bytes: summary.raw_signature_bytes,
  selected_acvp_cases: checked, excluded_ml_dsa65_cases: excluded,
  interop_contexts: interop.cases.length, interop_negative_checks: negativeChecks,
  scope: 'Record consistency only; not a new benchmark, signature verification or independent host attestation.',
}, null, 2));
