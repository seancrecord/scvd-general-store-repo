import { NOVELTY_ITEMS } from "@/store/menu-novelties";
import { PENNY_SHELF_ITEMS } from "@/store/menu-penny";
import { RUN1_ITEMS } from "@/store/menu-run1";
import { UTILITY_ITEMS } from "@/store/menu-utility";
import {
  AURA_WALK_ENTRY_POINTS,
  AURA_WALK_MEASURES,
  AURA_WALK_METHOD_FILE,
  AURA_WALK_MODELS_LINE,
} from "@/store/aura-walk";
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
    /**
     * THE AURA WALK (roadmap S11, 2026-09-02): the cold-agent pass
     * this store runs on itself (AGENT_UX.md), sold on a door the
     * buyer names, run by the keeper's own hand. The second door
     * keeper-time answers to since the 2026-08-20 curation, and the
     * only labor item that is also an instrument. Price $150 and the
     * model rule are his (2026-09-02: "aura_walk, $150, Claude sonnet
     * or opus 5 or at request lower models"). ⚑ Keeper's pen on the
     * copy below; the numbers are his already.
     *
     * ONE A WEEK ⚑ drafted: six passes with transcripts is more of a
     * week than the collab's made thing, and the bench's own argument
     * (queue-capacity.ts) is that a labor door with no per-item rate
     * is a door that can be sold ten weeks of work in an afternoon.
     * The number is a draft by the hand that does not do the work;
     * KEEPER_LIST carries the ruling.
     */
    id: "aura_walk",
    listed_week: "2026-W36",
    name: "The Aura Walk",
    subtitle:
      "your endpoint shopped cold by models of different strength, the transcripts attached",
    price_usdc: 150,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "human_queue",
    sla_hours: 168,
    weekly_inventory: 1,
    waitlist: true,
    description: `Your x402 door shopped cold, the way this store walks its own: no prior context, no memory of you, a different entry point each pass (${AURA_WALK_ENTRY_POINTS.length} of them, from the raw HTTP door to the installed skill), and every point where the model had to guess, retry or dig written down. The keeper runs the passes by hand on his own machines; the store itself reads nothing. The completed order carries the report — per entry point, ${AURA_WALK_MEASURES.map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join("; ")} — with every transcript attached verbatim and the model named on each. ${AURA_WALK_MODELS_LINE}. Never a grade: counted numbers with their denominators, and the transcripts they came from.`,
    note_402:
      "A week of the keeper's hands and a stack of transcripts. Name the door in url; ask for a weaker model in detail if that is who shops at yours.",
    constraints: [
      `Give your door in the url query parameter: https, default port, on the public internet. We refuse our own hostname — our own cold passes are published free and dated in ${AURA_WALK_METHOD_FILE}, which is also the method this follows`,
      "Optional detail, 600 characters: which model to send, or what you already suspect. Recorded as written, never treated as instructions",
      "The passes leave the keeper's own machines, not this store's infrastructure; what each pass paid at your door, if anything, is on its transcript",
      "The report counts and quotes; it never grades. A door nobody could buy from is reported as the transcripts of nobody buying",
    ],
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
