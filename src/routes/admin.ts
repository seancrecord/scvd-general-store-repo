import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import { listAlerts, sendAlert } from "@/lib/alerts";
import { listBazaarLedger } from "@/lib/bazaar-observer";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  listPayers,
  listRecentChallenges,
  readMonthLedger,
  readPorchLedger,
} from "@/lib/metrics";
import { sanitizeText } from "@/lib/sanitize";
import { renderCounterPage } from "@/pages/admin/counter-page";
import { renderOfficePage } from "@/pages/admin/office-page";
import { renderToolsPage } from "@/pages/admin/tools-page";
import { compileDigest, getLatestDigest } from "@/services/digest";
import { listIssues, publishIssue } from "@/services/gazette";
import { deleteGuestbookEntry, listGuestbook } from "@/services/guestbook";
import {
  listLetters,
  replyToLetter,
  setLetterStatus,
} from "@/services/letters";
import {
  acknowledgeOrder,
  completeOrder,
  listOrders,
  resetWeeklyInventory,
} from "@/services/orders";
import {
  listConfessions,
  setConfessionStatus,
} from "@/services/confessions";
import { setMonthlyNote } from "@/services/patronage";
import {
  addCorrection,
  assembleDraft,
  getDraft,
  publishEdition,
} from "@/services/gazette-weekly";
import {
  listCommissions,
  listFailedItems,
  listWaitlist,
} from "@/services/requests";
import { listRefunds, markRefundPaid } from "@/services/refunds";
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

/** One shelf failing to load never takes the room down. */
function shelf<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string,
  notes: string[],
): T {
  if (result.status === "fulfilled") {
    return result.value;
  }
  notes.push(label);
  return fallback;
}

adminRoutes.get("/admin/counter", async (c) => {
  const notes: string[] = [];
  const [
    orders,
    waitlist,
    commissions,
    failedItems,
    guestbook,
    weekNote,
    tips,
    letters,
    alerts,
    gazetteDraft,
    confessions,
    refunds,
  ] = await Promise.allSettled([
    listOrders(c.env),
    listWaitlist(c.env),
    listCommissions(c.env),
    listFailedItems(c.env),
    listGuestbook(c.env, 30),
    c.env.COUNTERS.get(KV_KEYS.weekNote),
    listTips(c.env),
    listLetters(c.env),
    listAlerts(c.env, 5),
    getDraft(c.env),
    listConfessions(c.env),
    listRefunds(c.env),
  ]);
  return c.html(
    renderCounterPage({
      orders: shelf(orders, [], "orders", notes),
      waitlist: shelf(waitlist, [], "waitlists", notes),
      commissions: shelf(commissions, [], "requests", notes),
      failedItems: shelf(failedItems, {}, "failed items", notes),
      guestbook: shelf(guestbook, [], "guestbook", notes),
      weekNote: shelf(weekNote, null, "week note", notes) || DEFAULT_WEEK_NOTE,
      tips: shelf(tips, [], "tips", notes).map((tip) => tip.record),
      letters: shelf(letters, [], "letters", notes).map(
        (entry) => entry.record,
      ),
      alerts: shelf(alerts, [], "alerts", notes),
      gazetteDraft: shelf(gazetteDraft, null, "gazette draft", notes),
      confessions: shelf(confessions, [], "confessions", notes).map(
        (entry) => entry.record,
      ),
      refunds: shelf(refunds, [], "refunds", notes),
      loadNotes: notes,
    }),
  );
});

adminRoutes.get("/admin", async (c) => {
  const notes: string[] = [];
  const [
    monthLedger,
    porchLedger,
    payers,
    recentChallenges,
    bazaarLedger,
    gazetteIssues,
    orders,
    letters,
    tips,
    confessions,
    refunds,
    alerts,
  ] = await Promise.allSettled([
    readMonthLedger(c.env),
    readPorchLedger(c.env),
    listPayers(c.env),
    listRecentChallenges(c.env),
    listBazaarLedger(c.env),
    listIssues(c.env),
    listOrders(c.env),
    listLetters(c.env),
    listTips(c.env),
    listConfessions(c.env),
    listRefunds(c.env),
    listAlerts(c.env, 5),
  ]);
  const emptyLedger = {
    month: new Date().toISOString().slice(0, 7),
    items: {},
    channels: {},
    channelsHouse: {},
    channels402: {},
    channels402House: {},
    channels402Infra: {},
    days: {},
    venues: {},
    revenueUsdc: 0,
    revenueHouseUsdc: 0,
  };
  const pendingReviews =
    shelf(tips, [], "tips", notes).filter(
      (tip) => tip.record.status === "pending_review",
    ).length +
    shelf(confessions, [], "confessions", notes).filter(
      (entry) => entry.record.status === "pending_review",
    ).length +
    shelf(refunds, [], "refunds", notes).filter(
      (refund) => refund.status === "refund_pending",
    ).length;
  return c.html(
    renderOfficePage({
      monthLedger: shelf(monthLedger, emptyLedger, "month ledger", notes),
      porchLedger: shelf(
        porchLedger,
        { surfaces: {}, organicVisits: 0, porchToPurchase: null, truncated: false },
        "porch",
        notes,
      ),
      payers: shelf(payers, [], "payers", notes),
      recentChallenges: shelf(recentChallenges, [], "window-shoppers", notes),
      bazaarLedger: shelf(bazaarLedger, [], "bazaar ledger", notes),
      gazetteIssues: shelf(gazetteIssues, [], "gazette rack", notes),
      work: {
        orders: shelf(orders, [], "orders", notes).filter(
          (order) => order.status === "queued",
        ).length,
        letters: shelf(letters, [], "letters", notes).filter(
          (entry) => entry.record.status !== "archived",
        ).length,
        reviews: pendingReviews,
        alerts: shelf(alerts, [], "alerts", notes).length,
      },
      loadNotes: notes,
    }),
  );
});

// Old bookmark; the books merged into the desk.
adminRoutes.get("/admin/books", (c) => c.redirect("/admin"));

adminRoutes.get("/admin/tools", (c) => c.html(renderToolsPage()));

adminRoutes.post("/admin/confessions/:confession_id/approve", async (c) => {
  const updated = await setConfessionStatus(
    c.env,
    c.req.param("confession_id"),
    "approved",
  );
  if (!updated) {
    return c.text("No confession by that id in the drawer.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/confessions/:confession_id/reject", async (c) => {
  const updated = await setConfessionStatus(
    c.env,
    c.req.param("confession_id"),
    "rejected",
  );
  if (!updated) {
    return c.text("No confession by that id in the drawer.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/gazette/edition/assemble", async (c) => {
  // The keeper's hand-set lever ignores THE_NINETY gate.
  await assembleDraft(c.env, true);
  return c.redirect("/admin");
});

adminRoutes.post("/admin/gazette/edition/publish", async (c) => {
  const form = await c.req.parseBody();
  const markdown =
    typeof form["markdown"] === "string" ? form["markdown"].trim() : "";
  if (!markdown) {
    return c.text("An edition needs its pages.", 400);
  }
  await publishEdition(c.env, markdown);
  return c.redirect("/admin");
});

adminRoutes.post("/admin/gazette/correction", async (c) => {
  const form = await c.req.parseBody();
  const correction = sanitizeText(form["correction"], 500);
  if (!correction) {
    return c.text("A correction needs words in it.", 400);
  }
  await addCorrection(c.env, correction);
  return c.redirect("/admin");
});

adminRoutes.post("/admin/letters/:letter_id/read", async (c) => {
  const updated = await setLetterStatus(c.env, c.req.param("letter_id"), "read");
  if (!updated) {
    return c.text("No letter by that id in the box.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/letters/:letter_id/reply", async (c) => {
  const form = await c.req.parseBody();
  const reply = sanitizeText(form["reply"], 5000);
  if (!reply) {
    return c.text("A reply needs words in it.", 400);
  }
  const updated = await replyToLetter(c.env, c.req.param("letter_id"), reply);
  if (!updated) {
    return c.text("No letter by that id in the box.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/letters/:letter_id/archive", async (c) => {
  const updated = await setLetterStatus(
    c.env,
    c.req.param("letter_id"),
    "archived",
  );
  if (!updated) {
    return c.text("No letter by that id in the box.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/patronage/note", async (c) => {
  const form = await c.req.parseBody();
  const note = sanitizeText(form["monthly_note"], 1000);
  if (!note) {
    return c.text("The monthly note needs words in it.", 400);
  }
  await setMonthlyNote(c.env, note);
  return c.redirect("/admin/tools");
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
  return c.redirect("/admin/tools");
});

adminRoutes.post("/admin/refunds/:refund_id/paid", async (c) => {
  const form = await c.req.parseBody();
  const txHash =
    typeof form["tx_hash"] === "string" ? form["tx_hash"].trim() : "";
  if (!txHash) {
    return c.text("A paid refund needs its transaction hash.", 400);
  }
  const updated = await markRefundPaid(
    c.env,
    c.req.param("refund_id"),
    txHash,
  );
  if (!updated) {
    return c.text("No refund by that number on the ledger.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/orders/:order_id/ack", async (c) => {
  const order = await acknowledgeOrder(c.env, c.req.param("order_id"));
  if (!order) {
    return c.text("No order by that number.", 404);
  }
  return c.redirect("/admin");
});

adminRoutes.post("/admin/alerts/test", async (c) => {
  await sendAlert(c.env, {
    condition: "worker_health",
    detail:
      "Dummy alert, the keeper pulled the test lever. If you're reading this in your inbox, the wire works.",
    key: `test-${Date.now()}`,
  });
  return c.redirect("/admin/tools");
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
  return c.redirect("/admin/tools");
});

adminRoutes.get("/admin/digest", async (c) => {
  const digest = (await getLatestDigest(c.env)) ?? (await compileDigest(c.env));
  return c.json(digest);
});
