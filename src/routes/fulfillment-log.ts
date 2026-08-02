import { Hono } from "hono";
import { listOrders } from "@/services/orders";
import { listRefunds } from "@/services/refunds";
import { REFUND_POLICY } from "@/store/refund-policy";
import type { HonoEnv, OrderRecord } from "@/types";

/**
 * THE FULFILLMENT LOG — track record as a standing public record
 * rather than a thing asked to be trusted.
 *
 * /stats counts aggregates; this page shows the per-order facts a
 * skeptical reader actually wants: promised window vs. actual
 * delivery, order by order, plus every refund with its status and tx
 * hash. Computed live from the SAME order records that drive
 * fulfillment — there is no separate log to forget to update, which
 * is the property that makes it evidence.
 *
 * WHAT IS DELIBERATELY OMITTED: order ids (an order URL serves the
 * buyer's deliverable — publishing ids would open every buyer's goods
 * to the room), buyer-written detail text, names, and payer
 * addresses. The log proves the store's conduct, not the buyers'.
 *
 * EMPTY IS HONEST. A store this young has a short log; a short log
 * served truthfully beats a long one that can't be checked. Time does
 * the rest — that is the only thing that can.
 */
export const fulfillmentLogRoutes = new Hono<HonoEnv>();

const HOUR_MS = 3600 * 1000;

function dueBy(order: OrderRecord): string {
  return new Date(
    new Date(order.created_at).getTime() + order.sla_hours * HOUR_MS,
  ).toISOString();
}

/** Tenths of an hour: precise enough to judge, honest about jitter. */
function hoursBetween(fromIso: string, toIso: string): number {
  return (
    Math.round(
      ((new Date(toIso).getTime() - new Date(fromIso).getTime()) / HOUR_MS) *
        10,
    ) / 10
  );
}

fulfillmentLogRoutes.get("/fulfillment-log", async (c) => {
  const [orders, refunds] = await Promise.all([
    listOrders(c.env),
    listRefunds(c.env),
  ]);
  const now = new Date().toISOString();

  const rows = orders.map((order) => {
    const due = dueBy(order);
    if (order.completed_at) {
      return {
        item: order.item_id,
        ordered_at: order.created_at,
        promised_hours: order.sla_hours,
        due_by: due,
        completed_at: order.completed_at,
        hours_taken: hoursBetween(order.created_at, order.completed_at),
        on_time: order.completed_at <= due,
      };
    }
    return {
      item: order.item_id,
      ordered_at: order.created_at,
      promised_hours: order.sla_hours,
      due_by: due,
      status: order.status,
      overdue: now > due,
    };
  });

  const completed = rows.filter((row) => "on_time" in row);
  const pending = rows.filter((row) => !("on_time" in row));

  return c.json({
    standfirst:
      "Every human-labor order this store has taken: the window promised before payment, and what actually happened, computed live from the fulfillment records themselves. Plus every refund, with its on-chain tx hash once paid.",
    as_served_at: now,
    summary: {
      orders_total: rows.length,
      completed: completed.length,
      on_time: completed.filter((row) => row.on_time === true).length,
      late: completed.filter((row) => row.on_time === false).length,
      pending: pending.length,
      pending_overdue: pending.filter((row) => row.overdue === true).length,
      refunds_total: refunds.length,
      refunds_paid: refunds.filter((r) => r.status === "refund_paid").length,
    },
    orders: rows,
    refunds: refunds.map((refund) => ({
      item: refund.item,
      amount_usdc: refund.amount_usdc,
      status: refund.status,
      created_at: refund.created_at,
      ...(refund.paid_at ? { paid_at: refund.paid_at } : {}),
      ...(refund.tx_hash
        ? {
            tx_hash: refund.tx_hash,
            check_it: "Any Base explorer; the hash is the receipt.",
          }
        : {}),
    })),
    refund_policy: REFUND_POLICY,
    omitted_on_purpose:
      "Order ids (an order URL serves the buyer's own deliverable), buyer-written text, buyer names, and payer addresses. This log is evidence about the store's conduct, not a window into its buyers.",
    empty_is_honest:
      "A short log is a young store, not a hidden one. The numbers above cannot be edited without editing the orders they are computed from — the same records fulfillment runs on.",
    /**
     * THE BLIND SPOT ON THE TRACK-RECORD SURFACE, named because a page
     * that exists to evidence conduct is the worst possible place for
     * an unstated one.
     *
     * Every figure here is computed from ORDERS, which are our own
     * writes. A sale that settled and never created an order does not
     * appear as a failure — it does not appear AT ALL, and this log
     * would read as a clean record while a buyer got nothing. That is
     * not hypothetical; it is precisely the case ledger #4 and #18
     * were built for.
     *
     * So the limit is stated and the instruments that cover it are
     * named. A reader can then ask us about those rather than
     * discovering the gap themselves.
     */
    what_this_log_cannot_see:
      "Every number here is computed from ORDERS, which are records this store writes. A payment that settled and never produced an order would not show up as a failed delivery — it would not show up at all, and this log would look clean while a buyer got nothing. Two checks exist for exactly that case and neither is fed by this log: a delivery audit that flags a settled sale whose goods never went out, and an hourly walk of USDC arriving on Base against the certificates minted, which does not depend on any write we make. Anything either finds goes on /corrections with a date. A track record built only from its own bookkeeping is worth stating the limits of, and this is them.",
  });
});
