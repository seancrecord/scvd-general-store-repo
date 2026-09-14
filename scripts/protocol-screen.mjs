#!/usr/bin/env node
/**
 * THE PROTOCOL SCREEN RUNNER — two sources, one scorer, one diff.
 *
 * Layer 1, 2 and 5 come from scout.nekuda.ai, which publishes merges
 * across six agentic-web standards with a human-set breaking flag and a
 * written impact line. Layers 3 and 4 — x402, MPP and Tempo's TIPs, the
 * rail we are actually paid over — come from those repositories' own
 * git history, read first-hand. See scripts/lib/git-source.mjs for why
 * git and not the GitHub API, and for what git structurally cannot say.
 *
 * Read-only against the network and against those repositories. Writes
 * two files into a dated run directory and one snapshot the next run
 * diffs against. Never spends, never signs, never prints a secret.
 *
 *   node scripts/protocol-screen.mjs                 # write a dated run
 *   node scripts/protocol-screen.mjs --dry           # print, write nothing
 *   node scripts/protocol-screen.mjs --window=90     # widen a FIRST run
 *   node scripts/protocol-screen.mjs --since=2026-06-16  # git window
 *   node scripts/protocol-screen.mjs --no-git        # scout only
 *
 * research/protocol-screen/rulings.json carries decisions already made:
 * a row a standing ruling covers is reported under it rather than in
 * ACT. Scope rulings expire on purpose — see lib/rulings.mjs.
 *   node scripts/protocol-screen.mjs --force         # replace today's run
 *   node scripts/protocol-screen.mjs --html=path     # screen a saved page
 *
 * The snapshot lives at research/protocol-screen/snapshot.json and is
 * the only piece of state. Delete it and the next run reports a first
 * run — the bounded window — rather than pretending the backlog is news.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCOUT_URL,
  buildReport,
  extractFlight,
  extractProtocols,
  renderMarkdown,
  toSnapshot,
} from "./lib/protocol-screen.mjs";
import { readLayer3 } from "./lib/git-source.mjs";
import { loadRulings } from "./lib/rulings.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(ROOT, "research", "protocol-screen");
const SNAPSHOT = join(HOME, "snapshot.json");
const RULINGS = join(HOME, "rulings.json");

const args = process.argv.slice(2);
const flag = (name, fallback = "") =>
  (args.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=").slice(1).join("=") || fallback;

const dry = args.includes("--dry");
const noGit = args.includes("--no-git");
const htmlPath = flag("html");
const today = flag("today", new Date().toISOString().slice(0, 10));
const firstRunDays = Number(flag("window", "7"));
const cacheDir = flag("cache", join(tmpdir(), "protocol-screen-cache"));

/** The git window defaults to 90 days back from the run date. */
const since = flag("since", new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10));

const runDir = join(HOME, today);

/**
 * A SECOND RUN ON THE SAME DAY MUST NOT EAT THE FIRST.
 *
 * The snapshot advances on every write, so re-running an hour later
 * legitimately reports zero new rows — and without this guard that
 * empty diff overwrites the day's screen.md and merges.json with
 * nothing. The run directory is dated evidence; evidence is not
 * overwritten by a later read that happens to see less. Re-run
 * deliberately with --force, or restore the window by deleting the
 * snapshot.
 */
if (!dry && existsSync(runDir) && !args.includes("--force")) {
  console.error(`protocol-screen: ${runDir} already holds a run for ${today}.`);
  console.error("  Nothing written. Pass --force to replace it, or --dry to print this run.");
  process.exit(2);
}


async function readScout() {
  if (htmlPath) return readFileSync(htmlPath, "utf8");
  const res = await fetch(SCOUT_URL, {
    headers: { "user-agent": "scvd.store protocol screen (+https://scvd.store)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`protocol-screen: scout answered ${res.status}`);
  return res.text();
}

const protocolData = extractProtocols(extractFlight(await readScout()));

const failures = [];
if (noGit) {
  failures.push({
    source: "layer 3 (x402, MPP, Tempo)",
    url: "scripts/lib/git-source.mjs",
    error: "skipped by --no-git on this run",
  });
} else {
  const layer3 = readLayer3({ since, cacheDir });
  Object.assign(protocolData, layer3.map);
  failures.push(...layer3.failures);
}

const previous = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
/*
 * An invalid ledger stops the run rather than being skipped. A screen
 * that silently ignored its own rulings would report settled questions
 * as new, which is the failure the ledger exists to prevent.
 */
const rulings = existsSync(RULINGS) ? loadRulings(readFileSync(RULINGS, "utf8")) : [];
const report = buildReport({
  protocolData,
  today,
  previous,
  firstRunDays,
  failures,
  rulings,
  extraLimits: [`**window** — the git sources were read from ${since} forward; scout's own backlog reaches further back than that.`],
});
const markdown = renderMarkdown(report);

if (dry) {
  console.log(markdown);
  console.log(`\n(dry run — nothing written; ${report.window.length} rows in the window)`);
  process.exit(0);
}

/**
 * A single x402 refactor can touch 300 files. The whole list is needed
 * while scoring (a spec path anywhere in it promotes the row) and is
 * noise once scored, so the run's evidence keeps the spec paths, a
 * sample of the rest, and the true count — never a silently shortened
 * list that reads as complete.
 */
const FILE_SAMPLE = 12;
function trimForDisk(row) {
  if (row.files.length <= FILE_SAMPLE) return row;
  const spec = row.files.filter((f) => /^(specs|tips|pages)\//.test(f));
  const rest = row.files.filter((f) => !spec.includes(f));
  return {
    ...row,
    files: [...spec, ...rest].slice(0, FILE_SAMPLE),
    filesTotal: row.files.length,
    filesTruncated: true,
  };
}

mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, "screen.md"), markdown);
writeFileSync(join(runDir, "merges.json"), `${JSON.stringify(report.window.map(trimForDisk), null, 1)}\n`);
writeFileSync(SNAPSHOT, `${JSON.stringify(toSnapshot(report), null, 1)}\n`);

console.log(`protocol screen ${today}: ${report.window.length} in window — ACT ${report.act.length}, READ ${report.read.length}, LOG ${report.log.length}, ruled ${report.settled.length}`);
for (const r of report.lapsed) console.log(`  LAPSED: ${r.id} expired ${r.covers_until} — renew it or its rows return`);
for (const p of report.proposals) console.log(`  OPEN:   ${p.id} (${p.ageDays}d)`);
for (const f of failures) console.log(`  UNREAD: ${f.source} — ${f.error}`);
console.log(`  ${join(runDir, "screen.md")}`);
