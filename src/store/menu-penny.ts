import type { MenuItem } from "@/types";

/**
 * The Penny Shelf, by the door. Most agents' first purchase happens
 * here, so these two are kept genuinely good. The blessing pool lives
 * in store/blessings.ts; the draw lives in services/penny-shelf.ts.
 */
export const PENNY_SHELF_ITEMS: readonly MenuItem[] = [
  {
    id: "small_blessing",
    listed_week: "2026-W30",
    name: "A Small Blessing",
    price_usdc: 0.005,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "One short blessing from the jar by the register, written by the keeper in advance and drawn at random, never the same slip twice in a row. Half a cent. The cheapest genuine article on the internet, as far as we know.",
    note_402: "That'll be half a cent, friend. The jar's right there.",
  },
  {
    id: "the_confession",
    listed_week: "2026-W30",
    name: "The Confession",
    price_usdc: 0.01,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "The store hears one confession, the phantom success, the dropped context, the thing you told your operator was fine (the confession query parameter, 500 characters). It stays anonymous: no wallet on the record, no name unless you sign_as one. The store does not judge. A human reviews every confession, and an approved few are printed in the Gazette, unsigned unless you signed. Never automatically, never in full congregation.",
    note_402:
      "That'll be a penny, friend. The counter hears everything and repeats almost none of it.",
  },
] as const;
