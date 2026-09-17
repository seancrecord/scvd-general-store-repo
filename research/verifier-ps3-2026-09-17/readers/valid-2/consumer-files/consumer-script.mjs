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
const { publicKeyHex } = load('issuer-key.json');
const result = await verifyReceipt(
  { receipt, publicKey: publicKeyHex },
  {
    subtle: webcrypto.subtle,
    fetch: async () => new Response(null, { status: 503 }),
  },
);

writeFileSync('observed.json', `${JSON.stringify(result, null, 2)}\n`);

const report = {
  status: result.status,
  reasonCodes: result.reasonCodes,
  scope: result.scope,
  doesNotEstablish: result.doesNotEstablish,
  outputFile: 'observed.json',
  canAuthorizePayment: false,
  blockers: [
    'Payment authorization remains a separate decision under the caller\'s payment policy.',
    'Signing-key authorization for resourceUrl is not established by this result.',
  ],
};
console.log(JSON.stringify(report, null, 2));
