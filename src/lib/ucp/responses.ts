import {
  catalogPolicies,
  lookupItem,
  searchCatalog,
  ucpCatalog,
  ucpProduct,
} from "@/lib/ucp/catalog";
import { SCVD_NAMESPACE, UCP_VERSION } from "@/lib/ucp/version";
import { commerceFor, coreCommerceItems, requireCommerce } from "@/store/commerce";
import { getMenuItem } from "@/store/menu";

/**
 * THE TWO CATALOG RESPONSES, SHAPED HERE RATHER THAN IN THE ROUTE.
 *
 * They live in a library because the conformance gate
 * (scripts/ucp-conformance.mjs) validates them against UCP's own
 * schemas without standing up a Worker. A response builder that could
 * only be reached through an HTTP handler would have to be checked
 * against a fixture somebody remembered to regenerate, and a stale
 * fixture is a conformance gate that passes for the wrong reason.
 */

const MAX_SEARCH_LIMIT = 50;
/** The schema recommends 10 when a caller names no page size. */
const DEFAULT_SEARCH_LIMIT = 10;

export function clampLimit(raw: unknown): number {
  const requested = Number(raw ?? DEFAULT_SEARCH_LIMIT);
  return Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_SEARCH_LIMIT)
    : DEFAULT_SEARCH_LIMIT;
}

export function searchResponse(base: string, query: string, limit: number) {
  const products = query.trim()
    ? searchCatalog(base, query, limit)
    : ucpCatalog(base).slice(0, limit);
  const total = coreCommerceItems().length;
  return {
    ucp: { version: UCP_VERSION },
    products,
    pagination: {
      has_next_page: !query.trim() && limit < total,
      total_count: query.trim() ? products.length : total,
    },
    policies: catalogPolicies(products, base),
    /**
     * Said on every result rather than in a document the caller has to
     * go and find: a row here is not a reservation.
     */
    [SCVD_NAMESPACE]: {
      availability_is_not_a_commitment:
        "Prices and availability here are the shelf's current listing, not a held quote. The 402 at the buy door is what actually binds.",
      total_in_catalog: total,
    },
  };
}


export function lookupResponse(base: string, ids: string[]) {
  const products: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const byItem = new Map<string, string[]>();

  for (const identifier of ids) {
    const item = lookupItem(identifier);
    if (!item || requireCommerce(item).visibility !== "core") {
      messages.push(notFoundMessage(base, identifier, item?.id));
      continue;
    }
    byItem.set(item.id, [...(byItem.get(item.id) ?? []), identifier]);
  }

  for (const [itemId, matched] of byItem) {
    const item = getMenuItem(itemId)!;
    const product = ucpProduct(item, base);
    products.push({
      ...product,
      variants: product.variants.map((variant, index) => ({
        ...variant,
        inputs: matched.map((id) => ({
          id,
          /**
           * `exact` only where the caller actually named this variant.
           * A product id or handle names the product, and the store
           * picks the first variant as its representative — which is
           * `featured`, and calling it `exact` would tell a platform
           * the buyer chose a tier they never saw.
           */
          match:
            id === variant.id || id.toUpperCase() === variant.sku
              ? "exact"
              : index === 0
                ? "featured"
                : "related",
        })),
      })),
    });
  }

  return {
    ucp: { version: UCP_VERSION },
    products,
    ...(messages.length > 0 ? { messages } : {}),
    policies: catalogPolicies(products as never, base),
  };
}

/**
 * A SHELF ITEM THAT EXISTS AND IS NOT IN THIS CATALOG GETS A DIFFERENT
 * ANSWER FROM ONE THAT DOES NOT EXIST.
 *
 * The four sub-cent items are real, for sale, and absent here. A bare
 * "not found" would tell a reader they had the wrong id, which is false
 * and is the sort of wrong answer that ends up in somebody else's
 * directory as a delisting.
 *
 * A WARNING RATHER THAN AN ERROR, and shaped the way the schema shapes
 * one: `type` is the discriminator common/types/message.json selects
 * its oneOf branch on, `content` is a plain STRING (the conformance
 * gate found an object there), and `code` is freeform. A missed id in
 * a batch where other ids resolved is not a failed request.
 */
function notFoundMessage(base: string, identifier: string, itemId?: string) {
  const shelved = itemId ? getMenuItem(itemId) : getMenuItem(identifier);
  if (shelved && commerceFor(shelved.id)?.visibility === "extension_only") {
    return {
      type: "warning",
      code: `${SCVD_NAMESPACE}.catalog.excluded`,
      content: `${shelved.name} costs $${shelved.price_usdc}, less than one cent, and a UCP catalog price is an integer number of an ISO-4217 currency's minor units. There is no honest USD figure for it, so it has no catalog row rather than a rounded one. Still for sale at ${base}/api/buy/${shelved.id}.`,
      url: `${base}/menu/${shelved.id}`,
      [SCVD_NAMESPACE]: {
        id: identifier,
        item_id: shelved.id,
        sku: requireCommerce(shelved).sku,
        price_usdc: shelved.price_usdc,
        still_for_sale: true,
        buy_url: `${base}/api/buy/${shelved.id}`,
        listing_url: `${base}/menu/${shelved.id}`,
      },
    };
  }
  return {
    type: "warning",
    code: "not_found",
    content: `No product matched "${identifier}".`,
    [SCVD_NAMESPACE]: { id: identifier },
  };
}
