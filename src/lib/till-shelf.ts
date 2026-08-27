import { buyInputSchema } from "@/lib/bazaar-discovery";
import { BASE_NETWORK, POLYGON_NETWORK } from "@/lib/payments";
import { HOUSE_RULE } from "@/store/wallet-safety";
import type { MenuItem } from "@/types";

/**
 * THE INERT HALF OF THE BROWSER TILL (2026-08-26, house rule 53).
 *
 * The till itself is till/till.js, served at /till.js and written for
 * a browser. This file is what the SERVER puts on a page so that
 * script has something to work from, and the whole design constraint
 * is that neither of the two things it emits renders:
 *
 *   - a <script type="application/json"> island, which no browser
 *     displays and no browser executes, and
 *   - a <script src> tag, which shows nothing either way.
 *
 * So a reader with scripting off sees the page exactly as it was
 * before the till existed — the server-rendered instructions, whole
 * and unchanged — and a reader with a wallet gets a button. That is
 * the strong form of progressive enhancement rather than the polite
 * one: there is no empty state, no "connect your wallet" placeholder,
 * and nothing at all in the rendered markup for JavaScript to reveal.
 *
 * DERIVED FROM THE MENU, NEVER RETYPED. Names, prices and the required
 * inputs come out of MENU_ITEMS and the same buyInputSchema every
 * other surface reads, so a price that moves moves here too and a new
 * required field cannot be missing from the form.
 */

/**
 * THE TILL'S WALLET LIMIT, WRITTEN WHERE THE BUYER READS (2026-08-27,
 * the keeper's own catch, and it is rule 53 applied to rule 53's own
 * fix). The store sells on Base, Polygon and Solana; the browser till
 * signs with an EVM wallet only, so a Solana-wallet visitor meets a
 * page that never explains why there is no button for them — and the
 * rule says a door gets a till OR the reason is written down. This is
 * the written reason, ONE constant rendered server-side on /try and
 * the item pages (visible with scripting off, which is the whole
 * point) and carried in the shelf JSON so the till itself can say it
 * too. The Solana pass is filed as a build item, not pretended at.
 */
export const TILL_WALLET_LIMIT =
  "The browser till takes EVM wallets only for now — Base or Polygon, one signature, no gas. Holding Solana USDC? Every agent client and the MCP door settle on Solana today; the browser till's Solana pass is planned and this sentence comes down when it ships.";

export interface TillShelfItem {
  id: string;
  name: string;
  price_usdc: number;
  buy_path: string;
  /** Inputs the item cannot be bought without, as the schema states them. */
  requires: Array<{ name: string }>;
}

export interface TillShelfOptions {
  /** The heading the till gives itself once it decides to appear. */
  heading: string;
  /** One sentence under it, in the room's own register. */
  standfirst: string;
  /** Where a buyer looks a purchase up when an outcome is unknown. */
  verifyHint: string;
}

/**
 * `agent_name` is dropped for the same reason /try drops it from the
 * required list it prints: it is an optional courtesy the store asks
 * of agents, and putting a mandatory text box in front of a person
 * buying a $0.001 item would be inventing a requirement.
 */
function requiredFields(item: MenuItem): Array<{ name: string }> {
  return (buyInputSchema(item).required ?? [])
    .filter((name) => name !== "agent_name")
    .map((name) => ({ name }));
}

export function tillShelfItem(item: MenuItem): TillShelfItem {
  return {
    id: item.id,
    name: item.name,
    price_usdc: item.price_usdc,
    buy_path: `/api/buy/${item.id}`,
    requires: requiredFields(item),
  };
}

/**
 * THE ONE ESCAPE A JSON ISLAND NEEDS, and it is not HTML escaping.
 *
 * The bytes inside <script> are not parsed as HTML, so entity-escaping
 * them would corrupt the JSON. What DOES end the element early is the
 * literal string "</script" in any case, plus the two comment-opening
 * sequences the HTML spec treats specially inside a script element.
 * Escaping the forward slash as \/ is legal JSON and defuses all
 * three, which is the same trick jsonLdScript already uses one file
 * over for the same reason.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\u0021--");
}

/**
 * The two tags, and nothing else. Emitted at the end of a body; the
 * client decides where the till actually goes, because that is a
 * layout decision and this is a data decision.
 */
export function tillShelfHtml(
  items: readonly MenuItem[],
  options: TillShelfOptions,
): string {
  const shelf = {
    heading: options.heading,
    standfirst: options.standfirst,
    /**
     * THE PROMISE, ON THE ONE SURFACE WHERE IT IS TESTED. A wallet
     * signature request is the single most impersonated interaction in
     * this industry, and the till is the exact moment a reader should
     * be reminded what this store does and does not ask for. Sourced
     * from the constant every other trust surface prints, so it cannot
     * drift into a friendlier, weaker version of itself.
     */
    house_rule: HOUSE_RULE,
    wallet_limit: TILL_WALLET_LIMIT,
    /**
     * THE CHAINS THE INDICATOR MAY VOUCH FOR (the keeper's ask,
     * 2026-08-27: "something that shows connected or not, and which
     * network"). Derived from the same constants the payment gate
     * offers on, never retyped — but DISPLAY-ONLY on the other end:
     * the till's wallet line uses this to warn about a wrong network
     * before a button is pressed, while the money path keeps deciding
     * from the live 402's accepts alone. The Polygon rail is
     * flag-gated server-side; advertising it here when the flag is
     * down costs a too-broad hint, never a wrong signature.
     */
    evm_chains: [BASE_NETWORK, POLYGON_NETWORK].map((network) =>
      Number(network.split(":")[1]),
    ),
    verify_hint: "/api/verify/{cert_id}",
    items: items.map(tillShelfItem),
  };
  return `<script type="application/json" id="scvd-till-shelf">${safeJsonForScript(shelf)}</script>
<script type="module" src="/till.js"></script>`;
}
