import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { openapiRoutes, PAYMENT_CHALLENGE_HEADERS } from "@/routes/openapi";
import { A2A_DESK_SCHEMA, A2A_KIT_SCHEMA, A2A_RECHECK_SCHEMA } from "@/lib/a2a-desk-schema";
import { SCANNER_BUDGET_BYTES } from "@/store/reader-limits";
import { nativeMcpCheckoutShape, nativeWebmcpCheckoutShape } from "@/lib/purchase-capabilities";

/**
 * AS PRODUCTION SERVES IT (2026-09-19): every checkout rail AND the
 * native lane. Until this day the case enabled the rails alone, and
 * the six-doors live read found the served document 54,035 bytes
 * past what this test measured: the lane's per-door rows and the
 * descriptor beside them, on since the whole-shelf release, were
 * bytes this file never built. The ceiling now rings here first.
 */
const allRails = { ...env, POLYGON_PAY_TO: "0x1111111111111111111111111111111111111111", ARBITRUM_PAY_TO: "0x1111111111111111111111111111111111111111", WORLD_PAY_TO: "0x1111111111111111111111111111111111111111", SOLANA_PAY_TO: "11111111111111111111111111111111", MPP_CHECKOUT_ENABLED: "true", MPP_CHALLENGE_KEY: "fixture-native-checkout-hmac-key" } as typeof env;

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
    expect(bytes, `${bytes} bytes with every rail and the native lane, against the ${SCANNER_BUDGET_BYTES}-byte scanner budget: move what got inlined into components; do not raise the number`).toBeLessThan(SCANNER_BUDGET_BYTES);
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
