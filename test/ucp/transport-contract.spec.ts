import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";
import contract from "../../schemas/ucp/vendor/2026-08-25-rest/shopping.openapi.json";

/**
 * EVERY OPERATION OF EVERY CAPABILITY THIS STORE ADVERTISES IS SERVED.
 *
 * The profile is a promise: a capability in `ucp.capabilities` tells a
 * platform it may negotiate that capability and call its operations.
 * WHICH operations those are is not in the capability schema — it is
 * in the REST transport contract, which until 2026-09-19 this repo
 * watched through spec-pins and never read in CI. So the store shipped
 * a launch advertising `dev.ucp.shopping.checkout` and
 * `dev.ucp.shopping.catalog.lookup` while serving neither Update
 * Checkout (PUT /checkout-sessions/{id}) nor Get Product
 * (POST /catalog/product). Nothing was wrong with the code that
 * existed; what was missing was code, and no test can miss code by
 * reading the code.
 *
 * So this one reads the CONTRACT, vendored verbatim beside the
 * schemas, and joins it to the profile the store actually serves.
 *
 * THE JOIN IS DERIVED, NOT TYPED. An operation's owning capability is
 * not written down here: it is read off the schema file the
 * operation's request and response bodies point at
 * (`catalog_lookup.json` → `dev.ucp.shopping.catalog.lookup`), and
 * matched against the `schema` URL the profile publishes for each
 * capability it advertises. A hand-written map would be one more
 * thing to forget, and forgetting is the defect this file exists for.
 * The transport prefix is read off the profile's own service endpoint
 * for the same reason.
 *
 * Carts are in the contract and are not advertised here; they are
 * skipped by the same derivation rather than by an exception, because
 * nothing in the profile claims them.
 */

const BASE = "https://scvd.store";

type Json = Record<string, unknown>;
const doc = contract as unknown as {
  paths: Record<string, Record<string, Json>>;
  components: { schemas: Record<string, Json> };
};

/** The HTTP methods an OpenAPI path item can carry. Everything else is metadata. */
const METHODS = ["get", "put", "post", "delete", "patch"] as const;

/**
 * Every `$ref` an operation reaches, following the contract's own
 * `#/components/schemas/*` indirections — which is where the schema
 * file, and so the capability, is actually named.
 */
function schemaRefs(value: unknown, seen = new Set<string>()): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Json)) {
      if (key === "$ref" && typeof child === "string") {
        if (seen.has(child)) continue;
        seen.add(child);
        const component = child.match(/^#\/components\/schemas\/(.+)$/);
        if (component) {
          walk(doc.components.schemas[component[1]!]);
          continue;
        }
        found.add(child);
        continue;
      }
      walk(child);
    }
  };
  walk(value);
  return found;
}

/** `../../schemas/shopping/checkout.json#/$defs/...` → `checkout.json`. */
function shoppingSchemaFiles(refs: Set<string>): Set<string> {
  const files = new Set<string>();
  for (const ref of refs) {
    const match = ref.match(/schemas\/shopping\/([a-z_]+\.json)/);
    if (match) files.add(match[1]!);
  }
  return files;
}

interface Operation {
  id: string;
  method: string;
  path: string;
  schemaFiles: Set<string>;
}

function contractOperations(): Operation[] {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const operation = item[method] as Json | undefined;
      if (!operation) continue;
      operations.push({
        id: String(operation.operationId ?? `${method} ${path}`),
        method: method.toUpperCase(),
        path,
        schemaFiles: shoppingSchemaFiles(schemaRefs(operation)),
      });
    }
  }
  return operations;
}

/** `/checkout-sessions/{id}` and `/checkout-sessions/:id` compare equal. */
function shape(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}").replace(/:[^/]+/g, "{}");
}

async function profile(): Promise<Json> {
  return (await (await SELF.fetch(`${BASE}/.well-known/ucp`)).json()) as Json;
}

describe("the REST transport contract, against what this store advertises", () => {
  it("serves every operation of every capability the profile advertises", async () => {
    const published = (await profile()).ucp as Json;
    const endpoint = String(
      ((published.services as Json)["dev.ucp.shopping"] as Json[])[0]!.endpoint,
    );
    const prefix = new URL(endpoint).pathname;

    /** capability schema file (checkout.json, …) → the capability advertising it. */
    const advertised = new Map<string, string>();
    for (const [name, instances] of Object.entries(published.capabilities as Record<string, Json[]>)) {
      for (const instance of instances) {
        const file = String(instance.schema ?? "").match(/\/shopping\/([a-z_]+\.json)$/);
        if (file) advertised.set(file[1]!, name);
      }
    }
    // The launch this suite runs with advertises checkout; if it ever
    // does not, this test is checking nothing and should say so.
    expect([...advertised.keys()].sort()).toContain("checkout.json");

    const served = new Set(
      app.routes
        .filter((route) => route.path.startsWith(prefix))
        .map((route) => `${route.method} ${shape(route.path)}`),
    );

    const missing: string[] = [];
    for (const operation of contractOperations()) {
      const owners = [...operation.schemaFiles]
        .map((file) => advertised.get(file))
        .filter((name): name is string => Boolean(name));
      if (owners.length === 0) continue;
      const route = `${operation.method} ${shape(`${prefix}${operation.path}`)}`;
      if (!served.has(route)) {
        missing.push(`${operation.id} (${route}), required by ${owners.join(", ")}`);
      }
    }

    expect(
      missing,
      "Advertising a capability promises its operations. Serve these, or stop advertising the capability.",
    ).toEqual([]);
  });

  it("serves nothing under the transport prefix the contract does not define, except the spellings it names as its own", async () => {
    const prefix = "/ucp/v1";

    /**
     * The two non-normative GET spellings, kept for people with
     * browsers and crawlers with no POST, marked as not-the-protocol
     * in the service index itself. They are the only paths under the
     * transport prefix that answer something the contract does not
     * define, and they shadow operations the contract DOES define at
     * the same paths.
     */
    const NON_NORMATIVE = new Set([
      "GET /ucp/v1/catalog/search",
      "GET /ucp/v1/catalog/lookup",
      // The service index itself: the endpoint the profile points at,
      // which must answer rather than 404 for a reader that follows it.
      "GET /ucp/v1",
    ]);

    const defined = new Set(
      contractOperations().map((operation) => `${operation.method} ${shape(`${prefix}${operation.path}`)}`),
    );
    const invented = app.routes
      .filter((route) => route.path.startsWith(prefix) && route.method !== "ALL" && route.method !== "OPTIONS")
      .map((route) => `${route.method} ${shape(route.path)}`)
      .filter((route) => !defined.has(route) && !NON_NORMATIVE.has(route));

    expect(
      [...new Set(invented)],
      "A path under the transport prefix that the contract does not define is a path no conforming platform will call.",
    ).toEqual([]);
  });
});
