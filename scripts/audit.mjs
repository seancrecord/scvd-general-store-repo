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

/**
 * WHAT COUNTS AS A KV CALL, and why this is not `env.X.get` any more.
 *
 * These matched a literal `await env.SOMETHING.get/put` until
 * 2026-08-07, when factoring the two watch sweeps into one shared
 * function (services/watch-sweep.ts) made its per-record write
 * invisible: the shared sweep writes through an INJECTED namespace,
 * `options.kv.put`, which the old pattern did not match. The
 * refactor was right and the audit went quiet about a real write —
 * an instrument that stops seeing the thing it exists to see, which
 * is the exact failure class this repo keeps catching in itself.
 *
 * So the namespace may now be any dotted expression. The `await` is
 * what keeps this honest rather than noisy: a Map's `.get` inside a
 * loop is everywhere in this codebase and is never awaited, so it
 * does not match, while every KV call is.
 *
 * THE `[<(]` IS LOAD-BEARING and was learned the hard way in the
 * same sitting: KV reads in this codebase are typed —
 * `env.PATRONS.get<PatronRecord>(...)` — so a pattern demanding an
 * open paren immediately after `.get` matched NOTHING and silently
 * switched the per-key-read rule off across every file. A rule that
 * finds nothing reads exactly like a codebase with nothing to find,
 * which is why the canary below fires both rules at known samples
 * before this script is allowed to report a count.
 */
const KV_READ = /await [\w.]+\.get[<(]/;
const KV_WRITE = /await [\w.]+\.put[<(]/;

/**
 * THE CANARY. Both repairs above were silent failures — the rules
 * kept running and found less, which reads exactly like a codebase
 * that improved. So the patterns are checked against known samples
 * before the audit is allowed to report anything, and a rule that
 * stops matching what it exists to match takes the whole run down
 * instead of quietly lowering a number.
 *
 * It lives here rather than in the vitest suite on purpose: that
 * pool runs inside a Worker with no filesystem, and a copy of these
 * patterns over there would be a second source of truth for the one
 * fact this file is about.
 */
const CANARY = [
  [KV_READ, 'const row = await env.PATRONS.get<PatronRecord>(key, "json");'],
  [KV_READ, "const raw = await env.COUNTERS.get(name);"],
  [KV_READ, "const row = await options.kv.get(name);"],
  [KV_WRITE, "await env.ORDERS.put(name, JSON.stringify(record));"],
  [KV_WRITE, "await options.kv.put(name, JSON.stringify(record));"],
];
for (const [pattern, sample] of CANARY) {
  if (!pattern.test(sample)) {
    console.error(
      `\nAudit self-check FAILED: ${pattern} no longer matches\n  ${sample}\n\nA rule that matches nothing reports a clean codebase. Fix the pattern before trusting any count from this run.`,
    );
    process.exit(1);
  }
}
// And the other direction: an unawaited Map read is not a KV read.
if (KV_READ.test("const row = rows.get(name);")) {
  console.error(
    "\nAudit self-check FAILED: KV_READ now matches a plain Map read, which would flood the budget with phantoms.",
  );
  process.exit(1);
}

for (const path of sourceFiles(SRC)) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  /**
   * THE PRIMITIVES THEMSELVES ARE EXEMPT, because they are what the
   * rules point everybody else toward. kv-list.ts is the capped list
   * (rule 1's destination); kv-bulk.ts is the bulk read (rules 3 and
   * 4's destination) — and its loop walks CHUNKS OF A HUNDRED, with
   * a single-key branch inside that exists precisely to avoid the
   * N+1 the rule is hunting. Flagging the cure as the disease spends
   * the budget and teaches the reader to discount the tool, which
   * this file's own comment says is worse than a missing rule.
   */
  const isHelper =
    path.endsWith("kv-list.ts") || path.endsWith("kv-bulk.ts");

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
    if (!isHelper && /^\s*for \(/.test(line)) {
      if (deeperLinesAfter(lines, i).some((l) => KV_READ.test(l))) {
        flag("warn", path, n, "per-key-read", "A KV read per key inside a loop. Prefer a bulk read unless the loop must decide per record.");
      }
    }

    // 4. A write per key inside a loop, which spends the write budget
    //    in a way that is invisible until a bill or a cap says so.
    if (!isHelper && /^\s*for \(/.test(line)) {
      if (deeperLinesAfter(lines, i).some((l) => KV_WRITE.test(l))) {
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
 * RAISED 7 -> 8 on 2026-08-07 for the conformance watch's sweep, and
 * REVERSED THE SAME DAY on the keeper's ruling, which was the right
 * reading of the finding: the audit was not saying "this loop is
 * fine," it was saying "this loop exists twice." The two watch
 * sweeps were the same function with three constants changed, so
 * they became one (services/watch-sweep.ts) and took a warning with
 * them. Raising the number was the cheap answer to a finding that
 * had a real one.
 *
 * Two instrument repairs came out of that same reversal, both of the
 * class this budget exists to catch:
 *   - The shared sweep writes through an injected namespace, which
 *     the old `env.X.put` pattern could not see. The patterns now
 *     match any dotted expression, so the refactor did not buy
 *     quiet.
 *   - Typed reads (`get<T>(`) had never matched a paren-anchored
 *     pattern; fixing the first repair exposed it. See KV_READ.
 * Both are held by the canary beside KV_READ now, because a count is
 * only as honest as the rules producing it.
 *
 * RATCHETED 8 -> 7 with that consolidation, and kv-bulk.ts joined
 * kv-list.ts as an exempt primitive: flagging the bulk helper's own
 * chunk loop is flagging the cure as the disease.
 */
const WARN_BUDGET = 7;

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
