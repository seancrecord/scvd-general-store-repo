#!/usr/bin/env node
/**
 * THE BLINDNESS AUDIT — run it, or let CI run it.
 *
 *   npm run blindness
 *
 * WHY THIS EXISTS. This store spent a week finding other people's
 * counts resting on a page instead of a population: a directory
 * serving 25 rows of 738, a partner's chain reader taking the newest
 * 40 and calling it all, our own floor check reporting 107 addresses
 * unestablished because a rate limit came back as a null. Every one of
 * them failed the same way — CLOSED and SILENT, with a tidy number at
 * the end that nobody could tell from a real one.
 *
 * Having said that about everyone else, the question we owed ourselves
 * is whether OUR published counts have the same shape. src/lib/kv-list
 * already forbids a raw `.list(` and forces every caller to name a cap
 * and be told when there were more. That fixes the read. It does not
 * fix the READER: a caller can still take `names.length` as a count
 * and drop `truncated` on the floor, and the number that reaches a
 * buyer is then a page wearing a population's clothes.
 *
 * So this walks every listKeys() call site and asks one question: does
 * the code that consumes this list ever look at whether it was
 * complete? A site that does not is UNBOUND. Unbound is not the same
 * as wrong — plenty of reads are deliberately bounded and never
 * counted — which is why this is a capped census rather than a ban.
 *
 * THE CAP ONLY EVER GOES DOWN. The keeper's rule from the claims
 * register, 2026-08-25: a broad net that tightens on a ratchet. Raising
 * UNBOUND_CAP to make a red build green is the one edit this file
 * exists to prevent.
 *
 * A source audit rather than a test, for the same reason claims.mjs is
 * one: the vitest pool runs inside a Worker with no filesystem.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
/**
 * Ratchet. Lower it whenever a site starts carrying its truncation;
 * never raise it. Set 2026-09-15 at the census below.
 */
const UNBOUND_CAP = 38;
/** How far past a call site to look for the truncation being read. */
const REACH = 40;
/**
 * The sharp end. An unbound read is usually harmless — plenty of sites
 * list a prefix, act on each key, and never say how many there were.
 * It becomes a finding the moment the list is turned into a NUMBER,
 * because that number is what reaches a reader. This cap is separate
 * and it is zero: there is no acceptable count over a list whose
 * completeness nobody checked.
 */
const COUNTING_CAP = 0;

function sources(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

const sites = [];
for (const file of sources(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (!line.includes("listKeys(")) return;
    if (/^\s*(\*|\/\/)/.test(line)) return; // a mention in prose is not a call
    // The name the result is bound to, either destructured or assigned.
    const destructured = /const\s*\{([^}]*)\}\s*=\s*await\s+listKeys\(/.exec(line);
    const named = /const\s+(\w+)\s*=\s*await\s+listKeys\(/.exec(line);
    const window = lines.slice(index, index + REACH).join("\n");
    let carries = false;
    if (destructured) {
      carries = /\btruncated\b/.test(destructured[1]);
    } else if (named) {
      // Whole file, not the window: certificate-anchors.ts reads its
      // truncation 59 lines below the call and was flagged for it.
      // A false positive here costs more than a near miss, because a
      // guard that cries wolf gets its cap raised.
      carries = new RegExp(`\\b${named[1]}\\.truncated\\b`).test(text);
    } else {
      // An inline or multi-line form: fall back to the window alone.
      carries = /\btruncated\b/.test(window);
    }
    // Does anything downstream turn this list into a figure? `.length`
    // on the names, or a size/count/total assembled from them.
    const holder = destructured ? "names" : (named?.[1] ? `${named[1]}.names` : "names");
    const counts = new RegExp(`${holder.replace(".", "\\.")}\\.length`).test(window);
    sites.push({
      file: relative(ROOT, file), line: index + 1,
      bound_to: destructured ? `{${destructured[1].trim()}}` : (named?.[1] ?? "(inline)"),
      carries, counts,
    });
  });
}

const unbound = sites.filter((s) => !s.carries);
const countingBlind = unbound.filter((s) => s.counts);
console.log(`listKeys call sites in src/: ${sites.length}`);
console.log(`  read their truncation: ${sites.length - unbound.length}`);
console.log(`  do not:                ${unbound.length}   (cap ${UNBOUND_CAP})`);
console.log(`  of those, turn the list into a number: ${countingBlind.length}   (cap ${COUNTING_CAP})`);

if (countingBlind.length > COUNTING_CAP) {
  console.error(`\n✗ ${countingBlind.length} site(s) publish a COUNT over a list whose completeness was never read.`);
  console.error("  That is the exact shape this store has spent a week naming in other people's instruments.\n");
  for (const s of countingBlind) console.error(`    ${s.file}:${s.line}  → ${s.bound_to}`);
  console.error("\n  Read `truncated` and carry it beside the figure, or stop serving the figure.\n");
  process.exit(1);
}

if (unbound.length > UNBOUND_CAP) {
  console.error(`\n✗ ${unbound.length} listKeys sites never read whether the list was complete, over a cap of ${UNBOUND_CAP}.`);
  console.error("  A bounded read is fine. A COUNT over a bounded read is a page wearing a population's clothes.");
  console.error("  Fix the site, or — if the read is deliberately bounded and never counted — say so in a comment naming it.\n");
  for (const s of unbound.slice(0, 20)) console.error(`    ${s.file}:${s.line}  → ${s.bound_to}`);
  console.error("\n  Do NOT raise the cap. It is a ratchet and only turns one way.\n");
  process.exit(1);
}
if (unbound.length < UNBOUND_CAP) {
  console.log(`\n→ ${UNBOUND_CAP - unbound.length} site(s) below the cap. Lower UNBOUND_CAP in scripts/blindness-audit.mjs to ${unbound.length} to keep the ratchet tight.`);
}
console.log("\n✓ no published count is resting on more pages than this store has admitted to");
