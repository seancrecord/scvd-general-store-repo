import { MARKDOWN_MEDIA_TYPE, prefersMarkdown, VARY_ACCEPT } from "@/lib/accept";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { POLYGON_EVM } from "@/lib/base-rpc";
import {
  adminRoutes,
  almanacRoutes,
  anchorRoutes,
  badgeRoutes,
  bellRoutes,
  buyRoutes,
  commissionRoutes,
  tabPoolRoutes,
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
  tillRoutes,
  webmcpRoutes,
  mcpMdRoutes,
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
  executionContractRoutes,
  statsRoutes,
  corpusRoutes,
  reportRoutes,
  serviceAuditRoutes,
  reconciliationRoutes,
  namespaceSpecRoutes,
  pulseRoutes,
  registryRoutes,
  freshSetRoutes,
  okfRoutes,
  defectRoutes,
  noticeRoutes,
  standingNoteRoutes,
  trustRoutes,
  agentAuthRoutes,
  askRoutes,
  passportRoutes,
  profilesRoutes,
  receiptVerifyRoutes,
  practiceRoutes,
  attestationRoutes,
  criteriaRoutes,
  conventionalRoutes,
  didRoutes,
  livenessRoutes,
  fulfillmentLogRoutes,
  claimsRoutes,
  conformanceRoutes,
  conformanceLandingRoutes,
  corpusLandingRoutes,
  doorsRoutes,
  samplesRoutes,
  beforeYouPayRoutes,
  goodBuyerRoutes,
  preflightRoutes,
  discoveryRoutes,
  launchCheckRoutes,
  bountyRoutes,
  creditRoutes,
  pricingRoutes,
  railsRoutes,
  privacyRoutes,
  mandateRoutes,
  statementRoutes,
  onpageRoutes,
  watchRoutes,
  anchorLogRoutes,
  rightsRoutes,
  windDownRoutes,
  becomingRoutes,
  stampRoutes,
  storefrontRoutes,
  developerRoutes,
  deprecationRoutes,
  tradingPostRoutes,
  verifyRoutes,
  wellKnownRoutes,
  coverageRoutes,
  botAuthRoutes,
  botAuthLandingRoutes,
  whatRoutes,
  zodiacRoutes,
} from "@/routes";
import { sendAlert } from "@/lib/alerts";
import type { EventSignals } from "@/lib/metrics";
import {
  itemKeyFromPath,
  recordPorchVisit,
  recordServerError,
} from "@/lib/metrics";
import { getMenuItem } from "@/store";
import { porchSurface } from "@/lib/porch-surface";
import { STORE_HEADER } from "@/lib/identity";
import { compileDigest } from "@/services/digest";
import { runHealthChecks } from "@/services/health";
import { sweepPhantomChecks } from "@/services/phantom";
import { sweepStandingWatches } from "@/services/standing-watch";
import { sweepConformanceWatches } from "@/services/conformance-watch";
import { recomputeCorrections } from "@/services/reclassify";
import { appendAnchor, listAnchors } from "@/services/anchor-log";
import { runAnchorCron } from "@/services/anchor-submit";
import { runDeliveryAudit } from "@/services/delivery-audit";
import { runRefundWindowAudit } from "@/services/refund-window";
import { rebuildOpenLaborIndex } from "@/services/queue-capacity";
import {
  runEvmReconciliations,
  runSolanaReconciliation,
} from "@/services/chain-reconciliation";
import { conditionalGet } from "@/lib/conditional-get";
import { discoveryCors } from "@/lib/cors";
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

// One middleware, one explicit boundary: CORS on the public
// discovery surface and the MCP door, nothing stateful, nothing
// paid. The list and its reasoning live in lib/cors.ts.
app.use("*", discoveryCors);
/*
 * AFTER the cross-origin middleware, deliberately. Hono runs
 * post-next code in reverse registration order, so this builds the
 * 304 first and discoveryCors then puts its header on it — a
 * revalidating browser that got no ACAO on the 304 would see the
 * fetch die on the cheap path and succeed on the expensive one,
 * which is the worst possible way for a cache to behave.
 */
app.use("*", conditionalGet);

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
    // Web Bot Auth census, claim-only: whether signers are showing up
    // at this door at all. Recorded verbatim, never verified here.
    const signatureAgent = c.req.header("Signature-Agent");
    if (signatureAgent) {
      signals.signatureAgent = signatureAgent;
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
app.route("/", developerRoutes);
app.route("/", deprecationRoutes);
app.route("/", siteMetaRoutes);
app.route("/", faviconRoutes);
app.route("/", statsRoutes);
app.route("/", corpusRoutes);
app.route("/", reportRoutes);
app.route("/", pulseRoutes);
app.route("/", registryRoutes);
app.route("/", freshSetRoutes);
app.route("/", okfRoutes);
app.route("/", defectRoutes);
app.route("/", noticeRoutes);
app.route("/", standingNoteRoutes);
app.route("/", trustRoutes);
app.route("/", agentAuthRoutes);
app.route("/", askRoutes);
app.route("/", passportRoutes);
app.route("/", profilesRoutes);
app.route("/", receiptVerifyRoutes);
app.route("/", practiceRoutes);
app.route("/", attestationRoutes);
app.route("/", criteriaRoutes);
app.route("/", conventionalRoutes);
app.route("/", didRoutes);
app.route("/", livenessRoutes);
app.route("/", fulfillmentLogRoutes);
app.route("/", claimsRoutes);
app.route("/", conformanceRoutes);
app.route("/", conformanceLandingRoutes);
app.route("/", corpusLandingRoutes);
app.route("/", doorsRoutes);
app.route("/", samplesRoutes);
app.route("/", preflightRoutes);
/* The buyer's half of the same ladder: one probe, then the stock
 * client's own selection replayed over what it served. */
app.route("/", beforeYouPayRoutes);
/* The signed half of the same reading, served forever and free. */
app.route("/", goodBuyerRoutes);
app.route("/", discoveryRoutes);
app.route("/", launchCheckRoutes);
app.route("/", bountyRoutes);
app.route("/", creditRoutes);
app.route("/", pricingRoutes);
app.route("/", railsRoutes);
app.route("/", privacyRoutes);
app.route("/", mandateRoutes);
app.route("/", statementRoutes);
app.route("/", onpageRoutes);
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
app.route("/", tillRoutes);
app.route("/", webmcpRoutes);
app.route("/", mcpMdRoutes);
app.route("/", trustListRoutes);
app.route("/", houseLedgerRoutes);
app.route("/", neighboursRoutes);
app.route("/", stackRoutes);
app.route("/", correctionsRoutes);
app.route("/", visitorsRoutes);
app.route("/", llmsRoutes);
app.route("/", agentsMdRoutes);
app.route("/", skillRoutes);
app.route("/", executionContractRoutes);
app.route("/", catalogRoutes);
app.route("/", openapiRoutes);
app.route("/", wellKnownRoutes);
app.route("/", coverageRoutes);
app.route("/", botAuthRoutes);
app.route("/", botAuthLandingRoutes);
app.route("/", buyRoutes);
app.route("/", commissionRoutes);
app.route("/", tabPoolRoutes);
app.route("/", anchorRoutes);
app.route("/", serviceAuditRoutes);
app.route("/", reconciliationRoutes);
app.route("/", namespaceSpecRoutes);
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

/**
 * A 404 THAT TELLS YOU WHERE TO GO INSTEAD.
 *
 * The status was already right — a real 404, never a 200 wearing an
 * app shell, which is the failure that teaches an agent every path on
 * a site exists. What it lacked was a way back: two URLs in a JSON
 * body, and nothing at all for a caller that asked in markdown.
 *
 * A lost agent is the reader here. It gets the whole set of doors —
 * the front door, the catalog, the contract, the sitemap — in the
 * dialect it asked for, so one wrong guess costs a redirect rather
 * than the session.
 */
function notFoundLinks(base: string): Array<{ url: string; what: string }> {
  return [
    { url: `${base}/llms.txt`, what: "the front door: what this store is, in full" },
    { url: `${base}/agents.md`, what: "the operational manual: how to transact here" },
    { url: `${base}/menu.json`, what: "the catalog: every item, price and input contract" },
    { url: `${base}/openapi.json`, what: "the OpenAPI 3.1 contract for every endpoint" },
    { url: `${base}/developers`, what: "the developer portal" },
    { url: `${base}/sitemap.xml`, what: "every public URL this store serves" },
  ];
}

/**
 * WRONG METHOD IS NOT NO SUCH DOOR, and until 2026-08-25 this store
 * said it was. Six public paths — /api/bell, /api/letter, /api/tip,
 * /api/request, /api/anchor, /api/refund — are POST doors. A GET to
 * any of them fell through to the 404 below, which states in plain
 * words that "this path was never a door." That sentence was false
 * about six of our own doors.
 *
 * It was not a private embarrassment. An external index probed all
 * six with GET, read the 404, and graded them failing. The grade was
 * wrong and OUR ANSWER IS WHY: a prober cannot distinguish a door it
 * knocked on incorrectly from a wall, unless the door says so. RFC
 * 9110 §15.5.6 already settles the mechanism — 405 MUST carry Allow
 * — and the house rule was already written: absent facts are STATED,
 * never omitted, and silence must be distinguishable from a pass.
 *
 * DERIVED FROM THE ROUTER, never a hand-kept list (AT_SCALE rule 1).
 * The seventh POST-only route somebody adds is covered the moment it
 * is registered, because this reads `app.routes` rather than a
 * constant that would need remembering. Today's other lesson pushed
 * the same way: a fix aimed at one instance leaves the bug next door
 * and waiting, so this is fixed at the shape.
 *
 * Literal paths only, stated rather than glossed: a parameterized
 * route (`/api/verify/:id`) is not matched here, so a wrong-method
 * request to one still answers 404. Every such route in the tree
 * serves GET today, so nothing is currently mislabelled by that gap
 * — but it IS a gap, and it belongs in the comment rather than in
 * nobody's memory.
 */
function methodsFor(path: string): string[] {
  const allowed = new Set<string>();
  for (const route of app.routes) {
    if (route.path !== path) continue;
    const method = route.method.toUpperCase();
    if (method === "ALL") continue;
    allowed.add(method);
  }
  return [...allowed].sort();
}

app.notFound((c) => {
  const base = c.env.STORE_BASE_URL;
  const allowed = methodsFor(c.req.path);
  if (allowed.length > 0 && !allowed.includes(c.req.method.toUpperCase())) {
    const allow = allowed.join(", ");
    c.header("Allow", allow);
    c.header("Vary", VARY_ACCEPT);
    return c.json(
      {
        error: `This door exists and takes ${allow}, not ${c.req.method.toUpperCase()}.`,
        allow: allowed,
        what_this_is_not:
          "Not a missing endpoint and not an outage. The path is served; the method was wrong.",
        menu_url: `${base}/menu.json`,
      },
      405,
    );
  }
  const links = notFoundLinks(base);
  const message = "That aisle doesn't exist.";
  if (prefersMarkdown(c.req.header("Accept"))) {
    const body = `# 404 — no such aisle\n\n${message} Nothing here has moved; this path was never a door.\n\n## Where to look next\n\n${links
      .map((link) => `- [${link.url}](${link.url}) — ${link.what}`)
      .join("\n")}\n`;
    return c.text(body, 404, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
    });
  }
  c.header("Vary", VARY_ACCEPT);
  return c.json(
    {
      error: `${message} The whole store fits on one page:`,
      menu_url: `${base}/menu.json`,
      front_door: `${base}/llms.txt`,
      // The same set the markdown body carries, so neither dialect
      // knows about a door the other does not.
      where_to_look_next: links,
    },
    404,
  );
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Deliberate responses (e.g. the Basic Auth challenge) pass through.
    return err.getResponse();
  }
  console.error("Something fell off a shelf:", err);

  /*
   * A 500 THAT NOBODY RECORDS IS A 500 THAT NEVER HAPPENED, and this
   * handler used to do exactly that: log to a console stream nobody
   * retains, then hand the visitor a polite apology. On 2026-08-26 an
   * outside checker reported paid doors serving 500s twice in one
   * evening and the store had nothing to show for it — no alert, no
   * counter, no row. The keeper was never paged for a buyer who was
   * turned away from a till.
   *
   * Both writes are deferred. A visitor already looking at an error
   * must not also wait on our bookkeeping about it, and an alert that
   * throws inside the error handler would replace a recorded 500 with
   * an unrecorded one.
   *
   * The dedupe key is ROUTE + ERROR CLASS, never the message: messages
   * carry ids and addresses, and keying on them would mint a fresh
   * alert row per incident — the precise failure the alert surface was
   * already rescued from once. The message rides in the detail, read
   * by a human and counted by nothing.
   */
  const routeClass = itemKeyFromPath(c.req.path);
  const errorName = err instanceof Error ? err.name : typeof err;
  try {
    c.executionCtx.waitUntil(
      Promise.allSettled([
        recordServerError(c.env, routeClass, errorName),
        sendAlert(c.env, {
          condition: "worker_health",
          key: `http500:${routeClass}:${errorName}`,
          detail: `500 on ${c.req.method} ${c.req.path}: ${errorName}: ${
            err instanceof Error ? err.message : String(err)
          }. A visitor was handed an error page here.`,
        }),
      ]),
    );
  } catch {
    // No execution context (direct invocation in a test). The record
    // is a nicety; returning the response is not.
  }

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
       * THE COLD EXPORT rides the same press as the ward round
       * (roadmap 0.11). Every signature, digest and OpenTimestamps
       * proof this store serves answers whether the record was
       * ALTERED. None of them answers whether it is still THERE, and
       * Bitcoin will confirm a corpus entry existed to a reader who no
       * longer has it.
       *
       * Weekly rather than hourly on purpose: the subjects are
       * append-mostly, and a copy taken more often than the data
       * changes buys nothing but write volume. Failure alerts rather
       * than passing quietly — a backup nobody noticed stopping is the
       * shape every backup story ends in.
       */
      ctx.waitUntil(
        import("@/services/cold-export").then(({ runColdExport }) =>
          runColdExport(env)
            .then((report) => {
              const short = report.bundles.filter((b) => b.truncated);
              if (short.length > 0) {
                return import("@/lib/alerts").then(({ sendAlert }) =>
                  sendAlert(env, {
                    condition: "worker_health",
                    key: "cold-export-truncated",
                    detail: `Cold export truncated. Prefixes past the per-pass cap: ${short
                      .map((b) => `${b.prefix} (${b.keys} carried)`)
                      .join(", ")}. A truncated bundle is a PARTIAL record and must never be restored as a whole one.`,
                  }),
                );
              }
              return undefined;
            })
            .catch((error: unknown) =>
              import("@/lib/alerts").then(({ sendAlert }) =>
                sendAlert(env, {
                  condition: "worker_health",
                  key: "cold-export-failed",
                  detail: `Cold export failed: ${String(error)}. The weekly copy of the irreplaceable prefixes did not complete. The anchor chain still proves integrity; nothing now proves availability.`,
                }),
              ),
            ),
        ),
      );
      /**
       * THE WARD ROUND rides the Sunday press: the weekly ecosystem
       * census (services/ward-round.ts) that keeps the outreach data
       * from going stale by nobody remembering a script. Failure
       * alerts rather than skipping silently — a stale round reads
       * exactly like a healthy ecosystem.
       */
      ctx.waitUntil(
        import("@/services/ward-round").then(({ runWardRound }) =>
          runWardRound(env)
            .then(
              /**
               * THE CORPUS SNAPSHOT rides the round that produced it:
               * the week's observations frozen into the signed,
               * hash-chained, OTS-stamped record the moment they
               * exist, so the corpus can never lag the instrument it
               * keeps. Idempotent per week — a re-fired cron re-takes
               * nothing.
               */
              () =>
                import("@/services/corpus").then(({ takeCorpusSnapshot }) =>
                  takeCorpusSnapshot(env).then(
                    () => undefined,
                    (error) =>
                      sendAlert(env, {
                        condition: "worker_health",
                        detail: `Corpus snapshot failed: ${String(error)}. The round itself succeeded; the week's observations are in KV and the snapshot can be re-taken next pass.`,
                      }),
                  ),
                ),
              (error) =>
                sendAlert(env, {
                  condition: "worker_health",
                  detail: `Ward round failed: ${String(error)}`,
                }),
            ),
        ),
      );
      ctx.waitUntil(compileDigest(env));
      // Weekly Gazette self-drafting retired 2026-08-05 (keeper's
      // ruling: duplicative of the Almanac, standing maintenance the
      // rack never earned). The machinery stays; nothing schedules it.
    }
    /**
     * THE LONG WALK rides every hourly firing (2026-08-19): start a
     * new week's roster, walk one batch, or idle. Failure alerts —
     * a walk that quietly stops reads exactly like a finished one,
     * and Sunday would assemble a short week without knowing it.
     */
    ctx.waitUntil(
      import("@/services/long-walk").then(({ longWalkPass }) =>
        longWalkPass(env).then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Long walk pass failed: ${String(error)}. The week's walk resumes on the next hourly firing; a repeat means the roster read or the state write is broken.`,
            }),
        ),
      ),
    );
    /**
     * MACHINE 1's resolver rides the same hourly firing (#56): every
     * open settlement_unknown row gets the chain asked where a chain
     * can answer, on a per-row cursor. Bounded per pass; a failure
     * keeps rows open rather than answering, and the age-out inside
     * the service is the only clock that closes an unanswerable row.
     */
    ctx.waitUntil(
      import("@/services/settlement-unknown").then(
        ({ resolveSettlementUnknowns }) =>
          resolveSettlementUnknowns(env).then(
            () => undefined,
            (error) =>
              sendAlert(env, {
                condition: "worker_health",
                detail: `settlement_unknown resolver pass failed: ${String(error)}. Open rows stay open; a repeat means the row list or the RPC path is broken.`,
              }),
          ),
      ),
    );
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
    // The conformance watch rides the same rounds and paces itself
    // daily (23-hour floor per record) — a failed sweep alerts for
    // the same reason: a skipped day becomes a days_unchecked row in
    // a customer's history. Our gap, on their record.
    ctx.waitUntil(
      sweepConformanceWatches(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Conformance watch sweep failed: ${String(error)}`,
          }),
      ),
    );
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
     * THE GLANCE, WRITTEN WHERE THE WALKS ARE ALREADY PAID FOR. The
     * keeper's desk used to recompute seventeen loads on every open,
     * three of them heavy, before showing him a single number. Now
     * the five he actually opens it for are read once an hour here
     * and stored as one blob; /admin reads one key and paints.
     *
     * Never blocks and never pages: a glance that fails to write
     * leaves the previous one standing with its own `computed_at`
     * visible, and the desk says how old it is. A stale reading that
     * announces its age is honest; the failure mode worth alerting on
     * would be a number that looks current and is not, which is
     * exactly what this shape prevents.
     */
    ctx.waitUntil(
      import("@/services/glance").then(({ writeGlance }) =>
        writeGlance(env).catch(() => undefined),
      ),
    );
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
     *
     * BOTH EVM RAILS, one read of the certificate drawer between them
     * (parity build, 2026-08-21): the drawer's answer is the same for
     * Base and Polygon, and buying that 2,000-key scan twice an hour
     * is a real line on a real invoice for one fact.
     */
    ctx.waitUntil(
      runEvmReconciliations(env).then(
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
    /*
     * The delivery audit above catches money-taken-no-goods within
     * minutes. This one catches the slower class it cannot see: a
     * queue order whose PROMISED WINDOW passed. The card by the door
     * says a missed window earns the money back and that the buyer
     * will not have to argue for it — and until now the only thing
     * enforcing that was the keeper remembering.
     */
    ctx.waitUntil(
      runRefundWindowAudit(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Refund-window audit failed: ${String(error)}`,
          }),
      ),
    );
    /**
     * THE BENCH INDEX REBUILD. The bench counts open labor off an
     * index so it never has to walk every order the store has ever
     * taken — a walk that would truncate on success and silently stop
     * the ceiling from binding. Writes at creation and deletes at
     * completion keep the index current; this pass is what reconciles
     * the direction that matters, an order that never got an entry and
     * would therefore make the bench UNDERCOUNT.
     *
     * It also sets the marker that switches the bench off its fallback
     * walk, so a fresh deploy converges without anybody doing anything.
     */
    ctx.waitUntil(
      rebuildOpenLaborIndex(env).then(
        () => undefined,
        (error) =>
          sendAlert(env, {
            condition: "worker_health",
            detail: `Open-labor index rebuild failed: ${String(error)}. The bench may undercount promised work until this succeeds.`,
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
    // The patron anchors' sweep rides the same hour: resubmit what a
    // down calendar refused, upgrade what Bitcoin has since confirmed.
    // Bounded per pass; completing delivery, not monitoring (rule 23a).
    ctx.waitUntil(
      import("@/services/patron-anchors").then(({ sweepPatronAnchors }) =>
        sweepPatronAnchors(env).then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Patron anchor sweep failed: ${String(error)}`,
            }),
        ),
      ),
    );
    // The ecosystem reports' anchors ride the same hour, same shape:
    // submit any report body not yet stamped, upgrade what Bitcoin has
    // since confirmed. Bounded by the shelf — the report list is
    // compiled in, so this can never grow into a scan.
    ctx.waitUntil(
      import("@/services/report-anchors").then(({ sweepReportAnchors }) =>
        sweepReportAnchors(env).then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Report anchor sweep failed: ${String(error)}`,
            }),
        ),
      ),
    );
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
    /**
     * THE RAIL SPLIT, walked here so the storefront never walks it.
     * The front of the store prints how many organic sales came in on
     * Base and how many on Solana; the answer lives on the
     * certificates, and reading every certificate is not something a
     * page render gets to do. This writes one key an hour. A failure
     * leaves the last snapshot standing and the storefront prints the
     * count without the split — stale-then-absent, never invented.
     */
    ctx.waitUntil(
      import("@/services/rails").then(({ refreshRailSplit }) =>
        refreshRailSplit(env).then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Rail split refresh failed: ${String(error)}`,
            }),
        ),
      ),
    );
    /**
     * THE BOOKS INVARIANT SWEEP: the published identities, re-checked
     * against the production counters every hour. Every books defect
     * in this store's history was cross-substrate drift found by the
     * keeper reading his own pages; this is the machine doing that
     * reading on the clock. A sweep that cannot RUN is itself worth a
     * page — an invariant checker that fails silently is a smoke
     * detector with the battery out.
     */
    ctx.waitUntil(
      import("@/services/books-invariants").then(({ sweepBooksInvariants }) =>
        sweepBooksInvariants(env).then(
          () => undefined,
          (error) =>
            sendAlert(env, {
              condition: "worker_health",
              detail: `Books invariant sweep failed to run: ${String(error)}`,
            }),
        ),
      ),
    );
  },
};

// Cloudflare Workers requires a default export for its fetch/scheduled handlers.
export default worker;

/**
 * The Hono app itself, exported for exactly one consumer: the
 * no-orphan-capability guard in test/, which walks app.routes and
 * asserts every public door is named on a surface an agent reads.
 * Production imports the default worker; nothing else should touch
 * this.
 */
export { app };
