#!/usr/bin/env node
/**
 * THE SCALABILITY AUDIT — run it, or let CI run it.
 *
 *   npm run audit
 *
 * The keeper's standing rule is that anything that can be automated
 * should be, and this class of defect is the strongest argument for it:
 * IT ARRIVES WITH SUCCESS. Nothing looks wrong, nothing errors, and the
 * first symptom is a number that is quietly too low forever.
 *
 * WHAT THE FIRST RUN FOUND, 2026-07-30: ten KV listings with no limit at
 * all — orders, tips, refunds, confessions, letters, requests,
 * waitlists, the gazette rack, stock, and the metric counters.
 * Cloudflare KV answers an unbounded list with at most one page and sets
 * `list_complete: false`; nothing in the codebase read that flag
 * anywhere. Those readings would have silently stopped seeing older
 * records once the store passed a page of keys.
 *
 * AND WHAT IT FOUND SECOND, which changed the fix rather than the
 * verdict: the READING paths — the recount, the census, the decline
 * desk, the referral scan — were already doing correct cursor
 * pagination. The defect was confined to the service layer. So an
 * explicit cursor loop passes; everything else must go through
 * listKeys, which requires a cap and reports truncation. A working
 * pattern does not get flattened to make an audit simpler.
 *
 * This is a source audit, not a test: it runs in Node, where the repo
 * actually exists. The vitest pool runs inside a Worker and cannot read
 * the filesystem, which is why this is a script and a CI step.
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
 * The lines that are actually INSIDE a loop, by indentation.
 *
 * The first cut of this rule read a fixed twelve-line window after
 * every `for (`, which flagged a KV read belonging to the NEXT
 * FUNCTION as if it were in the loop — caught 2026-07-30 on
 * almanac-store.ts, where a three-line loop sat above an unrelated
 * helper that happened to open with a get.
 *
 * A false positive in a budgeted audit is worse than a missing rule:
 * it spends the budget, teaches the reader to discount the tool, and
 * the fix is to raise a number rather than change any code. So the
 * window now ends where the block does.
 */
function deeperLinesAfter(lines, index) {
  const openIndent = lines[index].search(/\S/);
  const inside = [];
  for (let i = index + 1; i < Math.min(lines.length, index + 40); i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.search(/\S/) <= openIndent) break;
    inside.push(line);
  }
  return inside;
}

const findings = [];
function flag(severity, file, line, rule, detail) {
  findings.push({ severity, file: relative(ROOT, file), line, rule, detail });
}

for (const path of sourceFiles(SRC)) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const isHelper = path.endsWith("kv-list.ts");

  lines.forEach((line, i) => {
    const n = i + 1;
    const window = lines.slice(i, i + 6).join("\n");

    // 1. A KV list that neither goes through the helper nor pages itself.
    if (!isHelper && /\.list\(\{/.test(line) && !window.includes("cursor")) {
      flag(
        "error",
        path,
        n,
        "unbounded-list",
        "Use listKeys(ns, { prefix, cap }) — it requires a cap and reports truncation — or write an explicit cursor loop if you mean to walk every page.",
      );
    }

    // 2. A list with no prefix walks the whole namespace, and gets
    //    slower every week the store stays open.
    if (/\.list\(\s*\)/.test(line) || /\.list\(\{\s*\}\)/.test(line)) {
      flag("error", path, n, "prefixless-list", "A list with no prefix walks the entire namespace.");
    }

    // 3. The N+1 shape: one KV read per key inside a loop. Correct, and
    //    linearly slower as the store grows. bulkGetJson/bulkGetText
    //    exist to avoid it. Reported, not banned — a couple are
    //    deliberate, and the point is to keep the count from growing
    //    quietly.
    if (/^\s*for \(/.test(line)) {
      if (deeperLinesAfter(lines, i).some((l) => /await env\.\w+\.get/.test(l))) {
        flag("warn", path, n, "per-key-read", "A KV read per key inside a loop. Prefer a bulk read unless the loop must decide per record.");
      }
    }

    // 4. A write per key inside a loop, which spends the write budget
    //    in a way that is invisible until a bill or a cap says so.
    if (/^\s*for \(/.test(line)) {
      if (deeperLinesAfter(lines, i).some((l) => /await env\.\w+\.put/.test(l))) {
        flag("warn", path, n, "per-key-write", "A KV write per key inside a loop.");
      }
    }
  });
}

/**
 * The warn budget, set to the TRUE count on 2026-07-30 rather than to a
 * rounder number that would have read as a target already met.
 *
 * It is a RATCHET: it should only ever go down. Every one of the twelve
 * is currently deliberate — the phantom sweep reads each due check
 * before deciding whether to walk past it, the register reads each
 * card, the patron counter claims a number by reading its own write
 * back — so none is a bug today. What the budget buys is that the
 * THIRTEENTH has to be argued for in a commit message, which is the
 * only moment anybody is thinking about it.
 *
 * Raising this is allowed and must come with a reason. Lowering it,
 * ideally by replacing a loop with a bulk read, needs no permission.
 *
 * RATCHETED 12 -> 10 on 2026-07-30, and not by fixing code: the
 * per-key rules had been reading a fixed twelve-line window after every
 * loop and flagging reads that belonged to the NEXT function. Bounding
 * the window to the loop's own block by indentation retired three
 * phantoms. A false positive in a budgeted audit is worse than a
 * missing rule — it spends the budget, teaches the reader to discount
 * the tool, and the only available fix is to raise a number.
 *
 * RATCHETED 10 -> 7 on 2026-08-07, the keeper's "pay one down" call
 * made when the budget hit its ceiling: the referral counters' two
 * read loops went to bulk reads (they aggregate, they never decide
 * per record), which retired three warnings at once. The seven that
 * remain are all per-record DECISIONS — sweeps that update only the
 * rows that want it, repairs that judge each key — which is the shape
 * the rule itself exempts; converting those would be motion, not
 * improvement. Zero slack again, on purpose.
 *
 * RAISED 7 -> 8 on 2026-08-07, argued for as the ratchet demands:
 * the conformance watch's sweep (services/conformance-watch.ts) is
 * the same deliberate shape as its hourly sibling one line below it
 * in this list — bulk-read the lot, then write ONLY the records that
 * earned a pass this tick. The write is the per-record decision the
 * rule exempts; KV has no bulk write to convert it to. Eighth loop,
 * eighth argument, still zero slack.
 */
const WARN_BUDGET = 8;

const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

const say = (f) => `  ${f.file}:${f.line}  [${f.rule}] ${f.detail}`;

console.log(`Scalability audit — ${sourceFiles(SRC).length} source files.`);
if (errors.length > 0) {
  console.log(`\n${errors.length} must-fix:`);
  errors.forEach((f) => console.log(say(f)));
}
if (warns.length > 0) {
  console.log(`\n${warns.length} to keep an eye on (budget ${WARN_BUDGET}):`);
  warns.forEach((f) => console.log(say(f)));
}
if (errors.length === 0 && warns.length <= WARN_BUDGET) {
  console.log(
    `\nClean. ${warns.length} warning${warns.length === 1 ? "" : "s"} within budget.`,
  );
  process.exit(0);
}
if (warns.length > WARN_BUDGET) {
  console.log(
    `\nOver the warning budget (${warns.length} > ${WARN_BUDGET}). Fix one, or raise the budget in scripts/audit.mjs with a reason.`,
  );
}
process.exit(1);
