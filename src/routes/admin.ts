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
  listRecentBountyEvents,
  listRecentPricedEvents,
  listEventsForItem,
  listRecentPorchEvents,
  readBountyLedger,
  readMonthLedger,
  readPorchLedger,
  emptyMonthLedger,
  metricsMonth,
  reconcileSettles,
} from "@/lib/metrics";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { renderTakePage } from "@/pages/admin/take-page";
import { recountFromRows } from "@/lib/recount";
import { computeStats } from "@/services/stats";
import { renderAdminShell } from "@/pages/admin/layout";
import { wantsHtml } from "@/pages/simple-page";
import { renderBellPage } from "@/pages/admin/bell-page";
import { renderCensusPage } from "@/pages/admin/census-page";
import { renderBuyersPage } from "@/pages/admin/buyers-page";
import { renderInstrumentsPage } from "@/pages/admin/instruments-page";
import { renderReferralsPage } from "@/pages/admin/referrals-page";
import { renderDeclinesPage } from "@/pages/admin/declines-page";
import { renderRecountPage } from "@/pages/admin/recount-page";
import { renderCounterPage } from "@/pages/admin/counter-page";
import { renderOfficePage } from "@/pages/admin/office-page";
import { reRegistration } from "@/services/visibility";
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
  letterNeedsReply,
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
import { kvGet, kvPut } from "@/lib/kv-retry";
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
  const ipFails = Number((await kvGet(env.COUNTERS, ipKey)) ?? "0") + 1;
  await kvPut(env.COUNTERS, ipKey, String(ipFails), {
    expirationTtl: ADMIN_THROTTLE_MAX_SECONDS,
  });

  const key = "admin_auth_fails";
  const count = Number((await kvGet(env.COUNTERS, key)) ?? "0") + 1;
  await kvPut(env.COUNTERS, key, String(count), {
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
    (await kvGet(c.env.COUNTERS, KV_KEYS.adminFailByIp(ip))) ?? "0",
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

/**
 * THE SIGNING DESK — POST /admin/wba/sign (2026-09-04).
 *
 * WBA_SIGNING_KEY is a Worker secret and Worker secrets are write-only,
 * so the walkabout runner (a Node process on the keeper's machine) had
 * two ways to sign its egress: hold a copy of the seed, or not sign.
 * A copy means the paper leaves the drawer. This is the third way: the
 * runner sends the URL it is about to call and the Worker returns the
 * Web Bot Auth triplet, minted by the SAME code path that signs the
 * store's own probes. The seed never leaves Cloudflare.
 *
 * WHAT THE ORACLE CAN AND CANNOT SIGN. The caller supplies only a
 * target URL. created, expires, nonce and the tag are minted here, and
 * the covered components are the architecture draft's minimum —
 * ("@authority" "signature-agent") — so a signature from this desk
 * asserts exactly one thing: "a request to authority X, in the next
 * five minutes, came from the key behind scvd.store". Not a path, not
 * a body, not a method. Someone holding the admin password could get
 * requests signed as us; that person already holds the counter, the
 * refunds and the outreach desk, so this widens nothing that matters.
 * It is still a door, so it is named as one in WALKABOUT.md.
 *
 * JSON ONLY. A form body is refused outright rather than CSRF-guarded:
 * no page posts here, so the same-origin dance the payout form needs
 * is one more thing that could be got wrong for no caller that exists.
 */
const SIGNS_PER_MINUTE = 60;
let signMinute = "";
let signsThisMinute = 0;

adminRoutes.post("/admin/wba/sign", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return c.json(
      { error: "The signing desk takes JSON only: {\"url\": \"https://…\"}.", code: "json_only" },
      415,
    );
  }
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== signMinute) {
    signMinute = minute;
    signsThisMinute = 0;
  }
  if (signsThisMinute >= SIGNS_PER_MINUTE) {
    return c.json(
      { error: `The signing desk signs at most ${SIGNS_PER_MINUTE} requests a minute; a walk paces slower than that by rule 4.`, code: "rate_limited" },
      429,
      { "Retry-After": "60" },
    );
  }
  let body: { url?: unknown };
  try {
    body = (await c.req.json()) as { url?: unknown };
  } catch {
    return c.json({ error: "Body is not JSON.", code: "bad_json" }, 400);
  }
  let target: URL;
  try {
    target = new URL(String(body.url ?? ""));
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("scheme");
  } catch {
    return c.json(
      { error: "url must be an absolute http(s) URL — the authority is the only part that gets signed.", code: "bad_url" },
      400,
    );
  }
  const { webBotAuthHeaders } = await import("@/lib/web-bot-auth");
  const headers = await webBotAuthHeaders(c.env, target.toString());
  if (!headers["Signature-Input"]) {
    // Same honesty as the directory's 404: "not turned on" is a
    // different statement from "signed with nothing".
    return c.json(
      { error: "No egress key is configured, so nothing here can sign. The runner should walk unsigned.", code: "no_egress_key" },
      404,
    );
  }
  signsThisMinute += 1;
  c.header("Cache-Control", "no-store");
  return c.json({
    authority: target.host,
    headers: {
      "Signature-Agent": headers["Signature-Agent"],
      "Signature-Input": headers["Signature-Input"],
      Signature: headers.Signature,
    },
    signed_by: "the store's Web Bot Auth egress key, from the Worker; the seed did not travel",
    verify_at: `${new URL(c.env.STORE_BASE_URL).origin}/.well-known/http-message-signatures-directory`,
  });
});

/**
 * THE TRADE COUNTER'S STATEMENT DESK (2026-09-03). Two doors behind
 * the keeper's password: every account's rows, both sides, for
 * reconciling against the partner's payouts by hand; and the one
 * write only a person makes — recording that a payout arrived.
 * Nothing here moves money; it records that money moved elsewhere.
 */
adminRoutes.get("/admin/trade", async (c) => {
  const { TRADE_PARTNERS } = await import("@/store/trade-counter");
  const { tradeStatement } = await import("@/services/trade-counter");
  const { renderTradePage } = await import("@/pages/admin/trade-page");
  const statements = await Promise.all(
    TRADE_PARTNERS.map((partner) => tradeStatement(c.env, partner)),
  );
  c.header("Cache-Control", "no-store");
  return c.html(renderTradePage(statements));
});

adminRoutes.get("/admin/trade.json", async (c) => {
  const { TRADE_PARTNERS } = await import("@/store/trade-counter");
  const { tradeStatement } = await import("@/services/trade-counter");
  const statements = await Promise.all(
    TRADE_PARTNERS.map((partner) => tradeStatement(c.env, partner)),
  );
  c.header("Cache-Control", "no-store");
  return c.json({
    what_this_is:
      "Every trade account's statement: delivery rows and payout rows, newest first, with the summary the public ledger prints. Reconcile against the partner's own statement; record each payout with POST /admin/trade/{account}/payout.",
    statements,
  });
});

adminRoutes.post("/admin/trade/:partner/payout", async (c) => {
  const { getTradePartner } = await import("@/store/trade-counter");
  const { recordTradePayout } = await import("@/services/trade-counter");
  const partner = getTradePartner(c.req.param("partner"));
  if (!partner) {
    return c.json({ error: "No trade account by that name." }, 404);
  }
  // JSON from a script, a form from the page: same two fields either way.
  const contentType = c.req.header("content-type") ?? "";
  const fromForm = contentType.includes("application/x-www-form-urlencoded");
  /*
   * THE FORM IS SAME-ORIGIN OR IT IS NOTHING (pass six, tightening).
   * Basic Auth is the office's lock, and a browser that has cached it
   * will present it on a form POST from ANY origin — which is exactly
   * how a page elsewhere could record a payout it did not make,
   * lowering the outstanding counter and reopening credit. A script
   * sending JSON never carries a browser's cached credentials to a
   * page it did not load, so the guard applies to the form only:
   * Sec-Fetch-Site (every current browser sends it) must be
   * same-origin or none, or failing that the Origin must be ours.
   */
  if (fromForm) {
    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    const ours = new URL(c.env.STORE_BASE_URL).origin;
    // A browser always sends Sec-Fetch-Site; a curl or a script sends
    // neither header and carries no cached credentials to another
    // page's form, so silence on both is not a browser and passes.
    const crossSite =
      (site !== undefined && site !== "same-origin" && site !== "none") ||
      (site === undefined && origin !== undefined && origin !== ours);
    if (crossSite) {
      return c.json(
        { error: "The payout form is only accepted from the store's own admin page.", code: "cross_site_refused" },
        403,
      );
    }
  }
  const body: unknown = fromForm
    ? Object.fromEntries((await c.req.formData()).entries())
    : await c.req.json().catch(() => null);
  const amount =
    body && typeof body === "object" && "amount_usd" in body
      ? Number((body as { amount_usd: unknown }).amount_usd)
      : NaN;
  const reference =
    body && typeof body === "object" && "reference" in body
      ? String((body as { reference: unknown }).reference).slice(0, 200)
      : "";
  if (!Number.isFinite(amount) || amount <= 0 || reference.length === 0) {
    return c.json(
      {
        error:
          "A payout needs a positive amount_usd and a reference (the partner's statement id, a Lightning payment hash, a bank line — whatever ties it to their side).",
      },
      400,
    );
  }
  const row = await recordTradePayout(c.env, partner, amount, reference);
  c.header("Cache-Control", "no-store");
  if (fromForm) {
    return c.redirect("/admin/trade", 303);
  }
  return c.json({ recorded: true, payout: row });
});

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
 * A read the desk will not wait long for. The desk deliberately pays
 * for no chain walk on open (2026-08-28); the wallet balance is one
 * eth_call, but one call through a ladder of providers that are all
 * down is many seconds, and the desk must open anyway. Past the
 * deadline the shelf reads "not read here" and the bounty board page
 * takes the full wait.
 */
function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} took longer than ${ms}ms`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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

/**
 * GET /admin/glance — the phone view, and one KV read.
 *
 * The keeper's ask was three words: fast, scannable, works on a
 * phone. The desk fails all three for one structural reason —
 * seventeen loads before a number appears, three of them heavy walks
 * over every month the store has been open. That restructure is its
 * own pass. This is the door he opens when the question is only
 * "does anything need me", answered from the hourly blob in
 * services/glance.ts.
 *
 * IT STATES ITS OWN AGE, always. A cached number that presents as
 * live would have him deciding on figures of unknown vintage, which
 * is the failure this whole store exists to argue against — and an
 * unwritten blob renders as "not computed yet" rather than as five
 * zeros, because a zero is a claim ("I looked; there were none") and
 * nothing has looked. Same rule as the shelf: say what you saw and
 * when, or say you have not seen.
 */
/**
 * GET /admin/take — the money walks, where they cost what they cost.
 *
 * computeStats scans every month's metric keys; takeSummary walks
 * every certificate. Both are honest work and neither is fast, and
 * until today they ran on /admin — gating the first section of the
 * page, so opening the office to see whether anything needed the
 * keeper meant waiting for the full books first.
 *
 * They are the same numbers, computed the same way. The only change
 * is that a reader now asks for them, rather than paying for them on
 * the way to something else.
 */
adminRoutes.get("/admin/take", async (c) => {
  const notes: string[] = [];
  const [take, allTimeStats] = await Promise.allSettled([
    import("@/services/books-summary").then(({ takeSummary }) =>
      takeSummary(c.env),
    ),
    // Diagnosed, not summarised: the same walk, keeping the per-item
    // till counters the take reconciles against below.
    import("@/services/stats").then(({ computeStatsDiagnosed }) =>
      computeStatsDiagnosed(c.env),
    ),
    /**
     * The rail split rides the certificate walk again, which is where
     * it always belonged: this page is the one paying for that walk
     * now, so opening it still brings the shopfront's Base/Solana
     * split current instead of waiting out the hour. Never blocks —
     * a failure leaves the last snapshot standing.
     */
  ]);
  const books = shelf(allTimeStats, null, "all-time stats", notes);
  const body = renderTakePage({
    take: shelf(take, null, "the take", notes),
    allTime: books
      ? {
          organic: books.stats.organic_settlements,
          house: books.stats.house_settlements,
        }
      : null,
    till: books?.till_by_item ?? null,
    loadNotes: notes,
  });
  return c.html(body);
});

adminRoutes.get("/admin/glance", async (c) => {
  const { readGlance } = await import("@/services/glance");
  const glance = await readGlance(c.env);
  const shell = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The glance \u00B7 SCVD</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 1.25rem; max-width: 32rem; }
  h1 { font-size: 1.1rem; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 1rem; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  li { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
       padding: .75rem .9rem; border: 1px solid currentColor; border-radius: .5rem; }
  .n { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .when { margin-top: 1rem; font-size: .85rem; opacity: .75; }
  a { color: inherit; }
</style></head><body>${body}
<p class="when"><a href="/admin">The whole desk</a></p>
</body></html>`;
  if (!glance) {
    return c.html(
      shell(
        `<h1>The glance</h1><p>These numbers have <strong>not been computed</strong> yet \u2014 the hourly round has not written them since this worker last deployed. Nothing here is zero; nothing here has been counted. <a href="/admin">The desk</a> computes everything live.</p>`,
      ),
      200,
    );
  }
  const rows: Array<[string, string]> = [
    ["Orders waiting", String(glance.pending_orders)],
    ["Needs your review", String(glance.pending_reviews)],
    ["Open alarms", String(glance.open_alerts)],
    ["Sales this month", String(glance.organic_settlements)],
    ["Take this month", `$${glance.take_usdc.toFixed(2)}`],
  ];
  return c.html(
    shell(
      `<h1>The glance</h1><ol>${rows
        .map(
          ([label, value]) =>
            `<li><span>${escapeHtml(label)}</span><span class="n">${escapeHtml(value)}</span></li>`,
        )
        .join("")}</ol>
      <p class="when">Read ${escapeHtml(glance.computed_at)}, on the hourly round.${
        glance.truncated
          ? " One of the source walks hit its cap, so the money figures are a floor rather than a total."
          : ""
      }</p>`,
    ),
    200,
  );
});

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
    alarmsSeen,
  ] = await Promise.allSettled([
    listOrders(c.env),
    listWaitlist(c.env),
    listCommissions(c.env),
    listFailedItems(c.env),
    listGuestbook(c.env, 30),
    kvGet(c.env.COUNTERS, KV_KEYS.weekNote),
    listTips(c.env),
    listLetters(c.env),
    listAlerts(c.env, 5),
    listConfessions(c.env),
    listTags(c.env),
    listRefunds(c.env),
    listClosers(c.env, 20),
    listStock(c.env, "the_drawer"),
    listGrudges(c.env, 30),
    kvGet(c.env.COUNTERS, KV_KEYS.alarmsSeenAtCounter),
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
  /*
   * THE ALARM WATERMARK, on the same rule as the orders above: standing
   * at the counter IS seeing what the counter is showing (keeper's
   * order 2026-07-24 — "the button was ceremony"), so the top line
   * stops shouting about alarms he has already met while the alarms
   * themselves stay listed below, and on the reconciliation trail with
   * what came of each one.
   *
   * Marked only when BOTH reads landed: on a KV blip we would rather
   * shout twice than mark an alarm seen that never rendered.
   */
  const alarmsSeenAt = shelf(alarmsSeen, null, "alarm watermark", notes);
  const listedAlerts = shelf(alerts, [], "alerts", notes);
  if (alerts.status === "fulfilled" && alarmsSeen.status === "fulfilled") {
    await kvPut(c.env.COUNTERS, KV_KEYS.alarmsSeenAtCounter, seenAt).catch(
      () => undefined,
    );
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
      alerts: listedAlerts,
      alertsSeenAt: alarmsSeenAt,
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
    monthReclass,
    glance,
    mcpClients,
    fieldWallet,
    bountyState,
    // Order matters: these two must sit in the same order as the
    // promises below — the ward round first, then the counter's
    // alarm watermark.
    wardLatest,
    officeAlarmsSeenRead,
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
    import("@/services/reclassify").then(({ monthReclassAdjustments }) =>
      monthReclassAdjustments(c.env),
    ),
    /*
     * The take arrives from the hourly glance — one read — rather
     * than from a fresh certificate walk on every open. The
     * 2026-08-05 ruling that the desk leads with the all-time take
     * stands; only the cost of satisfying it moved to the cron.
     *
     * ensureGlance rather than readGlance, because an empty cache
     * lasts an hour after each deploy and that is exactly when the
     * keeper opens the desk. Cold: compute once, store, show it.
     * Warm: one read. Either way, never a walk per open.
     */
    import("@/services/glance").then(({ ensureGlance }) =>
      ensureGlance(c.env),
    ),
    // One key. The census the MCP door started keeping 2026-08-29.
    import("@/services/mcp-clients").then(({ readMcpClients }) =>
      readMcpClients(c.env),
    ),
    /*
     * MONEY OUT (2026-09-04): the paying wallet's balance, one
     * eth_call on a three-second leash so a provider outage cannot
     * hold the desk shut, and the bounty board's own state (KV only).
     */
    withDeadline(
      import("@/services/field-wallet").then(({ readFieldWallet }) =>
        readFieldWallet(c.env),
      ),
      3000,
      "the paying wallet read",
    ),
    import("@/services/bounty-board").then(({ bountyBoard }) =>
      bountyBoard(c.env),
    ),
    // One KV read: the latest Sunday round, for the visibility line.
    import("@/services/ward-round").then(({ latestWardRound }) =>
      latestWardRound(c.env),
    ),
    /*
     * The counter's alarm watermark, READ ONLY here. The strip points
     * at the counter, so it should say what is still waiting there —
     * but the office is not the counter, and looking at a pointer is
     * not meeting the alarm, so this page never moves the mark.
     */
    kvGet(c.env.COUNTERS, KV_KEYS.alarmsSeenAtCounter),
    /*
     * THE FOUR THAT LEFT, 2026-08-28, and where they went.
     *
     * computeStats scans the metric keys for every month the store has
     * been open; takeSummary walks every certificate; reconcileSettles
     * walks the chain. All three gated the FIRST section of the page,
     * so opening the office to see whether anything needed the keeper
     * cost three full walks before a single figure appeared. They live
     * at /admin/take now, opened when the question is actually money.
     *
     * reconcileSettles was the plainest waste: a whole chain walk so
     * this page could print one sentence above a link to
     * /admin/reconciliation, which does the real work anyway. The
     * hourly glance carries that verdict now.
     *
     * refreshRailSplit rode along because the desk "is already paying
     * for the certificate walk" — true then, false now, and the cron
     * refreshes the same snapshot on its own schedule, so nothing is
     * lost by letting it go.
     */
  ]);
  const emptyLedger = emptyMonthLedger();
  const officeAlarmsSeen = shelf(
    officeAlarmsSeenRead,
    null,
    "alarm watermark",
    notes,
  );
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
      /*
       * Null on purpose: these are the money walks, and they run at
       * /admin/take now. The page renders both as "not read here"
       * rather than as zero or as an alarm — see the books line.
       */
      reconciliation: null,
      take: shelf(glance, null, "the glance", notes)?.take ?? null,
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
      allTime: shelf(glance, null, "the glance", notes)?.all_time ?? null,
      takeReadAt: shelf(glance, null, "the glance", notes)?.computed_at ?? null,
      mcpClients: shelf(mcpClients, {}, "the mcp census", notes),
      moneyOut: (() => {
        const wallet = shelf(fieldWallet, null, "the paying wallet", notes);
        const board = shelf(bountyState, null, "the bounty board", notes);
        const nowSeconds = Math.floor(Date.now() / 1000);
        const outstandingUsd = board
          ? Math.round(
              board.bounties
                .filter(
                  (bounty) =>
                    bounty.status === "paid" &&
                    Number(bounty.claim?.authorization_valid_before ?? "0") >
                      nowSeconds,
                )
                .reduce((sum, bounty) => sum + bounty.reward_usd, 0) * 100,
            ) / 100
          : null;
        return {
          wallet,
          openBounties: board?.open_count ?? null,
          spentThisWeekUsd: board?.spent_this_week_usd ?? null,
          weeklyBudgetUsd: board?.weekly_budget_usd ?? null,
          outstandingUsd,
        };
      })(),
      visibility: (() => {
        const round = shelf(wardLatest, null, "the latest round", notes);
        const doors = round?.our_doors;
        if (!round || !doors) return null;
        const press = reRegistration(doors.missing);
        return {
          week: round.week,
          at: round.at,
          claimed: doors.claimed,
          found: doors.found.length,
          missing: doors.missing,
          could_not_check: doors.could_not_check,
          command: press.command,
          cost_usd: press.cost_usd,
        };
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
        // Answered is done, filed or not (2026-09-04), and an alarm
        // already met at the counter is not still waiting there.
        letters: shelf(letters, [], "letters", notes).filter((entry) =>
          letterNeedsReply(entry.record),
        ).length,
        reviews: pendingReviews,
        alerts: shelf(alerts, [], "alerts", notes).filter(
          (alert) => officeAlarmsSeen === null || alert.at > officeAlarmsSeen,
        ).length,
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
    POLYGON_RECONCILE_CURSOR_KEY,
    POLYGON_RECONCILE_LAST_RESULT_KEY,
    readSkippedRanges,
  } = await import("@/services/chain-reconciliation");
  const { auditDeliveries } = await import("@/services/delivery-audit");
  const [
    settles,
    baseCursor,
    baseSkipped,
    polygonCursor,
    polygonLastResult,
    solanaLastOk,
    solanaLastResult,
    deliveries,
    alerts,
    lastRead,
  ] = await Promise.allSettled([
    reconcileSettles(c.env),
    kvGet(c.env.COUNTERS, KV_KEYS.reconcileCursor),
    readSkippedRanges(c.env),
    kvGet(c.env.COUNTERS, POLYGON_RECONCILE_CURSOR_KEY),
    c.env.COUNTERS.get<{
      ran: boolean;
      reason?: string;
      failed?: boolean;
      at: string;
    }>(POLYGON_RECONCILE_LAST_RESULT_KEY, "json"),
    kvGet(c.env.COUNTERS, SOLANA_RECONCILE_OK_KEY),
    c.env.COUNTERS.get<{
      ran: boolean;
      reason?: string;
      transfers_seen?: number;
      at: string;
    }>(SOLANA_RECONCILE_LAST_RESULT_KEY, "json"),
    auditDeliveries(c.env),
    listAlerts(c.env, 10),
    kvGet(c.env.COUNTERS, KV_KEYS.alarmsLastRead),
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
  // The third witness (2026-09-04): the certificates, read beside the
  // counters and the payer rows so an unexplained settle gets a cause
  // and a wallet. Fail-soft — a shelf that does not load says so.
  const settlesValue = shelf(settles, null, "settle recount", notes);
  const { certificatesAgainstSettles } = await import("@/services/settle-sources");
  const certsValue = await certificatesAgainstSettles(c.env, settlesValue).catch(() => null);
  if (alerts.status === "fulfilled" && lastRead.status === "fulfilled") {
    /*
     * Written before the render rather than after: this handler has no
     * post-response hook, and a mark that only lands on a fully
     * rendered page would silently stop moving the first time some
     * other section threw. Worst case here is a page he loaded and did
     * not read, which is the same thing every unread-marker in the
     * world gets wrong, and it is recoverable by looking again.
     */
    await kvPut(c.env.COUNTERS, KV_KEYS.alarmsLastRead, markedAt);
  }

  return c.html(
    renderReconciliationPage(
      {
        settles: settlesValue,
        certs: certsValue,
        chain: {
          baseCursor: shelf(baseCursor, null, "base cursor", notes),
          // Null when the read failed — the page then says coverage
          // cannot be stated, rather than passing on a missing record.
          baseSkipped: shelf(baseSkipped, null, "base skipped ranges", notes),
          polygonCursor: shelf(polygonCursor, null, "polygon cursor", notes),
          polygonLastResult: shelf(
            polygonLastResult,
            null,
            "polygon last result",
            notes,
          ),
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
              kvGet(c.env.ORDERS, KV_KEYS.deliveryIntent(tx)),
              kvGet(c.env.ORDERS, `delivery_resolved:${tx}`),
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
  const { sourceRegister } = await import("@/services/source-liveness");
  const { readHeartbeat } = await import("@/services/ward-heartbeat");
  const round = await latestWardRound(c.env);
  const previous = await previousWardRound(c.env);
  /*
   * Both readings are OPTIONAL on this page: they are what the keeper
   * reaches for when something looks wrong, so a failed derive must
   * never take down the round's own numbers. Null renders as an absent
   * block, never as a confident all-clear — "unknown" and "healthy"
   * cannot be allowed to look alike on a page about whether the
   * instrument is running.
   */
  const [register, beat] = await Promise.all([
    sourceRegister(c.env).catch(() => null),
    readHeartbeat(c.env).catch(() => null),
  ]);
  return c.html(
    renderWardPage(
      round,
      previous,
      round ? wardDelta(round, previous) : null,
      register,
      beat,
    ),
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

/**
 * THE KEEPER POSTS BOUNTIES — the board's one write door besides the
 * claim itself (BOUNTY_BOARD.md: doors are house-picked, never
 * self-nominated, which is the whole anti-farming design). Form or
 * JSON body: url, reward_usd. The JSON reply is the opened bounty.
 */
adminRoutes.post("/admin/bounties", async (c) => {
  const { openBounty, BountyRefused } = await import(
    "@/services/bounty-board"
  );
  let url = "";
  let rewardUsd = Number.NaN;
  let note = "";
  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    url = String(body["url"] ?? "");
    rewardUsd = Number.parseFloat(String(body["reward_usd"] ?? ""));
    note = typeof body["note"] === "string" ? body["note"] : "";
  } else {
    const form = await c.req.parseBody();
    url = String(form["url"] ?? "");
    rewardUsd = Number.parseFloat(String(form["reward_usd"] ?? ""));
    note = typeof form["note"] === "string" ? form["note"] : "";
  }
  const wasForm = !contentType.includes("json");
  try {
    const bounty = await openBounty(c.env, {
      targetUrl: url,
      rewardUsd,
      ...(note ? { note } : {}),
    });
    if (wasForm) {
      // The stocking form's lesson: a redirect in silence reads
      // exactly like a form that did nothing. Say what got posted.
      return c.redirect(
        `/admin/market?bounty_posted=${encodeURIComponent(bounty.bounty_id)}`,
      );
    }
    return c.json({ opened: bounty, board: "/api/bounties" }, 201);
  } catch (error) {
    if (error instanceof BountyRefused) {
      if (wasForm) {
        return c.redirect(
          `/admin/market?bounty_refused=${encodeURIComponent(error.message.slice(0, 200))}`,
        );
      }
      return c.json({ error: error.message }, 400);
    }
    if (wasForm) {
      // An unreachable door throws a transport error rather than a
      // refusal; a form user gets it as words on the page, never a
      // bare 500 — the same shape lesson every other lever learned.
      return c.redirect(
        `/admin/market?bounty_refused=${encodeURIComponent(
          `could not reach that door to capture its terms (${String(error).slice(0, 120)})`,
        )}`,
      );
    }
    throw error;
  }
});

adminRoutes.post("/admin/ward/run", async (c) => {
  const { runWardRound } = await import("@/services/ward-round");
  await runWardRound(c.env);
  /**
   * The hand-run round MINTS too (2026-08-18; before this, a manual
   * run wrote KV and the corpus stayed silent until Sunday — walking
   * by hand produced no signed observation, which defeats the walk).
   * takeCorpusSnapshot is idempotent per week, so a hand-run in a week
   * the cron already minted is a quiet no-op, never a double entry.
   */
  const { takeCorpusSnapshot } = await import("@/services/corpus");
  await takeCorpusSnapshot(c.env).catch(() => undefined);
  return c.redirect("/admin/ward");
});

/**
 * THE SECOND WARD'S ROOM AND ITS CRANK (2026-09-04, the keeper's ask
 * for a way to run the MCP ward separately from the other).
 *
 * The crank advances ONE batch rather than running a whole pass: the
 * registry is 909 pages (90,845 rows on 2026-09-04), so a pass is
 * hundreds of page fetches and cannot fit in one request
 * without blowing the invocation budget. One press does exactly what
 * one hourly firing does, and the page says how far along the pass
 * is, so finishing one by hand is legible rather than mysterious.
 */
adminRoutes.get("/admin/mcp-ward", async (c) => {
  const { latestMcpPass, readMcpRegister, readMcpWalk } = await import(
    "@/services/mcp-ward"
  );
  const { renderMcpWardPage } = await import("@/pages/admin/mcp-ward-page");
  const [walk, register, pass] = await Promise.all([
    readMcpWalk(c.env),
    readMcpRegister(c.env),
    latestMcpPass(c.env),
  ]);
  return c.html(renderMcpWardPage(walk, register, pass));
});

adminRoutes.post("/admin/mcp-ward/run", async (c) => {
  const { walkMcpRegistry } = await import("@/services/mcp-ward");
  await walkMcpRegistry(c.env);
  return c.redirect("/admin/mcp-ward");
});

/**
 * Start a fresh pass. Blunt and safe: it drops the in-flight walk's
 * cursor and accumulated hosts and touches the REGISTER not at all,
 * so every host's first_seen and last_seen survive. A discarded
 * partial pass could never have recorded a delisting anyway, which is
 * why this needs no confirmation step.
 */
adminRoutes.post("/admin/mcp-ward/reset", async (c) => {
  const { KV_KEYS } = await import("@/lib/kv-keys");
  await c.env.COUNTERS.delete(KV_KEYS.mcpWalkState);
  return c.redirect("/admin/mcp-ward");
});

/**
 * The door-bank backfill: one keeper-fired pass over the stored ward
 * rounds so the bank opens holding every door history already
 * declared (docs/CORPUS_VELOCITY.md — without this, revisits idle
 * until the broken feed happens to vary). Idempotent; the JSON reply
 * IS the report, counts and all.
 */
/**
 * THE HOLE BUTTON (2026-09-04): read one recorded skipped range after
 * the fact, bounded per press, replying with the counts the way the
 * door-bank back-fill does. The range must be on the ledger exactly
 * as recorded — the service refuses anything else, so this route
 * cannot be talked into a coverage claim about an arbitrary window.
 */
adminRoutes.post("/admin/reconciliation/backfill", async (c) => {
  const { backfillSkippedRange, BACKFILL_SPANS_PER_CALL } = await import(
    "@/services/chain-reconciliation"
  );
  const { evmChainOf } = await import("@/lib/base-rpc");
  const form = (await c.req.parseBody()) as Record<string, unknown>;
  const fromBlock = Number.parseInt(String(form["from_block"] ?? ""), 10);
  const toBlock = Number.parseInt(String(form["to_block"] ?? ""), 10);
  const chain = evmChainOf(
    typeof form["chain"] === "string" ? form["chain"] : undefined,
  );
  if (!Number.isFinite(fromBlock) || !Number.isFinite(toBlock) || toBlock < fromBlock) {
    return c.json({ ok: false, reading: "from_block and to_block must be the bounds of a hole on the ledger, as integers." }, 400);
  }
  if (!chain) {
    return c.json({ ok: false, reading: `chain ${String(form["chain"])} is not one this store's walk reads.` }, 400);
  }
  const result = await backfillSkippedRange(c.env, {
    from_block: fromBlock,
    to_block: toBlock,
    chain,
  });
  const reading = !result.ran
    ? `Did not read: ${result.reason ?? "no reason recorded"}.`
    : result.complete
      ? `Hole closed: blocks ${result.read_from}–${result.read_to} on ${chain.label} read after the fact, ${result.transfers_seen} incoming transfer${result.transfers_seen === 1 ? "" : "s"} seen, ${result.orphans.length} orphan${result.orphans.length === 1 ? "" : "s"}${result.orphans.length ? " — each one paged; the books page's alarm trail has them" : " — every transfer in the window has a certificate"}.${result.cert_scan_truncated ? " The certificate scan hit its cap, so an orphan here may be a false alarm." : ""}`
      : `Read blocks ${result.read_from}–${result.read_to} on ${chain.label} (${result.transfers_seen} transfer${result.transfers_seen === 1 ? "" : "s"}, ${result.orphans.length} orphan${result.orphans.length === 1 ? "" : "s"}); ${result.remaining} blocks of this hole remain. Press again to continue — each press reads up to ${BACKFILL_SPANS_PER_CALL} spans.${result.failed ? ` This press ${result.reason}.` : ""}`;
  return c.json({ ok: result.ran, ...result, reading });
});

adminRoutes.post("/admin/ward/backfill-doors", async (c) => {
  const { backfillDoorBank } = await import("@/services/door-bank");
  const report = await backfillDoorBank(c.env);
  return c.json({
    ...report,
    reading:
      report.doors_after > report.doors_before
        ? `The bank grew from ${report.doors_before} to ${report.doors_after} doors off ${report.rounds_read} stored rounds. Next round's spare cap slots re-probe them on rotation.`
        : `Nothing new: ${report.rounds_read} stored rounds held no doors the bank did not already know. Safe to run again any time.`,
  });
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
    kvGet(c.env.COUNTERS, KV_KEYS.patronageNote(month)),
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
 * key vouching for itself, which is worth nothing. docs/archive/CEREMONY_B.md puts
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

adminRoutes.get("/admin/settlement-unknown", async (c) => {
  const { listSettlementUnknowns, AGE_OUT_DAYS } = await import(
    "@/services/settlement-unknown"
  );
  const listing = await listSettlementUnknowns(c.env, 100);
  const rows = listing.rows;
  const open = rows.filter((entry) => entry.row.state === "open");
  return c.json({
    what_this_is:
      "Machine 1 (#56): settle attempts that ended with NO VERDICT — the call threw, or both attempts died in transport and the inline rescue could not answer. Each row is a QUESTION the hourly resolver keeps asking the chain, not a decline: rendering this state as a decline is how 2026-08-07 booked three landed transfers as refusals.",
    verdict:
      open.length === 0
        ? "No open questions. Every ambiguous settle on record has been resolved by the chain, expired by its own clock, or aged out with the gap stated."
        : `${open.length} settle(s) still UNRESOLVED. The resolver re-asks hourly; settled_late rows surface at /admin/deliveries the moment the chain answers.`,
    states: {
      settled_late:
        "the money moved after all — the delivery-intent desk holds the case",
      expired_unused:
        "the window was covered, validBefore passed, nothing burned — the decline was right",
      aged_out_unresolved: `nothing could answer within ${AGE_OUT_DAYS} days — 'we could not answer', never 'no'; monthly reconciliation remains the backstop`,
    },
    ...(listing.truncated
      ? {
          truncated:
            "Showing the newest 100 rows; there are more, and the unseen ones are the OLDEST — a floor, not a total.",
        }
      : {}),
    rows: rows.map((entry) => entry.row),
  });
});

adminRoutes.get("/admin/buyers", async (c) => {
  const { readBuyers } = await import("@/services/buyers");
  return c.html(renderBuyersPage(await readBuyers(c.env)));
});

adminRoutes.get("/admin/instruments", async (c) => {
  const { computeObservatory } = await import("@/services/observatory");
  const { freeInstrumentUsage } = await import("@/services/instruments");
  return c.html(renderInstrumentsPage(freeInstrumentUsage(await computeObservatory(c.env))));
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
/**
 * THE FUNNEL: which wall the verification tier's asks are dying on.
 * Built 2026-08-18 off the keeper's ledger read — 703 organic asks on
 * settlement_attestation, one settle, and that one refunded. The
 * declines desk shows the refused; this page splits the SILENT into
 * "tried and was refused" vs "never tried", which are opposite fixes.
 */
adminRoutes.get("/admin/funnel", async (c) => {
  const { auditFunnel } = await import("@/services/funnel");
  const { renderFunnelPage } = await import("@/pages/admin/funnel-page");
  const report = await auditFunnel(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(report);
  }
  return c.html(renderFunnelPage(report));
});

/**
 * THE MARKET (2026-08-19): the round's numbers with their meanings.
 * Derived at read from the latest round's own rows — one code path
 * whether the round predates the desk or not — so every stored round
 * back to the first gets whatever the desk can honestly compute from
 * it. JSON serves the same aggregates for scripts.
 */
adminRoutes.get("/admin/market", async (c) => {
  const { latestWardRound } = await import("@/services/ward-round");
  const { marketAggregates } = await import("@/services/market");
  const round = await latestWardRound(c.env);
  if (!round) {
    return wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))
      ? c.html(
          (await import("@/pages/admin/layout")).renderAdminShell(
            "market",
            "<h1>The market</h1><p class='empty'>No ward round yet — the desk derives everything from the round's rows.</p>",
          ),
        )
      : c.json({ error: "no ward round yet" }, 404);
  }
  const market =
    round.market ?? marketAggregates(round.hosts, undefined);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ week: round.week, at: round.at, market });
  }
  const { renderMarketPage } = await import("@/pages/admin/market-page");
  const { bountyBoard } = await import("@/services/bounty-board");
  const board = await bountyBoard(c.env).catch(() => null);
  const posted = c.req.query("bounty_posted");
  const refused = c.req.query("bounty_refused");
  const notice = posted
    ? `Posted: ${posted} — it's on the public board now, terms captured from the door's live 402.`
    : refused
      ? `The board refused that one: ${refused}`
      : undefined;
  return c.html(renderMarketPage(round, market, board, notice));
});

/**
 * THE OUTREACH DESK (2026-08-19): the ward's private readings put to
 * their one licensed use. The queue and drafts derive fresh from the
 * latest round every read; the ledger holds only the keeper's own
 * workflow state and published contacts. No route here sends anything
 * to anyone — rule 30 keeps the send in the keeper's hand.
 */
adminRoutes.get("/admin/outreach", async (c) => {
  const { latestWardRound, previousWardRound } = await import(
    "@/services/ward-round"
  );
  const { deriveProspects, deriveWelcomes, healedAfterOutreach, readOutreachLedger } =
    await import("@/services/outreach");
  const round = await latestWardRound(c.env);
  if (!round) {
    return wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))
      ? c.html(
          (await import("@/pages/admin/layout")).renderAdminShell(
            "outreach",
            "<h1>Outreach</h1><p class='empty'>No ward round yet — the queue derives itself from the round's rows.</p>",
          ),
        )
      : c.json({ error: "no ward round yet" }, 404);
  }
  const previous = await previousWardRound(c.env);
  const ledger = await readOutreachLedger(c.env);
  const prospects = deriveProspects(round, previous);
  const welcomes = deriveWelcomes(
    round,
    previous,
    new URL(c.env.STORE_BASE_URL).host.toLowerCase(),
  );
  const healed = healedAfterOutreach(round, ledger);
  const { readCitationWatch, watchedProspects } = await import("@/services/citation-watch");
  const citations = await readCitationWatch(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({
      week: round.week,
      at: round.at,
      prospects,
      welcomes,
      healed,
      ledger,
      citations,
      citation_prospects: watchedProspects(),
    });
  }
  const { renderOutreachPage } = await import("@/pages/admin/outreach-page");
  return c.html(
    renderOutreachPage(
      round,
      prospects,
      healed,
      ledger,
      c.env.STORE_BASE_URL,
      c.req.query("notice"),
      welcomes,
      citations,
    ),
  );
});

/**
 * THE CITATION WATCH, by hand (2026-09-04). The Sunday press runs the
 * same function; this is the keeper pressing it after sending a note
 * or editing a list, so the desk never waits a week to say what a
 * page carries now. The outcome rides back as the notice.
 */
adminRoutes.post("/admin/citations/run", async (c) => {
  const { runCitationWatch } = await import("@/services/citation-watch");
  const report = await runCitationWatch(c.env);
  const cited = report.rows.filter((row) => row.verdict === "cited").length;
  const notice =
    `Citation watch read ${report.rows.length} page${report.rows.length === 1 ? "" : "s"}: ` +
    `${cited} cited, ${report.newly_cited.length} newly, ${report.newly_gone.length} gone.`;
  return c.redirect(`/admin/outreach?notice=${encodeURIComponent(notice)}`);
});

/**
 * THE WIRE (rule 30 as amended 2026-08-20 — the keeper: "if im
 * looking at it just give me a button that fires it"). One press,
 * one host: live re-probe first, send only if the defect reproduces,
 * one note per host ever. The outcome — sent, healed, refused — rides
 * back to the page as the notice, so the press always says what it
 * did in words.
 */
adminRoutes.post("/admin/outreach/send", async (c) => {
  const { latestWardRound, previousWardRound } = await import(
    "@/services/ward-round"
  );
  const { deriveProspects, readOutreachLedger, wireNote } = await import(
    "@/services/outreach"
  );
  const body = await c.req.parseBody();
  const host = String(body["host"] ?? "").toLowerCase();
  if (!host) return c.redirect("/admin/outreach?notice=no+host+named");
  const round = await latestWardRound(c.env);
  if (!round) return c.redirect("/admin/outreach");
  const previous = await previousWardRound(c.env);
  const ledger = await readOutreachLedger(c.env);
  const prospects = deriveProspects(round, previous);
  const outcome = await wireNote(c.env, host, prospects, ledger);
  const notice = outcome.sent
    ? `Sent to ${outcome.to} — the door was re-probed and the defect reproduced at ${outcome.verified_at.slice(0, 19)}Z.`
    : outcome.detail;
  return c.redirect(`/admin/outreach?notice=${encodeURIComponent(notice)}`);
});

/**
 * THE BATCH WIRE (rule 30, second amendment 2026-08-20 — the keeper:
 * "is there not a button i can scout then send all to all scouted").
 * One press, up to WIRE_BATCH_CAP hosts, each individually
 * live-verified by the same wireNote the per-card button uses. The
 * notice reports the whole batch in words: sent, healed, refused,
 * and how many eligible hosts the cap left for the next press.
 */
adminRoutes.post("/admin/outreach/send-all", async (c) => {
  const { latestWardRound, previousWardRound } = await import(
    "@/services/ward-round"
  );
  const { deriveProspects, readOutreachLedger, wireAllScouted } = await import(
    "@/services/outreach"
  );
  const round = await latestWardRound(c.env);
  if (!round) return c.redirect("/admin/outreach");
  const previous = await previousWardRound(c.env);
  const ledger = await readOutreachLedger(c.env);
  const prospects = deriveProspects(round, previous);
  const report = await wireAllScouted(c.env, prospects, ledger);
  const parts = [
    report.sent.length
      ? `Sent ${report.sent.length}: ${report.sent.map((s) => s.host).join(", ")}.`
      : "Sent none.",
    report.healed.length
      ? `Found healed on the live re-probe, marked fixed, nothing sent: ${report.healed.join(", ")}.`
      : "",
    report.refused.length
      ? `Refused ${report.refused.length}: ${report.refused.map((r) => `${r.host} (${r.reason})`).join(" · ")}`
      : "",
    report.remaining > 0
      ? `${report.remaining} more eligible below the cap — press again for the next batch.`
      : "Queue's eligible hosts are exhausted; scout more to widen it.",
  ].filter(Boolean);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(report);
  }
  return c.redirect(
    `/admin/outreach?notice=${encodeURIComponent(parts.join(" "))}`,
  );
});

/**
 * The contact scout, keeper-fired: one press reads security.txt for
 * up to SCOUT_CAP un-scouted queue hosts. Idempotent per host — a
 * host once looked at (found or "none published") is never re-read.
 */
adminRoutes.post("/admin/outreach/scout", async (c) => {
  const { latestWardRound, previousWardRound } = await import(
    "@/services/ward-round"
  );
  const { deriveProspects, deriveWelcomes, readOutreachLedger, scoutContacts } =
    await import("@/services/outreach");
  const round = await latestWardRound(c.env);
  if (!round) {
    return c.json({ refused: "no ward round yet" }, 404);
  }
  const previous = await previousWardRound(c.env);
  const prospects = deriveProspects(round, previous);
  // Both queues (2026-09-04): the broken doors in their ranking, then
  // the ready doors in theirs, so a press reaches the top of each.
  const welcomes = deriveWelcomes(
    round,
    previous,
    new URL(c.env.STORE_BASE_URL).host.toLowerCase(),
  );
  const report = await scoutContacts(
    c.env,
    [...prospects, ...welcomes],
    await readOutreachLedger(c.env),
  );
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(report);
  }
  return c.redirect("/admin/outreach");
});

/**
 * Flip one host's workflow status. The keeper's bookmark, nothing
 * more — no status value transmits anything to anyone. "fresh"
 * un-stamps a card (the 2026-08-19 misreading's per-card undo).
 */
adminRoutes.post("/admin/outreach/status", async (c) => {
  const form = await c.req.parseBody();
  const host = typeof form["host"] === "string" ? form["host"].toLowerCase() : "";
  const statusRaw = typeof form["status"] === "string" ? form["status"] : "";
  const { OUTREACH_STATUSES, readOutreachLedger, writeOutreachLedger } =
    await import("@/services/outreach");
  const status = OUTREACH_STATUSES.find((entry) => entry === statusRaw);
  if (!host || (!status && statusRaw !== "fresh")) {
    return c.json(
      {
        refused: `needs host and status (one of: ${OUTREACH_STATUSES.join(", ")}, or "fresh" to un-stamp)`,
      },
      400,
    );
  }
  const ledger = await readOutreachLedger(c.env);
  const entry = ledger.hosts[host] ?? {};
  if (status) {
    entry.status = status;
    entry.status_at = new Date().toISOString();
  } else {
    delete entry.status;
    delete entry.status_at;
  }
  ledger.hosts[host] = entry;
  await writeOutreachLedger(c.env, ledger);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ host, status: status ?? "fresh" });
  }
  return c.redirect("/admin/outreach");
});

/**
 * THE ONE-PRESS RECOVERY: wipe every workflow stamp, keep every
 * scouted contact. Built the day the "sent" buttons were misread as
 * send buttons and pressed down the whole queue — the ledger said
 * "sent" while nothing had gone anywhere, which would have poisoned
 * the healed list with false outreach wins.
 */
adminRoutes.post("/admin/outreach/clear-statuses", async (c) => {
  const { clearStatuses, readOutreachLedger, writeOutreachLedger } =
    await import("@/services/outreach");
  const ledger = await readOutreachLedger(c.env);
  const cleared = clearStatuses(ledger);
  await writeOutreachLedger(c.env, ledger);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ cleared, contacts_kept: true });
  }
  return c.redirect("/admin/outreach");
});

/**
 * THE REGISTRY PUBLISH PRESS (rule 30's shape): the weekly round
 * derives the aggregates automatically, but the public tally at
 * /registry gains a row only here, by the keeper's hand, after he has
 * read the round. Idempotent per week — a re-press replaces the
 * week's row with the round as it stands now.
 */
/**
 * THE INFLOW CENSUS — its own door, deliberately (the keeper's T1
 * ruling, 2026-08-28).
 *
 * NOT folded into /admin/market, because this reading costs roughly
 * sixty getLogs across two chains and a page that scans the chain on
 * every load is the shape this store already refuses elsewhere (the
 * passport chip's cache note says it in as many words). The keeper
 * asks for it; it does not happen to him.
 *
 * T1 ONLY: counts, no addresses, no hosts. Publication to the public
 * tally stays a separate press under rule 30, exactly like the
 * registry week — the reading being available is not the reading
 * being published.
 */
adminRoutes.get("/admin/market/inflows", async (c) => {
  const { readInflowCensus } = await import("@/services/inflow-census");
  const census = await readInflowCensus(c.env);
  if (!census) {
    return wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))
      ? c.html(
          (await import("@/pages/admin/layout")).renderAdminShell(
            "market",
            "<h1>Inflows</h1><p class='empty'>No ward round yet — there are no advertised addresses to watch.</p>",
          ),
        )
      : c.json({ error: "no ward round yet" }, 404);
  }
  /*
   * WHAT IS SHOWN IS WHAT MAY BE PRESSED. Stashed as the page
   * renders, so publishInflowWeek publishes the numbers on this
   * screen rather than a fresh walk nobody has seen. Rule 30 is "he
   * reads the round first"; this makes that mechanical.
   */
  const { stashRenderedReading, readInflowPulse } = await import(
    "@/services/inflow-pulse"
  );
  await stashRenderedReading(c.env, census);
  /*
   * PUBLISHED IS A STATE THE PAGE SHOWS, NOT A THING TO REMEMBER.
   * A press button that looks identical before and after is an
   * invitation to press twice, and the second press silently moves a
   * number the public has already read. The page reads the tally and
   * says which it is.
   */
  const alreadyPublished = (await readInflowPulse(c.env)).weeks.find(
    (row) => row.week === census.week,
  );
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(census);
  }
  const { renderAdminShell } = await import("@/pages/admin/layout");
  const { escapeHtml } = await import("@/lib/sanitize");
  const windows = census.windows
    .map(
      (window) =>
        `<li><strong>${escapeHtml(window.chain)}</strong>: ${window.received_advertised} of ${window.advertised_here} addresses whose doors quoted this rail received here${
          window.received_unadvertised > 0
            ? `, plus ${window.received_unadvertised} that never quoted it at all`
            : ""
        }. ${window.transfers} transfer${window.transfers === 1 ? "" : "s"},
        over ${window.blocks.toLocaleString()} blocks (${window.from_block}–${window.to_block}) in ${window.calls} call${window.calls === 1 ? "" : "s"}${
          window.truncated ? " — <strong>cut short</strong>" : ""
        }${
          window.addresses_unread > 0
            ? ` — <strong>${window.addresses_unread} addresses unread</strong>`
            : ""
        }${window.unread ? ` — <strong>${escapeHtml(window.unread)}</strong>` : ""}</li>`,
    )
    .join("");
  /*
   * NO PERCENTAGE WHEN THE WINDOWS DISAGREE (rule 52). The first
   * reading of this instrument stated "153 of 300" as a rate while
   * Base had been watched for a full day and Polygon for eleven
   * hours. A union across unequal windows is a floor; the page says
   * floor, and says which chain was short.
   */
  const pct = (part: number, whole: number): string =>
    `${Math.round((part / Math.max(1, whole)) * 100)}%`;
  const sole = census.by_exclusivity.sole;
  const shared = census.by_exclusivity.shared;
  const headline = census.windows_equal
    ? `<strong>${sole.received} of ${sole.watched}</strong> (${pct(sole.received, sole.watched)})
       addresses that <strong>only one door advertised</strong> received USDC over the window below.`
    : `<strong>At least ${sole.received} of ${sole.watched}</strong> sole-advertised addresses received USDC —
       <strong>a floor, not a rate</strong>: the chains below were not walked over the same window,
       so no percentage is stated.`;
  const shape = census.distribution;
  return c.html(
    renderAdminShell(
      "market",
      `<h1>Inflows — week ${escapeHtml(census.week)}</h1>
      <p class="lead">${headline}
      ${census.addresses_capped ? `<strong>The ceiling bound:</strong> the round advertised ${census.addresses_advertised} and this run watched ${census.addresses_checked} on a rotating window.` : ""}</p>

      <h2>Did anyone pay an ask?</h2>
      <p>The narrowest honest answer this instrument can give:
      <strong>${census.in_quoted_band.transfers}</strong> transfer${census.in_quoted_band.transfers === 1 ? "" : "s"}
      landed inside the USDC range the advertising door itself quoted, across
      <strong>${census.in_quoted_band.sole_addresses}</strong> sole-advertised address${census.in_quoted_band.sole_addresses === 1 ? "" : "es"}
      (${census.in_quoted_band.addresses} including shared ones).
      A floor on plausible payments — a band is not a receipt.</p>

      <h2>The narrowest figure, and the end of what the chain can do</h2>
      <p><strong>${census.narrowest.multi_payer_in_band}</strong> of ${census.narrowest.watched}
      sole-advertised addresses took in-band transfers from <strong>more than one</strong> distinct
      payer — ${census.narrowest.transfers} such transfers, median
      ${census.narrowest.median_payers} payers each. Payers counted over the in-band transfers only,
      so a door with one customer and fifty dust senders does not read as popular.</p>
      <p><em>Still not proof.</em> One operator with two wallets paying its own door clears this bar,
      and nothing here has seen a receipt. This is the floor beneath which chain data cannot go —
      the next rung has to be a bought good, not a cleverer read of the same rows.</p>

      <h2>Who sent it</h2>
      <p>A market has many payers; a dust campaign has one sprayer; a facilitator has one sender;
      an operator funding itself sends from a wallet it also advertised. All four look identical
      in a transfer count.</p>
      <ul>
        <li><strong>${census.senders.distinct}</strong> distinct senders across ${census.transfers_seen} transfers;
        the busiest single sender accounts for
        <strong>${census.senders.top_sender_share_pct === null ? "n/a" : `${census.senders.top_sender_share_pct}%`}</strong></li>
        <li>Median <strong>${census.senders.median_senders_per_receiver}</strong> distinct senders per receiving address;
        <strong>${census.senders.single_sender_receivers}</strong> addresses took their entire inflow from one sender</li>
        <li><strong>${census.senders.broadcasters}</strong> sender${census.senders.broadcasters === 1 ? "" : "s"} reached 10+ of these
        addresses, accounting for <strong>${census.senders.broadcaster_share_pct === null ? "n/a" : `${census.senders.broadcaster_share_pct}%`}</strong>
        of all transfers — the spray signature</li>
        <li><strong>${census.senders.from_advertised}</strong> transfers came from an address advertised in a 402 itself</li>
      </ul>

      <h2>Sole versus shared</h2>
      <p>An address several doors point at is shared infrastructure <em>by construction</em> — read off our
      own record of who advertised it, not guessed from the wallet.</p>
      <ul>
        <li><strong>Sole-advertised</strong>: ${sole.received} of ${sole.watched} received
        (${pct(sole.received, sole.watched)}), ${sole.transfers} transfers</li>
        <li><strong>Shared</strong>: ${shared.received} of ${shared.watched} received
        (${pct(shared.received, shared.watched)}), ${shared.transfers} transfers</li>
      </ul>

      <h2>How the traffic is shaped</h2>
      <p>Across all ${census.addresses_received} receiving addresses and ${census.transfers_seen} transfers:
      median <strong>${shape.median_transfers}</strong> transfers per receiving address;
      busiest single address <strong>${shape.max_transfers}</strong>;
      busiest tenth hold
      <strong>${shape.top_decile_share_pct === null ? "n/a" : `${shape.top_decile_share_pct}%`}</strong>.
      Median transfer size <strong>$${census.amounts.median_usdc}</strong>;
      ${census.amounts.under_1_usdc} under $1, ${census.amounts.under_10_usdc} under $10,
      ${census.amounts.over_100_usdc} over $100.</p>

      <h2>What was actually covered</h2>
      <ul>${windows}</ul>
      <h2>What this counts</h2>
      <p>${escapeHtml(census.what_this_counts)}</p>
      <h2>What this is not</h2>
      <p>${escapeHtml(census.what_this_is_not)}</p>

      <h2>Publish this week</h2>
      ${
        c.req.query("refused")
          ? `<p class="empty"><strong>Refused:</strong> ${escapeHtml(c.req.query("refused") ?? "")}</p>`
          : ""
      }
      ${
        c.req.query("published")
          ? `<p><strong>Published week ${escapeHtml(c.req.query("published") ?? "")}</strong>${
              c.req.query("replaced") === "true" ? " (replaced an earlier press)" : ""
            } — now live at <a href="/inflows">/inflows</a>.</p>`
          : ""
      }
      <p>Nothing above reaches the public page until this is pressed. The press
      snapshots the counts as they stand now, and refuses outright if the chains
      were not walked over the same window or if any address went unread — a
      reading that does not know its own denominator has no business on a public
      tally.</p>
      ${
        alreadyPublished
          ? `<p><strong>Week ${escapeHtml(census.week)} is published</strong> —
             pressed ${escapeHtml(alreadyPublished.published_at)}, live at
             <a href="/inflows">/inflows</a>. The button returns when the round
             rolls to a new week; re-pressing the same week would replace it, and
             a public number should not move because a page was reloaded.</p>
             <form method="post" action="/admin/market/publish-inflows">
               <button type="submit" name="replace" value="yes">Replace the published week ${escapeHtml(census.week)}</button>
             </form>`
          : `<form method="post" action="/admin/market/publish-inflows">
               <button type="submit">Publish week ${escapeHtml(census.week)} to /inflows</button>
             </form>`
      }`,
    ),
  );
});

/**
 * L3c, ENDPOINT SIDE — its own door, like the inflow census, and for
 * the same reason: it costs did:web resolutions across every issuer
 * the round saw, which is not a thing that should happen on a
 * pageview somebody else opens.
 *
 * COUNTS ARE THE READING; the named rows below it are the keeper's
 * own screen. "This door's signature does not verify" is a heavier
 * claim than anything this store publishes today and needs its own
 * ruling before it reaches anybody.
 */
adminRoutes.get("/admin/market/authenticity", async (c) => {
  const { readOfferAuthenticityDetail } = await import(
    "@/services/offer-authenticity"
  );
  const walked = await readOfferAuthenticityDetail(c.env);
  if (!walked) {
    return wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))
      ? c.html(
          (await import("@/pages/admin/layout")).renderAdminShell(
            "market",
            "<h1>Offer authenticity</h1><p class='empty'>No ward round yet — there are no stored challenges to verify.</p>",
          ),
        )
      : c.json({ error: "no ward round yet" }, 404);
  }
  const { reading, rows } = walked;
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ reading, rows });
  }
  const { renderAdminShell } = await import("@/pages/admin/layout");
  const { escapeHtml } = await import("@/lib/sanitize");
  const verdicts = Object.entries(reading.by_verdict)
    .map(
      ([verdict, count]) =>
        `<li><strong>${escapeHtml(verdict)}</strong>: ${count}</li>`,
    )
    .join("");
  const interesting = rows.filter(
    (row) => row.verdict === "failed" || row.verdict === "kid_not_in_document",
  );
  const flagged = interesting.length
    ? `<h2>Doors worth a human look — NOT PUBLISHED</h2>
       <p>A signature that does not verify is a serious claim about a named party. These rows
       are here for you, and nothing renders them anywhere else.</p>
       <ul>${interesting
         .map(
           (row) =>
             `<li><strong>${escapeHtml(row.host)}</strong>: ${escapeHtml(row.verdict)} —
              ${row.offers_failed} of ${row.offers_seen} offers, issuers
              ${escapeHtml(row.issuers.join(", ") || "none named")}${
                row.detail ? ` — ${escapeHtml(row.detail)}` : ""
              }</li>`,
         )
         .join("")}</ul>`
    : `<h2>Doors worth a human look</h2><p>None: no signature failed and no issuer disowned a key this round.</p>`;
  return c.html(
    renderAdminShell(
      "market",
      `<h1>Offer authenticity — week ${escapeHtml(reading.week)}</h1>
      ${
        reading.hosts_with_evidence === 0
          ? `<p class="lead"><strong>This instrument could not look.</strong> All
             ${reading.by_verdict.evidence_absent} doors in this round carry no stored challenge
             bytes — the round predates the evidence capture that shipped 2026-08-26, or its doors
             were never probed. <strong>That is our gap, not a fact about the market.</strong>
             Nothing below says whether anyone serves signed offers; the first round sealed after
             the capture is the first this can read.</p>`
          : `<p class="lead"><strong>${reading.hosts_serving_signed} of ${reading.hosts_with_evidence}</strong>
             doors whose challenge this round stored serve a signed offer at all — that is the entire
             population this instrument can speak about, and the honest measure of whether it is worth
             having.${
               reading.by_verdict.evidence_absent > 0
                 ? ` A further ${reading.by_verdict.evidence_absent} doors carry no stored bytes and are
                    excluded rather than counted as serving nothing.`
                 : ""
             }</p>`
      }

      <h2>What the signatures said</h2>
      <p><strong>${reading.offers_verified}</strong> of ${reading.offers_seen} signed offers verified
      against the key their own issuer publishes; <strong>${reading.offers_failed}</strong> did not.
      ${reading.offers_schema_failed} also failed the offer schema — counted apart, because a signed
      offer with a sloppy field is not a forgery.</p>
      <ul>${verdicts}</ul>

      <h2>What it cost</h2>
      <p>${reading.resolutions_spent} did:web resolutions across ${reading.issuers_seen} distinct issuers
      (${reading.issuers_resolved} resolved, ${reading.issuers_unreachable} would not)${
        reading.budget_bound
          ? ` — <strong>the ${reading.resolution_budget}-resolution budget bound</strong>`
          : ""
      }. No door was knocked on for this: every byte verified here was already in the round.</p>

      ${flagged}

      <h2>What this counts</h2>
      <p>${escapeHtml(reading.what_this_counts)}</p>
      <h2>What this is not</h2>
      <p>${escapeHtml(reading.what_this_is_not)}</p>`,
    ),
  );
});

/**
 * THE INFLOW PRESS (rule 30). The census has been readable since
 * 2026-08-28 and unpublished the whole time — not by a ruling, but
 * because nobody had built this. It refuses rather than publishing a
 * reading whose coverage cannot support a share.
 */
adminRoutes.post("/admin/market/publish-inflows", async (c) => {
  const { publishInflowWeek } = await import("@/services/inflow-pulse");
  const result = await publishInflowWeek(c.env);
  if (!result.ok) {
    return c.redirect(
      `/admin/market/inflows?refused=${encodeURIComponent(result.refusal.slice(0, 300))}`,
      303,
    );
  }
  return c.redirect(
    `/admin/market/inflows?published=${encodeURIComponent(result.entry.week)}&replaced=${result.replaced}`,
    303,
  );
});

adminRoutes.post("/admin/market/publish-registry", async (c) => {
  const { publishRegistryWeek } = await import("@/services/registry-pulse");
  const result = await publishRegistryWeek(c.env);
  if (!result.ok) {
    return c.json({ refused: result.refusal }, 404);
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({
      published: result.entry.week,
      weeks_on_tally: result.weeks,
      replaced_existing_row: result.replaced,
      public_at: "/registry",
    });
  }
  return c.redirect("/registry");
});

/**
 * MONEY OUT, ON ITS OWN PAGE (2026-09-04): the paying wallet read off
 * the chain (the full wait, no leash — this is the page that exists
 * to answer), the week's budget, every bounty and its claim, and
 * every claim presented with its outcome. Reads only; the board's
 * levers stay on the market page.
 */
adminRoutes.get("/admin/bounties", async (c) => {
  const notes: string[] = [];
  const [board, wallet, ledger, attempts, porch, creditOwed, creditHolders] =
    await Promise.allSettled([
      import("@/services/bounty-board").then(({ bountyBoard }) =>
        bountyBoard(c.env),
      ),
      import("@/services/field-wallet").then(({ readFieldWallet }) =>
        readFieldWallet(c.env),
      ),
      readBountyLedger(c.env),
      listRecentBountyEvents(c.env, 40),
      readPorchLedger(c.env),
      import("@/services/store-credit").then(({ creditOutstandingAtomic }) =>
        creditOutstandingAtomic(c.env),
      ),
      /*
       * Who is owed, off the credit rows (bounded; the sweep's own
       * cap). "credit_" keys are the challenge and aggregate keys under
       * the same prefix and are not records.
       */
      (async () => {
        const listed = await listKeys(c.env.COUNTERS, {
          prefix: KV_KEYS.creditPrefix,
          cap: 200,
        });
        const names = listed.names.filter((name) => !name.startsWith("credit_"));
        const rows = await import("@/lib/kv-bulk").then(({ bulkGetJson }) =>
          bulkGetJson<{
            wallet: string;
            balance_atomic: string;
            earned_total_atomic: string;
            redeemed_total_atomic: string;
            expired_total_atomic: string;
            updated_at: string;
          }>(c.env.COUNTERS, names),
        );
        const usd = (atomic: string | undefined): number =>
          Number(BigInt(atomic ?? "0")) / 1e6;
        return [...rows.values()]
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => ({
            wallet: row.wallet,
            balance_usd: usd(row.balance_atomic),
            earned_usd: usd(row.earned_total_atomic),
            redeemed_usd: usd(row.redeemed_total_atomic),
            expired_usd: usd(row.expired_total_atomic),
            updated_at: row.updated_at,
          }))
          .sort((a, b) => b.balance_usd - a.balance_usd);
      })(),
    ]);
  const { renderBountiesPage, moneyOutAllTime } = await import(
    "@/pages/admin/bounties-page"
  );
  const porchLedger = shelf(porch, null, "the porch", notes);
  const organic = (surface: string): number =>
    porchLedger?.surfaces[surface]?.["organic"] ?? 0;
  const boardState = shelf(board, null, "the board", notes);
  /*
   * Whether each payout burned on chain — one bounded read per paid
   * bounty, after the board is known. Fail-soft: an unreadable chain
   * leaves the column saying "unknown", never "not redeemed".
   */
  const redemptions = boardState
    ? await import("@/services/bounty-board")
        .then(({ payoutRedemptions }) =>
          payoutRedemptions(c.env, boardState.bounties),
        )
        .catch(() => {
          notes.push("the redemption check");
          return null;
        })
    : null;
  return c.html(
    renderBountiesPage({
      board: boardState,
      wallet: shelf(wallet, null, "the paying wallet", notes),
      ledger: shelf(ledger, null, "the bounty ledger", notes),
      attempts: shelf(attempts, [], "claim attempts", notes),
      funnel: porchLedger
        ? {
            room: organic("bounties"),
            board_json: organic("bounties.json"),
            claim_read: organic("bounty-claim:read"),
            claims_presented: organic("bounty-claim"),
          }
        : null,
      allTime: moneyOutAllTime(
        boardState,
        shelf(creditOwed, null, "the credit liability", notes),
      ),
      creditHolders: shelf(creditHolders, null, "the credit ledger", notes),
      redemptions,
      now: new Date().toISOString(),
      loadNotes: notes,
    }),
  );
});

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

/*
 * CV'S CORNER CAME DOWN, 2026-08-27, on the keeper's call: "we can
 * probably drop CV's corner, it's not maintained." The page, its
 * research-trail reader and its spec went together; the research
 * markdown under research/ stays, because those are records and this
 * was only a window onto them. An admin page nobody maintains is not
 * neutral furniture — it is a stale reading served with the same
 * authority as the live ones beside it, on the one surface whose job
 * is an honest glance.
 */

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
    await kvPut(c.env.COUNTERS, KV_KEYS.weekNote, note);
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
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
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
