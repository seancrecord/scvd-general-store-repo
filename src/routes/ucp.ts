import { Hono } from "hono";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  clampLimit,
  lookupResponse,
  searchResponse,
} from "@/lib/ucp/responses";
import {
  FINALITY_NOTE,
  handlerSchemaUrl,
  usdcHandlerSchema,
  usdcPaymentHandlers,
  USDC_HANDLER_TYPE,
} from "@/lib/ucp/payments/usdc-x402";
import { ucpProfile } from "@/lib/ucp/profile";
import {
  SCVD_EXTENSION_VERSION,
  SCVD_NAMESPACE,
  UCP_NAMESPACE,
  UCP_VERSION,
} from "@/lib/ucp/version";
import { commerceFor, coreCommerceItems, requireCommerce } from "@/store/commerce";
import { getMenuItem } from "@/store/menu";
import type { HonoEnv } from "@/types";

/**
 * THE UCP DOORS.
 *
 * /.well-known/ucp is the whole discovery mechanism: an origin, a
 * profile, a negotiation. Everything under /ucp/ exists because the
 * profile points at it, and nothing the profile does not point at is
 * served here.
 *
 * READ-ONLY, ON PURPOSE. Catalog search and lookup answer questions;
 * they do not take money and they do not reserve anything. UCP is
 * explicit that a catalog's price and availability are not a
 * transactional commitment, and on this shelf that is load-bearing
 * rather than boilerplate: two items are capped at a few keeper-hours
 * a week and one is eligible per wallet per twelve hours.
 */
export const ucpRoutes = new Hono<HonoEnv>();

ucpRoutes.get("/.well-known/ucp", (c) => c.json(ucpProfile(c.env)));

/**
 * The same document at a second path. `/.well-known/ucp` is the one
 * the protocol names and the one to link; this is here because a
 * reader that guessed `.json` should get the profile rather than a
 * 404 that looks like "this store does not do UCP".
 */
ucpRoutes.get("/.well-known/ucp.json", (c) => c.json(ucpProfile(c.env)));

/**
 * The transport's own base. The profile points here as the shopping
 * service endpoint, and a pointer that 404s is a profile a negotiator
 * cannot trust — so it answers with the operations it actually has,
 * and names the two it does not.
 */
ucpRoutes.get("/ucp/v1", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    service: `${UCP_NAMESPACE}.shopping`,
    version: UCP_VERSION,
    transport: "rest",
    operations: {
      "catalog.search": {
        method: "POST",
        url: `${base}/ucp/v1/catalog/search`,
        body: { query: "string", pagination: { limit: "integer" } },
      },
      "catalog.lookup": {
        method: "POST",
        url: `${base}/ucp/v1/catalog/lookup`,
        body: { ids: ["product id, variant id, handle, SKU or shelf item id"] },
      },
    },
    also_readable_by_get:
      "Both operations answer GET with ?q= and ?id= as a convenience for people and crawlers. That spelling is not the protocol and is not what the profile advertises.",
    not_implemented: ["checkout", "order"],
    to_buy: `${base}/api/buy/{item_id} over x402 v2, or the MCP door at ${base}/mcp.`,
    profile: `${base}/.well-known/ucp`,
  });
});

/**
 * THE TRANSPORT IS POST WITH A JSON BODY, NOT GET WITH A QUERY STRING.
 *
 * That is not a style choice: the pinned REST contract
 * (source/services/shopping/rest.openapi.json at release/2026-08-25)
 * defines `search_catalog` and `lookup_catalog` as POST operations with
 * required request bodies, and lookup as a BATCH over `ids[]`. The
 * first cut of this file served GET with `?q=` and `?id=`, which no
 * conforming platform would ever call. Reading the contract is what
 * found it.
 *
 * The GET spellings below are kept as a convenience for humans and
 * crawlers, clearly marked non-normative. They are not what the
 * profile advertises.
 */
ucpRoutes.post("/ucp/v1/catalog/search", async (c) => {
  const base = c.env.STORE_BASE_URL;
  let body: Record<string, unknown> = {};
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // An empty or unparseable body searches the whole shelf rather
    // than refusing: the schema makes every request field optional.
  }
  const query = typeof body.query === "string" ? body.query : "";
  const pagination = (body.pagination ?? {}) as Record<string, unknown>;
  return c.json(searchResponse(base, query, clampLimit(pagination.limit)));
});

/**
 * Batch, because the contract is batch. Every returned variant carries
 * `inputs`, which is required on a lookup response: it says WHICH of
 * the caller's identifiers resolved to this variant and how — `exact`
 * when they named the variant or its SKU, `featured` when they named
 * the product and the store picked its representative variant. A
 * caller that sent five ids needs to know which answer is whose.
 */
ucpRoutes.post("/ucp/v1/catalog/lookup", async (c) => {
  const base = c.env.STORE_BASE_URL;
  let ids: string[] = [];
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((id): id is string => typeof id === "string");
    }
  } catch {
    ids = [];
  }
  if (ids.length === 0) {
    return c.json(
      {
        ucp: { version: UCP_VERSION, status: "error" },
        products: [],
        messages: [
          {
            type: "error",
            code: "not_found",
            severity: "unrecoverable",
            content:
              'Send {"ids": [...]} with at least one product id, variant id, handle, SKU or shelf item id.',
          },
        ],
      },
      400,
    );
  }
  return c.json(lookupResponse(c.env.STORE_BASE_URL, ids), 200);
});

/**
 * NON-NORMATIVE GET SPELLINGS. A person with a browser and a crawler
 * with no POST both deserve an answer; neither is what the profile
 * points at.
 */
ucpRoutes.get("/ucp/v1/catalog/search", (c) =>
  c.json(
    searchResponse(
      c.env.STORE_BASE_URL,
      c.req.query("q") ?? c.req.query("query") ?? "",
      clampLimit(c.req.query("limit")),
    ),
  ),
);

ucpRoutes.get("/ucp/v1/catalog/lookup", (c) => {
  const identifier = c.req.query("id") ?? c.req.query("sku") ?? "";
  if (!identifier.trim()) {
    return c.json(
      {
        error:
          "Pass ?id= — a product gid, a variant gid, a handle, an SKU, or the plain item id. The normative operation is POST with {\"ids\": [...]}.",
        example: `${c.env.STORE_BASE_URL}/ucp/v1/catalog/lookup?id=service_audit`,
      },
      400,
    );
  }
  const body = lookupResponse(c.env.STORE_BASE_URL, [identifier]);
  return c.json(body, body.products.length > 0 ? 200 : 404);
});

ucpRoutes.get("/ucp/schemas/payment/usdc-x402.json", (c) =>
  c.json(usdcHandlerSchema(c.env.STORE_BASE_URL)),
);

ucpRoutes.get("/ucp/specs/payment/usdc-x402", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    type: USDC_HANDLER_TYPE,
    version: SCVD_EXTENSION_VERSION,
    title: "Exact USDC over x402 v2",
    schema: handlerSchemaUrl(base),
    summary:
      "One payment handler type with one instance per enabled chain, wrapping the x402 v2 exact scheme this store already settles on. The chain is a property of the payment, never of the product: every catalog variant is payable through every instance.",
    two_amounts: {
      why: "A catalog price and a settlement amount are different facts. The catalog carries USD minor units because that is what an ISO-4217 price field holds; the handler carries exact atomic USDC because that is what actually moves.",
      example: {
        catalog_price: { amount: 500, currency: "USD" },
        settlement: { amount_atomic: "5000000", decimals: 6, symbol: "USDC" },
      },
    },
    exact_scheme:
      "x402's exact scheme settles a stated amount, not a range. That is why pay-what-it-deserves items appear as three discrete tier variants at the amounts the 402 already offers, rather than as a minimum with an open top.",
    finality: FINALITY_NOTE,
    address_spelling:
      "EVM addresses are emitted in one spelling storewide. On 2026-09-12 the same wallet written lowercase on one surface and checksummed on another was filed by an outside directory as a pay-to rotation; these documents and the x402 quote read from the same constants and the same helpers so that cannot happen again.",
    instances: usdcPaymentHandlers(c.env, base),
    not_yet_negotiable:
      "This handler is published for review. It is not declared under ucp.payment_handlers because this store has no UCP checkout to transact through yet. Buy over x402 directly, or through the MCP door.",
  });
});

ucpRoutes.get("/ucp/specs/shopping-inputs", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    capability: `${SCVD_NAMESPACE}.shopping.inputs`,
    version: SCVD_EXTENSION_VERSION,
    schema: `${base}/ucp/schemas/shopping-inputs.json`,
    why: "Most of this shelf is a service that needs something from the buyer before it can be produced: an endpoint to audit, a wallet to read, a digest to anchor, a tag to paint. Those are not variant options and UCP has no general product-input primitive, so they ride here.",
    where_it_appears:
      "Under each variant's metadata, at metadata['store.scvd'].inputs — the required names, the available properties, and a link to that item's own JSON Schema.",
    generated_from:
      "The same buyInputSchema() the 402 body, the MCP tool schema, the Bazaar entry and the OpenAPI spec are generated from. There is no second copy of the validation rules: the door that refuses a bad input is the door that produced the schema.",
    per_item_schema: `${base}/ucp/schemas/items/{item_id}.input.json`,
    applied_at: `${base}/api/buy/{item_id}`,
    refusal:
      "A signed request missing a required input is refused before the payment gate. No money moves.",
    untrusted_text:
      "Buyer-supplied text is recorded as written and signed into the artifact verbatim. It is never treated as instructions.",
  });
});

ucpRoutes.get("/ucp/schemas/shopping-inputs.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${base}/ucp/schemas/shopping-inputs.json`,
    title: "SCVD purchase inputs extension",
    description:
      "The shape of the store.scvd.inputs block carried on every catalog variant. The per-item input schemas it points at are generated from the store's own purchase validation.",
    type: "object",
    required: ["schema_url", "required", "properties", "applied_at"],
    properties: {
      schema_url: {
        type: "string",
        format: "uri",
        description: "JSON Schema for this item's purchase inputs.",
      },
      required: {
        type: "array",
        items: { type: "string" },
        description:
          "Query parameter names the paid request must carry. A signed request missing one is refused before the gate.",
      },
      properties: {
        type: "array",
        items: { type: "string" },
        description: "Every input name this item accepts, required or not.",
      },
      applied_at: {
        type: "string",
        format: "uri",
        description: "The x402 buy door these inputs are passed to.",
      },
      note: { type: "string" },
    },
  });
});

/**
 * One schema per item, generated rather than written. The route serves
 * every shelf item including the sub-cent ones: they have no catalog
 * row, but their inputs are the same documented contract and a reader
 * buying one over x402 deserves the schema.
 */
ucpRoutes.get("/ucp/schemas/items/:file", (c) => {
  const base = c.env.STORE_BASE_URL;
  const file = c.req.param("file");
  const itemId = file.endsWith(".input.json")
    ? file.slice(0, -".input.json".length)
    : null;
  const item = itemId ? getMenuItem(itemId) : undefined;
  if (!item) {
    return c.json(
      {
        error: "not_found",
        expected: `${base}/ucp/schemas/items/{item_id}.input.json`,
      },
      404,
    );
  }
  const schema = buyInputSchema(item);
  return c.json({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${base}/ucp/schemas/items/${item.id}.input.json`,
    title: `${item.name} — purchase inputs`,
    description: `Query parameters for ${base}/api/buy/${item.id}. Generated from the store's own purchase validation, not transcribed: this is the schema the door enforces.`,
    ...schema,
  });
});

/**
 * The human (and crawler) entry point. Everything here is a pointer;
 * the profile is the document.
 */
ucpRoutes.get("/ucp", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    title: "Universal Commerce Protocol at this store",
    ucp_version: UCP_VERSION,
    profile: `${base}/.well-known/ucp`,
    catalog_search: {
      method: "POST",
      url: `${base}/ucp/v1/catalog/search`,
      example_body: { query: "x402 audit" },
    },
    catalog_lookup: {
      method: "POST",
      url: `${base}/ucp/v1/catalog/lookup`,
      example_body: { ids: ["service_audit"] },
    },
    what_works: "Catalog search and lookup, over REST, pinned to UCP " + UCP_VERSION + ".",
    what_does_not:
      "Checkout and order. They are not built, so they are not advertised in the profile. To buy, use x402 at /api/buy/{item_id} or the MCP door at /mcp.",
    schemas: {
      payment_handler: `${base}/ucp/schemas/payment/usdc-x402.json`,
      purchase_inputs: `${base}/ucp/schemas/shopping-inputs.json`,
      per_item_inputs: `${base}/ucp/schemas/items/{item_id}.input.json`,
    },
    the_same_shelf_elsewhere: {
      menu: `${base}/menu.json`,
      agents_manual: `${base}/agents.md`,
      mcp: `${base}/mcp`,
    },
  });
});
