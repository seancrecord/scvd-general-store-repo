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
 * THE SECOND HALF (2026-09-03, roadmap V4): the versions and the
 * shelf. After the mirrors, every registry this store is listed on
 * is read once and compared against this tree and the live shelf —
 * the MCP registry's latest version and description against
 * server.json and tab/server.json, npm's dist-tags against the four
 * package manifests, ClawHub against registry/clawhub/published.json,
 * x402-list's offer count and its description's last sentence against
 * the paid shelf and the doctrine, agentic.market's endpoint count
 * against the shelf. One row per fact: agrees, differs (ours and
 * theirs named), unknown, unreachable. Never a score.
 *
 * THE THIRD HALF (2026-09-06): the roster. Every venue row this store
 * publishes at /.well-known/trust.json is fetched and asked one
 * question — does that page still name us? A row that stops naming us
 * is a claim on our own served surface that has quietly gone false,
 * and until now nothing re-read the forty-nine of them. Reported as
 * holds / silent / unreachable, alarmed on the move rather than the
 * state, because half these venues render client-side and a bare
 * "silent" would cry wolf weekly. Stale `confirmed` dates are printed
 * oldest first and never fail: a date is the keeper's hand.
 *
 * EXIT CODES: 0 no regression and no drift; 1 a mirror regressed, a
 * registry differs from the tree, or a roster row moved backwards; 2
 * the homepage could not be read at all. --report-only prints
 * everything and exits 0 unless the homepage was unreadable: the
 * shape a pull request's push runs in, because drift on an index is
 * press, never a fact about the commit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compare, walk } from "./lib/listings.mjs";
import { walkVersions } from "./lib/listing-versions.mjs";
import { compareRoster, readRoster, staleRows, STALE_AFTER_DAYS } from "./lib/listing-roster.mjs";

const RECORD = new URL("../docs/listings/observation.json", import.meta.url);
const ROSTER_RECORD = new URL("../docs/listings/roster.json", import.meta.url);
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

if (!flag("json")) {
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

// The second half: what each registry says against what this tree says.
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const local = {
  server: readJson("../server.json"),
  tabServer: readJson("../tab/server.json"),
  packages: ["../cli/package.json", "../tab/package.json", "../verifier/package.json", "../signer/package.json", "../x402-preflight/package.json", "../corpus-client/package.json", "../defects/package.json", "../mcp-starter/package.json"].map((path) => {
    const manifest = readJson(path);
    return { name: manifest.name, version: manifest.version };
  }),
  clawhub: { name: "scvd-general-store", version: readJson("../registry/clawhub/published.json").version },
};
const versions = await walkVersions(base, local);
const drift = versions.rows.filter((r) => r.state === "differs");

// The third half: does every venue we CLAIM still name us? Read before
// the output so one --json document can carry all three batteries.
const roster = await readRoster(base);
const rosterBaseline = existsSync(ROSTER_RECORD) ? JSON.parse(readFileSync(ROSTER_RECORD, "utf8")) : null;
const rosterMoves = compareRoster(rosterBaseline, roster);
const stale = staleRows(roster);

if (flag("json")) {
  // One document for a pipe: the mirrors, the versions and the roster.
  console.log(JSON.stringify({ mirrors: { ...fresh, regressions, advances }, versions, roster: { ...roster, ...rosterMoves, stale } }, null, 2));
} else {
  console.log(`\nTHE VERSIONS AND THE SHELF — read ${versions.read_at.slice(0, 10)}`);
  const width = Math.max(...versions.rows.map((r) => `${r.index} ${r.field}`.length));
  for (const r of versions.rows) {
    const where = `${r.index} ${r.field}`.padEnd(width);
    const detail =
      r.state === "agrees"
        ? `${r.theirs}`
        : r.state === "differs"
          ? `ours ${JSON.stringify(r.ours)} · theirs ${JSON.stringify(r.theirs)}${r.note ? ` — ${r.note}` : ""}`
          : `${r.note ?? ""}`;
    console.log(`${r.state.padEnd(11)} ${where}  ${detail}`);
  }
  const tally = versions.rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
  console.log(`\n${versions.rows.length} facts: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", ")}. Nothing here was written to any index; press is the keeper's.`);
}
if (!flag("json")) {
  console.log(`\nTHE ROSTER — ${roster.records.length} rows read ${roster.read_at.slice(0, 10)}`);
  if (!roster.roster_read) {
    console.log("trust.json could not be read; the roster was not checked this run.");
  } else {
    const tally = roster.records.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
    console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", ") + ".");
    for (const r of rosterMoves.regressions) console.log(`REGRESSED  ${r.registry || r.url}: ${r.was} -> ${r.now}  ${r.url}`);
    for (const a of rosterMoves.advances) console.log(`advanced   ${a.registry || a.url}: ${a.was} -> ${a.now}`);
    if (!rosterBaseline) console.log("No roster baseline yet; --record writes one.");
    if (stale.length > 0) {
      console.log(`\n${stale.length} rows confirmed over ${STALE_AFTER_DAYS} days ago — a look, not a failure:`);
      for (const r of stale.slice(0, 10)) console.log(`  ${String(r.age_days).padStart(4)}d  ${r.registry || r.url}`);
    }
  }
}

if (flag("record") && roster.roster_read) {
  mkdirSync(dirname(ROSTER_RECORD.pathname), { recursive: true });
  writeFileSync(ROSTER_RECORD, `${JSON.stringify(roster, null, 2)}\n`);
  console.log(`Recorded ${roster.records.length} roster rows to ${ROSTER_RECORD.pathname}.`);
}

const fell = regressions.length > 0 || drift.length > 0 || rosterMoves.regressions.length > 0;
if (flag("report-only")) {
  if (fell) console.log("(report only: the drift above is press, not a fact about this commit)");
  process.exit(0);
}
process.exit(fell ? 1 : 0);
