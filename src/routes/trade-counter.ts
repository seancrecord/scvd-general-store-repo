import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { verifyTradeRequest } from "@/lib/trade-auth";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { fulfillPurchase } from "@/services/fulfillment";
import {
  alertCapReached,
  recallOrder,
  recordTradeDelivery,
  tradeDayCount,
  tradeLedger,
  tradePending,
  tradeSecrets,
  tradeSettlementFor,
  utcDay,
  validateTradeInputs,
} from "@/services/trade-counter";
import { claimTradeNonce } from "@/services/trade-nonces";
import { STORE_SERVICE_NAME, getMenuItem } from "@/store";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import { securityBlock } from "@/store/surface-contract";
import {
  TRADE_BODY_MAX_BYTES,
  TRADE_COMMON_FIELDS,
  TRADE_COUNTER_NAME,
  TRADE_COUNTER_OPENED,
  TRADE_DIALECTS,
  TRADE_ERRORS,
  TRADE_EXAMPLE_SHARE_BPS,
  TRADE_FAQ,
  TRADE_HONEST_LIMITS,
  TRADE_HOW_IT_WORKS,
  TRADE_MIN_RETAIL_USD,
  TRADE_NONCE_TTL_SECONDS,
  TRADE_ORDER_REF_MAX,
  TRADE_ORDER_TTL_SECONDS,
  TRADE_PARTNERS,
  TRADE_SECURITY_DOES,
  TRADE_SECURITY_STORES,
  TRADE_STANDFIRST,
  TRADE_UPLIFT_BPS,
  TRADE_WHAT_IT_IS_FOR,
  TRADE_WHAT_THIS_IS,
  TRADE_WHAT_THIS_IS_NOT,
  TRADE_WHY,
  getTradePartner,
  tradeEligibleButUnshelved,
  tradeNetUsd,
  tradePriceUsd,
  tradeShelf,
  tradeShelfEntry,
  type TradeError,
} from "@/store/trade-counter";
import type { HonoEnv } from "@/types";

/**
 * THE TRADE COUNTER'S DOORS (2026-09-03).
 *
 *   GET  /health                          — the liveness a marketplace's
 *                                           contract asks for, 200 and a
 *                                           pointer to the fuller one
 *   GET  /trade                           — the room: HTML to a person,
 *                                           the five answers to an agent
 *   GET  /api/trade/contract              — the contract, derived
 *   GET  /api/trade/ledger                — every account's receivable
 *   POST /api/trade/{account}/{item_id}   — the paid door, signed
 *
 * THE PAID DOOR IS NOT UNDER /api/buy AND THAT IS THE DESIGN. The
 * payment gate is mounted on /api/buy/*; a trade order never meets it,
 * so there is no bypass flag to get wrong and no way for a verified
 * partner to be handed a 402. The order of checks inside the handler
 * is the order that leaks least and costs least: account, size,
 * secrets, signature, replay, item, inputs, cap — and only then the
 * goods, and only after the goods, the books.
 */
export const tradeCounterRoutes = new Hono<HonoEnv>();

const REPO_SIGNER =
  "https://github.com/seancrecord/scvd-general-store-repo/blob/main/src/lib/trade-auth.ts";

function refusal(error: TradeError | { status: number; code: string }, message: string) {
  return {
    delivered: false,
    billed: false,
    code: error.code,
    error: message,
  };
}

function errorByCode(code: string): TradeError {
  const found = TRADE_ERRORS.find((entry) => entry.code === code);
  if (!found) {
    // Every code the handler can emit is a row; a test holds it.
    return { status: 500, code, meaning: code, what_to_do: "" };
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* GET /health                                                        */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.get("/health", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    service: STORE_SERVICE_NAME,
    checked_at: new Date().toISOString(),
    what_this_is:
      "The one-line liveness a reseller's contract asks for: the Worker answered. The fuller, signed reading of whether the store is actually open is one hop away.",
    liveness: `${c.env.STORE_BASE_URL}/.well-known/liveness.json`,
    trade_counter: `${c.env.STORE_BASE_URL}/trade`,
  });
});

/* ------------------------------------------------------------------ */
/* The contract, derived                                              */
/* ------------------------------------------------------------------ */

function dialectRow(dialect: (typeof TRADE_DIALECTS)[keyof typeof TRADE_DIALECTS]) {
  return {
    id: dialect.id,
    name: dialect.name,
    headers: {
      ...(dialect.provider_key_header
        ? { provider_key: dialect.provider_key_header }
        : {}),
      timestamp: dialect.timestamp_header,
      ...(dialect.nonce_header ? { nonce: dialect.nonce_header } : {}),
      signature: dialect.signature_header,
    },
    signing_string: dialect.signing_string,
    signing_string_in_words:
      dialect.signing_string === "timestamp.nonce.body"
        ? 'timestamp + "." + nonce + "." + exact_raw_body'
        : 'timestamp + "." + exact_raw_body',
    signature: `${dialect.signature_prefix}<lowercase hex of HMAC-SHA256(secret, signing_string)>`,
    timestamp_unit: `unix ${dialect.timestamp_unit}`,
    ...(dialect.nonce_pattern ? { nonce: dialect.nonce_pattern.source } : {}),
    window_seconds: dialect.window_seconds,
  };
}

function shelfRows(base: string) {
  return tradeShelf().map(({ item, input, fields }) => {
    const price = tradePriceUsd(item, TRADE_EXAMPLE_SHARE_BPS);
    return {
      item_id: item.id,
      name: item.name,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      retail_usd: item.price_usdc,
      trade_price_usd_at_example_share: price,
      store_net_usd_at_example_share: tradeNetUsd(price, TRADE_EXAMPLE_SHARE_BPS),
      cadence: item.cadence,
      input_kind: input,
      fields: [...fields, ...TRADE_COMMON_FIELDS],
      item_page: `${base}/menu/${item.id}`,
      front_door: `${base}/api/buy/${item.id}`,
    };
  });
}

function accountRows(base: string) {
  return TRADE_PARTNERS.map((partner) => ({
    account: partner.id,
    name: partner.name,
    site: partner.site,
    dialect: partner.dialect,
    mode: partner.mode,
    opened: partner.opened,
    partner_share_bps: partner.partner_share_bps,
    settles_in: partner.settles_in,
    daily_cap: partner.daily_cap,
    door: `${base}/api/trade/${partner.id}/{item_id}`,
    items: partner.items.flatMap((itemId) => {
      const item = getMenuItem(itemId);
      const entry = tradeShelfEntry(itemId);
      if (!item || !entry) return [];
      const price = tradePriceUsd(item, partner.partner_share_bps);
      return [
        {
          item_id: itemId,
          trade_price_usd: price,
          partner_share_usd: Math.round((price - tradeNetUsd(price, partner.partner_share_bps)) * 100) / 100,
          store_net_usd: tradeNetUsd(price, partner.partner_share_bps),
          fields: [...entry.fields, ...TRADE_COMMON_FIELDS],
        },
      ];
    }),
  }));
}

function pricingBlock() {
  return {
    rule: "trade_price = ceil_to_cent( retail × (1 + uplift) ÷ (1 − partner_share) ). After the partner's share the store nets retail plus the uplift, never less than the front door would have taken.",
    uplift_bps: TRADE_UPLIFT_BPS,
    min_retail_usd: TRADE_MIN_RETAIL_USD,
    example_share_bps: TRADE_EXAMPLE_SHARE_BPS,
    cadence:
      "One-off, per delivery. Nothing at the counter recurs, and an account is never charged for a delivery that did not happen.",
    what_the_partner_charges_its_customer: "Theirs to set. The trade price is the floor they owe us per delivery, not a price we set for their customer.",
  };
}

function howToCall(base: string) {
  const dialect = TRADE_DIALECTS.canonical;
  return {
    request: `POST ${base}/api/trade/{account}/{item_id}`,
    content_type: "application/json",
    body: "One JSON object carrying the item's fields (see shelf[].fields) at the top level or under `inputs`, plus optional order_ref (idempotency, up to 120 chars), agent_name and purpose.",
    headers_in_our_dialect: dialectRow(dialect).headers,
    sign: `HMAC-SHA256 with the secret you issued us, over ${dialectRow(dialect).signing_string_in_words}; send as ${dialect.signature_header}: ${dialect.signature_prefix}<hex>. Timestamp is unix seconds; nonce is 32 hex characters, fresh per request.`,
    then: "Expect 200 and one JSON object inside 30 seconds. Anything else is a named refusal with delivered:false and billed:false; see errors.",
    reference_signer: REPO_SIGNER,
    limits: {
      body_max_bytes: TRADE_BODY_MAX_BYTES,
      timestamp_window_seconds: dialect.window_seconds,
      nonce_remembered_seconds: TRADE_NONCE_TTL_SECONDS,
      order_ref_remembered_seconds: TRADE_ORDER_TTL_SECONDS,
      order_ref_max_chars: TRADE_ORDER_REF_MAX,
      response_seconds: 30,
    },
  };
}

const EXPECTED_OUTCOME =
  "200 with the same delivery object the front door returns for that item — deliverable, any item extras, the signed certificate with signature, public key and verify_url — plus a `trade` block naming the account, the trade price, the store's net and the sha256 of your signed instruction, and settled_via saying trade_account (or trade_account_test while the account is in test). No paid_usdc, no network, no payer: none applied.";

function termsJson(base: string) {
  return {
    what_this_is: TRADE_WHAT_THIS_IS,
    opened: TRADE_COUNTER_OPENED,
    door: `${base}/api/trade/{account}/{item_id}`,
    how_to_call: howToCall(base),
    dialects: Object.values(TRADE_DIALECTS).map(dialectRow),
    pricing: pricingBlock(),
    shelf: shelfRows(base),
    eligible_but_not_yet_shelved: tradeEligibleButUnshelved(),
    accounts: accountRows(base),
    expected_outcome: EXPECTED_OUTCOME,
    errors: TRADE_ERRORS,
    ledger: `${base}/api/trade/ledger`,
    room: `${base}/trade`,
    honest_limits: TRADE_HONEST_LIMITS,
    security: securityBlock(base, {
      does_in_your_name: TRADE_SECURITY_DOES,
      stores: TRADE_SECURITY_STORES,
    }),
  };
}

tradeCounterRoutes.get("/api/trade/contract", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(termsJson(c.env.STORE_BASE_URL));
});

tradeCounterRoutes.get("/api/trade/ledger", async (c) => {
  const accounts = await tradeLedger(c.env);
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    what_this_is:
      "Every trade account's books, derived from the delivery rows at request time: what was delivered, what it was billed at, what the store is owed after the partner's share, what has been paid in, and what is outstanding. Test-mode deliveries are counted and not billed.",
    read_at: new Date().toISOString(),
    accounts,
    bounded_read:
      "A capped read. When `truncated` is true on an account, every figure on that row is a floor, not a total, and says so here rather than pretending (house rule 52).",
    terms: `${c.env.STORE_BASE_URL}/api/trade/contract`,
  });
});

/* ------------------------------------------------------------------ */
/* The room                                                           */
/* ------------------------------------------------------------------ */

const ROOM_TITLE = TRADE_COUNTER_NAME;
const ROOM_DESCRIPTION =
  "Resell scvd.store's signed instruments under your own roof: your customer pays you, you send one signed webhook, we deliver the same verifiable goods and bill your account. Public trade prices, a published ledger, no x402 in your customer's path.";

function roomJson(base: string) {
  return {
    what_this_is: TRADE_WHAT_THIS_IS,
    standfirst: TRADE_STANDFIRST,
    what_you_can_use_it_for: TRADE_WHAT_IT_IS_FOR,
    what_this_is_not: TRADE_WHAT_THIS_IS_NOT,
    why_a_marketplace_would: TRADE_WHY,
    how_it_works: TRADE_HOW_IT_WORKS,
    price: {
      this_surface: "free",
      cadence: "not applicable — nothing is charged for reading this",
      the_counter: pricingBlock(),
      shelf: shelfRows(base),
      accounts_today: TRADE_PARTNERS.map((partner) => ({
        account: partner.id,
        name: partner.name,
        mode: partner.mode,
        partner_share_bps: partner.partner_share_bps,
      })),
    },
    how_to_call: howToCall(base),
    expected_outcome: EXPECTED_OUTCOME,
    errors: TRADE_ERRORS,
    faq: TRADE_FAQ,
    open_an_account: {
      how: `POST ${base}/api/letter with {"letter": "..."} naming your platform, the dialect you sign in (or that you will use ours), the items you want, and expected daily volume. A human reads it; accounts open in test mode.`,
      what_you_issue_us: "One HMAC signing secret, and a provider key if your scheme sends one. Nothing of ours is ever asked of you.",
    },
    terms: `${base}/api/trade/contract`,
    ledger: `${base}/api/trade/ledger`,
    security: securityBlock(base, {
      does_in_your_name: TRADE_SECURITY_DOES,
      stores: TRADE_SECURITY_STORES,
    }),
    corrections: CORRECTIONS_POINTER,
    honest_limits: TRADE_HONEST_LIMITS,
  };
}

function roomHtml(base: string): string {
  const why = TRADE_WHY.map(
    (entry) =>
      `<li><strong>${escapeHtml(entry.point)}</strong> ${escapeHtml(entry.because)}</li>`,
  ).join("");
  const steps = TRADE_HOW_IT_WORKS.map(
    (entry) =>
      `<li><strong>${escapeHtml(entry.name)}.</strong> ${escapeHtml(entry.what_happens)} <em>Check it yourself: ${escapeHtml(entry.what_you_can_check)}</em></li>`,
  ).join("");
  const shelf = shelfRows(base)
    .map(
      (row) =>
        `<tr><td><a href="/menu/${escapeHtml(row.item_id)}">${escapeHtml(row.name)}</a></td><td>$${row.retail_usd}</td><td>$${row.trade_price_usd_at_example_share.toFixed(2)}</td><td>$${row.store_net_usd_at_example_share.toFixed(2)}</td><td><code>${escapeHtml(row.fields.join(", "))}</code></td></tr>`,
    )
    .join("");
  const errors = TRADE_ERRORS.map(
    (entry) =>
      `<li><code>${entry.status} ${escapeHtml(entry.code)}</code> — ${escapeHtml(entry.meaning)} <em>${escapeHtml(entry.what_to_do)}</em></li>`,
  ).join("");
  const faq = TRADE_FAQ.map(
    (entry) =>
      `<p class="menu-desc"><strong>${escapeHtml(entry.q)}</strong><br>${escapeHtml(entry.a)}</p>`,
  ).join("");
  const dialect = dialectRow(TRADE_DIALECTS.canonical);
  const accounts = TRADE_PARTNERS.map(
    (partner) =>
      `<li><strong>${escapeHtml(partner.name)}</strong> — ${escapeHtml(partner.mode)} mode, partner share ${partner.partner_share_bps / 100}%, opened ${escapeHtml(partner.opened)}, ${partner.items.length} items on the account.</li>`,
  ).join("");
  return `<section>
  <p class="menu-desc"><strong>${escapeHtml(TRADE_STANDFIRST)}</strong></p>
  <p class="menu-desc">${escapeHtml(TRADE_WHAT_THIS_IS)}</p>
  <p class="menu-desc"><strong>The numbers first.</strong> ${tradeShelf().length} instruments at the counter, from $${Math.min(...tradeShelf().map((row) => row.item.price_usdc))} retail. Trade price is retail plus ${TRADE_UPLIFT_BPS / 100}% net of your share, rounded up to the cent. ${TRADE_PARTNERS.length} account${TRADE_PARTNERS.length === 1 ? "" : "s"} open today. Every account's receivable is public at <a href="/api/trade/ledger"><code>/api/trade/ledger</code></a>.</p>
</section>
<section>
  <h2>Why a marketplace would</h2>
  <ul>${why}</ul>
</section>
<section>
  <h2>How it works</h2>
  <ol>${steps}</ol>
</section>
<section>
  <h2>The shelf at the counter</h2>
  <p class="menu-desc">Prices printed at a ${TRADE_EXAMPLE_SHARE_BPS / 100}% partner share; your account's row at <a href="/api/trade/contract"><code>/api/trade/contract</code></a> prints them at yours. What you charge your customer above the trade price is your business.</p>
  <table>
    <thead><tr><th>Item</th><th>Retail</th><th>Trade price</th><th>Store nets</th><th>Fields</th></tr></thead>
    <tbody>${shelf}</tbody>
  </table>
  <p class="menu-desc">Not at the counter: the penny shelf (under $${TRADE_MIN_RETAIL_USD} retail cannot be split in sats), the human-queue shelf, stocked units, and the term watches. The front door sells all of them.</p>
</section>
<section>
  <h2>The call</h2>
  <p class="menu-desc"><code>POST ${escapeHtml(base)}/api/trade/{account}/{item_id}</code> with one JSON object. Sign HMAC-SHA256 over <code>${escapeHtml(dialect.signing_string_in_words)}</code> with the secret you issued us and send it as <code>${escapeHtml(dialect.headers.signature)}: sha256=&lt;hex&gt;</code>, beside <code>${escapeHtml(dialect.headers.timestamp)}</code> (unix seconds) and <code>${escapeHtml(dialect.headers.nonce ?? "")}</code> (32 hex, fresh each call). Timestamps outside five minutes and nonces seen before are refused. Send <code>order_ref</code> on every call so a retry after a timeout returns the original delivery instead of a second one. A partner that already signs in another dialect keeps it; the account row names which.</p>
  <p class="menu-desc">The reference signer is public: <a href="${REPO_SIGNER}"><code>src/lib/trade-auth.ts</code></a>. Sign a body with it and compare bytes with yours before the account goes live.</p>
  <h3>Every refusal, by name</h3>
  <ul>${errors}</ul>
</section>
<section>
  <h2>What the receipt says</h2>
  <p class="menu-desc">${escapeHtml(TRADE_FAQ[0]?.a ?? "")}</p>
</section>
<section>
  <h2>Accounts open</h2>
  <ul>${accounts}</ul>
  <p class="menu-desc"><strong>Open one.</strong> Write to the store at <code>POST /api/letter</code> with your platform, the dialect you sign in, the items you want, and expected daily volume. A human reads it. Accounts open in test mode: real signatures, real goods, nothing owed by anyone until the terms are settled. You issue us one secret; nothing of ours is ever asked of you.</p>
</section>
<section>
  <h2>Questions people ask</h2>
  ${faq}
</section>
<section>
  <h2>What this is not</h2>
  <p class="menu-desc">${escapeHtml(TRADE_WHAT_THIS_IS_NOT)}</p>
  <p class="menu-desc"><strong>Honest limits.</strong> ${escapeHtml(TRADE_HONEST_LIMITS)}</p>
</section>`;
}

tradeCounterRoutes.get("/trade.json", (c) => c.json(roomJson(c.env.STORE_BASE_URL)));

tradeCounterRoutes.get("/trade", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.html(
      renderSimplePage({
        title: ROOM_TITLE,
        description: ROOM_DESCRIPTION,
        path: "/trade",
        bodyHtml: roomHtml(base),
      }),
    );
  }
  return c.json(roomJson(base));
});

/* ------------------------------------------------------------------ */
/* POST /api/trade/:partner/:item_id — the paid door                  */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.post("/api/trade/:partner/:item_id", async (c) => {
  c.header("Cache-Control", "no-store");
  const partner = getTradePartner(c.req.param("partner"));
  if (!partner) {
    const error = errorByCode("unknown_account");
    return c.json(refusal(error, error.meaning), 404);
  }

  /*
   * SIZE BEFORE BYTES. The declared length is refused before the body
   * is read, and the read length is refused after, because a client
   * can lie about the first and not about the second.
   */
  const declared = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > TRADE_BODY_MAX_BYTES) {
    const error = errorByCode("body_too_large");
    return c.json(refusal(error, error.meaning), 413);
  }
  const rawBody = await c.req.text();
  if (new TextEncoder().encode(rawBody).byteLength > TRADE_BODY_MAX_BYTES) {
    const error = errorByCode("body_too_large");
    return c.json(refusal(error, error.meaning), 413);
  }

  const secrets = tradeSecrets(c.env, partner);
  if (!secrets || !c.env.TRADE_NONCES) {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }

  const dialect = TRADE_DIALECTS[partner.dialect];
  const verdict = await verifyTradeRequest({
    dialect,
    header: (name) => c.req.header(name),
    rawBody,
    secrets,
    now_ms: Date.now(),
  });
  if (!verdict.ok) {
    const error = errorByCode(verdict.code);
    return c.json(refusal(error, error.meaning), 401);
  }

  /*
   * REPLAY, AFTER THE SIGNATURE. A caller without the secret must not
   * be able to fill the nonce store, so the claim happens only once
   * the instruction is known to be the partner's. And the claim is
   * BEFORE the goods: a delivery that then fails burns the nonce,
   * which is the cheap direction — the partner retries with a fresh
   * one, and order_ref (below) makes that retry safe.
   */
  const claim = await claimTradeNonce(
    c.env,
    partner.id,
    verdict.replay_key,
    TRADE_NONCE_TTL_SECONDS,
  );
  if (claim === "unavailable") {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  if (claim === "seen") {
    const error = errorByCode("replayed");
    return c.json(refusal(error, error.meaning), 409);
  }

  const itemId = c.req.param("item_id");
  const item = getMenuItem(itemId);
  const entry = tradeShelfEntry(itemId);
  if (!item || !entry || !partner.items.includes(itemId)) {
    const error = errorByCode("not_at_the_counter");
    return c.json(refusal(error, error.meaning), 404);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const error = errorByCode("bad_request");
    return c.json(refusal(error, "The body is not JSON."), 400);
  }
  const checked = validateTradeInputs(c.env, item, entry, body);
  if (!checked.ok) {
    return c.json(refusal({ status: checked.status, code: checked.code }, checked.error), checked.status);
  }

  /*
   * THE PARTNER'S OWN RETRY, HONOURED. A timed-out call may or may not
   * have delivered; the same order_ref inside a day returns whatever
   * it delivered, once, unbilled a second time. Read here, after the
   * signature — a cached delivery is the partner's to recall and
   * nobody else's.
   */
  if (checked.order_ref) {
    const recalled = await recallOrder(c.env, partner, checked.order_ref);
    if (recalled) {
      return c.json({ ...recalled, replayed_order_ref: true }, 200);
    }
  }

  const day = utcDay();
  if ((await tradeDayCount(c.env, partner, day)) >= partner.daily_cap) {
    await alertCapReached(c.env, partner, day);
    const error = errorByCode("cap_reached");
    return c.json(refusal(error, error.meaning), 429);
  }

  const settlement = tradeSettlementFor(partner, item, verdict.instruction_digest, checked.order_ref);
  const response = await fulfillPurchase(c.env, item, tradePending(settlement), checked.input);

  /*
   * THE BOOKS, LAST. Delivered and not booked is the direction the
   * store accepts (rule 9); booked and not delivered is the one it
   * refuses. A failure here is alerted through the store's own
   * channel and the partner still gets their goods.
   */
  const certificate = response["certificate"];
  const certId =
    certificate && typeof certificate === "object" && "cert_id" in certificate
      ? String((certificate as { cert_id: unknown }).cert_id)
      : "unknown";
  try {
    await recordTradeDelivery(c.env, partner, item, settlement, certId, response);
  } catch (error) {
    const { sendAlert } = await import("@/lib/alerts");
    await sendAlert(c.env, {
      condition: "books_invariant",
      key: `trade-row-${certId}`,
      detail: `A trade delivery went out and its ledger row did not write: account ${partner.id}, item ${item.id}, certificate ${certId}, instruction ${settlement.instruction_digest}. The goods are delivered; the statement is short one line of $${settlement.net_usd}. Add it by hand from the certificate. ${String(error)}`,
    }).catch(() => undefined);
  }

  return c.json(
    {
      ...response,
      signed_with: verdict.signed_with,
    },
    200,
  );
});
