import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { parseJsonc } from "./lib/jsonc.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const store = parseJsonc(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
const config = join(root, ".build-check/mpp-sdk/wrangler.json");
mkdirSync(dirname(config), { recursive: true });
writeFileSync(config, JSON.stringify({
  name: "scvd-mpp-sdk-build-probe",
  main: relative(dirname(config), join(root, "test/fixtures/mpp-sdk-build.ts")),
  compatibility_date: store.compatibility_date,
  compatibility_flags: store.compatibility_flags,
  rules: store.rules,
}));
// No deployment, bindings, secrets or outward payment. This deliberately adds
// a bundle containing the SDK while both production entries still omit it.
const result = spawnSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"),
  "deploy", "--dry-run", "--config", config, "--outdir", join(root, ".build-check/mpp-sdk/bundle"),
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
