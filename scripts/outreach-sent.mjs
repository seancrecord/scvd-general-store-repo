#!/usr/bin/env node
/**
 * npm run outreach:sent -- <name or url> [...] — stamp the sends.
 *
 * WHY THIS EXISTS (2026-09-04). The keeper sent twenty-odd scorers'
 * notes and the register recorded none of them, so the Sunday watch
 * had nothing to watch: the automation was idle while the work was
 * done. The cause was friction, not forgetfulness — stamping meant
 * hand-editing JSON, twenty times, then remembering to render.
 *
 * One command now: match each argument against the register by name
 * or URL, set note_sent, and re-render the table and the edge's
 * watched file in the same breath. It NEVER guesses: an argument
 * that matches nothing, or matches more than one row, stops the run
 * and names the candidates, because a wrong stamp is a claim that
 * a note went somewhere it did not.
 *
 * --date YYYY-MM-DD stamps a day other than today (the notes went
 * out before anyone wrote them down, which is the usual case).
 * --list prints who is already stamped and exits.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderMarkdown, renderWatched } from "./lib/scorers-outreach.mjs";

const REGISTER = new URL("../registry/scorers-outreach.json", import.meta.url);
const TABLE = new URL("../registry/scorers-outreach.md", import.meta.url);
const WATCHED = new URL("../src/store/watched-pages.json", import.meta.url);

const register = JSON.parse(readFileSync(REGISTER, "utf8"));
const argv = process.argv.slice(2);

if (argv.includes("--list")) {
  const sent = register.systems.filter((entry) => entry.note_sent);
  console.log(`${sent.length} of ${register.systems.length} stamped as sent.`);
  for (const entry of sent) console.log(`  ${entry.note_sent}  ${entry.name}`);
  process.exit(0);
}

const dateFlag = argv.indexOf("--date");
const date = dateFlag === -1 ? new Date().toISOString().slice(0, 10) : argv[dateFlag + 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`--date wants YYYY-MM-DD, got ${date}`);
  process.exit(2);
}
const targets = argv.filter((arg, i) => !arg.startsWith("--") && i !== dateFlag + 1);
if (targets.length === 0) {
  console.error("Name at least one system. `npm run outreach:sent -- \"Glama\" x402scan` — name or URL, quoted if it has spaces.");
  process.exit(2);
}

/** Exact name wins; otherwise a case-insensitive substring of name or URL. */
function findRows(needle) {
  const exact = register.systems.filter((entry) => entry.name.toLowerCase() === needle.toLowerCase());
  if (exact.length === 1) return exact;
  const lower = needle.toLowerCase();
  return register.systems.filter(
    (entry) => entry.name.toLowerCase().includes(lower) || entry.url.toLowerCase().includes(lower),
  );
}

const stamped = [];
const problems = [];
for (const needle of targets) {
  const rows = findRows(needle);
  if (rows.length === 0) {
    problems.push(`no row matches "${needle}"`);
    continue;
  }
  if (rows.length > 1) {
    problems.push(`"${needle}" matches ${rows.length}: ${rows.map((r) => r.name).join(", ")} — name one exactly`);
    continue;
  }
  const row = rows[0];
  if (row.note_sent) {
    console.log(`already stamped ${row.note_sent}  ${row.name}`);
    continue;
  }
  row.note_sent = date;
  stamped.push(row.name);
}

if (problems.length > 0) {
  console.error("Nothing was written. Fix these and run again:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

writeFileSync(REGISTER, `${JSON.stringify(register, null, 2)}\n`);
writeFileSync(TABLE, renderMarkdown(register));
writeFileSync(WATCHED, renderWatched(register));
const watching = register.systems.filter((e) => e.note_sent !== null || e.cites_since !== null).length;
console.log(`stamped ${stamped.length} as sent ${date}: ${stamped.join(", ") || "(none new)"}`);
console.log(`the Sunday watch now reads ${watching} page${watching === 1 ? "" : "s"}. Commit the three changed files.`);
