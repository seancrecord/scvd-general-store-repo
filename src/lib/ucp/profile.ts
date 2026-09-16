import { paymentMethod } from "@/lib/payment-networks";
import {
  usdcPaymentHandlers,
  USDC_HANDLER_TYPE,
} from "@/lib/ucp/payments/usdc-x402";
import {
  SCVD_EXTENSION_VERSION,
  SCVD_NAMESPACE,
  UCP_NAMESPACE,
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
 * The payment handler is in the same position: its spec and schema are
 * written and served, because a reader deciding whether this shelf is
 * worth integrating should be able to see exactly how settlement
 * works. It is NOT declared under `ucp.payment_handlers`, because
 * that field is an offer to transact through UCP and this store cannot
 * honour one yet. Naming a protocol you do not speak is the flattering
 * placeholder /corrections exists to catch; naming a payment method
 * you cannot accept is the same mistake with money attached.
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
      capabilities: {
        [`${UCP_NAMESPACE}.shopping.catalog.search`]: [{ version: UCP_VERSION }],
        [`${UCP_NAMESPACE}.shopping.catalog.lookup`]: [{ version: UCP_VERSION }],
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
       * Served, documented, and deliberately not declared as a UCP
       * payment handler: see the note at the top of this file.
       */
      payment_handler_preview: {
        type: USDC_HANDLER_TYPE,
        advertised: false,
        reason:
          "A payment handler is an offer to transact through UCP. This store has no UCP checkout to transact through, so the handler is published for review rather than declared for negotiation.",
        spec: `${base}/ucp/specs/payment/usdc-x402`,
        schema: `${base}/ucp/schemas/payment/usdc-x402.json`,
        instances: handlers,
      },
      catalog: {
        products_total: MENU_ITEMS.length,
        products_in_ucp_catalog: coreCommerceItems().length,
        excluded: {
          count: excluded.length,
          reason: `Priced below one cent. UCP quotes a price as an integer number of an ISO-4217 currency's minor units, so the smallest USD price that can be written is one cent. These items cost ${excludedPrices}, and they are still for sale at those prices over x402 — what they are not is rounded into a catalog row quoting a price the till would not charge.`,
          still_listed_at: `${base}/menu.json`,
        },
        search: `${base}/ucp/v1/catalog/search?q={query}`,
        lookup: `${base}/ucp/v1/catalog/lookup?id={product_variant_sku_or_item_id}`,
      },
      operator: {
        name: STORE_METADATA.name,
        location: STORE_METADATA.location,
        origin: base,
      },
    },
  };
}
