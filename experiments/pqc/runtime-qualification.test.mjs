import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('qualification exercises entropy refusal and its deterministic positive control', () => {
  const result = spawnSync(process.execPath,[new URL('./runtime-qualification.mjs',import.meta.url).pathname,'--entropy'],{
    env:{PATH:process.env.PATH ?? ''},timeout:10000,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const reading=JSON.parse(result.stdout);
  assert.equal(reading.entropy_failure_throws,true);
  assert.equal(reading.entropy_calls,1);
  assert.equal(reading.deterministic_control_bypasses_entropy,true);
});

test('the entropy probe goes red if the candidate silently substitutes deterministic signing', () => {
  const directory=mkdtempSync(join(tmpdir(),'scvd-pq-negative-'));
  try {
    // Mutate a disposable copy, never node_modules or a user's working changes.
    // Use the installed candidate verbatim except for its RNG failure fallback.
    const sourceUrl=new URL('./node_modules/@noble/post-quantum/ml-dsa.js',import.meta.url);
    let source=readFileSync(sourceUrl,'utf8');
    const original='? randomBytes(signRandBytes)';
    assert.equal(source.split(original).length,2);
    source=source.replace(original,'? (() => { try { return randomBytes(signRandBytes); } catch { return new Uint8Array(32); } })()');
    source=source.replace(/from ['"]([^'"]+)['"]/g,(_,specifier)=>{
      const resolved=specifier.startsWith('.') ? new URL(specifier,sourceUrl).href : import.meta.resolve(specifier);
      return `from ${JSON.stringify(resolved)}`;
    });
    const mutant=join(directory,'mutant.mjs'); writeFileSync(mutant,source);
    let probe=readFileSync(new URL('./runtime-qualification.mjs',import.meta.url),'utf8');
    probe=probe.replaceAll("'@noble/post-quantum/ml-dsa.js'",JSON.stringify(new URL(`file://${mutant}`).href));
    const probePath=join(directory,'probe.mjs'); writeFileSync(probePath,probe);
    const result=spawnSync(process.execPath,[probePath,'--entropy'],{env:{PATH:process.env.PATH ?? ''},timeout:10000,encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/Missing expected exception/);
    assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|SyntaxError/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
