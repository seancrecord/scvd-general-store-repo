import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { prepareAttempt, collectArtifacts, runAttempt } from './reader-harness.mjs';

const repo = new URL('../../', import.meta.url);
const readme = fs.readFileSync(new URL('verifier/README.md', repo), 'utf8');
const baseline = JSON.parse(fs.readFileSync(new URL('../verifier-ps3-2026-09-16/consumer-results.json', import.meta.url)));
const expected = Object.fromEntries(baseline.runtimeChecks[0].cases.map((c) => [c.scenario, c.result]));
const run = (cmd, args, cwd, env) => execFileSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const dir = () => fs.mkdtempSync(path.join(tmpdir(), 'scvd-reader-harness-test-'));
const records = (cwd) => fs.readdirSync(path.join(cwd, '.verification-runs')).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(cwd, '.verification-runs', n))));

function fixture() {
  const frozen = dir(), cwd = dir();
  const pack = JSON.parse(run('npm', ['pack', './verifier', '--ignore-scripts', '--json', '--pack-destination', frozen, '--cache', path.join(frozen, 'cache')], repo))[0];
  fs.writeFileSync(path.join(frozen, 'frozen.json'), JSON.stringify({tarballFilename: pack.filename}));
  fs.writeFileSync(path.join(frozen, 'README.md'), readme);
  const env = prepareAttempt(cwd, frozen);
  return { cwd, env, filename: pack.filename };
}

test('nested offline install keeps its cache local; all four real API results have separate execution records', () => {
  const { cwd, env, filename } = fixture();
  const nested = path.join(cwd, 'consumer'); fs.mkdirSync(nested);
  assert.equal(run('npm', ['config', 'get', 'cache'], nested, env).trim(), path.join(fs.realpathSync(cwd), '.npm-cache'));
  run('npm', ['install', `../${filename}`], nested, env);
  const code = readme.match(/<!-- quickstart-code -->\s*```js\n([\s\S]*?)\n```/)?.[1];
  fs.writeFileSync(path.join(nested, 'verify.mjs'), code);
  for (const [scenario, result] of Object.entries(expected)) {
    const stdout = run(process.execPath, ['../capture-verification.mjs', 'verify.mjs', scenario], nested, env);
    const output = JSON.parse(stdout);
    for (const field of ['status', 'reasonCodes', 'scope', 'doesNotEstablish']) assert.deepEqual(output[field], result[field]);
    fs.writeFileSync(path.join(nested, 'observed.json'), stdout);
  }
  const evidence = records(cwd);
  assert.equal(evidence.length, Object.keys(expected).length);
  for (const row of evidence) {
    assert.equal(row.exitCode, 0); assert.equal(row.errorCode, null);
    assert.equal(row.script, 'consumer/verify.mjs');
    assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, row.stdoutFile))).status, expected[row.args[0]].status);
  }
  const outputDir = dir();
  const artifacts = collectArtifacts(cwd, outputDir).map((f) => f.path);
  assert.ok(artifacts.includes('consumer/observed.json'));
  assert.ok(artifacts.includes('consumer/verify.mjs'));
  assert.ok(artifacts.includes('consumer/package-lock.json'));
  assert.ok(artifacts.includes(evidence[0].stdoutFile));
  assert.ok(!artifacts.some((p) => /node_modules|npm-cache/.test(p)));
});

test('later shell failure cannot erase a successful record; consumer failure retains its own nonzero status', () => {
  const { cwd, env } = fixture();
  fs.writeFileSync(path.join(cwd, 'consumer.mjs'), 'console.log(JSON.stringify({status:"valid"}));\n');
  const chained = spawnSync('/bin/sh', ['-c', 'node capture-verification.mjs consumer.mjs; exit 17'], { cwd, env, encoding: 'utf8' });
  assert.equal(chained.status, 17);
  const first = records(cwd)[0];
  assert.equal(first.exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, first.stdoutFile))).status, 'valid');
  fs.writeFileSync(path.join(cwd, 'consumer.mjs'), 'console.log(JSON.stringify({status:"valid"})); process.exitCode=13;\n');
  const failed = spawnSync(process.execPath, ['capture-verification.mjs', 'consumer.mjs'], { cwd, env, encoding: 'utf8' });
  assert.equal(failed.status, 13);
  assert.deepEqual(records(cwd).map((r) => r.exitCode).sort((a,b) => a-b), [0,13]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd, '.verification-runs', first.id+'.json'))), first);
});

test('artifact collection preserves nested consumers without following out-of-workspace symlinks', () => {
  const cwd=dir(), outside=dir(), destination=dir();
  fs.writeFileSync(path.join(outside,'external.json'), '{}');
  fs.symlinkSync(outside,path.join(cwd,'outside'));
  fs.mkdirSync(path.join(cwd,'nested'));
  fs.writeFileSync(path.join(cwd,'nested','observed.json'), '{}');
  const artifacts=collectArtifacts(cwd,destination);
  assert.deepEqual(artifacts.map((f) => f.path), ['nested/observed.json']);
  assert.ok(!fs.existsSync(path.join(destination,'outside')));
});

test('an existing attempt is refused before launching any host', async () => {
  const output=dir(); fs.mkdirSync(path.join(output,'valid-1'));
  await assert.rejects(runAttempt({id:'valid-1',scenario:'valid',attempt:1,output,frozen:'/unused',model:'unused'}), {code:'EEXIST'});
});
