#!/usr/bin/env node
/**
 * x402-preflight <url> [<url>…] [--fail-on not_ready,unreachable] [--base <origin>] [--json]
 * The deploy gate's law, from the command line. Exit 0 ready, 1 a
 * verdict in --fail-on, 2 refused before probing, 3 the store did not
 * answer.
 */
import { EXIT, exitCodeFor, preflightMany, renderLines } from "./x402-preflight.js";

const argv = process.argv.slice(2);
const urls = [];
let failOn = ["not_ready"];
let base;
let json = false;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--fail-on") failOn = String(argv[(i += 1)] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  else if (a === "--base") base = argv[(i += 1)];
  else if (a === "--json") json = true;
  else if (a.startsWith("--")) { process.stderr.write(`unknown flag ${a}\n`); process.exit(EXIT.usage); }
  else urls.push(a);
}
if (urls.length === 0) {
  process.stderr.write("usage: x402-preflight <url> [<url>…] [--fail-on not_ready,unreachable] [--base <origin>] [--json]\n");
  process.exit(EXIT.usage);
}
const results = await preflightMany(urls, base ? { base } : {});
if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
else for (const result of results) process.stdout.write(`${renderLines(result).join("\n")}\n`);
process.exit(exitCodeFor(results, failOn));
