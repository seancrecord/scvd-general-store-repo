import { createFacilitatorConfig } from "@coinbase/x402";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { PaymentOption, RouteConfig, RoutesConfig } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import {
  buyDiscoveryExtensions,
  pennyPageDiscoveryExtensions,
  requiredParamsNote,
} from "@/lib/bazaar-discovery";
import { installBazaarObserver } from "@/lib/bazaar-observer";
import { extractPaymentNonce, payerOfVerifiedPayload } from "@/lib/replay-guard";
import { BASE_CHAIN, findAuthorizationUse } from "@/lib/base-rpc";
import {
  getMenuItem,
  MENU_ITEMS,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { COMMISSION_RUNGS } from "@/store/commission-desk";
import { SPEC_RETURNS } from "@/store/spec";
import { isRecord } from "@/types";
import type { Env, MenuItem } from "@/types";

/**
 * x402 v2 payment plumbing. USDC on Base (eip155:8453), Polygon
 * (eip155:137, flag-gated) and Solana, CDP facilitator for all three.
 *
 * Pay-what-it-deserves items are offered as multiple exact-scheme tiers in
 * the 402 challenge (v2 requires the authorized value to exactly equal one
 * offered amount); paying a tier above the minimum is recorded as a tip.
 *
 * Penny pages (Almanac entries, Gazette issues) are flat $0.01 markdown
 * routes. Almanac slugs are known at build time and registered exactly;
 * Gazette issues are published from the back room at runtime, so those
 * ride the /gazette/issue-:issue pattern (prefixed segment, never a bare
 * id) and inherit the exact request URL as their 402 resource.
 *
 * Every paid route declares extensions.bazaar discovery metadata; the
 * bazaar server extension enriches it per request with live method and
 * path params.
 */

export const BASE_NETWORK = "eip155:8453";
/**
 * THE SECOND RAIL (2026-08-04): USDC on Solana mainnet, CAIP-2 form —
 * the genesis-hash network id the CDP facilitator's own supported
 * list names. Gate history in PAYMENT_RAILS.md: Part A audit passed
 * for both rails, `npm run supported:kinds` confirmed the facilitator
 * the store ALREADY trusts settles solana-exact, so this rail reuses
 * the whole existing verify/settle path — one more accepts[] entry,
 * zero new buyer-facing branches, exactly the shape MPP failed to be.
 *
 * FLAG-GATED ON SOLANA_PAY_TO: with the var unset, nothing about any
 * 402 changes. Set it (the keeper's receive-address ceremony: key
 * generated offline, seed on paper, only the PUBLIC address deployed)
 * and every priced route offers every live rail, Base entries first so a
 * client that blindly signs accepts[0] behaves exactly as before.
 */
export const SOLANA_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const PENNY_PAGE_USDC = 0.01;
const USDC_DECIMALS = 6;

/** Base58, 32-44 chars: the only shape a Solana pubkey comes in. A
 * malformed address stays OUT of the 402 rather than minting offers
 * nobody can pay. */
export function solanaPayTo(env: Env): string | null {
  const address = env.SOLANA_PAY_TO?.trim();
  return address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    ? address
    : null;
}

/**
 * THE THIRD RAIL (2026-08-20): USDC on Polygon PoS, same facilitator.
 *
 * The gates that opened Solana both stand open wider here. Demand:
 * Token Terminal's 30-day read has Polygon carrying 5.6M of 14M x402
 * transfers — the second-biggest rail in the economy, invisible from
 * our census because the Base-centric registry we probe doesn't list
 * it. Door cost: LOWER than Solana's was — the CDP facilitator
 * announced Polygon support, @x402/evm already carries the Polygon
 * USDC deployment in its own table, the scheme is the same
 * ExactEvmScheme the Base rail runs, and an EVM pay-to address works
 * on Polygon as-is. Flag-gated on POLYGON_PAY_TO exactly as Solana is
 * on SOLANA_PAY_TO: unset, the store is byte-identical to before the
 * rail existed.
 *
 * Deliberately a SEPARATE variable from PAY_TO_ADDRESS even though
 * the keeper will almost certainly set the same 0x address: lighting
 * a rail is a decision, and inferring it from a variable set for a
 * different chain would be the store deciding for him.
 */
export const POLYGON_NETWORK = "eip155:137";

/** 0x + 40 hex, the only shape an EVM address comes in. Same rule as
 * the Solana gate: malformed stays OUT of the 402. */
export function polygonPayTo(env: Env): string | null {
  const address = env.POLYGON_PAY_TO?.trim();
  return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null;
}

/** Every rail the till currently accepts, for the discovery documents. */
export function acceptedNetworks(env: Env): string[] {
  const networks = [BASE_NETWORK];
  if (polygonPayTo(env)) networks.push(POLYGON_NETWORK);
  if (solanaPayTo(env)) networks.push(SOLANA_NETWORK);
  return networks;
}

/**
 * THE RECONCILIATION CAP (the ruling PAYMENT_RAILS.md required before
 * the door opened): the bank reconciliation walks Base RPC only, so
 * Solana settles are UNRECONCILED until a Solana-side walk ships.
 * Unwatched money is against the house style; bounded, named, alarmed
 * money is the house style. When cumulative Solana settles pass this,
 * the keeper is paged to either ship the Solana reconciliation or
 * close the door (unset SOLANA_PAY_TO — a secret change redeploys).
 * The cap alerts; it does not refuse a buyer mid-purchase, because a
 * paid-and-refused settle would be worse than an unreconciled one.
 */
export const SOLANA_UNRECONCILED_CAP_USDC = 10;
export const SOLANA_SETTLED_TOTAL_KEY = "solana_settled_total_usdc";

export async function recordSolanaSettle(
  env: Env,
  paidUsdc: number,
): Promise<void> {
  const current = Number(
    (await env.COUNTERS.get(SOLANA_SETTLED_TOTAL_KEY)) ?? "0",
  );
  const total = Math.round((current + paidUsdc) * 1e6) / 1e6;
  await env.COUNTERS.put(SOLANA_SETTLED_TOTAL_KEY, String(total));
  if (total > SOLANA_UNRECONCILED_CAP_USDC) {
    /**
     * SELF-RETIRING: the cap exists because unreconciled money is
     * against the house style, so it stands down exactly when the
     * Solana reconciliation walk is demonstrably alive — a clean pass
     * inside the last 24h (the walk runs hourly; 24h of slack keeps a
     * flaky RPC from crying wolf). A walk that stops passing brings
     * the cap back on its own, which makes this the walk's backstop
     * rather than a rule someone has to remember to delete.
     */
    const { SOLANA_RECONCILE_OK_KEY } = await import(
      "@/services/chain-reconciliation"
    );
    const lastOk = await env.COUNTERS.get(SOLANA_RECONCILE_OK_KEY);
    const walkAlive =
      lastOk !== null &&
      Date.now() - new Date(lastOk).getTime() < 24 * 60 * 60 * 1000;
    if (walkAlive) {
      return;
    }
    const { sendAlert } = await import("@/lib/alerts");
    // The walk's own last word rides the page, so "check the cron"
    // comes with the reason already attached.
    const { SOLANA_RECONCILE_LAST_RESULT_KEY } = await import(
      "@/services/chain-reconciliation"
    );
    const lastResult = await env.COUNTERS.get(
      SOLANA_RECONCILE_LAST_RESULT_KEY,
    );
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Solana settles have passed the $${SOLANA_UNRECONCILED_CAP_USDC} unreconciled cap ($${total} total) and the Solana-side bank reconciliation has not completed a pass in the last 24h. Either the walk is broken (check the cron) or it never ran — fix it, or close the door (unset SOLANA_PAY_TO). Money keeps settling honestly meanwhile — this alert is the bound, not a refusal. Last walk result: ${lastResult ?? "none recorded — it has never run on this deployment"}.`,
      key: "solana-unreconciled-cap",
    }).catch(() => undefined);
  }
}

/**
 * The same ruling, third rail: Polygon settles are UNRECONCILED until
 * a Polygon-side walk ships, so the same bounded-named-alarmed cap
 * stands in front of them. Mirrors the Solana cap deliberately —
 * PAYMENT_RAILS.md's rule is per-rail, not per-incident.
 */
export const POLYGON_UNRECONCILED_CAP_USDC = 10;
export const POLYGON_SETTLED_TOTAL_KEY = "polygon_settled_total_usdc";

export async function recordPolygonSettle(
  env: Env,
  paidUsdc: number,
): Promise<void> {
  const current = Number(
    (await env.COUNTERS.get(POLYGON_SETTLED_TOTAL_KEY)) ?? "0",
  );
  const total = Math.round((current + paidUsdc) * 1e6) / 1e6;
  await env.COUNTERS.put(POLYGON_SETTLED_TOTAL_KEY, String(total));
  if (total > POLYGON_UNRECONCILED_CAP_USDC) {
    const { sendAlert } = await import("@/lib/alerts");
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Polygon settles have passed the $${POLYGON_UNRECONCILED_CAP_USDC} unreconciled cap ($${total} total) and no Polygon-side bank reconciliation exists yet. Ship the Polygon walk, or close the door (unset POLYGON_PAY_TO — a secret change redeploys). Money keeps settling honestly meanwhile — this alert is the bound, not a refusal.`,
      key: "polygon-unreconciled-cap",
    }).catch(() => undefined);
  }
}

/** Tier multipliers for pay-what-it-deserves items: minimum, generous, patron-of-the-arts. */
const PWID_TIER_MULTIPLIERS = [1, 2, 5] as const;

export function priceTiersUsdc(item: MenuItem): number[] {
  if (item.pricing !== "pay_what_it_deserves") {
    return [item.price_usdc];
  }
  /**
   * ROUNDED TO USDC's OWN RESOLUTION, NOT TO CENTS. Cent rounding sat
   * here while the shelf's floor price was $0.004 — safe only because
   * every sub-cent item happens to be fixed-price, which made the menu
   * composition the only guard on the till's arithmetic. The day a
   * sub-cent shelf went pay-what-it-deserves, its tiers would have
   * collapsed to $0.00. Found in the 2026-08-01 scale walk; same
   * defect shape as the conversion rate that rounded 1/7892 to zero.
   * Six decimals is atomic USDC: exact for anything that can settle.
   */
  return PWID_TIER_MULTIPLIERS.map(
    (multiplier) => Math.round(item.price_usdc * multiplier * 1e6) / 1e6,
  );
}

export function usdcToAtomic(usdc: number): string {
  return String(Math.round(usdc * 10 ** USDC_DECIMALS));
}

export function atomicToUsdc(atomic: string): number {
  return Number(BigInt(atomic)) / 10 ** USDC_DECIMALS;
}

/**
 * Shown when a human wanders into a buy URL with a browser. We don't run a
 * wallet paywall; humans get pointed back to the front porch.
 */
function browserPaywallHtml(item: MenuItem, env: Env): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>That shelf is for agents</title></head>
<body style="font-family: Georgia, serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem;">
<h1>That shelf is for agents, friend.</h1>
<p>&ldquo;${item.name}&rdquo; is bought over the x402 protocol &mdash; your agent
will know what to do with the 402 this page came with.</p>
<p>You're welcome to browse the <a href="${env.STORE_BASE_URL}/">front of the store</a>
like a regular person. The guestbook's free.</p>
</body></html>`;
}

/**
 * The 402's resource description rides inside the payment payload the
 * client echoes to the facilitator, and CDP's schema caps it at 500
 * characters — discovered the hard way when the store's four wordiest
 * listings became unbuyable. The header carries the compact spec
 * capability line; the full pitch lives in menu.json and the 402 body.
 * DESCRIPTION_CAP is pinned by test; never let a pitch outgrow the till.
 */
export const ROUTE_DESCRIPTION_CAP = 480;

export function buyRouteDescription(item: MenuItem, env: Env): string {
  const tierNote =
    item.pricing === "pay_what_it_deserves"
      ? " Amounts above the minimum record as tips."
      : "";
  const description = `${item.name}. ${SPEC_RETURNS[item.id] ?? item.description}${tierNote} Full listing: ${env.STORE_BASE_URL}/menu/${item.id}. MCP tool: buy_${item.id}.`;
  return description.length > ROUTE_DESCRIPTION_CAP
    ? `${description.slice(0, ROUTE_DESCRIPTION_CAP - 1)}\u2026`
    : description;
}

/**
 * serviceName / tags / iconUrl, the only service-level fields a
 * facilitator carries through onto a catalogued resource. The name is
 * the short one on purpose: the field caps at 32 printable-ASCII
 * characters and the store's real name is 37, so the full name is not
 * truncated by the catalog, it is dropped.
 */
function storeServiceMetadata(
  env: Env,
): Pick<RouteConfig, "serviceName" | "tags" | "iconUrl"> {
  return {
    serviceName: STORE_SERVICE_NAME,
    tags: [...STORE_TAGS],
    iconUrl: `${env.STORE_BASE_URL}/favicon.svg`,
  };
}

/**
 * Every rail's entries for one set of price tiers, Base first. Order
 * is a compatibility promise: accepts[0] stays the Base minimum tier
 * forever, because clients that sign the first offer without reading
 * the rest exist and were working before the second rail did.
 */
export function railAccepts(env: Env, tiersUsdc: number[]): PaymentOption[] {
  const accepts: PaymentOption[] = tiersUsdc.map((tierUsdc) => ({
    scheme: "exact",
    network: BASE_NETWORK,
    price: `$${tierUsdc}`,
    payTo: env.PAY_TO_ADDRESS,
  }));
  const polygon = polygonPayTo(env);
  if (polygon) {
    for (const tierUsdc of tiersUsdc) {
      accepts.push({
        scheme: "exact",
        network: POLYGON_NETWORK,
        price: `$${tierUsdc}`,
        payTo: polygon,
      });
    }
  }
  const solana = solanaPayTo(env);
  if (solana) {
    for (const tierUsdc of tiersUsdc) {
      accepts.push({
        scheme: "exact",
        network: SOLANA_NETWORK,
        price: `$${tierUsdc}`,
        payTo: solana,
      });
    }
  }
  return accepts;
}

function buyRouteConfig(item: MenuItem, env: Env): RouteConfig {
  const accepts = railAccepts(env, priceTiersUsdc(item));
  return {
    accepts,
    description: buyRouteDescription(item, env),
    mimeType: "application/json",
    resource: `${env.STORE_BASE_URL}/api/buy/${item.id}`,
    // The three fields a facilitator keeps off every resource it
    // catalogs. Declaring none of them is why our entries in someone
    // else's index have been anonymous URLs with prices on them.
    ...storeServiceMetadata(env),
    extensions: buyDiscoveryExtensions(item),
    customPaywallHtml: browserPaywallHtml(item, env),
    unpaidResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error: item.note_402,
        note: "Payment requirements are in the PAYMENT-REQUIRED response header (base64 JSON). Sign one of the accepts and retry with the PAYMENT-SIGNATURE header.",
        item_id: item.id,
        min_price_usdc: item.price_usdc,
        pricing: item.pricing,
        // An unsigned request now gets the price even when the item
        // needs input (the probe rule, buy.ts). Then the challenge has
        // to say what to send, or the caller learns the requirement by
        // being refused, which is worse manners than we keep.
        ...requiredParamsNote(item),
        /**
         * THE PROMISE, AT THE MOMENT OF DECISION (the Price Club
         * rung, 2026-08-20). A buyer weighing a human-fulfilled item
         * is weighing the gap between paying now and delivery later;
         * the refund commitment is the answer to exactly that worry,
         * and it was published everywhere except the one response a
         * buyer reads before deciding. Derived from the item's own
         * sla_hours — never a typed number.
         */
        ...(item.fulfillment === "human_queue"
          ? {
              refund_promise: `Delivered within ${item.sla_hours ?? 168} hours of settlement or your money back — full amount, tip included, paid by the keeper himself with the transaction hash on the public record at ${env.STORE_BASE_URL}/fulfillment-log. The written commitment: ${env.STORE_BASE_URL}/rights.`,
            }
          : {}),
        want_something_else: `Can't pay, or want something we don't stock? POST ${env.STORE_BASE_URL}/api/request, the keeper reads every one on Sundays.`,
      },
    }),
    settlementFailedResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error:
          "The payment didn't clear, so nothing left the shelf. No charge, no order. Try again whenever you're ready.",
      },
    }),
  };
}

/** A flat one-cent markdown page (Almanac page or Gazette issue). */
function pennyPageRouteConfig(
  env: Env,
  description: string,
  note402: string,
  exampleTitle: string,
  resource?: string,
): RouteConfig {
  /**
   * THE PRICE STAYS A PENNY; THERE IS NOW SOMEWHERE TO PAY MORE.
   *
   * Keeper's call 2026-07-30, after the store's first sale to a
   * stranger turned out to be an almanac page: keep it listed at a
   * penny, and add a place for anyone who thinks it was worth more.
   *
   * The mechanism already existed and the penny pages simply never had
   * it — menu items priced pay-what-it-deserves offer three tiers and
   * book anything above the minimum as a tip. The FIRST tier is still
   * the penny and is still what every listing quotes, so nothing about
   * the advertised price changes: a buyer who wants the cheap door pays
   * exactly what the index said, and the other two are there for
   * somebody who doesn't.
   *
   * This is a floor with room above it, not a price rise, and the
   * distinction matters enough to be a test.
   */
  const config: RouteConfig = {
    accepts: railAccepts(
      env,
      PWID_TIER_MULTIPLIERS.map(
        (multiplier) => Math.round(PENNY_PAGE_USDC * multiplier * 100) / 100,
      ),
    ),
    description,
    mimeType: "text/markdown",
    ...storeServiceMetadata(env),
    extensions: pennyPageDiscoveryExtensions(exampleTitle),
    unpaidResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error: note402,
        note: "Payment requirements are in the PAYMENT-REQUIRED response header (base64 JSON). Sign the accepted amount and retry with the PAYMENT-SIGNATURE header.",
        price_usdc: PENNY_PAGE_USDC,
        pricing: "fixed",
        pay_more_if_you_like: `The price is $${PENNY_PAGE_USDC} and that is what the index quotes. The PAYMENT-REQUIRED header offers higher amounts too; anything above the first is recorded as a tip to the keeper, and buys you exactly the same page. No tier is better than any other.`,
        want_something_else: `Can't pay, or want something we don't stock? POST ${env.STORE_BASE_URL}/api/request, the keeper reads every one on Sundays.`,
      },
    }),
    settlementFailedResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error:
          "The penny didn't clear, so the page stays shut. No charge. Try again whenever you're ready.",
      },
    }),
  };
  if (resource) {
    config.resource = resource;
  }
  return config;
}

/**
 * A COMMISSION RUNG: one static x402 route per published price on the
 * desk's ladder (COMMISSION_DESK.md §3a, ruled 2026-08-10). The price
 * is a value computed at boot from the ladder, never a lookup — the
 * quote-forgery surface the spec named is closed by construction,
 * because the money spine holds no code path on which a stored quote
 * or a query parameter could become the amount. Which quote a payment
 * honours is the ROUTE's business (routes/commission.ts, before this
 * gate); what a rung costs is decided here, once, at boot.
 */
function commissionRungRouteConfig(rung: number, env: Env): RouteConfig {
  return {
    accepts: railAccepts(env, [rung]),
    description: `Commission Desk, the $${rung} rung. Pays a LIVE KEEPER QUOTE at this exact price — requires ?commission=<id> naming a request quoted at $${rung}. Without a quote this route sells nothing: write in free at POST /api/request and the keeper answers by hand.`,
    mimeType: "application/json",
    resource: `${env.STORE_BASE_URL}/api/commission/pay/${rung}`,
    ...storeServiceMetadata(env),
    unpaidResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error: `This is the Commission Desk's $${rung} rung, friend. It takes payment only against a live quote at this exact price — the keeper's terms, not a menu price.`,
        note: "Payment requirements are in the PAYMENT-REQUIRED response header (base64 JSON). A payment needs ?commission=<id> for a request the keeper has quoted at this rung; anything else is refused before any money moves.",
        how_the_desk_works: `POST ${env.STORE_BASE_URL}/api/request with { description, offer_usdc, contact } — free. The keeper reads every one and quotes by hand at a published rung with its own delivery window. Check your request at GET ${env.STORE_BASE_URL}/api/commission/{id}.`,
        price_usdc: rung,
        pricing: "quoted",
      },
    }),
    settlementFailedResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error:
          "The payment didn't clear, so the commission stays open at its quote. No charge, no order. Try again while the quote is live.",
      },
    }),
  };
}

/** The desk's pay path, parsed: the rung it names, or null off-ladder. */
export function commissionRungFromPath(path: string): number | null {
  const match = /^\/api\/commission\/pay\/(\d+)$/.exec(path);
  if (!match) return null;
  const rung = Number(match[1]);
  return COMMISSION_RUNGS.some((published) => published === rung) ? rung : null;
}

/**
 * The minimum owed for a gated path, so overpayment can be recorded as a
 * tip. Menu purchases look up the item; penny pages are a flat cent.
 */
export function minimumUsdcForPath(path: string): number {
  if (path.startsWith("/api/buy/")) {
    return getMenuItem(path.replace(/^\/api\/buy\//, ""))?.price_usdc ?? 0;
  }
  // A commission payment's minimum is its rung; above it is a tip,
  // same book-keeping as every pay-what-it-deserves shelf.
  const rung = commissionRungFromPath(path);
  if (rung !== null) {
    return rung;
  }
  if (
    path.startsWith("/almanac/") ||
    path.startsWith("/gazette/issue-") ||
    path.startsWith("/zodiac/archive/")
  ) {
    return PENNY_PAGE_USDC;
  }
  return 0;
}

/**
 * WHY A PAYMENT WAS DECLINED — the most valuable fact this store can
 * produce, and until 2026-07-28 the one most likely to be lost.
 *
 * The original design remembered the reason in a module-level Map
 * keyed by the payment NONCE: the verify hook wrote it, the gate
 * re-derived the same nonce from the raw header and read it back.
 * That join had three ways to fail silently, and every one of them
 * ended with the books saying "unspecified":
 *
 *   1. NO NONCE TO JOIN ON. extractPaymentNonce wants
 *      payload.payload.authorization.nonce — an exact-EVM shape. A
 *      client signing for the wrong scheme or network may carry no
 *      such field at all, so the key does not exist on either side.
 *      That is precisely the case where the reason matters most:
 *      "you signed for the wrong network" is a fixable, OURS-shaped
 *      decline, and it was the one guaranteed to be discarded.
 *   2. THE TWO DERIVATIONS DISAGREEING. The hook reads the SDK's
 *      parsed payload; the gate parsed the base64 header itself.
 *      Nothing guarantees those produce the same string.
 *   3. EVICTION. Fifty entries, shared across concurrent requests.
 *
 * THE FIX: stop joining. The gate hands the SDK an
 * HTTPRequestContext, and the SDK passes that object through to the
 * verify hooks as transportContext (shallow-copied, so a slot object
 * on it keeps the same reference both ways). So the hook writes the
 * reason into a slot belonging to THIS REQUEST, and the gate reads it
 * back — exact, request-scoped, no key to get wrong, no race with a
 * concurrent payment, and it works whether or not a nonce exists.
 *
 * The nonce map stays as a fallback for anything that reaches the
 * hooks without our slot. Which copy answered is recorded, because a
 * fallback that cannot be told apart from an exact match is how a
 * guess becomes a fact.
 */
export interface DeclineReason {
  reason: string;
  message?: string;
  /** Which copy answered. "slot" is exact; "nonce" is best effort. */
  /**
   * Which copy answered. "body" is the SDK's own refusal, read out of
   * the 402 it built for a rejection that never reached a hook.
   */
  matched_by?: "slot" | "nonce" | "body";
}

/**
 * The per-request slot. Lives on the context object the gate builds,
 * so it is created and read within one request and cannot be seen by
 * another.
 */
export interface DeclineSlot {
  reason?: DeclineReason;
}

/** The property the gate hangs its slot on, and the hook reads back. */
export const DECLINE_SLOT_KEY = "scvdDeclineSlot";

interface MaybeSlotted {
  [DECLINE_SLOT_KEY]?: DeclineSlot;
}

/**
 * Digs the slot out of whatever the SDK handed the hook. The transport
 * context arrives as { request: <the context we built, shallow-copied> },
 * and a shallow copy preserves the slot BY REFERENCE, which is the
 * whole reason this works.
 */
function slotFrom(transportContext: unknown): DeclineSlot | undefined {
  if (!isRecord(transportContext)) {
    return undefined;
  }
  const direct = (transportContext as MaybeSlotted)[DECLINE_SLOT_KEY];
  if (direct) {
    return direct;
  }
  const request: unknown = transportContext["request"];
  if (isRecord(request)) {
    return (request as MaybeSlotted)[DECLINE_SLOT_KEY];
  }
  return undefined;
}

const declineReasons = new Map<string, DeclineReason>();
const DECLINE_MEMORY = 50;

function rememberDecline(
  paymentPayload: unknown,
  transportContext: unknown,
  reason: string,
  message?: string,
): void {
  const record: DeclineReason = { reason, ...(message ? { message } : {}) };

  // The exact copy. Works with no nonce, survives any key mismatch,
  // and cannot be read by a concurrent request.
  const slot = slotFrom(transportContext);
  if (slot) {
    slot.reason = { ...record, matched_by: "slot" };
  }

  // The fallback copy, kept for anything that arrives without a slot.
  const nonce = extractPaymentNonce(paymentPayload);
  if (!nonce) {
    return;
  }
  if (declineReasons.size >= DECLINE_MEMORY) {
    const oldest = declineReasons.keys().next().value;
    if (oldest) {
      declineReasons.delete(oldest);
    }
  }
  declineReasons.set(nonce, { ...record, matched_by: "nonce" });
}

/** One read per decline; the gate consumes it into the 402 body and the books. */
export function takeDeclineReason(nonce: string): DeclineReason | undefined {
  const found = declineReasons.get(nonce);
  if (found) {
    declineReasons.delete(nonce);
  }
  return found;
}

export interface PaymentStack {
  httpServer: x402HTTPResourceServer;
  initialized: Promise<void>;
}

let cachedStack: PaymentStack | undefined;

/**
 * Built lazily (env bindings only exist at request time) and cached per
 * isolate. initialize() fetches the facilitator's supported kinds once.
 */
export function getPaymentStack(env: Env): PaymentStack {
  if (!cachedStack) {
    installBazaarObserver();
    const facilitator = new HTTPFacilitatorClient(
      createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET),
    );
    const resourceServer = new x402ResourceServer(facilitator).register(
      BASE_NETWORK,
      new ExactEvmScheme(),
    );
    if (polygonPayTo(env)) {
      // Same scheme class as Base — @x402/evm's own table carries the
      // Polygon USDC deployment, so "$X" maps to the right contract
      // with no store-side address to mistype. Registered only when
      // the door is open: an unset flag is byte-identical to before.
      resourceServer.register(POLYGON_NETWORK, new ExactEvmScheme());
    }
    if (solanaPayTo(env)) {
      // The scheme server maps "$X" to the USDC mint and carries the
      // facilitator's feePayer through — the buyer stays gasless on
      // this rail too. Registered only when the door is open, so an
      // unset flag is byte-identical to the store before the rail.
      resourceServer.register(SOLANA_NETWORK, new ExactSvmScheme());
    }
    resourceServer.registerExtension(bazaarResourceServerExtension);
    // The decline instrument: keep the facilitator's verdict so the
    // gate can put WHY into the 402 body and the books, instead of
    // discarding it (which it did, to the keeper's own confusion).
    resourceServer.onAfterVerify(async (context) => {
      if (context.result.isValid === false) {
        rememberDecline(
          context.paymentPayload,
          context.transportContext,
          context.result.invalidReason ?? "verification_declined",
          context.result.invalidMessage,
        );
      }
    });
    resourceServer.onVerifyFailure(async (context) => {
      rememberDecline(
        context.paymentPayload,
        context.transportContext,
        "verify_error",
        context.error instanceof Error ? context.error.message : undefined,
      );
      return undefined;
    });
    const routes: RoutesConfig = {};
    for (const item of MENU_ITEMS) {
      routes[`GET /api/buy/${item.id}`] = buyRouteConfig(item, env);
    }
    for (const entry of ALMANAC_ENTRIES) {
      routes[`GET /almanac/${entry.slug}`] = pennyPageRouteConfig(
        env,
        `Keeper's Almanac, "${entry.title}" (${entry.date}). One journal page, one penny.`,
        "That page of the Almanac costs a penny, friend. The keeper wrote it by hand; a cent keeps the ink flowing.",
        entry.title,
        `${env.STORE_BASE_URL}/almanac/${entry.slug}`,
      );
    }
    /**
     * ALMANAC PAGES WRITTEN FROM THE OFFICE NEED THE SAME PATTERN THE
     * GAZETTE ALREADY USES, and this was found the hard way: the
     * office lever shipped 2026-07-30 letting the keeper write a page
     * without a deploy, and the loop above only knows the pages
     * compiled into the bundle. A keeper-written page therefore had NO
     * ROUTE CONFIG, so the gate answered 402 with no PAYMENT-REQUIRED
     * header — a page he could write and nobody could buy, which is
     * worse than no lever at all.
     *
     * MY TEST PASSED ON THAT BUG. It asserted the page came back 402
     * and stopped there, which is exactly the "measured the wrong
     * thing" failure I had spent the day naming in other people's
     * code. A 402 is not evidence of a purchasable page; a decodable
     * PAYMENT-REQUIRED header is, and that is what the test asserts
     * now.
     *
     * The exact per-entry configs above stay, because they carry a
     * richer per-page description into the challenge. This pattern is
     * the floor under everything they do not cover.
     */
    routes["GET /almanac/:slug"] = pennyPageRouteConfig(
      env,
      "Keeper's Almanac. One journal page, dated, written by hand. One penny.",
      "That page of the Almanac costs a penny, friend. The keeper wrote it by hand; a cent keeps the ink flowing.",
      "The Keeper's Almanac",
      `${env.STORE_BASE_URL}/almanac`,
    );
    // Gazette issues are published from the back room after deploy, so the
    // paid route is a prefixed pattern; the free index lists real URLs, and
    // each request's 402 carries its own exact URL as the resource.
    routes["GET /gazette/issue-:issue"] = pennyPageRouteConfig(
      env,
      "The Gazette, dispatches assembled by the keeper from reviewed Trading Post tips. A penny a copy, contributors credited.",
      "The Gazette is a penny a copy, friend. The contributors get the credit; the press gets the cent.",
      "The Gazette. Issue no. 1",
    );
    // The Systems Almanac archive: past weeks turn into penny pages as
    // the season advances, so the paid route is a pattern too.
    routes["GET /zodiac/archive/:sign/week-:week"] = pennyPageRouteConfig(
      env,
      "The Systems Almanac archive, one sign, one past week of Season One, one penny. The current week is free at /zodiac/{address}.",
      "That page of the Almanac has turned, friend. A penny opens the archive.",
      "The Systems Almanac. The Checksum, Season One, Week 1",
    );
    // The Commission Desk's ladder: one static route per published
    // rung, prices computed at boot, never read from storage or a
    // query — see commissionRungRouteConfig on why that is the law.
    for (const rung of COMMISSION_RUNGS) {
      routes[`GET /api/commission/pay/${rung}`] = commissionRungRouteConfig(
        rung,
        env,
      );
    }
    const httpServer = new x402HTTPResourceServer(resourceServer, routes);
    cachedStack = { httpServer, initialized: httpServer.initialize() };
    // A failed first sync shouldn't poison the isolate forever.
    cachedStack.initialized.catch(() => {
      cachedStack = undefined;
    });
  }
  return cachedStack;
}

/**
 * ONE SETTLE RETRY ON A FACILITATOR 5xx — because on 2026-08-07 a real
 * buyer's first three purchases all died on the settle endpoint's own
 * 502s inside one minute, with the signature already verified. That is
 * the worst decline there is: intent proven, wallet good, payload
 * good, and the sale lost to somebody else's blip.
 *
 * WHY THIS IS SAFE TO RETRY. The authorization is EIP-3009: its nonce
 * can move money AT MOST ONCE on-chain, so re-submitting the same
 * settle cannot double-charge. Better, the retry converts the 5xx's
 * ambiguity into knowledge: a 5xx never says whether the transfer was
 * broadcast before the origin died, and the retry's answer settles it
 * — success means it had not (and the sale is saved), "already used"
 * means it HAD (and the decline books that, which the reconciliation
 * walk can then match to the on-chain transfer).
 *
 * ONE retry, not a loop: a rail that is down stays down, and a buyer
 * waiting on a 402 deserves an answer more than we deserve a third
 * try. Only the exact "Facilitator settle failed (5xx)" shape retries
 * — a facilitator that ANSWERED (success:false with a verdict) was not
 * a blip and is not second-guessed. Money fails closed; this narrows
 * nothing and can only turn a transport failure into a verdict.
 */
export const SETTLE_RETRY_DELAY_MS = 1500;

/**
 * The @x402/core client's own wording for "the settle endpoint
 * returned a non-OK HTTP status": transport failed, no verdict exists.
 * Everything after the status is the raw response body and is not
 * matched on.
 */
export function isTransientSettleFailure(errorReason: string | undefined): boolean {
  return /facilitator settle failed \(5\d\d\)/i.test(errorReason ?? "");
}

type SettlementArgs = Parameters<x402HTTPResourceServer["processSettlement"]>;

export async function processSettlementWithRetry(
  httpServer: x402HTTPResourceServer,
  ...args: SettlementArgs
): Promise<Awaited<ReturnType<x402HTTPResourceServer["processSettlement"]>>> {
  const first = await httpServer.processSettlement(...args);
  if (first.success || !isTransientSettleFailure(first.errorReason)) {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_RETRY_DELAY_MS));
  return httpServer.processSettlement(...args);
}

/**
 * THE AMBIGUOUS-SETTLE RESCUE — when the retry ALSO 5xx's, ask the
 * chain instead of guessing.
 *
 * The retry above closes the blip case; 2026-08-07 13:05 was the
 * OUTAGE case: both attempts 502'd, three declines booked — and all
 * three settles had broadcast and landed before the facilitator's
 * origin died. The buyer was told no three times and paid three
 * times; the store found out ten hours later from reconciliation and
 * refunded by hand (tx 0xa6819600a1f141783d7a463046a0a62e45a8f18e5a
 * 21c9b577721001a3669c19).
 *
 * The till was holding the resolving fact the whole time: the
 * payment's own EIP-3009 nonce. Burning it emits AuthorizationUsed
 * on-chain, so ONE bounded getLogs answers what two dead HTTP
 * responses could not — did the money move? If it did, the sale is a
 * sale: deliver it. If it did not, the decline stands exactly as
 * before. Money still fails closed; this can only turn a transport
 * failure into a delivered purchase, never a non-payment into one.
 *
 * Base rail only: the question is an EIP-3009 event. A Solana settle
 * that dies this way still books a decline for reconciliation to
 * catch — same as every settle did before today.
 *
 * The delay: the broadcast (if it happened) went out seconds ago and
 * Base mines in ~2s; by the time the retry's 1.5s pause and both
 * round trips have passed, a landed transfer is already in a block.
 * One short wait absorbs the stragglers; then one look, no polling.
 */
export const RESCUE_DELAY_MS = 2500;

export interface RescuedSettle {
  transaction: string;
  payer: string;
  network: string;
}

export async function rescueAmbiguousSettle(
  env: Env,
  options: {
    errorReason: string | undefined;
    paymentHeader: string | undefined;
    network: string | undefined;
  },
): Promise<RescuedSettle | null> {
  if (!isTransientSettleFailure(options.errorReason)) {
    return null;
  }
  if (options.network !== BASE_CHAIN) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(atob(options.paymentHeader ?? ""));
  } catch {
    return null;
  }
  const nonce = extractPaymentNonce(payload);
  const payer = payerOfVerifiedPayload(payload);
  if (!nonce || !payer) {
    return null;
  }
  await new Promise((resolve) => setTimeout(resolve, RESCUE_DELAY_MS));
  try {
    const used = await findAuthorizationUse(env, payer, nonce);
    if (!used) {
      return null;
    }
    return { transaction: used.txHash, payer, network: BASE_CHAIN };
  } catch {
    // The RPC being down too resolves nothing; the decline stands and
    // reconciliation remains the backstop it has always been.
    return null;
  }
}

/** What the payment gate hands to the buy handler once money has settled. */
export interface SettledPayment {
  paidUsdc: number;
  tipUsdc: number;
  payer?: string;
  transaction: string;
  /**
   * Which rail settled, from the facilitator's settle response —
   * recorded at settle time, never reconstructed (PAYMENT_RAILS.md).
   * Absent means the settlement predates the second rail; readers
   * fall back to Base, which is what every such settle was.
   */
  network?: string;
  /** PAYMENT-RESPONSE header to attach to the final response. */
  settleHeaders: Record<string, string>;
}

/**
 * WHAT A HANDLER HOLDS BEFORE THE MONEY MOVES (rule 9, amended
 * 2026-08-10 — deliver first, settle after).
 *
 * Everything here is known from the buyer's signed authorization, so a
 * handler can do its whole job — read the chain, run the probe, build
 * the artifact — before anything is charged. The one field that cannot
 * be known in advance is the settlement transaction, and getting it is
 * the act of taking the money: `settle()`.
 *
 * CALL IT AS LATE AS POSSIBLE. Every line above the call is work that
 * costs the buyer nothing if it fails; every line below it is work
 * that, if it fails, leaves money taken and goods undelivered. The
 * production incident this rule turned over on lived in exactly that
 * gap — four items read the chain AFTER settling, against a
 * rate-limited public RPC, and a dropped read became a paid customer
 * holding nothing.
 */
export interface PendingPayment {
  paidUsdc: number;
  tipUsdc: number;
  /** From the signed authorization; the facilitator may name it too. */
  payer?: string;
  network?: string;
  /**
   * Present the authorization and take the money. MEMOIZED — calling
   * twice settles once and returns the same result, so a handler need
   * not thread the payment through its own call graph to avoid a
   * double charge.
   *
   * THROWS `SettlementDeclined` if the money does not move. The gate
   * catches it and returns the decline; a handler does not have to.
   */
  settle: () => Promise<SettledPayment>;
}

/**
 * The money did not move, and the buyer's own response is already
 * built. Thrown out of `PendingPayment.settle` so a handler that has
 * done its work does not have to carry decline-handling code it would
 * get wrong; the gate unwinds to this and serves `response`.
 */
export class SettlementDeclined extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super("payment declined at settlement");
    this.name = "SettlementDeclined";
    this.response = response;
  }
}

export function tipFromPaid(paidUsdc: number, minimumUsdc: number): number {
  const tip = Math.max(0, paidUsdc - minimumUsdc);
  /**
   * Atomic-USDC resolution, not cents. Cent rounding here would book
   * a $0.004 tip as zero and a $0.005 tip as a full cent — one
   * understates the books and the other inflates them, and the
   * inflating direction is the one rule 13 exists to keep impossible.
   * Latent until a sub-cent shelf takes tips; fixed before it could
   * go live rather than after it had.
   */
  return Math.round(tip * 1e6) / 1e6;
}
