import { buyInputSchema } from "@/lib/bazaar-discovery";
import { priceTiersUsdc, PWID_TIER_LABELS } from "@/lib/payments";
import { productGid, productHandle, variantGid } from "@/lib/ucp/ids";
import { toAtomicUsdc, toUcpUsdPrice, type UcpMoney } from "@/lib/ucp/money";
import { policiesFor, type UcpPolicy } from "@/lib/ucp/policies";
import { SCVD_NAMESPACE } from "@/lib/ucp/version";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import { getMenuItem } from "@/store/menu";
import { CAPABILITY_QUERY, SPEC_RETURNS } from "@/store/spec";
import type { MenuItem } from "@/types";

/**
 * THE SHELF, PROJECTED. NOT A SECOND SHELF.
 *
 * Every field below is read from `MENU_ITEMS`, `priceTiersUsdc()`,
 * `buyInputSchema()` and the commerce table — the same four sources the
 * x402 till, the MCP door, the listing spec and /menu.json read. There
 * is deliberately no product table in this file and there must never
 * be one: a catalog that holds its own copy of a price is a catalog
 * that can be right about a price the store does not charge.
 *
 * WHAT A CATALOG IS NOT. UCP is explicit that a catalog's price and
 * availability are not a transactional commitment — checkout is. That
 * matters more here than at most merchants: two of these items are
 * capped at a handful of keeper-hours a week, and one (window_pick) is
 * eligible per wallet and per twelve hours, which no catalog row can
 * express. So availability here is the shelf's declared policy and the
 * metadata says which gate actually decides.
 */

export interface UcpDescription {
  plain: string;
}

export interface UcpAvailability {
  available: boolean;
  /** Open vocabulary; `in_stock` is the one that fits a shelf that
   * makes its goods on demand. */
  status: string;
  /** Whose gate decides, said plainly, because it is not this one. */
  decided_at: "checkout";
  /** Declared weekly ceiling, when the item has one. */
  weekly_inventory?: number;
  /** Whether a waitlist opens when the shelf empties. */
  waitlist?: boolean;
  /** Per-buyer eligibility a catalog row cannot answer. */
  buyer_specific_eligibility?: string;
}

export interface UcpVariant {
  id: string;
  sku: string;
  title: string;
  description: UcpDescription;
  price: UcpMoney;
  availability: UcpAvailability;
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * A CATEGORY IS AN OBJECT WITH A NAMED TAXONOMY, not a bare string.
 *
 * shopping/types/category.json requires `value` and takes an optional
 * `taxonomy` naming where the value came from. These are the store's
 * own shelves rather than a Google or Shopify taxonomy id, so they say
 * `merchant` — which is the honest answer and the one that stops a
 * platform trying to resolve "endpoint-audit" against a taxonomy that
 * has never heard of it.
 */
export interface UcpCategory {
  value: string;
  taxonomy: "merchant";
}

export interface UcpProduct {
  id: string;
  handle: string;
  title: string;
  description: UcpDescription;
  url: string;
  price_range: { min: UcpMoney; max: UcpMoney };
  variants: UcpVariant[];
  categories: UcpCategory[];
  tags: string[];
  metadata: Record<string, unknown>;
  media?: { type: "image"; url: string; alt: string }[];
}

/**
 * THE ONLY GATE ON WHAT A CATALOG ROW CLAIMS ABOUT STOCK.
 *
 * `window_pick` is the honest case for saying so out loud: its
 * eligibility depends on the asking wallet, on what that wallet
 * already holds, and on a twelve-hour cooldown. Any answer this
 * function gave would be wrong for somebody. It answers "the shelf is
 * open" and names the gate that is not.
 */
const BUYER_SPECIFIC: Record<string, string> = {
  window_pick:
    "Eligibility is per wallet: an empty window, a card you do not already hold, and a twelve-hour cooldown since your last pick. Checkout rechecks all three; this row cannot.",
  pack: "Draws are seeded per day and per payer; a repeated Idempotency-Key returns the same five cards rather than five more.",
};

function availabilityFor(item: MenuItem): UcpAvailability {
  return {
    available: true,
    status: "in_stock",
    decided_at: "checkout",
    ...(item.weekly_inventory !== undefined
      ? { weekly_inventory: item.weekly_inventory }
      : {}),
    ...(item.waitlist ? { waitlist: true } : {}),
    ...(BUYER_SPECIFIC[item.id]
      ? { buyer_specific_eligibility: BUYER_SPECIFIC[item.id] }
      : {}),
  };
}

/**
 * Tags a reader can search by, without anybody keeping them in sync.
 *
 * The curated words live in the commerce table; these are the facts
 * the shelf already states as fields, spelled as tags so a catalog
 * that filters on tags can filter on them. Derived, so an item that
 * changes cadence changes its tags in the same commit.
 */
function derivedTags(item: MenuItem): string[] {
  const tags = [
    `reads:${item.reads}`,
    `cadence:${item.cadence}`,
    `fulfillment:${item.fulfillment}`,
    `pricing:${item.pricing}`,
  ];
  if (item.cadence === "term") tags.push(`term-days:${item.term_days}`);
  if (item.stocked) tags.push("stocked");
  if (item.free_alternative) tags.push("has-free-alternative");
  return tags;
}

/**
 * WHAT THIS ITEM NEEDS FROM THE BUYER, FROM THE SAME SCHEMA THE TILL
 * ENFORCES.
 *
 * UCP has no general product-input primitive, and these are not
 * ordinary variant options: `the_statement` wants a wallet, `graffiti`
 * a tag under 140 characters with no URL in it, `attestation_bundle`
 * between two and twenty transaction hashes. Writing those out again
 * here would be a second copy of validation law, which is how the MCP
 * shelf once told a strict client that `tag` did not exist while the
 * store went on reading it. So the extension carries `buyInputSchema`
 * itself, by reference, and the door that refuses a bad input is the
 * one that generated the schema.
 */
function inputExtension(item: MenuItem, base: string): Record<string, unknown> {
  const schema = buyInputSchema(item);
  return {
    schema_url: `${base}/ucp/schemas/items/${item.id}.input.json`,
    required: schema.required ?? [],
    properties: Object.keys(schema.properties ?? {}),
    applied_at: `${base}/api/buy/${item.id}`,
    note: "Query parameters on the paid request. A signed request missing a required input is refused before the gate and no money moves.",
  };
}

function settlementMetadata(usdc: number): Record<string, unknown> {
  return {
    amount_usdc: usdc,
    amount_atomic: toAtomicUsdc(usdc),
    decimals: 6,
    asset_symbol: "USDC",
    note: "The commercial price above is USD minor units, as the catalog requires. This is the amount that actually settles: exact atomic USDC, the same figure the x402 quote carries. Network, token contract and recipient come from the payment handler.",
  };
}

function itemMetadata(item: MenuItem, base: string): Record<string, unknown> {
  const commerce = requireCommerce(item);
  return {
    item_id: item.id,
    sku: commerce.sku,
    listed_week: item.listed_week,
    pricing_model: item.pricing,
    cadence: item.cadence,
    ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
    reads: item.reads,
    fulfillment: item.fulfillment,
    ...(item.sla_hours !== undefined ? { sla_hours: item.sla_hours } : {}),
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    ...(CAPABILITY_QUERY[item.id] ? { capability: CAPABILITY_QUERY[item.id] } : {}),
    ...(item.constraints?.length ? { constraints: item.constraints } : {}),
    ...(item.production ? { production: item.production } : {}),
    ...(item.free_alternative
      ? {
          free_alternative: {
            path_template: item.free_alternative.path_template,
            paid_adds: item.free_alternative.paid_adds,
          },
        }
      : {}),
    /**
     * A JSON report specimen is not catalog media. `media` is for
     * images and video a platform will render; a sample deliverable is
     * a document a buyer reads, and the `sample_kind` beside it is the
     * store's own guard against a component preview being mistaken for
     * the whole artifact.
     */
    ...(item.sample_url
      ? {
          specimen: {
            url: `${base}${item.sample_url}`,
            kind: item.sample_kind ?? "delivery_outline",
          },
        }
      : {}),
    inputs: inputExtension(item, base),
    listing_url: `${base}/menu/${item.id}`,
    buy_url: `${base}/api/buy/${item.id}`,
    mcp_tool: `buy_${item.id}`,
    verify_url: `${base}/api/verify/{id}`,
    protocol: { x402: 2, mcp: true },
  };
}

/** Image specimens are the only samples a catalog should render. */
function mediaFor(item: MenuItem, base: string): UcpProduct["media"] {
  if (!item.sample_url || !/\.(png|jpg|jpeg|webp|svg)$/i.test(item.sample_url)) {
    return undefined;
  }
  return [
    {
      type: "image",
      url: `${base}${item.sample_url}`,
      alt: `${item.name} — ${item.sample_kind ?? "specimen"}`,
    },
  ];
}

/**
 * PAY-WHAT-IT-DESERVES AS DISCRETE VARIANTS, AT THE TIERS THE TILL
 * ALREADY OFFERS.
 *
 * The 402 for one of these items carries three exact-scheme amounts,
 * not a range, because x402's exact scheme settles a stated amount. A
 * catalog that published "$300 or more" would describe a door that
 * does not exist; three variants describe the one that does, and the
 * prices come from `priceTiersUsdc()` rather than from a multiplier
 * table copied into this file.
 *
 * The tiers buy the same goods. That is stated as a field rather than
 * left to inference, because a platform that sees three prices and one
 * product will otherwise guess that the expensive one is better.
 */
function variantsFor(item: MenuItem, base: string): UcpVariant[] {
  const commerce = requireCommerce(item);
  const tiers = priceTiersUsdc(item);
  const minimum = tiers[0];
  if (minimum === undefined) {
    throw new Error(`No price tiers for shelf item "${item.id}"`);
  }
  const shared = itemMetadata(item, base);
  const tags = [...commerce.tags, ...derivedTags(item)];

  if (item.pricing !== "pay_what_it_deserves") {
    return [
      {
        id: variantGid(item.id),
        sku: commerce.sku,
        title: item.name,
        description: { plain: SPEC_RETURNS[item.id] ?? item.description },
        price: toUcpUsdPrice(minimum),
        availability: availabilityFor(item),
        tags,
        metadata: {
          [SCVD_NAMESPACE]: {
            ...shared,
            settlement: settlementMetadata(minimum),
          },
        },
      },
    ];
  }

  return tiers.map((tierUsdc, index) => ({
    id: variantGid(item.id, index),
    sku: `${commerce.sku}-T${Math.round(tierUsdc / item.price_usdc)}`,
    title: `${item.name} — ${PWID_TIER_LABELS[index] ?? `tier ${index + 1}`}`,
    description: {
      plain: `${SPEC_RETURNS[item.id] ?? item.description} This is the ${PWID_TIER_LABELS[index] ?? `tier ${index + 1}`} tier; anything above the minimum is recorded as a tip and buys the same goods.`,
    },
    price: toUcpUsdPrice(tierUsdc),
    availability: availabilityFor(item),
    tags: [...tags, `tier:${PWID_TIER_LABELS[index] ?? index + 1}`],
    metadata: {
      [SCVD_NAMESPACE]: {
        ...shared,
        settlement: settlementMetadata(tierUsdc),
        tier: {
          index: index + 1,
          of: tiers.length,
          label: PWID_TIER_LABELS[index] ?? `tier ${index + 1}`,
          minimum_usdc: item.price_usdc,
          above_minimum_is_a_tip: true,
          same_deliverable_as_other_tiers: true,
        },
      },
    },
  }));
}

export function ucpProduct(item: MenuItem, base: string): UcpProduct {
  const commerce = requireCommerce(item);
  const variants = variantsFor(item, base);
  const amounts = variants.map((variant) => variant.price.amount);
  const media = mediaFor(item, base);
  return {
    id: productGid(item.id),
    handle: productHandle(item.id),
    title: item.name,
    description: { plain: item.description },
    url: `${base}/menu/${item.id}`,
    price_range: {
      min: { amount: Math.min(...amounts), currency: "USD" },
      max: { amount: Math.max(...amounts), currency: "USD" },
    },
    variants,
    categories: commerce.categories.map((value) => ({
      value,
      taxonomy: "merchant" as const,
    })),
    tags: [...commerce.tags, ...derivedTags(item)],
    metadata: { [SCVD_NAMESPACE]: itemMetadata(item, base) },
    ...(media ? { media } : {}),
  };
}

/** Every shelf row a standard catalog can carry, in shelf order. */
export function ucpCatalog(base: string): UcpProduct[] {
  return coreCommerceItems().map((item) => ucpProduct(item, base));
}

/**
 * THE POLICIES FOR A SET OF PRODUCTS, TARGETED THE WAY THE SCHEMA SAYS.
 *
 * They were on the product until the conformance gate read
 * common/types/policy.json: policies are a RESPONSE field, and each
 * one names the nodes it covers with an RFC 9535 JSONPath relative to
 * the response root. `$.products[3]` covers that product and
 * everything nested under it, variants included — which is exactly the
 * scope these have.
 *
 * Emitting them where the schema puts them is not pedantry: a platform
 * reads `policies` off the response, so a licence sitting on the
 * product is a licence nobody is looking at.
 */
export function catalogPolicies(
  products: UcpProduct[],
  base: string,
): UcpPolicy[] {
  const policies: UcpPolicy[] = [];
  products.forEach((product, index) => {
    const itemId = (product.metadata[SCVD_NAMESPACE] as Record<string, unknown>)
      .item_id as string;
    const item = getMenuItem(itemId);
    if (!item) return;
    for (const policy of policiesFor(item, base)) {
      policies.push({ ...policy, applies_to: [`$.products[${index}]`] });
    }
  });
  return policies;
}

/**
 * Lookup accepts what a catalog handed out — the product gid, the
 * variant gid, the handle, the SKU — and also the plain item id, which
 * is what every other surface of this store calls the thing. A reader
 * holding /menu.json should not have to translate to ask UCP about the
 * same row.
 */
export function lookupItem(identifier: string): MenuItem | undefined {
  const direct = getMenuItem(identifier);
  if (direct) return direct;
  const gid = identifier.match(/^gid:\/\/scvd\.store\/(?:Product|Variant)\/([^/]+)/)?.[1];
  if (gid) return getMenuItem(gid);
  const byHandle = coreCommerceItems().find(
    (item) => productHandle(item.id) === identifier,
  );
  if (byHandle) return byHandle;
  const upper = identifier.toUpperCase();
  return coreCommerceItems().find((item) => {
    const sku = requireCommerce(item).sku;
    return upper === sku || upper.startsWith(`${sku}-T`);
  });
}

/**
 * SEARCH OVER THE STRUCTURED FIELDS FIRST, PROSE SECOND.
 *
 * The structured attributes are the whole reason they were added:
 * an agent looking for "x402 endpoint audit" should match on the tag
 * and the category rather than on a lucky word in a description. Both
 * are searched; the ranking is what differs.
 */
export function searchCatalog(base: string, query: string, limit = 20): UcpProduct[] {
  const terms = query.toLowerCase().split(/[^a-z0-9.-]+/i).filter(Boolean);
  if (terms.length === 0) return ucpCatalog(base).slice(0, limit);

  const scored = coreCommerceItems().map((item) => {
    const commerce = requireCommerce(item);
    const structured = [
      item.id,
      commerce.sku,
      ...commerce.tags,
      ...commerce.categories,
      ...derivedTags(item),
    ]
      .join(" ")
      .toLowerCase();
    const prose = [
      item.name,
      item.subtitle ?? "",
      item.description,
      CAPABILITY_QUERY[item.id] ?? "",
      SPEC_RETURNS[item.id] ?? "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (structured.includes(term)) score += 3;
      if (prose.includes(term)) score += 1;
    }
    return { item, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => ucpProduct(row.item, base));
}
