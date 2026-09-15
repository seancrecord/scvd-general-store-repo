#!/usr/bin/env node
/**
 * npm run oasf:cut — write registry/agntcy/record.json from the
 * store's own source.
 *
 * The file is what gets pushed to an AGNTCY Directory node
 * (`dirctl push`), and a pushed record is immutable by CID. So the one
 * way it is written is from src/lib/oasf-record.ts, through the same
 * esbuild trick scripts/cut-defects.mjs uses to read a TypeScript
 * source of truth from a plain script. Hand-editing the JSON would put
 * a second definition of the store's identity in the tree, and the
 * CID would freeze whichever one was pushed.
 *
 * test/oasf-record.spec.ts holds the cut file to the source and names
 * this script, so a stale snapshot fails the suite rather than
 * quietly shipping.
 */
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = new URL("..", import.meta.url).pathname;

/** The origin the record's tool list is built against; server.json's own. */
export const RECORD_ORIGIN = JSON.parse(
  readFileSync(join(REPO, "server.json"), "utf8"),
).websiteUrl;

/** Bundle the TypeScript record builder and hand back the module. */
export async function loadRecordModule() {
  const out = join(mkdtempSync(join(tmpdir(), "scvd-oasf-")), "oasf-record.mjs");
  await build({
    entryPoints: [join(REPO, "src/lib/oasf-record.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: out,
    logLevel: "silent",
    alias: { "@": join(REPO, "src") },
  });
  return import(pathToFileURL(out).href);
}

/** The record, as JSON text with the trailing newline the tree keeps. */
export async function cutRecord() {
  const { oasfRecord } = await loadRecordModule();
  return `${JSON.stringify(oasfRecord(RECORD_ORIGIN), null, 2)}\n`;
}

export const RECORD_PATH = join(REPO, "registry", "agntcy", "record.json");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const json = await cutRecord();
  writeFileSync(RECORD_PATH, json);
  const record = JSON.parse(json);
  const tools = record.modules.find((m) => m.name === "integration/mcp").data.tools.length;
  console.log(
    `registry/agntcy/record.json: OASF ${record.schema_version}, ${record.name} v${record.version}, ` +
      `${record.skills.length} skills, ${record.domains.length} domains, ${tools} tools`,
  );
}
