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
 * EXIT CODES: 0 no regression and no drift; 1 a mirror regressed or a
 * registry differs from the tree; 2 the homepage could not be read at
 * all. --report-only prints everything and exits 0 unless the
 * homepage was unreadable: the shape a pull request's push runs in,
 * because drift on an index is press, never a fact about the commit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compare, walk } from "./lib/listings.mjs";
import { walkVersions } from "./lib/listing-versions.mjs";

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
  packages: ["../cli/package.json", "../tab/package.json", "../verifier/package.json", "../signer/package.json"].map((path) => {
    const manifest = readJson(path);
    return { name: manifest.name, version: manifest.version };
  }),
  clawhub: { name: "scvd-general-store", version: readJson("../registry/clawhub/published.json").version },
};
const versions = await walkVersions(base, local);
const drift = versions.rows.filter((r) => r.state === "differs");
if (flag("json")) {
  // One document for a pipe: the mirrors and the versions together.
  console.log(JSON.stringify({ mirrors: { ...fresh, regressions, advances }, versions }, null, 2));
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
if (flag("report-only")) {
  if (regressions.length > 0 || drift.length > 0) console.log("(report only: the drift above is press, not a fact about this commit)");
  process.exit(0);
}
process.exit(regressions.length > 0 || drift.length > 0 ? 1 : 0);
