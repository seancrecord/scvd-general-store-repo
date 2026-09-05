/**
 * THE DOOR CHECKS — every refusal a paid door can give before money
 * moves, in the order it gives them (2026-09-05, the doors Worker).
 *
 * These middlewares were written in routes/buy.ts and ran there
 * for a year: unknown items, retired items, empty shelves, a shuttered
 * counter, a full queue, malformed inputs, then the payment gate that
 * writes the 402. They moved here, unchanged, because a second Worker
 * now answers the unpaid knock on `/api/buy/*` (src/doors.ts) and it
 * must give the same answer the store gives, byte for byte. The only
 * way to promise that is to run the same functions in the same order
 * from one list, so `doorChecks` below is that list and both Workers
 * register it. Nothing in this file delivers: fulfillment stays in
 * routes/buy.ts, behind the gate, in the store alone.
 *
 * test/doors-parity.spec.ts holds both Workers to the list.
 */
import type { MiddlewareHandler } from "hono";
import { gateSignals, paymentGate } from "@/lib/payment-gate";
import { buyInputSchema, missingRequiredInputs } from "@/lib/bazaar-discovery";
import { itemKeyFromPath, recordPaymentDecline } from "@/lib/metrics";
import { waitlistHowToJoin } from "@/routes/requests";
import {
  PAYMENT_VARY,
} from "@/lib/payments";
/**
 * ONE PRE-PAYMENT LAW AND ONE ARGUMENT MAP, shared with the MCP door.
 * Everything this file used to spell out per item — the URL law, the
 * hash shapes, the address shapes, the caps — lives there now, so a
 * buyer gets the same refusal and the same goods whichever door they
 * came through.
 */
import {
  checkPurchaseArgs,
  queryArgs,
} from "@/lib/purchase-args";
import { stockedShelfCount } from "@/services/stock";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { capacityVerdict } from "@/services/queue-capacity";
import { remainingInventory } from "@/services/orders";
import { recordFailedItem } from "@/services/requests";
import { getMenuItem, VOICE } from "@/store";
import { getRetiredItem } from "@/store/retired";
import type { HonoEnv } from "@/types";

export function buyRequestPath(c: { req: { path: string } }): string {
  const path = c.req.path;
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
}

export function buyItemId(c: { req: { path: string } }): string {
  return buyRequestPath(c).replace(/^\/api\/buy\//, "");
}

/** Paid material must never sit in a shared cache. */
export const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", PAYMENT_VARY);
};

/**
 * Standard-dialect retirement headers. `@` date form is RFC 9745;
 * Sunset is an HTTP-date per RFC 8594. Both name the same moment the
 * body already names — one fact, three renderings, no second source
 * of truth.
 */
export function retirementHeaders(
  base: string,
  retired: { retired_on: string; folded_into?: string },
): Record<string, string> {
  const at = new Date(`${retired.retired_on}T00:00:00Z`);
  const headers: Record<string, string> = {
    Deprecation: `@${Math.floor(at.getTime() / 1000)}`,
    Sunset: at.toUTCString(),
  };
  if (retired.folded_into) {
    headers["Link"] =
      `<${base}/api/buy/${retired.folded_into}>; rel="successor-version"`;
  }
  return headers;
}

/**
 * Turns away retired items, unknown items (logged as market research)
 * and sold-out shelves.
 *
 * ALL THREE REFUSE BEFORE ANY MONEY MOVES and all three shipped
 * without `code` or `charged` — this whole middleware was missed by
 * the sweep that coded the other forty-two, because not one of its
 * three sentences contains the words "nothing charged". A boundary
 * drawn by a grep, not by a decision: a buyer turned away at the
 * shelf needs the same fact as one turned away at the parameter
 * check, and 404-with-no-code left a client nothing to branch on but
 * a status three other things also use.
 */
export const shelfCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (!item) {
    // A retired shelf answers with what happened — an agent that
    // remembered the old menu should learn the new one, not conclude
    // the store is broken. 410, deliberately: gone, on purpose.
    const retired = getRetiredItem(itemId);
    if (retired) {
      return c.json(
        {
          error: `${retired.name} retired ${retired.retired_on}. ${retired.note}`,
          code: "retired",
          charged: false,
          ...(retired.folded_into
            ? {
                folded_into: retired.folded_into,
                buy_url: `${c.env.STORE_BASE_URL}/api/buy/${retired.folded_into}`,
              }
            : {}),
          menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
          certificates_note:
            "Certificates issued under this item verify forever; retirement changes the shelf, not the record.",
        },
        410,
        /*
         * THE TOMBSTONE IN A DIALECT PROBERS ALREADY SPEAK (2026-08-24).
         *
         * The JSON body above is good and nobody has to read it. A
         * directory that probed this door before we closed it sees
         * only a status code, and "not 402" reads as DEGRADED unless
         * something tells it otherwise — which is how a listing we
         * submitted on 2026-08-18 came to report this store as broken
         * over an item deliberately retired on 2026-08-20.
         *
         * So the retirement is restated in standard headers rather
         * than only in our own shape: RFC 9745 Deprecation, RFC 8594
         * Sunset, and a successor Link. A prober honouring any of the
         * three can delist instead of alarming, without knowing
         * anything about this store.
         *
         * It does not fix the stale listing — only re-submitting does
         * that. It stops the NEXT directory from having to be told.
         */
        retirementHeaders(c.env.STORE_BASE_URL, retired),
      );
    }
    await recordFailedItem(c.env, itemId);
    return c.json(
      {
        error: VOICE.unknownItem,
        code: "unknown_item",
        charged: false,
        menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
        request_url: `${c.env.STORE_BASE_URL}/api/request`,
      },
      404,
    );
  }
  const remaining = await remainingInventory(c.env, item);
  if (remaining !== null && remaining <= 0) {
    return c.json(
      {
        error: VOICE.soldOut,
        code: "sold_out",
        charged: false,
        // The URL and the method, from the door's own block: a
        // pointer that only names where, not how, was a dead end.
        ...waitlistHowToJoin(c.env.STORE_BASE_URL, item.id),
      },
      409,
    );
  }
  await next();
};

/**
 * THE PROBE RULE, 2026-07-26, from two outside witnesses on the same
 * day: Bazaar had registered 14 of our 21 items, and x402scout's
 * probe found 3 valid endpoints out of 6 submitted. The seven Bazaar
 * missed and the three x402scout rejected are the same seven — every
 * route that refuses BEFORE the payment gate quotes a price.
 *
 * The refusals are right and they stay. "No summary, no charge" is
 * the honest order of business. But an indexer arrives with no
 * parameters and no signature, gets a 400, and concludes we are not
 * an x402 endpoint at all — so the items best suited to being needed
 * (the anchor, the phantom check) are the ones nobody can find. In
 * July that partition was total: registered items took 132-864
 * challenges each, unregistered ones 0-11, no overlap.
 *
 * So: a request with no PAYMENT-SIGNATURE is asking the price, not
 * placing an order. It gets the 402, with the requirement stated in
 * the challenge. A request that carries a signature is buying, and
 * every guard below applies exactly as before — refusing before
 * settlement, no money moved, the promise unchanged.
 */
export function isBuying(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): boolean {
  return Boolean(
    c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT"),
  );
}


/**
 * The shutter: no money taken for labor nobody is present to do.
 * Runs BEFORE the payment gate, so an away keeper can never cost a
 * buyer anything. Machine shelves and stocked shelves pass through.
 */
export const shutterCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (item && (await requiresPresentKeeper(c.env, item))) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "upstream_unavailable",
          error:
            "The human-labor shelf is shuttered, the keeper is away from the counter. No charge taken; the promise stays honest. The machine shelves never close.",
          machine_shelves: `${c.env.STORE_BASE_URL}/menu.json`,
          leave_a_request: `POST ${c.env.STORE_BASE_URL}/api/request \u2014 read when the keeper is back.`,
        },
        503,
      );
    }
  }
  await next();
};

/**
 * THE BENCH, which is the other half of the shutter's own promise.
 *
 * The shutter asks "is the keeper there." This asks "how much has he
 * already been sold." Both have to be true for "we never promise labor
 * nobody is there to do" to mean anything, and only the first was ever
 * checked — a keeper seen an hour ago could be sold ten weeks of work
 * in an afternoon, because weekly_inventory bounds the RATE of sales
 * and nothing bounded the LEVEL of the backlog.
 *
 * Before the payment gate, like the shutter: a capacity refusal after
 * settlement is money taken to be told no.
 */
export const capacityCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const item = getMenuItem(buyItemId(c));
  if (item) {
    const verdict = await capacityVerdict(c.env, item);
    if (!verdict.ok) {
      return c.json(
        {
          error: verdict.reason,
          open_orders: verdict.open,
          cap: verdict.cap,
          machine_shelves: `${c.env.STORE_BASE_URL}/menu.json`,
          leave_a_request: `POST ${c.env.STORE_BASE_URL}/api/request \u2014 free, and read by a human.`,
        },
        503,
      );
    }
  }
  await next();
};

/**
 * Sold out, honestly: a bare stocked shelf issues no 402 nobody can
 * settle. Real scarcity, checkable, restocked by the keeper's hands.
 */
export const stockCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = buyItemId(c);
  const item = getMenuItem(itemId);
  if (item?.stocked) {
    const count = await stockedShelfCount(c.env, item);
    if (count === 0) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "already_done",
          error: `Sold out, honestly. Every unit of "${item.name}" is keeper-made ahead of time, and the shelf is bare until he stocks it again. No charge, no waitlist theater.`,
          fulfillment_class: "stocked",
          stock: 0,
          menu_url: `${c.env.STORE_BASE_URL}/menu.json`,
        },
        409,
      );
    }
  }
  await next();
};

/**
 * THE WALLET THAT OPENED AND WAS NEVER COUNTED (2026-09-04).
 *
 * Every pre-gate check below refuses a SIGNED request that lacks its
 * input with a 400 — before the payment gate, so no money moves,
 * which is right. But that path booked nothing. A buyer who read the
 * PAYMENT-REQUIRED header, signed, and retried without ?tx_hash= —
 * exactly what a library-driven client does, since it never reads the
 * body — opened its wallet, was refused, and was recorded as somebody
 * who "never presented a signature". The funnel's one signal worth
 * having, a wallet opened at the door, was invisible on every door
 * with a required input: three of the four cheapest on the shelf.
 *
 * So: one wrapper, ahead of every check, that books the refusal as
 * the decline it is. The check's own body still goes out unchanged.
 */
export const bookRefusalBeforeGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  if (c.res.status !== 400 || !isBuying(c)) {
    return;
  }
  // From the path, not c.req.param(): this runs on the "/api/buy/*"
  // wildcard, ahead of the named route that would bind item_id.
  const item = getMenuItem(itemKeyFromPath(c.req.path));
  if (!item) {
    return;
  }
  const missing = missingRequiredInputs(item, c.req.query());
  const required = buyInputSchema(item).required ?? [];
  const reason =
    missing.length > 0
      ? `local:input_missing:${missing[0]}`
      : required.length > 0
        ? `local:input_invalid:${required[0]}`
        : "local:refused_before_gate";
  await recordPaymentDecline(c.env, c.req.path, reason, gateSignals(c)).catch(
    () => undefined,
  );
};
/**
 * EVERY REFUSAL THAT DEPENDS ON WHAT THE BUYER SENT, in one gate,
 * reading one law out of lib/purchase-args.
 *
 * There used to be twenty-three middlewares here, one per item, and
 * the MCP door had its own five. The five were not the twenty-three:
 * an MCP buyer could pay $5 for a launch check of an empty string,
 * because the door that took their money never carried the `url`
 * they sent and never checked for it either. That is why the law
 * moved into a file both doors call rather than growing a
 * twenty-fourth copy here — see the note at the top of
 * lib/purchase-args.ts.
 *
 * The probe rule is unchanged: only a request PRESENTING PAYMENT is
 * gated, so asking the price without the required inputs stays free
 * and still answers with the 402 that names them.
 */
export const argCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const item = getMenuItem(buyItemId(c));
  if (!item || !isBuying(c)) {
    return next();
  }
  const refusal = await checkPurchaseArgs(
    c.env,
    item,
    queryArgs((name) => c.req.query(name)),
  );
  if (refusal) {
    return c.json(refusal.body, refusal.status);
  }
  await next();
};

/**
 * The order the store has always refused in. A knock that survives all
 * eight has paid, and only the store may serve it.
 */
export const doorChecks: readonly MiddlewareHandler<HonoEnv>[] = [
  noStore,
  shelfCheck,
  bookRefusalBeforeGate,
  stockCheck,
  shutterCheck,
  capacityCheck,
  argCheck,
  paymentGate,
];
