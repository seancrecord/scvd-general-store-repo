import { Hono } from "hono";
import { deliveryFailedBody, pageDeliveryFailed } from "@/lib/delivery-failed";
import {
  SettlementDeclined,
  type SettledPayment,
} from "@/lib/payments";
import { sanitizeText } from "@/lib/sanitize";
/**
 * ONE PRE-PAYMENT LAW AND ONE ARGUMENT MAP, shared with the MCP door.
 * Everything this file used to spell out per item — the URL law, the
 * hash shapes, the address shapes, the caps — lives there now, so a
 * buyer gets the same refusal and the same goods whichever door they
 * came through.
 */
import {
  purchaseInputFrom,
  queryArgs,
} from "@/lib/purchase-args";
import { fulfillPurchase } from "@/services/fulfillment";
import { getOrder } from "@/services/orders";
import { getMenuItem, VOICE } from "@/store";
import { orderStatusBody } from "@/lib/order-status";
import type { HonoEnv, MenuItem } from "@/types";
import { doorChecks, noStore } from "@/routes/door-checks";

/**
 * GET /api/buy/:item_id, x402-gated purchases (settled before minting).
 * GET /api/order/:order_id, poll an order; completed ones carry the goods.
 *
 * Middleware order matters: unknown items, empty shelves, and malformed
 * inputs are turned away BEFORE the payment gate, so nobody pays for
 * what we can't sell.
 *
 * Trailing slashes used to fall through to the storewide 404, which
 * tells a prober the aisle never existed. A retired door with a stray
 * slash then looked like a broken listing instead of a closed one —
 * the exact defect the 410 tombstone was written to prevent. Strict
 * matching off so `/api/buy/hello` and `/api/buy/hello/` are one door;
 * identity checks below still canonicalize, because `c.req.path` keeps
 * the slash even when the route matches.
 */
export const buyRoutes = new Hono<HonoEnv>({ strict: false });

/*
 * Every refusal before the gate, and the gate itself, live in
 * routes/door-checks.ts now: the doors Worker (src/doors.ts) answers
 * the unpaid knock on these paths with the same list, so the list is
 * written once and registered here in the order it was always run.
 */
for (const check of doorChecks) {
  buyRoutes.use("/api/buy/*", check);
}
buyRoutes.use("/api/order/*", noStore);

buyRoutes.get("/api/buy/:item_id", async (c) => {
  // shelfCheck guarantees the item exists by the time we're here.
  const item = getMenuItem(c.req.param("item_id")) as MenuItem;
  /*
   * The AUTHORIZATION, not the payment — rule 9 as amended 2026-08-10.
   * Nothing has been charged yet; `pending.settle()` is what charges,
   * and fulfillPurchase calls it at the last line before the mint so
   * that every chain read and probe above it is free to fail.
   */
  const pending = c.get("pending");
  if (!pending) {
    // The gate never lets an unpaid request through; this is belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }

  /*
   * ONE ARGUMENT MAP FOR BOTH DOORS (lib/purchase-args). This block
   * used to be two hundred lines of `if (item.id === ...)` here and a
   * shorter, different two hundred at the MCP door — which is how an
   * MCP buyer came to pay for a signed reading of an empty string.
   */
  const input = purchaseInputFrom(item, queryArgs((name) => c.req.query(name)));
  const source = sanitizeText(c.req.query("source"), 40);
  if (source) {
    input.source = source;
  }
  const userAgent = sanitizeText(c.req.header("User-Agent"), 200);
  if (userAgent) {
    input.userAgent = userAgent;
  }
  const referrer = sanitizeText(c.req.header("Referer"), 200);
  if (referrer) {
    input.referrer = referrer;
  }

  /*
   * THE DECLINE IS CAUGHT HERE, in the handler's own frame, and not
   * left to the gate. Hono converts a throw into `onError` on its way
   * back up, so a settlement decline that escaped this line reached
   * the buyer as "something fell off a shelf" — the store blaming its
   * own shelving for a payment that was refused. The gate keeps a
   * backstop for the same error, but the honest answer is built here,
   * where we still know what happened.
   */
  /**
   * The settle, watched from here: `pending.settle` is memoized inside
   * the gate, so wrapping it costs nothing and tells this frame
   * whether money moved before a throw arrived.
   */
  let settled: SettledPayment | null = null;
  const watched: typeof pending = {
    ...pending,
    settle: async () => {
      settled = await pending.settle();
      return settled;
    },
  };
  try {
    return c.json(await fulfillPurchase(c.env, item, watched, input));
  } catch (error) {
    if (error instanceof SettlementDeclined) return error.response;
    /**
     * MONEY MOVED AND THE GOODS DID NOT (2026-09-04). The global
     * onError served this as a 500 whose copy promised "no charge for
     * the noise" — false, the one time it mattered. The buyer now gets
     * the truth in fields (lib/delivery-failed.ts, shared with the MCP
     * door): charged, the transaction, the rail, the recovery path.
     * Still a 500, because it is still our failure; the delivery
     * intent row and the keeper's page are exactly as before.
     */
    const failedAfterSettle: SettledPayment | null = settled;
    if (failedAfterSettle) {
      await pageDeliveryFailed(c.env, item, failedAfterSettle, "http", error);
      return c.json(
        deliveryFailedBody(c.env.STORE_BASE_URL, item, failedAfterSettle),
        500,
      );
    }
    throw error;
  }
});

buyRoutes.get("/api/order/:order_id", async (c) => {
  const order = await getOrder(c.env, c.req.param("order_id"));
  if (!order) {
    return c.json({ error: VOICE.orderNotFound }, 404);
  }
  // One derivation with the MCP door's check_order (lib/order-status).
  return c.json(orderStatusBody(c.env.STORE_BASE_URL, order));
});
