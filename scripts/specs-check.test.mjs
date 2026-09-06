import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTS,
  REGISTER_STARTED,
  REVIEW_EVERY_DAYS,
  factById,
  overdue,
  readWatch,
} from "./lib/spec-watch.mjs";

const at = (day) => new Date(`${day}T00:00:00Z`);

test("every fact names what it is, where to read it, and what breaks when it moves", () => {
  assert.ok(FACTS.length > 0);
  const ids = FACTS.map((entry) => entry.id);
  // A duplicate id would make --review ambiguous and silently mark the wrong row.
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of FACTS) {
    assert.match(entry.id, /^[a-z0-9-]+$/, `${entry.id} is not a slug`);
    assert.ok(entry.protocol, `${entry.id} has no protocol`);
    assert.ok(entry.fact.length > 30, `${entry.id}'s fact is too thin to check against`);
    assert.match(entry.source, /^https:\/\//, `${entry.id} has no primary source`);
    // The rule the register is built on: a row nobody can say what
    // breaks for is a row that does not belong here.
    assert.ok(entry.depends.length > 10, `${entry.id} does not say what breaks`);
    // A caveat is optional, but an empty one is worse than none: it
    // shows the flag and says nothing.
    if ("caveat" in entry) assert.ok(entry.caveat.length > 40, `${entry.id} has a caveat that says nothing`);
  }
});

test("a row's own doubt travels with it into the reading", () => {
  const rows = readWatch(null, at(REGISTER_STARTED));
  const flagged = rows.filter((row) => row.caveat);
  // The x402 rows were wrong on the register's first day — the spec had
  // already moved to the foundation — and the row that records that is
  // the register's own evidence that it needs re-reading, not proof it
  // is trustworthy.
  assert.ok(flagged.length > 0);
  assert.match(rows.find((row) => row.id === "x402-wire").caveat, /foundation/i);
  assert.equal(rows.find((row) => row.id === "mcp-revisions").caveat, null);
});

test("a fact never read counts from the register's opening, and is not backdated to look green", () => {
  const rows = readWatch(null, at(REGISTER_STARTED));
  const unread = rows.find((row) => row.id === "mcp-revisions");
  assert.equal(unread.last_read, null);
  assert.equal(unread.counted_from, "register");
  assert.equal(unread.days, 0);
  assert.equal(unread.overdue, false);
});

test("a fact read at adoption counts from its own read", () => {
  const rows = readWatch(null, at("2026-09-20"));
  const read = rows.find((row) => row.id === "openai-plugins");
  assert.equal(read.last_read, "2026-09-06");
  assert.equal(read.counted_from, "read");
  assert.equal(read.days, 14);
});

test("the watch goes red once anything passes the window, oldest first", () => {
  const justInside = readWatch(null, at("2026-12-04"));
  assert.deepEqual(overdue(justInside), []);

  /*
   * 90 days after the register opened, EVERY row is due at once — the
   * five read at adoption were read on the register's own opening day,
   * so they share its clock exactly. That is a real property of a
   * register seeded in one sitting, not a bug: the first re-read pass
   * is one pass, and after it the dates spread out on their own.
   */
  const past = readWatch(null, at("2026-12-05"));
  const late = overdue(past);
  assert.equal(late.length, FACTS.length);
  assert.ok(late.every((row) => row.days >= REVIEW_EVERY_DAYS));
  // Oldest first, so the report opens with the worst.
  for (let i = 1; i < late.length; i += 1) assert.ok(late[i - 1].days >= late[i].days);
});

test("a recorded review resets one fact's clock and touches no other", () => {
  const record = { reviewed_at: { "mcp-revisions": "2026-12-01T09:00:00.000Z" } };
  const rows = readWatch(record, at("2026-12-05"));
  const moved = rows.find((row) => row.id === "mcp-revisions");
  assert.equal(moved.days, 4);
  assert.equal(moved.overdue, false);
  assert.equal(moved.counted_from, "read");
  // Its neighbour is untouched and still overdue.
  assert.equal(rows.find((row) => row.id === "mcp-apps-ui").overdue, true);
});

test("a review of an unknown fact is refused rather than written", () => {
  assert.equal(factById("x402-wire").protocol, "x402");
  assert.equal(factById("no-such-fact"), null);
});
