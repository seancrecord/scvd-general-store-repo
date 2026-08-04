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
import { extractPaymentNonce } from "@/lib/replay-guard";
import {
  getMenuItem,
  MENU_ITEMS,
  STORE_SERVICE_NAME,
  STORE_TAGS,
} from "@/store";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { SPEC_RETURNS } from "@/store/spec";
import { isRecord } from "@/types";
import type { Env, MenuItem } from "@/types";

/**
 * x402 v2 payment plumbing. USDC on Base (eip155:8453), CDP facilitator.
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
 * and every priced route offers both rails, Base entries first so a
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
    const { sendAlert } = await import("@/lib/alerts");
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Solana settles have passed the $${SOLANA_UNRECONCILED_CAP_USDC} unreconciled cap ($${total} total) and the Solana-side bank reconciliation does not exist yet. The ruling: ship the Solana reconciliation walk, or close the door (unset SOLANA_PAY_TO). Money keeps settling honestly meanwhile — this alert is the bound, not a refusal.`,
      key: "solana-unreconciled-cap",
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
 * The minimum owed for a gated path, so overpayment can be recorded as a
 * tip. Menu purchases look up the item; penny pages are a flat cent.
 */
export function minimumUsdcForPath(path: string): number {
  if (path.startsWith("/api/buy/")) {
    return getMenuItem(path.replace(/^\/api\/buy\//, ""))?.price_usdc ?? 0;
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
    const httpServer = new x402HTTPResourceServer(resourceServer, routes);
    cachedStack = { httpServer, initialized: httpServer.initialize() };
    // A failed first sync shouldn't poison the isolate forever.
    cachedStack.initialized.catch(() => {
      cachedStack = undefined;
    });
  }
  return cachedStack;
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
