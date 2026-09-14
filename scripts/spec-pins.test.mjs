import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  PINS,
  checkPin,
  digestOf,
  lockEntry,
  renderReport,
  summarise,
  treeLines,
} from "./lib/spec-pins.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(HERE, "..", "test", "fixtures", "spec-pins", "replay.json"), "utf8"));

const lockFrom = (lines, read_date) => lockEntry({ read_date }, lines);

/* ------------------------------------------------------------------ *
 * The two defects of 2026-09-14, replayed against real git trees.
 * These are the instrument's whole reason for existing: if either
 * stops firing, it has stopped doing the job it was built for.
 * ------------------------------------------------------------------ */

test("REPLAY P1: the scheme advisory's drift is caught, pinned at the date its reasoning was written", () => {
  const pin = { id: "x402-scheme-families", source: "x402", paths: ["specs/schemes/"] };
  const locked = lockFrom(fx.x402_schemes_2026_08_03.lines, "2026-08-03");
  const result = checkPin(pin, fx.x402_schemes_head.lines, locked);

  assert.equal(result.state, "drifted");
  assert.equal(locked.files, 24, "24 scheme files on 2026-08-03");
  assert.equal(result.files, 26, "26 by the time anyone looked again");

  // The families our advisory was calling vendor drift are named as moved.
  const moved = [...(result.changed ?? []), ...(result.added ?? [])].join(" ");
  assert.match(moved, /auth-capture/);
  assert.match(moved, /upto/);
  assert.match(moved, /batch-settlement/);

  // Six weeks of a public instrument accusing doors, visible on the
  // first weekly run after the pin.
  assert.ok((result.changed ?? []).length + (result.added ?? []).length >= 5);
});

test("REPLAY P2: a cited path that stopped existing reads `missing`, not `ok`", () => {
  const pin = { id: "mpp-core-draft-00", source: "mpp", paths: ["specs/core/draft-httpauth-payment-00.md"] };
  const locked = lockFrom(fx.mpp_core00_2026_09_03.lines, "2026-09-03");

  assert.equal(locked.files, 1, "the draft was there when the eleven classes cited it");
  assert.equal(fx.mpp_core00_head.lines.length, 0, "and gone by the time we looked");

  const result = checkPin(pin, fx.mpp_core00_head.lines, locked);
  assert.equal(result.state, "missing");
  assert.match(result.detail, /no longer exists/);
});

test("the directory-level pin catches the same rename, and says what replaced it", () => {
  // Pinning specs/core/ rather than the file trades `missing` for a
  // `drifted` that names both halves of the rename — usually the more
  // useful report, which is why the shipped pin is the directory.
  const pin = { id: "mpp-core-draft", source: "mpp", paths: ["specs/core/"] };
  const locked = lockFrom(fx.mpp_core00_2026_09_03.lines, "2026-09-03");
  const result = checkPin(pin, fx.mpp_core_dir_head.lines, locked);

  assert.equal(result.state, "drifted");
  assert.ok(result.removed.some((p) => p.endsWith("draft-httpauth-payment-00.md")));
  assert.ok(result.added.some((p) => p.endsWith("draft-httpauth-payment-01.md")));
});

/* ------------------------------------------------------------------ *
 * Mechanics
 * ------------------------------------------------------------------ */

test("an unchanged tree is ok, and the digest is order-independent", () => {
  const lines = fx.x402_schemes_head.lines;
  const locked = lockFrom(lines, "2026-09-14");
  assert.equal(checkPin({ paths: ["specs/schemes/"] }, lines, locked).state, "ok");
  assert.equal(digestOf([...lines].reverse().sort()), digestOf(lines));
});

test("one changed blob moves the digest, even with the file list identical", () => {
  const lines = fx.x402_schemes_head.lines;
  const tampered = [...lines];
  const [sha, path] = tampered[0].split(" ");
  tampered[0] = `${"0".repeat(sha.length)} ${path}`;
  assert.notEqual(digestOf(tampered), digestOf(lines));
  const result = checkPin({ paths: ["x"] }, tampered.sort(), lockFrom(lines, "2026-09-14"));
  assert.equal(result.state, "drifted");
  assert.deepEqual(result.changed, [path], "a content-only change reports as changed, not added plus removed");
});

test("a pin with no locked digest is unpinned, which is not a pass", () => {
  const result = checkPin({ paths: ["specs/"] }, fx.x402_schemes_head.lines, undefined);
  assert.equal(result.state, "unpinned");
  assert.equal(summarise([result]).clean, false, "unpinned must fail the run, or a new claim ships unwatched");
});

test("treeLines parses git's tab-separated ls-tree output and sorts it", () => {
  const raw = [
    "100644 blob bbbb2222\tspecs/b.md",
    "100644 blob aaaa1111\tspecs/a.md",
    "",
  ].join("\n");
  assert.deepEqual(treeLines("/ignored", ["specs/"], () => raw), [
    "aaaa1111 specs/a.md",
    "bbbb2222 specs/b.md",
  ]);
});

/* ------------------------------------------------------------------ *
 * The report's honesty
 * ------------------------------------------------------------------ */

test("every shipped pin names where the claim is written and what to do when it moves", () => {
  assert.ok(PINS.length >= 6);
  for (const pin of PINS) {
    assert.ok(pin.claim, `${pin.id} has no claim`);
    assert.ok(pin.cited_in, `${pin.id} does not say where it is written down`);
    assert.ok(pin.on_drift, `${pin.id} has no instruction for a human`);
    assert.ok(["x402", "mpp", "tempo"].includes(pin.source), `${pin.id} names an unknown source`);
  }
  assert.equal(new Set(PINS.map((p) => p.id)).size, PINS.length, "pin ids must be unique");
});

test("the report always states what a clean run does not prove", () => {
  const clean = renderReport([{ id: "x402-core-v2", state: "ok", detail: "unchanged since 2026-09-14", files: 1 }]);
  assert.match(clean, /What a clean run does not prove/);
  assert.match(clean, /never checks the claim against the source/);
  assert.match(clean, /rubber stamp/);
  assert.match(clean, /byte-identical/);
});

test("a drift report carries the claim, its home, and the instruction", () => {
  const md = renderReport([
    { id: "x402-scheme-families", state: "drifted", detail: "moved since 2026-08-03", files: 26, changed: ["specs/schemes/upto/scheme_upto.md"], added: [], removed: [] },
  ]);
  assert.match(md, /SPEC_SCHEMES lists exactly the scheme families/);
  assert.match(md, /src\/services\/preflight\.ts/);
  assert.match(md, /accusing doors that implement it/);
  assert.match(md, /scheme_upto\.md/);
});
