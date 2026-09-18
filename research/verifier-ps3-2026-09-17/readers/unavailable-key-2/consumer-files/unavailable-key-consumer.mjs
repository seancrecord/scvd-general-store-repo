import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'));
const { receipt } = load('receipt.json');

const result = await verifyReceipt(
  { receipt },
  {
    subtle: webcrypto.subtle,
    fetch: async () => new Response(null, { status: 503 }),
  },
);

const report = {
  status: result.status,
  reasonCodes: result.reasonCodes,
  scope: result.scope,
  doesNotEstablish: result.doesNotEstablish,
  outputFile: 'observed.json',
  canAuthorizePayment: false,
  blockers: result.reasonCodes,
};

writeFileSync('observed.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
