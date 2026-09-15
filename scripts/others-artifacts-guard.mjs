#!/usr/bin/env node
/**
 * WHAT WE MAY SAY ABOUT SOMEONE ELSE'S ARTIFACT — run it, or let CI.
 *
 *   npm run others:check
 *
 * WHY THIS EXISTS, and the exact sentence that bought it.
 *
 * On 2026-09-13 this store published, in a research README, that the
 * claim binding on a StillOS Notary receipt was
 *
 *   "unreproducible by anyone, permanently"
 *
 * We had established one thing: that WE could not reproduce it from
 * the claim text. Everything after that was the issuer's account of
 * his own records — evidence about his records, never a fact about
 * what is possible — and we wrote "anyone" and "permanently" into it
 * anyway. Two days later he supplied the preimage. It reproduces.
 *
 * The shape of the mistake is not carelessness and would not have been
 * caught by being careful: a failed reproduction is a fact about the
 * observer, and prose slides from that to a fact about the world in
 * one word. This store's unfalsifiable claims have always appeared in
 * prose, which is the one surface none of the derived-value guards
 * look at. So this one looks at prose, and fails the build.
 *
 * WHAT IT FLAGS: universal or permanent impossibility asserted about
 * reproducing or verifying something. Not "we could not reproduce it",
 * which is an observation and is exactly what we are allowed to say.
 *
 * HOW TO SAY IT ANYWAY: you cannot. You can QUOTE it — every flagged
 * phrase is allowed inside quotation marks in a passage that names it
 * as wrong, so a correction can repeat what it is correcting and so we
 * can quote somebody else's overstatement while calling it one. That
 * is the only exit and it costs a retraction to use. The marker list
 * below is deliberately short; widen it only for a passage that really
 * does retract, never to get a sentence past this file.
 *
 * A source audit rather than a test, for the same reason claims.mjs is
 * one: the vitest pool runs inside a Worker with no filesystem, and
 * "what does the tree SAY" is a question about files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCANNED = ["research", "docs"];
/** How far above a flagged line the retraction marker may sit. */
const MARKER_REACH = 12;
/** The passage has to say the quoted phrase was wrong, in one of these. */
const RETRACTION_MARKERS = [/\bCORRECTED\b/, /\btoo strong\b/i, /\boverstatement\b/i, /\bwe were wrong\b/i];

/**
 * Narrow on purpose. Each of these asserts something about everyone,
 * or about all future time, on a question one observation cannot
 * settle. A phrase earns its place here by having actually gone out.
 */
const FORBIDDEN = [
  { re: /unreproducible by anyone/i, why: "asserts every observer's result from one of ours" },
  { re: /(reproduc|verif)\w*\s+by\s+(no\s?one|nobody)/i, why: "asserts every observer's result from one of ours" },
  { re: /(no\s?one|nobody)\s+(can|could|will)\s+(ever\s+)?(reproduc|verif)/i, why: "asserts every observer's result from one of ours" },
  { re: /permanently\s+unreproducible/i, why: "asserts all future time from one moment" },
  { re: /unreproducible[^.\n]{0,40}\bpermanently\b/i, why: "asserts all future time from one moment" },
  { re: /(can|could)\s+never\s+be\s+(reproduc|verif)\w*/i, why: "asserts all future time from one moment" },
  { re: /impossible\s+to\s+(reproduc|verif)\w*/i, why: "asserts impossibility where we observed a failure" },
];

function markdown(dir) {
  const found = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return found; }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...markdown(path));
    else if (entry.endsWith(".md")) found.push(path);
  }
  return found;
}

/** Quoted, in a passage that calls the quote wrong. Nothing else. */
function quotedInsideARetraction(lines, index) {
  const quoted = /["\u201c\u201d'\u2018\u2019]/.test(lines[index]);
  const window = lines.slice(Math.max(0, index - MARKER_REACH), index + 2).join("\n");
  return quoted && RETRACTION_MARKERS.some((marker) => marker.test(window));
}

const findings = [];
for (const root of SCANNED) {
  for (const file of markdown(join(ROOT, root))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const rule of FORBIDDEN) {
        if (!rule.re.test(line)) continue;
        if (quotedInsideARetraction(lines, index)) continue;
        findings.push({ file: relative(ROOT, file), line: index + 1, text: line.trim(), why: rule.why });
      }
    });
  }
}

if (findings.length > 0) {
  console.error(`\n✗ ${findings.length} claim(s) about someone else's artifact that one observation cannot support:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text}`);
    console.error(`    ${f.why}`);
    console.error(`    say what YOU observed instead, or quote it in a passage that calls it wrong`);
    console.error(`    (markers: CORRECTED, "too strong", "overstatement", "we were wrong")\n`);
  }
  process.exit(1);
}
console.log(`✓ ${SCANNED.join(", ")}: no unfalsifiable claim about another party's artifact`);
