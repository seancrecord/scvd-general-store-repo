/**
 * THE SHELF ROW, AS A SCHEMA — a leaf module on purpose.
 *
 * This lived beside `catalogRow` in routes/catalog.ts, which was the
 * right home for reading and the wrong one for importing: mcp-tools
 * and the OpenAPI contract both needed the schema, and taking it from
 * the route dragged the whole catalogue — and through it
 * services/fulfillment — into the doors Worker, a 671KB bundle that
 * went to 1.7MB. The doors Worker answers the unpaid knock and must
 * not be able to deliver; an import that gives it the fulfillment
 * path is a correctness problem before it is a size one.
 *
 * So the schema sits here with no imports at all, and routes/catalog
 * re-exports it for readers who arrive from that side.
 */
export const CATALOG_ROW_SCHEMA = {
  type: "object",
  description: "One shelf row, in the shelf's own order.",
  properties: {
    id: { type: "string", description: "The item id a buy_* call or item_id lookup takes." },
    name: { type: "string", description: "What the item is called." },
    subtitle: { type: "string", description: "The one-line gloss, when the item has one." },
    price_usdc: { type: "number", description: "The lowest price on this row, in USDC." },
    price_tiers_usdc: {
      type: "array",
      description: "Every price this item is sold at, cheapest first.",
      items: { type: "number" },
    },
    cadence: { type: "string", description: "one_off, or the recurring shape." },
    fulfillment: { type: "string", description: "instant, or human-fulfilled with a window." },
    reads: { type: "string", description: "What the item reads: our_books, subject_fetch, made_here." },
    buy_url: { type: "string", format: "uri", description: "The x402 door that sells it." },
    listing_url: { type: "string", format: "uri", description: "The room that describes it in full." },
  },
  required: ["id", "name", "price_usdc", "cadence", "fulfillment", "reads", "buy_url", "listing_url"],
} as const;
