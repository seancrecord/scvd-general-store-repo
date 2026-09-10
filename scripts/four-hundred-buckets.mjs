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
 *
 * scripts/four-hundred-buckets.test.mjs pins the counts the corrections
 * ledger states (entry 2026-09-10), so a drift in the ledger or the rules
 * fails rather than quietly changing a published number.
 */
import { readFileSync } from "node:fs";

export const INPUT = /required|invalid_type|Validation failed|input schema|missing|expected|Invalid JSON|must be|field/i;
export const PAYMENT = /payment|x402|settle|facilitat|signature|nonce|authoriz|insufficient/i;

/** The ledger's post-payment 400 marker, as the runner wrote it. */
export const PAID_400 = "Payment failed: 400";

export function bucket(rows) {
  const four = rows.filter((r) => r.error === PAID_400);
  const buckets = { input: 0, none: 0, payment: 0, other: 0 };
  for (const row of four) {
    const body = row.body_preview;
    if (!body) buckets.none += 1;
    else if (PAYMENT.test(String(body))) buckets.payment += 1;
    else if (INPUT.test(String(body))) buckets.input += 1;
    else buckets.other += 1;
  }
  return { attempts: rows.length, four_hundred: four.length, ...buckets };
}

export function readLedger(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? "research/field-run-2026-08-18/ledger.jsonl";
  const b = bucket(readLedger(path));
  const pct = (n) => `${((100 * n) / b.four_hundred).toFixed(1)}%`;
  console.log(`attempts: ${b.attempts}`);
  console.log(`HTTP 400 after payment: ${b.four_hundred} (${((100 * b.four_hundred) / b.attempts).toFixed(1)}% of attempts)`);
  console.log(`  request inputs:        ${b.input} (${pct(b.input)})`);
  console.log(`  no body at all:        ${b.none} (${pct(b.none)})`);
  console.log(`  other:                 ${b.other} (${pct(b.other)})`);
  console.log(`  payment/signature:     ${b.payment} (${pct(b.payment)})`);
}
