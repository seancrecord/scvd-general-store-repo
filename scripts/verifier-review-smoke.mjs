#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
const base = process.argv[2] ?? 'https://scvd.store';
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const rows = [];
let sequence = 0;
async function rpc(path, method, params = {}) {
  const response = await fetch(new URL(path, base), { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': 'scvd-verifier-review/1 (+https://scvd.store)' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).find(line => line.startsWith('{')) : text;
  return { status: response.status, body: JSON.parse(payload) };
}
try {
  const catalogs = {};
  for (const path of ['/mcp','/mcp/verifier']) catalogs[path] = (await rpc(path, 'tools/list')).body.result.tools;
  const shared = [['preflight_endpoint','preflight_x402_endpoint'],['check_conformance','verify_x402_receipt'],['verify_artifact','verify_scvd_artifact']];
  for (const [name,alias] of shared) {
    const annotations = [catalogs['/mcp'].find(t => t.name === name)?.annotations, catalogs['/mcp/verifier'].find(t => t.name === alias)?.annotations];
    const effects = annotations.map(a => Object.fromEntries(Object.entries(a ?? {}).filter(([key]) => key !== 'title').sort(([a],[b])=>a.localeCompare(b))));
    rows.push({ case: `annotations:${name}`, passed: annotations.every(Boolean) && JSON.stringify(effects[0]) === JSON.stringify(effects[1]), effects });
  }
  async function call(path, name, args, expected = 'structured') {
    const reply = await rpc(path, 'tools/call', { name, arguments: args });
    const data = reply.body.result?.structuredContent;
    const schema = catalogs[path].find(t => t.name === name)?.outputSchema;
    const validate = schema ? ajv.compile(schema) : undefined;
    const schemaValid = data !== undefined && validate ? validate(data) : null;
    // Refusal branches may use the protocol's error envelope instead of structuredContent.
    const refused = Boolean(reply.body.error) || reply.body.result?.isError === true || (typeof data?.result === 'string' && data.result.startsWith('refused:'));
    const passed = reply.status === 200 && (expected === 'error' ? reply.body.error?.code === -32602 : expected === 'refusal' ? refused : schemaValid === true && !reply.body.error && reply.body.result?.isError !== true && (expected === 'structured' || data?.verdict === expected) && (!args.id || data?.id === args.id));
    rows.push({ path, name, arguments: args, expected, status: reply.status, passed, schema_valid: schemaValid,
      result: data?.result ?? data?.verdict ?? data?.id, error: reply.body.error,
      ...(schemaValid === false ? { schema_errors: validate.errors } : {}) });
    return data;
  }
  const receipt = JSON.parse(await readFile(new URL('../verifier/fixtures/receipt-valid.json', import.meta.url)));
  for (const [path,preflight,conformance,artifact] of [
    ['/mcp','preflight_endpoint','check_conformance','verify_artifact'],
    ['/mcp/verifier','preflight_x402_endpoint','verify_x402_receipt','verify_scvd_artifact'],
  ]) {
    await call(path, preflight, {}, 'refusal');
    await call(path, preflight, { url: 'https://127.0.0.1/private' }, 'refusal');
    await call(path, conformance, { artifact: receipt.receipt, public_key_hex: receipt.publicKeyHex }, 'conforms');
    await call(path, conformance, { artifact: 'not-a-signed-artifact' }, 'does_not_conform');
    await call(path, artifact, {}, 'refusal');
  }
  const path = '/mcp/verifier';
  await call(path, 'lookup_endpoint_readiness', {}, 'refusal');
  await call(path, 'lookup_endpoint_readiness', { host: 'https://' }, 'refusal');
  const stored = await call(path, 'lookup_endpoint_readiness', { host: '402signal.com' });
  if (stored?.evidence?.never_met !== false) rows.push({ case: 'stored_evidence', passed: false, reason: 'The named host had no stored evidence; no historical coverage inferred.' });
  const index = await call(path, 'get_defect_definition', {});
  if (!index?.classes?.length) throw new Error('Vocabulary index unavailable');
  for (const cls of index.classes) await call(path, 'get_defect_definition', { id: cls.id });
  await call(path, 'get_defect_definition', { id: 'review-unknown-defect' }, 'error');
  const result = { observed_at: new Date().toISOString(), base,
    scope: 'Shared handlers on both doors; readiness and vocabulary are registered only on the verifier door. Local fixture receipt checked offline with its public key. No payment sent.',
    gaps: ['Unknown-host production lookup not run: eligible unseen hosts enter the public demand queue. Covered with an isolated fixture by test/verifier-output-schemas.spec.ts.', 'No fresh outbound preflight or paid delivery exercised.', 'Schema formats are not validated by this smoke; structure and types are.'],
    registered_defects: index.classes.length, rows, passed: rows.every(row => row.passed) };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
} catch (error) { console.error(`Verifier smoke could not complete: ${error.message}`); process.exitCode = 2; }
