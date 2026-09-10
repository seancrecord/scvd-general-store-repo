import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadBazaarSchemas } from "./lib/load-bazaar-schemas.mjs";
const patterns = [];
function walk(item, value, path = "schema") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "pattern" && typeof child === "string") patterns.push({ item, path: `${path}.${key}`, pattern: child });
    walk(item, child, `${path}.${key}`);
  }
}
for (const { item, schema } of await loadBazaarSchemas()) walk(item, schema);
if (!patterns.length) throw new Error("No published patterns were read; the checker did not run.");
const result = spawnSync(process.env.BAZAAR_GO_BINARY || "go", ["run", fileURLToPath(new URL("./bazaar-regex-check.go", import.meta.url))], { input: JSON.stringify(patterns), encoding: "utf8" });
if (result.error) { console.error("Go is required for this compatibility check; set BAZAAR_GO_BINARY if it is not on PATH."); process.exit(2); }
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 2);
