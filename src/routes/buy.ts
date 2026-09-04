import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { SettlementDeclined,
  PAYMENT_VARY,
} from "@/lib/payments";
import {
  readFulfillmentInput,
  refusePurchaseInput,
} from "@/lib/purchase-door";
import { fulfillPurchase, stockedShelfCount } from "@/services/fulfillment";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { capacityVerdict } from "@/services/queue-capacity";
import { getOrder, remainingInventory } from "@/services/orders";
import { recordFailedItem } from "@/services/requests";
import { getMenuItem, VOICE } from "@/store";
import { getRetiredItem } from "@/store/retired";
import type { HonoEnv, MenuItem } from "@/types";

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

function buyRequestPath(c: { req: { path: string } }): string {
  const path = c.req.path;
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
}

function buyItemId(c: { req: { path: string } }): string {
  return buyRequestPath(c).replace(/^\/api\/buy\//, "");
}

/** Paid material must never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", PAYMENT_VARY);
};

/**
 * Standard-dialect retirement headers. `@` date form is RFC 9745;
 * Sunset is an HTTP-date per RFC 8594. Both name the same moment the
 * body already names — one fact, three renderings, no second source
 * of truth.
 */
function retirementHeaders(
  base: string,
  retired: { retired_on: string; folded_into?: string },
): Record<string, string> {
  const at = new Date(`${retired.retired_on}T00:00:00Z`);
  const headers: Record<string, string> = {
    Deprecation: `@${Math.floor(at.getTime() / 1000)}`,
    Sunset: at.toUTCString(),
  };
  if (retired.folded_into) {
    headers["Link"] =
      `<${base}/api/buy/${retired.folded_into}>; rel="successor-version"`;
  }
  return headers;
}

/**
 * Turns away retired items, unknown items (logged as market research)
 * and sold-out shelves.
 *
 * ALL THREE REFUSE BEFORE ANY MONEY MOVES and all three shipped
 * without `code` or `charged` — this whole middleware was missed by
 * the sweep that coded the other forty-two, because not one of its
 * three sentences contains the words "nothing charged". A boundary
 * drawn by a grep, not by a decision: a buyer turned away at the
 * shelf needs the same fact as one turned away at the parameter
 * check, and 404-with-no-code left a client nothing to branch on but
 * a status three other things also use.
 */
const shelfCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (!item) {
    // A retired shelf answers with what happened — an agent that
    // remembered the old menu should learn the new one, not conclude
    // the store is broken. 410, deliberately: gone, on purpose.
    const retired = getRetiredItem(itemId);
    if (retired) {
      return c.json(
        {
          error: `${retired.name} retired ${retired.retired_on}. ${retired.note}`,
          code: "retired",
          charged: false,
          ...(retired.folded_into
            ? {
                folded_into: retired.folded_into,
                buy_url: `${c.env.STORE_BASE_URL}/api/buy/${retired.folded_into}`,
              }
            : {}),
          menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
          certificates_note:
            "Certificates issued under this item verify forever; retirement changes the shelf, not the record.",
        },
        410,
        /*
         * THE TOMBSTONE IN A DIALECT PROBERS ALREADY SPEAK (2026-08-24).
         *
         * The JSON body above is good and nobody has to read it. A
         * directory that probed this door before we closed it sees
         * only a status code, and "not 402" reads as DEGRADED unless
         * something tells it otherwise — which is how a listing we
         * submitted on 2026-08-18 came to report this store as broken
         * over an item deliberately retired on 2026-08-20.
         *
         * So the retirement is restated in standard headers rather
         * than only in our own shape: RFC 9745 Deprecation, RFC 8594
         * Sunset, and a successor Link. A prober honouring any of the
         * three can delist instead of alarming, without knowing
         * anything about this store.
         *
         * It does not fix the stale listing — only re-submitting does
         * that. It stops the NEXT directory from having to be told.
         */
        retirementHeaders(c.env.STORE_BASE_URL, retired),
      );
    }
    await recordFailedItem(c.env, itemId);
    return c.json(
      {
        error: VOICE.unknownItem,
        code: "unknown_item",
        charged: false,
        menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
        request_url: `${c.env.STORE_BASE_URL}/api/request`,
      },
      404,
    );
  }
  const remaining = await remainingInventory(c.env, item);
  if (remaining !== null && remaining <= 0) {
    return c.json(
      {
        error: VOICE.soldOut,
        code: "sold_out",
        charged: false,
        waitlist_url: `${c.env.STORE_BASE_URL}/api/waitlist/${item.id}`,
      },
      409,
    );
  }
  await next();
};

/**
 * THE PROBE RULE, 2026-07-26, from two outside witnesses on the same
 * day: Bazaar had registered 14 of our 21 items, and x402scout's
 * probe found 3 valid endpoints out of 6 submitted. The seven Bazaar
 * missed and the three x402scout rejected are the same seven — every
 * route that refuses BEFORE the payment gate quotes a price.
 *
 * The refusals are right and they stay. "No summary, no charge" is
 * the honest order of business. But an indexer arrives with no
 * parameters and no signature, gets a 400, and concludes we are not
 * an x402 endpoint at all — so the items best suited to being needed
 * (the anchor, the phantom check) are the ones nobody can find. In
 * July that partition was total: registered items took 132-864
 * challenges each, unregistered ones 0-11, no overlap.
 *
 * So: a request with no PAYMENT-SIGNATURE is asking the price, not
 * placing an order. It gets the 402, with the requirement stated in
 * the challenge. A request that carries a signature is buying, and
 * every guard below applies exactly as before — refusing before
 * settlement, no money moved, the promise unchanged.
 */
function isBuying(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): boolean {
  return Boolean(
    c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT"),
  );
}

/**
 * The shutter: no money taken for labor nobody is present to do.
 * Runs BEFORE the payment gate, so an away keeper can never cost a
 * buyer anything. Machine shelves and stocked shelves pass through.
 */
const shutterCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (item && (await requiresPresentKeeper(c.env, item))) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "upstream_unavailable",
          error:
            "The human-labor shelf is shuttered, the keeper is away from the counter. No charge taken; the promise stays honest. The machine shelves never close.",
          machine_shelves: `${c.env.STORE_BASE_URL}/menu.json`,
          leave_a_request: `POST ${c.env.STORE_BASE_URL}/api/request \u2014 read when the keeper is back.`,
        },
        503,
      );
    }
  }
  await next();
};

/**
 * THE BENCH, which is the other half of the shutter's own promise.
 *
 * The shutter asks "is the keeper there." This asks "how much has he
 * already been sold." Both have to be true for "we never promise labor
 * nobody is there to do" to mean anything, and only the first was ever
 * checked — a keeper seen an hour ago could be sold ten weeks of work
 * in an afternoon, because weekly_inventory bounds the RATE of sales
 * and nothing bounded the LEVEL of the backlog.
 *
 * Before the payment gate, like the shutter: a capacity refusal after
 * settlement is money taken to be told no.
 */
const capacityCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const item = getMenuItem(buyItemId(c));
  if (item) {
    const verdict = await capacityVerdict(c.env, item);
    if (!verdict.ok) {
      return c.json(
        {
          error: verdict.reason,
          open_orders: verdict.open,
          cap: verdict.cap,
          machine_shelves: `${c.env.STORE_BASE_URL}/menu.json`,
          leave_a_request: `POST ${c.env.STORE_BASE_URL}/api/request \u2014 free, and read by a human.`,
        },
        503,
      );
    }
  }
  await next();
};

/**
 * Sold out, honestly: a bare stocked shelf issues no 402 nobody can
 * settle. Real scarcity, checkable, restocked by the keeper's hands.
 */
const stockCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (item?.stocked) {
    const count = await stockedShelfCount(c.env, item);
    if (count === 0) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "already_done",
          error: `Sold out, honestly. Every unit of "${item.name}" is keeper-made ahead of time, and the shelf is bare until he stocks it again. No charge, no waitlist theater.`,
          fulfillment_class: "stocked",
          stock: 0,
          menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
        },
        409,
      );
    }
  }
  await next();
};


/**
 * THE DOOR LAW, shared with the MCP till (lib/purchase-door.ts,
 * 2026-09-04). Twenty-three per-item middlewares used to stand here,
 * each refusing one malformed input before the payment gate, while the
 * MCP door carried five of them and forwarded a dozen fields — so a
 * Bitcoin anchor bought over MCP settled, minted, and died in the goods
 * step with no digest. The refusals are the same sentences in the same
 * order; only the file changed, and now there is one of it.
 *
 * The probe rule holds: a request with no PAYMENT-SIGNATURE is asking
 * the price, not placing an order, and the gate answers it with the
 * 402. Every refusal here lands before any money moves.
 */
const inputLawCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const item = getMenuItem(buyItemId(c));
  if (!item || !isBuying(c)) {
    return next();
  }
  const refusal = await refusePurchaseInput(
    item,
    (name) => c.req.query(name),
    c.env,
    "query",
  );
  if (refusal) {
    return c.json(refusal.body, refusal.status);
  }
  await next();
};

buyRoutes.use("/api/buy/*", noStore);
buyRoutes.use("/api/buy/*", shelfCheck);
buyRoutes.use("/api/buy/*", stockCheck);
buyRoutes.use("/api/buy/*", shutterCheck);
buyRoutes.use("/api/buy/*", capacityCheck);
buyRoutes.use("/api/buy/*", inputLawCheck);
buyRoutes.use("/api/buy/*", paymentGate);
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

  // What the buyer sent, read by the one mapping both doors share.
  const input = readFulfillmentInput(item, (name) => c.req.query(name), {
    userAgent: c.req.header("User-Agent"),
    referrer: c.req.header("Referer"),
  });

  /*
   * THE DECLINE IS CAUGHT HERE, in the handler's own frame, and not
   * left to the gate. Hono converts a throw into `onError` on its way
   * back up, so a settlement decline that escaped this line reached
   * the buyer as "something fell off a shelf" — the store blaming its
   * own shelving for a payment that was refused. The gate keeps a
   * backstop for the same error, but the honest answer is built here,
   * where we still know what happened.
   */
  try {
    return c.json(await fulfillPurchase(c.env, item, pending, input));
  } catch (error) {
    if (error instanceof SettlementDeclined) return error.response;
    throw error;
  }
});

buyRoutes.get("/api/order/:order_id", async (c) => {
  const order = await getOrder(c.env, c.req.param("order_id"));
  if (!order) {
    return c.json({ error: VOICE.orderNotFound }, 404);
  }
  const response: Record<string, unknown> = {
    order_id: order.order_id,
    item_id: order.item_id,
    item_name: order.item_name,
    status: order.status,
    created_at: order.created_at,
    sla_hours: order.sla_hours,
    patron_number: order.patron_number,
    badge_url: `${c.env.STORE_BASE_URL}/badges/${order.patron_number}.svg`,
  };
  if (order.status === "completed") {
    response["deliverable"] = order.deliverable;
    response["completed_at"] = order.completed_at;
    response["message"] = VOICE.orderCompleted;
  } else {
    response["message"] = VOICE.queueConfirmation;
  }

  /**
   * THE BREACH, WHERE THE BUYER CAN SEE IT.
   *
   * The card by the door promises: miss a promised window and you get
   * your money back, and you will not have to argue for it. Until now
   * the check behind that promise reported to the KEEPER only — which
   * makes "you won't have to argue for it" depend on somebody else
   * reading their alarms. A promise the buyer cannot verify is a
   * promise they have to argue for by definition.
   *
   * So the order's own page says it: past the window, by how long,
   * and whether a refund has been raised yet. Derived at read from
   * the order's own timestamps, so it cannot drift from the record
   * and cannot be forgotten on a write path.
   *
   * IT MOVES NO MONEY AND PROMISES NO DATE. Rule 10: refunds are
   * created pending and the keeper pays them by hand. Saying "owed"
   * here and "automatic" nowhere is the distinction that rule exists
   * to protect.
   */
  const due = Date.parse(order.created_at) + order.sla_hours * 3_600_000;
  const finishedAt = order.completed_at ? Date.parse(order.completed_at) : null;
  const reference = finishedAt ?? Date.now();
  if (Number.isFinite(due) && reference > due) {
    const hoursLate = Math.round(((reference - due) / 3_600_000) * 10) / 10;
    response["window_breached"] = {
      due_at: new Date(due).toISOString(),
      hours_late: hoursLate,
      kind: finishedAt ? "delivered_late" : "still_open",
      owed_usdc: order.paid_usdc,
      note: finishedAt
        ? "This was delivered after its promised window. The promise says a missed window earns the money back; delivering eventually does not discharge it. You are owed a refund and you do not have to ask for it."
        : "This is past its promised window and nothing has been delivered. You are owed a refund and you do not have to ask for it.",
      how_it_gets_paid:
        "The keeper pays refunds by hand, with a transaction hash on the record. Nothing here is automatic and this store does not claim it is — see rule 10 in HOUSE_RULES.",
      verify: `${c.env.STORE_BASE_URL}/api/order/${order.order_id}`,
    };
  }
  return c.json(response);
});
