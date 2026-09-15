#!/usr/bin/env node
/**
 * Generate docs/X402_EXTENSION_COVERAGE.md from the specification's
 * own tree.
 *
 *   node scripts/extension-coverage.mjs          # write the matrix
 *   node scripts/extension-coverage.mjs --check  # fail if it is stale
 *
 * `--check` is the CI shape: it regenerates and compares, so a matrix
 * that has drifted from the spec — or from COVERAGE — is a red build
 * rather than a table nobody re-read.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYER3 } from "./lib/git-source.mjs";
import { cloneAtHead } from "./lib/spec-pins.mjs";
import { parseExtension, reconcile, renderMatrix } from "./lib/extension-coverage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "X402_EXTENSION_COVERAGE.md");

const args = process.argv.slice(2);
const check = args.includes("--check");
const cacheDir = (args.find((a) => a.startsWith("--cache=")) ?? "").split("=")[1] || join(tmpdir(), "extension-coverage-cache");
const today = (args.find((a) => a.startsWith("--today=")) ?? "").split("=")[1] || new Date().toISOString().slice(0, 10);

const x402 = LAYER3.find((s) => s.key === "x402");
const dir = cloneAtHead(x402.url, join(cacheDir, "x402"));

const git = (a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const paths = git(["ls-tree", "--name-only", "HEAD", "specs/extensions/"])
  .split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".md"));

if (paths.length === 0) {
  throw new Error("extension-coverage: specs/extensions/ is empty — the read is broken, not the specification");
}

const extensions = paths.map((p) => parseExtension(git(["show", `HEAD:${p}`]), p));
const { unclassified, stale, ok } = reconcile(extensions);

if (!ok) {
  for (const id of unclassified) {
    console.error(`extension-coverage: the specification publishes \`${id}\` and COVERAGE has no row for it.`);
    console.error("  A new extension is a decision. Add a row saying whether we read it and what reading would cost.");
  }
  for (const id of stale) {
    console.error(`extension-coverage: COVERAGE claims \`${id}\`, which the specification no longer publishes. Remove or re-check it.`);
  }
  process.exit(2);
}

const matrix = renderMatrix(extensions, undefined, today);

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const normalise = (s) => s.replace(/^\*\*Generated \d{4}-\d{2}-\d{2}/m, "**Generated");
  if (normalise(current) !== normalise(matrix)) {
    console.error("extension-coverage: docs/X402_EXTENSION_COVERAGE.md is stale. Run `npm run extension-coverage`.");
    process.exit(1);
  }
  console.log(`extension-coverage: matrix current — ${extensions.length} extensions, all classified.`);
  process.exit(0);
}

writeFileSync(OUT, matrix);
console.log(`extension-coverage: ${extensions.length} extensions, all classified.`);
console.log(`  ${OUT}`);
