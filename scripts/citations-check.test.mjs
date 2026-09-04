import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { citationsOn, exitCodeFor, judge, judgeProspect } from "./lib/citations.mjs";

const BASE = "https://scvd.store";

test("a verify URL or a corpus URL on the page is a citation; the store's other pages are not", () => {
  const page = `<p>Row: <a href="${BASE}/api/verify/cert_k2m9v4xwqp">verify</a> and ${BASE}/corpus/host/door.example.json and ${BASE}/corpus/3.json</p><a href="${BASE}/menu/hello">shop</a>`;
  assert.deepEqual(citationsOn(page, BASE), [
    `${BASE}/api/verify/cert_k2m9v4xwqp`,
    `${BASE}/corpus/host/door.example.json`,
    `${BASE}/corpus/3.json`,
  ]);
  assert.deepEqual(citationsOn(`<a href="${BASE}/menu/hello">shop</a>`, BASE), []);
});

test("a page that still cites is cited; one that stopped is gone; one we could not read is unreadable and not a failure", () => {
  const system = { name: "Example Scores", cites_at: "https://scores.example/method", since: "2026-09-03" };
  assert.equal(judge(system, { status: 200, text: `see ${BASE}/api/verify/cert_abc` }).verdict, "cited");
  assert.equal(judge(system, { status: 200, text: "we score things" }).verdict, "gone");
  assert.equal(judge(system, { status: 503, text: "" }).verdict, "unreadable");
  assert.equal(judge(system, { error: "ECONNRESET" }).verdict, "unreadable");
  assert.equal(exitCodeFor([judge(system, { status: 200, text: "nothing" })]), 1);
  assert.equal(exitCodeFor([judge(system, { error: "down" })]), 0);
  assert.equal(exitCodeFor([]), 0);
});

test("the register the page renders is the register the check reads, and every entry is complete", () => {
  const register = JSON.parse(readFileSync(new URL("../src/store/citing-systems.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(register.systems));
  for (const entry of register.systems) {
    assert.equal(typeof entry.name, "string");
    assert.match(entry.cites_at, /^https:\/\//);
    assert.match(entry.since, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("a prospect that carries no row is silent, not gone, and never fails the run; one that does is cited", () => {
  const prospect = { name: "Example List", url: "https://list.example/us", noted: "2026-09-04" };
  assert.equal(judgeProspect(prospect, { status: 200, text: "a page about the store" }).verdict, "silent");
  assert.equal(judgeProspect(prospect, { status: 200, text: `row: ${BASE}/corpus/host/door.example.json` }).verdict, "cited");
  assert.equal(judgeProspect(prospect, { status: 404, text: "" }).verdict, "unreadable");
  assert.equal(exitCodeFor([judgeProspect(prospect, { status: 200, text: "nothing" })]), 0);
});

test("every noted prospect is complete, and none is a page this store operates", () => {
  const file = JSON.parse(readFileSync(new URL("../src/store/citation-prospects.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(file.prospects));
  for (const entry of file.prospects) {
    assert.equal(typeof entry.name, "string");
    assert.match(entry.url, /^https:\/\//);
    assert.doesNotMatch(new URL(entry.url).host, /(^|\.)scvd\.store$/);
    assert.match(entry.noted, /^\d{4}-\d{2}-\d{2}$/);
  }
});
