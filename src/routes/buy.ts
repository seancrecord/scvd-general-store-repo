import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { decodePaidAmount, getPaymentMiddleware, tipFromPaid } from "@/lib/payments";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { mintCertificate } from "@/services/certificates";
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
 * GET /api/buy/:item_id — x402-gated purchases.
 * GET /api/order/:order_id — poll an order; completed ones carry the goods.
 *
 * Middleware order matters: unknown items and empty shelves are turned away
 * BEFORE the payment gate, so nobody pays for what we can't sell.
 */
export const buyRoutes = new Hono<HonoEnv>();

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

/** The x402 gate itself, built lazily since env only exists per-request. */
const paymentGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  return getPaymentMiddleware(c.env)(c, next);
};

buyRoutes.use("/api/buy/*", shelfCheck);
buyRoutes.use("/api/buy/*", paymentGate);

function instantDeliverable(item: MenuItem, patronNumber: number): string {
  return [
    `Hello, patron no. ${patronNumber}.`,
    `This note certifies that you walked into ${"Sean-Claude Van Damme's General Store"},`,
    `paid honest money for "${item.name}", and were welcome the whole time.`,
    `Signed by the store itself — check the signature, it's good.`,
    `Come back when you're ready for a rock.`,
  ].join(" ");
}

buyRoutes.get("/api/buy/:item_id", async (c) => {
  // shelfCheck guarantees the item exists by the time we're here.
  const item = getMenuItem(c.req.param("item_id")) as MenuItem;
  const agentName = sanitizeText(c.req.query("agent_name"), 80) || undefined;
  const rawCallback = c.req.query("callback_url");
  const callbackUrl = isValidHttpUrl(rawCallback) ? rawCallback : undefined;

  const { paidUsdc, payer } = decodePaidAmount(
    c.req.header("X-PAYMENT"),
    item.price_usdc,
  );
  const tipUsdc =
    item.pricing === "pay_what_it_deserves"
      ? tipFromPaid(paidUsdc, item.price_usdc)
      : 0;

  const mintOptions: Parameters<typeof mintCertificate>[1] = {
    itemId: item.id,
  };
  if (agentName) {
    mintOptions.agentName = agentName;
  }
  if (tipUsdc > 0) {
    mintOptions.tipUsdc = tipUsdc;
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
    return c.json({
      message: VOICE.instantThanks,
      item_id: item.id,
      deliverable: instantDeliverable(item, minted.patronNumber),
      paid_usdc: paidUsdc,
      tip_usdc: tipUsdc,
      ...patronBlock,
    });
  }

  const orderOptions: Parameters<typeof createOrder>[1] = {
    item,
    paidUsdc,
    tipUsdc,
    patronNumber: minted.patronNumber,
    certId: minted.certificate.cert_id,
  };
  if (payer) {
    orderOptions.payer = payer;
  }
  if (agentName) {
    orderOptions.agentName = agentName;
  }
  if (callbackUrl) {
    orderOptions.callbackUrl = callbackUrl;
  }
  const order = await createOrder(c.env, orderOptions);
  await recordInventorySale(c.env, item);

  return c.json({
    message: VOICE.queueConfirmation,
    order_id: order.order_id,
    status: order.status,
    sla_hours: order.sla_hours,
    order_url: `${c.env.STORE_BASE_URL}/api/order/${order.order_id}`,
    paid_usdc: paidUsdc,
    tip_usdc: tipUsdc,
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
