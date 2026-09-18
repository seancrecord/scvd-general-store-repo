import { paymentMethod } from "@/lib/payment-networks";
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
 * SO CHECKOUT IS NOT IN THIS DOCUMENT. Catalog search and lookup are
 * implemented and served; a UCP checkout and order lifecycle are not,
 * and will not be advertised until they are deployed and probed cold
 * from outside. A negotiator that reads this profile, finds no
 * checkout capability and declines to transact has read it correctly.
 * The way to actually buy from this store today is x402 over HTTP or
 * the MCP door, and both are named below so the answer to "then how do
 * I pay you" is in the same document as the refusal.
 *
 * THE PAYMENT HANDLER IS DECLARED, AND THAT WAS A CORRECTION.
 *
 * It was held out of `ucp.payment_handlers` on the reasoning that a
 * handler is an offer to transact and this store has no UCP checkout
 * to transact through. Then the pinned schema was actually read:
 * ucp.json's business_schema REQUIRES `services` and
 * `payment_handlers`, so a profile without them is not a cautious
 * profile, it is an invalid one — and an invalid profile is a worse
 * answer to "can I trust this merchant" than an honest declaration.
 *
 * The declaration is true on its own terms: this store does take USDC
 * on those rails, by that scheme, at those addresses, today. What a
 * negotiator must not conclude is that it can drive that handler
 * through UCP, and the thing that says so is the absence of a checkout
 * CAPABILITY — which is the field negotiation actually reads — plus
 * the status block below, in words.
 */

export interface UcpProfile {
  ucp: Record<string, unknown>;
  [key: string]: unknown;
}

export function ucpProfile(env: Env): UcpProfile {
  const base = env.STORE_BASE_URL;
  const handlers = usdcPaymentHandlers(env, base);
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
       * the `$id` the specification publishes — not a copy of it on
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
      status: {
        catalog: "live",
        checkout: "not implemented",
        order: "not implemented",
        note: "Catalog search and lookup are served and tested. UCP checkout and order are not built, so they are not advertised. Nothing on this shelf can be bought through UCP today.",
      },
      how_to_actually_buy: {
        http: `${base}/api/buy/{item_id} — x402 v2. Knock unpaid for the 402 terms, sign one of the accepts, knock again with the payment.`,
        mcp: `${base}/mcp — the same catalog behind buy_* tools; tools/list is free.`,
        payment_method: paymentMethod(env),
        guide: `${base}/agents.md`,
      },
      /**
       * The handler above, said again in words, because the field it
       * sits in cannot express the one thing a reader most needs.
       */
      payment_handler_note: {
        type: USDC_HANDLER_TYPE,
        settles_today: true,
        drivable_through_ucp: false,
        reason:
          "The business schema requires payment_handlers, and the declaration is true: this store takes USDC on these rails by this scheme today. It is not drivable through UCP, because there is no UCP checkout capability to drive it from — which is why no checkout capability is advertised above. Pay over x402 directly, or through the MCP door.",
        spec: `${base}/ucp/specs/payment/usdc-x402`,
        schema: `${base}/ucp/schemas/payment/usdc-x402.json`,
      },
      catalog: {
        products_total: MENU_ITEMS.length,
        products_in_ucp_catalog: coreCommerceItems().length,
        excluded: {
          count: excluded.length,
          reason: `Priced below one cent. UCP quotes a price as an integer number of an ISO-4217 currency's minor units, so the smallest USD price that can be written is one cent. These items cost ${excludedPrices}, and they are still for sale at those prices over x402 — what they are not is rounded into a catalog row quoting a price the till would not charge.`,
          still_listed_at: `${base}/menu.json`,
        },
        search: `POST ${base}/ucp/v1/catalog/search`,
        lookup: `POST ${base}/ucp/v1/catalog/lookup with {"ids": [...]}`,
      },
      operator: {
        name: STORE_METADATA.name,
        location: STORE_METADATA.location,
        origin: base,
      },
    },
  };
}
