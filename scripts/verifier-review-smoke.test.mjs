import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';

const shared = [
  ['preflight_endpoint', 'preflight_x402_endpoint'],
  ['check_conformance', 'verify_x402_receipt'],
  ['verify_artifact', 'verify_scvd_artifact'],
];
const schema = { type: 'object' };
const readinessSchema = { type: 'object', required: ['result', 'evidence'], properties: {
  result: { type: 'string' }, evidence: { type: 'object', required: ['never_met'], properties: { never_met: { type: 'boolean' } } },
} };

// A local transport exercises the actual CLI verdict and exit status. Mutating
// the answer must make the instrument fail, not just change its printed rows.
async function smoke(mutate = () => {}) {
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const request = JSON.parse(text);
    const verifier = req.url === '/mcp/verifier';
    const tools = shared.map(pair => ({ name: pair[verifier ? 1 : 0],
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: true }, outputSchema: schema }));
    if (verifier) tools.push({ name: 'lookup_endpoint_readiness', outputSchema: readinessSchema }, { name: 'get_defect_definition', outputSchema: schema });
    const reply = { jsonrpc: '2.0', id: request.id };
    if (request.method === 'tools/list') reply.result = { tools };
    else {
      const { name, arguments: args } = request.params;
      if (shared[0].includes(name) || shared[2].includes(name) || args.id === 'review-unknown-defect') {
        reply.error = { code: -32602, message: 'Invalid input' };
      } else if (shared[1].includes(name)) {
        reply.result = { structuredContent: { verdict: args.artifact === 'not-a-signed-artifact' ? 'does_not_conform' : 'conforms' } };
      } else if (name === 'lookup_endpoint_readiness') {
        reply.result = { structuredContent: { result: args.host === '402signal.com' ? 'last_signed_round: ready' : 'refused: host_missing', evidence: { never_met: args.host !== '402signal.com' } } };
      } else reply.result = { structuredContent: args.id ? { id: args.id } : { classes: [{ id: 'fixture-defect' }] } };
    }
    mutate(reply, request);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const child = spawn(process.execPath, ['scripts/verifier-review-smoke.mjs', `http://127.0.0.1:${server.address().port}`]);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    return { code, result: stdout ? JSON.parse(stdout) : undefined, stderr };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('the full smoke accepts valid protocol refusals and schema-valid readiness refusals', async () => {
  const { code, result, stderr } = await smoke();
  assert.equal(code, 0, stderr || JSON.stringify(result?.rows.filter(row => !row.passed)));
  assert.equal(result.passed, true);
  assert.ok(result.rows.every(row => row.passed));
});

for (const scenario of [
  ['internal server error', (reply, request) => { if (shared[0].includes(request.params?.name)) reply.error = { code: -32603, message: 'Internal error' }; }],
  ['tool failure instead of invalid-input refusal', (reply, request) => { if (shared[2].includes(request.params?.name)) { delete reply.error; reply.result = { isError: true }; } }],
  ['malformed readiness refusal', (reply, request) => { if (request.params?.name === 'lookup_endpoint_readiness' && !request.params.arguments.host) delete reply.result.structuredContent.evidence; }],
  ['wrong readiness refusal', (reply, request) => { if (request.params?.name === 'lookup_endpoint_readiness' && !request.params.arguments.host) reply.result.structuredContent.result = 'refused: internal_failure'; }],
  ['readiness tool error with otherwise valid output', (reply, request) => { if (request.params?.name === 'lookup_endpoint_readiness' && !request.params.arguments.host) reply.result.isError = true; }],
]) test(`${scenario[0]} cannot pass as an expected refusal`, async () => {
  const { code, result, stderr } = await smoke(scenario[1]);
  assert.equal(code, 1, stderr);
  assert.equal(result.passed, false);
  assert.ok(result.rows.some(row => row.passed === false));
});

for (const scenario of [
  ['wrong response ID', reply => reply.id += 1],
  ['wrong protocol version', reply => reply.jsonrpc = '1.0'],
  ['both result and error', reply => { if (reply.error) reply.result = {}; }],
]) test(`${scenario[0]} is an incomplete transport check`, async () => {
  const { code, result, stderr } = await smoke(scenario[1]);
  assert.equal(code, 2, stderr);
  assert.equal(result, undefined);
  assert.match(stderr, /could not complete/);
});
