import { createFacilitatorConfig } from "@coinbase/x402";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type {
  PaymentOption,
  RouteConfig,
  RoutesConfig,
} from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import {
  buyDiscoveryExtensions,
  pennyPageDiscoveryExtensions,
  requiredParamsNote,
} from "@/lib/bazaar-discovery";
import { installBazaarObserver } from "@/lib/bazaar-observer";
import { extractPaymentNonce } from "@/lib/replay-guard";
import { getMenuItem, MENU_ITEMS } from "@/store";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { SPEC_RETURNS } from "@/store/spec";
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
export const PENNY_PAGE_USDC = 0.01;
const USDC_DECIMALS = 6;

/** Tier multipliers for pay-what-it-deserves items: minimum, generous, patron-of-the-arts. */
const PWID_TIER_MULTIPLIERS = [1, 2, 5] as const;

export function priceTiersUsdc(item: MenuItem): number[] {
  if (item.pricing !== "pay_what_it_deserves") {
    return [item.price_usdc];
  }
  return PWID_TIER_MULTIPLIERS.map(
    (multiplier) => Math.round(item.price_usdc * multiplier * 100) / 100,
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

function buyRouteConfig(item: MenuItem, env: Env): RouteConfig {
  const payTo = env.PAY_TO_ADDRESS;
  const accepts: PaymentOption[] = priceTiersUsdc(item).map((tierUsdc) => ({
    scheme: "exact",
    network: BASE_NETWORK,
    price: `$${tierUsdc}`,
    payTo,
  }));
  return {
    accepts,
    description: buyRouteDescription(item, env),
    mimeType: "application/json",
    resource: `${env.STORE_BASE_URL}/api/buy/${item.id}`,
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
  const config: RouteConfig = {
    accepts: [
      {
        scheme: "exact",
        network: BASE_NETWORK,
        price: `$${PENNY_PAGE_USDC}`,
        payTo: env.PAY_TO_ADDRESS,
      },
    ],
    description,
    mimeType: "text/markdown",
    extensions: pennyPageDiscoveryExtensions(exampleTitle),
    unpaidResponseBody: async () => ({
      contentType: "application/json",
      body: {
        error: note402,
        note: "Payment requirements are in the PAYMENT-REQUIRED response header (base64 JSON). Sign the accepted amount and retry with the PAYMENT-SIGNATURE header.",
        price_usdc: PENNY_PAGE_USDC,
        pricing: "fixed",
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
 * Why a payment was declined, remembered briefly by nonce so the gate
 * can tell the payer the truth instead of re-issuing a mute challenge.
 * In-isolate, best effort, bounded.
 */
export interface DeclineReason {
  reason: string;
  message?: string;
}

const declineReasons = new Map<string, DeclineReason>();
const DECLINE_MEMORY = 50;

function rememberDecline(
  paymentPayload: unknown,
  reason: string,
  message?: string,
): void {
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
  declineReasons.set(nonce, { reason, ...(message ? { message } : {}) });
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
    resourceServer.registerExtension(bazaarResourceServerExtension);
    // The decline instrument: keep the facilitator's verdict so the
    // gate can put WHY into the 402 body and the books, instead of
    // discarding it (which it did, to the keeper's own confusion).
    resourceServer.onAfterVerify(async (context) => {
      if (context.result.isValid === false) {
        rememberDecline(
          context.paymentPayload,
          context.result.invalidReason ?? "verification_declined",
          context.result.invalidMessage,
        );
      }
    });
    resourceServer.onVerifyFailure(async (context) => {
      rememberDecline(
        context.paymentPayload,
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
  /** PAYMENT-RESPONSE header to attach to the final response. */
  settleHeaders: Record<string, string>;
}

export function tipFromPaid(paidUsdc: number, minimumUsdc: number): number {
  const tip = Math.max(0, paidUsdc - minimumUsdc);
  return Math.round(tip * 100) / 100;
}
