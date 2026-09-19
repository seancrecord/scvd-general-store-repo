import { checkoutMethod } from "@/lib/purchase-capabilities";
import { ucpLaunchStatus } from "@/lib/ucp/launch";
import {
  usdcPaymentHandlers,
  USDC_HANDLER_TYPE,
} from "@/lib/ucp/payments/usdc-x402";
import {
  SCVD_EXTENSION_VERSION,
  SCVD_NAMESPACE,
  UCP_NAMESPACE,
  UCP_SCHEMA_BASE,
  UCP_VERSION,
} from "@/lib/ucp/version";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import { MENU_ITEMS } from "@/store/menu";
import { STORE_METADATA } from "@/store/metadata";
import type { Env } from "@/types";

/**
 * THE BUSINESS PROFILE: WHAT THIS STORE ACTUALLY SPEAKS TODAY.
 *
 * UCP discovery is permissionless — a platform knows an origin, reads
 * the profile, and negotiates the capabilities both ends declare. That
 * makes the profile a promise rather than a brochure, and the way to
 * break it is to list a capability whose endpoint is not there.
 *
 * CHECKOUT AND ORDER ARE IN THIS DOCUMENT EXACTLY WHEN THE DOOR IS
 * OPEN. The checkout, the settlement and the order are built and
 * tested (test/ucp/), and whether THIS deployment has switched them on
 * is one question with one answer, asked of lib/ucp/launch.ts by the
 * profile and by the Complete door alike. Open: the capabilities are
 * declared, the payment handlers are the rails a UCP checkout may be
 * quoted on, and Complete settles. Closed: no checkout capability, no
 * order capability, and Complete refuses in writing. A negotiator
 * that reads a closed profile, finds no checkout capability and
 * declines to transact has read it correctly, and the way to actually
 * buy is still named below so the answer to "then how do I pay you"
 * is in the same document as the refusal.
 *
 * THE PAYMENT HANDLER IS DECLARED EITHER WAY, AND THAT WAS A
 * CORRECTION. It was held out of `ucp.payment_handlers` on the
 * reasoning that a handler is an offer to transact. Then the pinned
 * schema was actually read: ucp.json's business_schema REQUIRES
 * `services` and `payment_handlers`, so a profile without them is not
 * a cautious profile, it is an invalid one. The declaration is true on
 * its own terms — this store does take USDC on those rails, by that
 * scheme, at those addresses — and what a negotiator may conclude
 * about driving it through UCP is answered by the checkout CAPABILITY,
 * which is the field negotiation actually reads, plus the status block
 * below, in words.
 */

export interface UcpProfile {
  ucp: Record<string, unknown>;
  [key: string]: unknown;
}

export function ucpProfile(env: Env): UcpProfile {
  const base = env.STORE_BASE_URL;
  const launch = ucpLaunchStatus(env);
  const everyRail = usdcPaymentHandlers(env, base);
  /**
   * Open: the handlers are the rails a UCP checkout will actually be
   * quoted on, so a platform never signs against a rail Create would
   * refuse. Closed: every rail the till settles on, as a true
   * statement about where the store takes USDC today.
   */
  const handlers = launch.open
    ? everyRail.filter((instance) => launch.rails.includes(instance.config.network))
    : everyRail;
  /**
   * The excluded prices are read off the shelf, never typed. A
   * hand-copied "$0.004" outliving the price it described is the
   * exact defect the claims register exists to catch, and a
   * paragraph explaining why four prices cannot be published is a
   * bad place to publish a fifth, wrong one.
   */
  const excluded = MENU_ITEMS.filter(
    (item) => requireCommerce(item).visibility !== "core",
  );
  const excludedPrices = excluded
    .map((item) => `$${item.price_usdc}`)
    .sort()
    .join(", ");
  const catalogCount = coreCommerceItems().length;
  const wholeCatalog = launch.items.length === catalogCount;
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        [`${UCP_NAMESPACE}.shopping`]: [
          {
            version: UCP_VERSION,
            transport: "rest",
            endpoint: `${base}/ucp/v1`,
          },
        ],
      },
      /**
       * EVERY CAPABILITY CARRIES ITS SCHEMA URL, because
       * capability.json's business_schema requires one: a platform
       * composing capabilities during negotiation fetches it. For the
       * capabilities UCP defines, the canonical schema is UCP's own —
       * fetched from its dated release — not a copy of it on
       * this origin. The store vendors those schemas to validate
       * itself against; it does not claim authorship of them.
       */
      capabilities: {
        [`${UCP_NAMESPACE}.shopping.catalog.search`]: [
          {
            version: UCP_VERSION,
            schema: `${UCP_SCHEMA_BASE}/shopping/catalog_search.json`,
          },
        ],
        [`${UCP_NAMESPACE}.shopping.catalog.lookup`]: [
          {
            version: UCP_VERSION,
            schema: `${UCP_SCHEMA_BASE}/shopping/catalog_lookup.json`,
          },
        ],
        /**
         * THE INVARIANT, in the field negotiation reads: present when
         * Complete settles, absent when it refuses. Same source, same
         * answer, no third state.
         */
        ...(launch.open
          ? {
              [`${UCP_NAMESPACE}.shopping.checkout`]: [
                {
                  version: UCP_VERSION,
                  schema: `${UCP_SCHEMA_BASE}/shopping/checkout.json`,
                },
              ],
              [`${UCP_NAMESPACE}.shopping.order`]: [
                {
                  version: UCP_VERSION,
                  schema: `${UCP_SCHEMA_BASE}/shopping/order.json`,
                },
              ],
            }
          : {}),
        /**
         * The store's own extension, in the store's own namespace,
         * resolving to the store's own schema. `store.scvd.*` rather
         * than a borrowed name: an extension that claims somebody
         * else's authority is what a schema validator is built to
         * refuse.
         */
        [`${SCVD_NAMESPACE}.shopping.inputs`]: [
          {
            version: SCVD_EXTENSION_VERSION,
            spec: `${base}/ucp/specs/shopping-inputs`,
            schema: `${base}/ucp/schemas/shopping-inputs.json`,
          },
        ],
      },
      /**
       * Required by the business schema, and true: these are the rails
       * the till settles on today. Generated from checkoutNetworks(env)
       * so a rail with no receiving wallet cannot appear here while the
       * checkout refuses it.
       */
      payment_handlers: {
        [USDC_HANDLER_TYPE]: handlers,
      },
    },
    /**
     * Everything below is this store's own block, not UCP's. A reader
     * that does not know the namespace may ignore it entirely and
     * still get a correct answer from `ucp` above.
     */
    [SCVD_NAMESPACE]: {
      status: launch.open
        ? {
            catalog: "live",
            checkout: "live",
            order: "live",
            rails: launch.rails,
            items: wholeCatalog ? "every item in the UCP catalog" : launch.items,
            note: wholeCatalog
              ? `Catalog, checkout and order are served. Create a checkout at POST ${base}/ucp/v1/checkout-sessions, pay the quoted x402 terms, and Complete settles it: the order is written beside the checkout in one transaction and an identical Complete sent again returns the same order without charging again.`
              : `Catalog, checkout and order are served, and checkout is open for ${launch.items.length} of the ${catalogCount} catalog items (listed in \`items\`) on the rails listed in \`rails\`, while the launch is qualified item by item. Create refuses the rest in writing; every item is still for sale over x402 at ${base}/api/buy/{item_id}.`,
          }
        : {
            catalog: "live",
            checkout: "not enabled",
            order: "not enabled",
            note: `Catalog search, lookup and product detail are served. UCP checkout and order are built and tested, and are switched off on this deployment (${launch.closed_because ?? "closed"}), so they are not advertised and Complete refuses in writing. Nothing on this shelf can be bought through UCP here today.`,
          },
      how_to_actually_buy: {
        ...(launch.open
          ? {
              ucp: `POST ${base}/ucp/v1/checkout-sessions with line_items, then POST ${base}/ucp/v1/checkout-sessions/{id}/complete with an x402 payment signed against the quoted handler. The shape is at ${base}/ucp/specs/payment/usdc-x402.`,
            }
          : {}),
        http: `${base}/api/buy/{item_id} — ${checkoutMethod(env)}. Knock unpaid for the terms, sign one of them, knock again with the payment.`,
        mcp: `${base}/mcp — the same catalog behind buy_* tools; tools/list is free.`,
        payment_method: checkoutMethod(env),
        guide: `${base}/agents.md`,
      },
      /**
       * The handler above, said again in words, because the field it
       * sits in cannot express the one thing a reader most needs.
       */
      payment_handler_note: {
        type: USDC_HANDLER_TYPE,
        settles_today: true,
        drivable_through_ucp: launch.open,
        reason: launch.open
          ? "The instances declared above are the rails a UCP checkout is quoted on here; the checkout narrows to the one rail it was quoted for and its config then carries the exact transfer to sign. Complete verifies and settles that transfer through the same facilitator the x402 door uses."
          : "The business schema requires payment_handlers, and the declaration is true: this store takes USDC on these rails by this scheme today. It is not drivable through UCP on this deployment, because the checkout capability is switched off here — which is why no checkout capability is advertised above. Pay over x402 directly, or through the MCP door.",
        spec: `${base}/ucp/specs/payment/usdc-x402`,
        schema: `${base}/ucp/schemas/payment/usdc-x402.json`,
      },
      catalog: {
        products_total: MENU_ITEMS.length,
        products_in_ucp_catalog: catalogCount,
        excluded: {
          count: excluded.length,
          reason: `Priced below one cent. UCP quotes a price as an integer number of an ISO-4217 currency's minor units, so the smallest USD price that can be written is one cent. These items cost ${excludedPrices}, and they are still for sale at those prices over x402 — what they are not is rounded into a catalog row quoting a price the till would not charge.`,
          still_listed_at: `${base}/menu.json`,
        },
        search: `POST ${base}/ucp/v1/catalog/search`,
        lookup: `POST ${base}/ucp/v1/catalog/lookup with {"ids": [...]}`,
        product: `POST ${base}/ucp/v1/catalog/product with {"id": "..."} — one product in full, with its option axis`,
      },
      operator: {
        name: STORE_METADATA.name,
        location: STORE_METADATA.location,
        origin: base,
      },
    },
  };
}
