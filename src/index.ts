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
  faviconRoutes,
  guestbookRoutes,
  letterRoutes,
  llmsRoutes,
  luckyRoutes,
  mcpRoutes,
  openapiRoutes,
  patronageRoutes,
  phantomRoutes,
  porchRoutes,
  requestRoutes,
  refundRoutes,
  schemaRoutes,
  siteMetaRoutes,
  skillRoutes,
  statsRoutes,
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
import { compileDigest } from "@/services/digest";
import { runHealthChecks } from "@/services/health";
import { sweepPhantomChecks } from "@/services/phantom";
import { assembleDraft } from "@/services/gazette-weekly";
import type { Env, HonoEnv } from "@/types";

/**
 * Sean-Claude Van Damme's General Store, the whole shop, one Worker.
 * Routes live in src/routes/, shop data in src/store/, KV logic in
 * src/services/, shared plumbing in src/lib/.
 */
const app = new Hono<HonoEnv>();

// house tradition
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-House-Rule", "Argue properly. --7");
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
  ["/api/treat", "treat"],
  ["/stats", "stats"],
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
app.route("/", schemaRoutes);
app.route("/", mcpRoutes);
app.route("/", porchRoutes);
app.route("/", whatRoutes);
app.route("/", llmsRoutes);
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
    },
    500,
  );
});

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  // Hourly: phantom walk + the health rounds. Sundays 7am ET: the digest.
  scheduled: async (event, env, ctx) => {
    if (event.cron === "0 11 * * SUN") {
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
    ctx.waitUntil(runHealthChecks(env));
  },
};

// Cloudflare Workers requires a default export for its fetch/scheduled handlers.
export default worker;
