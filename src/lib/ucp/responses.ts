import {
  catalogPolicies,
  lookupItem,
  searchCatalog,
  ucpCatalog,
  ucpProduct,
  type UcpProduct,
  type UcpVariant,
} from "@/lib/ucp/catalog";
import { SCVD_NAMESPACE, UCP_VERSION } from "@/lib/ucp/version";
import { commerceFor, coreCommerceItems, requireCommerce } from "@/store/commerce";
import { getMenuItem } from "@/store/menu";

/**
 * THE THREE CATALOG RESPONSES, SHAPED HERE RATHER THAN IN THE ROUTE.
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
 * GET PRODUCT: ONE PRODUCT, IN FULL, WITH ITS OPTION AXIS SAID OUT
 * LOUD.
 *
 * The third operation of `dev.ucp.shopping.catalog.lookup`, and the
 * one this store shipped a launch without (2026-09-19). Lookup is a
 * batch that answers "which of my identifiers resolved to what";
 * get_product answers "tell me everything about this one, and which
 * variant my selections land on". They are different questions and
 * the contract gives them different doors.
 *
 * THE OPTION AXIS IS DERIVED FROM THE VARIANTS, NOT DECLARED.
 * Most of this shelf is one variant with no axes at all, and the
 * schema says `selected` and `options` may be omitted there rather
 * than invented. The pay-what-it-deserves items are the exception:
 * their three tier variants ARE an option axis, the till already
 * offers exactly those three amounts, and a platform narrowing by
 * `selected` deserves to be told which tier it landed on and whether
 * the others exist. The labels come off the variants' own tier
 * metadata, so a tier table that changes changes this in the same
 * commit.
 */

/** The one option axis this shelf has, where it has one at all. */
const TIER_AXIS = "Tier";

interface TierFacts {
  label: string;
  available: boolean;
  id: string;
}

function tierOf(variant: UcpVariant): TierFacts | undefined {
  const scvd = variant.metadata[SCVD_NAMESPACE] as Record<string, unknown> | undefined;
  const tier = scvd?.tier as Record<string, unknown> | undefined;
  if (!tier || typeof tier.label !== "string") return undefined;
  return { label: tier.label, available: variant.availability.available, id: variant.id };
}

/** Every tier, in shelf order, or nothing when the product has no axis. */
function tierAxis(product: UcpProduct): TierFacts[] | null {
  if (product.variants.length < 2) return null;
  const tiers = product.variants.map(tierOf);
  return tiers.every((tier): tier is TierFacts => tier !== undefined)
    ? tiers
    : null;
}

export interface GetProductRequest {
  id: string;
  selected?: { name?: unknown; id?: unknown; label?: unknown }[];
  preferences?: unknown;
}

export function productResponse(
  base: string,
  request: GetProductRequest,
): { status: 200 | 400 | 404; body: Record<string, unknown> } {
  const identifier = typeof request.id === "string" ? request.id.trim() : "";
  if (!identifier) {
    return {
      status: 400,
      body: {
        ucp: { version: UCP_VERSION, status: "error" },
        messages: [
          {
            type: "error",
            code: "not_found",
            severity: "unrecoverable",
            content:
              'Send {"id": "..."} with a product id, variant id, handle, SKU or shelf item id. Get Product is a single-resource operation; the batch is POST /ucp/v1/catalog/lookup.',
          },
        ],
      },
    };
  }

  const item = lookupItem(identifier);
  if (!item || requireCommerce(item).visibility !== "core") {
    /**
     * The same answer lookup gives for the same id, in the shape an
     * error_response requires: `product` is REQUIRED on a product
     * response, so there is no half-answer to give here. The
     * sub-cent items keep their own explanation — they exist, they
     * are for sale, and they have no catalog row.
     */
    const message = notFoundMessage(base, identifier, item?.id);
    return {
      status: 404,
      body: {
        ucp: { version: UCP_VERSION, status: "error" },
        messages: [{ ...message, type: "error", severity: "unrecoverable" }],
      },
    };
  }

  const product = ucpProduct(item, base);
  const tiers = tierAxis(product);
  const messages: Record<string, unknown>[] = [];

  /**
   * WHICH VARIANT THE SELECTIONS ANCHOR. The request's own `id` may
   * already name one — a variant gid or a tier SKU is a selection the
   * caller made before they asked — and an explicit `selected` entry
   * overrides it. Nothing is narrowed away: three tiers is a whole
   * axis, and hiding two of them because the caller named one would
   * answer a question about a product with an answer about a variant.
   */
  const indexOfVariant = (value: string): number =>
    product.variants.findIndex(
      (variant) => variant.id === value || variant.sku === value.toUpperCase(),
    );

  let featured = Math.max(indexOfVariant(identifier), 0);
  const selections = Array.isArray(request.selected) ? request.selected : [];
  for (const selection of selections) {
    const name = typeof selection?.name === "string" ? selection.name : "";
    const label = typeof selection?.label === "string" ? selection.label : "";
    const id = typeof selection?.id === "string" ? selection.id : "";
    const byId = id ? indexOfVariant(id) : -1;
    const byLabel = tiers
      ? tiers.findIndex((tier) => tier.label.toLowerCase() === label.toLowerCase())
      : -1;
    if (byId >= 0) {
      featured = byId;
      continue;
    }
    if (byLabel >= 0) {
      featured = byLabel;
      continue;
    }
    messages.push({
      type: "warning",
      code: "selection_unmatched",
      content: tiers
        ? `No option value matched ${JSON.stringify(name || TIER_AXIS)}: ${JSON.stringify(label || id)}. This product's one axis is ${TIER_AXIS}, with values ${tiers.map((tier) => tier.label).join(", ")}. The featured variant below is the one the selections that DID match land on.`
        : `${product.title} has no configurable options, so ${JSON.stringify(name || label || id)} narrowed nothing. Its single variant is below.`,
    });
  }

  const anchor = product.variants[featured]!;

  return {
    status: 200,
    body: {
      ucp: { version: UCP_VERSION },
      product: {
        ...product,
        ...(tiers
          ? {
              selected: [{ name: TIER_AXIS, id: anchor.id, label: tiers[featured]!.label }],
              options: [
                {
                  name: TIER_AXIS,
                  values: tiers.map((tier) => ({
                    id: tier.id,
                    label: tier.label,
                    /**
                     * One axis, every value on the shelf: each tier
                     * exists and is purchasable at the amount the 402
                     * already offers. `available` still comes off the
                     * variant rather than being written `true`, so an
                     * item that goes out of stock says so here too.
                     */
                    exists: true,
                    available: tier.available,
                  })),
                },
              ],
            }
          : {}),
      },
      ...(messages.length > 0 ? { messages } : {}),
      // A singular response: the policy target is `$.product`, not an
      // index into a `products` array this document does not have.
      policies: catalogPolicies([product], base, () => "$.product"),
    },
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
