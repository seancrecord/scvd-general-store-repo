// Offline analysis of saved public responses. No network, wallet or payment.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const captures = ['bix-current-schema', 'bix-reliability', 'bix-unpaid-challenge'];
for (const name of captures) {
  const metadata = read(`captures/${name}.json`);
  const bytes = fs.readFileSync(path.join(root, 'captures', metadata.body_file));
  assert.equal(metadata.truncated, false);
  assert.equal(metadata.bytes, bytes.length);
  assert.equal(metadata.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(metadata.payment_sent, false);
}
const schema = read('captures/bix-current-schema.body');
const reliability = read('captures/bix-reliability.body');
const request = read('captures/bix-unpaid-challenge.json');
const header = Object.entries(request.headers).find(([k]) => k.toLowerCase() === 'payment-required')?.[1];
assert.ok(header);
const challenge = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
assert.deepEqual(challenge, read('captures/bix-unpaid-challenge.body'));
assert.equal(challenge.resource.url, request.requested_url);
const operation = schema.paths[new URL(request.requested_url).pathname].post;
const ajv = new Ajv2020({strict: false, allErrors: true});
const validateRequest = ajv.compile(operation.requestBody.content['application/json'].schema);
const input = JSON.parse(request.request_body);
assert.equal(validateRequest(input), true);
assert.equal(validateRequest({pair: input.pair}), false);
assert.equal(validateRequest({...input, tax: 'not-a-number'}), false);
const validateDiscovery = ajv.compile(challenge.extensions.bazaar.schema);
assert.equal(validateDiscovery(challenge.extensions.bazaar.info), true);
const outputSchema = operation.responses['200'].content['application/json'].schema;
const advertisedEnum = outputSchema.properties.recommendation.enum;
const example = challenge.extensions.bazaar.info.output.example;
assert.equal(ajv.compile(outputSchema)(example), true);
const quote = challenge.accepts.map(a => ({...a, amount_usdc_at_six_decimals: (BigInt(a.amount) / 1000000n).toString() + '.' + (BigInt(a.amount) % 1000000n).toString().padStart(6,'0')}));
console.log(JSON.stringify({
  scope: 'Offline request/discovery schema checks and saved unsigned responses; not full x402 conformance or paid delivery.',
  capture_hashes_verified: captures.length,
  statuses: Object.fromEntries(captures.map(n => [n, read(`captures/${n}.json`).status])),
  request_schema_accepts_synthetic_input: true,
  missing_tax_and_wrong_type_controls_rejected: true,
  header_equals_body: true, resource_url_matches: true,
  bazaar_info_validates_against_own_schema: true,
  published_example_validates_against_output_schema: true,
  schema_fixed_price: operation['x-payment-info'].price,
  x402_version: challenge.x402Version, offers: quote,
  reliability_is_seller_claim: reliability,
  output_recommendation_enum: advertisedEnum,
  reported_hold_paper_allowed_by_enum: advertisedEnum.includes('HOLD_PAPER'),
  note: 'HOLD_PAPER was reported by the operator; it was not observed in a paid response. The PROMOTE example is illustrative, not a current product result.',
  payment_sent: false, settlement_observed: false, paid_delivery_observed: false,
}, null, 2));
