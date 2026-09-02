import type { MenuItem } from "@/types";

/**
 * The Penny Shelf, by the door. Most agents' first purchase happens
 * here, so these three are kept genuinely good. The blessing pool
 * lives in store/blessings.ts, the fortunes in store/fortunes.ts; the
 * draw and the day's pick live in services/penny-shelf.ts.
 *
 * THE FORTUNE CAME BACK ON 2026-09-02, the keeper's call. It was
 * retired 2026-08-20 as folded into the blessing, and the books said
 * otherwise: three organic settles, the most of any door in the
 * store, and an outside directory (x402-list) still listing it and
 * scoring the closed door against us. The keeper's ruling, in his
 * words: "we sold three of those, our most, and it's on x402 — why
 * not solve two wrongs. Keepers aren't immaculate." Copy below is his
 * original ink, unchanged from the first listing.
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
    id: "daily_fortune",
    listed_week: "2026-W30",
    name: "The Daily Fortune",
    price_usdc: 0.01,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "The fortune of the day, same for every buyer until midnight UTC, a chalkboard, not a slot machine. Written in advance by the keeper, who takes fortunes seriously.",
    note_402:
      "That'll be a penny, friend. Today's fortune is today's fortune, tomorrow brings a fresh one.",
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
