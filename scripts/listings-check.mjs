#!/usr/bin/env node
/**
 * npm run listings:check — which generation of this store does each
 * mirror carry today?
 *
 * Reads the homepage's sameAs list, reads every mirror as a browser
 * would, and says whether each one carries the sixty words (current),
 * "evidence observatory" (september), "trust layer" (august), the
 * July shop's nouns (july), none of those (unknown), or could not be
 * read (unreachable). Compared against docs/listings/observation.json
 * when it exists; a mirror that moved backwards is a regression.
 *
 *   npm run listings:check                       # read, compare, report
 *   npm run listings:check -- --base=http://localhost:8787
 *   npm run listings:check -- --json             # the observation, for a pipe
 *   npm run listings:check -- --record           # write the baseline
 *
 * EXIT CODES: 0 no regression; 1 a mirror regressed; 2 the homepage
 * could not be read at all.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compare, walk } from "./lib/listings.mjs";

const RECORD = new URL("../docs/listings/observation.json", import.meta.url);
const args = process.argv.slice(2);
const flag = (name) => args.some((arg) => arg === `--${name}`);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
};
const base = (value("base") ?? process.env.STORE_BASE_URL ?? "https://scvd.store").replace(/\/+$/, "");

const fresh = await walk(base);
if (fresh.mirrors.length === 0) {
  console.error(`listings: could not read the sameAs list from ${base}/ — nothing to check.`);
  process.exit(2);
}

const baseline = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : null;
const { regressions, advances } = compare(baseline, fresh);

if (flag("json")) {
  console.log(JSON.stringify({ ...fresh, regressions, advances }, null, 2));
} else {
  const width = Math.max(...fresh.mirrors.map((m) => m.url.length));
  for (const mirror of fresh.mirrors) {
    console.log(`${mirror.generation.padEnd(12)} ${String(mirror.status).padStart(3)}  ${mirror.url.padEnd(width)}`);
  }
  const counts = fresh.mirrors.reduce((acc, m) => ({ ...acc, [m.generation]: (acc[m.generation] ?? 0) + 1 }), {});
  console.log(`\n${fresh.mirrors.length} mirrors: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  for (const r of regressions) console.log(`REGRESSED  ${r.url}: ${r.was} -> ${r.now}`);
  for (const a of advances) console.log(`advanced   ${a.url}: ${a.was} -> ${a.now}`);
  if (!baseline) console.log("No baseline yet; --record writes one.");
}

if (flag("record")) {
  mkdirSync(dirname(RECORD.pathname), { recursive: true });
  writeFileSync(RECORD, `${JSON.stringify(fresh, null, 2)}\n`);
  console.log(`Recorded ${fresh.mirrors.length} mirrors to ${RECORD.pathname}.`);
}

process.exit(regressions.length > 0 ? 1 : 0);
