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
  listRecentPricedEvents,
  listEventsForItem,
  listRecentPorchEvents,
  readMonthLedger,
  readPorchLedger,
  emptyMonthLedger,
  reconcileSettles,
} from "@/lib/metrics";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { recountFromRows } from "@/lib/recount";
import { computeStats } from "@/services/stats";
import { renderAdminShell } from "@/pages/admin/layout";
import { wantsHtml } from "@/pages/simple-page";
import { renderBellPage } from "@/pages/admin/bell-page";
import { renderCensusPage } from "@/pages/admin/census-page";
import { renderReferralsPage } from "@/pages/admin/referrals-page";
import { renderDeclinesPage } from "@/pages/admin/declines-page";
import { renderRecountPage } from "@/pages/admin/recount-page";
import { renderCounterPage } from "@/pages/admin/counter-page";
import { renderOfficePage } from "@/pages/admin/office-page";
import { renderCvCorner } from "@/pages/admin/cv-corner-page";
import { renderItemEventsPage } from "@/pages/admin/item-events-page";
import {
  listAlmanacEntries,
  listKeeperEntries,
  removeAlmanacEntry,
  saveAlmanacEntry,
} from "@/services/almanac-store";
import { listKeys } from "@/lib/kv-list";
import { bulkGetText } from "@/lib/kv-bulk";
import { getFoundingEdition } from "@/services/founding";
import type { ShutterState } from "@/services/shutter";
import { readResearchTrails } from "@/lib/research-log";
import { renderToolsPage } from "@/pages/admin/tools-page";
import { compileDigest, getLatestDigest } from "@/services/digest";
import { printFoundingEdition } from "@/services/founding";
import { listIssues, publishIssue } from "@/services/gazette";
import { createHandover, HandoverError } from "@/services/key-handover";
import {
  auditDeliveries,
  DELIVERY_GRACE_MINUTES,
} from "@/services/delivery-audit";
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
  draftFreshness,
  FRESH,
  getDraft,
  publishEdition,
  StaleDraftError,
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
  /**
   * THE FRESHNESS CHECK RUNS WHERE THE KEEPER'S EYES ARE. Publish
   * refuses a stale draft on its own, but a refusal he first learns
   * about after editing twenty minutes of copy is a refusal that
   * arrived late — the drift belongs on the desk, beside the draft,
   * before the pen comes out. A failed check degrades to "fresh"
   * with a load note, same as every other shelf on this page.
   */
  const draftOnDesk = shelf(gazetteDraft, null, "gazette draft", notes);
  const gazetteFreshness = await draftFreshness(c.env, draftOnDesk).catch(
    () => {
      notes.push("gazette freshness check failed to load");
      return FRESH;
    },
  );
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
      gazetteDraft: draftOnDesk,
      gazetteFreshness,
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
    allTimeStats,
  ] = await Promise.allSettled([
    readMonthLedger(c.env),
    readPorchLedger(c.env),
    listPayers(c.env),
    listRecentPricedEvents(c.env),
    listBazaarLedger(c.env),
    listIssues(c.env),
    listOrders(c.env),
    listLetters(c.env),
    listTips(c.env),
    listConfessions(c.env),
    listRefunds(c.env),
    listAlerts(c.env, 5),
    reconcileSettles(c.env),
    computeStats(c.env),
  ]);
  const emptyLedger = emptyMonthLedger();
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
      allTime: (() => {
        const stats = shelf(allTimeStats, null, "all-time stats", notes);
        return stats
          ? {
              organic: stats.organic_settlements,
              house: stats.house_settlements,
            }
          : null;
      })(),
      bazaarLedger: shelf(bazaarLedger, [], "bazaar ledger", notes),
      gazetteIssues: shelf(gazetteIssues, [], "gazette rack", notes),
      almanacSlugs: (await listAlmanacEntries(c.env).catch(() => [])).map(
        (entry) => entry.slug,
      ),
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

/**
 * The back shelf. Every reading is optional and independent: the levers
 * are what you reach for when something is wrong, so a failed read must
 * never take the page down — and must never render as a confident
 * default either. "Unknown" and "open" cannot look alike on a page
 * about whether the store is taking money.
 */
adminRoutes.get("/admin/tools", async (c) => {
  const month = new Date().toISOString().slice(0, 7);
  const settled = await Promise.allSettled([
    shutterState(c.env),
    getFoundingEdition(c.env),
    c.env.COUNTERS.get(KV_KEYS.patronageNote(month)),
    getDraft(c.env),
    listKeys(c.env.COUNTERS, { prefix: "inventory:", cap: 200 }),
    listKeeperEntries(c.env),
  ]);
  const value = <T>(index: number): T | null =>
    settled[index]?.status === "fulfilled"
      ? ((settled[index] as PromiseFulfilledResult<T>).value ?? null)
      : null;

  let inventory: Record<string, number> | null = null;
  const inventoryKeys = value<{ names: string[] }>(4);
  if (inventoryKeys) {
    inventory = {};
    const counts = await bulkGetText(c.env.COUNTERS, inventoryKeys.names).catch(
      () => null,
    );
    if (counts === null) {
      inventory = null;
    } else {
      for (const name of inventoryKeys.names) {
        const item = name.split(":")[1] ?? name;
        const sold = Number.parseInt(counts.get(name) ?? "0", 10);
        if (Number.isFinite(sold) && sold > 0) {
          inventory[item] = (inventory[item] ?? 0) + sold;
        }
      }
    }
  }

  return c.html(
    renderToolsPage({
      shutter: value<ShutterState>(0),
      foundingPrinted:
        settled[1]?.status === "fulfilled" ? value(1) !== null : null,
      patronageNote: value<string>(2),
      draftWaiting:
        settled[3]?.status === "fulfilled" ? value(3) !== null : null,
      inventory,
      month,
      almanacPages:
        settled[5]?.status === "fulfilled"
          ? (value<{ slug: string; title: string; date: string }[]>(5) ?? [])
          : null,
    }),
  );
});

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
  try {
    await publishEdition(c.env, markdown);
  } catch (error) {
    /**
     * The press refused a stale draft. Named movements, then the way
     * out — re-assemble — spelled beside the refusal, because a
     * refusal without the next step is a wall rather than a gate.
     * 409: the draft conflicts with the current state of the books.
     */
    if (error instanceof StaleDraftError) {
      return c.text(
        [
          "Not printed. The books moved since this draft was set:",
          ...error.changes.map((change) => `  - ${change}`),
          "",
          "Re-assemble the draft from the back shelf (or the desk's re-assemble button), re-apply any edits worth keeping, and publish that.",
        ].join("\n"),
        409,
      );
    }
    throw error;
  }
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

/**
 * MINT THE KEY HANDOVER ANNOUNCEMENT — the keeper's hand, one time,
 * behind the office door.
 *
 * Rule 30 with the volume up. This is the single most consequential
 * thing this store can publish: a signed statement that the key
 * everything verifies against is changing. There is no cron for it, no
 * public route, and no automatic trigger, because any mechanism that
 * could mint one without the keeper deliberately asking is a mechanism
 * that can be induced to mint one.
 *
 * ORDERING IS THE WHOLE PROTOCOL, and this route is the reason the
 * ordering is even possible: it signs with whatever key is live at the
 * moment it runs. Run it BEFORE the secret is replaced and the
 * announcement carries the OUTGOING key's signature, which is what
 * makes the handover checkable. Run it after and it carries the new
 * key vouching for itself, which is worth nothing. CEREMONY_B.md puts
 * this in a phase before the secret is touched for exactly that
 * reason, and createHandover records the signing key from the
 * signature rather than from anything typed in, so the announcement
 * cannot claim an outgoing key that did not actually sign it.
 *
 * IT TAKES A PUBLIC KEY AND NOTHING ELSE. No seed reaches this store,
 * this route, or any agent, ever.
 */
adminRoutes.post("/admin/keys/handover", async (c) => {
  const form = await c.req.parseBody();
  const incoming = String(form["incoming_public_key"] ?? "").trim();
  const reason = sanitizeText(form["reason"], 2000);
  if (!reason) {
    return c.text(
      "A handover needs a reason in plain words. It gets published exactly as written, and 'routine rotation' when it was not one is the kind of sentence this store exists to not write.",
      400,
    );
  }
  try {
    const record = await createHandover(c.env, {
      incomingPublicKey: incoming,
      reason,
    });
    return c.json({
      minted: record.handover.handover_id,
      verify_url: `${c.env.STORE_BASE_URL}/api/verify/${record.handover.handover_id}`,
      outgoing_public_key: record.handover.outgoing_public_key,
      incoming_public_key: record.handover.incoming_public_key,
      next: "The announcement is signed by the OUTGOING key and live. Now — and only now — replace the SIGNING_KEY secret, then add the retired key to RETIRED_KEYS with this handover_id. Until that entry exists, artifacts signed by the old key will read as unrecognised rather than retired.",
    });
  } catch (error) {
    return c.text(
      error instanceof HandoverError
        ? error.message
        : "The handover could not be minted.",
      400,
    );
  }
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
/**
 * Word of mouth: the referral-marker counters, read out cheaply. No row
 * scan, so this page is not the census's expense.
 */
adminRoutes.get("/admin/referrals", async (c) => {
  const { readReferrals, readReferrerHosts } = await import("@/lib/referrals");
  const { metricsMonth } = await import("@/lib/metrics");
  const [markers, referrers] = await Promise.all([
    readReferrals(c.env, metricsMonth()),
    readReferrerHosts(c.env),
  ]);
  return c.html(renderReferralsPage(markers, referrers));
});

/**
 * THE UNDELIVERED DESK. Sales that took money and sent nothing.
 *
 * JSON rather than a rendered page on purpose: this is the one desk
 * the keeper reaches while something is actually wrong, and the exact
 * settlement hash and payer address matter more than a layout. It is
 * also the page an alert points at, so it has to load when the store
 * is unhappy.
 *
 * Empty is the expected state, and it says so rather than rendering a
 * blank — "nothing here" and "the check did not run" must never look
 * the same (AT_SCALE rule 5).
 */
adminRoutes.get("/admin/deliveries", async (c) => {
  const audit = await auditDeliveries(c.env);
  return c.json({
    what_this_is:
      "Payments that settled and whose goods never went out. Each row is money this store took without delivering, found by the store rather than reported by a buyer — the buyer may be an agent that is no longer running.",
    verdict:
      audit.undelivered.length === 0
        ? `No undelivered sales. ${audit.in_flight} request(s) still inside the grace window, which is not a fault.`
        : `${audit.undelivered.length} SALE(S) TOOK MONEY AND DELIVERED NOTHING. Check each, then fulfil or refund by hand.`,
    what_to_do:
      "There is no automatic remedy and that is deliberate: re-running a handler whose side effects are unknown could double-deliver, and a refund is money moving, which never happens on a cron here. Fulfil it or refund it yourself, then delete the row.",
    grace_minutes: DELIVERY_GRACE_MINUTES,
    ...audit,
    blind_spot_this_covers:
      "The settle reconciliation on /admin compares counters against payer rows, and BOTH are written before the handler runs. It reports a clean zero during exactly this failure. That is why this desk exists separately.",
  });
});

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

/**
 * The per-item lookup: /admin/events?item=<key>. A query parameter
 * rather than a path segment because item keys carry colons
 * (almanac:notes-from-a-tuesday-in-oak-city), and a key that has to be
 * escaped to be looked up is a lookup nobody will use.
 */
adminRoutes.get("/admin/events", async (c) => {
  const item = c.req.query("item") ?? "";
  if (!item) {
    return c.html(
      renderItemEventsPage({
        item: "(no item named)",
        events: [],
        rows_scanned: 0,
        capped: false,
        oldest_row_seen: null,
      }),
    );
  }
  return c.html(renderItemEventsPage(await listEventsForItem(c.env, item)));
});

adminRoutes.get("/admin/bell", async (c) => {
  const rings = await listRecentPorchEvents(c.env, "bell", 25);
  return c.html(renderBellPage({ rings }));
});

/**
 * CV'S CORNER — the partner's spot in the keeper's office.
 *
 * Sits behind the same admin auth as every other room (it reads the
 * store's own books), and is READ-ONLY by construction: no form, no
 * input, no POST target. A test asserts that, because the guardrail is
 * the point of the surface rather than a note about it.
 *
 * A shelf that fails to load is NAMED rather than rendered as a zero.
 * Showing "0 settlements" when the read threw would be the friendlier
 * bug and the worse one, on a page whose whole job is an honest glance.
 */
adminRoutes.get("/admin/cv", async (c) => {
  const loadNotes: string[] = [];
  const shelf = async <T>(
    load: Promise<T>,
    fallback: T,
    name: string,
  ): Promise<T> => {
    try {
      return await load;
    } catch {
      loadNotes.push(name);
      return fallback;
    }
  };
  const [ledger, guestbook, bellRaw, patronRaw] = await Promise.all([
    shelf(readMonthLedger(c.env), emptyMonthLedger(), "the month ledger"),
    shelf(listGuestbook(c.env, 6), [], "the guestbook"),
    shelf(c.env.COUNTERS.get(KV_KEYS.bellCount), null, "the bell count"),
    shelf(c.env.COUNTERS.get(KV_KEYS.patronNumber), null, "the patron count"),
  ]);
  const asCount = (raw: string | null): number | null => {
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };
  return c.html(
    renderCvCorner({
      ledger,
      guestbook,
      bellCount: asCount(bellRaw),
      patronCount: asCount(patronRaw),
      trails: readResearchTrails(),
      loadNotes,
    }),
  );
});

/**
 * THE ALMANAC LEVER. The keeper's own rule — everything manageable from
 * the office — applied to the one shelf a stranger has ever bought from.
 * Pages written here go live on the next request; no deploy, no commit,
 * no laptop. The words are his and nothing here writes them.
 */
adminRoutes.post("/admin/almanac", async (c) => {
  const form = await c.req.parseBody();
  /**
   * Blanks are passed through as blanks, deliberately, so the service
   * decides what a missing field means rather than the form guessing
   * here. Title, teaser and date all derive from the writing when
   * empty; see saveAlmanacEntry, which refuses rather than inventing
   * one it cannot find.
   */
  const result = await saveAlmanacEntry(c.env, {
    title: String(form["title"] ?? ""),
    date: String(form["date"] ?? ""),
    teaser: String(form["teaser"] ?? ""),
    markdown: String(form["markdown"] ?? ""),
  });
  if (result.refused) {
    // Refuse loudly with the words still in hand rather than redirect
    // to a page that lost them.
    return c.text(`${result.refused}\n\nNothing was saved. Go back; your page is still in the form.`, 400);
  }
  return c.redirect("/admin/tools");
});

adminRoutes.post("/admin/almanac/remove", async (c) => {
  const form = await c.req.parseBody();
  await removeAlmanacEntry(c.env, String(form["slug"] ?? ""));
  return c.redirect("/admin/tools");
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
