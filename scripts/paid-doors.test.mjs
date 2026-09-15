import assert from "node:assert/strict";
import test from "node:test";
import {
  PAID_RESIDUAL,
  PAID_VERDICTS,
  distinctPayers,
  readDoorRail,
  totalReceived,
} from "./lib/paid-doors.mjs";

const AT = 51316142;
const payTo = "0xAbC0000000000000000000000000000000000001";

test("a complete window with transfers reads PAID, and counts senders not buyers", () => {
  const out = readDoorRail({
    rail: "eip155:8453", payTo, atBlock: AT, logsComplete: true,
    logs: [
      { from: "0xFaC1", value: 1000n }, { from: "0xfac1", value: 2000n }, { from: "0xBob2", value: 500n },
    ],
  });
  assert.equal(out.verdict, "PAID");
  // One facilitator settling twice is one counterparty; case must not split it.
  assert.equal(out.distinct_payers, 2);
  assert.equal(out.total_received_atomic, "3500");
});

test("a complete empty window reads ZERO_OBSERVED; a truncated one never does", () => {
  const complete = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, logs: [], logsComplete: true });
  assert.equal(complete.verdict, "ZERO_OBSERVED");
  // The same bytes, the opposite fact. This is the whole reason
  // logsComplete is a separate argument.
  const truncated = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, logs: [], logsComplete: false, balance: 0n, nonce: 4 });
  assert.equal(truncated.verdict, "UNKNOWN");
  assert.match(truncated.established_by, /truncated/);
});

test("state alone can settle a positive, and a zero only under the nonce argument", () => {
  const funded = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, balance: 7n, nonce: 3 });
  assert.equal(funded.verdict, "PAID");
  assert.equal(funded.distinct_payers, null, "a balance proves arrival, never who sent it");

  const provableZero = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, balance: 0n, nonce: 0 });
  assert.equal(provableZero.verdict, "ZERO_OBSERVED");
  assert.match(provableZero.established_by, /monotonically non-decreasing/);

  // Zero balance but the address has spent: funds could have arrived and left.
  const spent = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, balance: 0n, nonce: 9 });
  assert.equal(spent.verdict, "UNKNOWN");
});

test("it never returns a quiet clean: nothing read is UNKNOWN, not zero", () => {
  for (const input of [
    { rail: "xrpl:0", payTo: "rSomething", atBlock: AT },
    { rail: "eip155:8453", payTo, atBlock: AT },
    { rail: "eip155:8453", payTo: null, atBlock: AT },
  ]) {
    const out = readDoorRail(input);
    assert.equal(out.verdict, "UNKNOWN", JSON.stringify(input));
    assert.ok(out.established_by.length > 0);
    assert.notEqual(out.verdict, "ZERO_OBSERVED");
  }
});

test("every reading carries the residual it cannot close, and only the three verdicts exist", () => {
  const out = readDoorRail({ rail: "eip155:8453", payTo, atBlock: AT, balance: 0n, nonce: 0 });
  assert.equal(out.residual, PAID_RESIDUAL);
  assert.match(PAID_RESIDUAL, /EIP-3009/);
  assert.deepEqual([...PAID_VERDICTS], ["PAID", "ZERO_OBSERVED", "UNKNOWN"]);
  assert.ok(!PAID_VERDICTS.includes("never_paid"));
});

test("the helpers are case-insensitive on addresses and exact on amounts", () => {
  assert.deepEqual(distinctPayers([{ from: "0xAA" }, { from: "0xaa" }, { from: "0xBB" }]), ["0xaa", "0xbb"]);
  assert.equal(distinctPayers(null).length, 0);
  assert.equal(totalReceived([{ value: 1n }, { value: 2n }]).toString(), "3");
  assert.equal(totalReceived(null).toString(), "0");
});

test("a named window narrows what a zero means, and the nonce argument is the only thing that widens it", () => {
  // A complete, empty window with a floor is a zero IN THAT WINDOW. It is
  // NOT a claim about any earlier block, and the row has to say so: a door
  // paid heavily in July and quiet since reads exactly like this.
  const windowed = readDoorRail({
    rail: "eip155:8453", payTo: "0xaaa", fromBlock: 50918945, atBlock: 51316142,
    logs: [], logsComplete: true,
  });
  assert.equal(windowed.verdict, "ZERO_OBSERVED");
  assert.equal(windowed.scope, "window");
  assert.equal(windowed.window, "50918945-51316142");
  assert.match(windowed.scope_caveat, /says nothing about any block before 50918945/);

  // The nonce-zero path reaches all the way back WITHOUT an index, because
  // it argues from monotonicity rather than from pages. That row is allowed
  // to claim all_time even though the log window was never read.
  const allTime = readDoorRail({
    rail: "eip155:8453", payTo: "0xbbb", fromBlock: 50918945, atBlock: 51316142,
    balance: 0n, nonce: 0,
  });
  assert.equal(allTime.verdict, "ZERO_OBSERVED");
  assert.equal(allTime.scope, "all_time");

  // Two zeroes, two different strengths. A reader that conflated them would
  // publish the windowed one as "never paid", which is the claim this whole
  // instrument refuses to make.
  assert.notEqual(windowed.scope, allTime.scope);

  // And a reading with no floor at all still says what it covered, rather
  // than leaving the scope to be assumed.
  const unbounded = readDoorRail({
    rail: "eip155:8453", payTo: "0xccc", atBlock: 51316142, logs: [], logsComplete: true,
  });
  assert.equal(unbounded.window, null);
  assert.equal(unbounded.scope, "all_time");
});

test("a door advertising a settlement scheme carries the residual that its zero is about where we looked", () => {
  // The SHAPE that made this residual exist: a complete window with no
  // direct transfers at all, at an address that holds a balance. Read
  // naively that is "nobody paid". It is not. The real door and its
  // real numbers are sealed until the blind-key reveal, so this fixture
  // is invented — the assertion is about the rule, not about that door.
  const batched = readDoorRail({
    rail: "eip155:8453", payTo: "0xffff", scheme: "batch-settlement",
    fromBlock: 1, atBlock: 9, logs: [], logsComplete: true,
    balance: 12345n,
  });
  assert.equal(batched.verdict, "ZERO_OBSERVED");
  assert.equal(batched.advertised_scheme, "batch-settlement");
  assert.match(batched.settlement_residual, /no DIRECT payment, never that the door was not paid/);

  // An `exact` door is not burdened with a caveat that does not apply
  // to it: a residual printed everywhere is a residual nobody reads.
  const plain = readDoorRail({
    rail: "eip155:8453", payTo: "0xaaaa", scheme: "exact",
    fromBlock: 1, atBlock: 9, logs: [], logsComplete: true,
  });
  assert.equal(plain.settlement_residual, undefined);
  assert.equal(plain.advertised_scheme, undefined);

  // And the caveat travels with a PAID row too. A batch door's direct
  // transfers are real, but its payer count is still not its buyers.
  const paidBatch = readDoorRail({
    rail: "eip155:8453", payTo: "0xeeee", scheme: "batch-settlement",
    fromBlock: 1, atBlock: 9, logsComplete: true,
    logs: [{ from: "0xF1", value: 1000n }],
  });
  assert.equal(paidBatch.verdict, "PAID");
  assert.ok(paidBatch.settlement_residual);

  // The EIP-3009 residual is on every row regardless; the two are
  // different gaps and neither substitutes for the other.
  for (const row of [batched, plain, paidBatch]) assert.ok(row.residual);
});
