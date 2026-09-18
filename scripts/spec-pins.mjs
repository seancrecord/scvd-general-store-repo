#!/usr/bin/env node
/**
 * THE CITATION CHECK RUNNER.
 *
 *   node scripts/spec-pins.mjs            # check, exit 1 on drift
 *   node scripts/spec-pins.mjs --update=<id>,<id>   # re-pin those, AFTER reading them
 *   node scripts/spec-pins.mjs --update             # re-pin ALL, same condition
 *   node scripts/spec-pins.mjs --write    # also save a dated report
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
import { PINS, checkPin, cloneAtHead, lockEntry, nextLock, renderReport, summarise, treeLines } from "./lib/spec-pins.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(ROOT, "research", "protocol-screen");
const LOCK = join(HOME, "spec-pins.lock.json");

const args = process.argv.slice(2);
/**
 * `--update=a,b` re-pins exactly those; bare `--update` re-pins all.
 * The named form exists because the blunt one made attesting to two
 * freshly-read pins impossible without also attesting to everything
 * else in the file. See nextLock() in lib/spec-pins.mjs.
 */
const updateArg = args.find((a) => a === "--update" || a.startsWith("--update="));
const update = Boolean(updateArg);
const selected =
  updateArg && updateArg.startsWith("--update=")
    ? new Set(updateArg.slice("--update=".length).split(",").map((id) => id.trim()).filter(Boolean))
    : null;
if (selected) {
  // A typo must not silently re-pin nothing and report success.
  const unknown = [...selected].filter((id) => !PINS.some((pin) => pin.id === id));
  if (unknown.length > 0 || selected.size === 0) {
    console.error(`\nspec-pins: --update named ${unknown.length > 0 ? `unknown pin${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}` : "no pins"}.`);
    console.error(`Known pins: ${PINS.map((pin) => pin.id).join(", ")}\n`);
    process.exit(1);
  }
}
const write = args.includes("--write");
const cacheDir = (args.find((a) => a.startsWith("--cache=")) ?? "").split("=")[1] || join(tmpdir(), "spec-pins-cache");
const today = new Date().toISOString().slice(0, 10);

const sources = new Map(LAYER3.map((s) => [s.key, s]));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : { pins: {} };

const clones = new Map();
function cloneFor(key) {
  if (clones.has(key)) return clones.get(key);
  const source = sources.get(key);
  if (!source) throw new Error(`spec-pins: pin names unknown source "${key}"`);
  const dir = cloneAtHead(source.url, join(cacheDir, key), source.ref);
  clones.set(key, dir);
  return dir;
}

const results = [];
/** Newly computed entries, keyed by pin id. What gets WRITTEN is decided below. */
const fresh = new Map();
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
  if (lines.length > 0) fresh.set(pin.id, lockEntry(pin, lines));
}

const report = renderReport(results);
console.log(report);

if (update) {
  const attesting = selected ? [...selected] : PINS.map((pin) => pin.id);
  const pins = nextLock({ pins: PINS, locked: lock.pins ?? {}, fresh, selected, today });
  mkdirSync(HOME, { recursive: true });
  writeFileSync(LOCK, `${JSON.stringify({ updated: today, pins }, null, 1)}\n`);
  /*
   * The blast radius, printed before anybody can mistake it. A re-pin
   * is a human saying "I read these"; the tool's job is to make sure
   * the list they said it about is the list on the screen.
   */
  console.log(`\nRe-pinned at ${today}, on your word that you re-read:`);
  for (const id of attesting) console.log(`  - ${id}`);
  const untouched = PINS.map((pin) => pin.id).filter((id) => !attesting.includes(id));
  if (untouched.length > 0) {
    console.log(`\nLeft exactly as they were, unread and unattested:`);
    for (const id of untouched) console.log(`  - ${id}`);
  }
  process.exit(0);
}

if (!existsSync(LOCK)) {
  const pins = nextLock({ pins: PINS, locked: {}, fresh, selected: null, today });
  mkdirSync(HOME, { recursive: true });
  writeFileSync(LOCK, `${JSON.stringify({ updated: today, pins }, null, 1)}\n`);
  console.log(`\nFirst run — wrote the initial lock with ${Object.keys(pins).length} pins.`);
}

if (write) {
  const dir = join(HOME, today);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec-pins.md"), report);
  console.log(`\n  ${join(dir, "spec-pins.md")}`);
}

const s = summarise(results);
process.exit(s.clean ? 0 : 1);
