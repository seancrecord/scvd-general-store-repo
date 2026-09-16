import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareQuote } from './catalog-review-smoke.mjs';
const item = { price_usdc: 1, price_tiers_usdc: [1, 2] };
const detail = { price_usdc: 1 };
const quote = { status: 402, body: { min_price_usdc: 1 }, challenge: { accepts: ['a','b'].flatMap(network => ['1000000','2000000'].map(amount => ({ network, amount }))) } };
test('compares every rail and amount pair, not merely their separate sets', () => {
  assert.deepEqual(compareQuote(item, detail, quote, ['a','b'], 6), []);
  const changed = structuredClone(quote);
  changed.challenge.accepts[0].network = 'b';
  assert.deepEqual(compareQuote(item, detail, changed, ['a','b'], 6), ['rail_amount_pairs']);
});
test('missing and refused quotes cannot pass as agreement', () => {
  assert.ok(compareQuote(item, detail, { status: 402, body: quote.body }, ['a'], 6).includes('terms_unobserved'));
  assert.ok(compareQuote(item, detail, { ...quote, status: 503 }, ['a','b'], 6).includes('quote_status'));
  assert.ok(compareQuote(item, { price_usdc: 19 }, quote, ['a','b'], 6).includes('item_price'));
  assert.ok(compareQuote(item, detail, { ...quote, body: { min_price_usdc: 21 } }, ['a','b'], 6).includes('quote_price'));
});
