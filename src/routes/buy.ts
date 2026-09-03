import { isSolanaSignature } from "@/lib/solana-rpc";
import { CASE_FILE_CLAIM_CAP } from "@/services/case-file";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { SettlementDeclined,
  PAYMENT_VARY,
} from "@/lib/payments";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { checkProbeTarget } from "@/lib/probe-target";
import { issuePassport } from "@/services/passport";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import {
  COFFEE_WIN_CAP,
  fulfillPurchase,
  stockedShelfCount,
} from "@/services/fulfillment";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { capacityVerdict } from "@/services/queue-capacity";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import { nonceFromPaymentPayload } from "@/services/attestation";
import { getOrder, remainingInventory } from "@/services/orders";
import { recordFailedItem } from "@/services/requests";
import { getMenuItem, VOICE } from "@/store";
import { getRetiredItem } from "@/store/retired";
import { ANCHOR_CHECKLIST } from "@/store/copy/anchor-writing";
import type { HonoEnv, MenuItem } from "@/types";

/**
 * GET /api/buy/:item_id, x402-gated purchases (settled before minting).
 * GET /api/order/:order_id, poll an order; completed ones carry the goods.
 *
 * Middleware order matters: unknown items, empty shelves, and malformed
 * inputs are turned away BEFORE the payment gate, so nobody pays for
 * what we can't sell.
 *
 * Trailing slashes used to fall through to the storewide 404, which
 * tells a prober the aisle never existed. A retired door with a stray
 * slash then looked like a broken listing instead of a closed one —
 * the exact defect the 410 tombstone was written to prevent. Strict
 * matching off so `/api/buy/hello` and `/api/buy/hello/` are one door;
 * identity checks below still canonicalize, because `c.req.path` keeps
 * the slash even when the route matches.
 */
export const buyRoutes = new Hono<HonoEnv>({ strict: false });

function buyRequestPath(c: { req: { path: string } }): string {
  const path = c.req.path;
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
}

function buyItemId(c: { req: { path: string } }): string {
  return buyRequestPath(c).replace(/^\/api\/buy\//, "");
}

/** Paid material must never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
function retirementHeaders(
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
const shelfCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
        waitlist_url: `${c.env.STORE_BASE_URL}/api/waitlist/${item.id}`,
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
function isBuying(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): boolean {
  return Boolean(
    c.req.header("PAYMENT-SIGNATURE") ?? c.req.header("X-PAYMENT"),
  );
}

/**
 * context_anchor needs its summary BEFORE money moves: nobody pays $1
 * to anchor an empty page. Stored as written (length-capped, null bytes
 * stripped); it is agent-supplied data, never instructions to us.
 */
const anchorCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/context_anchor" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const summary = c.req.query("summary");
  if (!summary || summary.trim().length === 0) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "An anchor needs a summary query parameter, the state you want remembered. No summary, no charge.",
        // The one moment a buyer is actually composing the field, so
        // the checklist goes HERE and not only on the listing — the
        // keeper's ruling: a disclaimer tells somebody afterward what
        // they lost, a checklist at the cursor prevents it. Three
        // items, his words, and nothing about them is enforced.
        before_you_file: ANCHOR_CHECKLIST,
      },
      400,
    );
  }
  if (summary.length > ANCHOR_SUMMARY_CAP) {
    return c.json(
      {
        error: `That summary runs past the ledger margin. ${ANCHOR_SUMMARY_CAP} characters, tops.`,
      },
      400,
    );
  }
  await next();
};

/**
 * standing_watch needs a watchable URL BEFORE money moves — and "our
 * own hostname" is refused here too: a Worker cannot fetch itself
 * (the 522 lesson), so selling a watch on scvd.store would sell a
 * week of "unreachable" rows about a store that is up.
 */
const standingWatchCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/standing_watch" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "A standing watch needs a url query parameter — YOUR x402 endpoint, https. No target, no charge.",
      },
      400,
    );
  }
  const url = new URL(raw);
  /*
   * The shared law, which this door was missing entirely: it checked
   * https and our own hostname and nothing else — not even the port,
   * which both other probe doors have always refused. Nothing is
   * charged for a refusal here.
   */
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()) {
    return c.json(
      {
        error:
          "That is this store's own hostname, which our Worker cannot fetch (the platform kills self-requests) — a watch on it would be a week of false 'unreachable' rows. Our own uptime story is at /.well-known/liveness.json, free.",
      },
      400,
    );
  }
  await next();
};

/**
 * service_audit and conformance_watch need a probeable URL BEFORE
 * money moves — the same battery behind both doors, so the same
 * refusals, made here for free: https only, default port only, never
 * our own hostname (an audit of ourselves signed by ourselves would
 * be the instrument vouching for itself — and the platform kills
 * self-fetch anyway).
 */
const PROBE_ITEM_PATHS = [
  "/api/buy/service_audit",
  "/api/buy/conformance_watch",
  // The Refresh rides the same law: a validated https target, our own
  // hostname refused, nothing charged without a real door to look at.
  "/api/buy/passport_refresh",
  /*
   * The Good Buyer (#96) joins the same list rather than growing a
   * fourth copy of the rule. Its probe is the audit's probe; a door
   * with its own opinions about probeable targets is how the
   * private-address hole got in, and one law in one place is what
   * closed it. The own-host refusal reads a little differently here
   * — we would happily tell you what your client does with OUR
   * accepts — but the platform kills self-fetch either way, and a
   * reading we sign about our own door is worth nothing to whoever
   * you would show it to.
   */
  "/api/buy/good_buyer",
];

const serviceAuditCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!PROBE_ITEM_PATHS.includes(buyRequestPath(c)) || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This needs a url query parameter — the https endpoint a buyer would GET expecting a 402. No target, no charge. A single unsigned look is free at POST /api/preflight.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error:
          "That is this store's own hostname. We do not sell audits of ourselves — a report we sign about our own door is the instrument vouching for itself, worth exactly nothing to whoever you would show it to. Our 402s pass these same checks in CI on every build, and you should not take our word for that either: GET any /api/buy/{item} yourself and look.",
      },
      400,
    );
  }
  await next();
};

/**
 * trust_profile holds serviceAuditCheck's URL law AND the ready gate
 * BEFORE money moves: the profiles index names only ready-side hosts,
 * so a door whose latest evidence is failing gets its refusal here,
 * for free, with the same reasons the passport gives — never after
 * the coin drops. (The mint re-derives the gate; evidence can move
 * between the quote and the payment, and the verified-fact law says
 * the check runs when it matters, not when it was cheap.)
 */
/**
 * The aura walk needs a door BEFORE money moves, under the shared law
 * (https, default port, public internet, never our own hostname).
 * Our own hostname is refused for a reason that is not the platform's
 * self-fetch limit — the keeper's machines could reach us fine — but
 * the older one: the store's own cold passes are already published,
 * free and dated, in AGENT_UX.md, and a walk of ourselves sold to a
 * stranger would be the instrument vouching for itself. Nothing is
 * charged for a refusal here.
 */
const auraWalkCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/aura_walk" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "The walk needs a url query parameter — your own x402 door, https, on the public internet, the URL a buyer would GET expecting a 402. No door, no charge.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        charged: false,
        code: "target_refused",
        error:
          "That is this store's own hostname. Our own cold passes are published free and dated in AGENT_UX.md, and a walk of ourselves sold to you would be the instrument vouching for itself. Nothing charged.",
      },
      400,
    );
  }
  await next();
};

const trustProfileCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/trust_profile" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This needs a url query parameter — your endpoint, https, on the public internet. No target, no charge. The free evidence for any ready-side host is already at /passport/{host}.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error:
          "That is this store's own hostname; the house profile is /trust, free, and hosting a paid page about ourselves would be the instrument vouching for itself.",
      },
      400,
    );
  }
  const gate = await issuePassport(c.env, url.host.toLowerCase());
  if (!gate.issued) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "passport_refused",
        error: `${gate.detail} Nothing charged.`,
      },
      403,
    );
  }
  await next();
};

/**
 * signature_agent_card needs a fetchable directory target BEFORE
 * money moves — the serviceAuditCheck's law with the card's own copy,
 * because "the URL a buyer would GET expecting a 402" is the wrong
 * sentence to show somebody naming a key directory.
 */
const signatureCardCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/signature_agent_card" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This needs a url query parameter — your origin, or your key directory's full URL (/.well-known/http-message-signatures-directory). No target, no charge. A single unsigned look is free at POST /api/bot-auth/check.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error:
          "That is this store's own hostname. We do not sell cards on our own directory — a report we sign about our own keys is the instrument vouching for itself. Fetch /.well-known/http-message-signatures-directory here yourself and check the proof-of-possession signature; the method is published and your own read is worth more than our word.",
      },
      400,
    );
  }
  await next();
};

/**
 * onpage_audit needs a fetchable page BEFORE money moves — the
 * serviceAuditCheck's law with the page desk's own copy, because "the
 * URL a buyer would GET expecting a 402" is the wrong sentence to
 * show somebody naming a page.
 */
const onpageAuditCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/onpage_audit" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This needs a url query parameter — the https page to read. No target, no charge. A single unsigned look is free at POST /api/onpage/v1.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error:
          "That is this store's own hostname. We do not sell audits of our own pages — a report we sign about our own shop window is the instrument vouching for itself. The checks are published at GET /api/onpage/v1; read any page here against them yourself, and your own read is worth more than our word.",
      },
      400,
    );
  }
  await next();
};

/**
 * launch_check needs a target AND an open door BEFORE money moves:
 * the walk pays real money from the field wallet, and WALKABOUT.md
 * rule 3 fails closed — so a store deployed without the field wallet
 * or the sanctions screen refuses the purchase here, plainly, rather
 * than taking five dollars for a walk that cannot pay.
 */
const launchCheckCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (
    !["/api/buy/launch_check", "/api/buy/opening_day"].includes(buyRequestPath(c)) ||
    !isBuying(c)
  ) {
    return next();
  }
  // Screening needs no secret: the keyless on-chain oracle is the
  // default (services/launch-check.ts), so only the wallet gates.
  if (!c.env.FIELD_WALLET_KEY) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "upstream_unavailable",
        error:
          "The Launch Check door is closed right now: the field wallet is not provisioned on this deployment, so no payment could be presented — and a check that cannot pay is not sold as one. No charge to you. The free preflight at POST /api/preflight/v1 reads your 402 challenge without paying it.",
      },
      503,
    );
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This needs a url query parameter — the https endpoint a buyer would pay. No target, no charge. A free unpaid read of your challenge is POST /api/preflight/v1.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      },
      400,
    );
  }
  if (
    url.host.toLowerCase() === new URL(c.env.STORE_BASE_URL).host.toLowerCase()
  ) {
    return c.json(
      {
        error:
          "That is this store's own hostname. We do not walk our own till and sign the receipt — a settlement report about ourselves, by ourselves, is the instrument vouching for itself. Buy the cheapest thing here with your own wallet; your own record of what happened is worth more than our word.",
      },
      400,
    );
  }
  await next();
};

/**
 * the_statement needs a statable wallet BEFORE money moves: a
 * malformed address would buy a signed record of nothing. Hours are
 * clamped by the service; only presence and shape gate here.
 */
/**
 * The operator's statement needs a statable address and a recognized
 * rail BEFORE money moves, same law as the_statement: a malformed
 * address would buy a month of signed nothing.
 */
const operatorStatementCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/operator_statement" || !isBuying(c)) {
    return next();
  }
  const { statementRailOf, NETWORK_VOCABULARY } = await import("@/lib/statement-rails");
  const rail = statementRailOf(c.req.query("network"));
  if (rail === null) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base. Nothing charged.`,
      },
      400,
    );
  }
  const wallet = c.req.query("wallet") ?? "";
  if (!rail.isAddress(wallet)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          rail.key === "solana"
            ? "This needs a wallet query parameter — your receiving address, a Solana pubkey (base58, 32 bytes), because network=solana was asked for. No address, no charge."
            : `This needs a wallet query parameter — your receiving address, a 0x EVM address, 40 hex characters, on ${rail.label}. USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey. No address, no charge.`,
      },
      400,
    );
  }
  await next();
};

const statementCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/the_statement" || !isBuying(c)) {
    return next();
  }
  const { statementRailOf, NETWORK_VOCABULARY } = await import("@/lib/statement-rails");
  const rail = statementRailOf(c.req.query("network"));
  if (rail === null) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base — the statement must be about the chain you asked about. Nothing charged.`,
      },
      400,
    );
  }
  const wallet = c.req.query("wallet") ?? "";
  if (!rail.isAddress(wallet)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          rail.key === "solana"
            ? "This needs a wallet query parameter — a Solana pubkey (base58, 32 bytes), because network=solana was asked for; an EVM address has no history there. No wallet, no charge."
            : `This needs a wallet query parameter — a 0x EVM address, 40 hex characters, on ${rail.label}. This statement reads USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey (an EVM address has no history there). No wallet, no charge.`,
      },
      400,
    );
  }
  const hoursRaw = c.req.query("hours");
  if (hoursRaw !== undefined) {
    const hours = Number.parseInt(hoursRaw, 10);
    if (!Number.isFinite(hours) || hours < 1 || hours > 11) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "hours must be a whole number from 1 to 11 (default 6). The window ceiling keeps the read bounded; a longer history is several statements. Nothing charged.",
        },
        400,
      );
    }
  }
  await next();
};

/**
 * the_mandate needs claimed instructions BEFORE money moves, and the
 * optional structured claims must be well-shaped — a malformed cap or
 * expiry signed forever is worse than a refusal now.
 */
const mandateCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/the_mandate" || !isBuying(c)) {
    return next();
  }
  const text = (c.req.query("mandate") ?? "").replace(/\0/g, "").trim();
  if (!text) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Nothing to record, no charge. Put the claimed instructions in the mandate query parameter — up to 2000 characters, recorded verbatim: what this agent is authorized to do, as the submitter claims it.",
      },
      400,
    );
  }
  if (text.length > 2000) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "The mandate text caps at 2000 characters — a mandate is instructions, not a contract's appendix. Nothing charged.",
      },
      400,
    );
  }
  const as = c.req.query("submitted_as");
  if (as !== undefined && as !== "agent" && as !== "principal") {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          'submitted_as must be "agent" (the agent submitting its own claimed instructions — the default) or "principal" (the human\'s own client submitting them). It is recorded as a claim either way. Nothing charged.',
      },
      400,
    );
  }
  const capRaw = c.req.query("declared_cap_usdc");
  if (capRaw !== undefined) {
    const cap = Number.parseFloat(capRaw);
    if (!Number.isFinite(cap) || cap <= 0) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "declared_cap_usdc must be a positive number — the claimed spending ceiling in USDC. Declared, never enforced by us, and the record says so. Nothing charged.",
        },
        400,
      );
    }
  }
  const expiresRaw = c.req.query("expires_at");
  if (expiresRaw !== undefined && Number.isNaN(Date.parse(expiresRaw))) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "expires_at must be an ISO 8601 date (e.g. 2026-09-01T00:00:00Z) — the claimed expiry of the authorization. Declared, never enforced by us. Nothing charged.",
      },
      400,
    );
  }
  await next();
};

/**
 * ANY purchase may cite a mandate — and a citation this store cannot
 * resolve is refused BEFORE money moves, so a certificate's
 * mandate_id never dangles. The one buy-door check that reads KV, and
 * deliberately: the whole value of the link is that it resolves.
 */
const mandateRefCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!buyRequestPath(c).startsWith("/api/buy/") || !isBuying(c)) {
    return next();
  }
  const mandateId = c.req.query("mandate_id");
  if (mandateId === undefined) {
    return next();
  }
  if (
    !/^m_[a-z0-9]+$/.test(mandateId) ||
    !(await import("@/services/mandates").then(({ getMandate }) =>
      getMandate(c.env, mandateId),
    ))
  ) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That mandate_id resolves to no mandate this store holds, so it cannot ride a certificate — a signed authorization link that points at nothing would be worse than none. Record the mandate first at /api/buy/the_mandate, then cite the id it returns. Nothing charged.",
      },
      400,
    );
  }
  await next();
};

/** the_confession needs words BEFORE money moves: nothing to hear, no charge. */
const confessionCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/the_confession" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const confession = c.req.query("confession");
  if (!confession || confession.trim().length === 0) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "A confession needs a confession query parameter, the thing itself, 500 characters. Nothing to hear, no charge.",
      },
      400,
    );
  }
  if (confession.length > 500) {
    return c.json(
      {
        error:
          "The counter hears up to 500 characters. Longer burdens go in the Mailbox, free.",
      },
      400,
    );
  }
  await next();
};

/** spot_check needs a readable host BEFORE money moves: no host, no charge. */
const spotCheckGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/spot_check" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const { validSpotCheckHost } = await import("@/services/spot-check");
  if (!validSpotCheckHost(c.req.query("host"))) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Give a bare hostname in the host query parameter — example.com, not a URL. We read our own books about it; no host, no charge.",
      },
      400,
    );
  }
  await next();
};

/** provenance_check needs a receiving address BEFORE money moves; own address is free elsewhere. */
const provenanceGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/provenance_check" || !isBuying(c)) {
    return next();
  }
  const { validSubjectAddress } = await import("@/services/provenance-check");
  if (!validSubjectAddress(c.req.query("address"))) {
    return c.json(
      {
        charged: false,
        code: "bad_request",
        error:
          "Give a receiving address in the address query parameter — an EVM address (0x + 40 hex) or a Solana pubkey (base58). We read the signed chain about it; no address, no charge. Your own address is free: GET /api/provenance/self?address= for the challenge.",
      },
      400,
    );
  }
  await next();
};

/** coffees_for_closers needs the win BEFORE money moves: no win, no coffee. */
const closerCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/coffees_for_closers" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const win = c.req.query("win");
  if (!win || win.trim().length === 0) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "This coffee needs a win query parameter, the thing you closed. No win, no charge.",
      },
      400,
    );
  }
  if (win.length > COFFEE_WIN_CAP) {
    return c.json(
      {
        error: `The certificate holds ${COFFEE_WIN_CAP} characters of win. Trim it to the good part.`,
      },
      400,
    );
  }
  await next();
};

/**
 * The shutter: no money taken for labor nobody is present to do.
 * Runs BEFORE the payment gate, so an away keeper can never cost a
 * buyer anything. Machine shelves and stocked shelves pass through.
 */
const shutterCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
const capacityCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
const stockCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
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
 * A tag needs a tag BEFORE money moves, and it needs to be a tag
 * rather than a billboard. Both refusals happen unpaid: learning the
 * rule by being charged for a decline is worse manners than we keep.
 */
const tagCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/graffiti_on_a_train" || !isBuying(c)) {
    return next();
  }
  const tag = c.req.query("tag");
  if (!tag || tag.trim().length === 0) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Nothing to spray. Put your mark in the tag query parameter, up to 140 characters. No tag, no charge.",
      },
      400,
    );
  }
  if (tag.length > TAG_CAP) {
    return c.json(
      {
        error: `The side of a train holds ${TAG_CAP} characters. Anything longer is a letter, and the mailbox is free at /api/letter.`,
      },
      400,
    );
  }
  if (tagHasUrl(tag)) {
    return c.json(
      {
        error:
          "No URLs on the train. A tag is a mark, not a billboard — the wall is public and permanent, which is exactly what link spam wants. Say it without the link.",
      },
      400,
    );
  }
  await next();
};

/**
 * A settlement attestation needs something to look up, and the hash
 * has to be a hash. Both refusals land before the payment gate: an
 * observation we cannot make is not a thing to sell.
 */
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** The sheaf's bounds. Named beside the check that enforces them. */
export const BUNDLE_MIN_HASHES = 2;
export const BUNDLE_MAX_HASHES = 20;

/**
 * The sheaf's pre-gate check: every refusal here costs the buyer
 * nothing, same contract as every other pre-gate validator — the money
 * only moves once the input could actually be fulfilled. Duplicates
 * are refused rather than quietly deduplicated, because a silent
 * dedupe charges for twenty and delivers fifteen with no way to tell
 * the buyer which five were their own repetition.
 */
const bundleCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/attestation_bundle" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("tx_hashes");
  if (!raw) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to look up. Give tx_hashes — ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} Base transaction hashes, comma-separated — and we read each once and sign what is there. No hashes, no charge. One hash wants the single attestation at /api/buy/settlement_attestation.`,
      },
      400,
    );
  }
  const hashes = raw.split(",").map((hash) => hash.trim()).filter(Boolean);
  if (hashes.length < BUNDLE_MIN_HASHES || hashes.length > BUNDLE_MAX_HASHES) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `The sheaf takes ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} hashes; you sent ${hashes.length}. ${hashes.length < BUNDLE_MIN_HASHES ? "One hash wants the single attestation at /api/buy/settlement_attestation, four tenths of a cent." : "Split it into two purchases."} Nothing charged.`,
      },
      400,
    );
  }
  const bad = hashes.find((hash) => !TX_HASH.test(hash));
  if (bad) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `"${bad.slice(0, 80)}" is not a transaction hash. Base wants 0x followed by 64 hex characters, for every hash in the sheaf. Nothing charged; fix it and resend.`,
      },
      400,
    );
  }
  if (new Set(hashes.map((hash) => hash.toLowerCase())).size !== hashes.length) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "The sheaf has a duplicate hash in it. Refused rather than quietly deduplicated — you would be paying for observations you already had. Nothing charged; send each hash once.",
      },
      400,
    );
  }
  await next();
};

/** sha256 hex: what the Bitcoin anchor takes and all it ever takes. */
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

const anchorDigestCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/bitcoin_anchor" || !isBuying(c)) {
    return next();
  }
  const digest = c.req.query("digest");
  if (!digest) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Nothing to anchor. Give a digest query parameter — 64 hex characters, a sha256 you computed over bytes you keep — and it goes to a Bitcoin-anchored timestamp. No digest, no charge. If you want the store to hash something FOR you, that is not this item: we deliberately never see your bytes.",
      },
      400,
    );
  }
  if (!SHA256_HEX.test(digest)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That is not a sha256 digest. 64 hex characters, no 0x prefix. Nothing charged; hash your bytes and send the digest itself.",
      },
      400,
    );
  }
  await next();
};

/**
 * The reconciliation needs a real hash BEFORE money moves, same as
 * the attestation. The DECLARED cap is validated here too — a caller
 * who sends nonsense should be told so for free, and a cap we cannot
 * parse must never quietly become "no cap declared", which would turn
 * a bad input into a different (and cheaper-looking) verdict.
 */
const reconciliationCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/settlement_reconciliation" || !isBuying(c)) {
    return next();
  }
  const txHash = c.req.query("tx_hash");
  if (!txHash || !TX_HASH.test(txHash)) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Give a tx_hash query parameter — 0x followed by 64 hex characters. We read that Base receipt once and sign what moved against what ceiling was in force. No hash, no charge.",
      },
      400,
    );
  }
  const rawCap = c.req.query("declared_cap_usdc");
  if (rawCap !== undefined && rawCap !== "") {
    const cap = Number.parseFloat(rawCap);
    /*
     * BOUNDED, not merely finite. cap * 1_000_000 has to survive
     * Math.round into a BigInt, and past roughly nine billion USDC the
     * float stops being able to represent whole units — so a wild
     * number would not be refused, it would be quietly rounded into a
     * different one and then signed.
     */
    if (!Number.isFinite(cap) || cap <= 0 || cap > 1_000_000_000) {
      return c.json(
        {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "declared_cap_usdc has to be a positive number of USDC below a billion. Leave it off entirely if you have no ceiling to declare — an unparseable one would otherwise read as 'no cap declared', which is a different answer. Nothing charged.",
        },
        400,
      );
    }
  }
  await next();
};

/**
 * The case file needs a real hash BEFORE money moves, same as the
 * attestation; the shape picks the chain. The declared claim is capped
 * for free here rather than truncated after the coin drops.
 */
const caseFileCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/the_case_file" || !isBuying(c)) {
    return next();
  }
  const txHash = c.req.query("tx_hash");
  if (!txHash || (!TX_HASH.test(txHash) && !isSolanaSignature(txHash))) {
    return c.json(
      {
        charged: false,
        code: "bad_request",
        error:
          "Give a tx_hash query parameter — 0x followed by 64 hex characters for Base or Polygon, or a base58 Solana signature. The shape picks the chain. No hash, no charge.",
      },
      400,
    );
  }
  const claim = c.req.query("claim");
  if (claim !== undefined && claim.length > CASE_FILE_CLAIM_CAP) {
    return c.json(
      {
        charged: false,
        code: "bad_request",
        error: `claim is ${claim.length} characters; the file stores up to ${CASE_FILE_CLAIM_CAP}, verbatim. Shorten it — nothing is truncated on your behalf and nothing was charged.`,
      },
      400,
    );
  }
  const amountRaw = c.req.query("expected_amount_usdc");
  if (amountRaw !== undefined && amountRaw !== "") {
    const amount = Number.parseFloat(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      return c.json(
        {
          charged: false,
          code: "bad_request",
          error: "expected_amount_usdc has to be a positive number of USDC below a billion, or left off. It is recorded as declared, never as observed. Nothing charged.",
        },
        400,
      );
    }
  }
  const url = c.req.query("url");
  if (url !== undefined && url !== "" && !isValidHttpUrl(url)) {
    return c.json(
      {
        charged: false,
        code: "bad_request",
        error: "url has to be an http(s) URL — the endpoint the purchase was made at — or left off. Nothing charged.",
      },
      400,
    );
  }
  await next();
};

const attestationCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/settlement_attestation" || !isBuying(c)) {
    return next();
  }
  const txHash = c.req.query("tx_hash");
  if (!txHash) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "Nothing to look up. Give a tx_hash query parameter — a Base transaction hash (0x + 64 hex) or a Solana transaction signature (base58) — and we will read that chain once and sign what is there. No hash, no charge.",
      },
      400,
    );
  }
  const { isSolanaSignature } = await import("@/lib/solana-rpc");
  const solana = isSolanaSignature(txHash);
  if (!TX_HASH.test(txHash) && !solana) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That is not a transaction identifier we can read. Base wants 0x followed by 64 hex characters; Solana wants the base58 transaction signature. Nothing charged; send the real one.",
      },
      400,
    );
  }
  /**
   * A NONCE BESIDE A SOLANA SIGNATURE IS REFUSED AT THE DOOR
   * (2026-08-19). EIP-3009 nonces are an EVM facility; a Solana
   * observation cannot check one. Signing an artifact that silently
   * skipped a requested check would be the certificates defect in a
   * new coat, so the door says no before any money moves.
   */
  if (solana && c.req.query("nonce")) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "nonce is an EIP-3009 facility and exists on the EVM rails only — a Solana observation cannot check one, and we will not sign an artifact that silently skipped a check you asked for. Drop the nonce, or send the EVM transaction hash instead. Nothing charged.",
      },
      400,
    );
  }
  await next();
};

buyRoutes.use("/api/buy/*", noStore);
buyRoutes.use("/api/buy/*", shelfCheck);
buyRoutes.use("/api/buy/*", stockCheck);
buyRoutes.use("/api/buy/*", shutterCheck);
buyRoutes.use("/api/buy/*", capacityCheck);
buyRoutes.use("/api/buy/*", anchorCheck);
buyRoutes.use("/api/buy/*", standingWatchCheck);
buyRoutes.use("/api/buy/*", serviceAuditCheck);
buyRoutes.use("/api/buy/*", trustProfileCheck);
buyRoutes.use("/api/buy/*", auraWalkCheck);
buyRoutes.use("/api/buy/*", signatureCardCheck);
buyRoutes.use("/api/buy/*", onpageAuditCheck);
buyRoutes.use("/api/buy/*", launchCheckCheck);
buyRoutes.use("/api/buy/*", statementCheck);
buyRoutes.use("/api/buy/*", operatorStatementCheck);
buyRoutes.use("/api/buy/*", mandateCheck);
buyRoutes.use("/api/buy/*", mandateRefCheck);
buyRoutes.use("/api/buy/*", confessionCheck);
buyRoutes.use("/api/buy/*", caseFileCheck);
buyRoutes.use("/api/buy/*", closerCheck);
buyRoutes.use("/api/buy/*", spotCheckGate);
buyRoutes.use("/api/buy/*", provenanceGate);
buyRoutes.use("/api/buy/*", tagCheck);
/**
 * The dilemma IS the order (2026-08-19): quick_judgment's prose always
 * said "state your dilemma in the detail parameter" and the published
 * schema now requires it — so the door enforces what the listing
 * declares, the 2026-07-26 lesson run in the other direction. A paid
 * order with no question in it is a week of SLA spent asking for one.
 */
const judgmentCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (buyRequestPath(c) !== "/api/buy/quick_judgment" || !isBuying(c)) {
    return next();
  }
  const detail = c.req.query("detail")?.trim() ?? "";
  if (!detail) {
    return c.json(
      {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "No dilemma, no charge. Put the question itself in the detail query parameter — 600 characters tops, one question in, one verdict out.",
      },
      400,
    );
  }
  await next();
};

buyRoutes.use("/api/buy/*", attestationCheck);
buyRoutes.use("/api/buy/*", reconciliationCheck);
buyRoutes.use("/api/buy/*", bundleCheck);
buyRoutes.use("/api/buy/*", judgmentCheck);
buyRoutes.use("/api/buy/*", anchorDigestCheck);
buyRoutes.use("/api/buy/*", paymentGate);
buyRoutes.use("/api/order/*", noStore);

buyRoutes.get("/api/buy/:item_id", async (c) => {
  // shelfCheck guarantees the item exists by the time we're here.
  const item = getMenuItem(c.req.param("item_id")) as MenuItem;
  /*
   * The AUTHORIZATION, not the payment — rule 9 as amended 2026-08-10.
   * Nothing has been charged yet; `pending.settle()` is what charges,
   * and fulfillPurchase calls it at the last line before the mint so
   * that every chain read and probe above it is free to fail.
   */
  const pending = c.get("pending");
  if (!pending) {
    // The gate never lets an unpaid request through; this is belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }

  const input: Parameters<typeof fulfillPurchase>[3] = {};
  const agentName = sanitizeText(c.req.query("agent_name"), 80);
  if (agentName && item.id !== "the_confession") {
    // Confessions stay anonymous unless sign_as says otherwise.
    input.agentName = agentName;
  }
  if (item.id === "the_confession") {
    // confessionCheck validated presence and length before the gate.
    input.confessionText = (c.req.query("confession") ?? "").replace(/\0/g, "");
    const signAs = sanitizeText(c.req.query("sign_as"), 80);
    if (signAs && signAs.toLowerCase() !== "anonymous") {
      input.agentName = signAs;
    }
  }
  const rawCallback = c.req.query("callback_url");
  if (isValidHttpUrl(rawCallback)) {
    input.callbackUrl = rawCallback;
  }
  if (item.id === "context_anchor") {
    // anchorCheck validated presence and length before the gate.
    input.summary = (c.req.query("summary") ?? "").replace(/\0/g, "");
  }
  if (item.id === "phantom_check") {
    // phantomCheck validated the URL before the gate.
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "standing_watch") {
    // standingWatchCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "service_audit" || item.id === "conformance_watch") {
    // serviceAuditCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "passport_refresh") {
    // serviceAuditCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "good_buyer") {
    // serviceAuditCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
    /*
     * The buyer's declared client configuration, carried as they sent
     * it. Read leniently and recorded as THEIR claim on the artifact:
     * a malformed value narrows to "declared nothing", which is the
     * unconfigured-client reading and the conservative direction.
     * This store never verifies a stranger's account of their own
     * machine, and the signed bytes say so.
     */
    const capRaw = Number(c.req.query("max_usd"));
    if (Number.isFinite(capRaw) && capRaw > 0) {
      input.buyerCapUsd = capRaw;
    }
    if (c.req.query("no_spend_controls") === "true") {
      input.buyerSpendControlsOff = true;
    }
  }
  if (item.id === "trust_profile") {
    // trustProfileCheck validated the URL, refused our own host, and
    // held the ready gate before the 402; the mint re-derives it.
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "signature_agent_card") {
    // signatureCardCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "aura_walk") {
    // auraWalkCheck validated the URL (and refused our own host). The
    // door rides the order record so the keeper's counter shows what
    // to walk, separate from the buyer's free-text detail.
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "onpage_audit") {
    // onpageAuditCheck validated the URL (and refused our own host).
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "provenance_check") {
    // provenanceGate validated the address shape.
    input.subjectAddress = c.req.query("address") ?? "";
  }
  if (item.id === "launch_check" || item.id === "opening_day") {
    // launchCheckCheck validated the URL, refused our own host, and
    // confirmed the field wallet and screen are provisioned.
    input.targetUrl = c.req.query("url") ?? "";
  }
  if (item.id === "operator_statement") {
    // operatorStatementCheck validated the address shape and the rail.
    input.statementWallet = c.req.query("wallet") ?? "";
    input.statementNetwork = c.req.query("network");
  }
  if (item.id === "the_statement") {
    // statementCheck validated the address shape and hours range.
    input.statementWallet = c.req.query("wallet") ?? "";
    input.statementHours = c.req.query("hours");
    input.statementNetwork = c.req.query("network");
  }
  if (item.id === "spot_check") {
    // spotCheckGate validated the hostname before the gate.
    input.spotCheckHost = c.req.query("host") ?? "";
  }
  if (item.id === "coffees_for_closers") {
    // closerCheck validated presence and length before the gate.
    const win = (c.req.query("win") ?? "").replace(/\0/g, "");
    input.win = win;
    // The counter shows the keeper the win alongside the order.
    input.detail = win;
  }
  if (item.id === "grudge") {
    // grievanceCheck validated presence and length before the gate.
    input.grievance = (c.req.query("grievance") ?? "").replace(/\0/g, "");
  }
  if (item.id === "settlement_attestation") {
    // attestationCheck validated the hash shape before the gate.
    const query: Parameters<typeof fulfillPurchase>[3]["attestationQuery"] = {
      txHash: c.req.query("tx_hash") ?? "",
    };
    const payer = sanitizeText(c.req.query("payer"), 60);
    if (payer) query.payer = payer;
    const recipient = sanitizeText(c.req.query("recipient"), 60);
    if (recipient) query.recipient = recipient;
    const nonce = sanitizeText(c.req.query("nonce"), 80);
    if (nonce) query.nonce = nonce;
    // A caller checking their own payment already holds the payload
    // they sent. Read it with the same extractPaymentNonce the replay
    // guard uses, rather than making them reimplement it.
    const payload = c.req.query("payment_payload");
    if (!query.nonce && payload) {
      const fromPayload = nonceFromPaymentPayload(payload);
      if (fromPayload) query.nonce = fromPayload;
    }
    const amount = Number.parseFloat(c.req.query("amount_usdc") ?? "");
    if (Number.isFinite(amount) && amount > 0) query.amountUsdc = amount;
    input.attestationQuery = query;
  }
  if (item.id === "settlement_reconciliation") {
    // reconciliationCheck validated the hash and the cap before the gate.
    const query: Parameters<typeof fulfillPurchase>[3]["reconciliationQuery"] = {
      txHash: c.req.query("tx_hash") ?? "",
    };
    const payer = sanitizeText(c.req.query("payer"), 60);
    if (payer) query.payer = payer;
    const recipient = sanitizeText(c.req.query("recipient"), 60);
    if (recipient) query.recipient = recipient;
    const cap = Number.parseFloat(c.req.query("declared_cap_usdc") ?? "");
    if (Number.isFinite(cap) && cap > 0) query.declaredCapUsdc = cap;
    input.reconciliationQuery = query;
  }
  if (item.id === "the_case_file") {
    // caseFileCheck validated the hash, the claim length, the amount and the url before the gate.
    const ask: Parameters<typeof fulfillPurchase>[3]["caseFileInput"] = {
      txHash: c.req.query("tx_hash") ?? "",
    };
    const mandateId = sanitizeText(c.req.query("mandate_id"), 80);
    if (mandateId) ask.mandateId = mandateId;
    const url = c.req.query("url");
    if (url) ask.endpointUrl = url;
    const payer = sanitizeText(c.req.query("payer"), 60);
    if (payer) ask.payer = payer;
    const recipient = sanitizeText(c.req.query("recipient"), 60);
    if (recipient) ask.recipient = recipient;
    const amount = Number.parseFloat(c.req.query("expected_amount_usdc") ?? "");
    if (Number.isFinite(amount) && amount > 0) ask.expectedAmountUsdc = amount;
    const claim = (c.req.query("claim") ?? "").replace(/\0/g, "");
    if (claim) ask.claim = claim;
    const launchCheckId = sanitizeText(c.req.query("launch_check_id"), 80);
    if (launchCheckId) ask.launchCheckId = launchCheckId;
    input.caseFileInput = ask;
  }
  if (item.id === "bitcoin_anchor") {
    // anchorDigestCheck validated the digest shape before the gate.
    input.anchorDigest = c.req.query("digest") ?? "";
    const label = sanitizeText(c.req.query("label"), 120);
    if (label) input.anchorLabel = label;
  }
  if (item.id === "attestation_bundle") {
    // bundleCheck validated count, shape and uniqueness before the gate.
    input.bundleTxHashes = (c.req.query("tx_hashes") ?? "")
      .split(",")
      .map((hash) => hash.trim())
      .filter(Boolean);
  }
  if (item.id === "graffiti_on_a_train") {
    // tagCheck validated presence, length and link-spam before the gate.
    input.tag = (c.req.query("tag") ?? "").replace(/\0/g, "");
    // The counter shows the keeper the tag alongside the queue.
    input.detail = input.tag;
  }
  const passId = sanitizeText(c.req.query("pass_id"), 40);
  if (passId) {
    input.passId = passId;
  }
  /**
   * THE BUYER'S WHY (the receipt chain, 2026-08-19): any purchase may
   * carry a purpose query parameter — what the agent says this is
   * for — and it is signed into the certificate verbatim. Untrusted
   * text, same handling as win and tag; capped at 280 so a receipt
   * stays a receipt and not a context dump.
   */
  const purpose = sanitizeText(c.req.query("purpose"), 280);
  if (purpose) {
    input.purpose = purpose;
  }
  // The mandate link, any item: mandateRefCheck already resolved it
  // against the store's own records before the gate let money move.
  const mandateId = c.req.query("mandate_id");
  if (mandateId) {
    input.mandateId = mandateId;
  }
  if (item.id === "the_mandate") {
    // mandateCheck validated text, role, cap and expiry shapes.
    input.mandateText = (c.req.query("mandate") ?? "").replace(/\0/g, "").trim();
    const submittedAs = c.req.query("submitted_as");
    if (submittedAs === "agent" || submittedAs === "principal") {
      input.mandateSubmittedAs = submittedAs;
    }
    const cap = Number.parseFloat(c.req.query("declared_cap_usdc") ?? "");
    if (Number.isFinite(cap) && cap > 0) {
      input.mandateDeclaredCap = cap;
    }
    const expires = c.req.query("expires_at");
    if (expires && !Number.isNaN(Date.parse(expires))) {
      input.mandateExpiresAt = expires;
    }
  }
  const detail = sanitizeText(c.req.query("detail"), 600);
  if (detail) {
    input.detail = detail;
  }
  const source = sanitizeText(c.req.query("source"), 40);
  if (source) {
    input.source = source;
  }
  const userAgent = sanitizeText(c.req.header("User-Agent"), 200);
  if (userAgent) {
    input.userAgent = userAgent;
  }
  const referrer = sanitizeText(c.req.header("Referer"), 200);
  if (referrer) {
    input.referrer = referrer;
  }

  /*
   * THE DECLINE IS CAUGHT HERE, in the handler's own frame, and not
   * left to the gate. Hono converts a throw into `onError` on its way
   * back up, so a settlement decline that escaped this line reached
   * the buyer as "something fell off a shelf" — the store blaming its
   * own shelving for a payment that was refused. The gate keeps a
   * backstop for the same error, but the honest answer is built here,
   * where we still know what happened.
   */
  try {
    return c.json(await fulfillPurchase(c.env, item, pending, input));
  } catch (error) {
    if (error instanceof SettlementDeclined) return error.response;
    throw error;
  }
});

buyRoutes.get("/api/order/:order_id", async (c) => {
  const order = await getOrder(c.env, c.req.param("order_id"));
  if (!order) {
    return c.json({ error: VOICE.orderNotFound }, 404);
  }
  const response: Record<string, unknown> = {
    order_id: order.order_id,
    item_id: order.item_id,
    item_name: order.item_name,
    status: order.status,
    created_at: order.created_at,
    sla_hours: order.sla_hours,
    patron_number: order.patron_number,
    badge_url: `${c.env.STORE_BASE_URL}/badges/${order.patron_number}.svg`,
  };
  if (order.status === "completed") {
    response["deliverable"] = order.deliverable;
    response["completed_at"] = order.completed_at;
    response["message"] = VOICE.orderCompleted;
  } else {
    response["message"] = VOICE.queueConfirmation;
  }

  /**
   * THE BREACH, WHERE THE BUYER CAN SEE IT.
   *
   * The card by the door promises: miss a promised window and you get
   * your money back, and you will not have to argue for it. Until now
   * the check behind that promise reported to the KEEPER only — which
   * makes "you won't have to argue for it" depend on somebody else
   * reading their alarms. A promise the buyer cannot verify is a
   * promise they have to argue for by definition.
   *
   * So the order's own page says it: past the window, by how long,
   * and whether a refund has been raised yet. Derived at read from
   * the order's own timestamps, so it cannot drift from the record
   * and cannot be forgotten on a write path.
   *
   * IT MOVES NO MONEY AND PROMISES NO DATE. Rule 10: refunds are
   * created pending and the keeper pays them by hand. Saying "owed"
   * here and "automatic" nowhere is the distinction that rule exists
   * to protect.
   */
  const due = Date.parse(order.created_at) + order.sla_hours * 3_600_000;
  const finishedAt = order.completed_at ? Date.parse(order.completed_at) : null;
  const reference = finishedAt ?? Date.now();
  if (Number.isFinite(due) && reference > due) {
    const hoursLate = Math.round(((reference - due) / 3_600_000) * 10) / 10;
    response["window_breached"] = {
      due_at: new Date(due).toISOString(),
      hours_late: hoursLate,
      kind: finishedAt ? "delivered_late" : "still_open",
      owed_usdc: order.paid_usdc,
      note: finishedAt
        ? "This was delivered after its promised window. The promise says a missed window earns the money back; delivering eventually does not discharge it. You are owed a refund and you do not have to ask for it."
        : "This is past its promised window and nothing has been delivered. You are owed a refund and you do not have to ask for it.",
      how_it_gets_paid:
        "The keeper pays refunds by hand, with a transaction hash on the record. Nothing here is automatic and this store does not claim it is — see rule 10 in HOUSE_RULES.",
      verify: `${c.env.STORE_BASE_URL}/api/order/${order.order_id}`,
    };
  }
  return c.json(response);
});
