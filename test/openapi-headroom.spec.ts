import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { openapiRoutes } from "@/routes/openapi";
import { A2A_DESK_SCHEMA, A2A_KIT_SCHEMA, A2A_RECHECK_SCHEMA } from "@/lib/a2a-desk-schema";
import { SCANNER_BUDGET_BYTES } from "@/store/reader-limits";

const allRails = { ...env, POLYGON_PAY_TO: "0x1111111111111111111111111111111111111111", ARBITRUM_PAY_TO: "0x1111111111111111111111111111111111111111", WORLD_PAY_TO: "0x1111111111111111111111111111111111111111", SOLANA_PAY_TO: "11111111111111111111111111111111" };

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
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(SCANNER_BUDGET_BYTES);
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
