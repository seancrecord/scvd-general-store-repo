import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import { listAlerts, sendAlert } from "@/lib/alerts";
import { listBazaarLedger } from "@/lib/bazaar-observer";
import { takeCensus } from "@/lib/census";
import { readDeclines, traceClient } from "@/lib/declines";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  listPayers,
  listRecentChallenges,
  listRecentPorchEvents,
  readMonthLedger,
  readPorchLedger,
  reconcileSettles,
} from "@/lib/metrics";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { recountFromRows } from "@/lib/recount";
import { renderAdminShell } from "@/pages/admin/layout";
import { wantsHtml } from "@/pages/simple-page";
import { renderBellPage } from "@/pages/admin/bell-page";
import { renderCensusPage } from "@/pages/admin/census-page";
import { renderDeclinesPage } from "@/pages/admin/declines-page";
import { renderRecountPage } from "@/pages/admin/recount-page";
import { renderCounterPage } from "@/pages/admin/counter-page";
import { renderOfficePage } from "@/pages/admin/office-page";
import { renderToolsPage } from "@/pages/admin/tools-page";
import { compileDigest, getLatestDigest } from "@/services/digest";
import { printFoundingEdition } from "@/services/founding";
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
  getOrder,
  listOrders,
  resetWeeklyInventory,
} from "@/services/orders";
import { listClosers } from "@/services/closers";
import { listGrudges, refuseGrudge, releaseGrudge } from "@/services/grudges";
import { listStock, removeStockUnit, stockUnit } from "@/services/stock";
import {
  createLucky,
  parseLuckyStatus,
  parseLuckyStrength,
  setLuckyStatus,
} from "@/services/luckies";
import { luckyNote } from "@/store/copy";
import { listConfessions, setConfessionStatus } from "@/services/confessions";
import { listTags, setTagStatus } from "@/services/train";
import { setMonthlyNote } from "@/services/patronage";
import { markKeeperSeen, setShutter, shutterState } from "@/services/shutter";
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
import { DEFAULT_WEEK_NOTE, MENU_ITEMS } from "@/store";
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

/**
 * What the last stocking form actually did. A redirect in silence
 * reads exactly like a form that did nothing, which is how the
 * keeper lost a name to doubt on 2026-07-27.
 */
function stockNotice(
  stocked: string | undefined,
  shelf: string | undefined,
): string | undefined {
  const count = Number.parseInt(stocked ?? "", 10);
  if (!Number.isFinite(count) || count < 1) {
    return undefined;
  }
  const where = shelf ? ` on the ${shelf} shelf` : "";
  return count === 1
    ? `Stocked one${where}. It's on the shelf and the listing is live.`
    : `Stocked ${count}${where}. They're on the shelf and the listing is live.`;
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
    trainTags,
    refunds,
    closers,
    drawerStock,
    nameStock,
    grudges,
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
    listTags(c.env),
    listRefunds(c.env),
    listClosers(c.env, 20),
    listStock(c.env, "the_drawer"),
    listStock(c.env, "nomenclature"),
    listGrudges(c.env, 30),
  ]);
  // Auto-acknowledge on sight: opening the counter IS seeing the queue,
  // so the 24h page stands down for everything listed (keeper's order,
  // 2026-07-24 — the button was ceremony). The visit also restarts the
  // presence window: a keeper who looks is a keeper who's here.
  await markKeeperSeen(c.env).catch(() => undefined);
  const listedOrders = shelf(orders, [], "orders", notes);
  const unseen = listedOrders.filter(
    (order) => order.status === "queued" && !order.acknowledged_at,
  );
  await Promise.all(
    unseen.map((order) =>
      acknowledgeOrder(c.env, order.order_id).catch(() => null),
    ),
  );
  const seenAt = new Date().toISOString();
  for (const order of unseen) {
    order.acknowledged_at = seenAt;
  }
  return c.html(
    renderCounterPage({
      notice: stockNotice(c.req.query("stocked"), c.req.query("shelf")),
      orders: listedOrders,
      closers: shelf(closers, [], "closers", notes),
      stockShelves: {
        the_drawer: shelf(drawerStock, [], "drawer stock", notes),
        nomenclature: shelf(nameStock, [], "name stock", notes),
      },
      grudges: shelf(grudges, [], "grudges", notes),
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
      trainTags: shelf(trainTags, [], "the train", notes).map(
        (entry) => entry.record,
      ),
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
    reconciliation,
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
    reconcileSettles(c.env),
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
    settlesWithoutPayer: {},
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
        {
          surfaces: {},
          organicVisits: 0,
          porchToPurchase: null,
          truncated: false,
        },
        "porch",
        notes,
      ),
      payers: shelf(payers, [], "payers", notes),
      recentChallenges: shelf(recentChallenges, [], "window-shoppers", notes),
      reconciliation: shelf(reconciliation, null, "reconciliation", notes),
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

/**
 * The keeper walks by. Approving stamps a display date separate from
 * the purchase date; declining leaves the certificate alone, which is
 * the whole promise — they bought the persistence, not the placement.
 */
adminRoutes.post("/admin/train/:tag_id/approve", async (c) => {
  const updated = await setTagStatus(c.env, c.req.param("tag_id"), "approved");
  if (!updated) {
    return c.text("No tag by that id on the train.", 404);
  }
  return c.redirect("/admin/counter");
});

adminRoutes.post("/admin/train/:tag_id/decline", async (c) => {
  const updated = await setTagStatus(c.env, c.req.param("tag_id"), "declined");
  if (!updated) {
    return c.text("No tag by that id on the train.", 404);
  }
  // Signed and held. Not every tag makes the steel.
  return c.redirect("/admin/counter");
});

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
  const updated = await setLetterStatus(
    c.env,
    c.req.param("letter_id"),
    "read",
  );
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
    return c.text(
      "An issue needs a title and at least one approved tip id.",
      400,
    );
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
  const updated = await markRefundPaid(c.env, c.req.param("refund_id"), txHash);
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

/** The bell ledger: its own page so the deep row scan stays isolated. */
/**
 * The recount: the raw rows audited against the counters, with today's
 * crawler table applied to old rows. Its own page — the scan is
 * expensive and the desk shouldn't pay for it.
 */
adminRoutes.get("/admin/recount", async (c) => {
  const [recount, ledger] = await Promise.all([
    recountFromRows(c.env),
    readMonthLedger(c.env),
  ]);
  const counterChallenges = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.challenges,
    0,
  );
  const counterSettles = Object.values(ledger.items).reduce(
    (sum, row) => sum + row.settled,
    0,
  );
  return c.html(
    renderRecountPage({
      recount,
      counter_challenges_organic: counterChallenges,
      counter_settles_organic: counterSettles,
    }),
  );
});

/**
 * The census and the walk detector: one row scan, two readings. Kept
 * off the desk for the same reason the recount is — the scan is
 * expensive, and this one holds every client it sees in memory.
 */
adminRoutes.get("/admin/census", async (c) => {
  const census = await takeCensus(c.env);
  return c.html(renderCensusPage({ census, catalog_size: MENU_ITEMS.length }));
});

/**
 * THE DECLINE DESK. The rarest row in the books gets its own page,
 * because it is the only one that measures intent rather than
 * attention: somebody opened a wallet here and did not get through.
 *
 * Also traces the client with the most outside declines, since when a
 * real buyer bounces the SEQUENCE is the evidence — one signature
 * after reading one price is a different story from a walk and a pick.
 */
adminRoutes.get("/admin/declines", async (c) => {
  const report = await readDeclines(c.env);
  const outside = report.declines.filter((row) => !row.house);
  const counts = new Map<string, number>();
  for (const row of outside) {
    const ua = row.user_agent ?? "(no user-agent)";
    counts.set(ua, (counts.get(ua) ?? 0) + 1);
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const trace = busiest
    ? { user_agent: busiest, events: await traceClient(c.env, busiest) }
    : undefined;
  return c.html(renderDeclinesPage({ report, ...(trace ? { trace } : {}) }));
});

adminRoutes.get("/admin/bell", async (c) => {
  const rings = await listRecentPorchEvents(c.env, "bell", 25);
  return c.html(renderBellPage({ rings }));
});

/** The shutter lever: close or open the human-labor shelf by hand. */
adminRoutes.post("/admin/shutter", async (c) => {
  const form = await c.req.parseBody();
  await setShutter(c.env, form["state"] === "closed");
  return c.redirect("/admin/tools");
});

/** The founding press: prints once, signed, with the numbers of its day. */
adminRoutes.post("/admin/gazette/founding/print", async (c) => {
  const result = await printFoundingEdition(c.env);
  if ("refused" in result) {
    return c.text(result.refused, 409);
  }
  return c.redirect("/admin/tools");
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
  const order = await completeOrder(
    c.env,
    c.req.param("order_id"),
    deliverable,
  );
  if (!order) {
    return c.text("No order by that number.", 404);
  }
  return c.redirect("/admin");
});

/**
 * Completing a luckies order takes structured fields, not free text:
 * the card is the record, so the record needs its parts. Creates the
 * signed lucky, then completes the order with the card in the bag.
 * Legacy path: luckies draw instantly since 2026-07-25, so this only
 * serves orders queued before the ruling.
 */
adminRoutes.post("/admin/orders/:order_id/complete-lucky", async (c) => {
  const form = await c.req.parseBody();
  const name = sanitizeText(form["lucky_name"], 80);
  const provenance = sanitizeText(form["provenance"], 300);
  const power = sanitizeText(form["power"], 300);
  const strength = parseLuckyStrength(form["strength"]);
  if (!name || !provenance || !power || !strength) {
    return c.text(
      "A lucky needs a name, a provenance, a power, and an honest grade.",
      400,
    );
  }
  const order = await getOrder(c.env, c.req.param("order_id"));
  if (!order || order.item_id !== "luckies") {
    return c.text("No luckies order by that number.", 404);
  }
  if (order.status === "completed") {
    return c.text("That lucky is already picked and carded.", 400);
  }
  const record = await createLucky(c.env, {
    name,
    provenance,
    power,
    strength,
    orderId: order.order_id,
    certId: order.cert_id,
    patronNumber: order.patron_number,
  });
  const base = c.env.STORE_BASE_URL;
  await completeOrder(
    c.env,
    order.order_id,
    luckyNote({
      name: record.lucky.name,
      strength: record.lucky.strength,
      cardUrl: `${base}/luckies/${record.lucky.lucky_id}.svg`,
      recordUrl: `${base}/api/lucky/${record.lucky.lucky_id}`,
    }),
  );
  return c.redirect("/admin");
});

/** Names arrive in batches; one per line, uniqueness machine-enforced. */
adminRoutes.post("/admin/stock/nomenclature/bulk", async (c) => {
  const form = await c.req.parseBody();
  const raw = typeof form["batch"] === "string" ? form["batch"] : "";
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const rejected: string[] = [];
  let stocked = 0;
  for (const line of lines) {
    const result = await stockUnit(c.env, "nomenclature", { name: line });
    if ("refused" in result) {
      rejected.push(`${line.slice(0, 60)} \u2014 ${result.refused}`);
    } else {
      stocked += 1;
    }
  }
  if (rejected.length > 0) {
    return c.text(
      `Stocked ${stocked} name(s). Rejected ${rejected.length}:\n${rejected.join("\n")}`,
      400,
    );
  }
  return c.redirect(`/admin/counter?stocked=${stocked}&shelf=nomenclature`);
});

/** Stock one unit onto a stocked shelf (fields per the shelf's spec). */
adminRoutes.post("/admin/stock/:item_id", async (c) => {
  const itemId = c.req.param("item_id");
  const form = await c.req.parseBody();
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === "string") {
      fields[key] = sanitizeText(value, 300);
    }
  }
  const result = await stockUnit(c.env, itemId, fields);
  if ("refused" in result) {
    return c.text(result.refused, 400);
  }
  return c.redirect(
    `/admin/counter?stocked=1&shelf=${encodeURIComponent(itemId)}`,
  );
});

adminRoutes.post("/admin/stock/:item_id/remove", async (c) => {
  const form = await c.req.parseBody();
  const unitId = sanitizeText(form["unit_id"], 40);
  if (unitId) {
    await removeStockUnit(c.env, c.req.param("item_id"), unitId);
  }
  return c.redirect("/admin/counter");
});

/** Sunday grudge review: refuse refunds and refuses; release lets go. */
adminRoutes.post("/admin/grudges/refuse", async (c) => {
  const form = await c.req.parseBody();
  const key = typeof form["key"] === "string" ? form["key"] : "";
  if (key) {
    await refuseGrudge(c.env, key);
  }
  return c.redirect("/admin/counter");
});

adminRoutes.post("/admin/grudges/release", async (c) => {
  const form = await c.req.parseBody();
  const key = typeof form["key"] === "string" ? form["key"] : "";
  if (key) {
    await releaseGrudge(c.env, key);
  }
  return c.redirect("/admin/counter");
});

/** A write-in moved a lucky. Promotion is real; so is the bench. */
adminRoutes.post("/admin/luckies/move", async (c) => {
  const form = await c.req.parseBody();
  const luckyId = sanitizeText(form["lucky_id"], 40);
  const status = parseLuckyStatus(form["status"]);
  if (!luckyId || !status) {
    return c.text(
      "Moving a lucky takes its id and one of in_service, promoted, benched.",
      400,
    );
  }
  const note = sanitizeText(form["status_note"], 200);
  const record = await setLuckyStatus(
    c.env,
    luckyId,
    status,
    note || undefined,
  );
  if (!record) {
    return c.text("No lucky by that id in custody.", 404);
  }
  return c.redirect("/admin/tools");
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

/**
 * The digest. Renders in the office shell so it carries the nav like
 * every other room — it used to return bare JSON, which meant landing
 * on it was a one-way trip with no way back to anything. Accept:
 * application/json still gets the raw object for anything scripted.
 */
adminRoutes.get("/admin/digest", async (c) => {
  const digest = (await getLatestDigest(c.env)) ?? (await compileDigest(c.env));
  // JSON stays the DEFAULT: this route was JSON-only and something
  // scripted may be reading it. Only a browser, which asks for HTML
  // by name, gets the shell. Same wantsHtml rule as the front of the
  // store, and it keeps the existing contract intact.
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(digest);
  }
  return c.html(
    renderAdminShell(
      "digest",
      `<section>
        <h2>The digest</h2>
        <p>The latest compiled digest, or a fresh one if none was stored. Raw, because
        this is the assembled object rather than a reading of it — ask for it with
        <code>Accept: application/json</code> to get it as JSON.</p>
        <pre>${escapeHtml(JSON.stringify(digest, null, 2))}</pre>
      </section>`,
    ),
  );
});
