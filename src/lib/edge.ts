import { VARY_ACCEPT } from "@/lib/accept";
import type { EventSignals } from "@/lib/metrics";
import {
  itemKeyFromPath,
  recordPorchVisit,
  recordServerError,
} from "@/lib/metrics";
import { porchSurface } from "@/lib/porch-surface";
import { STORE_HEADER } from "@/lib/identity";
import { conditionalGet } from "@/lib/conditional-get";
import { scriptFence } from "@/lib/csp";
import { discoveryCors } from "@/lib/cors";
import type { HonoEnv } from "@/types";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { sendAlert } from "@/lib/alerts";

/**
 * THE EDGE — what every answer from scvd.store passes through, in
 * order, before and after the route that wrote it (2026-09-05, the
 * doors Worker).
 *
 * These middlewares lived inline in src/index.ts. They moved here,
 * unchanged and in the same order, because a second Worker now
 * answers the unpaid knock on `/api/buy/*` (src/doors.ts) and a knock
 * answered there must leave with the same headers, the same redirects,
 * the same compression and the same log line it would have had from
 * the store. One list, `edgeMiddleware`, registered by both entries;
 * test/doors-parity.spec.ts walks a door through both routers and
 * holds the sequence equal. Each block keeps the note it was written
 * with, dates and all.
 */

/**
 * HTTPS, ANSWERED IN CODE rather than trusted to a dashboard toggle
 * (2026-08-04: an SEO crawl found http:// serving 200s beside
 * https:// — two sites, duplicate titles, split signals, and a "not
 * secure" tag on one of them). A plain-HTTP request gets one 301 and
 * nothing else; every HTTPS response carries HSTS so returning
 * browsers stop asking.
 */
export const httpsOnly: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
};

/**
 * ONE URL PER PAGE (2026-09-02, from the Search Console pre-read).
 * `/what/` answered a JSON 404 while `/what` answered the page, and
 * the catalog router's `strict: false` served `/menu/x/` and `/menu/x`
 * as two URLs with one body. A crawler that meets either reports a
 * duplicate or a dead link under our name. So a GET or HEAD for a
 * human path with a trailing slash is one 301 to the path without
 * it, query string kept. `/api/` is left alone on purpose: a machine
 * caller gets its answer (or its 410) at the URL it used, never a
 * redirect it did not ask for.
 *
 * A TRAILING DOT IS THE SAME DEFECT WEARING PUNCTUATION (2026-09-03,
 * the first Cloudflare crawl reading). The guide ends sentences with
 * a URL and a full stop ("…at https://scvd.store/criteria."), and
 * some crawlers keep the stop: the 4xx list carried `/criteria.`,
 * `/api/preflight/v1.` and `/api/buy/spot_check.`. No door here ends
 * in a dot, so a GET or HEAD for one is a 301 to the path without it,
 * `/api/` included this time: a machine caller never sends a
 * trailing dot, only a crawler reading prose does, and the redirect
 * lands it on the door the sentence meant.
 */
/**
 * THE ISOLATE SAYS WHETHER IT WAS COLD (2026-09-03, the x402-list p95
 * read). The directory's thirty-day p95 on our 402 sat at 1308ms
 * against a median near 400, and nothing on the wire said which
 * knocks were a cold isolate and which were a warm one doing slow
 * work. Now every response carries a Server-Timing line: `isolate`
 * with desc cold on the first request this isolate ever served and
 * warm after, plus `age`, the seconds since it was born, and `req`,
 * the wall time this request spent in the Worker. A curl -i on any
 * door reads it; the Workers Logs (observability, wrangler.jsonc)
 * keep the same per-invocation timing on the dashboard.
 *
 * Read `req` for what it is: Workers freeze the clock during pure
 * compute and advance it at I/O, so the figure is the waits (KV, the
 * facilitator, the chain), not the CPU. The cold marker is the exact
 * fact; the number is the honest floor.
 */
/*
 * Born on the FIRST REQUEST, not at the top of the script: the Workers
 * clock reads zero during script initialisation, so a Date.now() taken
 * here printed the epoch as the isolate's age (found on the live 402
 * within minutes of deploying it, 2026-09-03). The age is therefore
 * seconds since this isolate first answered, which is the figure
 * anyone reading the header wanted anyway.
 */
let isolateBornAt: number | null = null;
let requestsServedByThisIsolate = 0;

export const isolateTiming: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  const method = c.req.method;
  const readOnly = method === "GET" || method === "HEAD";
  // The MCP door answers its own trailing slash with a 308 so a
  // POSTed initialize stays a POST (routes/mcp.ts); a GET gets the
  // same 308 for the same reason, and this middleware stays out.
  const mcp = url.pathname.startsWith("/mcp");
  if (readOnly && !mcp && url.pathname.length > 1 && url.pathname.endsWith(".")) {
    url.pathname = url.pathname.replace(/[./]+$/, "") || "/";
    return c.redirect(url.toString(), 301);
  }
  if (
    readOnly &&
    !mcp &&
    url.pathname.length > 1 &&
    url.pathname.endsWith("/") &&
    !url.pathname.startsWith("/api/")
  ) {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return c.redirect(url.toString(), 301);
  }
  const coldIsolate = requestsServedByThisIsolate === 0;
  requestsServedByThisIsolate += 1;
  const startedAt = Date.now();
  if (isolateBornAt === null) isolateBornAt = startedAt;
  await next();
  /*
   * A 402 IS NOT A PAGE. Every paid door answers 402 to a plain GET
   * and every one is linked from the menu, so Search Console filed
   * them all under "blocked due to other 4xx" (pre-read, 2026-09-02).
   * The challenge is correct; indexing it is not. One header on every
   * 402, wherever it was minted, and the crawler moves on. Agents
   * never read it.
   */
  if (c.res.status === 402) {
    c.res.headers.set("X-Robots-Tag", "noindex");
    /*
     * AND IT LEAVES COMPRESSED (2026-09-03, the x402-list p95 read).
     * Cloudflare brotli-compresses every other response this store
     * sends, the 404 JSON included, and passes the 402 through as is:
     * 12.6 KB of body behind 7.5 KB of headers, which spills past a
     * fresh connection's first congestion window and costs every
     * probe a second round trip for a document that packs to a
     * quarter of that. So when the caller said it takes gzip, the
     * runtime encodes the body on the way out: setting
     * Content-Encoding under the default encodeBody "automatic" is
     * the runtime's own instruction to compress, and the length is
     * dropped because the encoded length is not ours to know. A
     * caller that did not ask gets the same bytes it always got. The
     * PAYMENT-REQUIRED header, the document an x402 client actually
     * parses, is untouched either way.
     */
    const accepts = c.req.header("Accept-Encoding") ?? "";
    const type = c.res.headers.get("Content-Type") ?? "";
    if (
      /\bgzip\b(?!\s*;\s*q=0(?:\.0+)?\b)/i.test(accepts) &&
      !c.res.headers.has("Content-Encoding") &&
      type.startsWith("application/json")
    ) {
      const headers = new Headers(c.res.headers);
      headers.set("Content-Encoding", "gzip");
      headers.delete("Content-Length");
      c.res = new Response(c.res.body, { status: c.res.status, headers });
    }
  }
  const isolateAgeSeconds = Math.round((startedAt - isolateBornAt) / 1000);
  const requestWallMs = Date.now() - startedAt;
  c.res.headers.set(
    "Server-Timing",
    `isolate;desc=${coldIsolate ? "cold" : "warm"}, age;dur=${isolateAgeSeconds}, req;dur=${requestWallMs}`,
  );
  /*
   * AND THE LOG SAYS THE SAME (2026-09-05, the x402-list night read).
   * The header answers whoever knocked; it says nothing to the keeper
   * about the knocks he did not make. The night of 09-04/05 was eight
   * hours of 1,000ms+ checks with no deploy inside them, and the only
   * way to read what the prober's own requests met was a per-request
   * line in Workers Logs (observability, wrangler.jsonc) that carries
   * the cold marker. One JSON line per request, so the Logs filter
   * `cold:true` or `ua:x402` finds the exact knocks. Never awaited,
   * never thrown: a lost log line is a smaller lie than a slow door
   * (test/telemetry-never-costs-the-answer.spec.ts). The query string
   * stays out; it can carry a buyer's payload.
   */
  try {
    console.log(
      JSON.stringify({
        knock: 1,
        cold: coldIsolate,
        age: isolateAgeSeconds,
        req: requestWallMs,
        method,
        path: url.pathname,
        status: c.res.status,
        ua: (c.req.header("User-Agent") ?? "").slice(0, 120),
      }),
    );
  } catch {
    // The log is bookkeeping; the answer has already left.
  }
  /*
   * AND THE CACHE IS TOLD. Every negotiated route reads the Accept
   * header and, since the same day, the User-Agent; forty-five of
   * them set Vary themselves and the rest did not. A CDN that is not
   * told a response varied on the User-Agent hands a crawler the
   * agent's JSON, which is the exact defect this fixes. So any
   * text or JSON response leaves with the full Vary, merged into
   * whatever the route already said (a payment route's PAYMENT_VARY
   * stays), and a route that forgets is covered.
   */
  const type = c.res.headers.get("Content-Type") ?? "";
  if (/^(text\/|application\/json)/.test(type)) {
    const have = new Set(
      (c.res.headers.get("Vary") ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    for (const field of VARY_ACCEPT.split(",")) have.add(field.trim());
    c.res.headers.set("Vary", [...have].join(", "));
  }
};


// One middleware, one explicit boundary: CORS on the public
// discovery surface and the MCP door, nothing stateful, nothing
// paid. The list and its reasoning live in lib/cors.ts.
/*
 * AFTER the cross-origin middleware, deliberately. Hono runs
 * post-next code in reverse registration order, so this builds the
 * 304 first and discoveryCors then puts its header on it — a
 * revalidating browser that got no ACAO on the 304 would see the
 * fetch die on the cheap path and succeed on the expensive one,
 * which is the worst possible way for a cache to behave.
 */

export const houseHeaders: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
};

export const porchVisit: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
};

/**
 * The order the store has always answered in: the redirect and HSTS
 * first, the isolate's own clock around everything, CORS for the
 * discovery surfaces, conditional GETs, the house headers, the porch
 * visit last. A middleware added here reaches both Workers; one added
 * to an entry file instead reaches one, and the parity test says so.
 */
export const edgeMiddleware: readonly MiddlewareHandler<HonoEnv>[] = [
  httpsOnly,
  isolateTiming,
  discoveryCors,
  conditionalGet,
  // The script fence on every HTML answer (lib/csp.ts says why).
  scriptFence,
  houseHeaders,
  porchVisit,
];

export const edgeOnError: ErrorHandler<HonoEnv> = (err, c) => {
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
};
