import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT, prefersMarkdown } from "@/lib/accept";
import {
  JSONLD_PRICE_CURRENCY,
  JSONLD_TRADE_ACCEPTED_PAYMENT,
  jsonLdScript,
  organizationRef,
} from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { diagnoseTradeRequest, verifyTradeRequest } from "@/lib/trade-auth";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { fulfillPurchase } from "@/services/fulfillment";
import {
  alertCapReached,
  creditCeilingReached,
  findTradeDelivery,
  notifyTradeCallback,
  recallOrder,
  recordTradeDelivery,
  shareForNextDelivery,
  signedStatement,
  workedExample,
  tradeCatalog,
  tradeDayCount,
  tradeLedger,
  tradePending,
  tradeSecrets,
  tradeSettlementFor,
  tradeStatement,
  utcDay,
  validateTradeInputs,
} from "@/services/trade-counter";
import { claimTradeNonce, peekTradeNonce } from "@/services/trade-nonces";
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
  TRADE_FOR_MONEY,
  TRADE_HONEST_LIMITS,
  TRADE_HOW_IT_WORKS,
  TRADE_MIN_RETAIL_USD,
  TRADE_NONCE_TTL_SECONDS,
  TRADE_ORDER_REF_MAX,
  TRADE_ORDER_TTL_SECONDS,
  TRADE_PARTNERS,
  TRADE_SANDBOX_ID,
  TRADE_SECURITY_DOES,
  TRADE_SECURITY_STORES,
  TRADE_SNIPPETS,
  TRADE_STANDFIRST,
  STANDARD_SHARE_LADDER,
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
 *   GET  /api/trade/catalog               — the shelf, as a listing feed
 *   GET  /api/trade/ledger                — every account's receivable
 *   POST /api/trade/{account}/check       — the check desk: every check
 *                                           reported, nothing delivered
 *   GET  /api/trade/{account}/statement   — the account's own rows, signed
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
    credit_ceiling_usd: partner.credit_ceiling_usd,
    ...(partner.share_ladder ? { share_ladder: partner.share_ladder } : {}),
    door: `${base}/api/trade/${partner.id}/{item_id}`,
    claim: `${base}/api/trade/${partner.id}/claim?order_ref=`,
    check_desk: `${base}/api/trade/${partner.id}/check`,
    statement: `${base}/api/trade/${partner.id}/statement`,
    ...(partner.sandbox
      ? {
          published_secret: partner.sandbox.signing_secret,
          published_provider_key: partner.sandbox.provider_key,
          note: "A sandbox: anyone may sign with this secret. Real goods, marked test, booked nowhere, fifty a day.",
        }
      : {}),
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
    body: "One JSON object carrying the item's fields (see shelf[].fields) at the top level or under `inputs`, plus optional order_ref (idempotency, up to 120 chars), agent_name, purpose, and callback_url (an https URL we POST the signed delivery receipt to, once, after the response).",
    signers: TRADE_SNIPPETS,
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

async function termsJson(base: string) {
  const sandbox = getTradePartner(TRADE_SANDBOX_ID);
  return {
    what_this_is: TRADE_WHAT_THIS_IS,
    opened: TRADE_COUNTER_OPENED,
    door: `${base}/api/trade/{account}/{item_id}`,
    how_to_call: howToCall(base),
    dialects: Object.values(TRADE_DIALECTS).map(dialectRow),
    ...(sandbox ? { worked_example: await workedExample(base, sandbox) } : {}),
    pricing: {
      ...pricingBlock(),
      share_ladder_offered: STANDARD_SHARE_LADDER,
      share_ladder_note:
        "The standard offer for a new account: the partner's share rises with live deliveries in the calendar month, highest tier reached wins, and the trade price is derived from the share so the store's net stays retail plus the uplift at every tier. An account with its own contract keeps its flat share.",
    },
    shelf: shelfRows(base),
    eligible_but_not_yet_shelved: tradeEligibleButUnshelved(),
    accounts: accountRows(base),
    expected_outcome: EXPECTED_OUTCOME,
    errors: TRADE_ERRORS,
    catalog: `${base}/api/trade/catalog`,
    ledger: `${base}/api/trade/ledger`,
    sandbox: `${base}/api/trade/${TRADE_SANDBOX_ID}/check`,
    room: `${base}/trade`,
    honest_limits: TRADE_HONEST_LIMITS,
    security: securityBlock(base, {
      does_in_your_name: TRADE_SECURITY_DOES,
      stores: TRADE_SECURITY_STORES,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The catalog feed                                                   */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.get("/api/trade/catalog", (c) => {
  const base = c.env.STORE_BASE_URL;
  const accountId = c.req.query("account");
  const partner = accountId ? getTradePartner(accountId) : undefined;
  if (accountId && !partner) {
    return c.json({ error: "No trade account by that name.", code: "unknown_account" }, 404);
  }
  const share = partner ? partner.partner_share_bps : TRADE_EXAMPLE_SHARE_BPS;
  const rows = tradeCatalog(base, share).filter(
    (row) => !partner || partner.items.includes(row.item_id),
  );
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    what_this_is:
      "Every item at the trade counter as a listing feed: the copy the item page prints, what it reads, its constraints, the free specimen, the artifact class and what it does not prove, and the price at the account's share. Derived from the same rows the shelf renders, so a listing built from this cannot say something our own shelf does not.",
    ...(partner ? { account: partner.id, share_bps: share } : { share_bps: share, note: "Printed at the example share; pass ?account={id} for an account's own prices and items." }),
    items: rows,
    pricing_rule: pricingBlock().rule,
    contract: `${base}/api/trade/contract`,
    verify_note:
      "Every artifact an item delivers verifies free, forever, at the verify_url_template — a listing may promise that to its customers because it is not our word, it is a check they can run.",
  });
});

/* ------------------------------------------------------------------ */
/* The check desk                                                     */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.post("/api/trade/:partner/check", async (c) => {
  c.header("Cache-Control", "no-store");
  const partner = getTradePartner(c.req.param("partner"));
  if (!partner) {
    const error = errorByCode("unknown_account");
    return c.json(refusal(error, error.meaning), 404);
  }
  const rawBody = await c.req.text();
  const secrets = tradeSecrets(c.env, partner);
  if (!secrets) {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  const dialect = TRADE_DIALECTS[partner.dialect];
  const diagnosis = await diagnoseTradeRequest({
    dialect,
    header: (name) => c.req.header(name),
    rawBody,
    secrets,
    now_ms: Date.now(),
    reveal: partner.sandbox !== undefined,
  });
  const replayKey =
    dialect.signing_string === "timestamp.nonce.body"
      ? diagnosis.nonce.raw
      : diagnosis.signing_string.sha256;
  const seen = replayKey ? await peekTradeNonce(c.env, partner.id, replayKey) : "unavailable";
  return c.json({
    what_this_is:
      "The check desk: the same four checks the order door runs, every one reported rather than the first refused. Nothing is delivered, no nonce is consumed, no money moves. Send exactly the headers and body you would send to the order door.",
    account: partner.id,
    dialect: dialectRow(dialect),
    would_pass: diagnosis.would_pass,
    first_failure: diagnosis.first_failure,
    checks: {
      headers: diagnosis.headers,
      provider_key: diagnosis.provider_key,
      timestamp: diagnosis.timestamp,
      nonce: diagnosis.nonce,
      signature: diagnosis.signature,
      replay: seen === "unavailable" ? "store_unavailable" : seen ? "already_presented" : "fresh",
    },
    signing_string: {
      ...diagnosis.signing_string,
      how_to_compare:
        "Compute sha256 over the exact string your signer fed to HMAC. If it differs from ours, the bytes differ — usually a re-serialised body, a trailing newline, or the wrong field order in the string — and no secret will make the signature match.",
    },
    ...(diagnosis.expected_signature ? { expected_signature: diagnosis.expected_signature } : {}),
    body_bytes: new TextEncoder().encode(rawBody).byteLength,
    errors: TRADE_ERRORS,
  });
});

/* ------------------------------------------------------------------ */
/* The account's own statement, signed                                */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.get("/api/trade/:partner/statement", async (c) => {
  c.header("Cache-Control", "no-store");
  const partner = getTradePartner(c.req.param("partner"));
  if (!partner) {
    const error = errorByCode("unknown_account");
    return c.json(refusal(error, error.meaning), 404);
  }
  const secrets = tradeSecrets(c.env, partner);
  if (!secrets || !c.env.TRADE_NONCES) {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  // A GET signs the empty body: timestamp.nonce."" under the account's dialect.
  const verdict = await verifyTradeRequest({
    dialect: TRADE_DIALECTS[partner.dialect],
    header: (name) => c.req.header(name),
    rawBody: "",
    secrets,
    now_ms: Date.now(),
  });
  if (!verdict.ok) {
    const error = errorByCode(verdict.code);
    return c.json(refusal(error, error.meaning), 401);
  }
  const claim = await claimTradeNonce(c.env, partner.id, verdict.replay_key, TRADE_NONCE_TTL_SECONDS);
  if (claim === "unavailable") {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  if (claim === "seen") {
    const error = errorByCode("replayed");
    return c.json(refusal(error, error.meaning), 409);
  }
  const readAt = new Date().toISOString();
  const signed = await signedStatement(c.env, partner, readAt);
  return c.json({
    what_this_is:
      "Your account's statement, both sides: every delivery row (item, certificate, trade price, your share, our net, your order_ref) and every payout the keeper has recorded, newest first, with the summary the public ledger prints — signed with the store's published key, so your own tooling can check it offline. Reconcile it against your own; a line you dispute is a letter to the store.",
    read_at: readAt,
    signed_with: verdict.signed_with,
    ...signed.signed_payload,
    signed_payload: signed.signed_payload,
    signature_jcs: signed.signature_jcs,
    public_key: signed.public_key,
    algorithm: "ed25519",
    signature_covers: signed.signature_covers,
    canonical_form: signed.canonical_form,
  });
});

tradeCounterRoutes.get("/api/trade/contract", async (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(await termsJson(c.env.STORE_BASE_URL));
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
      for_money: TRADE_FOR_MONEY,
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
    try_it_now: sandboxBlock(base),
    open_an_account: {
      how: `Prove your signer on the sandbox, then POST ${base}/api/letter with {"letter": "..."} naming your platform, the dialect you sign in (or that you will use ours), the items you want, and expected daily volume. A human reads it; accounts open in test mode.`,
      what_you_issue_us: "One HMAC signing secret, and a provider key if your scheme sends one. Nothing of ours is ever asked of you.",
    },
    terms: `${base}/api/trade/contract`,
    catalog: `${base}/api/trade/catalog`,
    ledger: `${base}/api/trade/ledger`,
    security: securityBlock(base, {
      does_in_your_name: TRADE_SECURITY_DOES,
      stores: TRADE_SECURITY_STORES,
    }),
    corrections: CORRECTIONS_POINTER,
    honest_limits: TRADE_HONEST_LIMITS,
  };
}

function sandboxBlock(base: string) {
  const sandbox = getTradePartner(TRADE_SANDBOX_ID);
  if (!sandbox?.sandbox) {
    return undefined;
  }
  const dialect = TRADE_DIALECTS[sandbox.dialect];
  return {
    account: sandbox.id,
    secret: sandbox.sandbox.signing_secret,
    provider_key: sandbox.sandbox.provider_key,
    dialect: dialect.id,
    order_door: `${base}/api/trade/${sandbox.id}/{item_id}`,
    check_desk: `${base}/api/trade/${sandbox.id}/check`,
    statement: `${base}/api/trade/${sandbox.id}/statement`,
    daily_cap: sandbox.daily_cap,
    what_you_get:
      "Real signatures checked, real goods delivered and marked test, a certificate that verifies at /api/verify, and nothing booked to anyone. The check desk on this account prints the signature we expected, since the secret is public anyway.",
  };
}

/**
 * THE ROOM'S OWN NODE: a Service with one Offer per shelf item at the
 * example share, so an answer engine reading /trade sees a thing that
 * can be bought, by whom, for how much — not only a WebPage. Prices
 * are derived from the same rule the page prints.
 */
function tradeJsonLd(base: string): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${TRADE_COUNTER_NAME}, scvd.store`,
    serviceType: "Wholesale trade account for marketplaces reselling signed x402 evidence instruments",
    description: ROOM_DESCRIPTION,
    url: `${base}/trade`,
    provider: organizationRef(base),
    audience: {
      "@type": "Audience",
      audienceType: "Marketplaces, aggregators and payment layers that resell to AI agents",
    },
    termsOfService: `${base}/api/trade/contract`,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "The shelf at the trade counter",
      itemListElement: shelfRows(base).map((row) => ({
        "@type": "Offer",
        name: row.name,
        url: row.item_page,
        price: row.trade_price_usd_at_example_share.toFixed(2),
        priceCurrency: JSONLD_PRICE_CURRENCY,
        acceptedPaymentMethod: JSONLD_TRADE_ACCEPTED_PAYMENT,
        description: `Trade price at a ${TRADE_EXAMPLE_SHARE_BPS / 100}% partner share; retail $${row.retail_usd} at the front door.`,
      })),
    },
  });
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
  <p class="menu-desc"><strong>The numbers first.</strong> ${tradeShelf().length} instruments at the counter, from $${Math.min(...tradeShelf().map((row) => row.item.price_usdc))} retail. ${escapeHtml(TRADE_FOR_MONEY)} ${TRADE_PARTNERS.length} account${TRADE_PARTNERS.length === 1 ? "" : "s"} open today. Every account's receivable is public at <a href="/api/trade/ledger"><code>/api/trade/ledger</code></a>.</p>
</section>
<section>
  <h2>Try it now, no account</h2>
  ${(() => {
    const sandbox = sandboxBlock(base);
    return sandbox
      ? `<p class="menu-desc">The sandbox account signs with a <strong>published</strong> secret: <code>${escapeHtml(sandbox.secret)}</code> (provider key <code>${escapeHtml(sandbox.provider_key)}</code>, dialect <code>${escapeHtml(sandbox.dialect)}</code>). ${escapeHtml(sandbox.what_you_get)} ${sandbox.daily_cap} deliveries a day. Start at the check desk: <code>POST ${escapeHtml(sandbox.check_desk)}</code> with the headers and body you would send to <code>${escapeHtml(sandbox.order_door)}</code>, and it reports each of the four checks by name.</p>`
      : "";
  })()}
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
  <p class="menu-meta">List from it by machine: <a href="/api/trade/catalog"><code>/api/trade/catalog</code></a> carries every item's copy, specimen, artifact class and price at your share (<code>?account=</code>).</p>
</section>
<section>
  <h2>The call</h2>
  <p class="menu-desc"><code>POST ${escapeHtml(base)}/api/trade/{account}/{item_id}</code> with one JSON object. Sign HMAC-SHA256 over <code>${escapeHtml(dialect.signing_string_in_words)}</code> with the secret you issued us and send it as <code>${escapeHtml(dialect.headers.signature)}: sha256=&lt;hex&gt;</code>, beside <code>${escapeHtml(dialect.headers.timestamp)}</code> (unix seconds) and <code>${escapeHtml(dialect.headers.nonce ?? "")}</code> (32 hex, fresh each call). Timestamps outside five minutes and nonces seen before are refused. Send <code>order_ref</code> on every call so a retry after a timeout returns the original delivery instead of a second one. A partner that already signs in another dialect keeps it; the account row names which.</p>
  <p class="menu-desc">The reference signer is public: <a href="${REPO_SIGNER}"><code>src/lib/trade-auth.ts</code></a>. Sign a body with it and compare bytes with yours before the account goes live. Or paste one of these: each runs as written against the sandbox.</p>
  ${TRADE_SNIPPETS.map((snippet) => `<details><summary>${escapeHtml(snippet.label)}</summary><pre class="menu-desc"><code>${escapeHtml(snippet.code)}</code></pre></details>`).join("")}
  <p class="menu-meta">From a shell: <code>npx scvd trade check context_anchor</code> signs a sandbox order with the published secret and asks the check desk; <code>npx scvd trade order</code> delivers. A worked example with fixed inputs and every byte shown is on <a href="/trade.md"><code>/trade.md</code></a> and at <code>worked_example</code> on the contract.</p>
  <p class="menu-desc">Lost receipts: <code>GET /api/trade/{account}/claim?order_ref=</code>, signed over the empty body, returns the delivery your account ordered under that reference, for the customer who lost it. Volume: the standard offer raises your share with live deliveries in the month — ${STANDARD_SHARE_LADDER.map((tier) => `${tier.partner_share_bps / 100}% from ${tier.from_monthly_deliveries.toLocaleString("en-US")}`).join(", ")} — and the trade price is derived from the share, so the store nets the same at every tier.</p>
  <p class="menu-desc">Your own statement, both sides, is yours to read: <code>GET /api/trade/{account}/statement</code>, signed over the empty body like any order. Refunds to your customer are yours; this store took no payment and can return none.</p>
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

/**
 * THE SAME ROOM IN MARKDOWN — for the agent that prefers it, and at the
 * address a checklist guesses (/trade.md), exactly as /pricing.md
 * relates to /pricing: one document, two addresses, the canonical
 * pointing home. Rendered from the same constants the page and the
 * JSON twin read, so rule 60's sentences cannot drift here either.
 */
async function tradeMarkdown(base: string): Promise<string> {
  const sandboxAccount = getTradePartner(TRADE_SANDBOX_ID);
  const example = sandboxAccount ? await workedExample(base, sandboxAccount) : null;
  const walkthrough = example
    ? `## The worked example, every byte
${example.what_this_is}

Door: \`POST ${example.door}\`

Body (${example.body_bytes} bytes, sent exactly as shown):

\`\`\`json
${example.body}
\`\`\`

Signing string (\`timestamp.nonce.body\`):

\`\`\`
${example.signing_string}
\`\`\`

sha256 of the signing string: \`${example.signing_string_sha256}\`

Headers:

\`\`\`
X-Trade-Key: ${example.headers["X-Trade-Key"]}
X-Trade-Timestamp: ${example.headers["X-Trade-Timestamp"]}
X-Trade-Nonce: ${example.headers["X-Trade-Nonce"]}
X-Trade-Signature: ${example.headers["X-Trade-Signature"]}
\`\`\`

${example.how_to_compare}
`
    : "";
  const shelf = shelfRows(base)
    .map(
      (row) =>
        `| ${row.name} | $${row.retail_usd} | $${row.trade_price_usd_at_example_share.toFixed(2)} | $${row.store_net_usd_at_example_share.toFixed(2)} | ${row.fields.join(", ")} |`,
    )
    .join("\n");
  const errors = TRADE_ERRORS.map(
    (entry) => `- \`${entry.status} ${entry.code}\` — ${entry.meaning} ${entry.what_to_do}`,
  ).join("\n");
  const faq = TRADE_FAQ.map((entry) => `**${entry.q}**\n\n${entry.a}`).join("\n\n");
  const steps = TRADE_HOW_IT_WORKS.map(
    (entry) => `${entry.step}. **${entry.name}.** ${entry.what_happens} _Check it yourself: ${entry.what_you_can_check}_`,
  ).join("\n");
  const why = TRADE_WHY.map((entry) => `- **${entry.point}** ${entry.because}`).join("\n");
  const sandbox = sandboxBlock(base);
  const dialect = dialectRow(TRADE_DIALECTS.canonical);
  return `# ${TRADE_COUNTER_NAME}

${TRADE_STANDFIRST}

${TRADE_WHAT_THIS_IS}

${TRADE_FOR_MONEY}

## Try it now, no account
${
  sandbox
    ? `The sandbox account signs with a published secret: \`${sandbox.secret}\` (provider key \`${sandbox.provider_key}\`, dialect \`${sandbox.dialect}\`). ${sandbox.what_you_get} ${sandbox.daily_cap} deliveries a day. Start at the check desk: \`POST ${sandbox.check_desk}\` with the headers and body you would send to \`${sandbox.order_door}\`.`
    : ""
}

## Why a marketplace would
${why}

## How it works
${steps}

## The shelf at the counter
Prices at a ${TRADE_EXAMPLE_SHARE_BPS / 100}% partner share; your account's row at ${base}/api/trade/contract prints them at yours. List by machine from ${base}/api/trade/catalog.

| Item | Retail | Trade price | Store nets | Fields |
|---|---|---|---|---|
${shelf}

## The call
\`POST ${base}/api/trade/{account}/{item_id}\` with one JSON object. Sign HMAC-SHA256 over \`${dialect.signing_string_in_words}\` with the secret you issued us; send it as \`${dialect.headers.signature}: sha256=<hex>\` beside \`${dialect.headers.timestamp}\` (unix seconds) and \`${dialect.headers.nonce ?? ""}\` (32 hex, fresh each call). Timestamps outside five minutes and nonces seen before are refused. Send \`order_ref\` on every call. Your own statement: \`GET ${base}/api/trade/{account}/statement\`, signed over the empty body. Reference signer: ${REPO_SIGNER}

${walkthrough}
### A signer to paste
${TRADE_SNIPPETS.map((snippet) => `**${snippet.label}**\n\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\``).join("\n\n")}

From a shell: \`npx scvd trade check context_anchor\` signs a sandbox order with the published secret and asks the check desk; \`npx scvd trade order\` delivers. Add \`callback_url\` to any order and the signed delivery receipt is POSTed there once, after the response.

### Every refusal, by name
${errors}

## Questions people ask
${faq}

## What this is not
${TRADE_WHAT_THIS_IS_NOT}

**Honest limits.** ${TRADE_HONEST_LIMITS}

The contract: ${base}/api/trade/contract · the ledger: ${base}/api/trade/ledger · this room as JSON: ${base}/trade.json · corrections: ${base}/corrections
`;
}

tradeCounterRoutes.get("/trade.json", (c) => c.json(roomJson(c.env.STORE_BASE_URL)));

tradeCounterRoutes.get("/trade.md", async (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.text(await tradeMarkdown(base), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    Vary: VARY_ACCEPT,
    Link: `<${base}/trade>; rel="canonical"`,
  });
});

tradeCounterRoutes.get("/trade", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const accept = c.req.header("Accept");
  const html = wantsHtml(accept, c.req.header("User-Agent"));
  if (prefersMarkdown(accept, html ? "text/html" : "application/json")) {
    return c.text(await tradeMarkdown(base), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
    });
  }
  if (html) {
    return c.html(
      renderSimplePage({
        title: ROOM_TITLE,
        description: ROOM_DESCRIPTION,
        path: "/trade",
        markdownAlt: "/trade.md",
        bodyHtml: `${roomHtml(base)}\n${tradeJsonLd(base)}`,
      }),
    );
  }
  c.header("Vary", VARY_ACCEPT);
  return c.json(roomJson(base));
});

/* ------------------------------------------------------------------ */
/* Recovery by order_ref, signed                                       */
/* ------------------------------------------------------------------ */

tradeCounterRoutes.get("/api/trade/:partner/claim", async (c) => {
  c.header("Cache-Control", "no-store");
  const partner = getTradePartner(c.req.param("partner"));
  if (!partner) {
    const error = errorByCode("unknown_account");
    return c.json(refusal(error, error.meaning), 404);
  }
  const secrets = tradeSecrets(c.env, partner);
  if (!secrets || !c.env.TRADE_NONCES) {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  const verdict = await verifyTradeRequest({
    dialect: TRADE_DIALECTS[partner.dialect],
    header: (name) => c.req.header(name),
    rawBody: "",
    secrets,
    now_ms: Date.now(),
  });
  if (!verdict.ok) {
    const error = errorByCode(verdict.code);
    return c.json(refusal(error, error.meaning), 401);
  }
  const claim = await claimTradeNonce(c.env, partner.id, verdict.replay_key, TRADE_NONCE_TTL_SECONDS);
  if (claim === "unavailable") {
    const error = errorByCode("counter_closed");
    return c.json(refusal(error, error.meaning), 503);
  }
  if (claim === "seen") {
    const error = errorByCode("replayed");
    return c.json(refusal(error, error.meaning), 409);
  }
  const orderRef = (c.req.query("order_ref") ?? "").trim();
  if (!orderRef || orderRef.length > TRADE_ORDER_REF_MAX) {
    const error = errorByCode("bad_request");
    return c.json(refusal(error, "Give the order_ref the delivery was ordered with."), 400);
  }
  const found = await findTradeDelivery(c.env, partner, orderRef);
  if (!found) {
    const error = errorByCode("not_found");
    return c.json(refusal(error, error.meaning), 404);
  }
  return c.json({
    what_this_is:
      "The delivery your account ordered under this order_ref, recovered for the customer who lost it: the ledger row and the signed certificate, which still verifies at verify_url.",
    row: found.row,
    ...(found.certificate
      ? {
          certificate: found.certificate.certificate,
          signature: found.certificate.signature,
          signature_jcs: found.certificate.signature_jcs,
          public_key: found.certificate.public_key,
          verify_url: `${c.env.STORE_BASE_URL}/api/verify/${found.row.cert_id}`,
        }
      : { certificate: null, note: "The row stands but the certificate record is missing; write to the store." }),
  });
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

  if (await creditCeilingReached(c.env, partner)) {
    const error = errorByCode("credit_ceiling_reached");
    return c.json(refusal(error, error.meaning), 429);
  }

  const shareBps = await shareForNextDelivery(c.env, partner);
  const settlement = tradeSettlementFor(partner, item, verdict.instruction_digest, checked.order_ref, shareBps);
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
    const booked = await recordTradeDelivery(c.env, partner, item, settlement, certId, response);
    /*
     * THE DELIVERY RECEIPT, AFTER THE RESPONSE. A partner that gave a
     * callback_url is told in our own name once the goods are theirs;
     * it rides waitUntil so their synchronous clock never pays for
     * their own endpoint's latency. Outcome on the ledger row either
     * way. No execution context (a direct call in a test) means no
     * receipt and no failure — the certificate still verifies.
     */
    if (checked.callback_url) {
      const receipt = notifyTradeCallback(
        c.env,
        partner,
        booked.key,
        booked.row,
        checked.callback_url,
        response,
      ).catch(() => undefined);
      try {
        c.executionCtx.waitUntil(receipt);
      } catch {
        await receipt;
      }
    }
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
