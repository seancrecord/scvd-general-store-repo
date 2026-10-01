import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const directory = process.argv[2];
if (!directory) throw new Error('Supply an evidence directory');
await mkdir(directory, { recursive: true });
const prior = JSON.parse(await readFile(new URL('./before-months.json', import.meta.url), 'utf8'));
const reads = [];
const checks = [];
const read = async (path, accept = 'application/json') => {
  const response = await fetch(`https://scvd.store${path}`, {
    headers: { Accept: accept, 'User-Agent': 'Mozilla/5.0 SCVD-Release-Readback', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  const file = `${String(reads.length + 1).padStart(2, '0')}-${path.split('?')[0].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.${accept === 'application/json' ? 'json' : accept === 'text/html' ? 'html' : 'md'}`;
  await writeFile(`${directory}/${file}.gz`, gzipSync(body));
  reads.push({ path, accept, status: response.status, read_at: new Date().toISOString(), sha256: createHash('sha256').update(body).digest('hex'), file: `${file}.gz`, encoding: 'gzip', content_type: response.headers.get('content-type'), age: response.headers.get('age'), cf_cache_status: response.headers.get('cf-cache-status') });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return accept === 'application/json' ? JSON.parse(body) : body;
};
const check = async (name, fn) => {
  try { await fn(); checks.push({ name, state: 'passed' }); }
  catch (error) { checks.push({ name, state: 'failed', error: String(error.message) }); }
};

await check('monthly rail scope is explicit in JSON and HTML', async () => {
  const json = await read('/rails');
  assert.match(json.method, /monthly series covers x402 only/);
  assert.match(json.method, /native MPP/);
  const html = await read('/rails', 'text/html');
  assert.match(html, /monthly series covers x402 only/);
  assert.match(html, /Other recorded network/);
});
await check('stats describes native corrections and all supported recorded networks', async () => {
  const stats = await read('/stats');
  assert.match(stats.till_by_item_note, /native MPP rows include their per-item house corrections/);
  for (const term of ['arbitrum', 'world', 'native MPP']) assert.ok(stats.rail_split_method.includes(term), term);
});
await check('pulse combined count preserves the x402 denominator', async () => {
  const pulse = await read('/pulse.json');
  assert.equal(typeof pulse.all_time.mpp_organic_settled, 'number');
  assert.equal(pulse.all_time.total_organic_settled, pulse.all_time.organic_settled + pulse.all_time.mpp_organic_settled);
  const html = await read('/pulse', 'text/html');
  assert.match(html, /funnel below covers x402 only/);
});
await check('old monthly records retain signed bytes, digest and independently valid signatures', async () => {
  const current = await read('/store-month.json');
  assert.equal(current.scan_truncated, false);
  for (const before of prior.body.entries) {
    const after = current.entries.find(entry => entry.document.month === before.document.month);
    assert.ok(after, before.document.month);
    for (const key of ['document', 'digest', 'signature', 'public_key', 'signed_payload']) assert.deepEqual(after[key], before[key], `${before.document.month}: ${key}`);
    assert.match(after.reporting_scope, /Combined monthly sales were not retained/);
    assert.equal(createHash('sha256').update(after.signed_payload).digest('hex'), after.digest);
    const key = createPublicKey({ format: 'der', type: 'spki', key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(after.public_key, 'hex')]) });
    assert.equal(verify(null, Buffer.from(after.signed_payload), key, Buffer.from(after.signature, 'hex')), true);
    const dated = await read(`/store-month/${before.document.month}.json`);
    assert.equal(dated.signed_payload, after.signed_payload);
  }
  const html = await read('/store-month', 'text/html');
  assert.match(html, /Combined monthly sales were not retained/);
});
await check('developer representations and discovery aliases agree with enabled native checkout', async () => {
  const card = await read('/.well-known/mcp');
  const native = Boolean(card.native_mpp);
  assert.equal(native, true, 'Previously enabled native checkout must remain enabled');
  for (const path of ['/.well-known/mcp.json', '/.well-known/mcp/server-card.json']) {
    const alias = await read(path);
    assert.deepEqual(alias.native_mpp, card.native_mpp);
    assert.match(alias.description, /MPP \(evm\/charge\)/);
  }
  const dev = await read('/developers');
  assert.match(dev.authentication, /MPP \(evm\/charge\)/);
  const protocols = dev.sections.find(section => section.heading === 'Protocols and their scope');
  for (const name of ['x402', 'MPP', 'MCP', 'WebMCP', 'A2A', 'UCP']) assert.ok(protocols.entries.some(entry => entry.label === name), name);
  for (const accept of ['text/html', 'text/markdown']) {
    const text = await read('/developers', accept);
    assert.match(text, /org.paymentauth\/credential/);
  }
  const manual = await read('/agents.md', 'text/markdown');
  assert.match(manual, /org.paymentauth\/credential/);
  const auth = await read('/auth.md', 'text/markdown');
  assert.match(auth, /Native MPP checkout:/);
  const metadata = await read('/.well-known/oauth-protected-resource');
  assert.equal(metadata.agent_auth.native_mpp.mcp.credential_meta_key, 'org.paymentauth/credential');
});
await check('trust describes enabled native checkout and homepage visibly describes inspection', async () => {
  const trust = await read('/trust');
  assert.match(trust.discovery_by_protocol.find(row => row.id === 'mpp').scope, /native MPP checkout for enabled items/);
  const html = await read('/', 'text/html');
  // Read the body region outside the head's schema and metadata; this is not a sanitizer.
  const body = html.slice(html.indexOf('<body'));
  assert.match(body, /observed x402\/MPP protocols/);
});
await check('served deployment identity is available', async () => {
  const fixtures = await read(`/fixtures.json?release-readback=${Date.now()}`);
  assert.ok(fixtures.freshness.deploy_id);
});
await writeFile(`${directory}/before-months.json`, JSON.stringify(prior, null, 2) + '\n');
const record = { at: new Date().toISOString(), pr: 'https://github.com/seancrecord/scvd-general-store-repo/pull/947', reads, checks, limits: ['Read-only public requests; no paid or buyer qualification.', 'No authenticated admin readback.', 'New signed months are not forced or rewritten.', 'Package publication and external listing changes were not performed.'] };
await writeFile(`${directory}/readback.json`, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ checks, reads: reads.length }, null, 2));
if (checks.some(check => check.state === 'failed')) process.exitCode = 1;
