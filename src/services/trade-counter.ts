import { sendAlert } from "@/lib/alerts";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import type { PendingPayment, SettledPayment } from "@/lib/payments";
import { checkProbeTarget } from "@/lib/probe-target";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { jcsCanonicalize, signJcs } from "@/lib/jcs";
import { cachedPublicKeyHex } from "@/lib/signing";
import { hmacSha256Hex, sha256Hex, tradeSigningString, type TradeSecrets } from "@/lib/trade-auth";
import { webBotAuthHeaders } from "@/lib/web-bot-auth";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import type { FulfillmentInput } from "@/services/fulfillment";
import { validSubjectAddress } from "@/services/provenance-check";
import {
  TRADE_CALLBACK_TIMEOUT_MS,
  TRADE_EXAMPLE_SHARE_BPS,
  TRADE_ORDER_REF_MAX,
  TRADE_ORDER_TTL_SECONDS,
  TRADE_PARTNERS,
  TRADE_STATEMENT_DAYS,
  TRADE_WORKED_EXAMPLE,
  effectiveShareBps,
  tradeShelf,
  tradeNetUsd,
  tradePriceUsd,
  tradeSecretNames,
  type TradePartner,
  type TradeShelfEntry,
} from "@/store/trade-counter";
import { ARTIFACT_CLASSES, artifactClassForItem } from "@/store/attestation-spec";
import { getCertificate } from "@/services/certificates";

/** The certificate record as the reader returns it; the type is not exported from there. */
type CertificateRecord = NonNullable<Awaited<ReturnType<typeof getCertificate>>>;
import { READS_SENTENCE } from "@/store/surface-contract";
import { isRecord, type Env, type MenuItem, type TradeSettlement } from "@/types";

/**
 * THE TRADE COUNTER'S BOOKS AND CHECKS (2026-09-03). What the route
 * needs between "the signature is good" and "the goods went out":
 * the secrets by name, the order's inputs checked the way the front
 * door checks them, the daily cap, the order_ref idempotency, the
 * settlement object fulfillment mints from, and the ledger the
 * statement is derived from. store/trade-counter.ts says what the
 * counter IS; this file is what it does.
 */

/* ------------------------------------------------------------------ */
/* Secrets                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read by name off the environment. Env is typed field by field and
 * the accounts are rows, so this is the one place a secret is looked
 * up dynamically — and it only ever reads names tradeSecretNames
 * derived, never a caller's string.
 */
export function tradeSecrets(env: Env, partner: TradePartner): TradeSecrets | null {
  if (partner.sandbox) {
    // The published secret. Test-mode by construction; a guard holds it.
    return {
      signing: partner.sandbox.signing_secret,
      provider_key: partner.sandbox.provider_key,
    };
  }
  const names = tradeSecretNames(partner);
  const bag = env as unknown as Record<string, unknown>;
  const read = (name: string): string | undefined => {
    const value = bag[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const signing = read(names.signing);
  if (!signing) {
    return null;
  }
  const secrets: TradeSecrets = { signing };
  const previous = read(names.previous);
  if (previous) {
    secrets.previous = previous;
  }
  const providerKey = read(names.provider_key);
  if (providerKey) {
    secrets.provider_key = providerKey;
  }
  return secrets;
}

/* ------------------------------------------------------------------ */
/* Inputs — the front door's checks, at the back door                 */
/* ------------------------------------------------------------------ */

export interface TradeInputRefusal {
  ok: false;
  status: 400;
  code: "bad_request" | "target_refused";
  error: string;
}

export interface TradeInputOk {
  ok: true;
  input: FulfillmentInput;
  order_ref?: string;
  /** Where to POST the delivery receipt, validated like any probe target. */
  callback_url?: string;
}

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

function fieldsOf(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }
  // Either shape: the item's fields at the top level, or under
  // `inputs` beside order_ref. A partner's own body layout is theirs;
  // the counter reads both rather than legislating one.
  const inputs = body["inputs"];
  return isRecord(inputs) ? { ...body, ...inputs } : body;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/\0/g, "") : undefined;
}

/**
 * Validate one order's fields for one shelf entry. Every refusal is
 * the front door's own sentence with the query-parameter wording
 * swapped for the body field, so a marketplace's engineer and an
 * agent at /api/buy read the same rule.
 */
export function validateTradeInputs(
  env: Env,
  item: MenuItem,
  entry: TradeShelfEntry,
  body: unknown,
): TradeInputOk | TradeInputRefusal {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      code: "bad_request",
      error: "The order must be one JSON object.",
    };
  }
  const fields = fieldsOf(body);
  const input: FulfillmentInput = {};

  const agentName = sanitizeText(fields["agent_name"], 80);
  if (agentName) {
    input.agentName = agentName;
  }
  const purpose = sanitizeText(fields["purpose"], 280);
  if (purpose) {
    input.purpose = purpose;
  }

  switch (entry.input) {
    case "none":
      break;
    case "summary": {
      const summary = text(fields["summary"]);
      if (!summary || summary.trim().length === 0) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error:
            "An anchor needs a summary field, the state to be remembered. No summary, no delivery.",
        };
      }
      if (summary.length > ANCHOR_SUMMARY_CAP) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error: `That summary runs past the ledger margin. ${ANCHOR_SUMMARY_CAP} characters, tops.`,
        };
      }
      input.summary = summary;
      break;
    }
    case "digest": {
      const digest = text(fields["digest"]);
      if (!digest) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error:
            "Nothing to anchor. Give a digest field — 64 hex characters, a sha256 computed over bytes the customer keeps. We deliberately never see the bytes.",
        };
      }
      if (!SHA256_HEX.test(digest)) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error: "That is not a sha256 digest. 64 hex characters, no 0x prefix.",
        };
      }
      input.anchorDigest = digest;
      const label = sanitizeText(fields["label"], 120);
      if (label) {
        input.anchorLabel = label;
      }
      break;
    }
    case "url": {
      const raw = fields["url"];
      if (!isValidHttpUrl(raw)) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error:
            "This needs a url field — the https endpoint a buyer would GET expecting a 402. No target, no delivery.",
        };
      }
      const url = new URL(raw);
      const verdict = checkProbeTarget(url, "");
      if (!verdict.ok) {
        return {
          ok: false,
          status: 400,
          code: "target_refused",
          error: `${verdict.reason} Nothing delivered.`,
        };
      }
      if (url.host.toLowerCase() === new URL(env.STORE_BASE_URL).host.toLowerCase()) {
        return {
          ok: false,
          status: 400,
          code: "target_refused",
          error:
            "That is this store's own hostname. We do not sell audits of ourselves — a report we sign about our own door is the instrument vouching for itself.",
        };
      }
      input.targetUrl = raw;
      if (item.id === "good_buyer") {
        const capRaw = Number(fields["max_usd"]);
        if (Number.isFinite(capRaw) && capRaw > 0) {
          input.buyerCapUsd = capRaw;
        }
        if (fields["no_spend_controls"] === true) {
          input.buyerSpendControlsOff = true;
        }
      }
      break;
    }
    case "address": {
      const address = validSubjectAddress(text(fields["address"]));
      if (!address) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          error:
            "Give a receiving address in the address field — an EVM address (0x + 40 hex) or a Solana pubkey (base58). We read the signed chain about it; no address, no delivery.",
        };
      }
      input.subjectAddress = address;
      break;
    }
  }

  const result: TradeInputOk = { ok: true, input };
  const orderRef = sanitizeText(fields["order_ref"], TRADE_ORDER_REF_MAX);
  if (orderRef) {
    result.order_ref = orderRef;
  }
  const callback = fields["callback_url"];
  if (callback !== undefined) {
    // Same law as a probe target: https, public, never our own host.
    // A bad callback refuses the ORDER rather than being dropped
    // quietly, because a partner who asked to be told and was not
    // would rather learn it before the sale than after.
    if (!isValidHttpUrl(callback)) {
      return {
        ok: false,
        status: 400,
        code: "bad_request",
        error: "callback_url must be an https URL on a public host, or absent.",
      };
    }
    const callbackTarget = new URL(callback);
    const callbackVerdict = checkProbeTarget(callbackTarget, "");
    if (!callbackVerdict.ok) {
      return {
        ok: false,
        status: 400,
        code: "target_refused",
        error: `callback_url: ${callbackVerdict.reason} Nothing delivered.`,
      };
    }
    if (callbackTarget.host.toLowerCase() === new URL(env.STORE_BASE_URL).host.toLowerCase()) {
      return {
        ok: false,
        status: 400,
        code: "target_refused",
        error: "callback_url: that is this store's own hostname.",
      };
    }
    result.callback_url = callback;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* The settlement object fulfillment mints from                       */
/* ------------------------------------------------------------------ */

export function tradeSettlementFor(
  partner: TradePartner,
  item: MenuItem,
  instructionDigest: string,
  orderRef?: string,
  shareBps: number = partner.partner_share_bps,
): TradeSettlement {
  const price = tradePriceUsd(item, shareBps);
  const settlement: TradeSettlement = {
    partner: partner.id,
    partner_name: partner.name,
    mode: partner.mode,
    trade_price_usd: price,
    net_usd: tradeNetUsd(price, shareBps),
    partner_share_bps: shareBps,
    instruction_digest: instructionDigest,
  };
  if (orderRef) {
    settlement.order_ref = orderRef;
  }
  return settlement;
}

/**
 * A PendingPayment whose settle() moves no money, because the money
 * moved on the partner's side before the call. It exists so
 * fulfillPurchase — every item's observe-then-mint logic — is reused
 * whole rather than copied, and so the certificate is minted by the
 * one function that mints certificates. `transaction` is the empty
 * string: there is none, and every reader of it already treats
 * empty as absent.
 */
export function tradePending(settlement: TradeSettlement): PendingPayment {
  const settled: SettledPayment = {
    paidUsdc: 0,
    tipUsdc: 0,
    transaction: "",
    settleHeaders: {},
    trade: settlement,
  };
  return {
    paidUsdc: 0,
    tipUsdc: 0,
    settle: async () => settled,
  };
}

/* ------------------------------------------------------------------ */
/* The daily cap                                                      */
/* ------------------------------------------------------------------ */

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function tradeDayCount(
  env: Env,
  partner: TradePartner,
  day: string,
): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.tradeDay(partner.id, day));
  const count = Number(raw ?? "0");
  return Number.isFinite(count) ? count : 0;
}

/**
 * The cap is checked BEFORE delivery and counted AFTER, on KV. Two
 * orders racing the last unit can both pass; the overshoot is one
 * unit per race, and a cap that exists to bound a leaked secret's
 * day does its job at cap+1 exactly as well as at cap. Stated here
 * (rule 52) rather than pretended away.
 */
export async function bumpTradeDay(
  env: Env,
  partner: TradePartner,
  day: string,
): Promise<number> {
  const next = (await tradeDayCount(env, partner, day)) + 1;
  await kvPut(env.COUNTERS, KV_KEYS.tradeDay(partner.id, day), String(next), {
    expirationTtl: 3 * 86400,
  });
  return next;
}

/** YYYY-MM, UTC. */
export function utcMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function tradeMonthCount(env: Env, partner: TradePartner, month: string): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.tradeMonth(partner.id, month));
  const count = Number(raw ?? "0");
  return Number.isFinite(count) ? count : 0;
}

/** The share this account earns on its next delivery: the ladder against the month so far. */
export async function shareForNextDelivery(env: Env, partner: TradePartner, now: Date = new Date()): Promise<number> {
  if (!partner.share_ladder || partner.share_ladder.length === 0) {
    return partner.partner_share_bps;
  }
  return effectiveShareBps(partner, await tradeMonthCount(env, partner, utcMonth(now)));
}

export async function alertCapReached(
  env: Env,
  partner: TradePartner,
  day: string,
): Promise<void> {
  await sendAlert(env, {
    condition: "worker_health",
    key: `trade-cap-${partner.id}-${day}`,
    detail: `The trade counter refused ${partner.name} (account "${partner.id}") at its daily cap of ${partner.daily_cap} deliveries on ${day}. Either their volume grew past the row in store/trade-counter.ts — raise the cap in a commit — or a secret is being used by someone who is not them: check the ledger rows for the day before raising anything, and rotate the secret if the orders are not theirs.`,
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* The credit ceiling — a running counter, recomputed by every walk   */
/* ------------------------------------------------------------------ */

/**
 * Unpaid net on a live account, in cents, kept as one KV number: up on
 * every live delivery, down on every payout. A race can miss a step,
 * so the statement walk (tradeAccountSummary) is the truth and this is
 * the cheap read the door makes before delivering. The books
 * invariant sweep compares the two and pages the keeper when they
 * drift by more than a cent.
 */
export async function tradeOutstandingCents(env: Env, partner: TradePartner): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.tradeAccount(partner.id));
  const value = Number(raw ?? "0");
  return Number.isFinite(value) ? Math.round(value) : 0;
}

async function adjustOutstanding(env: Env, partner: TradePartner, deltaCents: number): Promise<void> {
  const next = (await tradeOutstandingCents(env, partner)) + deltaCents;
  await kvPut(env.COUNTERS, KV_KEYS.tradeAccount(partner.id), String(next));
}

/** Re-seat the counter from the rows; the sweep and the statement desk call this. */
export async function reseatOutstanding(env: Env, partner: TradePartner): Promise<number> {
  const summary = await tradeAccountSummary(env, partner);
  const cents = Math.round(summary.outstanding_usd * 100);
  await kvPut(env.COUNTERS, KV_KEYS.tradeAccount(partner.id), String(cents));
  return cents;
}

export async function creditCeilingReached(env: Env, partner: TradePartner): Promise<boolean> {
  if (partner.mode !== "live") {
    return false;
  }
  const outstanding = await tradeOutstandingCents(env, partner);
  return outstanding >= Math.round(partner.credit_ceiling_usd * 100);
}

/* ------------------------------------------------------------------ */
/* order_ref idempotency                                              */
/* ------------------------------------------------------------------ */

export async function orderRefKey(partner: TradePartner, orderRef: string): Promise<string> {
  return KV_KEYS.tradeOrder(partner.id, await sha256Hex(orderRef));
}

export async function recallOrder(
  env: Env,
  partner: TradePartner,
  orderRef: string,
): Promise<Record<string, unknown> | null> {
  const raw = await kvGet(env.COUNTERS, await orderRefKey(partner, orderRef));
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The ledger                                                         */
/* ------------------------------------------------------------------ */

export interface TradeRow {
  partner: string;
  item: string;
  cert_id: string;
  mode: TradeSettlement["mode"];
  trade_price_usd: number;
  partner_share_bps: number;
  net_usd: number;
  instruction_digest: string;
  order_ref?: string;
  delivered_at: string;
  /** What happened at the partner's callback_url, in words. Absent when none was given. */
  callback?: string;
}

export interface TradePayoutRow {
  partner: string;
  payout_id: string;
  amount_usd: number;
  reference: string;
  recorded_at: string;
}

/**
 * Written AFTER the goods went out, never before. The direction the
 * store accepts (rule 9): a Worker that dies between the mint and
 * this line has delivered and not billed, and the store eats it —
 * the partner's customer never holds a statement line for goods that
 * did not arrive.
 */
export async function recordTradeDelivery(
  env: Env,
  partner: TradePartner,
  item: MenuItem,
  settlement: TradeSettlement,
  certId: string,
  response: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ row: TradeRow; key: string }> {
  const row: TradeRow = {
    partner: partner.id,
    item: item.id,
    cert_id: certId,
    mode: settlement.mode,
    trade_price_usd: settlement.trade_price_usd,
    partner_share_bps: settlement.partner_share_bps,
    net_usd: settlement.net_usd,
    instruction_digest: settlement.instruction_digest,
    delivered_at: now.toISOString(),
  };
  if (settlement.order_ref) {
    row.order_ref = settlement.order_ref;
  }
  const key = KV_KEYS.tradeRow(partner.id, invertedTimestamp(now.getTime()), certId);
  await kvPut(env.ORDERS, key, JSON.stringify(row));
  await bumpTradeDay(env, partner, utcDay(now));
  if (settlement.mode === "live") {
    await adjustOutstanding(env, partner, cents(settlement.net_usd));
    // The ladder's denominator: live deliveries this calendar month.
    const month = utcMonth(now);
    const next = (await tradeMonthCount(env, partner, month)) + 1;
    await kvPut(env.COUNTERS, KV_KEYS.tradeMonth(partner.id, month), String(next), {
      expirationTtl: 62 * 86400,
    });
  }
  if (settlement.order_ref) {
    await kvPut(
      env.COUNTERS,
      await orderRefKey(partner, settlement.order_ref),
      JSON.stringify(response),
      { expirationTtl: TRADE_ORDER_TTL_SECONDS },
    );
  }
  return { row, key };
}

/* ------------------------------------------------------------------ */
/* Delivery receipts — the partner is told, once, in our own name      */
/* ------------------------------------------------------------------ */

/**
 * ONE POST TO THE PARTNER'S callback_url, AFTER THE RESPONSE HAS GONE
 * (2026-09-03, pass four). A marketplace under its own 30-second
 * clock should not have to parse a synchronous body to learn a sale
 * landed; this carries the certificate, its signature and the verify
 * URL to wherever they asked, signed on the wire with the store's
 * Web Bot Auth key so their log can trace it back to us. Best effort
 * and once — the same discipline as the human-queue order callback:
 * the OUTCOME is written on the ledger row either way, so "asked to
 * be told and was not" is never invisible. The goods are already
 * theirs at the order URL and /api/verify regardless.
 */
export async function notifyTradeCallback(
  env: Env,
  partner: TradePartner,
  rowKey: string,
  row: TradeRow,
  callbackUrl: string,
  delivery: Record<string, unknown>,
  timeoutMs: number = TRADE_CALLBACK_TIMEOUT_MS,
): Promise<string> {
  const body = JSON.stringify({
    what_this_is:
      "A delivery receipt from scvd.store's trade counter: the order you signed was delivered and this is the certificate. Sent once; the same artifact verifies at verify_url forever.",
    account: partner.id,
    item_id: row.item,
    ...(row.order_ref ? { order_ref: row.order_ref } : {}),
    cert_id: row.cert_id,
    settled_via: delivery["settled_via"],
    trade: delivery["trade"],
    certificate: delivery["certificate"],
    signature: delivery["signature"],
    signature_jcs: delivery["signature_jcs"],
    public_key: delivery["public_key"],
    verify_url: delivery["verify_url"],
    deliverable: delivery["deliverable"],
  });
  let outcome: string;
  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: await webBotAuthHeaders(env, callbackUrl, { "Content-Type": "application/json" }),
      body,
    });
    outcome = response.ok
      ? `delivered (HTTP ${response.status})`
      : `attempted once, your endpoint answered HTTP ${response.status} — not retried; the certificate verifies at /api/verify regardless`;
  } catch {
    outcome =
      "attempted once, your endpoint was unreachable — not retried; the certificate verifies at /api/verify regardless";
  }
  await kvPut(env.ORDERS, rowKey, JSON.stringify({ ...row, callback: outcome })).catch(() => undefined);
  return outcome;
}

/* ------------------------------------------------------------------ */
/* The statement, signed                                              */
/* ------------------------------------------------------------------ */

/**
 * A STATEMENT A FINANCE DESK CAN CHECK WITHOUT TRUSTING THE WIRE. The
 * rows are signed the way every artifact here is: ed25519 over the
 * JCS (RFC 8785) canonical form of signed_payload, against the
 * published key. It costs one signature and it is the whole point of
 * this store — what we say a partner owes should be checkable by the
 * partner's own tooling, offline, later.
 */
export async function signedStatement(
  env: Env,
  partner: TradePartner,
  readAt: string,
): Promise<{
  signed_payload: Record<string, unknown>;
  signature_jcs: string;
  public_key: string;
  signature_covers: string;
  canonical_form: string;
}> {
  const statement = await tradeStatement(env, partner);
  const signedPayload: Record<string, unknown> = {
    account: partner.id,
    read_at: readAt,
    summary: statement.summary,
    deliveries: statement.deliveries,
    payouts: statement.payouts,
    deliveries_truncated: statement.deliveries_truncated,
    payouts_truncated: statement.payouts_truncated,
  };
  const [signatureJcs, publicKey] = await Promise.all([
    signJcs(signedPayload, env.SIGNING_KEY),
    cachedPublicKeyHex(env.SIGNING_KEY),
  ]);
  return {
    signed_payload: signedPayload,
    signature_jcs: signatureJcs,
    public_key: publicKey,
    signature_covers:
      "The JCS (RFC 8785) canonical form of signed_payload, signed ed25519 with the store's published artifact key: ed25519_verify(utf8(canonical_form), hex_to_bytes(signature_jcs), hex_to_bytes(public_key)). Any library, no request to us.",
    canonical_form: jcsCanonicalize(signedPayload),
  };
}

export async function recordTradePayout(
  env: Env,
  partner: TradePartner,
  amountUsd: number,
  reference: string,
  now: Date = new Date(),
): Promise<TradePayoutRow> {
  const payoutId = `payout_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const row: TradePayoutRow = {
    partner: partner.id,
    payout_id: payoutId,
    amount_usd: Math.round(amountUsd * 100) / 100,
    reference,
    recorded_at: now.toISOString(),
  };
  await kvPut(
    env.ORDERS,
    KV_KEYS.tradePayout(partner.id, invertedTimestamp(now.getTime()), payoutId),
    JSON.stringify(row),
  );
  await adjustOutstanding(env, partner, -cents(row.amount_usd));
  return row;
}

/** Bounded reads, with the bound SAID (rule 52). */
const ROW_SCAN_CAP = 2000;
const PAYOUT_SCAN_CAP = 500;

async function readRows<T>(
  env: Env,
  prefix: string,
  cap: number,
  isRow: (value: unknown) => value is T,
): Promise<{ rows: T[]; truncated: boolean }> {
  const listed = await listKeys(env.ORDERS, { prefix, cap });
  const rows: T[] = [];
  for (const name of listed.names) {
    const value = await kvGetJson<unknown>(env.ORDERS, name, "json");
    if (isRow(value)) {
      rows.push(value);
    }
  }
  return { rows, truncated: listed.truncated };
}

function isTradeRow(value: unknown): value is TradeRow {
  return (
    isRecord(value) &&
    typeof value["cert_id"] === "string" &&
    typeof value["net_usd"] === "number" &&
    typeof value["mode"] === "string"
  );
}

function isPayoutRow(value: unknown): value is TradePayoutRow {
  return (
    isRecord(value) &&
    typeof value["payout_id"] === "string" &&
    typeof value["amount_usd"] === "number"
  );
}

function cents(usd: number): number {
  return Math.round(usd * 100);
}

export interface TradeAccountSummary {
  account: string;
  name: string;
  site: string;
  mode: TradePartner["mode"];
  opened: string;
  partner_share_bps: number;
  daily_cap: number;
  credit_ceiling_usd: number;
  items: readonly string[];
  delivered_live: number;
  delivered_test: number;
  billed_usd: number;
  net_usd: number;
  paid_usd: number;
  outstanding_usd: number;
  last_delivery_at: string | null;
  last_payout_at: string | null;
  /**
   * The oldest live delivery not yet covered by payouts, walking the
   * rows oldest-first against the paid total. Null when nothing is
   * outstanding. The aging watch reads this.
   */
  oldest_unpaid_at: string | null;
  /** True when a capped read stopped early; every figure above is then a floor. */
  truncated: boolean;
}

export async function tradeAccountSummary(
  env: Env,
  partner: TradePartner,
): Promise<TradeAccountSummary> {
  const [deliveries, payouts] = await Promise.all([
    readRows(env, KV_KEYS.tradeRowPrefix(partner.id), ROW_SCAN_CAP, isTradeRow),
    readRows(env, KV_KEYS.tradePayoutPrefix(partner.id), PAYOUT_SCAN_CAP, isPayoutRow),
  ]);
  let live = 0;
  let test = 0;
  let billedCents = 0;
  let netCents = 0;
  for (const row of deliveries.rows) {
    if (row.mode === "test") {
      test += 1;
      continue;
    }
    live += 1;
    billedCents += cents(row.trade_price_usd);
    netCents += cents(row.net_usd);
  }
  let paidCents = 0;
  for (const row of payouts.rows) {
    paidCents += cents(row.amount_usd);
  }
  // Oldest-first: payouts cover the oldest lines first; the first line
  // the paid total does not reach is the one that has waited longest.
  let covered = paidCents;
  let oldestUnpaid: string | null = null;
  for (const row of [...deliveries.rows].reverse()) {
    if (row.mode !== "live") continue;
    covered -= cents(row.net_usd);
    if (covered < 0) {
      oldestUnpaid = row.delivered_at;
      break;
    }
  }
  return {
    account: partner.id,
    name: partner.name,
    site: partner.site,
    mode: partner.mode,
    opened: partner.opened,
    partner_share_bps: partner.partner_share_bps,
    daily_cap: partner.daily_cap,
    credit_ceiling_usd: partner.credit_ceiling_usd,
    items: partner.items,
    delivered_live: live,
    delivered_test: test,
    billed_usd: billedCents / 100,
    net_usd: netCents / 100,
    paid_usd: paidCents / 100,
    outstanding_usd: (netCents - paidCents) / 100,
    last_delivery_at: deliveries.rows[0]?.delivered_at ?? null,
    last_payout_at: payouts.rows[0]?.recorded_at ?? null,
    oldest_unpaid_at: oldestUnpaid,
    truncated: deliveries.truncated || payouts.truncated,
  };
}

/* ------------------------------------------------------------------ */
/* The aging watch — rule 41's other side                             */
/* ------------------------------------------------------------------ */

/**
 * A receivable is a liability's mirror and is watched the same way:
 * every Sunday press, any live account whose oldest unpaid delivery
 * is older than TRADE_STATEMENT_DAYS pages the keeper once, keyed by
 * account and ISO week so a standing debt says so weekly rather than
 * hourly. Returns what it found so the sweep and a test can read it.
 */
export async function tradeReceivableWatch(
  env: Env,
  now: Date = new Date(),
): Promise<Array<{ account: string; outstanding_usd: number; oldest_unpaid_at: string; days: number }>> {
  const aged: Array<{ account: string; outstanding_usd: number; oldest_unpaid_at: string; days: number }> = [];
  for (const partner of TRADE_PARTNERS) {
    if (partner.mode !== "live") continue;
    const summary = await tradeAccountSummary(env, partner);
    if (summary.outstanding_usd <= 0 || !summary.oldest_unpaid_at) continue;
    const days = Math.floor(
      (now.getTime() - new Date(summary.oldest_unpaid_at).getTime()) / 86_400_000,
    );
    if (days < TRADE_STATEMENT_DAYS) continue;
    aged.push({
      account: partner.id,
      outstanding_usd: summary.outstanding_usd,
      oldest_unpaid_at: summary.oldest_unpaid_at,
      days,
    });
    const week = now.toISOString().slice(0, 10);
    await sendAlert(env, {
      condition: "books_invariant",
      key: `trade-aging-${partner.id}-${week}`,
      detail: `${partner.name}'s trade account has $${summary.outstanding_usd} unpaid, and its oldest unpaid delivery (${summary.oldest_unpaid_at}) is ${days} days old against a ${TRADE_STATEMENT_DAYS}-day statement. Reconcile against their statement (/admin/trade.json) and record the payout, or chase it; the counter keeps delivering until the credit ceiling ($${partner.credit_ceiling_usd}).`,
    }).catch(() => undefined);
  }
  return aged;
}

/* ------------------------------------------------------------------ */
/* The catalog feed — what a marketplace lists from                   */
/* ------------------------------------------------------------------ */

/**
 * One row per shelf item with everything a listing needs: the copy
 * the item page prints, what it reads, its constraints, the free
 * specimen, the artifact class and what it does not prove, and the
 * price at the caller's share. DERIVED from the same rows the item
 * pages render, so a marketplace's listing cannot say something our
 * own shelf does not.
 */
export function tradeCatalog(base: string, shareBps: number = TRADE_EXAMPLE_SHARE_BPS) {
  return tradeShelf().map(({ item, input, fields }) => {
    const price = tradePriceUsd(item, shareBps);
    // An item with no class of its own mints the certificate class
    // (attestation-spec.ts says so); a listing never lacks the sentence
    // saying what the signature does not prove.
    const cls =
      artifactClassForItem(item.id) ?? ARTIFACT_CLASSES.find((entry) => entry.id === "certificate");
    return {
      item_id: item.id,
      name: item.name,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      description: item.description,
      what_it_reads: READS_SENTENCE[item.reads],
      ...(item.constraints ? { constraints: item.constraints } : {}),
      cadence: item.cadence,
      ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
      retail_usd: item.price_usdc,
      share_bps: shareBps,
      trade_price_usd: price,
      store_net_usd: tradeNetUsd(price, shareBps),
      input_kind: input,
      fields,
      ...(item.sample_url ? { specimen: `${base}${item.sample_url}` } : {}),
      ...(cls
        ? {
            artifact_class: cls.id,
            signs: cls.signs,
            does_not_prove: cls.does_not_prove,
            verify_url_template: `${base}${cls.verify_url}`,
          }
        : {}),
      item_page: `${base}/menu/${item.id}`,
      front_door: `${base}/api/buy/${item.id}`,
    };
  });
}

export async function tradeLedger(env: Env): Promise<TradeAccountSummary[]> {
  return Promise.all(TRADE_PARTNERS.map((partner) => tradeAccountSummary(env, partner)));
}

/** The keeper's statement: every row, both sides, for reconciliation by hand. */
export async function tradeStatement(
  env: Env,
  partner: TradePartner,
): Promise<{
  summary: TradeAccountSummary;
  deliveries: TradeRow[];
  payouts: TradePayoutRow[];
  deliveries_truncated: boolean;
  payouts_truncated: boolean;
}> {
  const [summary, deliveries, payouts] = await Promise.all([
    tradeAccountSummary(env, partner),
    readRows(env, KV_KEYS.tradeRowPrefix(partner.id), ROW_SCAN_CAP, isTradeRow),
    readRows(env, KV_KEYS.tradePayoutPrefix(partner.id), PAYOUT_SCAN_CAP, isPayoutRow),
  ]);
  return {
    summary,
    deliveries: deliveries.rows,
    payouts: payouts.rows,
    deliveries_truncated: deliveries.truncated,
    payouts_truncated: payouts.truncated,
  };
}

/* ------------------------------------------------------------------ */
/* Recovery by order_ref — the partner's customer lost the receipt     */
/* ------------------------------------------------------------------ */

/**
 * THE RESET CASE, AT THE BACK DOOR (pass five). The front door's claims
 * desk recovers certificates by proving a wallet; a marketplace's
 * customer has no wallet here, only the order_ref their marketplace
 * gave them. So the marketplace asks on their behalf, signed like any
 * order, and gets the certificate record back. A bounded scan of the
 * account's rows, newest first, that says when it stopped early.
 */
export async function findTradeDelivery(
  env: Env,
  partner: TradePartner,
  orderRef: string,
): Promise<{ row: TradeRow; certificate: CertificateRecord | null } | null> {
  const listed = await listKeys(env.ORDERS, {
    prefix: KV_KEYS.tradeRowPrefix(partner.id),
    cap: ROW_SCAN_CAP,
  });
  for (const name of listed.names) {
    const value = await kvGetJson<unknown>(env.ORDERS, name, "json");
    if (isTradeRow(value) && value.order_ref === orderRef) {
      return { row: value, certificate: await getCertificate(env, value.cert_id) };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The worked example, computed                                        */
/* ------------------------------------------------------------------ */

export async function workedExample(base: string, sandbox: TradePartner) {
  const secret = sandbox.sandbox?.signing_secret ?? "";
  const signingString = tradeSigningString(
    { signing_string: "timestamp.nonce.body" },
    TRADE_WORKED_EXAMPLE.timestamp,
    TRADE_WORKED_EXAMPLE.nonce,
    TRADE_WORKED_EXAMPLE.body,
  );
  return {
    what_this_is:
      "One sandbox order with fixed inputs, every byte shown, so you can diff your signer against ours line by line. The timestamp is in the past on purpose: send it and the door answers stale_timestamp, which is also worth seeing once.",
    door: `${base}/api/trade/${sandbox.id}/${TRADE_WORKED_EXAMPLE.item_id}`,
    body: TRADE_WORKED_EXAMPLE.body,
    body_bytes: new TextEncoder().encode(TRADE_WORKED_EXAMPLE.body).byteLength,
    headers: {
      "X-Trade-Key": sandbox.sandbox?.provider_key ?? "",
      "X-Trade-Timestamp": TRADE_WORKED_EXAMPLE.timestamp,
      "X-Trade-Nonce": TRADE_WORKED_EXAMPLE.nonce,
      "X-Trade-Signature": `sha256=${await hmacSha256Hex(secret, signingString)}`,
    },
    signing_string: signingString,
    signing_string_sha256: await sha256Hex(signingString),
    secret,
    how_to_compare:
      "HMAC-SHA256 the signing_string with the secret; hex must equal the X-Trade-Signature value after sha256=. If your sha256 of the signing string differs from signing_string_sha256, your bytes differ before any secret is involved.",
  };
}
