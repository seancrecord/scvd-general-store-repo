import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { verifyReceipt, type VerificationStatus, type VerificationReasonCode } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const fixture = (file: string): unknown => JSON.parse(readFileSync(new URL(`fixtures/start-here/${file}`, entry), 'utf8'));
const key = fixture('issuer-key.json') as { publicKeyHex: string };
function action(status: VerificationStatus): string {
  switch (status) {
    case 'valid': return 'checks passed';
    case 'invalid': return 'required check failed';
    case 'unsupported': return 'capability missing';
    case 'inconclusive': return 'evidence missing';
    default: { const never: never = status; return never; }
  }
}
const cases: [string, VerificationStatus, VerificationReasonCode | undefined][] = [
  ['receipt.json', 'valid', undefined], ['receipt-tampered.json', 'invalid', 'signature_invalid'],
  ['receipt-es256.json', 'unsupported', 'unsupported_algorithm'], ['receipt.json', 'inconclusive', 'key_unavailable'],
];
for (const [file, expected, reason] of cases) {
  const { receipt } = fixture(file) as { receipt: string };
  const result = await verifyReceipt({ receipt, ...(expected === 'inconclusive' ? {} : { publicKey: key.publicKeyHex }) }, {
    subtle: webcrypto.subtle, fetch: async () => new Response(null, { status: 503 }),
  });
  assert.equal(result.status, expected);
  if (reason) assert.ok(result.reasonCodes.includes(reason));
  assert.equal(result.valid, result.status === 'valid');
  assert.equal(typeof result.scope, 'string');
  console.log(JSON.stringify({ status: result.status, action: action(result.status), reasonCodes: result.reasonCodes }));
}
// A declared result is a closed union, not an arbitrary success string.
// @ts-expect-error unsupported status must not compile
action('probably-valid');
