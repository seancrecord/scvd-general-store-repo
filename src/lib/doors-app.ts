/**
 * THE DOORS — a Worker that answers one question: what does this door
 * cost? (2026-09-05, the x402-list night read.)
 *
 * This module builds the app; src/doors.ts is the entry and exports the
 * handler and nothing else — workerd reads every named export of an
 * entry as a handler or a Durable Object class, so the constants and
 * the app the tests need live here.
 *
 * WHY A SECOND WORKER. The store is one 3.5 MB script, and a cold
 * isolate pays for all of it before a line runs: 430 to 627 ms on the
 * first knock, measured from outside the same hour a Worker with
 * nothing in it paid 5 ms (research/x402-list-latency-2026-09-05.md).
 * The directory that scores this store knocks on every paid door at
 * once every fifteen minutes; on a quiet colo that burst woke nine
 * cold isolates and the checks read 1,000 ms and more for eight hours
 * with no deploy inside them. The 402 itself costs 2 to 5 ms. So the
 * 402 moves into a script a fifth the size, and the store keeps
 * everything else.
 *
 * WHAT IT SERVES. A zone route sends `scvd.store/api/buy/*` here (it
 * takes precedence over the store's custom domain on the same
 * hostname; doors/wrangler.jsonc). For a knock with no payment on it,
 * this Worker runs the same edge (src/lib/edge.ts) and the same door
 * checks (src/routes/door-checks.ts) the store runs, from the same
 * two lists, and the gate writes the 402 exactly as it would have in
 * the store: same shelf, same signing key, same KV. Nothing here
 * delivers.
 *
 * WHAT IT HANDS TO THE STORE, untouched, over the service binding:
 *   - any knock carrying a payment header (v2 or the v1 alias, read by
 *     the gate's own function so the two never disagree) — money moves
 *     in the store and only there, and a request that has paid must
 *     never meet the gate twice;
 *   - any knock that survives every check without a 402, which is a
 *     knock the store would have delivered on — it cannot happen
 *     without a payment, and if it ever does the store still answers;
 *   - every knock when this Worker is NOT READY: no STORE binding, no
 *     signing key, no pay-to address. A doors Worker deployed before
 *     its secrets are set is therefore a pass-through, not an outage,
 *     and the first deploy is safe by construction.
 *
 * WHAT IT REFUSES TO BE. Not a cache: every 402 is minted fresh by the
 * same code. Not a second opinion: no check is written here. Not a
 * proxy for the store's pages: the route is `/api/buy/*` and the
 * fallback handler exists only so a widened route can never 404 a
 * page the store serves.
 *
 * test/doors-parity.spec.ts walks every door through both Workers and
 * holds the answers byte-equal, the router sequences equal, and the
 * forwarding exact. scripts/doors-live.mjs does the same against the
 * live pair before the route is flipped.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { edgeMiddleware, edgeOnError } from "@/lib/edge";
import { paymentHeaderOf } from "@/lib/payment-gate";
import { doorChecks } from "@/routes/door-checks";
import type { Env, HonoEnv } from "@/types";

/** Everything the 402 needs that only a secret or a binding can give. */
export function doorsReady(env: Env): boolean {
  return (
    typeof env.STORE?.fetch === "function" &&
    typeof env.SIGNING_KEY === "string" &&
    env.SIGNING_KEY.length > 0 &&
    typeof env.PAY_TO_ADDRESS === "string" &&
    env.PAY_TO_ADDRESS.length > 0
  );
}

/** Why a knock went to the store; on the response so a reader can tell. */
export const HANDED_HEADER = "X-Scvd-Doors";

/**
 * A knock's body, as it arrived. A check that reads a body consumes
 * the request's stream, and a knock handed to the store after that
 * would arrive empty; so a copy is taken before any check runs (only
 * when there is a body to copy) and the hand-over sends that. Keyed
 * by the request itself, so nothing here outlives it.
 */
const pristine = new WeakMap<Request, Request>();

async function handToStore(
  c: Parameters<MiddlewareHandler<HonoEnv>>[0],
  reason: "paid" | "not-ready" | "passed" | "elsewhere",
): Promise<Response> {
  const store = c.env.STORE;
  if (!store || typeof store.fetch !== "function") {
    // Not ready and nowhere to hand the knock: the one answer this
    // Worker writes itself, and it names the defect.
    return new Response(
      JSON.stringify({
        error: "The doors are not bound to the store.",
        detail:
          "This Worker answers the unpaid knock on /api/buy/* and hands everything else to the store over a service binding named STORE. The binding is absent; see doors/wrangler.jsonc.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Retry-After": "60",
          [HANDED_HEADER]: `unbound; ${reason}`,
        },
      },
    );
  }
  const answer = await store.fetch(pristine.get(c.req.raw) ?? c.req.raw);
  const headers = new Headers(answer.headers);
  headers.set(HANDED_HEADER, reason);
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers });
}

/**
 * Before the edge, before every check: a knock that carries a payment,
 * or arrives while this Worker is not ready, goes to the store as it
 * came. Registered on "*" so a route pattern wider than `/api/buy/*`
 * changes nothing: the store answers what the store always answered.
 */
export const handOverFirst: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!doorsReady(c.env)) return handToStore(c, "not-ready");
  if (paymentHeaderOf(c)) return handToStore(c, "paid");
  if (c.req.raw.body !== null && !c.req.raw.bodyUsed) {
    pristine.set(c.req.raw, c.req.raw.clone());
  }
  await next();
};

/** A knock that survived every check has paid; the store delivers. */
const handOverPassed: MiddlewareHandler<HonoEnv> = (c) => handToStore(c, "passed");

/**
 * Anything that is not a door at all — on the store's own hostname,
 * the store answers it, so a route pattern wider than `/api/buy/*`
 * changes nothing. On any other hostname (this Worker also answers at
 * its workers.dev name, so the keeper can read it beside the store
 * before the route exists) a page is refused, not proxied: the store
 * shut its own workers.dev side door on purpose (wrangler.jsonc,
 * "one host, said out loud") so no search engine files the same bytes
 * under two names, and the doors must not reopen it.
 */
const handOverElsewhere: MiddlewareHandler<HonoEnv> = async (c) => {
  const here = new URL(c.req.url).host;
  const home = new URL(c.env.STORE_BASE_URL).host;
  if (here !== home) {
    return c.json(
      {
        error: "Not a door.",
        detail: `This Worker answers the paid doors under /api/buy/ and nothing else. The store is at ${c.env.STORE_BASE_URL}.`,
      },
      404,
      { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", [HANDED_HEADER]: "refused; not the store's host" },
    );
  }
  return handToStore(c, "elsewhere");
};

/*
 * STRICT, LIKE THE STORE. The store's root app is a strict Hono; only
 * routes/buy.ts turns strict off, and a sub-app's setting does not
 * survive being mounted. So `/api/buy/spot_check/` reaches the store's
 * gate with the slash still on `c.req.path`, the item lookup inside the
 * 402 body misses, and the store answers a thinner 402 than it does
 * without the slash. Found by the parity test on the first run
 * (2026-09-05): a non-strict doors app trimmed the slash and answered
 * the fuller body. Whether the store should be fixed is a question for
 * routes/buy.ts; the doors' job is to answer as the store answers.
 */
export const doors = new Hono<HonoEnv>();
doors.use("*", handOverFirst);
for (const middleware of edgeMiddleware) {
  doors.use("*", middleware);
}
for (const check of doorChecks) {
  doors.use("/api/buy/*", check);
}
doors.all("/api/buy/*", handOverPassed);
doors.all("*", handOverElsewhere);
doors.onError(edgeOnError);
