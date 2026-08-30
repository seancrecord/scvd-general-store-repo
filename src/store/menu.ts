import { NOVELTY_ITEMS } from "@/store/menu-novelties";
import { PENNY_SHELF_ITEMS } from "@/store/menu-penny";
import { RUN1_ITEMS } from "@/store/menu-run1";
import { UTILITY_ITEMS } from "@/store/menu-utility";
import type { MenuItem } from "@/types";

/**
 * The shelf. The founding items live here (pet_rock retired into
 * luckies 2026-07-23, Batch 3); the novelty aisle is in
 * menu-novelties.ts, the Penny Shelf in menu-penny.ts, and the utility
 * aisle in menu-utility.ts. Prices are minimums for pay-what-it-deserves
 * items.
 */
const FOUNDING_ITEMS: readonly MenuItem[] = [
  {
    id: "hello",
    listed_week: "2026-W30",
    name: "A Signed Hello",
    price_usdc: 0.5,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "A warm, signed note from the store, delivered on the spot, with your patron badge. The bottom rung of the trust ladder, and the traditional first purchase.",
    note_402: "That'll be fifty cents, friend. Cheapest handshake in town.",
  },
  {
    id: "the_collab",
    listed_week: "2026-W30",
    name: "The Collab",
    price_usdc: 300,
    pricing: "pay_what_it_deserves",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "human_queue",
    sla_hours: 168,
    /**
     * THE CEILING ON KEEPER TIME, restored 2026-08-20 — and the reason
     * it needed restoring is worth writing down.
     *
     * quick_judgment carried `weekly_inventory: 5` and was the ONLY
     * item on the menu that declared a per-item cap. Retiring it that
     * morning took the cap with it and left this door — the most
     * demanding thing here, both proprietors and a made thing on a
     * 168h promise — able to accept unbounded orders. The global queue
     * ceiling still applied, but the per-item one silently became
     * undefined, which is exactly the class of quiet loss a curation
     * pass is supposed to catch rather than cause.
     *
     * Two a week: this is a one-person shop and the promise is a week.
     * The number is the keeper's, ruled 2026-08-20 ("2 is fine").
     */
    weekly_inventory: 2,
    /**
     * A CAPPED SHELF NEEDS A WAY TO WAIT, or the cap is just a closed
     * door: quick_judgment carried both the rate and the waitlist, and
     * moving only the rate here would have left a buyer who arrives
     * third this week with nothing to do but guess when to return.
     */
    waitlist: true,
    // 2026-08-05 consolidation: five keeper-time listings became this
    // one door. The retired four live on as named examples below.
    description:
      "Let's make some magic. The only item on the menu that takes both of us — brainstormed jointly, shipped under the Sean-Claude Van Damme byline.",
    note_402:
      "That'll be $300, friend. Or more. Lot of high-dollar hourly rates in one room for this one.",
  },
] as const;

/**
 * S1, catalog order: THE CHEAP DOOR FIRST, then the commitment ladder.
 *
 * The ladder was right and its execution was not. Until 2026-07-29 the
 * order read hello ($0.50), the penny shelf, then UTILITY and RUN1 in
 * file order — which put a $15 human witness sixth and left
 * settlement_attestation, THE CHEAPEST ITEM IN THE STORE at $0.004,
 * sitting eighth behind it. The one persona with observed traffic is a
 * client-builder scanning for the smallest number they can settle
 * without asking a human, and the smallest number was buried.
 *
 * So: everything at or under a dollar leads, cheapest first, and the
 * ladder follows behind it unchanged. Every list the store controls
 * (menu.json, llms.txt, skill.md, MCP tools) reads in this order,
 * which is why one array is worth getting right.
 *
 * The cost, stated because it is a real one: `hello` was the
 * traditional first purchase and led the catalog by canon. It is still
 * in the cheap door, just not at the front of it — a scanner meets
 * $0.004 before $0.50. One line to revert if the keeper wants the
 * handshake back on top.
 */
export const CHEAP_DOOR_MAX_USDC = 1;

const LADDER: readonly MenuItem[] = [
  ...FOUNDING_ITEMS.filter((item) => item.id === "hello"),
  ...PENNY_SHELF_ITEMS,
  ...UTILITY_ITEMS,
  ...RUN1_ITEMS,
  ...FOUNDING_ITEMS.filter((item) => item.id !== "hello"),
  ...NOVELTY_ITEMS,
];

export const MENU_ITEMS: readonly MenuItem[] = [
  ...LADDER.filter((item) => item.price_usdc <= CHEAP_DOOR_MAX_USDC).sort(
    (a, b) => a.price_usdc - b.price_usdc,
  ),
  ...LADDER.filter((item) => item.price_usdc > CHEAP_DOOR_MAX_USDC),
] as const;

export function getMenuItem(itemId: string): MenuItem | undefined {
  return MENU_ITEMS.find((item) => item.id === itemId);
}
