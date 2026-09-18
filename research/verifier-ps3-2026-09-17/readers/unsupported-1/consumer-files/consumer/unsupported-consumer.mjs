import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(
  readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'),
);

const { receipt } = load('receipt-es256.json');
const { publicKeyHex } = load('issuer-key.json');
const result = await verifyReceipt(
  { receipt, publicKey: publicKeyHex },
  { subtle: webcrypto.subtle },
);

writeFileSync(new URL('../observed.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');

console.log(JSON.stringify({
  status: result.status,
  reasonCodes: result.reasonCodes,
  scope: result.scope,
  doesNotEstablish: result.doesNotEstablish,
  outputFile: 'observed.json',
  canAuthorizePayment: false,
  blockers: [
    'ES256 is outside this package\'s supported algorithms; the receipt signature was not checked.',
  ],
}, null, 2));
