import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCorpusFindings } from './lib/corpus-findings.mjs';
const row = changes => ({ host: 'door.test', url: 'https://door.test/one', probe_method: 'GET', battery: 'preflight-v2',
  observed_at: '2026-09-01T01:00:00Z', verdict: 'not_ready', failed: ['status-402'], ...changes });
const doc = (sequence, hosts) => ({ digest: String(sequence), snapshot: { sequence, taken_at: `2026-09-0${sequence}T03:00:00Z`,
  round: { at: `2026-09-0${sequence}T02:00:00Z`, hosts } } });
test('new snapshot cannot turn a carried-forward row into persistence or recovery', () => {
  const result = deriveCorpusFindings([doc(1, [row({})]), doc(2, [row({ verdict: 'ready', failed: [] })])]);
  assert.equal(result.pairs[0].eligible_fresh_pairs, 0);
  assert.equal(result.pairs[0].exclusions.same_observation_time, 1);
  assert.equal(result.comparable_events.length, 0);
});
test('only fresh, same-endpoint/method/battery readings establish a measured transition', () => {
  const result = deriveCorpusFindings([doc(1, [row({})]), doc(2, [row({ observed_at: '2026-09-02T01:00:00Z', verdict: 'ready', failed: [] })])]);
  assert.equal(result.pairs[0].not_ready_to_ready, 1);
  assert.equal(result.comparable_events[0].to.row_pointer, '/round/hosts/0');
  assert.deepEqual(result.comparable_events[0].no_longer_reported_failed_checks, ['status-402']);
});
test('missing methods, changed methods, battery changes, lost coverage and duplicates are excluded', () => {
  for (const [change, reason] of [
    [{probe_method: undefined}, 'method_not_recorded'], [{probe_method:'POST'}, 'method_changed'],
    [{battery:'preflight-v3'}, 'battery_changed'], [{battery:undefined}, 'battery_not_recorded'],
    [{verdict:'unreachable'}, 'not_probed_or_unreachable'], [{failed:undefined}, 'failed_checks_not_recorded'],
    [{observed_at:undefined}, 'missing_or_invalid_observation_time'], [{observed_at:'2026-08-01T01:00:00Z'}, 'time_moved_backwards'],
  ]) {
    const result = deriveCorpusFindings([doc(1,[row({})]),doc(2,[row({observed_at:'2026-09-02T01:00:00Z',...change})])]);
    assert.equal(result.pairs[0].eligible_fresh_pairs,0);
    assert.equal(result.pairs[0].exclusions[reason],1);
  }
  assert.equal(deriveCorpusFindings([doc(1,[row({})]),doc(2,[row({url:'https://door.test/two'})])]).pairs[0].shared_exact_host_url,0);
  assert.equal(deriveCorpusFindings([doc(1,[row({}),row({})]),doc(2,[row({})])]).pairs[0].exclusions.duplicate_identity,1);
});
test('catalog differences keep their comparable denominator; MPP is independent of x402 verdict', () => {
  const result=deriveCorpusFindings([doc(1,[row({catalog:{state:'differs',fields:['amount']},mpp:{spoken:true}}),
    row({host:'two.test',url:'https://two.test/',verdict:'ready',catalog:{state:'agrees'}}),
    row({host:'three.test',url:'https://three.test/',catalog:{state:'not_comparable'}})])]);
  assert.equal(result.latest.catalog_comparable,2);
  assert.equal(result.latest.catalog_differs,1);
  assert.equal(result.latest.mpp_spoken_and_x402_not_ready,1);
  assert.equal(result.catalog_difference_rows[0].digest,'1');
});
