import { policiesFor, type UcpPolicy } from "@/lib/ucp/policies";
import { UCP_VERSION } from "@/lib/ucp/version";
import type { StoredCheckout } from "@/services/ucp-checkout-store";
import { getMenuItem } from "@/store/menu";

/**
 * THE CHECKOUT AS THE SPECIFICATION SHAPES IT.
 *
 * shopping/checkout.json requires ucp, id, line_items, status,
 * currency, totals and links. `links` is not decoration — the schema
 * calls it mandatory for legal compliance, and a checkout that omits
 * the terms a buyer is agreeing to is exactly the omission a commerce
 * protocol exists to prevent.
 *
 * `order` appears if and only if the checkout is completed. A
 * completed checkout without one, or an in-progress checkout with one,
 * would each describe a state the protocol does not have.
 */

export interface UcpCheckoutDocument {
  ucp: {
    version: string;
    status?: "success" | "error";
    /** Required on a checkout response: how to actually pay this one. */
    payment_handlers: Record<string, unknown[]>;
  };
  id: string;
  status: StoredCheckout["status"];
  currency: "USD";
  line_items: {
    id: string;
    item: { id: string; title: string; price: number };
    quantity: number;
    totals: { type: string; display_text: string; amount: number }[];
  }[];
  totals: { type: string; display_text: string; amount: number }[];
  links: { type: string; url: string; title?: string }[];
  policies?: UcpPolicy[];
  expires_at: string;
  messages?: Record<string, unknown>[];
  order?: { id: string; permalink_url: string };
  [key: string]: unknown;
}

/**
 * Mandatory for legal compliance, says the schema. These are the
 * store's real pages, not placeholders: /rights carries what a buyer
 * may do with what they bought and the refund commitment, and
 * /privacy is the store's own privacy page.
 */
function links(base: string) {
  return [
    { type: "terms_of_service", url: `${base}/rights`, title: "What you get, and what you may do with it" },
    { type: "refund_policy", url: `${base}/rights`, title: "The delivery promise and the refund behind it" },
    { type: "privacy_policy", url: `${base}/privacy`, title: "What this store reads, stores and never stores" },
  ];
}

function money(type: string, display: string, amount: number) {
  return { type, display_text: display, amount };
}

/**
 * Exactly one subtotal and exactly one total, which the schema
 * enforces with minContains/maxContains. There is no tax line and no
 * fulfillment line, and inventing a zeroed one would be describing a
 * charge this store does not make.
 */
function totalsFor(amount: number) {
  return [money("subtotal", "Subtotal", amount), money("total", "Total", amount)];
}

export function checkoutDocument(
  checkout: StoredCheckout,
  base: string,
  extras: {
    messages?: Record<string, unknown>[];
    /** The rails this checkout can be paid on; narrowed once quoted. */
    paymentHandlers?: Record<string, unknown[]>;
  } = {},
): UcpCheckoutDocument {
  const lineItems = checkout.lines.map((line, index) => {
    const item = getMenuItem(line.item_id);
    const total = line.unit_price.amount * line.quantity;
    return {
      id: `li_${index + 1}`,
      item: {
        // The variant id Catalog handed out, used unchanged as item.id —
        // which is the contract the catalog schema states outright.
        id: line.variant_id,
        title: item?.name ?? line.sku,
        price: line.unit_price.amount,
      },
      quantity: line.quantity,
      totals: [money("total", "Line total", total)],
    };
  });
  const grand = checkout.lines.reduce(
    (sum, line) => sum + line.unit_price.amount * line.quantity,
    0,
  );
  const policies: UcpPolicy[] = [];
  checkout.lines.forEach((line, index) => {
    const item = getMenuItem(line.item_id);
    if (!item) return;
    for (const policy of policiesFor(item, base)) {
      policies.push({ ...policy, applies_to: [`$.line_items[${index}]`] });
    }
  });

  return {
    ucp: {
      version: UCP_VERSION,
      /**
       * REQUIRED on a checkout response by ucp.json's
       * response_checkout_schema, and it is the right requirement: a
       * checkout a platform cannot pay is a checkout.
       */
      payment_handlers: extras.paymentHandlers ?? {},
    },
    id: checkout.id,
    status: checkout.status,
    currency: "USD",
    line_items: lineItems,
    totals: totalsFor(grand),
    links: links(base),
    ...(policies.length > 0 ? { policies } : {}),
    expires_at: checkout.expires_at,
    ...(extras.messages?.length ? { messages: extras.messages } : {}),
    /**
     * Present exactly when completed, because that is what the field
     * means: order details available at the time of completion.
     */
    ...(checkout.status === "completed" && checkout.order
      ? {
          order: {
            id: checkout.order.id,
            permalink_url: checkout.order.permalink_url,
          },
        }
      : {}),
    "store.scvd": {
      /**
       * The quote, said in the store's own block rather than smuggled
       * into a standard field. A platform that cannot drive this
       * handler still gets to see exactly what settling would cost and
       * where it would go.
       */
      ...(checkout.quote
        ? {
            payment_terms: {
              ...checkout.quote.terms,
              terms_digest: checkout.quote.digest,
            },
          }
        : {}),
      version: checkout.version,
      lines: checkout.lines,
      created_at: checkout.created_at,
    },
  };
}
