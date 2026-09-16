import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/release-provenance.yml', 'utf8');
const shell = workflow.slice(workflow.indexOf('      - name: Sign archive'))
  .split('\n  provenance:')[0]
  .matchAll(/        run: \|\n((?:          .*\n|\n)+)/g);
const commands = [...shell].map(match => match[1].replace(/^          /gm, ''));

// Run the workflow's actual shell with a Cosign v3-shaped boundary. The
// remote release run proves OIDC; this catches flags and missing uploads offline.
function runSigning(failVerification = false) {
  const dir = mkdtempSync(join(tmpdir(), 'release-provenance-'));
  const tag = 'test-release';
  const archive = `scvd-store-${tag}.tar.gz`;
  writeFileSync(join(dir, archive), 'source archive fixture');
  writeFileSync(join(dir, 'cosign'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--bundle') || args.some(a => a.startsWith('--output-'))) process.exit(2);
if (args[0] === 'sign-blob') {
  if (!fs.existsSync('${archive}')) process.exit(3);
  fs.writeFileSync(value('--bundle'), 'bundle fixture');
} else if (args[0] === 'verify-blob') {
  if (process.env.FAIL_VERIFICATION === 'true') process.exit(4);
  if (!fs.existsSync(value('--bundle')) ||
      value('--certificate-identity') !== process.env.SIGSTORE_IDENTITY ||
      value('--certificate-oidc-issuer') !== 'https://token.actions.githubusercontent.com') process.exit(5);
  fs.writeFileSync('verified', 'yes');
} else process.exit(6);
`, { mode: 0o755 });
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (!fs.existsSync('verified')) process.exit(7);
for (const asset of args.slice(3).filter(a => !a.startsWith('--'))) {
  if (!fs.existsSync(asset)) process.exit(8);
}
fs.writeFileSync('uploaded.json', JSON.stringify(args));
`, { mode: 0o755 });
  const result = spawnSync('bash', ['-e', '-c', commands.join('\n')], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
      TAG: tag, SIGSTORE_IDENTITY: 'https://github.com/example/repo/.github/workflows/release-provenance.yml@refs/tags/test-release',
      FAIL_VERIFICATION: String(failVerification) },
  });
  let uploaded;
  try { uploaded = JSON.parse(readFileSync(join(dir, 'uploaded.json'), 'utf8')); } catch {}
  rmSync(dir, { recursive: true, force: true });
  return { ...result, uploaded };
}

test('release shell signs, verifies and uploads the archive with its Cosign v3 bundle', () => {
  assert.equal(commands.length, 2);
  const result = runSigning();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.uploaded, ['release', 'upload', 'test-release',
    'scvd-store-test-release.tar.gz', 'scvd-store-test-release.tar.gz.sigstore.json', '--clobber']);
});

test('a failed signature verification stops before release upload', () => {
  const result = runSigning(true);
  assert.equal(result.status, 4, result.stderr);
  assert.equal(result.uploaded, undefined);
});
