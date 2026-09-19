import assert from "node:assert/strict";
import test from "node:test";
import {
  windowTrustworthy,
  PAID_RESIDUAL,
  readDoor,
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
  // UNTIL 2026-09-15 THIS ASSERTED ZERO_OBSERVED, and that assertion was
  // the bug: the residual said the zero was a fact about where we looked
  // and the verdict said ZERO_OBSERVED anyway, with the caveat printed
  // beside it. A caveat beside a verdict gets quoted without the caveat.
  assert.equal(batched.verdict, "UNKNOWN");
  assert.match(batched.established_by, /a fact about where this instrument looked, not about the door/);
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

test("a door's verdict is computed from every rail, never picked from one", () => {
  // StillOS Notary's rule, 2026-09-15: ZERO_OBSERVED requires every
  // advertised rail to resolve empty; any rail out of reach makes the
  // door UNKNOWN.
  const zero = { verdict: "ZERO_OBSERVED" };
  const unknown = { verdict: "UNKNOWN" };
  const paid = { verdict: "PAID" };

  // One unreadable rail collapses a zero, because a zero is a claim
  // about every way money could have arrived.
  const collapsed = readDoor({ name: "two rails", rails: [zero, unknown] });
  assert.equal(collapsed.verdict, "UNKNOWN");
  assert.match(collapsed.established_by, /a zero is a claim about every way money could have arrived/);

  // Every rail empty, and only then.
  assert.equal(readDoor({ name: "all read", rails: [zero, zero] }).verdict, "ZERO_OBSERVED");

  // PAID is monotone: an observed settlement cannot be undone by a rail
  // we failed to read, so it survives where a zero does not.
  assert.equal(readDoor({ name: "one paid", rails: [paid, unknown] }).verdict, "PAID");
  assert.equal(readDoor({ name: "paid + zero", rails: [paid, zero] }).verdict, "PAID");

  // No rails is not a clean door.
  assert.equal(readDoor({ name: "none", rails: [] }).verdict, "UNKNOWN");

  // The rule travels with the reading rather than living in our prose.
  for (const row of [collapsed, readDoor({ rails: [paid] })]) {
    assert.match(row.rule, /any rail out of reach makes the door UNKNOWN/);
    assert.ok(Array.isArray(row.rail_verdicts));
  }
});

test("the settlement-scheme door and the door rule agree with each other", () => {
  // End to end: the rail reading refuses the zero, and the door rule
  // then refuses it too. Two independent places, one answer — which is
  // what stops a future edit quietly restoring the old verdict.
  const rail = readDoorRail({
    rail: "eip155:8453", payTo: "0xffff", scheme: "batch-settlement",
    fromBlock: 1, atBlock: 9, logs: [], logsComplete: true, balance: 12345n,
  });
  assert.equal(rail.verdict, "UNKNOWN");
  assert.equal(readDoor({ name: "batch door", rails: [rail] }).verdict, "UNKNOWN");
});

test("two independent reasons for one zero report the stronger scope", () => {
  // A complete empty window and the nonce argument both settle a zero,
  // and they do not settle the same zero: the window covers the window,
  // the nonce argument covers all of history. Reporting the weaker one
  // because its branch ran first under-claims a fact we can prove.
  const both = readDoorRail({
    rail: "eip155:8453", payTo: "0xaaa", fromBlock: 50918945, atBlock: 51316142,
    logs: [], logsComplete: true, balance: 0n, nonce: 0,
  });
  assert.equal(both.verdict, "ZERO_OBSERVED");
  assert.equal(both.scope, "all_time");
  assert.equal(both.scope_caveat, null);
  assert.match(both.established_by, /not only inside the window/);
  assert.ok(both.established_twice);

  // Without the nonce argument the same empty window is still only a
  // windowed zero, and says so.
  const windowOnly = readDoorRail({
    rail: "eip155:8453", payTo: "0xbbb", fromBlock: 50918945, atBlock: 51316142,
    logs: [], logsComplete: true, balance: 0n, nonce: 7,
  });
  assert.equal(windowOnly.scope, "window");
  assert.match(windowOnly.scope_caveat, /this address has moved funds out at some point/);
  assert.equal(windowOnly.established_twice, undefined);

  // And a door is only as strong as its rails: an all-time zero on the
  // one rail read still cannot carry a door with a rail out of reach.
  const outOfReach = readDoorRail({ rail: "xrpl:0", payTo: null, atBlock: 51316142 });
  assert.equal(readDoor({ name: "two rails", rails: [both, outOfReach] }).verdict, "UNKNOWN");
});

test("a state-only zero on an out-of-reach scheme is UNKNOWN for the scheme, and the row says so", () => {
  // Found on the 43 Arbitrum doors, 2026-09-17: nonce 0, balance 0,
  // scheme exact-prepay-proof. The verdict was right and the sentence
  // beside it named a non-zero transaction count that did not exist.
  const row = readDoorRail({ rail: "eip155:42161", payTo: "0x" + "ab".repeat(20), atBlock: 1, scheme: "exact-prepay-proof", balance: 0n, nonce: 0 });
  assert.equal(row.verdict, "UNKNOWN");
  assert.match(row.established_by, /exact-prepay-proof/);
  assert.match(row.established_by, /transaction count of zero/);
  assert.doesNotMatch(row.established_by, /non-zero transaction count/);
  // And the same state on an in-reach scheme is the all-time zero it looks like.
  const clean = readDoorRail({ rail: "eip155:42161", payTo: "0x" + "ab".repeat(20), atBlock: 1, scheme: "exact", balance: 0n, nonce: 0 });
  assert.equal(clean.verdict, "ZERO_OBSERVED");
  assert.equal(clean.scope, "all_time");
});

test("an empty window is not a zero until a horizon canary says the range is served", () => {
  // StillOS Notary, 2026-09-19: a provider pruning logs past a horizon
  // answers an EMPTY ARRAY, not an error. Nothing throws, so no retry
  // and no catch sees it, and it is byte-identical to an unpaid door.
  const served = windowTrustworthy({ logs: [], canary: { served: true, probed: "100-199", saw: 9730 } });
  assert.equal(served.trustworthy, true);
  assert.equal(served.canary_needed, true);

  const pruned = windowTrustworthy({ logs: [], canary: { served: false, probed: "100-199", saw: 0 } });
  assert.equal(pruned.trustworthy, false);
  assert.match(pruned.because, /never that quiet/);
  assert.match(pruned.because, /not serving this range/);

  // No canary at all is NOT a pass. An instrument that skipped the
  // check must not report the same thing as one that ran it.
  const unchecked = windowTrustworthy({ logs: [], canary: null });
  assert.equal(unchecked.trustworthy, false);
  assert.match(unchecked.because, /no horizon canary was run/);

  // A window that found transfers needs no canary: it is self-evidently served.
  const found = windowTrustworthy({ logs: [{ from: "0xa", value: 1n }], canary: null });
  assert.equal(found.trustworthy, true);
  assert.equal(found.canary_needed, false);
});

test("an untrustworthy window reaches the verdict as UNKNOWN, never as a zero", () => {
  // The rule above only matters if it lands on the verdict. logsComplete
  // false is how the CLI carries it, and a zero off it is refused.
  const row = readDoorRail({
    rail: "eip155:8453", payTo: "0x" + "cd".repeat(20), atBlock: 51316142, fromBlock: 51314142,
    logs: [], logsComplete: false,
  });
  assert.equal(row.verdict, "UNKNOWN");
  assert.doesNotMatch(String(row.established_by), /ZERO_OBSERVED/);
});
