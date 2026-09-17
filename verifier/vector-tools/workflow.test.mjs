import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('independent regeneration gates both CI and the verifier publish path', () => {
  const root = new URL('../../', import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), 'utf8');
  for (const workflow of ['ci.yml', 'publish-npm.yml']) {
    assert.match(read(`.github/workflows/${workflow}`), /npm run verifier:vectors:check/);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['verifier:vectors:check'], /npm ci --prefix verifier\/vector-tools --ignore-scripts/);
  assert.match(pkg.scripts['verifier:vectors:check'], /npm run check --prefix verifier\/vector-tools/);
});
