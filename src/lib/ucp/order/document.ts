import { grandTotalOf, money, totalsFor } from "@/lib/ucp/checkout/document";
import type { CheckoutLineTerms } from "@/lib/ucp/checkout/terms";
import { UCP_VERSION } from "@/lib/ucp/version";
import type { OrderRecord } from "@/types";

/**
 * THE ORDER, BUILT FROM FROZEN AND SETTLED FACTS ONLY.
 *
 * shopping/order.json requires ucp, id, checkout_id, permalink_url,
 * line_items, fulfillment, currency and totals. Everything commercial
 * in it comes from the checkout as it was frozen — the lines, the
 * tier, the unit price, the currency — and everything monetary from
 * the purchase record as it settled. Nothing is re-derived from
 * today's shelf: the same TOCTOU rule the checkout lives by, one step
 * later. A menu edit after the checkout was opened changes what the
 * next buyer sees and nothing about what this one bought.
 *
 * TWO FULFILLMENT SHAPES, ONE ORDER. Instant goods exist the moment
 * the settlement confirms, so the order is fulfilled at creation and
 * carries the goods. A human work-order is queued in the store's
 * operational ledger (services/orders.ts), and the protocol-facing
 * order REFERENCES it rather than copying it: the operational record
 * stays the work's source of truth, and this document reads its
 * state at serve time. One commercial order, one operational order,
 * never two of either.
 */

export interface StoredUcpOrder {
  id: string;
  checkout_id: string;
  permalink_url: string;
  created_at: string;
  currency: "USD";
  /** The checkout's lines, frozen at Create. Never rebuilt from the shelf. */
  lines: CheckoutLineTerms[];
  /** Display titles captured at creation, one per line, so a rename later changes nothing here. */
  line_titles: string[];
  /** The settlement as the purchase record holds it. */
  settlement: {
    purchase_id: string;
    network: string;
    transaction: string;
    payer?: string;
    paid_usdc: number;
    tip_usdc: number;
  };
  fulfillment:
    | {
        kind: "instant";
        status: "fulfilled";
        delivered_at: string;
        /** What the buyer received: the same body the x402 door would have served. */
        goods: Record<string, unknown>;
      }
    | {
        kind: "human_queue";
        /** As the operational order stood when this was written; read live at serve time. */
        status: "processing" | "fulfilled";
        operational_order_id: string;
        sla_hours?: number;
        goods: Record<string, unknown>;
      };
}

export interface UcpOrderDocument {
  ucp: { version: string; status?: "success" | "error" };
  id: string;
  checkout_id: string;
  permalink_url: string;
  currency: "USD";
  line_items: {
    id: string;
    item: { id: string; title: string; price: number };
    quantity: { original: number; total: number; fulfilled: number };
    totals: { type: string; display_text: string; amount: number }[];
    status: "processing" | "partial" | "fulfilled" | "removed";
  }[];
  totals: { type: string; display_text: string; amount: number }[];
  fulfillment: {
    events: {
      id: string;
      occurred_at: string;
      type: string;
      line_items: { id: string; quantity: number }[];
      description?: string;
    }[];
  };
  [key: string]: unknown;
}

/** Whether the order's goods are in the buyer's hands. */
function fulfilled(order: StoredUcpOrder, operational?: OrderRecord): { done: boolean; at?: string } {
  if (order.fulfillment.kind === "instant") {
    return { done: true, at: order.fulfillment.delivered_at };
  }
  if (operational?.status === "completed") {
    return { done: true, ...(operational.completed_at ? { at: operational.completed_at } : {}) };
  }
  return { done: order.fulfillment.status === "fulfilled" };
}

export function orderDocument(
  order: StoredUcpOrder,
  base: string,
  extras: { operational?: OrderRecord } = {},
): UcpOrderDocument {
  const state = fulfilled(order, extras.operational);
  const lineItems = order.lines.map((line, index) => {
    const total = line.unit_price.amount * line.quantity;
    return {
      id: `li_${index + 1}`,
      item: {
        id: line.variant_id,
        title: order.line_titles[index] ?? line.sku,
        price: line.unit_price.amount,
      },
      quantity: {
        original: line.quantity,
        total: line.quantity,
        fulfilled: state.done ? line.quantity : 0,
      },
      totals: [money("total", "Line total", total)],
      status: state.done ? ("fulfilled" as const) : ("processing" as const),
    };
  });

  return {
    ucp: { version: UCP_VERSION },
    id: order.id,
    checkout_id: order.checkout_id,
    permalink_url: `${base}/ucp/v1/orders/${order.id}`,
    currency: "USD",
    line_items: lineItems,
    totals: totalsFor(grandTotalOf(order.lines)),
    fulfillment: {
      /**
       * Digital goods and a keeper's own hands: no carrier, no
       * tracking number, no postal destination to invent. The event
       * log says the one true thing — delivered, when — and stays
       * empty while a work-order is still in its queue.
       */
      events: state.done
        ? [
            {
              id: "evt_delivered",
              occurred_at: state.at ?? order.created_at,
              type: "delivered",
              line_items: order.lines.map((line, index) => ({ id: `li_${index + 1}`, quantity: line.quantity })),
              description:
                order.fulfillment.kind === "instant"
                  ? "Delivered at settlement: the goods are in this order."
                  : "The keeper completed the work-order this order references.",
            },
          ]
        : [],
    },
    "store.scvd": {
      settlement: order.settlement,
      created_at: order.created_at,
      lines: order.lines,
      ...(order.fulfillment.kind === "human_queue"
        ? {
            work_order: {
              order_id: order.fulfillment.operational_order_id,
              order_url: `${base}/api/order/${order.fulfillment.operational_order_id}`,
              status: extras.operational?.status ?? order.fulfillment.status,
              ...(order.fulfillment.sla_hours !== undefined ? { sla_hours: order.fulfillment.sla_hours } : {}),
            },
          }
        : {}),
      goods: order.fulfillment.goods,
    },
  };
}
