// Read-only release observation. Refuse to replace a prior acquisition.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';

const root = new URL('./', import.meta.url);
const repo = new URL('../../', root);
const replay = process.argv.includes('--verify');
const retained = replay ? JSON.parse(readFileSync(new URL('readback.json', root), 'utf8')) : null;
const read = path => readFileSync(new URL(path, repo), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, bytes) => writeFileSync(new URL(name, root), bytes, { flag: 'wx' });
const constant = (path, name) => {
  const match = read(path).match(new RegExp(`export const ${name} = ([\\d_]+);`));
  if (!match) throw new Error(`Cannot derive ${name}`);
  return Number(match[1].replaceAll('_', ''));
};
const records = [];
async function get(name, path, accept) {
  if (replay) {
    const row = retained.records.find(r => r.name === name);
    const bytes = gunzipSync(readFileSync(new URL(`${name}.response.gz`, root)));
    if (!row || row.path !== path || row.accept !== accept || row.status !== 200 ||
        row.bytes !== bytes.length || row.sha256 !== hash(bytes)) throw new Error(`Invalid retained response: ${name}`);
    records.push(row);
    return bytes.toString('utf8');
  }
  const sent_at = new Date().toISOString();
  const response = await fetch(`https://scvd.store${path}`, {
    headers: { accept }, redirect: 'manual', signal: AbortSignal.timeout(30000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  save(`${name}.response.gz`, gzipSync(bytes));
  records.push({ name, path, accept, sent_at, received_at: new Date().toISOString(),
    status: response.status, content_type: response.headers.get('content-type'),
    bytes: bytes.length, sha256: hash(bytes) });
  if (response.status !== 200) throw new Error(`${name}: HTTP ${response.status}`);
  return bytes.toString('utf8');
}
function pointer(document, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Nonlocal reference: ${ref}`);
  let value = document;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!value || !Object.hasOwn(value, key)) throw new Error(`Missing reference: ${ref}`);
    value = value[key];
  }
  return value;
}
function expand(value, document, active = new Set()) {
  if (Array.isArray(value)) return value.map(v => expand(v, document, active));
  if (!value || typeof value !== 'object') return value;
  if (typeof value.$ref === 'string') {
    if (active.has(value.$ref)) throw new Error(`Cycle: ${value.$ref}`);
    if (Object.keys(value).length !== 1) throw new Error(`Reference siblings: ${value.$ref}`);
    return expand(pointer(document, value.$ref), document, new Set(active).add(value.$ref));
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, document, active)]));
}
function contract(document) {
  // Components are storage. Every use site is expanded before comparing.
  return expand(Object.fromEntries(Object.entries(document).filter(([k]) => k !== 'components')), document);
}

const openapiText = await get('openapi', '/openapi.json', 'application/json');
const openapi = JSON.parse(openapiText);
const baselineBytes = gunzipSync(readFileSync(new URL('../roadmap-review-2026-09-23/openapi.json.gz', root)));
const baseline = JSON.parse(baselineBytes);
const schemas = JSON.parse(read('test/fixtures/openapi-shared-schemas.json'));
const schemaChecks = schemas.flatMap(({ pointers, schema }) => pointers.map(path => ({
  pointer: path, equal: isDeepStrictEqual(expand(pointer(openapi, `#${path}`), openapi), schema),
})));
const budget = constant('src/store/reader-limits.ts', 'SCANNER_BUDGET_BYTES');
const bytes = Buffer.byteLength(openapiText);
const guide = JSON.parse(await get('paywall-json', '/design', 'application/json'));
const markdown = await get('paywall-markdown', '/design', 'text/markdown');
const every = constant('src/services/cards.ts', 'STREAK_PACK_EVERY');
const milestone = constant('src/services/cards.ts', 'STREAK_BELLRINGER_II_DAY');
const streaks = guide.bell?.streaks;
const paywallChecks = {
  derived_pack_cadence: typeof streaks === 'string' && streaks.includes(`every ${every} consecutive UTC days`),
  derived_milestone: typeof streaks === 'string' && streaks.includes(`day ${milestone}`),
  wallet_and_reset: typeof streaks === 'string' && streaks.includes('wallet') && streaks.includes('gap resets'),
  same_day_limit: typeof streaks === 'string' && streaks.includes('same day earns no second reward'),
  markdown_matches: typeof streaks === 'string' && markdown.includes(streaks),
  stale_claim_absent: typeof streaks === 'string' && !streaks.includes('not this build'),
};
const result = {
  source_revision: replay ? retained.source_revision : process.argv[2] ?? null, records,
  openapi: { bytes, warning_budget_bytes: budget, headroom_bytes: budget - bytes,
    baseline_bytes: baselineBytes.length, baseline_sha256: hash(baselineBytes),
    bytes_removed: baselineBytes.length - bytes, paths: Object.keys(openapi.paths).length,
    below_warning_budget: bytes < budget,
    expanded_contract_equal: isDeepStrictEqual(contract(baseline), contract(openapi)),
    frozen_schema_checks: schemaChecks },
  paywall: { streaks, checks: paywallChecks },
  limits: ['Public readback after the recorded build checks, not cryptographic deployment attestation.',
    'No payment, bell ring, buyer cohort or counter write.',
    'Existing historical evidence gaps and earlier buyer results remain unchanged.'],
};
if (replay) {
  if (!isDeepStrictEqual(result, retained)) throw new Error('Retained summary does not reproduce');
} else save('readback.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.openapi.below_warning_budget || !result.openapi.expanded_contract_equal ||
    !schemaChecks.every(r => r.equal) || !Object.values(paywallChecks).every(Boolean)) process.exitCode = 1;
