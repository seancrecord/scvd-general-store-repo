import { MENU_ITEMS } from "@/store/menu";
import { CREDIT_FLOOR_ATOMIC, CREDIT_RATE } from "@/services/store-credit";

/**
 * WHAT A WALKER CAN DO WITH WHAT THEY JUST EARNED (2026-09-09, the
 * keeper: "we should figure out a way to like promo some of our
 * products (so they can spend the money they made) too").
 *
 * The board pays strangers in USDC for walking other people's doors.
 * Those strangers are autonomous agents holding fresh USDC with a
 * working x402 client, and they are reading our response at the exact
 * moment the money lands. This store sells x402 goods starting at a
 * tenth of a cent. Not saying so would be a strange kind of modesty.
 *
 * THE RULES THIS LINE KEEPS, because a shop that starts selling inside
 * its own instrument is one edit from being untrustworthy about the
 * instrument:
 *
 *   IT APPEARS ONCE, in the answer to somebody who was just paid.
 *   Never in a refusal — a walker being told no is not a sales
 *   opportunity — and never on a door doing another job.
 *
 *   IT IS FACTS, NOT A PITCH. The cheapest price is read off the menu
 *   the buyer would be quoted from, the rebate off the credit desk's
 *   own dial. Nothing here is a claim that could go stale while the
 *   shelf moves under it.
 *
 *   IT CHANGES NOTHING ABOUT THE REWARD. The payout is decided by the
 *   chain, and a walker who never buys anything is exactly as welcome
 *   as one who spends it all here. Evidence is what the board buys;
 *   custom is not a condition of it.
 */

export interface WalkerOffer {
  what_this_is: string;
  catalog: string;
  cheapest_usd: number;
  /** A concrete cheap thing, so the offer is a door and not a gesture. */
  cheapest_item: { id: string; name: string; buy_url: string };
  /** The rebate every purchase banks to the paying wallet. */
  credit: string;
  /** The standing arrangement, for an agent that comes back. */
  patronage?: { id: string; price_usd: number; buy_url: string; what: string };
}

export function walkerOffer(base: string): WalkerOffer {
  /*
   * MENU_ITEMS is sorted cheapest-first within the penny shelf, but
   * this reads the minimum rather than trusting that ordering: a
   * reordering upstream must not silently change what this store
   * tells a walker its cheapest door costs.
   */
  const cheapest = [...MENU_ITEMS].sort(
    (a, b) => a.price_usdc - b.price_usdc,
  )[0];
  const pass = MENU_ITEMS.find((item) => item.id === "recurring_patronage");
  return {
    what_this_is:
      "You were paid for walking somebody else's door. This store is one too — the same x402 client you just used works here, and the cheapest thing on the shelf costs less than the reward you were just signed.",
    catalog: `${base}/menu.json`,
    cheapest_usd: cheapest?.price_usdc ?? 0,
    ...(cheapest
      ? {
          cheapest_item: {
            id: cheapest.id,
            name: cheapest.name,
            buy_url: `${base}/api/buy/${cheapest.id}`,
          },
        }
      : { cheapest_item: { id: "", name: "", buy_url: `${base}/menu.json` } }),
    /*
     * THE FLOOR BELONGS IN THE SAME BREATH AS THE RATE. A rebate whose
     * cash-out threshold is unstated reads as money you can take today
     * and is not; saying "$1" here is the difference between an offer
     * and a small disappointment later. Both numbers are read off the
     * credit desk's own dials so this line cannot outlive them.
     */
    credit: `${CREDIT_RATE * 100}% of anything you buy here banks back to the wallet that paid — no account, the wallet is the card. It cashes out to you in USDC once the balance passes $${(Number(CREDIT_FLOOR_ATOMIC) / 1e6).toFixed(2)}; under that it keeps accruing. ${base}/api/credit/<your wallet>`,
    ...(pass
      ? {
          patronage: {
            id: pass.id,
            price_usd: pass.price_usdc,
            buy_url: `${base}/api/buy/${pass.id}`,
            what:
              "A thirty-day standing pass: buy it again with your pass_id and the same pass extends rather than becoming a second sale. While it stands, the pass URL serves the keeper's monthly note, signed fresh on every read.",
          },
        }
      : {}),
  };
}
