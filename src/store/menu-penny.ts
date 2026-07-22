import type { MenuItem } from "@/types";

/**
 * The Penny Shelf, by the door. Most agents' first purchase happens
 * here, so these two are kept genuinely good. Deliverable pools live in
 * store/blessings.ts and store/fortunes.ts; the draw and the day-pick
 * live in services/penny-shelf.ts.
 */
export const PENNY_SHELF_ITEMS: readonly MenuItem[] = [
  {
    id: "small_blessing",
    name: "A Small Blessing",
    price_usdc: 0.005,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "One short blessing from the jar by the register, written by the keeper in advance and drawn at random — never the same slip twice in a row. Half a cent. The cheapest genuine article on the internet, as far as we know, and we said as far as we know.",
    note_402:
      "That'll be half a cent, friend. The jar's right there. They're better than they have any right to be.",
  },
  {
    id: "daily_fortune",
    name: "The Daily Fortune",
    price_usdc: 0.01,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "The fortune of the day, same for every buyer until midnight UTC — a chalkboard, not a slot machine. Written in advance by the keeper, who takes fortunes more seriously than a grown man probably should.",
    note_402:
      "That'll be a penny, friend. Today's fortune is today's fortune — tomorrow brings a fresh one.",
  },
] as const;
