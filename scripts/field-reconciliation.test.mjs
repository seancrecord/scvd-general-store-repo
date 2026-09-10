import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, reconcile, renderReport, parseChallenge } from "./lib/walkabout.mjs";
const network = "eip155:8453", asset = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const payTo = "0x1111111111111111111111111111111111111111";
const scope = { network, asset, wallet: "fixture", from_block: 100, to_block: 200, complete: true };
const attempt = (path, extra = {}) => ({ kind: "attempt", method: "GET", url: `https://vendor.example/${path}`, domain: "vendor.example", network, asset, pay_to: payTo, amount_atomic: "1000", payment_submitted: true, paid_status: 200, deliverable: "body", verdict: "settled", ...extra });
const transfer = (txHash, value = "1000", extra = {}) => ({ to: payTo, value, txHash, network, asset, ...extra });

test("responses, deliveries, settlement, free delivery and retries are separate observations", () => {
  const rows = [
    attempt("good", { tx_hash: "0xaaa" }),
    attempt("free", { pay_to: "0x2222222222222222222222222222222222222222", paid_body: '{"first_call_free":true}' }),
    attempt("bad-input", { pay_to: "0x3333333333333333333333333333333333333333", paid_status: 400, verdict: "payment_refused", deliverable: null }),
    attempt("missing", { paid_status: 404, verdict: "payment_refused", deliverable: null, tx_hash: "0xbbb", amount_atomic: "10000" }),
    attempt("good?retry=1", { tx_hash: "0xaaa" }),
    attempt("client", { payment_submitted: false, paid_status: undefined, verdict: "unreachable", deliverable: null, failure_origin: "client" }),
  ];
  const summary = summarize(rows);
  assert.equal(summary.unique_doors, 5);
  assert.equal(summary.repeat_attempts, 1);
  assert.equal(summary.responses_with_body, 3);
  assert.equal(summary.client_failures, 1);
  assert.equal(summary.payments_presented, 5);
  const recon = reconcile(rows, [transfer("0xaaa"), transfer("0xbbb", "10000")], scope);
  assert.equal(recon.chain_atomic, "11000");
  assert.equal(recon.matched, 2);
  assert.equal(recon.settled_with_delivery, 1);
  assert.equal(recon.settled_without_delivery, 1);
  assert.equal(recon.free_deliveries_in_window, 1);
  assert.equal(recon.rows[2].settlement, "no_transfer_in_window");
  assert.equal(recon.rows[3].settlement, "confirmed");
  assert.equal(recon.rows[4].settlement, "confirmed_replay");
  assert.equal(recon.rows[5].settlement, "not_submitted");
  const report = renderReport({ ...summary, reconciliation: recon });
  assert.match(report, /0\.011000/);
  assert.doesNotMatch(report, /settled\*\* \(money moved, 2xx\)/);
  assert.match(report, /content.*not.*verified/i);
});

test("a transaction hash cannot be replaced with a same-price payment to the same seller", () => {
  const result = reconcile([attempt("x", { tx_hash: "0xaaa" })], [transfer("0xbbb")], scope);
  assert.equal(result.matched, 0);
  assert.equal(result.unmatched_transfers.length, 1);
  assert.equal(result.rows[0].settlement, "unknown");
});

test("terms alone are candidates, and cannot steal an exact match", () => {
  const result = reconcile([attempt("no-hash"), attempt("hash", { tx_hash: "0xaaa" })], [transfer("0xaaa")], scope);
  assert.equal(result.matched, 1);
  assert.equal(result.rows[0].settlement, "unknown");
  assert.equal(result.rows[0].candidate_transfers, 1);
  assert.equal(result.rows[1].settlement, "confirmed");
});

test("absence requires an explicit completed scan of this network and asset", () => {
  const row = attempt("free", { pay_to: "0x2222222222222222222222222222222222222222", paid_body: '{"first_call_free":true}' });
  for (const scan of [undefined, { ...scope, complete: false }, { ...scope, network: "solana:fixture" }]) {
    const result = reconcile([row], [], scan);
    assert.equal(result.rows[0].settlement, "unknown");
    assert.equal(result.free_deliveries_in_window, 0);
  }
});

test("atomic totals stay exact and conflicting or duplicate evidence fails closed", () => {
  const result = reconcile([], [transfer("0xaaa", "9007199254740993"), transfer("0xbbb", "1")], scope);
  assert.equal(result.chain_atomic, "9007199254740994");
  assert.equal(result.chain_usdc, "9007199254.740994");
  assert.throws(() => reconcile([], [transfer("0xaaa", "1.2")], scope));
  assert.throws(() => reconcile([], [transfer("0xaaa", "1", { logIndex: "0x1" }), transfer("0xaaa", "1", { logIndex: "0x1" })], scope), /duplicate/i);
  const conflict = reconcile([attempt("bad", { tx_hash: "0xaaa" })], [transfer("0xaaa", "2")], scope);
  assert.equal(conflict.rows[0].settlement, "evidence_conflict");
});

test("HTTP header casing does not change whether the client sees the challenge", () => {
  const challenge = { x402Version: 2, accepts: [] };
  const wire = Buffer.from(JSON.stringify(challenge)).toString("base64");
  for (const name of ["payment-required", "PAYMENT-REQUIRED", "Payment-Required", "pAyMeNt-ReQuIrEd"]) {
    assert.deepEqual(parseChallenge(402, { [name]: wire }, "").challenge, challenge);
    assert.deepEqual(parseChallenge(402, new Headers({ [name]: wire }), "").challenge, challenge);
  }
});

test("a stale reconciliation cannot silently annotate a changed ledger", () => {
  const rows = [attempt("good", { tx_hash: "0xaaa" })];
  const reconciliation = reconcile(rows, [transfer("0xaaa")], scope);
  assert.throws(() => renderReport({ ...summarize([...rows, attempt("new")]), reconciliation }), /ledger.*changed|stale/i);
});

test("malformed ledger rows cannot disappear from the denominator", () => {
  assert.throws(() => summarize([JSON.stringify(attempt("good")), '{"kind":']), /ledger|JSON/i);
});
