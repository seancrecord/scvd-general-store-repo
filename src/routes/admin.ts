import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import { listBazaarLedger } from "@/lib/bazaar-observer";
import { KV_KEYS } from "@/lib/kv-keys";
import { listPayers, readMonthLedger } from "@/lib/metrics";
import { sanitizeText } from "@/lib/sanitize";
import { renderAdminPage } from "@/pages/admin-page";
import { compileDigest, getLatestDigest } from "@/services/digest";
import { listIssues, publishIssue } from "@/services/gazette";
import { deleteGuestbookEntry, listGuestbook } from "@/services/guestbook";
import {
  completeOrder,
  listOrders,
  resetWeeklyInventory,
} from "@/services/orders";
import { setMonthlyNote } from "@/services/patronage";
import {
  listCommissions,
  listFailedItems,
  listWaitlist,
} from "@/services/requests";
import { addRetiredWord } from "@/services/retired-words";
import { listTips, setTipStatus } from "@/services/tips";
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
  const [
    orders,
    waitlist,
    commissions,
    failedItems,
    guestbook,
    weekNote,
    tips,
    gazetteIssues,
    bazaarLedger,
    monthLedger,
    payers,
  ] = await Promise.all([
    listOrders(c.env),
    listWaitlist(c.env),
    listCommissions(c.env),
    listFailedItems(c.env),
    listGuestbook(c.env, 100),
    c.env.COUNTERS.get(KV_KEYS.weekNote),
    listTips(c.env),
    listIssues(c.env),
    listBazaarLedger(c.env),
    readMonthLedger(c.env),
    listPayers(c.env),
  ]);
  return c.html(
    renderAdminPage({
      orders,
      waitlist,
      commissions,
      failedItems,
      guestbook,
      weekNote: weekNote || DEFAULT_WEEK_NOTE,
      tips: tips.map((tip) => tip.record),
      gazetteIssues,
      bazaarLedger,
      monthLedger,
      payers,
    }),
  );
});

adminRoutes.post("/admin/patronage/note", async (c) => {
  const form = await c.req.parseBody();
  const note = sanitizeText(form["monthly_note"], 1000);
  if (!note) {
    return c.text("The monthly note needs words in it.", 400);
  }
  await setMonthlyNote(c.env, note);
  return c.redirect("/admin");
});

adminRoutes.post("/admin/tips/:tip_id/approve", async (c) => {
  const updated = await setTipStatus(c.env, c.req.param("tip_id"), "approved");
  if (!updated) {
    return c.text("No tip by that id in the jar.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/tips/:tip_id/reject", async (c) => {
  const updated = await setTipStatus(c.env, c.req.param("tip_id"), "rejected");
  if (!updated) {
    return c.text("No tip by that id in the jar.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/gazette/publish", async (c) => {
  const form = await c.req.parseBody();
  const title = sanitizeText(form["title"], 200);
  const rawIds = typeof form["tip_ids"] === "string" ? form["tip_ids"] : "";
  const requestedIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (!title || requestedIds.length === 0) {
    return c.text("An issue needs a title and at least one approved tip id.", 400);
  }
  const allTips = await listTips(c.env);
  const approved = allTips
    .map((tip) => tip.record)
    .filter(
      (tip) => requestedIds.includes(tip.id) && tip.status === "approved",
    );
  if (approved.length !== requestedIds.length) {
    return c.text(
      "Every tip in an issue must exist and be approved first. Check the ids.",
      400,
    );
  }
  await publishIssue(c.env, title, approved);
  return c.redirect("/admin");
});

adminRoutes.post("/admin/retired-words/add", async (c) => {
  const form = await c.req.parseBody();
  const rawPatron = typeof form["patron_number"] === "string" ? form["patron_number"] : "";
  const input: Parameters<typeof addRetiredWord>[1] = {
    word: form["word"],
    epitaph: form["epitaph"],
  };
  if (/^[0-9]+$/.test(rawPatron)) {
    input.patronNumber = parseInt(rawPatron, 10);
  }
  const entry = await addRetiredWord(c.env, input);
  if (!entry) {
    return c.text("A retirement needs the word and its epitaph.", 400);
  }
  return c.redirect("/admin");
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
