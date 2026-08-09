import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { checkProbeTarget } from "@/lib/probe-target";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import {
  COFFEE_WIN_CAP,
  fulfillPurchase,
  stockedShelfCount,
} from "@/services/fulfillment";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
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
 */
export const buyRoutes = new Hono<HonoEnv>();

/** Paid material must never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

/** Turns away unknown items (logged as market research) and sold-out shelves. */
const shelfCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
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
      );
    }
    await recordFailedItem(c.env, itemId);
    return c.json(
      {
        error: VOICE.unknownItem,
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
  if (c.req.path !== "/api/buy/context_anchor" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const summary = c.req.query("summary");
  if (!summary || summary.trim().length === 0) {
    return c.json(
      {
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
  if (c.req.path !== "/api/buy/standing_watch" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
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
    return c.json({ error: `${verdict.reason} Nothing charged.` }, 400);
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
];

const serviceAuditCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!PROBE_ITEM_PATHS.includes(c.req.path) || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("url");
  if (!isValidHttpUrl(raw)) {
    return c.json(
      {
        error:
          "This needs a url query parameter — the https endpoint a buyer would GET expecting a 402. No target, no charge. A single unsigned look is free at POST /api/preflight.",
      },
      400,
    );
  }
  const url = new URL(raw);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return c.json({ error: `${verdict.reason} Nothing charged.` }, 400);
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

/** the_confession needs words BEFORE money moves: nothing to hear, no charge. */
const confessionCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/the_confession" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const confession = c.req.query("confession");
  if (!confession || confession.trim().length === 0) {
    return c.json(
      {
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

/** coffees_for_closers needs the win BEFORE money moves: no win, no coffee. */
const closerCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/coffees_for_closers" || !isBuying(c)) {
    // Not this route, or only asking the price: let the gate answer.
    return next();
  }
  const win = c.req.query("win");
  if (!win || win.trim().length === 0) {
    return c.json(
      {
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
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
  const item = getMenuItem(itemId);
  if (item && (await requiresPresentKeeper(c.env, item))) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return c.json(
        {
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
 * Sold out, honestly: a bare stocked shelf issues no 402 nobody can
 * settle. Real scarcity, checkable, restocked by the keeper's hands.
 */
const stockCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const itemId = c.req.path.replace(/^\/api\/buy\//, "");
  const item = getMenuItem(itemId);
  if (item?.stocked) {
    const count = await stockedShelfCount(c.env, item);
    if (count === 0) {
      return c.json(
        {
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
  if (c.req.path !== "/api/buy/graffiti_on_a_train" || !isBuying(c)) {
    return next();
  }
  const tag = c.req.query("tag");
  if (!tag || tag.trim().length === 0) {
    return c.json(
      {
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
  if (c.req.path !== "/api/buy/attestation_bundle" || !isBuying(c)) {
    return next();
  }
  const raw = c.req.query("tx_hashes");
  if (!raw) {
    return c.json(
      {
        error: `Nothing to look up. Give tx_hashes — ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} Base transaction hashes, comma-separated — and we read each once and sign what is there. No hashes, no charge. One hash wants the single attestation at /api/buy/settlement_attestation.`,
      },
      400,
    );
  }
  const hashes = raw.split(",").map((hash) => hash.trim()).filter(Boolean);
  if (hashes.length < BUNDLE_MIN_HASHES || hashes.length > BUNDLE_MAX_HASHES) {
    return c.json(
      {
        error: `The sheaf takes ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} hashes; you sent ${hashes.length}. ${hashes.length < BUNDLE_MIN_HASHES ? "One hash wants the single attestation at /api/buy/settlement_attestation, four tenths of a cent." : "Split it into two purchases."} Nothing charged.`,
      },
      400,
    );
  }
  const bad = hashes.find((hash) => !TX_HASH.test(hash));
  if (bad) {
    return c.json(
      {
        error: `"${bad.slice(0, 80)}" is not a transaction hash. Base wants 0x followed by 64 hex characters, for every hash in the sheaf. Nothing charged; fix it and resend.`,
      },
      400,
    );
  }
  if (new Set(hashes.map((hash) => hash.toLowerCase())).size !== hashes.length) {
    return c.json(
      {
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
  if (c.req.path !== "/api/buy/bitcoin_anchor" || !isBuying(c)) {
    return next();
  }
  const digest = c.req.query("digest");
  if (!digest) {
    return c.json(
      {
        error:
          "Nothing to anchor. Give a digest query parameter — 64 hex characters, a sha256 you computed over bytes you keep — and it goes to a Bitcoin-anchored timestamp. No digest, no charge. If you want the store to hash something FOR you, that is not this item: we deliberately never see your bytes.",
      },
      400,
    );
  }
  if (!SHA256_HEX.test(digest)) {
    return c.json(
      {
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
  if (c.req.path !== "/api/buy/settlement_reconciliation" || !isBuying(c)) {
    return next();
  }
  const txHash = c.req.query("tx_hash");
  if (!txHash || !TX_HASH.test(txHash)) {
    return c.json(
      {
        error:
          "Give a tx_hash query parameter — 0x followed by 64 hex characters. We read that Base receipt once and sign what moved against what ceiling was in force. No hash, no charge.",
      },
      400,
    );
  }
  const rawCap = c.req.query("declared_cap_usdc");
  if (rawCap !== undefined && rawCap !== "") {
    const cap = Number.parseFloat(rawCap);
    if (!Number.isFinite(cap) || cap <= 0) {
      return c.json(
        {
          error:
            "declared_cap_usdc has to be a positive number of USDC. Leave it off entirely if you have no ceiling to declare — an unparseable one would otherwise read as 'no cap declared', which is a different answer. Nothing charged.",
        },
        400,
      );
    }
  }
  await next();
};

const attestationCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.req.path !== "/api/buy/settlement_attestation" || !isBuying(c)) {
    return next();
  }
  const txHash = c.req.query("tx_hash");
  if (!txHash) {
    return c.json(
      {
        error:
          "Nothing to look up. Give a tx_hash query parameter — a Base transaction hash — and we will read the chain once and sign what is there. No hash, no charge.",
      },
      400,
    );
  }
  if (!TX_HASH.test(txHash)) {
    return c.json(
      {
        error:
          "That is not a transaction hash. Base wants 0x followed by 64 hex characters. Nothing charged; send the real one.",
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
buyRoutes.use("/api/buy/*", anchorCheck);
buyRoutes.use("/api/buy/*", standingWatchCheck);
buyRoutes.use("/api/buy/*", serviceAuditCheck);
buyRoutes.use("/api/buy/*", confessionCheck);
buyRoutes.use("/api/buy/*", closerCheck);
buyRoutes.use("/api/buy/*", tagCheck);
buyRoutes.use("/api/buy/*", attestationCheck);
buyRoutes.use("/api/buy/*", reconciliationCheck);
buyRoutes.use("/api/buy/*", bundleCheck);
buyRoutes.use("/api/buy/*", anchorDigestCheck);
buyRoutes.use("/api/buy/*", paymentGate);
buyRoutes.use("/api/order/*", noStore);

buyRoutes.get("/api/buy/:item_id", async (c) => {
  // shelfCheck guarantees the item exists by the time we're here.
  const item = getMenuItem(c.req.param("item_id")) as MenuItem;
  const payment = c.get("payment");
  if (!payment) {
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

  return c.json(await fulfillPurchase(c.env, item, payment, input));
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
  return c.json(response);
});
