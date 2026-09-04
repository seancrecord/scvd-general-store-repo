#!/usr/bin/env node
/**
 * Re-cut defects/defects.json from the tree's own vocabulary (roadmap
 * C5b). The package ships the vocabulary as data; this is the one way
 * the file is written, so it cannot drift from src/store/defect-
 * vocabulary.ts by hand. test/packages.spec.ts fails when the snapshot
 * is behind, and names this script.
 */
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(mkdtempSync(join(tmpdir(), "scvd-defects-")), "vocabulary.mjs");
await build({
  entryPoints: [new URL("../src/store/defect-vocabulary.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "silent",
  alias: { "@": new URL("../src", import.meta.url).pathname },
});
const vocabulary = await import(pathToFileURL(out).href);
const snapshot = {
  what_this_is:
    "A snapshot of https://scvd.store/defects.json cut from the store's own source at the version below (npm run defects:cut). The live document is the authority; fetchLatest() reads it, and isStale() says whether this file is behind.",
  version: vocabulary.DEFECT_VOCABULARY_VERSION,
  url: "https://scvd.store/defects",
  cross_instrument_mappings_read_on: vocabulary.MAPPINGS_READ_ON,
  classes: vocabulary.DEFECT_CLASSES,
  evidence_labels: vocabulary.EVIDENCE_LABELS,
  changelog: vocabulary.VOCABULARY_CHANGELOG,
  license: "CC BY 4.0 for the names; MIT for the code that carries them.",
};
const target = new URL("../defects/defects.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`defects/defects.json: vocabulary v${snapshot.version}, ${snapshot.classes.length} classes, ${snapshot.evidence_labels.length} evidence labels`);
