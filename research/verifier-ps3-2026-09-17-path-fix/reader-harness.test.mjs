import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { promptFor, prepareAttempt } from './reader-harness.mjs';

const repo = new URL('../../', import.meta.url);
const run = (command, args, cwd, env) => execFileSync(command, args, { cwd, env, encoding:'utf8', stdio:['ignore','pipe','pipe'] });

test('the supplied install command works unchanged at either directory depth, even with shell punctuation in the path', () => {
  const base = fs.mkdtempSync(path.join(tmpdir(), 'scvd-absolute-path-test-'));
  const frozen = path.join(base, 'frozen'); fs.mkdirSync(frozen);
  const pack = JSON.parse(run('npm',['pack','./verifier','--ignore-scripts','--json','--pack-destination',frozen,'--cache',path.join(base,'cache')],repo))[0];
  fs.writeFileSync(path.join(frozen,'frozen.json'),JSON.stringify({tarballFilename:pack.filename}));
  fs.copyFileSync(new URL('verifier/README.md',repo),path.join(frozen,'README.md'));
  for (const nested of [false,true]) {
    const root=path.join(base,`trial ${nested} ' $(touch escaped) ;`); fs.mkdirSync(root);
    const env=prepareAttempt(root,frozen);
    const consumer=nested ? path.join(root,'consumer') : root;
    if (nested) fs.mkdirSync(consumer);
    const prompt=promptFor(root,'unsupported',pack.filename);
    const command=prompt.match(/<!-- install-command -->\n([^\n]+)/)?.[1];
    assert.ok(command,'fresh readers need an explicit absolute install command');
    run('/bin/sh',['-c',command],consumer,env);
    const installed=JSON.parse(fs.readFileSync(path.join(consumer,'node_modules/x402-verify/package.json')));
    assert.equal(installed.version,pack.version);
    assert.ok(!fs.existsSync(path.join(consumer,'escaped')),'path punctuation must not execute');
  }
});

test('prompt refuses a relative workspace or tarball path escaping its root', () => {
  assert.throws(()=>promptFor('relative','valid','package.tgz'),/absolute/);
  assert.throws(()=>promptFor('/tmp/trial','valid','../package.tgz'),/filename/);
});
