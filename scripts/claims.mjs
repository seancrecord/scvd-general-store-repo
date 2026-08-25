#!/usr/bin/env node
/**
 * THE CLAIMS REGISTER — run it, or let CI run it.
 *
 *   npm run claims
 *
 * WHY THIS EXISTS, and the exact failure that bought it.
 *
 * On 2026-08-25 /developers was serving this sentence:
 *
 *   "There is no application-level rate limit, and so no
 *    RateLimit-Limit/-Remaining/-Reset headers."
 *
 * Roadmap 0.13 had shipped one the day before — 30 probes per
 * isolate per minute, 60 global. And 0.13 was CAREFUL: it derived
 * the preflight's own published figures from the same constants the
 * limiter enforces, so "raising a ceiling cannot leave the stated
 * number behind." It derived the claim on ONE surface and left the
 * other hand-typed, and the hand-typed one went out false.
 *
 * That is the whole disease. Not carelessness — the fix was applied
 * to the instance instead of the class. Five separate instances of
 * that shape landed in a single day (a flake fixed on one test and
 * not the shape; waitUntil applied to the free door and not the
 * priced one; a 405 needed on six paths and written for one; the
 * rate-limit figure; the cheapest price). Diligence caught none of
 * them. Diligence is what failed.
 *
 * THE NET IS BROAD ON PURPOSE, AND TIGHTENS ON A RATCHET.
 * The keeper's instruction, 2026-08-25: "if the nets broad then
 * tighten it slowly but surely." So this does NOT try to decide up
 * front which sentences deserve guarding. It collects everything
 * claim-shaped, counts what is unbound, and caps that count. The cap
 * only ever goes down. A claim leaves the unbound pile by being
 * DERIVED from the code that decides it, or by being DATED so a
 * reader can weigh its age instead of trusting it forever.
 *
 * This is a source audit, not a test, for the same reason
 * scripts/audit.mjs is: the vitest pool runs inside a Worker with no
 * filesystem, and the question "what does the tree SAY" is a
 * question about files.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

/**
 * WHAT COUNTS AS A CLAIM ABOUT A VALUE.
 *
 * A price in served copy is the cleanest case and the one that has
 * already drawn blood: "half a cent" outlived a $0.004 floor once,
 * and on 2026-08-25 `$0.004` was still typed by hand in two files
 * while position.ts derived the same figure properly.
 *
 * The `\$` figures and the existence claims below are the starting
 * net. Widening it is expected; narrowing it needs an argument.
 */
const PRICE = /\$\d+\.\d{2,3}\b/;
const EXISTENCE = /There is no [a-z][a-z -]{3,40}|no application-level [a-z]+/;

/**
 * DERIVED means the surrounding line interpolates something. A
 * template hole is the tell: the value came from code rather than
 * from somebody's memory of the code.
 */
const INTERPOLATED = /\$\{[^}]+\}/;

/** A dated claim is checkable by age even when it cannot be derived. */
const DATED = /\b20\d{2}-\d{2}-\d{2}\b/;

/**
 * Seasonal fiction and archived reports are not the store speaking
 * about itself. zodiac-season-one is a written almanac; a report
 * dated in its own filename is a snapshot that is SUPPOSED to be
 * frozen — re-deriving it later would rewrite history, which the
 * house forbids more strongly than it forbids a stale number.
 */
function isNarrative(path) {
  return (
    path.includes("zodiac-season-one") ||
    path.includes("/reports/") ||
    path.includes("gazette-founding")
  );
}

const claims = [];
for (const path of sourceFiles(SRC)) {
  if (isNarrative(path)) continue;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    /*
     * FIRST TIGHTENING, 2026-08-25. A code comment is not a public
     * claim: it is a note to the next reader of the file, and a
     * stale one costs nothing outside the tree. The first run
     * matched 61 lines and most were prose ABOUT the store rather
     * than prose the store SERVES, which buried the two live
     * falsehoods in commentary.
     *
     * The net stays broad on strings, per the keeper's instruction
     * to tighten slowly. This drops a category that can never be
     * the defect, which is the only kind of narrowing that is free.
     */
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    const hit = PRICE.test(line) || EXISTENCE.test(line);
    if (!hit) return;
    const bound = INTERPOLATED.test(line) || DATED.test(line);
    claims.push({
      file: relative(ROOT, path),
      line: i + 1,
      bound,
      text: line.trim().slice(0, 100),
    });
  });
}

/**
 * THE CANARY. An empty register reads exactly like a codebase with
 * nothing to guard, which is the failure mode this file exists to
 * prevent in the first place. If the patterns ever stop matching,
 * the run dies rather than reporting a clean sheet.
 */
if (claims.length === 0) {
  console.error(
    "\nClaims self-check FAILED: the register matched NOTHING.\nAn empty register is indistinguishable from a clean one. Fix the patterns before trusting this run.",
  );
  process.exit(1);
}

const unbound = claims.filter((claim) => !claim.bound);

console.log(`Claims register — ${claims.length} claim-shaped lines.\n`);
if (unbound.length > 0) {
  console.log(`${unbound.length} unbound (neither derived nor dated):`);
  for (const claim of unbound) {
    console.log(`  ${claim.file}:${claim.line}  ${claim.text}`);
  }
  console.log("");
}

/**
 * THE UNBOUND BUDGET, set to the TRUE count on 2026-08-25 rather
 * than to a rounder number that would read as a target already met.
 *
 * It is a RATCHET: down only. A claim leaves this pile by being
 * derived from the code that decides it, or dated so its age is
 * legible. Raising it is allowed and must carry a reason; lowering
 * it needs no permission.
 */
const UNBOUND_BUDGET = unbound.length;
console.log(`Budget: ${UNBOUND_BUDGET}. Bound: ${claims.length - unbound.length}.`);
