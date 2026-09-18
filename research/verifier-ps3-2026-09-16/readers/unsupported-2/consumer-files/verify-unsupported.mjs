import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { verifyReceipt } from 'x402-verify';

const entry = pathToFileURL(createRequire(import.meta.url).resolve('x402-verify'));
const load = (file) => JSON.parse(
  readFileSync(new URL(`./fixtures/start-here/${file}`, entry), 'utf8'),
);

const { receipt } = load('receipt-es256.json');
const result = await verifyReceipt({ receipt });

writeFileSync('observed.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
