import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { entryProblems, renderMarkdown, renderWatched, watchedRows } from "./lib/scorers-outreach.mjs";

const register = JSON.parse(readFileSync(new URL("../registry/scorers-outreach.json", import.meta.url), "utf8"));

test("every entry carries the eight fields, complete", () => {
  assert.ok(Array.isArray(register.systems));
  assert.ok(register.systems.length > 0);
  for (const entry of register.systems) {
    assert.deepEqual(entryProblems(entry), [], `${entry?.name}: ${entryProblems(entry).join("; ")}`);
  }
});

test("the register is alphabetical by name, never a priority order", () => {
  const names = register.systems.map((s) => s.name.toLowerCase());
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(names, sorted);
});

test("no system is entered twice", () => {
  const urls = register.systems.map((s) => s.url);
  assert.equal(new Set(urls).size, urls.length);
});

test("the seeded date is a date", () => {
  assert.match(register.seeded, /^\d{4}-\d{2}-\d{2}$/);
});

test("the table and the JSON agree", () => {
  const table = readFileSync(new URL("../registry/scorers-outreach.md", import.meta.url), "utf8");
  assert.equal(table, renderMarkdown(register));
});

test("the edge's watched file agrees with the register, and carries only written-to rows", () => {
  const watched = readFileSync(new URL("../src/store/watched-pages.json", import.meta.url), "utf8");
  assert.equal(watched, renderWatched(register));
  const rows = watchedRows(register);
  for (const row of rows) {
    const source = register.systems.find((entry) => entry.url === row.url);
    assert.ok(source.note_sent !== null || source.cites_since !== null, `${row.name} is watched but was never written to`);
    assert.deepEqual(Object.keys(row), ["name", "url", "note_sent", "cites_since"]);
  }
  // The whole point: the research does not ride to the edge.
  assert.ok(watched.length < 4000, "the watched file is small by construction; if it is not, the filter broke");
});
