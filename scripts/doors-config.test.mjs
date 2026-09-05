/**
 * The doors Worker's config is held to the store's (2026-09-05). A 402
 * minted from a different shelf, a different KV or a different
 * compatibility date is not the store's 402, and the parity test in
 * vitest cannot see wrangler files. This can.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseJsonc } from "./lib/jsonc.mjs";

const store = parseJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const doors = parseJsonc(readFileSync(new URL("../doors/wrangler.jsonc", import.meta.url), "utf8"));

test("the JSONC reader keeps a URL's // inside a string and drops comments", () => {
  assert.deepEqual(parseJsonc('{ /* a */ "u": "https://x/y", // b\n "n": 1, }'), { u: "https://x/y", n: 1 });
});

test("the doors Worker is its own name, entry and route, and nothing of the store's attachment", () => {
  assert.equal(doors.name, "scvd-doors");
  assert.equal(doors.main, "../src/doors.ts");
  assert.deepEqual(doors.routes, [{ pattern: "scvd.store/api/buy/*", zone_name: "scvd.store" }]);
  assert.equal(doors.triggers, undefined, "the wards run in the store; a second cron would double every round");
  assert.equal(doors.durable_objects, undefined, "the trade counter lives in the store");
  assert.equal(doors.migrations, undefined);
  assert.equal(store.routes.some((r) => r.custom_domain === true && r.pattern === "scvd.store"), true, "the store keeps its custom domain");
});

test("what the 402 is minted from is identical: runtime, KV, R2, vars", () => {
  assert.equal(doors.compatibility_date, store.compatibility_date);
  assert.deepEqual(doors.compatibility_flags, store.compatibility_flags);
  assert.deepEqual(doors.kv_namespaces, store.kv_namespaces);
  assert.deepEqual(doors.r2_buckets, store.r2_buckets);
  assert.deepEqual(doors.vars, store.vars);
  assert.deepEqual(doors.limits, store.limits);
  assert.equal(doors.minify, true);
  assert.deepEqual(doors.observability, store.observability);
});

test("the doors hand everything else to the store by name", () => {
  assert.deepEqual(doors.services, [{ binding: "STORE", service: store.name }]);
});
