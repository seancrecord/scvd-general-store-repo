import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { openapiRoutes, PAYMENT_CHALLENGE_HEADERS } from "@/routes/openapi";
import { A2A_DESK_SCHEMA, A2A_KIT_SCHEMA, A2A_RECHECK_SCHEMA } from "@/lib/a2a-desk-schema";
import { SCANNER_BUDGET_BYTES } from "@/store/reader-limits";
import { KV_KEYS } from "@/lib/kv-keys";
import sharedSchemas from "./fixtures/openapi-shared-schemas.json";
import type { Env } from "@/types";
import { productionShape } from "./helpers/production-shape";
import { nativeMcpCheckoutShape, nativeWebmcpCheckoutShape } from "@/lib/purchase-capabilities";

// Golden schemas in fixtures/openapi-shared-schemas.json were captured from
// 9d04efe5 before component reuse, not generated from the code under test.
// Keep rail recipients and enabled lanes aligned with the other size guards.
const allRails = productionShape(env as Env);

// Resolve the contract the same way an OpenAPI client does. Comparing the
// expanded schema with the shared source catches dropped or changed fields.
function expand(value: unknown, document: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map(v => expand(v, document));
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (typeof object.$ref === "string") {
    expect(object.$ref.startsWith("#/components/")).toBe(true);
    let target: unknown = document;
    for (const part of object.$ref.slice(2).split("/")) {
      target = (target as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    expect(target, object.$ref).toBeDefined();
    return expand(target, document);
  }
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, expand(v, document)]));
}

describe("OpenAPI headroom with all checkout rails enabled", () => {
  it("counts UTF-8 bytes and stays within the reader budget", async () => {
    const response = await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails);
    expect(response.status).toBe(200);
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    console.log(JSON.stringify({ openapi_bytes: bytes, headroom_bytes: SCANNER_BUDGET_BYTES - bytes }));

    expect(bytes, `${bytes} bytes with every rail and the native lane, against the ${SCANNER_BUDGET_BYTES}-byte scanner budget: move what got inlined into components; do not raise the number`).toBeLessThan(SCANNER_BUDGET_BYTES);
  });

  it("leaves room for a spot-check-sized door and a month of keeper pages", async () => {
    // A bounded growth case, not a claim that an arbitrary future feature fits.
    // Long valid slugs include more bytes than the current saved titles.
    const slugs = Array.from({ length: 31 }, (_, i) => `budget-${i}-`.padEnd(80, "a"));
    try {
      await Promise.all(slugs.map(slug => allRails.ORDERS.put(KV_KEYS.almanacEntry(slug), JSON.stringify({
        slug, title: "Budget fixture", date: "2026-09-23", teaser: "Fixture", markdown: "Fixture",
      }))));
      const document = await (await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails)).json() as Record<string, unknown>;
      const paths = document.paths as Record<string, unknown>;
      paths["/api/buy/growth-fixture"] = paths["/api/buy/spot_check"];
      const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
      console.log(JSON.stringify({ growth_bytes: bytes, growth_headroom_bytes: SCANNER_BUDGET_BYTES - bytes }));
      expect(bytes, `${bytes} bytes after one representative paid door and 31 long saved slugs`).toBeLessThan(SCANNER_BUDGET_BYTES);
    } finally {
      await Promise.all(slugs.map(slug => allRails.ORDERS.delete(KV_KEYS.almanacEntry(slug))));
    }
  });

  it("preserves the expanded shared schemas captured before the reduction", async () => {
    const document = await (await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails)).json() as Record<string, unknown>;
    for (const { pointers, schema } of sharedSchemas) for (const pointer of pointers) {
      let value: unknown = document;
      for (const part of pointer.slice(1).split("/")) {
        value = (value as Record<string, unknown>)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      }
      expect(expand(value, document), pointer).toEqual(schema);
    }
  });

  it("carries the item-independent MCP and WebMCP rows once at the root, and the metered 429 once in components", async () => {
    const document = await (await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails)).json() as Record<string, unknown>;
    const config = allRails as unknown as Parameters<typeof nativeMcpCheckoutShape>[0];
    expect(document["x-scvd-native-checkout"]).toEqual({ mcp: nativeMcpCheckoutShape(config), webmcp: nativeWebmcpCheckoutShape(config) });
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;
    let doors = 0;
    for (const [path, item] of Object.entries(paths)) {
      const rows = item.get?.["x-scvd-payment-capabilities"] as { transport: string; protocol: string }[] | undefined;
      if (!rows) continue;
      doors++;
      expect(rows.map(row => row.transport), path).toEqual(rows.map(() => "http"));
      expect(rows.some(row => row.protocol === "mpp"), path).toBe(true);
    }
    expect(doors).toBeGreaterThan(20);
    // Withheld: no root block, and no row claims the lane.
    const withheld = await (await openapiRoutes.request("https://scvd.store/openapi.json", {}, { ...allRails, MPP_CHECKOUT_ENABLED: "false" } as typeof env)).json() as Record<string, unknown>;
    expect(withheld["x-scvd-native-checkout"]).toBeUndefined();
    // The metered refusal resolves to the shared 429 plus the RateLimit fields, from one component.
    const preflight = paths["/api/preflight/v1"]!.post!.responses as Record<string, Record<string, unknown>>;
    expect(preflight["429"]).toEqual({ $ref: "#/components/responses/TooManyRequestsMetered" });
    const metered = expand(preflight["429"], document) as { headers: Record<string, unknown>; description: string };
    const shared = expand({ $ref: "#/components/responses/TooManyRequests" }, document) as { headers: Record<string, unknown>; description: string };
    expect(metered.description).toBe(shared.description);
    expect(Object.keys(metered.headers)).toEqual([...Object.keys(shared.headers), "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "RateLimit-Policy", "RateLimit"]);
  });

  it("preserves the full desk, signed observation, recheck and watch contracts", async () => {
    const response = await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails);
    const document = await response.json() as Record<string, unknown>;
    const paths = document.paths as Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: unknown }> }> }>>;
    for (const [path, method, status, schema] of [
      ["/a2a-desk.json", "get", "200", A2A_DESK_SCHEMA],
      ["/api/a2a/check", "get", "200", A2A_DESK_SCHEMA],
      ["/api/a2a/kits/{kit_id}", "get", "200", A2A_KIT_SCHEMA],
      ["/api/a2a/kits/{kit_id}/recheck", "post", "200", A2A_RECHECK_SCHEMA],
      ["/api/a2a/kits/{kit_id}/recheck", "post", "202", A2A_RECHECK_SCHEMA],
    ] as const) {
      expect(expand(paths[path]![method]!.responses[status]!.content["application/json"]!.schema, document)).toEqual(schema);
    }
  });
});

it("preserves each paid challenge header through its OpenAPI reference", async () => {
  const response = await openapiRoutes.request("https://scvd.store/openapi.json", {}, allRails);
  const document = await response.json() as Record<string, unknown>;
  const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;
  let checked = 0;
  for (const item of Object.values(paths)) for (const operation of Object.values(item)) {
    if (!operation || !operation["x-payment"]) continue;
    const responses = operation.responses as Record<string, { headers: Record<string, unknown> }>;
    for (const [name, schema] of Object.entries(PAYMENT_CHALLENGE_HEADERS)) {
      expect(expand(responses["402"]!.headers[name], document)).toEqual(schema);
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(20);
});
