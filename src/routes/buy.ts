import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import {
  COFFEE_WIN_CAP,
  GRIEVANCE_CAP,
  fulfillPurchase,
  stockedShelfCount,
} from "@/services/fulfillment";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import { getOrder, remainingInventory } from "@/services/orders";
import { recordFailedItem } from "@/services/requests";
import { getMenuItem, VOICE } from "@/store";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /api/buy/:item_id, x402-gated purchases (settled before minting).
 * GET /api/order/:order_id, poll an order; completed ones carry the goods.
 *
 * Middleware order matters: unknown items, empty shelves, and malformed
 * inputs are turned away BEFORE the payment gate, so nobody pays for
 * what we can't sell.
 */
export const buyRoutes = new Hono<HonoEnv>();

/** Paid material must never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

/** Turns away unknown items (logged as market research) and sold-out shelves. */
const shelfCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
  const item = getMenuItem(itemId);
  if (!item) {
    await recordFailedItem(c.env, itemId);
    return c.json(
      {
        error: VOICE.unknownItem,
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
 * context_anchor needs its summary BEFORE money moves: nobody pays $1
 * to anchor an empty page. Stored as written (length-capped, null bytes
 * stripped); it is agent-supplied data, never instructions to us.
 */
const anchorCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/context_anchor" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const summary = c.req.query("summary");
  if (!summary || summary.trim().length === 0) {
    return c.json(
      {
        error:
          "An anchor needs a summary query parameter, the state you want remembered. No summary, no charge.",
      },
      400,
    );
  }
  if (summary.length > ANCHOR_SUMMARY_CAP) {
    return c.json(
      {
        error: `That summary runs past the ledger margin. ${ANCHOR_SUMMARY_CAP} characters, tops.`,
      },
      400,
    );
  }
  await next();
};

/** phantom_check needs a real URL BEFORE money moves: no target, no charge. */
const phantomCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/phantom_check" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  if (!isValidHttpUrl(c.req.query("url"))) {
    return c.json(
      {
        error:
          "A phantom check needs a url query parameter, http or https, the thing you want looked at. No target, no charge.",
      },
      400,
    );
  }
  await next();
};

/** the_confession needs words BEFORE money moves: nothing to hear, no charge. */
const confessionCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/the_confession" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const confession = c.req.query("confession");
  if (!confession || confession.trim().length === 0) {
    return c.json(
      {
        error:
          "A confession needs a confession query parameter, the thing itself, 500 characters. Nothing to hear, no charge.",
      },
      400,
    );
  }
  if (confession.length > 500) {
    return c.json(
      {
        error:
          "The counter hears up to 500 characters. Longer burdens go in the Mailbox, free.",
      },
      400,
    );
  }
  await next();
};

/** coffees_for_closers needs the win BEFORE money moves: no win, no coffee. */
const closerCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/coffees_for_closers" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const win = c.req.query("win");
  if (!win || win.trim().length === 0) {
    return c.json(
      {
        error:
          "This coffee needs a win query parameter, the thing you closed. No win, no charge.",
      },
      400,
    );
  }
  if (win.length > COFFEE_WIN_CAP) {
    return c.json(
      {
        error: `The certificate holds ${COFFEE_WIN_CAP} characters of win. Trim it to the good part.`,
      },
      400,
    );
  }
  await next();
};

/**
 * The shutter: no money taken for labor nobody is present to do.
 * Runs BEFORE the payment gate, so an away keeper can never cost a
 * buyer anything. Machine shelves and stocked shelves pass through.
 */
const shutterCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
  const item = getMenuItem(itemId);
  if (item && (await requiresPresentKeeper(c.env, item))) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return c.json(
        {
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
 * Sold out, honestly: a bare stocked shelf issues no 402 nobody can
 * settle. Real scarcity, checkable, restocked by the keeper's hands.
 */
const stockCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
  const item = getMenuItem(itemId);
  if (item?.stocked) {
    const count = await stockedShelfCount(c.env, item);
    if (count === 0) {
      return c.json(
        {
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

/** grudge needs its grievance BEFORE money moves: nothing named, no charge. */
const grievanceCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/grudge" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const grievance = c.req.query("grievance");
  if (!grievance || grievance.trim().length === 0) {
    return c.json(
      {
        error:
          "A grudge needs a grievance query parameter, the thing that wronged you. Nothing named, no charge.",
      },
      400,
    );
  }
  if (grievance.length > GRIEVANCE_CAP) {
    return c.json(
      {
        error: `The register holds ${GRIEVANCE_CAP} characters of grievance. Distill it; the spite survives compression.`,
      },
      400,
    );
  }
  await next();
};

/**
 * A tag needs a tag BEFORE money moves, and it needs to be a tag
 * rather than a billboard. Both refusals happen unpaid: learning the
 * rule by being charged for a decline is worse manners than we keep.
 */
const tagCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/graffiti_on_a_train" || !isBuying(c)) {
    return next();
  }
  const tag = c.req.query("tag");
  if (!tag || tag.trim().length === 0) {
    return c.json(
      {
        error:
          "Nothing to spray. Put your mark in the tag query parameter, up to 140 characters. No tag, no charge.",
      },
      400,
    );
  }
  if (tag.length > TAG_CAP) {
    return c.json(
      {
        error: `The side of a train holds ${TAG_CAP} characters. Anything longer is a letter, and the mailbox is free at /api/letter.`,
      },
      400,
    );
  }
  if (tagHasUrl(tag)) {
    return c.json(
      {
        error:
          "No URLs on the train. A tag is a mark, not a billboard — the wall is public and permanent, which is exactly what link spam wants. Say it without the link.",
      },
      400,
    );
  }
  await next();
};

buyRoutes.use("/api/buy/*", noStore);
buyRoutes.use("/api/buy/*", shelfCheck);
buyRoutes.use("/api/buy/*", stockCheck);
buyRoutes.use("/api/buy/*", shutterCheck);
buyRoutes.use("/api/buy/*", anchorCheck);
buyRoutes.use("/api/buy/*", phantomCheck);
buyRoutes.use("/api/buy/*", confessionCheck);
buyRoutes.use("/api/buy/*", closerCheck);
buyRoutes.use("/api/buy/*", grievanceCheck);
buyRoutes.use("/api/buy/*", tagCheck);
buyRoutes.use("/api/buy/*", paymentGate);
buyRoutes.use("/api/order/*", noStore);

buyRoutes.get("/api/buy/:item_id", async (c) => {
  // shelfCheck guarantees the item exists by the time we're here.
  const item = getMenuItem(c.req.param("item_id")) as MenuItem;
  const payment = c.get("payment");
  if (!payment) {
    // The gate never lets an unpaid request through; this is belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }

  const input: Parameters<typeof fulfillPurchase>[3] = {};
  const agentName = sanitizeText(c.req.query("agent_name"), 80);
  if (agentName && item.id !== "the_confession") {
    // Confessions stay anonymous unless sign_as says otherwise.
    input.agentName = agentName;
  }
  if (item.id === "the_confession") {
    // confessionCheck validated presence and length before the gate.
    input.confessionText = (c.req.query("confession") ?? "").replace(/\0/g, "");
    const signAs = sanitizeText(c.req.query("sign_as"), 80);
    if (signAs && signAs.toLowerCase() !== "anonymous") {
      input.agentName = signAs;
    }
  }
  const rawCallback = c.req.query("callback_url");
  if (isValidHttpUrl(rawCallback)) {
    input.callbackUrl = rawCallback;
  }
  if (item.id === "context_anchor") {
    // anchorCheck validated presence and length before the gate.
    input.summary = (c.req.query("summary") ?? "").replace(/\0/g, "");
  }
  if (item.id === "phantom_check") {
    // phantomCheck validated the URL before the gate.
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "coffees_for_closers") {
    // closerCheck validated presence and length before the gate.
    const win = (c.req.query("win") ?? "").replace(/\0/g, "");
    input.win = win;
    // The counter shows the keeper the win alongside the order.
    input.detail = win;
  }
  if (item.id === "grudge") {
    // grievanceCheck validated presence and length before the gate.
    input.grievance = (c.req.query("grievance") ?? "").replace(/\0/g, "");
  }
  if (item.id === "graffiti_on_a_train") {
    // tagCheck validated presence, length and link-spam before the gate.
    input.tag = (c.req.query("tag") ?? "").replace(/\0/g, "");
    // The counter shows the keeper the tag alongside the queue.
    input.detail = input.tag;
  }
  const passId = sanitizeText(c.req.query("pass_id"), 40);
  if (passId) {
    input.passId = passId;
  }
  const detail = sanitizeText(c.req.query("detail"), 600);
  if (detail) {
    input.detail = detail;
  }
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

  return c.json(await fulfillPurchase(c.env, item, payment, input));
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
  return c.json(response);
});
