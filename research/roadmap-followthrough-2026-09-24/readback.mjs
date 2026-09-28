// Read-only HTTP observation; retain hashes and checks, never raw network traces.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('./', import.meta.url);
const repo = new URL('../../', root);
const read = path => readFileSync(new URL(path, repo), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const scope = JSON.parse(read('src/routes/corpus.ts').match(/const HOST_HISTORY_SCOPE = \{[\s\S]*?description: ("[^\n]+"),/)[1]);
const skill = read('skills/scvd-x402-verification/SKILL.md');
const host = '/corpus/host/weather.parklandarchives.com';
const targets = [
  ['skill', '/.well-known/agent-skills/scvd-x402-verification/SKILL.md', 'text/markdown'],
  ['normal', `${host}.json`, 'application/json'],
  ['stable', `${host}.json?view=stable`, 'application/json'],
  ['html', host, 'text/html'],
  ['markdown', host, 'text/markdown'],
  ['markdown_path', `${host}.md`, 'text/markdown'],
];
const records = [];
for (const [name, path, accept] of targets) {
  const sent_at = new Date().toISOString();
  try {
    const response = await fetch(`https://scvd.store${path}`, { headers: { accept }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const body = bytes.toString('utf8');
    const checks = name === 'skill' ? { source_bytes_equal: body === skill } : { source_scope_present: body.includes(scope) };
    if (name === 'normal' || name === 'stable') {
      try { checks.source_scope_equal = JSON.parse(body).evidence_scope?.description === scope; } catch { checks.source_scope_equal = false; }
    }
    records.push({ name, path, accept, sent_at, received_at: new Date().toISOString(), status: response.status, content_type: response.headers.get('content-type'), bytes: bytes.length, sha256: hash(bytes), checks, passed: response.status === 200 && Object.values(checks).every(Boolean) });
  } catch (error) {
    records.push({ name, path, accept, sent_at, received_at: new Date().toISOString(), passed: false, error: error.name });
  }
}
const result = { source_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), skill_sha256: hash(skill), scope_sha256: hash(scope), scope, records, all_passed: records.every(row => row.passed), limits: ['Public response observation, not a cryptographic deployment attestation.', 'No signed-original verification, buyer qualification, payment or write to the store.', 'Only hashes and expected public prose retained; no raw network traces or headers.'] };
writeFileSync(new URL('readback.json', root), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
if (!result.all_passed) process.exitCode = 1;
