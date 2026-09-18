import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'));
const scenario = process.argv[2] ?? 'tampered';
if (scenario !== 'tampered') throw new Error(`Unknown scenario: ${scenario}`);

const { receipt } = load('receipt-tampered.json');
const { publicKeyHex } = load('issuer-key.json');
const result = await verifyReceipt(
  { receipt, publicKey: publicKeyHex },
  {
    subtle: webcrypto.subtle,
    fetch: async () => new Response(null, { status: 503 }),
  },
);

const { status, reasonCodes, scope, doesNotEstablish } = result;
console.log(JSON.stringify({ status, reasonCodes, scope, doesNotEstablish }, null, 2));
