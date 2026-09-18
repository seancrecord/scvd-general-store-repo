#!/usr/bin/env node
/**
 * THE UCP CONFORMANCE GATE.
 *
 *   npm run ucp:conformance
 *
 * Validates what this store actually emits — the business profile, the
 * catalog search and lookup responses, a checkout in both its quoted
 * and completed states, and the order in both its fulfillment shapes
 * — against the
 * Universal Commerce Protocol's own JSON Schemas, vendored verbatim at
 * the release this store implements (schemas/ucp/vendor/2026-08-25,
 * provenance beside them).
 *
 * WHY THIS EXISTS, and what it caught on its first run.
 *
 * The catalog was built from a careful reading of the protocol's
 * documentation and it was wrong in five ways that no internal test
 * could see, because every internal test was written from the same
 * reading:
 *
 *   1. Catalog search and lookup are POST with JSON bodies. This store
 *      served GET with query strings — an endpoint no conforming
 *      platform would ever call.
 *   2. Lookup is a BATCH over `ids[]`, and its variants must carry
 *      `inputs[]` saying which identifier resolved to which variant.
 *   3. `categories` are `{value, taxonomy}` objects, not strings.
 *   4. A policy's `description` is a description object, not a string,
 *      and policies ride the RESPONSE with a JSONPath `applies_to`,
 *      not the product.
 *   5. A business profile MUST declare `payment_handlers`. This one
 *      deliberately omitted them, which made it invalid rather than
 *      cautious.
 *
 * A validator you wrote against your own understanding tests your
 * understanding twice. This one tests it against the specification.
 *
 * NOT A SUBSTITUTE FOR THE BEHAVIOURAL SUITE. Passing here means the
 * shapes are right. Whether the store is economically safe is
 * test/ucp/'s question, and neither answers the other.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
/**
 * The 2020-12 build, not ajv's default. Every one of these schemas
 * declares `$schema: .../draft/2020-12/schema`, and the default export
 * speaks draft-07: it refuses them outright rather than mis-reading
 * them, which is the right failure and still a failure.
 */
import Ajv from "ajv/dist/2020.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "schemas", "ucp", "vendor", "2026-08-25");
const BASE = "https://scvd.store";

/* ------------------------------------------------------------------ *
 * The vendored schemas, registered by their own $id.
 * ------------------------------------------------------------------ */

function schemaFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...schemaFiles(path));
    else if (entry.endsWith(".json")) found.push(path);
  }
  return found;
}

const files = schemaFiles(VENDOR);
if (files.length === 0) {
  console.error(`\nNo vendored schemas under ${relative(ROOT, VENDOR)}. Nothing to validate against.`);
  process.exit(1);
}

/**
 * `strict: false` because these are somebody else's schemas and they
 * use annotation keywords ajv does not model (`ucp_request`, `name`).
 * Refusing to load a valid schema over an unknown annotation would
 * make this gate unable to read the specification it exists to check.
 * `validateFormats: false` for the same reason one step down: `format`
 * is annotation-only in 2020-12 and the store does not want a URI
 * dialect argument deciding whether its catalog conforms.
 */
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });

for (const file of files) {
  const schema = JSON.parse(readFileSync(file, "utf8"));
  if (typeof schema.$id === "string") ajv.addSchema(schema, schema.$id);
}

/* ------------------------------------------------------------------ *
 * The store's own output, bundled out of TypeScript so this gate reads
 * the same code the Worker runs rather than a fixture somebody
 * remembered to regenerate.
 * ------------------------------------------------------------------ */

const work = mkdtempSync(join(tmpdir(), "ucp-conformance-"));
const entry = join(work, "entry.mjs");
const bundle = join(work, "bundle.mjs");

execFileSync(join(ROOT, "node_modules", ".bin", "esbuild"), [
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--log-level=error",
  `--alias:@=${join(ROOT, "src")}`,
  `--outfile=${bundle}`,
  join(ROOT, "scripts", "lib", "ucp-sample.ts"),
], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });

const {
  profileSample,
  searchSample,
  lookupSample,
  checkoutSample,
  completedCheckoutSample,
  instantOrderSample,
  queuedOrderSample,
} = await import(pathToFileURL(bundle).href);

const samples = [
  {
    name: "business profile",
    id: "https://ucp.dev/schemas/profile.json#/$defs/business_schema",
    value: profileSample(BASE),
    served_at: "/.well-known/ucp",
  },
  {
    name: "catalog search response",
    id: "https://ucp.dev/schemas/shopping/catalog_search.json#/$defs/search_response",
    value: searchSample(BASE),
    served_at: "POST /ucp/v1/catalog/search",
  },
  {
    name: "checkout, holding a live quote",
    id: "https://ucp.dev/schemas/shopping/checkout.json",
    value: checkoutSample(BASE),
    served_at: "GET /ucp/v1/checkout-sessions/{id}",
  },
  {
    name: "checkout, completed, carrying its order",
    id: "https://ucp.dev/schemas/shopping/checkout.json",
    value: completedCheckoutSample(BASE),
    served_at: "POST /ucp/v1/checkout-sessions/{id}/complete",
  },
  {
    name: "order, instant goods delivered at settlement",
    id: "https://ucp.dev/schemas/shopping/order.json",
    value: instantOrderSample(BASE),
    served_at: "GET /ucp/v1/orders/{id}",
  },
  {
    name: "order, a human work-order still in its queue",
    id: "https://ucp.dev/schemas/shopping/order.json",
    value: queuedOrderSample(BASE),
    served_at: "GET /ucp/v1/orders/{id}",
  },
  {
    name: "catalog lookup response",
    id: "https://ucp.dev/schemas/shopping/catalog_lookup.json#/$defs/lookup_response",
    value: lookupSample(BASE),
    served_at: "POST /ucp/v1/catalog/lookup",
  },
];

let failed = 0;
console.log(`\nUCP conformance — ${files.length} vendored schemas, release 2026-08-25.\n`);

for (const sample of samples) {
  let validate;
  try {
    validate = ajv.getSchema(sample.id);
  } catch (err) {
    console.error(`  ${sample.name}: could not compile ${sample.id}\n    ${err.message}`);
    failed += 1;
    continue;
  }
  if (!validate) {
    console.error(`  ${sample.name}: no schema registered at ${sample.id}`);
    failed += 1;
    continue;
  }
  if (validate(sample.value)) {
    console.log(`  ok    ${sample.name}  (${sample.served_at})`);
    continue;
  }
  failed += 1;
  console.error(`  FAIL  ${sample.name}  (${sample.served_at})`);
  for (const error of (validate.errors ?? []).slice(0, 20)) {
    console.error(`          ${error.instancePath || "/"} ${error.message}`);
  }
}

rmSync(work, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} of ${samples.length} documents do not conform. The specification is in schemas/ucp/vendor/2026-08-25; this store is wrong, not it.\n`);
  process.exit(1);
}

console.log(`\nAll ${samples.length} documents conform.`);
console.log("\nWhat a clean run does not prove");
console.log("  - That the values are right. A schema checks shape: a correctly-shaped price can still be the wrong price.");
console.log("  - That the store is safe to transact with. That is test/ucp/'s question.");
console.log("  - That the vendored copy is current. spec-pins watches the upstream ref for that.\n");
