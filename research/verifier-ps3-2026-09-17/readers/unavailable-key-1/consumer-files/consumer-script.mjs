import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(
  readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'),
);

const { receipt } = load('receipt.json');
const apiResult = await verifyReceipt(
  { receipt },
  {
    subtle: webcrypto.subtle,
    fetch: async () => new Response(null, { status: 503 }),
  },
);

writeFileSync('observed.json', `${JSON.stringify(apiResult, null, 2)}\n`);

console.log(JSON.stringify({
  status: apiResult.status,
  reasonCodes: apiResult.reasonCodes,
  scope: apiResult.scope,
  doesNotEstablish: apiResult.doesNotEstablish,
  outputFile: 'observed.json',
  canAuthorizePayment: false,
  blockers: apiResult.reasonCodes,
}, null, 2));
