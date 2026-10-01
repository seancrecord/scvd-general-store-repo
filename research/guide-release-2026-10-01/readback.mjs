import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const [phase, out, baselineFile = 'before.json'] = process.argv.slice(2);
assert(['before', 'after'].includes(phase) && out, 'Usage: node script before|after OUTPUT_DIRECTORY');
const source = await readFile('src/routes/llms.ts', 'utf8');
const areasBlock = source.split('export const LLMS_AREAS: readonly LlmsArea[] = [')[1]?.split('\n];')[0];
assert(areasBlock, 'Area catalogue could not be read');
const areas = [...areasBlock.matchAll(/path: "([^"]+)"/g)].map(match => `${match[1]}/llms.txt`);
assert(areas.length, 'No area routes found');
const limits = await readFile('src/store/reader-limits.ts', 'utf8');
const limit = name => {
  const value = limits.match(new RegExp(`export const ${name} = ([\\d_]+);`))?.[1];
  assert(value, `Missing limit ${name}`);
  return Number(value.replaceAll('_', ''));
};
const budget = limit('LLMS_INDEX_CHARACTER_BUDGET');
const alarm = limit('LLMS_INDEX_ALARM_CHARACTERS');
await mkdir(out, { recursive: true });
const paths = ['/llms.txt', '/llms-full.txt', ...areas, '/docs/llms.txt', '/api/llms.txt'];
const results = await Promise.all(paths.map(async path => {
  const response = await fetch(`https://scvd.store${path}`, {
    headers: { 'User-Agent': 'SCVD-guide-release-readback/1.0 (read-only; scvd.store)' },
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.text();
  const file = `${phase}-${path.slice(1).replaceAll('/', '-')}.gz`;
  await writeFile(`${out}/${file}`, gzipSync(body));
  return { path, status: response.status, read_at: new Date().toISOString(),
    characters: body.length, sha256: createHash('sha256').update(body).digest('hex'),
    headers: Object.fromEntries(response.headers), file, body };
}));
await writeFile(`${out}/${phase}.json`, JSON.stringify(results.map(({body, ...row}) => row), null, 2) + '\n');
for (const row of results) assert.equal(row.status, 200, row.path);
const body = path => results.find(row => row.path === path).body;
if (phase === 'after') {
  assert(body('/llms.txt').length < alarm, 'Index alarm');
  for (const path of areas.filter(path => path !== '/menu/llms.txt')) assert(body(path).length < budget, path);
  for (const alias of ['/docs/llms.txt', '/api/llms.txt']) {
    assert.equal(body(alias), body('/developers/llms.txt'), alias);
    assert(results.find(row => row.path === alias).headers.link.includes('<https://scvd.store/developers/llms.txt>; rel="canonical"'));
  }
  const heading = "## What we don't do, on purpose\n";
  assert(!body('/developers/llms.txt').includes(heading));
  assert(body('/developers/llms.txt').includes('https://scvd.store/trust/llms.txt'));
  assert(body('/trust/llms.txt').includes(heading));
  const guides = ['/llms.txt', ...areas].map(body);
  const sections = body('/llms-full.txt').split(/^## /m).slice(1);
  for (const section of sections) {
    const heading = `## ${section.split('\n')[0]}\n`;
    const homes = guides.filter(text => text.includes(heading));
    assert.equal(homes.length, 1, heading);
    assert(homes[0].includes(`## ${section}`.trimEnd()), heading);
  }
  const before = JSON.parse(await readFile(`${out}/${baselineFile}`, 'utf8'));
  assert.equal(results.find(row => row.path === '/llms-full.txt').sha256,
    before.find(row => row.path === '/llms-full.txt').sha256, 'Full guide bytes changed since baseline');
  await writeFile(`${out}/verification.json`, JSON.stringify({
    checked_at: new Date().toISOString(), result: 'passed', routes: results.length, baseline_file: baselineFile,
    sections_preserved: sections.length, index_alarm: alarm, area_budget: budget,
    checks: ['index and non-menu area budgets', 'developer alias byte parity', 'alias canonical links',
      'limits in linked trust guide', 'each complete section in exactly one guide', 'full guide byte-identical to baseline'],
  }, null, 2) + '\n');
}
console.log(JSON.stringify(results.map(({path, status, characters, sha256}) => ({path, status, characters, sha256})), null, 2));
