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
  assert.equal(doors.minify, true);
  assert.deepEqual(doors.observability, store.observability);
});

/**
 * LIMITS ARE NOT PART OF WHAT A 402 IS MINTED FROM, and holding them
 * to parity was wrong from 2026-09-08 (RED SINCE, fixed 2026-09-14).
 *
 * The shelf, the KV, the R2 bucket, the vars and the runtime decide
 * what a 402 SAYS, and those stay identical above. `cpu_ms` decides
 * how long a Worker may think, and the two Workers do different
 * amounts of work on purpose: the store rasterizes a PNG face inside
 * the isolate and took its ceiling to 1000 for it (2af67d6, "The face
 * as PNG, rendered inside the Worker with one font"); the doors are a
 * 656 KB router with three import cuts so they carry no delivery code
 * at all, and 100 is the tight ceiling that was chosen for them.
 *
 * The parity assertion did not move when the store's number did, so
 * this file has failed on every clean tree since. Asserting a config
 * fact that is deliberately false is worse than not asserting it: it
 * trains a reader to ignore a red file.
 *
 * What IS still worth holding: the doors must never quietly acquire a
 * larger budget than the store they hand work to.
 */
test("each Worker's cpu ceiling is sized to its own work, and the doors never exceed the store", () => {
  assert.equal(doors.limits.cpu_ms, 100, "the doors are a router; this ceiling is deliberate");
  assert.ok(
    doors.limits.cpu_ms <= store.limits.cpu_ms,
    `doors cpu_ms ${doors.limits.cpu_ms} exceeds the store's ${store.limits.cpu_ms} — the pass-through cannot outspend what it passes to`,
  );
});

test("the doors hand everything else to the store by name", () => {
  assert.deepEqual(doors.services, [{ binding: "STORE", service: store.name }]);
});
