import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MAX_SCOPE_DAYS,
  applyRulings,
  coversRow,
  isLive,
  loadRulings,
  openProposals,
  renderRulings,
  validateRuling,
} from "./lib/rulings.mjs";
import { buildReport, renderMarkdown } from "./lib/protocol-screen.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const shipped = loadRulings(
  readFileSync(join(HERE, "..", "research", "protocol-screen", "rulings.json"), "utf8"),
);

const row = (over = {}) => ({
  id: "r1", protocol: "Tempo TIPs", band: "act", title: "TIP-1096",
  files: ["tips/tip-1096.md"], surfaces: ["tempo-rail-watch"], ...over,
});

test("the shipped ledger is valid, and every ruling carries a re-examinable reason", () => {
  assert.ok(shipped.length >= 7);
  for (const r of shipped) {
    assert.deepEqual(validateRuling(r), [], `${r.id} is invalid`);
    assert.ok(r.reason.length > 40, `${r.id}'s reason is too thin to re-examine`);
  }
});

test("a scope ruling without an end date is refused", () => {
  const forever = { id: "x", state: "noted", reason: "because we said so, at length and with feeling", ruled_on: "2026-09-14", scope: { protocol: "x402" } };
  assert.match(validateRuling(forever).join(" "), /must carry covers_until/);

  const tooLong = { ...forever, covers_until: "2030-01-01" };
  assert.match(validateRuling(tooLong).join(" "), new RegExp(`more than ${MAX_SCOPE_DAYS} days`));
});

test("`noted` must name what it covers; a proposal need not", () => {
  const base = { id: "x", reason: "a reason long enough to be re-examined by a stranger", ruled_on: "2026-09-14" };
  assert.match(validateRuling({ ...base, state: "noted" }).join(" "), /must name what it covers/);
  assert.deepEqual(validateRuling({ ...base, state: "proposed" }), [], "a proposal is a record and covers nothing yet");
  assert.deepEqual(validateRuling({ ...base, state: "done" }), []);
});

test("a ruling with no reason is refused, because it could only be obeyed", () => {
  const mute = { id: "x", state: "done", ruled_on: "2026-09-14" };
  assert.match(validateRuling(mute).join(" "), /no reason/);
});

test("a scope is a conjunction — every facet it names must match", () => {
  const r = { id: "s", state: "noted", reason: "x".repeat(50), ruled_on: "2026-09-14", covers_until: "2026-12-01", scope: { protocol: "x402", pathPrefix: "specs/schemes/" } };
  assert.equal(coversRow(r, row({ protocol: "x402", files: ["specs/schemes/a.md"] })), true);
  assert.equal(coversRow(r, row({ protocol: "x402", files: ["go/http/a.go"] })), false, "right protocol, wrong path");
  assert.equal(coversRow(r, row({ protocol: "MPP", files: ["specs/schemes/a.md"] })), false, "right path, wrong protocol");
});

test("a row-id ruling covers that row and never lapses", () => {
  const r = { id: "one", state: "done", reason: "x".repeat(50), ruled_on: "2026-09-14", rows: ["x402:abc"] };
  assert.equal(coversRow(r, row({ id: "x402:abc" })), true);
  assert.equal(coversRow(r, row({ id: "x402:def" })), false);
  assert.equal(isLive(r, "2030-01-01"), true, "a merged commit cannot change, so a judgement about it cannot go stale");
});

test("rows are scored first and filed second — a ruling never changes a band", () => {
  const rows = [row({ band: "act" })];
  const { settled, fresh } = applyRulings(rows, shipped, "2026-09-14");
  assert.equal(fresh.length, 0);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].band, "act", "the band it earned survives being filed under a ruling");
  assert.equal(settled[0].ruling, "R3-tempo-not-our-rail");
});

test("a lapsed ruling stops covering, and its rows come back", () => {
  const rows = [row()];
  const before = applyRulings(rows, shipped, "2026-12-30");
  assert.equal(before.settled.length, 1);

  const after = applyRulings(rows, shipped, "2027-01-02");
  assert.equal(after.settled.length, 0, "the expiry is the guard against a screen that stops seeing");
  assert.equal(after.fresh.length, 1);
  assert.deepEqual(after.lapsed.map((r) => r.id), ["R3-tempo-not-our-rail"]);
});

test("open proposals are reported oldest first, with their age", () => {
  /*
   * Deliberately not pinned to a count. The ledger is live: closing a
   * proposal is the system working, and a test that fails when a
   * decision gets made teaches the next person to stop making them.
   * The mechanism is what is asserted.
   */
  const ledger = [
    { id: "old", state: "proposed", reason: "x".repeat(50), ruled_on: "2026-06-01" },
    { id: "new", state: "proposed", reason: "x".repeat(50), ruled_on: "2026-09-01" },
    { id: "shipped", state: "done", reason: "x".repeat(50), ruled_on: "2026-06-01" },
  ];
  const open = openProposals(ledger, "2026-10-01");
  assert.deepEqual(open.map((p) => p.id), ["old", "new"], "oldest first, and a done ruling is not open");
  assert.equal(open[0].ageDays, 122);
  assert.equal(open[1].ageDays, 30);

  // And the shipped ledger stays loadable and internally consistent.
  for (const p of openProposals(shipped, "2026-10-14")) {
    assert.ok(p.ageDays >= 0, `${p.id} is dated in the future`);
  }
});

test("the rendered ledger says settled rows were answered, not hidden", () => {
  const md = renderRulings({
    settled: [{ ...row(), ruling: "R3-tempo-not-our-rail", rulingReason: "we do not settle on Tempo", rulingState: "noted" }],
    lapsed: [],
    proposals: openProposals(shipped, "2026-09-21"),
  });
  assert.match(md, /Already ruled on \(1\)/);
  assert.match(md, /Not hidden — answered/);
  assert.match(md, /we do not settle on Tempo/);

  const open = openProposals(shipped, "2026-09-21");
  assert.match(md, new RegExp(`Still open \\(${open.length}\\)`));
  for (const p of open) assert.ok(md.includes(p.id), `${p.id} is open and unreported`);
});

test("a lapsed ruling is named in the report and asks to be renewed", () => {
  const md = renderRulings({ settled: [], lapsed: [shipped.find((r) => r.id === "R3-tempo-not-our-rail")], proposals: [] });
  assert.match(md, /Lapsed rulings \(1\)/);
  assert.match(md, /renew or let their rows come back/);
  assert.match(md, /would not re-make is not a decision/);
});

test("the screen reports how much of the window a ruling answered", () => {
  const data = {
    "Tempo TIPs": {
      name: "Tempo TIPs", maintainers: "Tempo", repo: "u", launchDate: "2026-03-18", source: "git",
      updates: [{ id: "t1", date: "2026-09-12", title: "docs(tips): approve TIP-1100", description: "", impact: "", breaking: false, level: "patch", author: "a", files: ["tips/tip-1100.md"], specChange: true, derived: true, prNumber: 7485, prUrl: "u/pull/7485" }],
    },
  };
  const report = buildReport({ protocolData: data, today: "2026-09-14", firstRunDays: 30, rulings: shipped });
  assert.equal(report.settled.length, 1);
  assert.equal(report.act.length, 0, "a ruled row does not sit in ACT");
  const md = renderMarkdown(report);
  assert.match(md, /fell under a standing ruling/);
  assert.match(md, /R3-tempo-not-our-rail/);
});
