import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const result = await build({ entryPoints: ["scripts/a2a-runner-entry.ts"], bundle: true, write: false, platform: "node", format: "esm", target: "node22", minify: true, legalComments: "none", banner: { js: "// SCVD A2A regression runner. Public HTTPS only. --runtime requires the operator authorization fixture. Exit: 0 observed checks passed; 1 failures; 2 gaps/refusal. Node 22+." } });
const output = result.outputFiles[0].text;
const file = "src/store/a2a-runner.md";
// Text module by design: the Worker serves this program; it never executes it.
if (process.argv.includes("--check")) { if (readFileSync(file, "utf8") !== output) throw new Error("A2A runner is stale: npm run a2a:runner:build"); }
else writeFileSync(file, output);
