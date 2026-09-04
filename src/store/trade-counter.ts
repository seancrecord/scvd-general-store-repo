import type { TradeDialect } from "@/lib/trade-auth";
import { MENU_ITEMS, getMenuItem } from "@/store/menu";
import type { MenuItem } from "@/types";

/**
 * THE TRADE COUNTER — the shelf, sold on account to marketplaces
 * (2026-09-03, the keeper's greenlight: "we sell as a product,
 * nothing to do with hal, we just take his need or problem and build
 * it then scale it out").
 *
 * WHAT IT IS. Round the back of a general store there is a counter
 * for the trade: accounts, not cash, a statement at the end of the
 * period. This is that. A marketplace lists our shelf under its own
 * roof, collects its customer's money however it collects, and sends
 * us ONE signed instruction per sale. We deliver the same signed
 * goods the front door sells, mint the same kind of certificate —
 * honest about how it was paid for — and bill the account. The
 * customer never touches x402, and never has to.
 *
 * WHAT IS GENERIC AND WHAT IS A ROW. The verification (lib/trade-auth
 * .ts), the replay store (services/trade-nonces.ts), the honest
 * certificate, the receivable and its cap, the statement — all of it
 * is the counter and serves every account. What differs between
 * marketplaces is five or so details of how they sign, and those are
 * a TradeDialect. The first account arrived with its own dialect; the
 * next one gets a row here, not a new door.
 *
 * WHAT THE STORE NEVER SEES, SAID ONCE. No payment. The certificate
 * says `settled_via: trade_account` and names the partner, the trade
 * price and the signed instruction, and it carries NO network, payer
 * or settlement transaction — a chain field on a sale no chain
 * carried is the class of false claim rules 45 and 52 exist to catch.
 * What the store can check afterwards is the statement against the
 * partner's payouts, and that walk is the keeper's hand.
 */

export const TRADE_COUNTER_NAME = "The Trade Counter";
export const TRADE_COUNTER_OPENED = "2026-09-03";

/* ------------------------------------------------------------------ */
/* Dialects — how a marketplace signs                                 */
/* ------------------------------------------------------------------ */

export type TradeDialectId = "canonical" | "hal";

/**
 * OUR OWN SHAPE, published so the NEXT marketplace can conform to it
 * instead of us conforming to them: the same HMAC-SHA256 over
 * `timestamp.nonce.body` the first account uses, under neutral header
 * names. A provider key header is accepted and not required — the
 * signature is the credential; the key is a label.
 */
const CANONICAL: TradeDialect = {
  id: "canonical",
  name: "scvd trade dialect v1",
  provider_key_header: "X-Trade-Key",
  timestamp_header: "X-Trade-Timestamp",
  nonce_header: "X-Trade-Nonce",
  signature_header: "X-Trade-Signature",
  signature_prefix: "sha256=",
  signing_string: "timestamp.nonce.body",
  timestamp_unit: "seconds",
  nonce_pattern: /^[0-9a-f]{32}$/i,
  window_seconds: 300,
};

/**
 * THE FIRST ACCOUNT'S DIALECT, as their published contract states it:
 * a provider key they issue us, a unix timestamp, a 32-hex nonce, and
 * `sha256=<hex>` over `timestamp + "." + nonce + "." + exact_raw_body`,
 * timestamps older than five minutes refused, nonces never honoured
 * twice.
 *
 * ⚑ TWO FIELDS ARE THEIR ANSWER, NOT OURS, and both fail CLOSED if
 * wrong: `timestamp_unit` (a millisecond clock read as seconds is
 * centuries in the future and refused on every call), and whether
 * the provider key is a separate secret from the signing secret. Set
 * from their reply to the question list in TRADE_COUNTER.md; until
 * then the account stays in test.
 */
const HAL: TradeDialect = {
  id: "hal",
  name: "Hal marketplace webhook v1",
  provider_key_header: "X-Hal-Provider-Key",
  timestamp_header: "X-Hal-Timestamp",
  nonce_header: "X-Hal-Nonce",
  signature_header: "X-Hal-Signature",
  signature_prefix: "sha256=",
  signing_string: "timestamp.nonce.body",
  timestamp_unit: "seconds",
  nonce_pattern: /^[0-9a-f]{32}$/i,
  window_seconds: 300,
};

export const TRADE_DIALECTS: Readonly<Record<TradeDialectId, TradeDialect>> = {
  canonical: CANONICAL,
  hal: HAL,
};

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

export interface ShareTier {
  /** Live deliveries in the calendar month at which this tier starts (0 = the first). */
  from_monthly_deliveries: number;
  partner_share_bps: number;
}

/**
 * THE STANDARD OFFER, in basis points of the trade price, by live
 * deliveries in the calendar month: the partner's cut RISES with
 * volume, which is the shape resellers expect and the shape the
 * pricing rule already absorbs (the trade price is derived from the
 * share, so the store's net stays retail plus the uplift at every
 * tier). ⚑ keeper dial.
 */
export const STANDARD_SHARE_LADDER: readonly ShareTier[] = [
  { from_monthly_deliveries: 0, partner_share_bps: 500 },
  { from_monthly_deliveries: 1_000, partner_share_bps: 800 },
  { from_monthly_deliveries: 10_000, partner_share_bps: 1_200 },
];

/** The share an account earns on its next delivery, given the month so far. */
export function effectiveShareBps(
  partner: Pick<TradePartner, "partner_share_bps" | "share_ladder">,
  monthlyDeliveriesSoFar: number,
): number {
  const ladder = partner.share_ladder;
  if (!ladder || ladder.length === 0) {
    return partner.partner_share_bps;
  }
  let share = partner.partner_share_bps;
  for (const tier of ladder) {
    if (monthlyDeliveriesSoFar >= tier.from_monthly_deliveries) {
      share = tier.partner_share_bps;
    }
  }
  return share;
}

export interface TradePartner {
  /** The path segment: /api/trade/{id}/{item_id}. Lower-case, [a-z0-9_]. */
  id: string;
  name: string;
  site: string;
  dialect: TradeDialectId;
  /** The partner's cut of the trade price, in basis points. */
  partner_share_bps: number;
  /** What their statement is paid in, in words. Never money math. */
  settles_in: string;
  /** Which shelf items this account may order. A subset of TRADE_SHELF. */
  items: readonly string[];
  /**
   * THE BLAST-RADIUS BOUND. A leaked signing secret mints goods until
   * it is rotated, and the nonce store gives no signal — so this is
   * how much one account can order in one UTC day, sized to expected
   * volume with headroom. Deliveries, not dollars; it bounds damage,
   * not revenue. Counted on KV, so it can overshoot by the odd unit
   * under a race, and that is stated rather than hidden.
   */
  daily_cap: number;
  /**
   * `test`: signatures verify, goods deliver, certificates say
   * `trade_account_test`, and NOTHING is booked to the receivable —
   * a marketplace wiring up must be able to run real calls without
   * either side owing anything. Flipped to `live` by the keeper's
   * hand when the account's terms are settled. ⚑ keeper dial.
   */
  mode: "live" | "test";
  opened: string;
  /**
   * THE CREDIT CEILING, in dollars of unpaid net. The daily cap bounds
   * UNITS a leaked secret can mint; this bounds DOLLARS a live account
   * can owe before the counter refuses with a named code. Checked
   * against a running counter (KV, so a race can overshoot by one
   * delivery) and recomputed from the rows by every statement walk.
   * Test-mode accounts book nothing and are never refused on it.
   */
  credit_ceiling_usd: number;
  /**
   * VOLUME TERMS AS ROWS, NOT CONVERSATIONS (pass five). Optional: a
   * ladder of partner shares by live deliveries in the calendar month
   * so far, highest tier reached wins. Absent, the flat share above
   * applies. The standard offer is STANDARD_SHARE_LADDER, printed on
   * the contract so the second partner reads terms instead of
   * negotiating them; an account with its own contract (the first)
   * carries none and keeps its flat share.
   */
  share_ladder?: readonly ShareTier[];
  /**
   * A PUBLISHED SECRET, for the one account that has one: the
   * sandbox. Every other account's secrets live in Worker secrets
   * and are read by name; this field exists so the sandbox can be
   * used by a stranger in a minute, the way /try works for the till.
   * An account with this field set is test-mode by construction —
   * a test holds it, because a published secret on a live account
   * would be everyone's money.
   */
  sandbox?: { signing_secret: string; provider_key: string };
}

/**
 * The accounts. One row per marketplace; secrets are NEVER here (Env
 * names them: TRADE_SECRET_<ID>, TRADE_SECRET_<ID>_PREVIOUS,
 * TRADE_PROVIDER_KEY_<ID>, upper-cased). Opening an account is the
 * keeper's hand — rule 30, no agent holds keys — and the row is what
 * he adds once the secret is set.
 */
/**
 * THE SANDBOX ACCOUNT — integration before the conversation, not after
 * it (2026-09-03, "how do we make this better for everyone").
 *
 * Anyone can sign with this secret and get a real delivery of real
 * goods, marked test, booked nowhere. It is what /try is for the till:
 * a marketplace's engineer proves their signer against ours in an
 * afternoon and writes to the keeper already working. The daily cap
 * is the whole abuse story — fifty deliveries a day of goods that
 * cost nothing to make, on an account that owes nothing — and the
 * probes it can order are the same probes the free preflight runs.
 * The certificates it mints take patron numbers like any other test
 * purchase; they say trade_account_test and never count as sales.
 */
export const TRADE_SANDBOX_ID = "sandbox";
export const TRADE_SANDBOX_SECRET = "scvd-trade-sandbox-secret-anyone-may-use";
export const TRADE_SANDBOX_PROVIDER_KEY = "scvd-trade-sandbox-key";

export const TRADE_PARTNERS: readonly TradePartner[] = [
  {
    id: TRADE_SANDBOX_ID,
    name: "The sandbox",
    site: "https://scvd.store/trade",
    dialect: "canonical",
    partner_share_bps: 500,
    settles_in: "nothing — a sandbox owes nothing and is owed nothing",
    items: [
      "certificate_of_patronage",
      "context_anchor",
      "bitcoin_anchor",
      "signature_agent_card",
      "onpage_audit",
      "service_audit",
      "passport_refresh",
      "good_buyer",
      "provenance_check",
    ],
    daily_cap: 50,
    mode: "test",
    opened: TRADE_COUNTER_OPENED,
    credit_ceiling_usd: 0,
    sandbox: {
      signing_secret: TRADE_SANDBOX_SECRET,
      provider_key: TRADE_SANDBOX_PROVIDER_KEY,
    },
  },
  {
    id: "hal",
    name: "Hal",
    site: "https://halmarket.dev",
    dialect: "hal",
    partner_share_bps: 500,
    settles_in: "sats, off-chain, on the partner's own statement",
    items: [
      "certificate_of_patronage",
      "context_anchor",
      "bitcoin_anchor",
      "signature_agent_card",
      "onpage_audit",
      "service_audit",
      "passport_refresh",
      "good_buyer",
      "provenance_check",
    ],
    daily_cap: 200,
    mode: "test",
    opened: TRADE_COUNTER_OPENED,
    /** ⚑ keeper dial: how much unpaid net the account may carry. */
    credit_ceiling_usd: 250,
  },
];

/** How long a live account's oldest unpaid delivery may stand before the keeper is paged. ⚑ dial. */
export const TRADE_STATEMENT_DAYS = 30;

export function getTradePartner(id: string): TradePartner | undefined {
  return TRADE_PARTNERS.find((partner) => partner.id === id);
}

/** The env names one account's secrets live under. Derived, never typed. */
export function tradeSecretNames(partner: Pick<TradePartner, "id">): {
  signing: string;
  previous: string;
  provider_key: string;
} {
  const id = partner.id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    signing: `TRADE_SECRET_${id}`,
    previous: `TRADE_SECRET_${id}_PREVIOUS`,
    provider_key: `TRADE_PROVIDER_KEY_${id}`,
  };
}

/* ------------------------------------------------------------------ */
/* Pricing — the margin, as a published rule                          */
/* ------------------------------------------------------------------ */

/**
 * THE MARGIN, STATED AS A FORMULA RATHER THAN A NUMBER ON A ROW.
 *
 * A trade sale costs the store what a front-door sale does not: credit
 * extended until the statement is paid, a reconciliation walk, and a
 * partner's cut off the top. So the trade price is set so that AFTER
 * the partner's share the store nets at least the shelf price plus an
 * uplift — never less than it would have taken at the front door.
 *
 *   trade_price = ceil_to_cent( retail × (1 + uplift) ÷ (1 − share) )
 *
 * Every number in that line is public: retail is menu.json, the uplift
 * is here, the share is on the account's row, and /api/trade/contract
 * prints the result per item. The pricing charter's discipline holds
 * — nothing about a buyer's identity moves a price, and the rule
 * changes only in a dated commit.
 *
 * ⚑ keeper dial. Twenty percent over retail, net, is the opening
 * figure; the number to watch is whether a marketplace's customers
 * find the listed price worth the convenience of never touching x402.
 */
export const TRADE_UPLIFT_BPS = 2000;

/**
 * Below this retail price the counter does not trade. A partner
 * settling in sats cannot express five percent of a penny, and a
 * statement line for four-tenths of a cent is bookkeeping theatre.
 * The penny shelf stays a front-door thing. ⚑ keeper dial.
 */
export const TRADE_MIN_RETAIL_USD = 0.5;

/** The share the public price table is printed at. Accounts differ. */
export const TRADE_EXAMPLE_SHARE_BPS = 500;

const BPS = 10_000n;

function usdToCents(usd: number): bigint {
  return BigInt(Math.round(usd * 100));
}

function usdToMicro(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/** The listed trade price for one item on an account with this share. Cents exact. */
export function tradePriceUsd(item: Pick<MenuItem, "price_usdc">, shareBps: number): number {
  const retailMicro = usdToMicro(item.price_usdc);
  const numerator = retailMicro * (BPS + BigInt(TRADE_UPLIFT_BPS));
  const denominator = BPS - BigInt(shareBps);
  // ceil(numerator / denominator), then ceil to the cent.
  const priceMicro = (numerator + denominator - 1n) / denominator;
  const cents = (priceMicro + 9_999n) / 10_000n;
  return Number(cents) / 100;
}

/** What the store is owed on one delivery at that price, after the share. Cents, rounded down. */
export function tradeNetUsd(tradePrice: number, shareBps: number): number {
  const priceCents = usdToCents(tradePrice);
  const netCents = (priceCents * (BPS - BigInt(shareBps))) / BPS;
  return Number(netCents) / 100;
}

/* ------------------------------------------------------------------ */
/* The shelf at the counter                                           */
/* ------------------------------------------------------------------ */

/**
 * What a trade order has to carry for each item, by kind. The kinds
 * mirror the front door's pre-payment checks in routes/buy.ts, so a
 * refusal here reads the same as a refusal there; the counter adds
 * no opinion of its own about what a summary or a URL is.
 */
export type TradeInputKind = "none" | "summary" | "digest" | "url" | "address";

export interface TradeShelfEntry {
  item_id: string;
  input: TradeInputKind;
  /** The body fields the kind reads, for the terms document. */
  fields: readonly string[];
}

/**
 * INSTANT ITEMS WITH SELF-CONTAINED INPUTS, at or above the floor.
 * The human-queue shelf is not here (a marketplace cannot resell the
 * keeper's Sunday), nor are stocked units, term watches that record a
 * paying wallet for recovery, or the settlement observations that
 * price under the floor. Adding a row means adding a kind the
 * validator knows, and a test holds that every row is a live item.
 */
export const TRADE_SHELF: readonly TradeShelfEntry[] = [
  { item_id: "certificate_of_patronage", input: "none", fields: [] },
  { item_id: "context_anchor", input: "summary", fields: ["summary"] },
  { item_id: "bitcoin_anchor", input: "digest", fields: ["digest", "label"] },
  { item_id: "signature_agent_card", input: "url", fields: ["url"] },
  { item_id: "onpage_audit", input: "url", fields: ["url"] },
  { item_id: "service_audit", input: "url", fields: ["url"] },
  { item_id: "passport_refresh", input: "url", fields: ["url"] },
  {
    item_id: "good_buyer",
    input: "url",
    fields: ["url", "max_usd", "no_spend_controls"],
  },
  { item_id: "provenance_check", input: "address", fields: ["address"] },
];

/** Every field any trade order may carry beside the item's own. */
export const TRADE_COMMON_FIELDS = ["order_ref", "agent_name", "purpose", "callback_url"] as const;

/** How long a delivery receipt waits at the partner's callback before it is written down as unreachable. */
export const TRADE_CALLBACK_TIMEOUT_MS = 10_000;

export function tradeShelfEntry(itemId: string): TradeShelfEntry | undefined {
  return TRADE_SHELF.find((entry) => entry.item_id === itemId);
}

/** Is this item one the counter trades at all, by the published rule? */
export function tradeEligible(item: MenuItem): boolean {
  return (
    item.fulfillment === "instant" &&
    item.price_usdc >= TRADE_MIN_RETAIL_USD &&
    tradeShelfEntry(item.id) !== undefined
  );
}

/** The shelf, as rows the terms document and the page print. Derived. */
export function tradeShelf(): readonly (TradeShelfEntry & { item: MenuItem })[] {
  return TRADE_SHELF.flatMap((entry) => {
    const item = getMenuItem(entry.item_id);
    return item && tradeEligible(item) ? [{ ...entry, item }] : [];
  });
}

/** Menu ids that would qualify by the rule but have no shelf row yet. Printed, never hidden. */
export function tradeEligibleButUnshelved(): readonly string[] {
  return MENU_ITEMS.filter(
    (item) =>
      item.fulfillment === "instant" &&
      item.price_usdc >= TRADE_MIN_RETAIL_USD &&
      tradeShelfEntry(item.id) === undefined,
  ).map((item) => item.id);
}

/* ------------------------------------------------------------------ */
/* Limits                                                             */
/* ------------------------------------------------------------------ */

/** The partner's own contract: one JSON object back, inside this. */
export const TRADE_BODY_MAX_BYTES = 1_048_576;
/** Outlives every dialect's window with room: 2 × 300s. */
export const TRADE_NONCE_TTL_SECONDS = 600;
/** A marketplace retrying the same order_ref inside this gets the original delivery back. */
export const TRADE_ORDER_TTL_SECONDS = 24 * 3600;
export const TRADE_ORDER_REF_MAX = 120;

/* ------------------------------------------------------------------ */
/* Copy — the room, in the store's voice                              */
/*                                                                    */
/* RULE 7, WAIVED FOR THIS ROOM BY THE KEEPER (2026-09-03): "I want a  */
/* draft I'm gonna let you ink this one i like what you have." The    */
/* copy below is therefore inked, not flagged. His pen still moves it */
/* whenever he likes; the waiver is about who signs the first draft.  */
/* ------------------------------------------------------------------ */

/**
 * THE PROPOSITION AND THE MONEY SENTENCE — rule 60's two lines. Each
 * is ONE sentence with no quotes, read identically on the room's
 * page, its JSON twin and llms.txt; the feature register
 * (store/features.ts) holds them there by test. Change one here and
 * every surface moves together, which is the point.
 */
export const TRADE_PROPOSITION =
  "Your customer pays you; you send us one signed instruction; we deliver the same signed goods the front door sells and bill your account on a statement.";
export const TRADE_FOR_MONEY =
  "Trade price is retail plus 20% net of your share, rounded up to the cent, billed per delivery and never for a delivery that did not happen.";

export const TRADE_STANDFIRST = `Round the back, for marketplaces. ${TRADE_PROPOSITION} Your customer never touches x402.`;

export const TRADE_WHAT_THIS_IS =
  "A trade account on this store's shelf: any platform that resells to agents — a marketplace, an aggregator, a payments layer that hides x402 from its own users — lists our instruments under its roof, collects its customer's money itself, and orders from us by signed webhook. One door, one JSON body, one signed instruction per sale, delivery in seconds, a certificate the end customer can verify against our public key without trusting either of us.";

export const TRADE_WHAT_IT_IS_FOR =
  "Putting independent signed evidence on a shelf that is not ours, for buyers who will never sign an x402 authorization: a marketplace's own customers, a platform's agents paying in a currency we do not take, a checkout that wants one line item and no crypto in the path. Every item at the counter is the same artifact the front door mints, verifying at the same free URL — so what you are reselling is checkable by your customer, not just by you. Nothing here narrows what a partner may build on top.";

export const TRADE_WHAT_THIS_IS_NOT =
  "Not a payment rail: no money moves through this door, and the store does not verify that any moved through yours. Not a discount channel: trade prices sit above the front door's, by a published rule, because an account is credit. Not an escrow, a guarantor, or a dispute court between you and your customer. And not a way to buy the keeper's hands: the human-queue shelf is not at this counter.";

export interface TradeStep {
  step: number;
  name: string;
  what_happens: string;
  what_you_can_check: string;
}

export const TRADE_HOW_IT_WORKS: readonly TradeStep[] = [
  {
    step: 0,
    name: "The sandbox, first",
    what_happens:
      "Before any conversation, sign against the sandbox account with the secret printed on this page. Real signatures, real goods, marked test, booked nowhere. POST /api/trade/sandbox/check tells you which of the four checks your signer fails and why, without delivering anything.",
    what_you_can_check:
      "The sandbox's secret, dialect and daily cap are on its account row at /api/trade/contract; its deliveries appear on /api/trade/ledger as test, never billed.",
  },
  {
    step: 1,
    name: "The account",
    what_happens:
      "The keeper opens an account by hand: your platform, your signing dialect, the items you may order, a daily cap, a credit ceiling. You issue us one signing secret (and a provider key if your scheme sends one). We hold them as Worker secrets; nothing of ours is ever asked of you.",
    what_you_can_check:
      "Your account's row — items, share, cap, ceiling, mode — is printed at /api/trade/contract the moment it exists, and its receivable is on /api/trade/ledger.",
  },
  {
    step: 2,
    name: "The sale, on your side",
    what_happens:
      "Your customer buys the item from you at your price, in your currency, on your terms. We are not in that transaction and never see it.",
    what_you_can_check:
      "Nothing to check with us — which is the point. Our trade price per item is public; what you charge above it is yours.",
  },
  {
    step: 3,
    name: "The instruction",
    what_happens:
      "Your backend POSTs one JSON body to /api/trade/{account}/{item_id}, signed HMAC-SHA256 over timestamp, nonce and the exact bytes of the body. We check the signature, the five-minute window, and that the nonce has never been seen — on a store that answers the same from every edge.",
    what_you_can_check:
      "The reference signer is published in this repository (src/lib/trade-auth.ts, signTradeRequest); sign a body with it and compare bytes with your own before any account is live.",
  },
  {
    step: 4,
    name: "The delivery",
    what_happens:
      "The goods are made exactly as the front door makes them — the probe runs, the record is written, the certificate is minted — and come back in one JSON object inside thirty seconds. A delivery that fails books nothing: no statement line, no receivable.",
    what_you_can_check:
      "The certificate says settled_via: trade_account, names your account and the trade price, and binds the sha256 of your signed instruction. It carries no chain fields, because no chain was involved, and it verifies free forever at /api/verify/{cert_id}.",
  },
  {
    step: 5,
    name: "The statement",
    what_happens:
      "Each delivery on a live account adds one line to your statement: item, trade price, your share, our net. Outstanding net is the receivable, published per account. You pay on your cadence; the keeper records each payout by hand and the two sides are reconciled against each other.",
    what_you_can_check:
      "/api/trade/ledger prints every account's delivered count, billed and outstanding figures, with the truncation flag any bounded read here carries. Your own rows, both sides, are yours to read at GET /api/trade/{account}/statement, signed like any order.",
  },
];

/** Why a marketplace would bother. The sell, plainly. */
export const TRADE_WHY: readonly { point: string; because: string }[] = [
  {
    point: "Your customer gets a receipt that is not your word or ours.",
    because:
      "Every item mints an ed25519-signed certificate that verifies against a published key, offline, forever. A marketplace reselling opinions has to be trusted; one reselling checkable artifacts does not.",
  },
  {
    point: "No x402 in your customer's path, and none required of you.",
    because:
      "One signed POST. No wallet, no facilitator, no chain, no gas. You already know how to sign a webhook; that is the whole integration.",
  },
  {
    point: "The prices are a rule, not a negotiation.",
    because:
      "Trade price is retail plus a published uplift, divided by one minus your share, rounded up to the cent. Printed per item at /api/trade/contract. What you charge above it is your business.",
  },
  {
    point: "Delivery first, always.",
    because:
      "The goods are produced before anything is booked. A failed delivery leaves no line on your statement, so you never owe for something your customer did not get.",
  },
  {
    point: "You can be integrated before you have talked to anyone.",
    because:
      "A sandbox account with a published secret, a check desk that names which of the four signature checks failed, and a catalog feed with every item's copy, specimen and price at your share. Write to the keeper already working.",
  },
  {
    point: "Everything you would want to audit is already public.",
    because:
      "Your account's terms, the shelf you may order from, your receivable, the refusal codes by name, the reference signer, and every correction this store has ever had to make.",
  },
];

export interface TradeError {
  status: number;
  code: string;
  meaning: string;
  what_to_do: string;
}

/**
 * EVERY REFUSAL BY NAME (rule 57.4). Two facts a marketplace needs
 * first ride every refusal: `delivered: false` and `billed: false` —
 * a refused instruction owes nothing, and the partner refunds its own
 * customer or retries with a corrected request.
 */
export const TRADE_ERRORS: readonly TradeError[] = [
  {
    status: 404,
    code: "unknown_account",
    meaning: "No trade account by that name.",
    what_to_do: "Check the path segment against your account row at /api/trade/contract.",
  },
  {
    status: 503,
    code: "counter_closed",
    meaning:
      "The counter cannot take orders right now: the account is not provisioned on this side, or the replay store is unreachable.",
    what_to_do:
      "Do not retry in a loop; the condition is ours to fix and the keeper is paged. Retry after a minute.",
  },
  {
    status: 413,
    code: "body_too_large",
    meaning: "The body is over one mebibyte.",
    what_to_do: "Send only the item's fields; the terms document lists them.",
  },
  {
    status: 401,
    code: "missing_headers",
    meaning: "A required signing header is absent.",
    what_to_do: "Send every header your dialect names, on every call.",
  },
  {
    status: 401,
    code: "bad_provider_key",
    meaning: "The provider key does not match the one on the account.",
    what_to_do: "Check which key you issued us; a rotated key needs the keeper's hand on this side.",
  },
  {
    status: 401,
    code: "bad_timestamp",
    meaning: "The timestamp is not an integer in the unit your dialect states.",
    what_to_do: "Unix seconds or milliseconds as your account row says, digits only.",
  },
  {
    status: 401,
    code: "stale_timestamp",
    meaning: "The timestamp is outside the window, past or future.",
    what_to_do: "Sign at send time with a synchronised clock; do not reuse a signed request.",
  },
  {
    status: 401,
    code: "bad_nonce",
    meaning: "The nonce is not the shape your dialect requires.",
    what_to_do: "Thirty-two hex characters, fresh per request.",
  },
  {
    status: 401,
    code: "bad_signature",
    meaning: "The HMAC does not verify against the secret in service or the previous one.",
    what_to_do:
      "Sign the exact bytes you send, in the order timestamp.nonce.body, and compare with the reference signer before assuming the secret is wrong.",
  },
  {
    status: 409,
    code: "replayed",
    meaning: "This nonce (or this exact instruction) has already been presented.",
    what_to_do:
      "Nothing was delivered on this call. If you are retrying a timed-out order, send order_ref and a FRESH nonce: the same order_ref returns the original delivery.",
  },
  {
    status: 404,
    code: "not_found",
    meaning: "No delivery on this account carries that order_ref.",
    what_to_do:
      "Check the reference; deliveries are searchable by order_ref for as long as the rows are kept, and a delivery without one cannot be recovered this way.",
  },
  {
    status: 404,
    code: "not_at_the_counter",
    meaning: "The item is not on your account, or not traded at the counter at all.",
    what_to_do: "Order from the items on your account row; ask the keeper to add one.",
  },
  {
    status: 400,
    code: "bad_request",
    meaning: "The body is not a JSON object, or the item's required field is missing or malformed.",
    what_to_do: "The terms document names each item's fields; the error names the one at fault.",
  },
  {
    status: 400,
    code: "target_refused",
    meaning: "The URL is not one we will probe: private, loopback, non-https, or our own hostname.",
    what_to_do: "Send a public https door. We do not sell audits of ourselves.",
  },
  {
    status: 429,
    code: "credit_ceiling_reached",
    meaning: "Your live account's unpaid net has reached its credit ceiling.",
    what_to_do:
      "Settle the statement; the ceiling is printed on your account row and the outstanding figure on /api/trade/ledger. The keeper can raise it.",
  },
  {
    status: 429,
    code: "cap_reached",
    meaning: "Your account has ordered its daily cap.",
    what_to_do:
      "The cap is the blast-radius bound on a leaked secret, not a rate limit; it resets at UTC midnight and the keeper can raise it.",
  },
];

export const TRADE_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "What does the certificate say about payment?",
    a: "That the sale settled on a trade account, which account, at what trade price, and the digest of the instruction you signed. It does not say USDC, Base, Solana or Polygon, because none of them were involved, and it does not name a payer wallet, because there was none. A receipt that claimed otherwise would be the kind of false claim this store files against other people.",
  },
  {
    q: "Do you verify that my customer actually paid me?",
    a: "No, and we say so on the artifact. What we verify is that YOU instructed the delivery. What we check afterwards is your statement against your payouts. A marketplace's word about its own customers is the one thing this door has to take on trust, and the daily cap, the receivable ceiling and the test mode are the shape of that trust.",
  },
  {
    q: "Why is the trade price above the front door's?",
    a: "Because an account is credit. The uplift covers the receivable, the reconciliation and your share, by a formula printed beside every price. If your customers would rather pay less and sign an x402 authorization, the front door is open and always will be.",
  },
  {
    q: "My call timed out. Did you deliver?",
    a: "Possibly. Send order_ref on every call: a retry carrying the same order_ref within a day returns the original delivery, unbilled a second time. Without an order_ref, a retry with a fresh nonce is a fresh sale.",
  },
  {
    q: "Can I rotate my secret without downtime?",
    a: "Yes. Tell the keeper the new secret; for the handover window both verify and the response says which one signed. Then the old one is unset.",
  },
  {
    q: "My signature is rejected and I cannot see why.",
    a: "POST the same headers and body to /api/trade/{account}/check. It runs the four checks and reports each — headers present, provider key, clock skew in seconds, nonce shape, and whether the HMAC verified under the secret in service, the previous one, or neither — and prints the sha256 of the signing string we computed so you can compare it with yours. It delivers nothing and consumes no nonce. On the sandbox it also prints the signature we expected.",
  },
  {
    q: "Who handles refunds for my customer?",
    a: "You do. You collected the payment; this store took none and cannot return any. A refund on your side does not reverse a statement line here — the goods were delivered — unless the keeper agrees one by hand.",
  },
  {
    q: "How do I open an account?",
    a: "Prove your signer on the sandbox first, then write to the store — POST /api/letter — with your platform, the dialect you sign in (or that you will use ours), the items you want, and expected daily volume. A human reads it. Accounts open in test mode, so you can run real calls against real goods before anyone owes anyone anything.",
  },
];

export const TRADE_HONEST_LIMITS =
  "The store sees no payment on this door and signs none. A trade certificate proves the store delivered on a signed instruction from a named account; it does not prove the account's customer paid, was refunded, or existed. The receivable is derived from delivery rows on a capped read that says when it was cut short; the daily cap is counted on eventually consistent storage and can overshoot by a unit under a race. Nothing here is a rail, and the payout side of a statement is recorded by a person.";

export const TRADE_SECURITY_DOES =
  "Verifies an HMAC-SHA256 signature over your timestamp, nonce and exact body against a secret you issued; refuses timestamps outside a five-minute window and any nonce seen before, on a strongly consistent store; then makes and signs the goods exactly as the front door would. Where the item is a probe, we fetch the URL you sent, once, in our own name.";

export const TRADE_SECURITY_STORES =
  "One ledger row per delivery: account, item, certificate id, trade price, the sha256 of your signed instruction, and your order_ref if you sent one. The body of your request is not stored; the signed goods are, as they are for any sale. Secrets you issue us are Worker secrets, never in the repository, never in a response or a log.";

/* ------------------------------------------------------------------ */
/* The signer, in the three languages a backend is actually written in */
/* ------------------------------------------------------------------ */

/**
 * COPY THIS, NOT A LIBRARY. Each snippet signs one order in our
 * canonical dialect against the sandbox, so it runs as pasted. A
 * partner on another dialect changes four header names. The bytes
 * that go into the HMAC are the bytes that go on the wire — that is
 * the whole trick, and the reason every snippet builds the body
 * string once and reuses it.
 */
export const TRADE_SNIPPETS: readonly { language: string; label: string; code: string }[] = [
  {
    language: "javascript",
    label: "Node",
    code: `import { createHmac, randomBytes } from "node:crypto";

const secret = "${TRADE_SANDBOX_SECRET}"; // your own, once the account is live
const body = JSON.stringify({ summary: "what to remember", order_ref: "your-order-id" });
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(16).toString("hex");
const signature = createHmac("sha256", secret)
  .update(\`\${timestamp}.\${nonce}.\${body}\`)
  .digest("hex");

const response = await fetch("https://scvd.store/api/trade/${TRADE_SANDBOX_ID}/context_anchor", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "X-Trade-Key": "${TRADE_SANDBOX_PROVIDER_KEY}",
    "X-Trade-Timestamp": timestamp,
    "X-Trade-Nonce": nonce,
    "X-Trade-Signature": \`sha256=\${signature}\`,
  },
  body, // the same string you signed, byte for byte
});
console.log(response.status, await response.json());`,
  },
  {
    language: "python",
    label: "Python",
    code: `import hashlib, hmac, json, secrets, time, urllib.request

secret = b"${TRADE_SANDBOX_SECRET}"  # your own, once the account is live
body = json.dumps({"summary": "what to remember", "order_ref": "your-order-id"}, separators=(",", ":"))
timestamp = str(int(time.time()))
nonce = secrets.token_hex(16)
signature = hmac.new(secret, f"{timestamp}.{nonce}.{body}".encode(), hashlib.sha256).hexdigest()

request = urllib.request.Request(
    "https://scvd.store/api/trade/${TRADE_SANDBOX_ID}/context_anchor",
    data=body.encode(),  # the same bytes you signed
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Trade-Key": "${TRADE_SANDBOX_PROVIDER_KEY}",
        "X-Trade-Timestamp": timestamp,
        "X-Trade-Nonce": nonce,
        "X-Trade-Signature": f"sha256={signature}",
    },
)
with urllib.request.urlopen(request) as response:
    print(response.status, response.read().decode())`,
  },
  {
    language: "go",
    label: "Go",
    code: `package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

func main() {
	secret := []byte("${TRADE_SANDBOX_SECRET}") // your own, once the account is live
	body := \`{"summary":"what to remember","order_ref":"your-order-id"}\`
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	raw := make([]byte, 16)
	rand.Read(raw)
	nonce := hex.EncodeToString(raw)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "." + nonce + "." + body))
	signature := hex.EncodeToString(mac.Sum(nil))

	req, _ := http.NewRequest("POST", "https://scvd.store/api/trade/${TRADE_SANDBOX_ID}/context_anchor", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Trade-Key", "${TRADE_SANDBOX_PROVIDER_KEY}")
	req.Header.Set("X-Trade-Timestamp", timestamp)
	req.Header.Set("X-Trade-Nonce", nonce)
	req.Header.Set("X-Trade-Signature", "sha256="+signature)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	fmt.Println(res.Status)
}`,
  },
];

/* ------------------------------------------------------------------ */
/* The worked example — fixed inputs, so the bytes never move          */
/* ------------------------------------------------------------------ */

/**
 * ONE ORDER, EVERY BYTE SHOWN. A fixed body, timestamp and nonce, so
 * the signing string and the signature the contract prints are the
 * same on every read and a partner can diff their signer's output
 * against ours line by line. The timestamp is deliberately in the
 * past: the example is for comparing bytes, and sending it to the
 * door is refused as stale_timestamp — which is itself a line worth
 * seeing.
 */
export const TRADE_WORKED_EXAMPLE = {
  item_id: "context_anchor",
  body: '{"summary":"The agent was halfway through a migration.","order_ref":"example-0001"}',
  timestamp: "1756900000",
  nonce: "0123456789abcdef0123456789abcdef",
} as const;
