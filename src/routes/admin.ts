import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { isHouseWallet } from "@/lib/channel";
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
  metricsMonth,
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
import {
  declineCommission,
  quoteCommission,
} from "@/services/commission-desk";
import { listRefunds, markRefundPaid } from "@/services/refunds";
import { listTips, setTipStatus } from "@/services/tips";
import { DEFAULT_WEEK_NOTE, MENU_ITEMS } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * The keeper's back room: /admin behind Basic Auth (username "keeper",
 * password from the ADMIN_PASSWORD secret).
 */
export const adminRoutes = new Hono<HonoEnv>();

/**
 * ADMIN AUTH, AND WHAT WATCHES IT (2026-08-04, a scanner's "not
 * enough around the passcode").
 *
 * The rock that IS worth pushing: hono's basicAuth already compares
 * with timingSafeEqual, so the timing side-channel is closed — that
 * is the usual finding, and it is already handled.
 *
 * The real gap it named without naming: a brute-force attempt was
 * INVISIBLE. The store's answer is never a hard lockout — a
 * single-user panel that any stranger can lock is a denial-of-service
 * foothold, not a defense — but the store's whole discipline is
 * "page the keeper," and a run of failed admin logins is exactly the
 * event worth a page. Counted in a window, alerted once past a
 * threshold, keyed so a standing attack pages once rather than
 * hourly. A correct login clears the count.
 *
 * WHAT WATCHING ALONE DID NOT DO (2026-08-10, six real failures from
 * somebody who was not the keeper). Seeing a guesser is not slowing
 * one. The page told the keeper it was happening and then offered him
 * the only lever it had — rotate the password — which is reflexive
 * advice: six failures are proof they did NOT get in, and rotating a
 * password nobody guessed does not make it harder to guess.
 *
 * "NO LOCKOUT" AND "NO THROTTLE" ARE DIFFERENT CHOICES and we had
 * taken both while only meaning to take the first. The property worth
 * protecting is that a stranger must never be able to bar the keeper
 * from his own store. A GLOBAL lockout breaks that. A PER-ADDRESS
 * throttle does not: a guesser slows only themselves down, and the
 * keeper on any other connection is untouched — as is the keeper on
 * the SAME connection, thirty seconds later.
 *
 * WHAT IT STILL DOES NOT STOP, said plainly rather than left to be
 * assumed: an attacker with many addresses. Per-address throttling
 * raises the cost of guessing from one machine and does nothing about
 * a botnet. The real defence against that is the entropy of
 * ADMIN_PASSWORD, which no code here can check on the keeper's
 * behalf. The throttle buys time and noise; it is not a substitute
 * for a long password.
 */
const ADMIN_FAIL_WINDOW_SECONDS = 15 * 60;
export const ADMIN_FAIL_ALERT_AT = 6;

/**
 * Failures from one address before that address starts waiting.
 *
 * DELIBERATELY ABOVE ADMIN_FAIL_ALERT_AT, and a test caught why. At
 * five, the throttle engaged BEFORE the sixth failure that raises the
 * page — and a throttled request never reaches the counter, so a
 * single-address run could be slowed and never reported. That is the
 * wrong order: the keeper hearing about it is worth more than the
 * attacker being slowed, and there is no reason not to have both.
 */
export const ADMIN_THROTTLE_AT = 8;
/** How long that address waits. Short: it is a speed bump, not a wall. */
const ADMIN_THROTTLE_SECONDS = 60;
/**
 * Ceiling on the wait, however long the run.
 *
 * FIVE MINUTES, NOT FIFTEEN, and the reason is the keeper rather than
 * the attacker. Twelve guesses an hour from one address already makes
 * guessing pointless; a quarter of an hour locked out of your own
 * store while you are trying to resolve an undelivered sale is a real
 * cost paid by the only person who ever legitimately fails.
 */
const ADMIN_THROTTLE_MAX_SECONDS = 5 * 60;

/**
 * The caller's address as Cloudflare saw it. Set at the edge, so a
 * client cannot forge it; absent only off-platform, where the
 * throttle degrades to the shared bucket rather than failing open.
 */
function callerIp(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * How long this address must wait, in seconds. Doubles with each
 * failure past the threshold and stops at the ceiling — enough to
 * make guessing pointless, never enough to lock anybody out for long.
 */
function throttleSeconds(fails: number): number {
  if (fails < ADMIN_THROTTLE_AT) return 0;
  const doublings = fails - ADMIN_THROTTLE_AT;
  return Math.min(
    ADMIN_THROTTLE_MAX_SECONDS,
    ADMIN_THROTTLE_SECONDS * 2 ** Math.min(doublings, 10),
  );
}

async function noteAdminAuthFailure(
  env: HonoEnv["Bindings"],
  ip: string,
): Promise<void> {
  // Per-address, for the throttle. Doubling wait, capped.
  const ipKey = KV_KEYS.adminFailByIp(ip);
  const ipFails = Number((await env.COUNTERS.get(ipKey)) ?? "0") + 1;
  await env.COUNTERS.put(ipKey, String(ipFails), {
    expirationTtl: ADMIN_THROTTLE_MAX_SECONDS,
  });

  const key = "admin_auth_fails";
  const count = Number((await env.COUNTERS.get(key)) ?? "0") + 1;
  await env.COUNTERS.put(key, String(count), {
    expirationTtl: ADMIN_FAIL_WINDOW_SECONDS,
  });
  if (count >= ADMIN_FAIL_ALERT_AT) {
    /**
     * NAME THE ADDRESSES WHILE THEY ARE STILL KNOWABLE (2026-08-11).
     * The page said "somebody is guessing" and the keeper's first
     * question — was that a scanner, or somebody I know poking a door
     * they have no key to? — was unanswerable: the per-address rows
     * expire minutes after the run stops, so by the time the page was
     * read the evidence was gone. The rows are on the books at the
     * moment the alert fires, so the alert quotes them. Addresses
     * appear FIRST in the text because sendAlert truncates the detail
     * at 1000 characters, and the list is capped so the fixed prose
     * behind it can never be pushed off. A failed listing degrades to
     * naming only the current caller — the page still goes out.
     */
    const listed = await listKeys(env.COUNTERS, {
      prefix: KV_KEYS.adminFailIpPrefix,
      cap: 8,
    }).catch(() => ({
      names: [KV_KEYS.adminFailByIp(ip)],
      truncated: false,
    }));
    const addresses = listed.names.map((name) =>
      name.slice(KV_KEYS.adminFailIpPrefix.length),
    );
    const roster =
      addresses.join(", ") + (listed.truncated ? ", and more" : "");
    await sendAlert(env, {
      condition: "worker_health",
      detail: `${count} failed /admin logins in the last ${ADMIN_FAIL_WINDOW_SECONDS / 60} minutes, from ${addresses.length === 1 ? "ONE address" : `${addresses.length} addresses`}: ${roster} — most recent ${ip}, now being made to wait between tries. One address is one guesser; several is a spray. (An address falls off the books ${ADMIN_THROTTLE_MAX_SECONDS / 60} minutes after its last failure — this names what the moment still held.) Still not a lockout — the throttle is PER ADDRESS, so a guesser slows only themselves and can never bar you from your own store. If this was not you: rotating ADMIN_PASSWORD is only worth doing if it is short, guessable, or used anywhere else, because a run of FAILURES is evidence nobody got in. What the throttle cannot slow is an attacker with many addresses, and the only defence against that is a long password.`,
      key: "admin-auth-bruteforce",
    }).catch(() => undefined);
  }
}

const adminGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ip = callerIp(c);
  /*
   * THE WAIT COMES BEFORE THE COMPARE. Checking the password first and
   * then deciding whether to answer would still let a guesser learn
   * one bit per request at full speed; the point is to make the
   * REQUEST cost something, not the answer.
   */
  const fails = Number(
    (await c.env.COUNTERS.get(KV_KEYS.adminFailByIp(ip))) ?? "0",
  );
  const wait = throttleSeconds(fails);
  if (wait > 0) {
    return c.json(
      {
        error: `Too many failed logins from this address. Try again in ${wait} seconds — or from any other connection, right now. This is a per-address pause, not a lockout: it slows whoever is guessing, and a stranger can never use it to bar the keeper from his own store.`,
      },
      429,
      { "Retry-After": String(wait) },
    );
  }

  const gate = basicAuth({
    username: "keeper",
    password: c.env.ADMIN_PASSWORD,
  });
  try {
    const result = await gate(c, next);
    // A clean pass clears both counters: the alarm is for RUNS of
    // failure, not a single mistyped character on the way in, and the
    // keeper who finally types it right should not still be waiting.
    await Promise.all([
      c.env.COUNTERS.delete("admin_auth_fails").catch(() => undefined),
      c.env.COUNTERS.delete(KV_KEYS.adminFailByIp(ip)).catch(() => undefined),
    ]);
    return result;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      await noteAdminAuthFailure(c.env, ip).catch(() => undefined);
    }
    throw error;
  }
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
    confessions,
    trainTags,
    refunds,
    closers,
    drawerStock,
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
    listConfessions(c.env),
    listTags(c.env),
    listRefunds(c.env),
    listClosers(c.env, 20),
    listStock(c.env, "the_drawer"),
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
  // The Gazette press left the counter with the 2026-08-05
  // retirement; the freshness check went with it.
  return c.html(
    renderCounterPage({
      notice: stockNotice(c.req.query("stocked"), c.req.query("shelf")),
      orders: listedOrders,
      closers: shelf(closers, [], "closers", notes),
      stockShelves: {
        the_drawer: shelf(drawerStock, [], "drawer stock", notes),
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
    monthReclass,
    take,
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
    import("@/services/reclassify").then(({ monthReclassAdjustments }) =>
      monthReclassAdjustments(c.env),
    ),
    import("@/services/books-summary").then(({ takeSummary }) =>
      takeSummary(c.env),
    ),
    /**
     * The rail split snapshot, refreshed here as well as on the cron.
     * The desk is already paying for the certificate walk to build the
     * take; this writes what it learned into the one key the front of
     * the store reads, so the keeper opening his own office is enough
     * to bring the shopfront's Base/Solana split current instead of
     * waiting out the hour. Never blocks the desk: a failure here
     * leaves the last snapshot standing.
     */
    import("@/services/rails").then(({ refreshRailSplit }) =>
      refreshRailSplit(c.env).catch(() => null),
    ),
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
      take: shelf(take, null, "the take", notes),
      monthReclass: (() => {
        const adjustments = shelf(monthReclass, null, "reclass ledger", notes);
        const current = adjustments?.months[metricsMonth()];
        if (adjustments?.truncated) {
          notes.push(
            "the reclassification cert scan hit its cap; the month adjustment may be partial",
          );
        }
        return current ?? null;
      })(),
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

/**
 * THE BOOKS CHECK: every money audit on one page, verdicts first —
 * settle recount, both chain rails, deliveries, the alarm trail.
 */
adminRoutes.get("/admin/reconciliation", async (c) => {
  const notes: string[] = [];
  const { renderReconciliationPage } = await import(
    "@/pages/admin/reconciliation-page"
  );
  const {
    SOLANA_RECONCILE_OK_KEY,
    SOLANA_RECONCILE_LAST_RESULT_KEY,
    readSkippedRanges,
  } = await import("@/services/chain-reconciliation");
  const { auditDeliveries } = await import("@/services/delivery-audit");
  const [
    settles,
    baseCursor,
    baseSkipped,
    solanaLastOk,
    solanaLastResult,
    deliveries,
    alerts,
    lastRead,
  ] = await Promise.allSettled([
    reconcileSettles(c.env),
    c.env.COUNTERS.get(KV_KEYS.reconcileCursor),
    readSkippedRanges(c.env),
    c.env.COUNTERS.get(SOLANA_RECONCILE_OK_KEY),
    c.env.COUNTERS.get<{
      ran: boolean;
      reason?: string;
      transfers_seen?: number;
      at: string;
    }>(SOLANA_RECONCILE_LAST_RESULT_KEY, "json"),
    auditDeliveries(c.env),
    listAlerts(c.env, 10),
    c.env.COUNTERS.get(KV_KEYS.alarmsLastRead),
  ]);

  /*
   * THE WATERMARK. The keeper's complaint, verbatim: "how do i know if
   * its something ive seen or not without having to like eyeball it
   * thats too much work for me."
   *
   * A row is NEW when it FIRST fired after his last visit. First-fired
   * and not last-raised, deliberately: a standing problem he has
   * already read about is not news again every six hours — that is the
   * re-dating bug in a different costume.
   *
   * The mark advances on load, below, and only after a successful
   * read. If the watermark read failed we would rather mark nothing
   * than mark everything, so a KV blip cannot manufacture a flood.
   */
  const alarmsLastRead = shelf(lastRead, null, "alarm watermark", notes);
  const markedAt = new Date().toISOString();
  if (alerts.status === "fulfilled" && lastRead.status === "fulfilled") {
    /*
     * Written before the render rather than after: this handler has no
     * post-response hook, and a mark that only lands on a fully
     * rendered page would silently stop moving the first time some
     * other section threw. Worst case here is a page he loaded and did
     * not read, which is the same thing every unread-marker in the
     * world gets wrong, and it is recoverable by looking again.
     */
    await c.env.COUNTERS.put(KV_KEYS.alarmsLastRead, markedAt);
  }

  return c.html(
    renderReconciliationPage(
      {
        settles: shelf(settles, null, "settle recount", notes),
        chain: {
          baseCursor: shelf(baseCursor, null, "base cursor", notes),
          // Null when the read failed — the page then says coverage
          // cannot be stated, rather than passing on a missing record.
          baseSkipped: shelf(baseSkipped, null, "base skipped ranges", notes),
          solanaLastOk: shelf(solanaLastOk, null, "solana last pass", notes),
          solanaLastResult: shelf(
            solanaLastResult,
            null,
            "solana last result",
            notes,
          ),
        },
        deliveries: (() => {
          const audit = shelf(deliveries, null, "delivery audit", notes);
          if (!audit) return null;
          // Name the house wallets in place, so an undelivered row
          // says whose money it was and which resolution is honest.
          const housePayers: Record<string, boolean> = {};
          for (const sale of audit.undelivered) {
            if (sale.payer) {
              housePayers[sale.payer] = isHouseWallet(c.env, sale.payer);
            }
          }
          return { ...audit, house_payers: housePayers };
        })(),
        alertsLastRead: alarmsLastRead,
        alerts: await Promise.all(
          shelf(alerts, [], "alarm trail", notes)
            /*
             * ISO-8601 UTC strings sort the same way the instants do,
             * which is the entire reason the store writes dates this
             * way; no parsing, no timezone, no clock skew to argue with.
             */
            .map((alert) => ({
              ...alert,
              is_new: alarmsLastRead !== null && alert.at > alarmsLastRead,
            }))
            .map(async (alert) => {
            if (alert.condition !== "undelivered_sale") return alert;
            // The alert names its settlement tx; check what the
            // intent looks like NOW so history reads as history.
            // Two wordings name a tx: the delivery audit's
            // "Settlement: <tx>." and the chain walk's "in
            // transaction <tx> (block …)". The second went unmatched
            // until 2026-08-07, so chain orphans sat in the trail
            // with no stamp and no lever — $52.09 of the keeper's
            // own money read as two open mysteries for two days.
            const settlementTx = /Settlement: (\S+)\./.exec(alert.detail)?.[1];
            const chainTx = settlementTx
              ? undefined
              : /in transaction (\S+) /.exec(alert.detail)?.[1];
            const tx = settlementTx ?? chainTx;
            if (!tx) return alert;
            const [open, resolved] = await Promise.all([
              c.env.ORDERS.get(KV_KEYS.deliveryIntent(tx)),
              c.env.ORDERS.get(`delivery_resolved:${tx}`),
            ]);
            /*
             * WHICH RESOLUTION, not just THAT it was resolved.
             *
             * The stamp used to read "[RESOLVED BY HAND]" for all three
             * outcomes, so the page could not tell the keeper whether a
             * row had been refunded, fulfilled or absorbed. On
             * 2026-08-10 he read that stamp as the choice he had made
             * and was unsure afterwards which he had actually clicked —
             * the page was the reason he could not check. "Refunded"
             * and "fulfilled by hand" are opposite claims about where
             * the money went; a surface that collapses them is not a
             * record of the resolution, only of its existence.
             */
            const resolvedAs = ((): string | undefined => {
              if (!resolved) return undefined;
              try {
                const parsed: unknown = JSON.parse(resolved);
                const outcome = (parsed as { outcome?: unknown }).outcome;
                const corrected = (parsed as { corrected?: unknown }).corrected;
                if (typeof outcome !== "string") return undefined;
                return corrected === true ? `${outcome} (corrected)` : outcome;
              } catch {
                return undefined;
              }
            })();
            return {
              ...alert,
              tx,
              ...(resolvedAs ? { resolved_as: resolvedAs } : {}),
              // A chain orphan has no intent row to clear — the walk
              // found the money, not the buy flow — so for it the
              // resolution record is the only closer; absent one it
              // is still open, never "closed (delivered)".
              now: open
                ? ("still open" as const)
                : resolved
                  ? ("resolved by hand" as const)
                  : chainTx
                    ? ("still open" as const)
                    : ("closed (delivered)" as const),
            };
          }),
        ),
        loadNotes: notes,
      },
      new Date(),
    ),
  );
});

/** KEEPER'S FILES: downloadable records, nothing that changes the store. */
adminRoutes.get("/admin/files", async (c) => {
  const { renderFilesPage } = await import("@/pages/admin/files-page");
  return c.html(renderFilesPage());
});

/** THE TEST DRAWER: prove-the-machinery levers, off the daily shelf. */
adminRoutes.get("/admin/testing", async (c) => {
  const { renderTestingPage } = await import("@/pages/admin/testing-page");
  // The reset lever's condition line travels with the lever.
  let inventory: Record<string, number> | null = null;
  try {
    const keys = await listKeys(c.env.COUNTERS, {
      prefix: "inventory:",
      cap: 200,
    });
    inventory = {};
    const counts = await bulkGetText(c.env.COUNTERS, keys.names);
    for (const name of keys.names) {
      const item = name.split(":")[1] ?? name;
      const sold = Number.parseInt(counts.get(name) ?? "0", 10);
      if (Number.isFinite(sold) && sold > 0) {
        inventory[item] = sold;
      }
    }
  } catch {
    inventory = null;
  }
  return c.html(renderTestingPage({ inventory }));
});

// Old bookmark; the books merged into the desk.
adminRoutes.get("/admin/books", (c) => c.redirect("/admin"));

/**
 * The ward round's readout, and a hand-crank for it: the Sunday cron
 * runs it on schedule, and the lever exists for the week the keeper
 * wants a fresh reading now (or the first reading, before any Sunday
 * has come).
 */
adminRoutes.get("/admin/ward", async (c) => {
  const { latestWardRound, previousWardRound, wardDelta } = await import(
    "@/services/ward-round"
  );
  const { renderWardPage } = await import("@/pages/admin/ward-page");
  const round = await latestWardRound(c.env);
  const previous = await previousWardRound(c.env);
  return c.html(
    renderWardPage(round, previous, round ? wardDelta(round, previous) : null),
  );
});

/**
 * The house-reclassification lever: family money that booked organic
 * before its wallet was listed. Refuses unlisted wallets, freezes the
 * snapshot, publishes through /stats and /corrections. Curl-able:
 *   curl -u keeper:PASS -X POST .../admin/reclassify -d address=0x...
 */
adminRoutes.post("/admin/reclassify", async (c) => {
  const form = await c.req.parseBody();
  const address = typeof form["address"] === "string" ? form["address"] : "";
  const reason =
    typeof form["reason"] === "string"
      ? form["reason"]
      : "cross-model UX walker wallet; settles booked organic before listing";
  const { reclassifyHousePayer } = await import("@/services/reclassify");
  const settlesRaw = typeof form["settles"] === "string" ? form["settles"] : "";
  const settles = settlesRaw ? parseInt(settlesRaw, 10) : undefined;
  const result = await reclassifyHousePayer(c.env, address, reason, settles);
  if (!result.ok) {
    return c.text(result.refusal, 400);
  }
  return c.json({
    reclassified: result.record,
    note: "Frozen snapshot; organic count corrects at next /stats read. The register (house-wallets.json) plus this ledger plus /corrections is the whole story.",
  });
});

/**
 * The delivery-audit resolution lever: tell the audit a caught sale
 * was handled by hand, so it stops paging about it. A record, not an
 * erasure — the intent becomes a resolution row naming the outcome.
 *
 *   curl -u keeper -X POST .../admin/delivery/resolve \
 *     -d "transaction=<settlement tx from the alert>" \
 *     -d "outcome=fulfilled_by_hand|refunded|house_absorbed"
 */
adminRoutes.post("/admin/delivery/resolve", async (c) => {
  const form = await c.req.parseBody();
  const transaction = typeof form["transaction"] === "string" ? form["transaction"] : "";
  const outcomeRaw = typeof form["outcome"] === "string" ? form["outcome"] : "";
  const outcomes = ["fulfilled_by_hand", "refunded", "house_absorbed"] as const;
  const outcome = outcomes.find((entry) => entry === outcomeRaw);
  if (!outcome) {
    return c.json(
      { refused: `outcome must be one of: ${outcomes.join(", ")}` },
      400,
    );
  }
  const { resolveDeliveryIntent } = await import("@/services/delivery-audit");
  const result = await resolveDeliveryIntent(c.env, transaction, outcome);
  if (!result.ok) {
    return c.json({ refused: result.refusal }, 404);
  }
  return c.json({
    resolved: { transaction, outcome },
    note: "The intent row is now a resolution row; the audit stops paging about this sale. The record keeps the original intent inside it.",
  });
});

/**
 * THE PAYER-CASE REPAIR: one button, fixes payer rows whose base58
 * address a legacy .toLowerCase() corrupted, using the certificates
 * as the source of true case. Idempotent — safe to press twice.
 */
adminRoutes.post("/admin/repair/payer-case", async (c) => {
  const { repairPayerCase } = await import("@/services/payer-repair");
  const result = await repairPayerCase(c.env);
  return c.json(result);
});

/**
 * THE TAX DRAWER: the whole money ledger as one CSV — sale rows off
 * the certificates, refund rows as their own offsetting events,
 * house purchases flagged and never omitted. Penny-page settles mint
 * no certs and are NOT in this file; the chain record is that gap's
 * backstop, and the link that reaches this route says so out loud.
 */
adminRoutes.get("/admin/export/tax.csv", async (c) => {
  const { taxRows, taxCsv } = await import("@/services/tax-export");
  const { rows, truncated } = await taxRows(c.env);
  return c.body(taxCsv(rows), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="scvd-tax-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    // A truncated export must not look total.
    ...(truncated ? { "X-Export-Truncated": "cert scan hit its cap" } : {}),
  });
});

adminRoutes.post("/admin/ward/run", async (c) => {
  const { runWardRound } = await import("@/services/ward-round");
  await runWardRound(c.env);
  return c.redirect("/admin/ward");
});

/**
 * The back shelf. Every reading is optional and independent: the levers
 * are what you reach for when something is wrong, so a failed read must
 * never take the page down — and must never render as a confident
 * default either. "Unknown" and "open" cannot look alike on a page
 * about whether the store is taking money.
 */
adminRoutes.get("/admin/tools", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const settled = await Promise.allSettled([
    shutterState(c.env),
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
  const inventoryKeys = value<{ names: string[] }>(3);
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
      patronageNote: value<string>(1),
      inventory,
      month,
      today,
      almanacPages:
        settled[4]?.status === "fulfilled"
          ? (value<{ slug: string; title: string; date: string }[]>(4) ?? [])
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

/**
 * THE COMMISSION DESK'S TWO LEVERS — both the keeper's hand and only
 * the keeper's hand (rule 30: no agent prices anything). The quote's
 * legality (on the ladder, sane window) is the SERVICE's law, not this
 * form's; a refusal comes back with the reason rather than a redirect,
 * because a lever that silently did nothing is the counter's oldest bug.
 */
adminRoutes.post("/admin/commission/:id/quote", async (c) => {
  const form = await c.req.parseBody();
  const terms: Parameters<typeof quoteCommission>[2] = {
    usdc: Number.parseFloat(String(form["usdc"] ?? "")),
    windowHours: Number.parseFloat(String(form["window_hours"] ?? "")),
  };
  const note = sanitizeText(form["note"], 600);
  if (note) {
    terms.note = note;
  }
  const result = await quoteCommission(c.env, c.req.param("id"), terms);
  if ("refused" in result) {
    return c.text(result.refused, 409);
  }
  return c.redirect("/admin/counter");
});

adminRoutes.post("/admin/commission/:id/decline", async (c) => {
  const form = await c.req.parseBody();
  const result = await declineCommission(
    c.env,
    c.req.param("id"),
    form["reply"],
  );
  if ("refused" in result) {
    return c.text(result.refused, 409);
  }
  return c.redirect("/admin/counter");
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
  /**
   * ONE FLOW (keeper's ask, 2026-08-05): he writes three things —
   * date, title, the page — and the almanac dressing (# heading,
   * the italic line, the dated Oak City line) is assembled here so
   * the form never shows him boilerplate to edit around. A raw
   * `markdown` field is still honoured for anything scripted.
   */
  const rawMarkdown = String(form["markdown"] ?? "").trim();
  const body = String(form["body"] ?? "").trim();
  const title = String(form["title"] ?? "").trim();
  const date = String(form["date"] ?? "").trim();
  const assembled =
    rawMarkdown ||
    (body
      ? `# ${title}\n\n*From the Keeper's Almanac.*\n\n**${date || new Date().toISOString().slice(0, 10)}, Oak City.**\n\n${body}`
      : "");
  const result = await saveAlmanacEntry(c.env, {
    title,
    date,
    teaser: String(form["teaser"] ?? ""),
    markdown: assembled,
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
