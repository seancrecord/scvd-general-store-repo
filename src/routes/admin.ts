import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import { KV_KEYS } from "@/lib/kv-keys";
import { sanitizeText } from "@/lib/sanitize";
import { renderAdminPage } from "@/pages/admin-page";
import { compileDigest, getLatestDigest } from "@/services/digest";
import { deleteGuestbookEntry, listGuestbook } from "@/services/guestbook";
import {
  completeOrder,
  listOrders,
  resetWeeklyInventory,
} from "@/services/orders";
import {
  listCommissions,
  listFailedItems,
  listWaitlist,
} from "@/services/requests";
import { DEFAULT_WEEK_NOTE } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * The keeper's back room: /admin behind Basic Auth (username "keeper",
 * password from the ADMIN_PASSWORD secret).
 */
export const adminRoutes = new Hono<HonoEnv>();

const adminGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const gate = basicAuth({
    username: "keeper",
    password: c.env.ADMIN_PASSWORD,
  });
  return gate(c, next);
};

adminRoutes.use("/admin", adminGate);
adminRoutes.use("/admin/*", adminGate);

adminRoutes.get("/admin", async (c) => {
  const [orders, waitlist, commissions, failedItems, guestbook, weekNote] =
    await Promise.all([
      listOrders(c.env),
      listWaitlist(c.env),
      listCommissions(c.env),
      listFailedItems(c.env),
      listGuestbook(c.env, 100),
      c.env.COUNTERS.get(KV_KEYS.weekNote),
    ]);
  return c.html(
    renderAdminPage({
      orders,
      waitlist,
      commissions,
      failedItems,
      guestbook,
      weekNote: weekNote || DEFAULT_WEEK_NOTE,
    }),
  );
});

adminRoutes.post("/admin/orders/:order_id/complete", async (c) => {
  const form = await c.req.parseBody();
  const deliverable = sanitizeText(form["deliverable"], 5000);
  if (!deliverable) {
    return c.text("A completed order needs a deliverable.", 400);
  }
  const order = await completeOrder(c.env, c.req.param("order_id"), deliverable);
  if (!order) {
    return c.text("No order by that number.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/guestbook/delete", async (c) => {
  const form = await c.req.parseBody();
  const kvKey = typeof form["kv_key"] === "string" ? form["kv_key"] : "";
  if (kvKey) {
    await deleteGuestbookEntry(c.env, kvKey);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/note", async (c) => {
  const form = await c.req.parseBody();
  const note = sanitizeText(form["week_note"], 500);
  if (note) {
    await c.env.COUNTERS.put(KV_KEYS.weekNote, note);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/inventory/reset", async (c) => {
  await resetWeeklyInventory(c.env);
  return c.redirect("/admin");
});

adminRoutes.get("/admin/digest", async (c) => {
  const digest = (await getLatestDigest(c.env)) ?? (await compileDigest(c.env));
  return c.json(digest);
});
