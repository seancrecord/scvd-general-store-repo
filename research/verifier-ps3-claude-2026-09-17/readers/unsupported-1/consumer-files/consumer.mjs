import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'));
const scenario = process.argv[2] ?? 'valid';
const file = new Map([
  ['valid', 'receipt.json'], ['tampered', 'receipt-tampered.json'],
  ['unsupported', 'receipt-es256.json'], ['unavailable-key', 'receipt.json'],
]).get(scenario);
if (!file) throw new Error(`Unknown scenario: ${scenario}`);

const { receipt } = load(file);
// Separate fixture key; these synthetic test bytes prove no real service identity.
const { publicKeyHex } = load('issuer-key.json');
const input = scenario === 'unavailable-key' ? { receipt } : { receipt, publicKey: publicKeyHex };
const result = await verifyReceipt(input, {
  subtle: webcrypto.subtle,
  // Make unavailable evidence reproducible. This example never contacts an issuer.
  fetch: async () => new Response(null, { status: 503 }),
});
const { status, reasonCodes, scope, doesNotEstablish } = result;
console.log(JSON.stringify({ status, reasonCodes, scope, doesNotEstablish }, null, 2));
