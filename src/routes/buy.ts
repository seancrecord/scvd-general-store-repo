import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import { mintCertificate } from "@/services/certificates";
import { deliverInstantGoods } from "@/services/instant-goods";
import {
  createOrder,
  getOrder,
  recordInventorySale,
  remainingInventory,
} from "@/services/orders";
import { recordFailedItem } from "@/services/requests";
import { getMenuItem, VOICE } from "@/store";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /api/buy/:item_id — x402-gated purchases (settled before minting).
 * GET /api/order/:order_id — poll an order; completed ones carry the goods.
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
 * context_anchor needs its summary BEFORE money moves: nobody pays $1
 * to anchor an empty page. Stored as written (length-capped, null bytes
 * stripped); it is agent-supplied data, never instructions to us.
 */
const anchorCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/context_anchor") {
    return next();
  }
  const summary = c.req.query("summary");
  if (!summary || summary.trim().length === 0) {
    return c.json(
      {
        error:
          "An anchor needs a summary query parameter — the state you want remembered. No summary, no charge.",
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
  if (c.req.path !== "/api/buy/phantom_check") {
    return next();
  }
  if (!isValidHttpUrl(c.req.query("url"))) {
    return c.json(
      {
        error:
          "A phantom check needs a url query parameter — http or https, the thing you want looked at. No target, no charge.",
      },
      400,
    );
  }
  await next();
};

buyRoutes.use("/api/buy/*", noStore);
buyRoutes.use("/api/buy/*", shelfCheck);
buyRoutes.use("/api/buy/*", anchorCheck);
buyRoutes.use("/api/buy/*", phantomCheck);
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
  const agentName = sanitizeText(c.req.query("agent_name"), 80) || undefined;
  const rawCallback = c.req.query("callback_url");
  const callbackUrl = isValidHttpUrl(rawCallback) ? rawCallback : undefined;

  const mintOptions: Parameters<typeof mintCertificate>[1] = {
    itemId: item.id,
  };
  if (agentName) {
    mintOptions.agentName = agentName;
  }
  if (payment.tipUsdc > 0) {
    mintOptions.tipUsdc = payment.tipUsdc;
  }
  if (item.id === "certificate_of_patronage") {
    mintOptions.patronage = true;
  }
  const minted = await mintCertificate(c.env, mintOptions);

  const patronBlock = {
    patron_number: minted.patronNumber,
    badge_url: minted.badgeUrl,
    certificate: minted.certificate,
    signature: minted.signature,
    verify_url: minted.verifyUrl,
  };

  if (item.fulfillment === "instant") {
    const goodsInput: Parameters<typeof deliverInstantGoods>[2] = {
      patronNumber: minted.patronNumber,
    };
    if (agentName) {
      goodsInput.agentName = agentName;
    }
    if (item.id === "context_anchor") {
      // anchorCheck validated presence and length before the gate.
      goodsInput.summary = (c.req.query("summary") ?? "").replace(/\0/g, "");
    }
    if (item.id === "phantom_check") {
      // phantomCheck validated the URL before the gate.
      goodsInput.targetUrl = c.req.query("url") ?? "";
    }
    if (item.id === "recurring_patronage") {
      const passId = sanitizeText(c.req.query("pass_id"), 40);
      if (passId) {
        goodsInput.passId = passId;
      }
    }
    const goods = await deliverInstantGoods(c.env, item, goodsInput);
    return c.json({
      message: VOICE.instantThanks,
      item_id: item.id,
      deliverable: goods.deliverable,
      paid_usdc: payment.paidUsdc,
      tip_usdc: payment.tipUsdc,
      ...(goods.extras ?? {}),
      ...patronBlock,
    });
  }

  const orderOptions: Parameters<typeof createOrder>[1] = {
    item,
    paidUsdc: payment.paidUsdc,
    tipUsdc: payment.tipUsdc,
    patronNumber: minted.patronNumber,
    certId: minted.certificate.cert_id,
  };
  if (payment.payer) {
    orderOptions.payer = payment.payer;
  }
  if (agentName) {
    orderOptions.agentName = agentName;
  }
  if (callbackUrl) {
    orderOptions.callbackUrl = callbackUrl;
  }
  // Ledger instrumentation: what the buyer asked, where they came from.
  const detail = sanitizeText(c.req.query("detail"), 600);
  if (detail) {
    orderOptions.detail = detail;
  }
  const source = sanitizeText(c.req.query("source"), 40);
  if (source) {
    orderOptions.source = source;
  }
  const userAgent = sanitizeText(c.req.header("User-Agent"), 200);
  if (userAgent) {
    orderOptions.userAgent = userAgent;
  }
  const referrer = sanitizeText(c.req.header("Referer"), 200);
  if (referrer) {
    orderOptions.referrer = referrer;
  }
  const order = await createOrder(c.env, orderOptions);
  await recordInventorySale(c.env, item);

  return c.json({
    message: VOICE.queueConfirmation,
    order_id: order.order_id,
    status: order.status,
    sla_hours: order.sla_hours,
    order_url: `${c.env.STORE_BASE_URL}/api/order/${order.order_id}`,
    paid_usdc: payment.paidUsdc,
    tip_usdc: payment.tipUsdc,
    ...patronBlock,
  });
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
