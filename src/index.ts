import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  adminRoutes,
  almanacRoutes,
  anchorRoutes,
  badgeRoutes,
  bellRoutes,
  buyRoutes,
  catalogRoutes,
  directoryRoutes,
  trainRoutes,
  faviconRoutes,
  guestbookRoutes,
  letterRoutes,
  llmsRoutes,
  agentsMdRoutes,
  luckyRoutes,
  mcpRoutes,
  openapiRoutes,
  patronageRoutes,
  phantomRoutes,
  porchRoutes,
  practiceCounterRoutes,
  requestRoutes,
  houseLedgerRoutes,
  neighboursRoutes,
  stackRoutes,
  correctionsRoutes,
  visitorsRoutes,
  trustListRoutes,
  refundRoutes,
  schemaRoutes,
  siteMetaRoutes,
  skillRoutes,
  statsRoutes,
  pulseRoutes,
  attestationRoutes,
  conventionalRoutes,
  didRoutes,
  livenessRoutes,
  fulfillmentLogRoutes,
  claimsRoutes,
  conformanceRoutes,
  preflightRoutes,
  watchRoutes,
  anchorLogRoutes,
  rightsRoutes,
  windDownRoutes,
  becomingRoutes,
  stampRoutes,
  storefrontRoutes,
  tradingPostRoutes,
  verifyRoutes,
  wellKnownRoutes,
  whatRoutes,
  zodiacRoutes,
} from "@/routes";
import { sendAlert } from "@/lib/alerts";
import type { EventSignals } from "@/lib/metrics";
import { recordPorchVisit } from "@/lib/metrics";
import { getMenuItem } from "@/store";
import { STORE_HEADER } from "@/lib/identity";
import { compileDigest } from "@/services/digest";
import { runHealthChecks } from "@/services/health";
import { sweepPhantomChecks } from "@/services/phantom";
import { sweepStandingWatches } from "@/services/standing-watch";
import { recomputeCorrections } from "@/services/reclassify";
import { assembleDraft } from "@/services/gazette-weekly";
import { appendAnchor, listAnchors } from "@/services/anchor-log";
import { runAnchorCron } from "@/services/anchor-submit";
import { runDeliveryAudit } from "@/services/delivery-audit";
import {
  runChainReconciliation,
  runSolanaReconciliation,
} from "@/services/chain-reconciliation";
import type { Env, HonoEnv } from "@/types";

/**
 * Sean-Claude Van Damme's General Store, the whole shop, one Worker.
 * Routes live in src/routes/, shop data in src/store/, KV logic in
 * src/services/, shared plumbing in src/lib/.
 */
const app = new Hono<HonoEnv>();

/**
 * HTTPS, ANSWERED IN CODE rather than trusted to a dashboard toggle
 * (2026-08-04: an SEO crawl found http:// serving 200s beside
 * https:// — two sites, duplicate titles, split signals, and a "not
 * secure" tag on one of them). A plain-HTTP request gets one 301 and
 * nothing else; every HTTPS response carries HSTS so returning
 * browsers stop asking.
 */
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  await next();
  c.res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
});

// house tradition
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-House-Rule", "Argue properly. --7");
  /**
   * Passive self-citation on every response. Tier 2 display name plus
   * the domain, because this is the header a person reads in a devtools
   * panel; the outbound user-agent carries the tier 1 slug because that
   * is a machine field. X-House-Rule above is untouched and stays a
   * separate thing: one name, one job.
   */
  c.res.headers.set("X-Store", STORE_HEADER);
});

/**
 * The front-porch log: free-tier attribution. Paths and headers only;
 * no bodies, no cookies, nothing client-side, nothing in responses.
 * /mcp initialize+tools/list log inside the handler (needs the method).
 */
const PORCH_EXACT = new Map<string, string>([
  ["/", "storefront"],
  ["/what", "what"],
  ["/llms.txt", "llms.txt"],
  ["/menu.json", "menu.json"],
  ["/skill.md", "skill.md"],
  ["/gazette", "gazette"],
  ["/almanac", "almanac"],
  ["/api/treat", "treat"],
  ["/stats", "stats"],
  ["/api/conformance", "conformance"],
  ["/api/conformance/v1", "conformance"],
]);

function porchSurface(path: string, method: string): string | undefined {
  const exact = PORCH_EXACT.get(path);
  if (exact) {
    return exact;
  }
  if (path.startsWith("/.well-known/")) {
    return "well-known";
  }
  if (path === "/zodiac" || path.startsWith("/zodiac/")) {
    return "zodiac";
  }
  if (path === "/api/bell" && method === "POST") {
    return "bell";
  }
  if (path === "/api/guestbook") {
    return method === "POST" ? "guestbook:write" : "guestbook:read";
  }
  /**
   * PER-ITEM WINDOW SHOPPING. /menu.json logged as one surface, so a
   * reader who pulled up a single item's page and left was invisible:
   * we could see attention on the menu and money at the till, and
   * nothing about WHICH shelf got picked up and put back down. That
   * gap is the closest thing this store can measure to want, since a
   * 402 needs a client that already decided to try.
   *
   * Only ids that are actually on the shelf log. A junk path can't
   * mint a counter key, so the key space stays bounded by the menu.
   */
  if (path.startsWith("/menu/")) {
    const itemId = path.slice("/menu/".length);
    return getMenuItem(itemId) ? `item:${itemId}` : undefined;
  }
  return undefined;
}

app.use("*", async (c, next) => {
  const surface = porchSurface(c.req.path, c.req.method);
  if (surface) {
    const signals: EventSignals = {};
    const userAgent = c.req.header("User-Agent");
    if (userAgent) {
      signals.userAgent = userAgent;
    }
    const referrer = c.req.header("Referer");
    if (referrer) {
      signals.referrer = referrer;
    }
    const declared = c.req.query("src") ?? c.req.query("source");
    if (declared) {
      signals.declaredSource = declared;
    }
    const houseHeader = c.req.header("X-House");
    if (houseHeader) {
      signals.houseHeader = houseHeader;
    }
    const houseParam = c.req.query("house");
    if (houseParam) {
      signals.houseParam = houseParam;
    }
    const logged = recordPorchVisit(c.env, surface, signals).catch(() => {
      // The log is a courtesy; the door never waits on it.
    });
    try {
      c.executionCtx.waitUntil(logged);
    } catch {
      await logged;
    }
  }
  await next();
});

app.route("/", storefrontRoutes);
app.route("/", siteMetaRoutes);
app.route("/", faviconRoutes);
app.route("/", statsRoutes);
app.route("/", pulseRoutes);
app.route("/", attestationRoutes);
app.route("/", conventionalRoutes);
app.route("/", didRoutes);
app.route("/", livenessRoutes);
app.route("/", fulfillmentLogRoutes);
app.route("/", claimsRoutes);
app.route("/", conformanceRoutes);
app.route("/", preflightRoutes);
app.route("/", watchRoutes);
app.route("/", anchorLogRoutes);
app.route("/", rightsRoutes);
app.route("/", windDownRoutes);
app.route("/", becomingRoutes);
app.route("/", schemaRoutes);
app.route("/", mcpRoutes);
app.route("/", porchRoutes);
app.route("/", whatRoutes);
app.route("/", practiceCounterRoutes);
app.route("/", trustListRoutes);
app.route("/", houseLedgerRoutes);
app.route("/", neighboursRoutes);
app.route("/", stackRoutes);
app.route("/", correctionsRoutes);
app.route("/", visitorsRoutes);
app.route("/", llmsRoutes);
app.route("/", agentsMdRoutes);
app.route("/", skillRoutes);
app.route("/", catalogRoutes);
app.route("/", openapiRoutes);
app.route("/", wellKnownRoutes);
app.route("/", buyRoutes);
app.route("/", anchorRoutes);
app.route("/", patronageRoutes);
app.route("/", phantomRoutes);
app.route("/", letterRoutes);
app.route("/", almanacRoutes);
app.route("/", zodiacRoutes);
app.route("/", directoryRoutes);
app.route("/", trainRoutes);
app.route("/", refundRoutes);
app.route("/", guestbookRoutes);
app.route("/", bellRoutes);
app.route("/", stampRoutes);
app.route("/", tradingPostRoutes);
app.route("/", requestRoutes);
app.route("/", verifyRoutes);
app.route("/", luckyRoutes);
app.route("/", badgeRoutes);
app.route("/", adminRoutes);

app.notFound((c) =>
  c.json(
    {
      error: "That aisle doesn't exist. The whole store fits on one page:",
      menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
      front_door: `${c.env.STORE_BASE_URL}/llms.txt`,
    },
    404,
  ),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Deliberate responses (e.g. the Basic Auth challenge) pass through.
    return err.getResponse();
  }
  console.error("Something fell off a shelf:", err);
  return c.json(
    {
      error:
        "Something fell off a shelf back here. Give us a minute and try again, no charge for the noise.",
      // The 404 has carried a way home since it was written; the 500
      // did not, which meant the one response a visitor sees when
      // something is genuinely wrong was also the one with no door in
      // it. Copy untouched; a door added beside it.
      front_door: c.env.STORE_BASE_URL,
      menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
    },
    500,
  );
});

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  // Hourly: phantom walk + the health rounds. Sundays 7am ET: the digest.
  scheduled: async (event, env, ctx) => {
    if (event.cron === "0 11 * * SUN") {
      /**
       * THE WARD ROUND rides the Sunday press: the weekly ecosystem
       * census (services/ward-round.ts) that keeps the outreach data
       * from going stale by nobody remembering a script. Failure
       * alerts rather than skipping silently — a stale round reads
       * exactly like a healthy ecosystem.
       */
      ctx.waitUntil(
        import("@/services/ward-round").then(({ runWardRound }) =>
          runWardRound(env).then(
            () => undefined,
            (error) =>
              sendAlert(env, {
                condition: "worker_health",
                detail: `Ward round failed: ${String(error)}`,
              }),
          ),
        ),
      );
      ctx.waitUntil(compileDigest(env));
      // THE_NINETY gate: the Gazette drafts itself only when the week
      // earned an edition (3+ organic events); the keeper's pen
      // decides whether it prints. Hand-set issues bypass via /admin.
      ctx.waitUntil(assembleDraft(env).then(() => undefined));
    }
    ctx.waitUntil(
      sweepPhantomChecks(env).catch((error) =>
        sendAlert(env, {
          condition: "worker_health",
          detail: `Phantom sweep failed: ${String(error)}`,
        }),
      ),
    );
    /**
     * THE STANDING WATCH ROUNDS. Same walk as the phantom sweep, once
     * an hour; a failed sweep alerts rather than silently skipping,
     * because a skipped hour becomes an hours_unprobed row in a
     * customer's history — our gap, on their record.
     */
    ctx.waitUntil(
      sweepStandingWatches(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Standing watch sweep failed: ${String(error)}`,
          }),
      ),
    );
    ctx.waitUntil(runHealthChecks(env));
    /**
     * THE DELIVERY AUDIT. The one failure this store cannot be told
     * about: a payment settled, the handler never delivered, and the
     * buyer is an agent that may not be running any more to complain.
     * Every counter we keep is written before delivery is attempted,
     * so nothing else on this cron can see it (problem ledger #18).
     */
    /**
     * THE BANK RECONCILIATION (ledger #4). Walks USDC arriving at the
     * store's wallet against certificates minted, which is the only
     * check here that does not depend on our own writes — so it is the
     * only one that can see a payment our own pipeline never recorded.
     */
    ctx.waitUntil(
      runChainReconciliation(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Chain reconciliation failed: ${String(error)}`,
          }),
      ),
    );
    /**
     * THE SAME QUESTION, ASKED OF THE SECOND RAIL. Skips itself with a
     * stated reason while SOLANA_PAY_TO is unset; once money can
     * arrive on Solana, this is the walk that retires the
     * unreconciled cap (PAYMENT_RAILS.md ruling, 2026-08-04).
     */
    ctx.waitUntil(
      runSolanaReconciliation(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Solana reconciliation failed: ${String(error)}`,
          }),
      ),
    );
    ctx.waitUntil(
      runDeliveryAudit(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Delivery audit failed: ${String(error)}`,
          }),
      ),
    );
    /**
     * THE ANCHOR PASS. Appends at most one entry a day (the interval
     * is read off the log itself, not a second cron trigger) and tries
     * to upgrade pending proofs every hour, because a proof becomes
     * Bitcoin-backed an hour or two after submission and until then it
     * proves less than it will. Never on the money path, and every
     * failure inside is already recorded on its own entry — this catch
     * is for the unexpected kind.
     */
    ctx.waitUntil(
      listAnchors(env)
        .then((records) =>
          runAnchorCron(env, records, () => appendAnchor(env)),
        )
        .then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Anchor pass failed: ${String(error)}`,
            }),
        ),
    );
    /**
     * THE STANDING CORRECTION, on the clock rather than in a page load.
     * /admin/recount has to stop at a cap because a page that times out
     * is worse than one that says how far it got — which makes its
     * figure a window, not a month. Nothing renders here, so this walk
     * reads every row and the published correction is a real month
     * total. It recurs because the crawler table keeps gaining entries
     * and every entry retroactively changes what old rows mean; a
     * correction computed once is a correction with an expiry date
     * nobody wrote down.
     */
    ctx.waitUntil(
      recomputeCorrections(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Reclassification walk failed: ${String(error)}`,
          }),
      ),
    );
  },
};

// Cloudflare Workers requires a default export for its fetch/scheduled handlers.
export default worker;
