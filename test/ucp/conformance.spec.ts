import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { UCP_VERSION } from "@/lib/ucp/version";

const BASE = "https://scvd.store";

const post = (path: string, body: unknown) =>
  SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * THE SHAPES THE PINNED SPECIFICATION REQUIRES, ASSERTED AT THE DOOR.
 *
 * The authoritative check is scripts/ucp-conformance.mjs, which runs
 * UCP's own JSON Schemas (vendored at release 2026-08-25) over the
 * documents this store emits. It cannot run inside a Worker isolate,
 * so these assertions cover the same ground from the served side: they
 * are the reason a regression shows up in `npm test` rather than only
 * in the gate.
 *
 * Every assertion here names a divergence the schemas actually caught
 * on the first run. They are written as the spec's requirement rather
 * than as this store's habit, so that reading the test tells you what
 * the protocol asks for.
 */
describe("the served documents keep the shapes the specification requires", () => {
  it("serves the catalog operations as POST, the way the transport defines them", async () => {
    // The first cut of this store served GET with ?q= and ?id=, which
    // no conforming platform would ever call.
    expect((await post("/ucp/v1/catalog/search", { query: "audit" })).status).toBe(200);
    expect(
      (await post("/ucp/v1/catalog/lookup", { ids: ["service_audit"] })).status,
    ).toBe(200);
  });

  it("carries the ucp envelope on every catalog response", async () => {
    for (const [path, body] of [
      ["/ucp/v1/catalog/search", { query: "" }],
      ["/ucp/v1/catalog/lookup", { ids: ["hello"] }],
    ] as const) {
      const json = (await (await post(path, body)).json()) as Record<string, any>;
      // ucp.json#/$defs/base requires version, in YYYY-MM-DD.
      expect(json.ucp.version, path).toBe(UCP_VERSION);
      expect(json.ucp.version, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(json.products), path).toBe(true);
    }
  });

  it("prices every variant in whole ISO-4217 minor units of a three-letter code", async () => {
    const json = (await (
      await post("/ucp/v1/catalog/search", { pagination: { limit: 50 } })
    ).json()) as Record<string, any>;
    for (const product of json.products) {
      for (const variant of product.variants) {
        // common/types/amount.json: integer, minimum 0.
        expect(Number.isInteger(variant.price.amount), variant.sku).toBe(true);
        expect(variant.price.amount).toBeGreaterThanOrEqual(0);
        // common/types/price.json: currency matches ^[A-Z]{3}$, which
        // is the schema-level proof that "USDC" could never go here.
        expect(variant.price.currency).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  it("shapes categories as taxonomy objects rather than bare strings", async () => {
    const json = (await (
      await post("/ucp/v1/catalog/search", { pagination: { limit: 50 } })
    ).json()) as Record<string, any>;
    for (const product of json.products) {
      expect(product.categories.length).toBeGreaterThan(0);
      for (const category of product.categories) {
        expect(typeof category.value).toBe("string");
        expect(category.taxonomy).toBe("merchant");
      }
    }
  });

  it("puts policies on the response with a JSONPath target, not on the product", async () => {
    const json = (await (
      await post("/ucp/v1/catalog/search", { pagination: { limit: 5 } })
    ).json()) as Record<string, any>;
    expect(Array.isArray(json.policies)).toBe(true);
    expect(json.policies.length).toBeGreaterThan(0);
    for (const policy of json.policies) {
      // common/types/policy.json requires type and description, and
      // description is a description object, not a string.
      expect(policy.type).toMatch(/^[a-z][a-z0-9]*\.[a-z0-9_.-]+$/);
      expect(typeof policy.description.plain).toBe("string");
      expect(policy.applies_to[0]).toMatch(/^\$\.products\[\d+\]$/);
    }
    for (const product of json.products) {
      expect(product.policies, "policies belong to the response").toBeUndefined();
    }
  });

  it("shapes messages with a type discriminator and string content", async () => {
    const json = (await (
      await post("/ucp/v1/catalog/lookup", { ids: ["spot_check", "nope"] })
    ).json()) as Record<string, any>;
    expect(json.messages.length).toBe(2);
    for (const message of json.messages) {
      // common/types/message.json selects its oneOf on `type`, and a
      // warning's content is a plain string.
      expect(["error", "warning", "info"]).toContain(message.type);
      expect(typeof message.content).toBe("string");
      expect(typeof message.code).toBe("string");
    }
  });

  it("declares payment handlers, because a business profile must", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    // ucp.json#/$defs/business_schema requires services AND
    // payment_handlers. Omitting them is invalid, not cautious.
    expect(profile.ucp.services).toBeDefined();
    expect(profile.ucp.payment_handlers).toBeDefined();
    for (const instances of Object.values(
      profile.ucp.payment_handlers as Record<string, any[]>,
    )) {
      for (const instance of instances) {
        // payment_handler.json#/$defs/base requires id; entity requires version.
        expect(typeof instance.id).toBe("string");
        expect(instance.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("gives every advertised capability the schema URL negotiation fetches", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    // capability.json#/$defs/business_schema requires `schema`.
    for (const [name, instances] of Object.entries(
      profile.ucp.capabilities as Record<string, any[]>,
    )) {
      for (const instance of instances) {
        expect(instance.schema, name).toMatch(/^https:\/\//);
        expect(instance.version, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("names every service binding with a transport the enum allows", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    for (const instances of Object.values(
      profile.ucp.services as Record<string, any[]>,
    )) {
      for (const instance of instances) {
        expect(["rest", "mcp", "a2a", "embedded"]).toContain(instance.transport);
      }
    }
  });
});
