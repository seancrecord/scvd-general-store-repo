// node --test scripts/four-hundred-buckets.test.mjs
//
// Pins the four buckets the corrections ledger states for the August
// walk's post-payment 400s (entry 2026-09-10). The original field report
// typed its numbers; this walks them. A change to the ledger or to the
// classifier rules that moves any count fails here, so the published
// correction cannot drift from its own derivation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket, readLedger } from "./four-hundred-buckets.mjs";

const LEDGER = new URL("../research/field-run-2026-08-18/ledger.jsonl", import.meta.url);

test("the August ledger's 400s bucket exactly as the 2026-09-10 correction states", () => {
  const b = bucket(readLedger(LEDGER));
  assert.equal(b.attempts, 1707, "attempts");
  assert.equal(b.four_hundred, 616, "post-payment 400s");
  assert.equal(b.input, 276, "request-input refusals");
  assert.equal(b.none, 250, "no body at all");
  assert.equal(b.other, 50, "other");
  assert.equal(b.payment, 40, "payment/signature mentions");
  assert.equal(b.input + b.none + b.other + b.payment, b.four_hundred, "buckets partition the 400s");
});

test("a body that names both a field and a payment term is counted as payment, not input", () => {
  const rows = [
    { error: "Payment failed: 400", body_preview: '{"error":"field required: signature"}' },
    { error: "Payment failed: 400", body_preview: '{"error":"Missing required field: text"}' },
    { error: "Payment failed: 400", body_preview: null },
    { error: "Payment failed: 400", body_preview: "provide two colors" },
    { error: "Expected 402, got 400", body_preview: "not counted: unpaid probe" },
  ];
  assert.deepEqual(bucket(rows), { attempts: 5, four_hundred: 4, input: 1, none: 1, payment: 1, other: 1 });
});
