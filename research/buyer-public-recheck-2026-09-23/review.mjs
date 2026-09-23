// Offline replay of this dated public reading. No cold cohort, signing or payment.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { compareBuyerContracts } from './comparator.mjs';
const file = name => new URL(name, import.meta.url);
const bytes = name => {
  const stored = fs.existsSync(file(name)) ? name : name + '.gz';
  const raw = fs.readFileSync(file(stored));
  return stored.endsWith('.gz') ? gunzipSync(raw) : raw;
};
const read = name => JSON.parse(bytes(name).toString('utf8'));
for (const entry of read('manifest.json').files) {
  const decoded = bytes(entry.path);
  assert.equal(decoded.length, entry.bytes, entry.path);
  assert.equal(createHash('sha256').update(decoded).digest('hex'), entry.sha256, entry.path);
}
const acquisition = read('acquisition.json');
for (const row of acquisition) {
  assert.equal(row.status, 200);
  assert.equal(createHash('sha256').update(bytes(`${row.name}.snapshot`)).digest('hex'), row.sha256);
}
const rows = read('prepayment.json'), links = read('links.json');
const menu = read('menu.snapshot'), openapi = read('openapi.snapshot'), manifest = read('manifest.snapshot');
const revised = compareBuyerContracts({ menu, openapi, manifest });
const rails = offers => [...new Set(offers.map(o => o.network))].sort();
function offers(row) {
  const header = row?.headers?.['payment-required'];
  return (header ? JSON.parse(Buffer.from(header, 'base64')).accepts : undefined)
    ?? row?.body?.accepts ?? row?.body?.error?.data?.['x402/payment-required']?.accepts ?? [];
}
const quoted = row => row?.status === 402 || row?.body?.error?.code === 402;
const pairs = menu.items.map(item => {
  const pair = rows.filter(r => r.item === item.id && r.scenario === 'published_example');
  const h = pair.find(r => r.door === 'http'), m = pair.find(r => r.door === 'mcp');
  const hRails = rails(offers(h)), mRails = rails(offers(m));
  const resource = manifest.resources.find(r => new URL(r.resource).pathname === '/api/buy/' + item.id);
  const declared = openapi.paths['/api/buy/' + item.id].get['x-payment'].networks.slice().sort();
  const discovered = rails(resource.accepts);
  const eligible = quoted(h) && quoted(m) && hRails.length > 0 && mRails.length > 0;
  return { item: item.id, request_ids: [h.id, m.id], both_quoted: eligible,
    http_rails: hRails, mcp_rails: mRails, openapi_rails: declared, manifest_rails: discovered,
    equal: eligible ? [mRails, declared, discovered].every(r => JSON.stringify(r) === JSON.stringify(hRails)) : null };
});
const byStatus = values => values.reduce((out, r) => { const status = r.status ?? 'transport_failure'; out[status] = (out[status] ?? 0) + 1; return out; }, {});
const eligible = pairs.filter(p => p.both_quoted);
assert(eligible.length > 0);
const examples = pairs.filter(p => ['attestation_bundle', 'bitcoin_anchor'].includes(p.item));
assert.equal(examples.length, 2);
const keyUrl = 'https://scvd.store/.well-known/scvd-signing-key';
const keyLink = links.find(r => r.url === keyUrl);
assert(keyLink);
const llms = fs.readFileSync(file('llms.snapshot'), 'utf8');
const keyFixed = llms.includes(keyUrl) && !/https:\/\/scvd\.store\/keys(?:[\s)"'#?]|$)/.test(llms) && keyLink.status === 200;
const findings = [
  { id: 'BUY-040', state: eligible.every(p => p.equal) ? 'not_reproduced' : 'reproduced', request_ids: eligible.flatMap(p => p.request_ids), scope: 'x402 rail agreement in quoted example pairs and menu-item OpenAPI/manifest declarations; refused pairs excluded' },
  { id: 'BUY-042', state: examples.every(p => p.both_quoted) ? 'not_reproduced' : 'incomplete', request_ids: examples.flatMap(p => p.request_ids), scope: 'The original bundle/digest examples quote literally over HTTP and MCP; no broader all-example success claim' },
  { id: 'BUY-044', state: keyFixed ? 'not_reproduced' : 'incomplete', request_ids: [keyLink.id], scope: 'llms now names the canonical signing-key URL and that retained request answers 200; not a test of the retired /keys alias' },
];
console.log(JSON.stringify({
  acquired_from: acquisition[0].sent_at, acquired_through: acquisition.at(-1).received_at,
  surfaces: acquisition.length, products: menu.items.length, payment_submitted: false, spend_usdc: 0,
  input_requests: rows.length, input_statuses: byStatus(rows), link_attempts: links.length, link_statuses: byStatus(links),
  unresolved_template_occurrences: read('unresolved-links.json').length,
  transport_gaps: links.filter(r => !r.status).map(({id,url,instrument_error}) => ({id,url,instrument_error})),
  original_comparison_issues: read('comparison.json').flatMap(r => r.issues).length,
  corrected_comparison_issues: revised.flatMap(r => r.issues),
  quoted_pairs: eligible.length, excluded_pairs: pairs.filter(p => !p.both_quoted),
  rail_mismatches: eligible.filter(p => !p.equal), findings,
  limits: ['No new cold cohort, paid settlement or fulfillment.', 'Partial structural fields over menu, manifest and OpenAPI; local schema references/allOf are projected, unsupported compositions remain missing evidence.', 'Direct links only; no recursive crawl, all-surface semantic comparison or complete error coverage.', 'Native MPP agreement is not measured by this x402 rail comparison.', 'Historical raw comparison is preserved; corrected result replays the same retained bytes without another network run.'],
}, null, 2));
