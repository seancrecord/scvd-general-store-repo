#!/usr/bin/env node
/**
 * npm run docs:check — what has gone quiet, and what a guard already
 * watches.
 *
 * THE THING THIS DELIBERATELY IS NOT. It does not rewrite anything.
 * The keeper's standing rule is that scripts nag and never commit, and
 * there is a sharper reason here: a script that "refreshes" prose is a
 * script that will one day silently overwrite a sentence somebody
 * meant. Facts that CAN be recomputed are already checked by tests
 * that fail the build — test/doc-drift.spec.ts for outbound copy,
 * derived-not-typed for served surfaces, skill-parity and
 * skill-bundle-freshness for the published bundle. Those need no
 * remembering, which is the whole point: a script you have to remember
 * to run has the same failure mode as a doc you have to remember to
 * update.
 *
 * What is left over is the question no test can answer — WHICH DOCS
 * HAVE GONE QUIET WHILE THE CODE THEY DESCRIBE KEPT MOVING. That needs
 * git, and it needs a human to judge. So this prints it and stops.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DAY = 86_400_000;
const now = Date.now();

/** Dated records are ABOUT a date; they are supposed to sit still. */
const EXEMPT = [
  /^docs\/archive\//,
  /^research\//,
  /^node_modules\//,
  /^PROBLEMS\.md$/,
  /^NOTES_FROM_THE_COUNTER\.md$/,
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const files = git("ls-files", "*.md")
  .split("\n")
  .filter((path) => path && !EXEMPT.some((skip) => skip.test(path)));

/** The newest commit touching anything under src/ — the code's own clock. */
const codeTouched = new Date(
  git("log", "-1", "--format=%cI", "--", "src/"),
).getTime();

const rows = files.map((path) => {
  const last = git("log", "-1", "--format=%cI", "--", path);
  const at = new Date(last).getTime();
  return {
    path,
    days: Math.floor((now - at) / DAY),
    behindCode: Math.floor((codeTouched - at) / DAY),
    lines: readFileSync(path, "utf8").split("\n").length,
  };
});

rows.sort((a, b) => b.days - a.days);

/**
 * FOURTEEN DAYS, chosen against this repo rather than a round number:
 * at 21 the report was empty while four root documents had sat
 * untouched for a fortnight and llms.txt had already been caught 24
 * days stale once. A threshold that never fires is decoration.
 */
const QUIET = 14;
const quiet = rows.filter((row) => row.days >= QUIET);

/*
 * ALWAYS SHOW THE TAIL, not just what has already crossed the line. A
 * report that prints "nothing is stale" tells the keeper nothing about
 * what is one day away from it, and the first run of this script said
 * exactly that while three documents sat thirteen days quiet.
 */
const shown = quiet.length > 0 ? quiet : rows.slice(0, 5);
const heading =
  quiet.length > 0
    ? `  QUIET FOR ${QUIET}+ DAYS - read each and decide. Silence is not\n  automatically rot, but it is where rot goes unnoticed.`
    : `  Nothing past ${QUIET} days. The quietest few, so the tail stays visible:`;

console.log(`${heading}\n`);
for (const row of shown) {
  const flag = row.days >= QUIET ? "*" : " ";
  console.log(
    `   ${flag}${String(row.days).padStart(4)}d  ${row.path}  (${row.lines} lines, ${row.behindCode}d behind src/)`,
  );
}
console.log("");

console.log("  Facts that CAN be recomputed are guarded by the suite, not here:");
console.log("    test/doc-drift.spec.ts          outbound copy vs the code");
console.log("    test/derived-not-typed.spec.ts  served surfaces vs the code");
console.log("    test/skill-parity.spec.ts       the two skill documents");
console.log("    test/published-record.spec.ts   the published bundle");
console.log("  Those fail the build. This only reports what no test can judge.\n");

/*
 * Exit 0 always. A quiet document is a prompt for a human, not a
 * broken build — wiring this into CI as a failure would turn "read
 * this and decide" into "touch the file to go green", which is how a
 * freshness check starts producing fake freshness.
 */
