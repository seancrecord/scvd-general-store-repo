#!/usr/bin/env node
/**
 * Re-derives the 2026-09-08 reclassification of the August walk's HTTP 400s.
 * The August FIELD-REPORT attributed them to facilitator rejection of signed
 * payments; this pass reads the stored response bodies instead.
 *
 *   node scripts/four-hundred-buckets.mjs research/field-run-2026-08-18/ledger.jsonl
 *
 * Bodies are stored capped at 200 characters, so this is a keyword pass over
 * truncated text, not a hand-read. Rows with no body are unclassifiable and
 * are counted as such rather than assigned.
 */
import { readFileSync } from "node:fs";

const INPUT = /required|invalid_type|Validation failed|input schema|missing|expected|Invalid JSON|must be|field/i;
const PAYMENT = /payment|x402|settle|facilitat|signature|nonce|authoriz|insufficient/i;

const path = process.argv[2] ?? "research/field-run-2026-08-18/ledger.jsonl";
const rows = readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const four = rows.filter((r) => r.error === "Payment failed: 400");

const buckets = { input: 0, none: 0, payment: 0, other: 0 };
for (const row of four) {
  const body = row.body_preview;
  if (!body) buckets.none += 1;
  else if (PAYMENT.test(String(body))) buckets.payment += 1;
  else if (INPUT.test(String(body))) buckets.input += 1;
  else buckets.other += 1;
}

const pct = (n) => `${((100 * n) / four.length).toFixed(1)}%`;
console.log(`attempts: ${rows.length}`);
console.log(`HTTP 400 after payment: ${four.length} (${((100 * four.length) / rows.length).toFixed(1)}% of attempts)`);
console.log(`  request inputs:        ${buckets.input} (${pct(buckets.input)})`);
console.log(`  no body at all:        ${buckets.none} (${pct(buckets.none)})`);
console.log(`  other:                 ${buckets.other} (${pct(buckets.other)})`);
console.log(`  payment/signature:     ${buckets.payment} (${pct(buckets.payment)})`);
