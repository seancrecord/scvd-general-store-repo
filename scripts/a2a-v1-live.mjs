#!/usr/bin/env node
/** Independent v1 client smoke. Free evidence tasks only; never supplies a payment. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { CancelTaskRequest, GetTaskRequest, SendMessageRequest, TaskState } from '@a2a-js/sdk';

export async function checkA2aV1(base, fetcher = fetch) {
  const origin = new URL(base).origin;
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    // A local test must not accidentally follow a production URL advertised by its card.
    assert.equal(url.origin, origin, 'The card directed the client outside the requested origin');
    const request = new Request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    assert.equal(request.headers.has('PAYMENT-SIGNATURE'), false);
    assert.equal(request.headers.get('A2A-Version'), '1.0');
    const requestBody = request.method === 'POST' ? await request.clone().json() : null;
    const response = await fetcher(request);
    const raw = await response.clone().json();
    calls.push({ path: url.pathname, method: request.method, status: response.status, request: requestBody, response: raw });
    return response;
  };
  const client = await new ClientFactory({ cardResolver: new DefaultAgentCardResolver({ fetchImpl }), transports: [new JsonRpcTransportFactory({ fetchImpl })] }).createFromUrl(origin);
  const fixture = JSON.parse(await readFile(new URL('../verifier/fixtures/receipt-valid.json', import.meta.url), 'utf8'));
  const inputs = [
    { task: 'preflight_endpoint', url: 'http://localhost/private' },
    { task: 'verify_receipt', receipt: fixture.receipt, public_key_hex: fixture.publicKeyHex },
    { task: 'get_endpoint_readiness', host: 'never-met.example' },
  ];
  const checks = [];
  for (const input of inputs) {
    const task = await client.sendMessage(SendMessageRequest.fromJSON({ message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ data: input }] } }));
    assert.ok('status' in task, 'Expected Task, not Message');
    const evidence = task.artifacts[0]?.parts[0]?.content;
    assert.equal(evidence?.$case, 'data');
    assert.equal(evidence.value.task, input.task);
    assert.ok(evidence.value.does_not_establish.length > 0);
    if (input.task === 'preflight_endpoint') {
      assert.equal(task.status.state, TaskState.TASK_STATE_FAILED);
      assert.match(evidence.value.result, /^refused:/);
    } else {
      assert.equal(task.status.state, TaskState.TASK_STATE_COMPLETED);
      assert.equal(evidence.value.result, input.task === 'verify_receipt' ? 'valid' : 'never_met');
    }
    assert.deepEqual(await client.getTask(GetTaskRequest.fromJSON({ id: task.id })), task);
    await assert.rejects(() => client.cancelTask(CancelTaskRequest.fromJSON({ id: task.id })), error => error.envelopeCode === -32002 && error.reason === 'TASK_NOT_CANCELABLE');
    checks.push({ task: input.task, result: evidence.value.result, retrieved: true, terminal_cancel_refused: true });
  }
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return { tested_at: new Date().toISOString(), base: origin, client: `@a2a-js/sdk@${packageJson.devDependencies['@a2a-js/sdk']}`, legacy_compat: false, checks, calls, gaps: ['Directed protocol smoke, not cold discovery or stranger usability.', 'Preflight case checks private-target refusal; controlled public 402 is covered in the Worker test.', 'No payment, purchase, new signature, production deployment or end-to-end signed evidence acquisition was tested.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Pass an explicit base URL; no default production target.');
  process.stdout.write(JSON.stringify(await checkA2aV1(process.argv[2]), null, 2) + '\n');
}
