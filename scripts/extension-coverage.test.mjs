import assert from "node:assert/strict";
import { test } from "node:test";
import { COVERAGE, READ_STATES, parseExtension, reconcile, renderMatrix } from "./lib/extension-coverage.mjs";

const tagged = `# Extension: \`bazaar\`

## Summary

The \`bazaar\` extension enables **resource discovery** for x402 endpoints.

## Fields
`;

const untagged = `# Offer and Receipt Extension

**1. Overview**

The Offer and Receipt Extension adds **server-side signatures** to x402.
`;

test("an id comes from the spec's own backticked heading, never from prose", () => {
  const e = parseExtension(tagged, "specs/extensions/bazaar.md");
  assert.equal(e.id, "bazaar");
  assert.equal(e.file, "bazaar.md");
  assert.match(e.summary, /resource discovery/);
});

test("the second heading convention parses too, which an empty cell is how we found", () => {
  const e = parseExtension(untagged, "specs/extensions/extension-offer-and-receipt.md");
  assert.equal(e.id, "extension-offer-and-receipt", "no backticked id, so the filename is the id");
  assert.equal(e.heading, "Offer and Receipt Extension");
  assert.match(e.summary, /server-side signatures/);
  assert.ok(!e.summary.startsWith("**1."), "the numbered overview marker is not the summary");
});

test("AN UNCLASSIFIED EXTENSION FAILS — this is the whole point of generating it", () => {
  const found = [{ id: "bazaar" }, { id: "brand-new-thing" }];
  const { unclassified, ok } = reconcile(found, { bazaar: { reads: "full" } });
  assert.deepEqual(unclassified, ["brand-new-thing"]);
  assert.equal(ok, false, "a new extension is an unmade decision and must stop the run");
});

test("a coverage row for an extension the spec dropped is also caught", () => {
  const { stale, ok } = reconcile([{ id: "bazaar" }], { bazaar: { reads: "full" }, ghost: { reads: "none" } });
  assert.deepEqual(stale, ["ghost"]);
  assert.equal(ok, false);
});

test("the shipped coverage classifies every row honestly", () => {
  for (const [id, row] of Object.entries(COVERAGE)) {
    assert.ok(READ_STATES.includes(row.reads), `${id} has an unknown reads state`);
    assert.ok(row.note && row.note.length > 40, `${id}'s note is too thin`);
    if (row.reads === "none") {
      assert.ok(row.cost, `${id} is unread and does not say what reading would cost`);
      assert.equal(row.where, null, `${id} claims a location while reading nothing`);
    } else {
      assert.ok(row.where, `${id} claims to be read and names no file`);
    }
  }
});

test("the matrix counts what it found and refuses to imply completeness", () => {
  const md = renderMatrix(
    [
      { id: "bazaar", summary: "discovery", file: "bazaar.md" },
      { id: "payment-identifier", summary: "idempotency key", file: "payment_identifier.md" },
    ],
    { bazaar: { reads: "full", where: "src/x.ts", note: "n".repeat(50) }, "payment-identifier": { reads: "none", where: null, note: "n".repeat(50), cost: "Low" } },
    "2026-09-14",
  );
  assert.match(md, /2 extensions published: \*\*1 read in full\*\*/);
  assert.match(md, /Do not hand-edit/);
  assert.match(md, /What this matrix does not say/);
  assert.match(md, /`full` means complete/);
  assert.match(md, /Anything about adoption/);
});

test("an unclassified row renders loudly rather than blank", () => {
  const md = renderMatrix([{ id: "surprise", summary: "s", file: "s.md" }], {}, "2026-09-14");
  assert.match(md, /\*\*UNCLASSIFIED\*\*/);
});
