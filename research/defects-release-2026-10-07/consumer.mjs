import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { VOCABULARY_VERSION, defectsBySignal, remediationFor } from 'scvd-defects';

const require = createRequire(import.meta.url);
const snapshot = require('scvd-defects/defects.json');
assert.equal(VOCABULARY_VERSION, '22');
assert.equal(snapshot.version, VOCABULARY_VERSION);
const results = [];
for (const [signal, advisory] of [
  ['discovery-info-validates', 'discovery-info-fails-schema'],
  ['offer-amount-matches-accepts', 'offer-contradicts-challenge'],
]) {
  const definitions = defectsBySignal(signal);
  assert.ok(definitions.length > 0);
  assert.deepEqual(definitions, defectsBySignal(advisory));
  for (const definition of definitions) {
    assert.equal(definition.verdict_signal, signal);
    const repair = remediationFor(definition.id);
    assert.ok(repair.operator && repair.buyer && repair.definition_url);
  }
  results.push({ signal, classes: definitions.map(d => d.id), remediation: 'present' });
}
console.log(JSON.stringify({ status: 'passed', vocabulary_version: VOCABULARY_VERSION, results }, null, 2));
