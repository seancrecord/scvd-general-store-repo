#!/usr/bin/env node
/**
 * THE PROTOCOL SCREEN RUNNER — one read of scout.nekuda.ai, scored
 * against this store's surfaces, diffed against the last run.
 *
 * Read-only against the network. Writes two files into a dated run
 * directory and one snapshot the next run diffs against. Never spends,
 * never signs, never prints a secret.
 *
 *   node scripts/protocol-screen.mjs                 # write a dated run
 *   node scripts/protocol-screen.mjs --dry           # print, write nothing
 *   node scripts/protocol-screen.mjs --html=path     # screen a saved page
 *   node scripts/protocol-screen.mjs --window=90     # widen a FIRST run
 *
 * The snapshot lives at research/protocol-screen/snapshot.json and is
 * the only piece of state. Delete it and the next run reports a first
 * run — seven days of merges — rather than pretending 800 are news.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = join(ROOT, "research", "protocol-screen");
const SNAPSHOT = join(HOME, "snapshot.json");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const htmlArg = args.find((a) => a.startsWith("--html="));
const today = (args.find((a) => a.startsWith("--today=")) ?? "").split("=")[1] || new Date().toISOString().slice(0, 10);
const firstRunDays = Number((args.find((a) => a.startsWith("--window=")) ?? "").split("=")[1] || 7);

async function readPage() {
  if (htmlArg) return readFileSync(htmlArg.split("=")[1], "utf8");
  const res = await fetch(SCOUT_URL, {
    headers: { "user-agent": "scvd.store protocol screen (+https://scvd.store)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`protocol-screen: scout answered ${res.status}`);
  return res.text();
}

const html = await readPage();
const protocolData = extractProtocols(extractFlight(html));
const previous = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
const report = buildReport({ protocolData, today, previous, firstRunDays });
const markdown = renderMarkdown(report);

if (dry) {
  console.log(markdown);
  console.log(`\n(dry run — nothing written; ${report.window.length} merges in the window)`);
  process.exit(0);
}

const runDir = join(HOME, today);
mkdirSync(runDir, { recursive: true });
writeFileSync(join(runDir, "screen.md"), markdown);
writeFileSync(join(runDir, "merges.json"), `${JSON.stringify(report.window, null, 1)}\n`);
writeFileSync(SNAPSHOT, `${JSON.stringify(toSnapshot(report), null, 1)}\n`);

console.log(`protocol screen ${today}: ${report.window.length} in window — ACT ${report.act.length}, READ ${report.read.length}, LOG ${report.log.length}`);
console.log(`  ${join(runDir, "screen.md")}`);
