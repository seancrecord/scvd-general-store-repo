#!/usr/bin/env node
/**
 * npm run specs:check — how long since anybody actually read the
 * outside facts this store is built on? (2026-09-06, rule 61.)
 *
 *   npm run specs:check                  # the register, oldest first
 *   npm run specs:check -- --json        # for a pipe
 *   npm run specs:check -- --review=x402-wire   # mark one fact read today
 *
 * IT PROBES NOTHING, deliberately. No fetch can tell you whether the
 * paragraph you depend on still says what you think, so this keeps the
 * clock instead and names the source to go and open. The reading is
 * only ever as good as the reads behind it, which is why --review is
 * separate from every other command in this repository: marking a fact
 * read must never be a side effect of running something else. Somebody
 * opened the source, or nobody did.
 *
 * EXIT CODES: 0 nothing overdue; 1 at least one fact has gone
 * REVIEW_EVERY_DAYS without a read; 2 an unknown fact id.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FACTS, REGISTER_STARTED, REVIEW_EVERY_DAYS, factById, overdue, readWatch } from "./lib/spec-watch.mjs";

const RECORD = new URL("../docs/spec-watch/observation.json", import.meta.url);
const args = process.argv.slice(2);
const flag = (name) => args.some((arg) => arg === `--${name}`);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const now = new Date();
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : null;

// --review marks one fact read and writes nothing else, for the same
// reason the doors battery keeps its review separate: "I looked at
// this" cannot be a by-product of a scheduled job.
const reviewing = value("review");
if (reviewing) {
  if (!factById(reviewing)) {
    console.error(`No fact called "${reviewing}". Facts: ${FACTS.map((f) => f.id).join(", ")}`);
    process.exit(2);
  }
  const next = record ?? { reviewed_at: {} };
  next.reviewed_at = { ...(next.reviewed_at ?? {}), [reviewing]: now.toISOString() };
  mkdirSync(dirname(RECORD.pathname), { recursive: true });
  writeFileSync(RECORD, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${reviewing} marked read ${now.toISOString().slice(0, 10)}. Record the read itself in docs/SPEC_READS.md — rule 61 wants the evidence, not the tick.`);
  process.exit(0);
}

const rows = readWatch(record, now);
const late = overdue(rows);

if (flag("json")) {
  console.log(JSON.stringify({ register_started: REGISTER_STARTED, review_every_days: REVIEW_EVERY_DAYS, read_at: now.toISOString(), rows, overdue: late }, null, 2));
} else {
  console.log(`THE SPEC WATCH — ${rows.length} facts, re-read every ${REVIEW_EVERY_DAYS} days (register opened ${REGISTER_STARTED})\n`);
  const width = Math.max(...rows.map((row) => row.id.length));
  for (const row of [...rows].sort((a, b) => b.days - a.days)) {
    const when = row.counted_from === "read" ? `read ${row.last_read}` : `never read`;
    const doubt = row.caveat ? "  ⚑" : "";
    console.log(`${row.overdue ? "OVERDUE" : "ok     "} ${String(row.days).padStart(4)}d  ${row.id.padEnd(width)}  ${when}${doubt}`);
  }
  const flagged = rows.filter((row) => row.caveat);
  if (flagged.length > 0) {
    console.log(`\n⚑ ${flagged.length} rows carry a caveat — something about the row itself is unsettled:`);
    for (const row of flagged) console.log(`\n  ${row.id}\n    ${row.caveat}`);
  }
  if (late.length > 0) {
    console.log(`\n${late.length} overdue. Open the source, then record the read:`);
    for (const row of late) {
      console.log(`\n  ${row.id} — ${row.protocol}`);
      console.log(`    ${row.fact}`);
      console.log(`    source:  ${row.source}`);
      console.log(`    breaks:  ${row.depends}`);
      if (row.caveat) console.log(`    ⚑        ${row.caveat}`);
    }
    console.log(`\nRule 61: the read goes in docs/SPEC_READS.md with its date and what could not be reached. Then: npm run specs:check -- --review=<id>`);
  } else {
    console.log(`\nNothing overdue. This is a clock, not a check — a green run means somebody looked recently, never that a fact is still true.`);
  }
}

process.exit(late.length > 0 ? 1 : 0);
