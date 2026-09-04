import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ledgerFiles, renderIndex } from "./corrections-index.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "store", "corrections-ledger");

test("the committed index is exactly what the directory would generate", () => {
  const files = ledgerFiles(readdirSync(dir));
  assert.ok(files.length >= 30, `only ${files.length} ledger files`);
  assert.equal(readFileSync(join(dir, "index.ts"), "utf8"), renderIndex(files),
    "index.ts is stale: run `npm run corrections:index`");
});

test("orders newest first, and totally", () => {
  const files = ledgerFiles(["2026-09-03-b.ts", "2026-09-04-a.ts", "types.ts", "index.ts", "2026-09-04-b.ts"]);
  assert.deepEqual(files, ["2026-09-04-b.ts", "2026-09-04-a.ts", "2026-09-03-b.ts"]);
});
