import { Hono } from "hono";
import { SPEC_KEY_ORDER, SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import type { HonoEnv } from "@/types";

/**
 * GET /schemas/listing-spec-v1.json: the uniform listing schema at a
 * stable versioned URL. The catalog validates against it in CI
 * (test/synthesis.spec.ts); an agent comparing the shelves reads one
 * format everywhere.
 */
export const schemaRoutes = new Hono<HonoEnv>();

schemaRoutes.get(SPEC_SCHEMA_PATH, (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `${base}${SPEC_SCHEMA_PATH}`,
      title: "SCVD uniform listing spec, v1",
      description:
        "Every item on the menu carries a spec object with these six fields, in this literal JSON key order, identical field names storewide. Field order is load-bearing and validated in CI.",
      "x-key-order": SPEC_KEY_ORDER,
      type: "object",
      required: [...SPEC_KEY_ORDER],
      properties: {
        capability: {
          type: "string",
          description: "The exact deliverable, registrar-plain.",
        },
        inputs: {
          type: "object",
          description:
            "JSON schema of accepted purchase parameters (query params on HTTP, arguments on MCP).",
        },
        outputs: {
          type: "object",
          description: "Delivery mode and the artifacts every purchase mints.",
        },
        verification: {
          type: "object",
          description:
            "Verify URL, signing key, and a live sample artifact whose verify link resolves.",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "True limits only; absent figures are absent, not smoothed.",
        },
        price: {
          type: "object",
          description: "Amount, pricing model, tiers, currency, network, protocol.",
        },
      },
      additionalProperties: false,
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
});
