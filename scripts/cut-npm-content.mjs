#!/usr/bin/env node
/**
 * npm run npm-content:cut — record what each publishable package's
 * shipped bytes are, at the version they are shipped under.
 *
 * WHY THIS EXISTS, AND THE DAY IT WAS OWED. scvd-defects 0.14.0 was
 * published on 2026-09-12 at 18:32Z. At 20:25Z the fixture-provenance
 * change merged, which rewrote every file under `defects/fixtures/`.
 * The version was not bumped, because nothing said it had to be: the
 * suite held the package's fixture copies to the tree's copies, and
 * both moved together. So the tree and the registry then disagreed
 * about what `scvd-defects@0.14.0` contains, and every check we own
 * was green. `npm run listings:check` compares npm's dist-tag against
 * the manifest and reported "agrees", correctly and uselessly: the
 * numbers matched and the bytes did not.
 *
 * WHAT THIS RECORDS, AND WHAT IT DOES NOT. The record is a per-file
 * sha256 of exactly the files each package ships (its `files` list,
 * directories expanded, plus package.json, which npm always includes).
 * It is a statement about THIS TREE at THIS VERSION and says nothing
 * about a registry — no network is touched here. What it buys is the
 * refusal below.
 *
 * THE REFUSAL. If a package's shipped bytes differ from the record
 * while its version is unchanged, this script writes nothing and exits
 * 1, naming the files. The fix is to bump the version (and add the
 * changelog entry the package's own suite already requires), then run
 * this again. That is the same shape as scripts/publish-skill.mjs,
 * which refuses to publish a new version over byte-identical contents:
 * one refuses a version without a change, this refuses a change
 * without a version.
 *
 * WHAT STILL NEEDS A HUMAN. Nothing here publishes. Once a version is
 * bumped, `npm run listings:check` reads the registry and reports the
 * tree ahead of npm until somebody presses the publish workflow —
 * house rule 30, intact.
 *
 * test/packages.spec.ts holds this record to the tree, so a stale
 * record fails the build rather than quietly disarming the refusal.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative } from "node:path";

/** The publishable set, in the order publish-npm.yml lists them. */
export const PACKAGES = ["x402-preflight", "corpus-client", "defects", "mcp-starter"];

const REPO = new URL("..", import.meta.url).pathname;
const RECORD = join(REPO, "registry", "npm-content.json");

/** Every file a package ships: its `files` list with directories expanded, plus package.json. */
export function shippedFiles(dir) {
  const root = join(REPO, dir);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const out = ["package.json"];
  for (const entry of manifest.files ?? []) {
    const path = join(root, entry);
    if (!existsSync(path)) {
      throw new Error(`${dir}/package.json ships ${entry}, which is not in the tree`);
    }
    if (statSync(path).isDirectory()) {
      out.push(...walk(path).map((file) => posix.join(...relative(root, file).split(/[\\/]/))));
    } else {
      out.push(entry.replace(/\/$/, ""));
    }
  }
  // Sorted so the record's order is the tree's, not the manifest's.
  return { version: manifest.version, files: out.sort() };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function digestOf(dir, files) {
  const out = {};
  for (const file of files) {
    out[file] = createHash("sha256").update(readFileSync(join(REPO, dir, file))).digest("hex");
  }
  return out;
}

export function cut() {
  const record = {};
  for (const dir of PACKAGES) {
    const { version, files } = shippedFiles(dir);
    const manifest = JSON.parse(readFileSync(join(REPO, dir, "package.json"), "utf8"));
    record[manifest.name] = { directory: dir, version, files: digestOf(dir, files) };
  }
  return record;
}

function main() {
  const held = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : { packages: {} };
  const fresh = cut();
  const refusals = [];
  for (const [name, entry] of Object.entries(fresh)) {
    const before = held.packages?.[name];
    if (!before) continue;
    if (before.version !== entry.version) continue;
    const changed = [
      ...Object.keys(entry.files).filter((file) => before.files[file] !== entry.files[file]),
      ...Object.keys(before.files).filter((file) => !(file in entry.files)),
    ].sort();
    if (changed.length) {
      refusals.push(`${name} @ ${entry.version}: ${changed.length} shipped file(s) changed — ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ", …" : ""}`);
    }
  }
  if (refusals.length) {
    console.error("REFUSED. Shipped bytes changed under an unchanged version:\n");
    for (const line of refusals) console.error(`  ${line}`);
    console.error("\nBump the version in that package's package.json (and add its CHANGELOG entry), then run this again.");
    process.exit(1);
  }
  const document = {
    what_this_is:
      "Per-file sha256 of exactly the files each publishable package ships, at the version in its manifest. A statement about this tree, never about a registry: npm run npm-content:cut writes it, and it refuses to record changed bytes under an unchanged version. test/packages.spec.ts holds it to the tree.",
    cut_by: "npm run npm-content:cut",
    packages: fresh,
  };
  writeFileSync(RECORD, `${JSON.stringify(document, null, 2)}\n`);
  for (const [name, entry] of Object.entries(fresh)) {
    console.log(`${name} @ ${entry.version}: ${Object.keys(entry.files).length} shipped files`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
