#!/usr/bin/env node
/**
 * THE CITATION CHECK RUNNER.
 *
 *   node scripts/citation-check.mjs            # check, exit 1 on drift
 *   node scripts/citation-check.mjs --update   # re-pin, AFTER reading the diff
 *   node scripts/citation-check.mjs --write    # also save a dated report
 *
 * `--update` is a human act. It records that somebody re-read the
 * source and stands behind the claim again. Running it to clear a red
 * check without reading anything is the one use that makes this
 * instrument worse than not having it.
 *
 * Read-only against the network, writes only the lock and its report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYER3 } from "./lib/git-source.mjs";
import { PINS, checkPin, cloneAtHead, lockEntry, renderReport, summarise, treeLines } from "./lib/citations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(ROOT, "research", "protocol-screen");
const LOCK = join(HOME, "citations.lock.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const write = args.includes("--write");
const cacheDir = (args.find((a) => a.startsWith("--cache=")) ?? "").split("=")[1] || join(tmpdir(), "citation-check-cache");
const today = new Date().toISOString().slice(0, 10);

const sources = new Map(LAYER3.map((s) => [s.key, s]));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : { pins: {} };

const clones = new Map();
function cloneFor(key) {
  if (clones.has(key)) return clones.get(key);
  const source = sources.get(key);
  if (!source) throw new Error(`citation-check: pin names unknown source "${key}"`);
  const dir = cloneAtHead(source.url, join(cacheDir, key));
  clones.set(key, dir);
  return dir;
}

const results = [];
const nextPins = {};
for (const pin of PINS) {
  let lines = [];
  try {
    lines = treeLines(cloneFor(pin.source), pin.paths);
  } catch (err) {
    /*
     * An unreadable source is reported, never swallowed — the same
     * rule the screen's git sources follow. A citation we could not
     * check is not a citation that passed.
     */
    results.push({ id: pin.id, state: "missing", files: 0, detail: `could not read ${pin.source}: ${err.message}` });
    continue;
  }
  const result = checkPin(pin, lines, lock.pins?.[pin.id]);
  results.push(result);
  if (lines.length > 0) {
    nextPins[pin.id] = update || !lock.pins?.[pin.id]?.digest
      ? lockEntry({ ...pin, read_date: update ? today : pin.read_date }, lines)
      : lock.pins[pin.id];
  }
}

const report = renderReport(results);
console.log(report);

if (update) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(LOCK, `${JSON.stringify({ updated: today, pins: nextPins }, null, 1)}\n`);
  console.log(`\nRe-pinned ${Object.keys(nextPins).length} citations at ${today}. This records that a human re-read them.`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(LOCK, `${JSON.stringify({ updated: today, pins: nextPins }, null, 1)}\n`);
  console.log(`\nFirst run — wrote the initial lock with ${Object.keys(nextPins).length} pins.`);
}

if (write) {
  const dir = join(HOME, today);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "citations.md"), report);
  console.log(`\n  ${join(dir, "citations.md")}`);
}

const s = summarise(results);
process.exit(s.clean ? 0 : 1);
