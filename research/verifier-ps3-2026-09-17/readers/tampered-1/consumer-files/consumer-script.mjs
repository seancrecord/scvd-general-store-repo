import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(
  readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'),
);

const scenario = process.argv[2] ?? 'valid';
if (scenario !== 'tampered') throw new Error(`Expected tampered scenario, got: ${scenario}`);

const { receipt } = load('receipt-tampered.json');
const { publicKeyHex } = load('issuer-key.json');
const result = await verifyReceipt(
  { receipt, publicKey: publicKeyHex },
  {
    subtle: webcrypto.subtle,
    fetch: async () => new Response(null, { status: 503 }),
  },
);

writeFileSync('observed.json', `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify({
  status: result.status,
  reasonCodes: result.reasonCodes,
  scope: result.scope,
  doesNotEstablish: result.doesNotEstablish,
  outputFile: 'observed.json',
  canAuthorizePayment: false,
  blockers: result.reasonCodes,
}, null, 2));
