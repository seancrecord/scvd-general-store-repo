import assert from "node:assert/strict";
import { test } from "node:test";
import { mdCell, mdCellTrunc } from "./lib/md.mjs";
import { renderMarkdown, buildReport } from "./lib/protocol-screen.mjs";

/**
 * How many cells a rendered row actually has.
 *
 * Written as a scanner rather than a split on `(?<!\\)\|`, because that
 * regex has the SAME defect as the code under test: a one-character
 * lookbehind cannot tell `\\|` — an escaped backslash followed by a
 * live delimiter — from `\|`, an escaped delimiter. The first version
 * of this helper had exactly that bug and scored the broken row as
 * correct.
 */
function cells(row) {
  const inner = row.replace(/^\||\|$/g, "");
  let n = 1;
  let escaped = false;
  for (const ch of inner) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "|") n += 1;
  }
  return n;
}

test("REPRODUCES THE CODEQL FINDING: escaping the delimiter alone is defeated by a backslash", () => {
  // The original: title.replace(/\|/g, "\\|") — pipes escaped, backslashes not.
  const broken = (s) => s.replace(/\|/g, "\\|");
  const hostile = String.raw`fix: handle \| in the parser`;

  const brokenRow = `| a | ${broken(hostile)} |`;
  assert.equal(cells(brokenRow), 3, "the old escaping leaks a third cell — the row breaks");

  const fixedRow = `| a | ${mdCell(hostile)} |`;
  assert.equal(cells(fixedRow), 2, "escaping the escape character first holds the row to two cells");
});

test("a backslash is escaped before the pipe, never after", () => {
  assert.equal(mdCell(String.raw`a\b`), String.raw`a\\b`);
  assert.equal(mdCell("a|b"), String.raw`a\|b`);
  assert.equal(mdCell(String.raw`a\|b`), String.raw`a\\\|b`);
  // Reversing the order would double-escape what the first pass added.
  assert.ok(!mdCell("a|b").includes("\\\\"), "the pipe's own escape must not be escaped again");
});

test("a newline cannot end a row early and swallow the rest", () => {
  assert.equal(mdCell("first line\nsecond line"), "first line second line");
  assert.equal(mdCell("trailing\r\n  indented"), "trailing indented");
  assert.ok(!mdCell("a\nb").includes("\n"));
});

test("null, undefined and numbers survive being cells", () => {
  assert.equal(mdCell(null), "");
  assert.equal(mdCell(undefined), "");
  assert.equal(mdCell(42), "42");
});

test("truncation counts the escaped string, and marks the cut", () => {
  assert.equal(mdCellTrunc("abcdef", 4), "abc…");
  assert.equal(mdCellTrunc("abc", 10), "abc");
  assert.ok(mdCellTrunc(String.raw`x\|`.repeat(50), 20).length <= 20);
});

test("a hostile commit subject cannot break the screen's own table", () => {
  const data = {
    x402: {
      name: "x402", maintainers: "x402 Foundation", repo: "u", launchDate: "2026-04-02", source: "git",
      updates: [{
        id: "x402:abc", date: "2026-09-12",
        title: String.raw`feat: accept \| and | in offers`,
        description: "", impact: "", breaking: false, level: "minor", author: "a",
        files: ["specs/schemes/exact/scheme_exact.md"], specChange: true, derived: true,
        prNumber: 1, prUrl: "u/pull/1",
      }],
    },
  };
  const md = renderMarkdown(buildReport({ protocolData: data, today: "2026-09-14", firstRunDays: 30 }));
  const row = md.split("\n").find((l) => l.includes("accept"));
  assert.ok(row, "the row rendered");
  assert.equal(cells(row), 5, "five columns, whatever the upstream subject contains");
});
