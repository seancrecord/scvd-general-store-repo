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
import { REGISTER } from "./claims-register.mjs";
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
    if (
      trimmed.startsWith("*") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*")
    )
      return;
    const hit = PRICE.test(line) || EXISTENCE.test(line);
    if (!hit) return;
    const bound = INTERPOLATED.test(line) || DATED.test(line);
    const text = line.trim();
    claims.push({
      file: relative(ROOT, path),
      line: i + 1,
      bound,
      text,
      preview: text.slice(0, 100),
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

/**
 * A REGISTERED CLAIM IS RESOLVED — derived, dated, declined, or
 * external. See scripts/claims-register.mjs for what each means and
 * why "dated" is not a lesser answer than "derived".
 */
const resolvedBy = (claim) =>
  REGISTER.find(
    (entry) => entry.file === claim.file && claim.text.includes(entry.match),
  );

/**
 * THE ROT CHECK, and the reason this register is worth more than a
 * list in a wiki. Copy gets rewritten. An entry still pointing at a
 * sentence nobody serves any more has quietly released a claim from
 * its guard, and the run would report a clean sheet while doing it.
 *
 * So a register entry that matches NOTHING is a hard failure, in the
 * same spirit as the canary above: an instrument that stops seeing
 * the thing it exists to see must take the build down rather than
 * report less.
 */
const everyLine = sourceFiles(SRC)
  .filter((path) => !isNarrative(path))
  .map((path) => ({ file: relative(ROOT, path), body: readFileSync(path, "utf8") }));
const stale = REGISTER.filter((entry) => {
  const file = everyLine.find((candidate) => candidate.file === entry.file);
  return !file || !file.body.includes(entry.match);
});
if (stale.length > 0) {
  console.error("\nClaims register FAILED: entries match nothing any more.\n");
  for (const entry of stale) {
    console.error(`  ${entry.id} -> ${entry.file}`);
    console.error(`    looked for: ${entry.match}`);
  }
  console.error(
    "\nThe copy moved and its resolution did not follow. Re-point the entry or drop it — a resolution aimed at a sentence nobody serves is a claim with no guard at all.",
  );
  process.exit(1);
}

const unbound = claims.filter((claim) => !claim.bound && !resolvedBy(claim));
const resolved = claims.length - unbound.length;

console.log(`Claims register — ${claims.length} claim-shaped lines.\n`);
if (unbound.length > 0) {
  console.log(`${unbound.length} unbound (neither derived nor dated):`);
  for (const claim of unbound) {
    console.log(`  ${claim.file}:${claim.line}  ${claim.preview}`);
  }
  console.log("");
}

/**
 * THE UNBOUND BUDGET. Ratchet: down only. 27 on the first CI run,
 * 0 once the leftover pile was dated, derived, or declined on the
 * record. Raising it is allowed and must carry a reason.
 */
const UNBOUND_BUDGET = 0;
const byResolution = REGISTER.reduce((tally, entry) => {
  tally[entry.resolution] = (tally[entry.resolution] ?? 0) + 1;
  return tally;
}, {});
console.log(
  `Resolved ${resolved} of ${claims.length} — ` +
    Object.entries(byResolution)
      .map(([kind, n]) => `${n} ${kind}`)
      .join(", ") +
    `, ${resolved - REGISTER.length} interpolated or dated in place.`,
);
console.log(`Unbound: ${unbound.length} (budget ${UNBOUND_BUDGET}).`);

if (unbound.length > UNBOUND_BUDGET) {
  console.error(
    `\nOver the unbound budget (${unbound.length} > ${UNBOUND_BUDGET}). Resolve one — derive it, date it, or decline it on the record — or raise the budget in scripts/claims.mjs with a reason.`,
  );
  process.exit(1);
}
