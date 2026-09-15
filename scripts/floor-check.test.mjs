import assert from "node:assert/strict";
import test from "node:test";
import { readDoorRail } from "./lib/paid-doors.mjs";
import {
  BALANCE_RESIDUAL, FLOOR_VERDICTS, compareToFloor, tally,
} from "./lib/floor-check.mjs";

const paid = readDoorRail({ rail: "eip155:8453", payTo: "0xaaa", atBlock: 9, balance: 20343138n, nonce: 3 });
const zeroAllTime = readDoorRail({ rail: "eip155:8453", payTo: "0xbbb", atBlock: 9, balance: 0n, nonce: 0 });
const unknown = readDoorRail({ rail: "eip155:8453", payTo: "0xccc", atBlock: 9, balance: 0n, nonce: 4 });

test("a count that declares itself a floor is not contradicted by a chain reading past it", () => {
  // This is the whole point of the file. x402-list prints "a measured
  // floor, not an estimate", so finding more settlement than they
  // counted is their claim working, not their claim failing.
  const row = compareToFloor({ claimZero: true, claimKind: "floor", reading: paid });
  assert.equal(row.verdict, "BEYOND_FLOOR");
  assert.match(row.established_by, /CONSISTENT with the claim and is not an error in it/);

  // The SAME chain reading against a count that claimed no such thing
  // is a disagreement. The difference is entirely in what was claimed.
  const unqualified = compareToFloor({ claimZero: true, claimKind: "unstated", reading: paid });
  assert.equal(unqualified.verdict, "EXCEEDS_CLAIM");
  assert.notEqual(row.verdict, unqualified.verdict);
});

test("agreement records HOW STRONG it is: an all-time zero is not a windowed one", () => {
  const strong = compareToFloor({ claimZero: true, claimKind: "floor", reading: zeroAllTime });
  assert.equal(strong.verdict, "AGREES");
  assert.equal(strong.strength, "all_time");
  assert.match(strong.established_by, /zero at this height is zero at every height before it/);

  const windowed = compareToFloor({
    claimZero: true, claimKind: "floor",
    reading: readDoorRail({ rail: "eip155:8453", payTo: "0xddd", fromBlock: 1, atBlock: 9, logs: [], logsComplete: true }),
  });
  assert.equal(windowed.verdict, "AGREES");
  assert.equal(windowed.strength, "window");
});

test("it refuses to speak where it has nothing: no reading, and no zero claim", () => {
  assert.equal(compareToFloor({ claimZero: true, claimKind: "floor", reading: unknown }).verdict, "NOT_ESTABLISHED");
  assert.equal(compareToFloor({ claimZero: true, claimKind: "floor", reading: null }).verdict, "NOT_ESTABLISHED");
  // A directory that already reports settlement is not this instrument's
  // business. Comparing there would need their per-transaction set.
  const notZero = compareToFloor({ claimZero: false, claimKind: "floor", reading: paid });
  assert.equal(notZero.verdict, "NOT_ESTABLISHED");
  assert.match(notZero.established_by, /no floor here to stand a chain reading against/);
});

test("every row carries what a balance cannot tell you, and only four verdicts exist", () => {
  const rows = [
    compareToFloor({ claimZero: true, claimKind: "floor", reading: paid }),
    compareToFloor({ claimZero: true, claimKind: "floor", reading: zeroAllTime }),
    compareToFloor({ claimZero: true, claimKind: "unstated", reading: paid }),
    compareToFloor({ claimZero: true, claimKind: "floor", reading: unknown }),
  ];
  for (const row of rows) {
    assert.equal(row.residual, BALANCE_RESIDUAL);
    assert.ok(FLOOR_VERDICTS.includes(row.verdict), `${row.verdict} is not one of the four`);
    assert.ok(row.established_by);
  }
  assert.match(BALANCE_RESIDUAL, /never as demand for a product/);
});

test("the tally counts addresses, says so, and publishes no share", () => {
  const rows = [
    compareToFloor({ claimZero: true, claimKind: "floor", reading: paid }),
    compareToFloor({ claimZero: true, claimKind: "floor", reading: zeroAllTime }),
    compareToFloor({ claimZero: true, claimKind: "floor", reading: unknown }),
  ];
  const t = tally(rows);
  assert.equal(t.addresses_read, 3);
  assert.equal(t.beyond_floor, 1);
  assert.equal(t.agrees, 1);
  assert.equal(t.agrees_all_time, 1);
  assert.equal(t.not_established, 1);
  // Rule 43 and the house sentence: a quotient with no derivation is
  // a verdict without its denominator, so none is served.
  const asText = JSON.stringify(t);
  assert.ok(!/percent|share|rate|ratio/i.test(asText), "the tally must not serve a share");
  assert.match(t.denominator_note, /addresses and not doors/);
});
